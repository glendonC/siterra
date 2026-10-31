"""Find the Sentinel-2 scenes of a pixel's month and build the display inputs of pixel_anatomy for its display window alone: the monthly median
NDVI, the count of dates and a true colour composite, on the analysis grid; and the tile and relative orbit the scene rule starts from.

Usage: python -I pixel-anatomy-inputs.py <place.json> <repo_root> <pixel_id> <out_dir>

Follows the registered pixel_anatomy 1.1.0 recipe and the pixel_anatomy block of the place configuration (the month, and the tile and orbit rule).
Searches Earth Search (sentinel-2-l2a, anonymous) for the items of the month that intersect the display window, keeps the items in the analysis CRS,
keeps one item per tile and date (newest processing baseline, then the highest sequence number), caches each item's JSON under <out_dir>/items, and
reads the scene classification (20 m, repeated 2 x 2), B04, B03, B02 and B08 over the display window from the public sentinel-cogs bucket. As the
catchment-wide monthly bundle of the first place does (docs/reference/observation-preprocessing.md): reflectance = DN / 10000 without offset; only
scene classes 4 and 5; DN 0 is no data; NDVI = (B08 - B04) / (B08 + B04) where the sum exceeds 0.0001; tiles of one sensing date are one observation
(the first tile in name order, the others fill its gaps); the median over the dates and the count of dates. The true colour is the median reflectance
of B04, B03 and B02 over the same observations with the display stretch 255 * clip(r / 0.35, 0, 1) ** (1 / 1.4); it is display only.
Writes median.tif (float32, NaN where no date), count.tif (uint8), truecolour.tif (uint8, 3 bands) and inventory.json. <out_dir> must not exist.
"""
import calendar
import datetime
import hashlib
import json
import os
import re
import sys
import urllib.request

import numpy as np
import pyproj
import rasterio
import rasterio.windows
from rasterio.transform import Affine

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pixel_anatomy as pa  # noqa: E402
import place_config  # noqa: E402

ENV = dict(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", GDAL_HTTP_MAX_RETRY="6", GDAL_HTTP_RETRY_DELAY="3", GDAL_HTTP_TIMEOUT="90",
           GDAL_HTTP_CONNECTTIMEOUT="20", GDAL_HTTP_MULTIRANGE="YES", GDAL_HTTP_MERGE_CONSECUTIVE_RANGES="YES", CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".tif")
SEARCH = "https://earth-search.aws.element84.com/v1/search"
UA = "siterra-science/0.1"


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def post(url, body):
    req = urllib.request.Request(url, data=json.dumps(body).encode(), headers={"User-Agent": UA, "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=90) as r:
        return json.loads(r.read().decode())


def search_items(bbox, month):
    y, m = int(month[:4]), int(month[5:7])
    body = {"collections": ["sentinel-2-l2a"], "bbox": bbox, "limit": 100,
            "datetime": f"{y}-{m:02d}-01T00:00:00Z/{y}-{m:02d}-{calendar.monthrange(y, m)[1]}T23:59:59Z"}
    out, res = [], post(SEARCH, body)
    while True:
        out += res["features"]
        nxt = next((l for l in res.get("links", []) if l.get("rel") == "next"), None)
        if not nxt:
            return out
        res = post(nxt["href"], {**body, **(nxt.get("body") or {})}) if nxt.get("method") == "POST" else json.loads(urllib.request.urlopen(nxt["href"]).read())


def read(href, x0, y0, H, W):
    """The window of a COG that covers the display window (the origin x0, y0 on the COG's lattice), zeros outside the raster."""
    with rasterio.open("/vsicurl/" + href) as s:
        res = abs(s.transform.a)
        col_off, row_off = (x0 - s.transform.c) / res, (s.transform.f - y0) / res
        if abs(col_off - round(col_off)) > 1e-6 or abs(row_off - round(row_off)) > 1e-6:
            raise SystemExit(f"{href}: the display window is not on the lattice of the COG")
        w, h = int(W * 10 // res), int(H * 10 // res)
        arr = s.read(1, window=rasterio.windows.Window(int(round(col_off)), int(round(row_off)), w, h), boundless=True, fill_value=0)
        return arr, s.crs


def main():
    place, repo, pid, out = sys.argv[1:5]
    if os.path.exists(out):
        raise SystemExit(f"{out} exists; it must not")
    cfg = place_config.load(place, repo)
    pc = cfg["recipes"]["pixel_anatomy"]
    month = pc["scene"]["month"]
    h, v, trow, tcol = pa.parse_pixel_id(pid)
    tb = pc["trendBundle"]
    with rasterio.open(os.path.join(cfg["_repo"], "data/bundles", tb["bundle"], tb["grid"])) as t:
        mtr, mcrs = t.transform, t.crs
    brow, bcol = pa.bundle_index(mtr, h, v, trow, tcol)
    atr, ashape, _ = place_config.analysis_grid(cfg)
    rows, cols = pa.cells_in_footprint(atr, ashape, mtr, mcrs, cfg["analysisCrs"], brow, bcol)
    r0, r1, c0, c1 = pa.display_window(rows, cols, 1)
    H, W = r1 - r0, c1 - c0
    x0, y0 = atr.c + c0 * atr.a, atr.f + r0 * atr.e
    inside = np.zeros((H, W), bool)
    inside[rows - r0, cols - c0] = True
    to_ll = pyproj.Transformer.from_crs(cfg["analysisCrs"], "EPSG:4326", always_xy=True).transform
    lon, lat = to_ll([x0, x0 + W * 10], [y0, y0 - H * 10])
    bbox = [min(lon), min(lat), max(lon), max(lat)]
    print(f"pixel {pid}: display window {H} x {W} at {x0}, {y0}; {int(inside.sum())} footprint cells; searching {month}")

    items = search_items(bbox, month)
    crs_items = []
    for it in items:
        p = it["properties"]
        code = p.get("proj:code") or (f"EPSG:{p['proj:epsg']}" if p.get("proj:epsg") else None)
        crs_items.append((it, code))
    kept_crs = [it for it, code in crs_items if code == cfg["analysisCrs"]]
    other_crs = sorted({it["id"] for it, code in crs_items if code != cfg["analysisCrs"]})
    best = {}
    for it in kept_crs:
        m = re.match(r"^S2[AB]_(\w{5})_(\d{8})_(\d+)_L2A$", it["id"])
        if not m:
            continue
        key = (m.group(1), m.group(2))
        rank = (it["properties"]["s2:processing_baseline"], int(m.group(3)))
        if key not in best or rank > best[key][0]:
            best[key] = (rank, it)
    kept = [best[k][1] for k in sorted(best)]
    dropped_dup = sorted({it["id"] for it in kept_crs} - {it["id"] for it in kept})
    os.makedirs(os.path.join(out, "items"))
    now = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    obs = []
    with rasterio.Env(**ENV):
        for it in kept:
            m = re.match(r"^S2[AB]_(\w{5})_(\d{8})_(\d+)_L2A$", it["id"])
            tile, date = m.group(1), m.group(2)
            json.dump({**it, "siterra_retrieved_datetime": now}, open(os.path.join(out, "items", it["id"] + ".json"), "w"), indent=1)
            orbit = "R" + re.search(r"_R(\d{3})_", it["properties"]["s2:product_uri"]).group(1)
            a = it["assets"]
            scl20, crs = read(a["scl"]["href"], x0, y0, H, W)
            scl = np.repeat(np.repeat(scl20, 2, axis=0), 2, axis=1)
            full = bool((scl[inside] > 0).all())
            dn = {k: read(a[k]["href"], x0, y0, H, W)[0].astype(np.float64) for k in ("red", "green", "blue", "nir")}
            obs.append({"id": it["id"], "tile": tile, "date": date, "orbit": orbit, "scl": scl, "dn": dn, "full": full,
                        "nodata_percent": it["properties"].get("s2:nodata_pixel_percentage"), "cloud_cover": it["properties"].get("eo:cloud_cover")})
            print(it["id"], orbit, "full data" if full else "partial/no data over the footprint", flush=True)
    # the tile and orbit rule: the most scenes with data over every footprint cell; ties by the lower orbit, then the tile name
    counts = {}
    for o in obs:
        if o["full"]:
            counts[(o["tile"], o["orbit"])] = counts.get((o["tile"], o["orbit"]), 0) + 1
    if not counts:
        raise SystemExit("no scene has data over every footprint cell")
    best_to = sorted(counts.items(), key=lambda kv: (-kv[1], kv[0][1], kv[0][0]))[0][0]
    # the monthly median, the count and the true colour, by date (tiles of one date merged, the first tile in name order first)
    by_date = {}
    for o in sorted(obs, key=lambda o: (o["date"], o["tile"])):
        by_date.setdefault(o["date"], []).append(o)
    nd_dates, rgb_dates = [], []
    for date, lst in by_date.items():
        nd = np.full((H, W), np.nan)
        rgb = np.full((3, H, W), np.nan)
        for o in lst:
            dnr, dnn, dng, dnb = (o["dn"][k] for k in ("red", "nir", "green", "blue"))
            ok = np.isin(o["scl"], [4, 5]) & (dnr > 0) & (dnn > 0) & (dng > 0) & (dnb > 0)
            red, nir = dnr / 10000.0, dnn / 10000.0
            with np.errstate(invalid="ignore", divide="ignore"):
                v = np.where(ok & (nir + red > 0.0001), (nir - red) / (nir + red), np.nan)
            fill = np.isnan(nd) & np.isfinite(v)
            nd[fill] = v[fill]
            for i, k in enumerate(("red", "green", "blue")):
                rgb[i][fill] = (o["dn"][k] / 10000.0)[fill]
        nd_dates.append(nd)
        rgb_dates.append(rgb)
    stack = np.stack(nd_dates)
    with np.errstate(all="ignore"):
        median = np.nanmedian(stack, axis=0)
        rmed = np.nanmedian(np.stack(rgb_dates), axis=0)
    count = np.isfinite(stack).sum(axis=0).astype(np.uint8)
    tc = np.where(np.isfinite(rmed), np.round(255 * np.clip(rmed / 0.35, 0, 1) ** (1 / 1.4)), 0).astype(np.uint8)
    prof = dict(driver="GTiff", height=H, width=W, crs=cfg["analysisCrs"], transform=Affine(10.0, 0, x0, 0, -10.0, y0), compress="deflate")
    with rasterio.open(os.path.join(out, "median.tif"), "w", count=1, dtype="float32", nodata=np.nan, **prof) as o:
        o.write(median.astype(np.float32), 1)
    with rasterio.open(os.path.join(out, "count.tif"), "w", count=1, dtype="uint8", nodata=0, **prof) as o:
        o.write(count, 1)
    with rasterio.open(os.path.join(out, "truecolour.tif"), "w", count=3, dtype="uint8", **prof) as o:
        o.write(tc)
    inv = {"pixel": pid, "retrieved_utc": now, "month": month, "bbox": bbox, "search": SEARCH,
           "display_window": {"crs": cfg["analysisCrs"], "origin_x": x0, "origin_y": y0, "rows": H, "cols": W, "analysis_grid_row0": r0, "analysis_grid_col0": c0},
           "items_found": len(items), "items_other_crs_excluded": other_crs, "duplicates_dropped": dropped_dup,
           "items": [{k: o[k] for k in ("id", "tile", "date", "orbit", "full", "nodata_percent", "cloud_cover")} for o in obs],
           "tile_and_orbit_rule": pc["scene"]["tileAndOrbitRule"], "scenes_with_full_data_by_tile_and_orbit": {f"{k[0]} {k[1]}": n for k, n in sorted(counts.items())},
           "tile": best_to[0], "relative_orbit": best_to[1],
           "dates": sorted(by_date), "cells_inside": int(inside.sum()), "cells_inside_with_median": int(np.isfinite(median[inside]).sum()),
           "files": {n: sha256(os.path.join(out, n)) for n in ("median.tif", "count.tif", "truecolour.tif")}}
    json.dump(inv, open(os.path.join(out, "inventory.json"), "w"), indent=1)
    print(f"tile {best_to[0]} orbit {best_to[1]} ({counts[best_to]} scenes with data over every footprint cell); {len(by_date)} dates; "
          f"{inv['cells_inside_with_median']} of {inv['cells_inside']} footprint cells have a median; sha256 {inv['files']}")


if __name__ == "__main__":
    main()
