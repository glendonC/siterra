"""Read ESA WorldCover 2021 v200 for the catchment by HTTP range and place it on the 10 m EPSG:32629 analysis grid.

Usage: python -I worldcover-grid.py <geometry.geojson> <out_dir>
Nearest-neighbour resampling of the class map (categorical; no averaging). Writes worldcover-2021.tif (uint8 classes, 0
outside the geometry), worldcover-2021.json (source URL, ETag, size, class shares inside the geometry). The map is a
"2021 context mask": cropland (40) and built-up (50) are shown as excluded, never as low vegetation.
"""
import datetime
import json
import os
import sys
import urllib.request

import numpy as np
import rasterio
from rasterio.warp import Resampling, reproject

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import s2_ndvi  # noqa: E402

URL = "https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/ESA_WorldCover_10m_2021_v200_N30W009_Map.tif"
CLASSES = {10: "Tree cover", 20: "Shrubland", 30: "Grassland", 40: "Cropland", 50: "Built-up", 60: "Bare / sparse vegetation",
           70: "Snow and ice", 80: "Permanent water bodies", 90: "Herbaceous wetland", 95: "Mangroves", 100: "Moss and lichen"}

geo, out = sys.argv[1:3]
os.makedirs(out, exist_ok=True)
tr, shp, mask = s2_ndvi.analysis_grid(geo)
req = urllib.request.Request(URL, method="HEAD")
with urllib.request.urlopen(req, timeout=60) as r:
    head = {"etag": r.headers.get("ETag"), "content_length": int(r.headers.get("Content-Length")), "last_modified": r.headers.get("Last-Modified")}
dst = np.zeros(shp, np.uint8)
with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR"):
    with rasterio.open("/vsicurl/" + URL) as src:
        win = rasterio.windows.from_bounds(-6.60, 31.45, -6.08, 31.80, transform=src.transform)
        arr = src.read(1, window=win)
        reproject(arr, dst, src_transform=src.window_transform(win), src_crs=src.crs, dst_transform=tr, dst_crs="EPSG:32629",
                  resampling=Resampling.nearest, src_nodata=0, dst_nodata=0)
dst[~mask] = 0
prof = dict(driver="GTiff", width=shp[1], height=shp[0], count=1, dtype="uint8", crs="EPSG:32629", transform=tr, nodata=0,
            tiled=True, blockxsize=512, blockysize=512, compress="deflate")
with rasterio.open(os.path.join(out, "worldcover-2021.tif"), "w", **prof) as o:
    o.write(dst, 1)
vals, cnt = np.unique(dst[mask], return_counts=True)
n = int(mask.sum())
shares = {f"{int(v)} {CLASSES.get(int(v), 'unknown')}": round(int(c) / n, 5) for v, c in zip(vals, cnt)}
meta = {"source": URL, "http": head, "retrieved": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "dataset": "ESA WorldCover 10 m 2021 v200", "license": "CC BY 4.0", "citation": "Zanaga et al. (2022), https://doi.org/10.5281/zenodo.7254221",
        "resampling": "nearest neighbour onto the EPSG:32629 10 m analysis grid", "geometry_pixels": n, "class_shares_in_geometry": shares}
json.dump(meta, open(os.path.join(out, "worldcover-2021.json"), "w"), indent=1)
print(json.dumps(shares, indent=1))
