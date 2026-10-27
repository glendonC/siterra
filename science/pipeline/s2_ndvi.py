"""Monthly Sentinel-2 NDVI composites over a frozen geometry from Earth Search legacy sentinel-2-l2a.

Usage: python -I s2_ndvi.py <kept.jsonl> <geometry.geojson> <out_dir> <first YYYY-MM> <last YYYY-MM> [workers]
Imports only permissive packages. Method (docs/reference/observation-preprocessing.md sections 2 to 4, default route):
  inputs     the deduplicated tile-date items (29SQR, 29RQQ) from s2-inventory.py; each item's STAC JSON is fetched for
             its asset hrefs and processing baseline and cached beside the outputs
  grid       one analysis grid in EPSG:32629, 10 m, edges on multiples of 20 m, covering the geometry; the geometry mask
             is rasterized by pixel centre; red B04 and nir B08 read at 10 m, SCL at 20 m repeated 2 x 2 (nearest)
  scale      reflectance = DN / 10000 for every baseline; the asset raster:bands offset is not applied (offset finding)
  mask       keep SCL classes 4 and 5 only; DN 0 is no-data
  NDVI       (nir - red) / (nir + red) where nir + red > 0.0001; negative values kept
  dates      tiles of the same sensing date are one observation: 29SQR first, 29RQQ fills its gaps
  month      per-pixel median of the dated NDVI values and the count of dates; acceptance (>= 3 dates per pixel,
             >= 70% of the geometry) is applied by the bundle builder, not here
Outputs per month in <out_dir>/<YYYY-MM>/: median.tif (float32, NaN where no observation), count.tif (uint8), month.json
(items, dates, SCL class counts inside the geometry, timings). Resumable: a month with month.json is skipped.
"""
import concurrent.futures as cf
import datetime
import json
import os
import sys
import time
import urllib.request

import numpy as np
import rasterio
import rasterio.errors
import rasterio.features
import rasterio.windows
from affine import Affine
from pyproj import Transformer
from shapely.geometry import mapping, shape
from shapely.ops import transform as shp_transform

ITEM_URL = "https://earth-search.aws.element84.com/v1/collections/sentinel-2-l2a/items/{}"
KEEP_SCL = (4, 5)
CLOUD_SCL = (8, 9, 10)
SNOW_SCL = (11,)
EPS = 1e-4
ENV = dict(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", GDAL_HTTP_MAX_RETRY="6", GDAL_HTTP_RETRY_DELAY="3",
           GDAL_HTTP_TIMEOUT="90", GDAL_HTTP_CONNECTTIMEOUT="20", GDAL_HTTP_LOW_SPEED_TIME="60", GDAL_HTTP_LOW_SPEED_LIMIT="1000",
           GDAL_HTTP_MULTIRANGE="YES", GDAL_HTTP_MERGE_CONSECUTIVE_RANGES="YES", CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".tif")


def analysis_grid(geom_path):
    g = shape(json.load(open(geom_path))["features"][0]["geometry"])
    gu = shp_transform(Transformer.from_crs("EPSG:4326", "EPSG:32629", always_xy=True).transform, g)
    x0, y0, x1, y1 = gu.bounds
    x0, y0 = np.floor(x0 / 20) * 20, np.floor(y0 / 20) * 20
    x1, y1 = np.ceil(x1 / 20) * 20, np.ceil(y1 / 20) * 20
    tr = Affine(10, 0, x0, 0, -10, y1)
    shp = (int((y1 - y0) / 10), int((x1 - x0) / 10))
    mask = rasterio.features.rasterize([(mapping(gu), 1)], out_shape=shp, transform=tr, fill=0, dtype="uint8").astype(bool)
    return tr, shp, mask


def fetch_item(item_id, cache_dir):
    path = os.path.join(cache_dir, item_id + ".json")
    if not os.path.exists(path):
        for k in range(5):
            try:
                req = urllib.request.Request(ITEM_URL.format(item_id), headers={"User-Agent": "siterra-science-pipeline/0.1"})
                with urllib.request.urlopen(req, timeout=60) as r:
                    d = json.load(r)
                break
            except Exception:
                if k == 4:
                    raise
                time.sleep(3 * (k + 1))
        d["siterra_retrieved_datetime"] = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        with open(path + ".tmp", "w") as f:
            json.dump(d, f)
        os.replace(path + ".tmp", path)
    return json.load(open(path))


def read_band(href, tr, shp, res):
    with rasterio.open(href) as s:
        assert s.crs.to_epsg() == 32629, s.crs
        st = s.transform
        assert abs(st.a - res) < 1e-9 and ((tr.c - st.c) % res) == 0 and ((st.f - tr.f) % res) == 0, (st, tr)
        col0 = int(round((tr.c - st.c) / res))
        row0 = int(round((st.f - tr.f) / res))
        h, w = (shp[0] * 10 // res, shp[1] * 10 // res)
        win = rasterio.windows.Window(col0, row0, w, h)
        return s.read(1, window=win, boundless=True, fill_value=0)


def scene(item, tr, shp, mask, cache_dir):
    t0 = time.time()
    d = fetch_item(item["id"], cache_dir)
    assert d["id"] == item["id"] and d["properties"]["s2:processing_baseline"] == item["baseline"]
    a = d["assets"]
    with rasterio.Env(**ENV):
        red = read_band("/vsicurl/" + a["red"]["href"], tr, shp, 10).astype(np.float32)
        nir = read_band("/vsicurl/" + a["nir"]["href"], tr, shp, 10).astype(np.float32)
        scl20 = read_band("/vsicurl/" + a["scl"]["href"], tr, shp, 20)
    scl = np.repeat(np.repeat(scl20, 2, axis=0), 2, axis=1)[: shp[0], : shp[1]]
    has = mask & (red > 0) & (nir > 0) & (scl > 0)
    keep = has & np.isin(scl, KEEP_SCL)
    r, n = red / 10000.0, nir / 10000.0
    den = n + r
    ok = keep & (den > EPS)
    ndvi = np.full(shp, np.nan, dtype=np.float32)
    ndvi[ok] = (n[ok] - r[ok]) / den[ok]
    counts = np.bincount(scl[has].ravel(), minlength=12).tolist()
    # offset guard input: median DN of kept pixels; a stored BOA offset would raise these by about 1000
    dn = {"red_median_dn_kept": float(np.median(red[ok])) if ok.any() else None,
          "nir_median_dn_kept": float(np.median(nir[ok])) if ok.any() else None}
    return {**dn,"id": item["id"], "tile": item["tile"], "date": item["date"], "baseline": item["baseline"],
            "orbit": item["orbit"], "self": ITEM_URL.format(item["id"]),
            "retrieved": d["siterra_retrieved_datetime"], "hrefs": {k: a[k]["href"] for k in ("red", "nir", "scl")},
            "pixels_with_data": int(has.sum()), "pixels_kept": int(ok.sum()), "scl_counts_in_geometry": counts,
            "seconds": round(time.time() - t0, 1)}, ndvi


def scene_with_retry(*args, tries=4):
    """Network reads fail now and then; retry the whole scene so a month never mixes partial reads."""
    for k in range(tries):
        try:
            return scene(*args)
        except rasterio.errors.RasterioIOError:
            if k == tries - 1:
                raise
            time.sleep(10 * (k + 1))


def month_items(kept, y, m):
    return [r for r in kept if r["date"].startswith(f"{y}-{m:02d}")]


def run_month(y, m, kept, tr, shp, mask, out_dir, cache_dir, workers):
    mdir = os.path.join(out_dir, f"{y}-{m:02d}")
    if os.path.exists(os.path.join(mdir, "month.json")):
        return "skip"
    os.makedirs(mdir, exist_ok=True)
    items = month_items(kept, y, m)
    per_date, stats = {}, []
    with cf.ThreadPoolExecutor(workers) as ex:
        futs = {ex.submit(scene_with_retry, it, tr, shp, mask, cache_dir): it for it in items}
        results = []
        for f in cf.as_completed(futs):
            st, nd = f.result()
            stats.append(st)
            results.append((st, nd))
    order = {"29SQR": 0, "29RQQ": 1}
    for st, nd in sorted(results, key=lambda x: (x[0]["date"], order[x[0]["tile"]])):
        if st["date"] not in per_date:
            per_date[st["date"]] = nd
        else:
            cur = per_date[st["date"]]
            fill = np.isnan(cur) & ~np.isnan(nd)
            cur[fill] = nd[fill]
    dates = sorted(per_date)
    stack = np.stack([per_date[d] for d in dates]) if dates else np.full((1,) + shp, np.nan, np.float32)
    count = np.sum(~np.isnan(stack), axis=0).astype(np.uint8)
    with np.errstate(all="ignore"):
        import warnings
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", RuntimeWarning)
            med = np.nanmedian(stack, axis=0).astype(np.float32)
    med[~mask] = np.nan
    count[~mask] = 0
    prof = dict(driver="GTiff", width=shp[1], height=shp[0], count=1, crs="EPSG:32629", transform=tr,
                tiled=True, blockxsize=512, blockysize=512, compress="deflate")
    with rasterio.open(os.path.join(mdir, "median.tif"), "w", dtype="float32", nodata=float("nan"), predictor=3, **prof) as o:
        o.write(med, 1)
    with rasterio.open(os.path.join(mdir, "count.tif"), "w", dtype="uint8", nodata=None, predictor=2, **prof) as o:
        o.write(count, 1)
    date_dates_with_obs = [d for d in dates if np.any(~np.isnan(per_date[d]))]
    js = {"month": f"{y}-{m:02d}", "items": sorted(stats, key=lambda s: (s["date"], s["tile"])), "dates": dates,
          "dates_with_kept_pixels": date_dates_with_obs, "geometry_pixels": int(mask.sum()),
          "grid": {"crs": "EPSG:32629", "transform": list(tr)[:6], "shape": list(shp)},
          "created": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")}
    with open(os.path.join(mdir, "month.json.tmp"), "w") as f:
        json.dump(js, f)
    os.replace(os.path.join(mdir, "month.json.tmp"), os.path.join(mdir, "month.json"))
    return f"{len(items)} items, {len(dates)} dates"


def main():
    kept_path, geom_path, out_dir, first, last = sys.argv[1:6]
    workers = int(sys.argv[6]) if len(sys.argv) > 6 else 6
    kept = [json.loads(l) for l in open(kept_path)]
    tr, shp, mask = analysis_grid(geom_path)
    cache_dir = os.path.join(out_dir, "items")
    os.makedirs(cache_dir, exist_ok=True)
    print("grid", shp, tuple(tr)[:6], "geometry pixels", int(mask.sum()), flush=True)
    y, m = map(int, first.split("-"))
    y1, m1 = map(int, last.split("-"))
    while (y, m) <= (y1, m1):
        t = time.time()
        r = run_month(y, m, kept, tr, shp, mask, out_dir, cache_dir, workers)
        print(f"{y}-{m:02d} {r} {time.time() - t:.0f}s", flush=True)
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)


if __name__ == "__main__":
    main()
