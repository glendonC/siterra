"""Sentinel-2 true-colour display composite (B04, B03, B02) for the hero extent. Display only, not a measurement.

Usage: python -I s2-truecolour.py <items.jsonl> <item_cache_dir> <out_dir> <name> <west,south,east,north> <res_m> <estimate|build> <date> [<date> ...]
Items come from s2-search.py; only relative orbit R094 items on the listed dates are used (one viewing geometry, no
orbit seams). Every tile item covering the extent is warped onto one EPSG:32629 grid at <res_m> (bilinear for
reflectance, nearest for the scene classification); for res_m >= 20 the 20 m overview of the 10 m bands is read.
Scaling as in the NDVI pipeline: reflectance = DN / 10000, no offset. Pixels whose scene classification is 0, 1, 3, 8,
9 or 10 (no data, saturated, cloud shadow, cloud, cirrus) are dropped; tiles of the same date are merged (first valid);
the per-pixel median over the dates is taken per band. Display stretch: 8-bit = 255 * clip(reflectance / 0.35, 0, 1) ** (1 / 1.4).
estimate: prints the compressed bytes of every COG block the build would read (no pixel data downloaded).
build: writes <name>.tif (RGB uint8 GeoTIFF, EPSG:32629), <name>.png with <name>.pgw world file and <name>.json.
"""
import json
import math
import os
import sys
import urllib.request

import numpy as np
import rasterio
import rasterio.windows
from affine import Affine
from PIL import Image
from pyproj import Transformer
from rasterio.vrt import WarpedVRT
from rasterio.warp import Resampling, transform_bounds

ITEM = "https://earth-search.aws.element84.com/v1/collections/sentinel-2-l2a/items/{}"
ENV = dict(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", GDAL_HTTP_MAX_RETRY="6", GDAL_HTTP_RETRY_DELAY="3",
           GDAL_HTTP_TIMEOUT="90", CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".tif")
DROP = (0, 1, 3, 8, 9, 10)


def item_json(iid, cache):
    p = os.path.join(cache, iid + ".json")
    if not os.path.exists(p):
        with urllib.request.urlopen(urllib.request.Request(ITEM.format(iid), headers={"User-Agent": "siterra-science-pipeline/0.1"}), timeout=60) as r:
            open(p, "wb").write(r.read())
    return json.load(open(p))


def main():
    items_path, cache, out, name, ext, res, mode = sys.argv[1:8]
    dates = sys.argv[8:]
    res = float(res)
    w, s, e, n = map(float, ext.split(","))
    os.makedirs(cache, exist_ok=True)
    os.makedirs(out, exist_ok=True)
    x0, y0, x1, y1 = transform_bounds("EPSG:4326", "EPSG:32629", w, s, e, n)
    x0, y0 = math.floor(x0 / res) * res, math.floor(y0 / res) * res
    x1, y1 = math.ceil(x1 / res) * res, math.ceil(y1 / res) * res
    W, H = int((x1 - x0) / res), int((y1 - y0) / res)
    tr = Affine(res, 0, x0, 0, -res, y1)
    rows = [json.loads(l) for l in open(items_path)]
    use = [r for r in rows if r["props"]["datetime"][:10] in dates and "_R094_" in r["props"]["s2:product_uri"]]
    ov = 0 if res >= 20 else None
    total_bytes, med_in = 0, {d: None for d in dates}
    meta = {"dates": dates, "items": [], "grid": {"crs": "EPSG:32629", "res_m": res, "shape": [H, W], "transform": list(tr)[:6]}}
    for d in dates:
        stack = None
        for r in sorted([u for u in use if u["props"]["datetime"][:10] == d], key=lambda u: u["id"]):
            it = item_json(r["id"], cache)
            a = it["assets"]
            nb = 0
            bands = {}
            with rasterio.Env(**ENV):
                for key in ("red", "green", "blue", "scl"):
                    kw = {"overview_level": ov} if (ov is not None and key != "scl") else {}
                    with rasterio.open("/vsicurl/" + a[key]["href"], **kw) as src:
                        sb = transform_bounds("EPSG:32629", src.crs, x0, y0, x1, y1)
                        full = rasterio.windows.from_bounds(*sb, transform=src.transform)
                        if not rasterio.windows.intersect(full, rasterio.windows.Window(0, 0, src.width, src.height)):
                            continue  # this tile does not reach the extent
                        win = full.intersection(rasterio.windows.Window(0, 0, src.width, src.height))
                        for (bi, bj), bw in src.block_windows(1):
                            if rasterio.windows.intersect(bw, win):
                                nb += src.block_size(1, bi, bj)
                        if mode == "build":
                            with WarpedVRT(src, crs="EPSG:32629", transform=tr, width=W, height=H,
                                           resampling=Resampling.nearest if key == "scl" else Resampling.bilinear, nodata=0) as vrt:
                                bands[key] = vrt.read(1)
            total_bytes += nb
            meta["items"].append({"id": r["id"], "date": d, "tile_cloud_cover": r["props"]["eo:cloud_cover"],
                                  "baseline": r["props"]["s2:processing_baseline"], "bytes": nb})
            print(r["id"], f"{nb / 1e6:.1f} MB", flush=True)
            if mode != "build":
                continue
            if not bands:
                meta["items"].pop()
                continue
            ok = (bands["red"] > 0) & ~np.isin(bands["scl"], DROP)
            rgb = np.stack([np.where(ok, bands[k] / 10000.0, np.nan) for k in ("red", "green", "blue")]).astype(np.float32)
            stack = rgb if stack is None else np.where(np.isnan(stack), rgb, stack)
        med_in[d] = stack
    print(f"total compressed bytes {total_bytes / 1e6:.1f} MB for {len(meta['items'])} items", flush=True)
    meta["bytes_total"] = total_bytes
    if mode != "build":
        return
    cube = np.stack([med_in[d] for d in dates if med_in[d] is not None])
    import warnings
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)
        med = np.nanmedian(cube, axis=0)
    valid = ~np.isnan(med[0])
    img = (255 * np.clip(np.nan_to_num(med) / 0.35, 0, 1) ** (1 / 1.4)).astype(np.uint8)
    img[:, ~valid] = 0
    meta["valid_share"] = round(float(valid.mean()), 4)
    meta["dropped_share_by_date"] = {d: round(float(np.isnan(med_in[d][0]).mean()), 4) for d in dates if med_in[d] is not None}
    prof = dict(driver="GTiff", width=W, height=H, count=3, dtype="uint8", crs="EPSG:32629", transform=tr, nodata=0,
                photometric="RGB", tiled=True, blockxsize=512, blockysize=512, compress="deflate")
    with rasterio.open(os.path.join(out, name + ".tif"), "w", **prof) as o:
        o.write(img)
    Image.fromarray(np.moveaxis(img, 0, -1)).save(os.path.join(out, name + ".png"), optimize=True)
    with open(os.path.join(out, name + ".pgw"), "w") as f:
        f.write(f"{res}\n0\n0\n{-res}\n{x0 + res / 2}\n{y1 - res / 2}\n")
    json.dump(meta, open(os.path.join(out, name + ".json"), "w"), indent=1)
    print(json.dumps({k: meta[k] for k in ("valid_share", "bytes_total", "dropped_share_by_date")}, indent=1))


if __name__ == "__main__":
    main()
