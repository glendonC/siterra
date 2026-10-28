"""Global relief texture from Copernicus DEM GLO-90 coarsest overviews, read by HTTP range (no full tiles kept).

Usage: python -I globe-relief.py <tileList.txt> <cache_dir> <out_dir> [workers]
For each of the land tiles in the AWS copernicus-dem-90m tile list: open the COG's coarsest overview (factor 4, about
300 x 300 px for a 1 x 1 degree tile), average it onto a 25 px per degree grid cell (0.04 degree), and cache that small
array as <cache_dir>/<tile>.npy (resumable: cached tiles are skipped). Bytes read are the overview block sizes.
Then assemble a 9000 x 4500 global elevation grid (ocean and missing tiles = 0 m, flagged in a mask), a hillshade
(azimuth 315, altitude 45 degrees, metric spacing per latitude, vertical exaggeration 10 for visibility at this scale),
and write relief-elevation-0p04.tif (int16), relief-hillshade-8192x4096.png and relief-hillshade-4096x2048.png
(greyscale, equirectangular) and relief.json (counts, bytes, failures, parameters, sha256 of the PNGs).
"""
import concurrent.futures as cf
import hashlib
import json
import math
import os
import re
import sys
import time

import numpy as np
import rasterio
from affine import Affine
from PIL import Image
from rasterio.warp import Resampling, reproject

BASE = "https://copernicus-dem-90m.s3.amazonaws.com"
PPD = 25  # pixels per degree of the global grid
ENV = dict(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", GDAL_HTTP_MAX_RETRY="6", GDAL_HTTP_RETRY_DELAY="3",
           GDAL_HTTP_TIMEOUT="90", GDAL_HTTP_CONNECTTIMEOUT="20", CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".tif")


def parse(name):
    m = re.match(r"Copernicus_DSM_COG_30_([NS])(\d\d)_00_([EW])(\d\d\d)_00_DEM", name)
    lat = int(m.group(2)) * (1 if m.group(1) == "N" else -1)
    lon = int(m.group(4)) * (1 if m.group(3) == "E" else -1)
    return lat, lon  # south-west corner


def one(name, cache):
    path = os.path.join(cache, name + ".npy")
    if os.path.exists(path):
        return name, "cached", 0
    lat, lon = parse(name)
    url = f"/vsicurl/{BASE}/{name}/{name}.tif"
    for k in range(4):
        try:
            with rasterio.Env(**ENV):
                with rasterio.open(url, overview_level=1) as s:
                    arr = s.read(1).astype(np.float32)
                    nbytes = sum(s.block_size(1, i, j) for (i, j), _ in s.block_windows(1))
                    tr, crs, nod = s.transform, s.crs, s.nodata
            break
        except Exception as e:
            if k == 3:
                return name, f"failed: {e}", 0
            time.sleep(5 * (k + 1))
    dst = np.full((PPD, PPD), np.nan, np.float32)
    reproject(arr, dst, src_transform=tr, src_crs=crs, dst_transform=Affine(1 / PPD, 0, lon, 0, -1 / PPD, lat + 1),
              dst_crs="EPSG:4326", resampling=Resampling.average, src_nodata=nod, dst_nodata=np.nan)
    np.save(path + ".tmp.npy", dst)
    os.replace(path + ".tmp.npy", path)
    return name, "read", nbytes


def main():
    tl, cache, out = sys.argv[1:4]
    workers = int(sys.argv[4]) if len(sys.argv) > 4 else 16
    names = [l.strip() for l in open(tl) if l.strip()]
    os.makedirs(cache, exist_ok=True)
    os.makedirs(out, exist_ok=True)
    stats = {"tiles": len(names), "read": 0, "cached": 0, "failed": [], "bytes": 0}
    log = open(os.path.join(out, "relief-fetch.log"), "a")
    t0 = time.time()
    with cf.ThreadPoolExecutor(workers) as ex:
        for i, (name, status, nbytes) in enumerate(ex.map(lambda n: one(n, cache), names)):
            if status == "read":
                stats["read"] += 1
                stats["bytes"] += nbytes
                log.write(f"{name} {nbytes}\n")
            elif status == "cached":
                stats["cached"] += 1
            else:
                stats["failed"].append([name, status[:200]])
            if i % 500 == 0:
                print(f"{i}/{len(names)} read {stats['read']} cached {stats['cached']} failed {len(stats['failed'])} "
                      f"{stats['bytes'] / 1e6:.0f} MB {time.time() - t0:.0f}s", flush=True)
    log.close()
    prev = os.path.join(out, "relief.json")
    if os.path.exists(prev):
        stats["bytes_earlier_runs"] = json.load(open(prev)).get("bytes_total", 0)
    stats["bytes_total"] = stats["bytes"] + stats.get("bytes_earlier_runs", 0)
    if stats["failed"]:
        json.dump(stats, open(prev, "w"), indent=1)
        print("failures; rerun to resume:", len(stats["failed"]))
        sys.exit(1)

    H, W = 180 * PPD, 360 * PPD
    z = np.zeros((H, W), np.float32)
    land = np.zeros((H, W), bool)
    for name in names:
        a = np.load(os.path.join(cache, name + ".npy"))
        lat, lon = parse(name)
        r0, c0 = (89 - lat) * PPD, (lon + 180) * PPD
        ok = ~np.isnan(a)
        z[r0:r0 + PPD, c0:c0 + PPD][ok] = a[ok]
        land[r0:r0 + PPD, c0:c0 + PPD] |= ok
    prof = dict(driver="GTiff", width=W, height=H, count=1, dtype="int16", crs="EPSG:4326",
                transform=Affine(1 / PPD, 0, -180, 0, -1 / PPD, 90), compress="deflate", nodata=None)
    with rasterio.open(os.path.join(out, "relief-elevation-0p04.tif"), "w", **prof) as o:
        o.write(np.round(z).astype(np.int16), 1)
    lat_c = 90 - (np.arange(H) + 0.5) / PPD
    dy = 111320.0 / PPD
    dx = np.maximum(np.cos(np.radians(lat_c)) * 111320.0 / PPD, 1.0)[:, None]
    ex = 10.0
    zz = z * ex
    gy, gx = np.gradient(zz)
    gx = gx / dx
    gy = -gy / dy  # rows run southward
    slope = np.arctan(np.hypot(gx, gy))
    aspect = np.arctan2(-gx, gy)
    az, alt = math.radians(315), math.radians(45)
    hs = np.sin(alt) * np.cos(slope) + np.cos(alt) * np.sin(slope) * np.cos(az - aspect)
    img = np.clip(hs * 255, 0, 255).astype(np.uint8)
    img[~land] = int(round(math.sin(alt) * 255))  # flat ocean and missing tiles: the flat-ground shade
    shas = {}
    for w_, h_ in ((8192, 4096), (4096, 2048)):
        fn = f"relief-hillshade-{w_}x{h_}.png"
        Image.fromarray(img).resize((w_, h_), Image.LANCZOS).save(os.path.join(out, fn), optimize=True)
        shas[fn] = hashlib.sha256(open(os.path.join(out, fn), "rb").read()).hexdigest()
    stats.update({"grid": f"{W} x {H}, {1 / PPD} degree, EPSG:4326", "land_cells": int(land.sum()),
                  "hillshade": {"azimuth_deg": 315, "altitude_deg": 45, "vertical_exaggeration": ex},
                  "png_sha256": shas, "source": f"{BASE}/<tile>/<tile>.tif, overview factor 4"})
    json.dump(stats, open(prev, "w"), indent=1)
    print(json.dumps({k: stats[k] for k in ("tiles", "read", "cached", "bytes_total", "land_cells", "png_sha256")}, indent=1))


if __name__ == "__main__":
    main()
