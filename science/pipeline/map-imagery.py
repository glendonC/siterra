"""Write the summer Sentinel-2 true-colour drape for the map: one Web Mercator image with its corner coordinates.

Usage: python -I map-imagery.py <truecolour.tif> <min_lon,min_lat,max_lon,max_lat> <pixel_m_mercator> <quality> <out.webp>
Warps the 8-bit RGB display composite (made by s2-truecolour from summer 2025 Sentinel-2 L2A, display stretch only) to
EPSG:3857 over the box (bilinear), encodes lossy WebP at the given quality with GDAL, and writes <out>.json beside it
with the four corners in the order a MapLibre image source takes them (top left, top right, bottom right, bottom
left, as longitude and latitude), the grid, the encoder and the image's SHA-256. Display only: no value is read from it.
"""
import hashlib
import json
import math
import os
import sys

import numpy as np
import rasterio
import rasterio.shutil
from rasterio.io import MemoryFile
from rasterio.transform import from_origin
from rasterio.warp import Resampling, reproject

src, box, px, quality, out = sys.argv[1], [float(v) for v in sys.argv[2].split(",")], float(sys.argv[3]), int(sys.argv[4]), sys.argv[5]
R = 6378137.0
mx = lambda lon: math.radians(lon) * R
my = lambda lat: R * math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))
x0, x1, y0, y1 = mx(box[0]), mx(box[2]), my(box[1]), my(box[3])
w, h = int(round((x1 - x0) / px)), int(round((y1 - y0) / px))
tr = from_origin(x0, y1, (x1 - x0) / w, (y1 - y0) / h)
with rasterio.open(src) as s:
    assert s.count == 3 and s.dtypes[0] == "uint8"
    dst = np.zeros((3, h, w), np.uint8)
    for b in range(3):
        reproject(rasterio.band(s, b + 1), dst[b], dst_transform=tr, dst_crs="EPSG:3857", resampling=Resampling.bilinear)
    covered = float((dst.sum(axis=0) > 0).mean())
with rasterio.Env(GDAL_PAM_ENABLED="NO"):
    with MemoryFile() as mem:
        with mem.open(driver="GTiff", width=w, height=h, count=3, dtype="uint8", crs="EPSG:3857", transform=tr) as m:
            m.write(dst)
        with mem.open() as m:
            rasterio.shutil.copy(m, out, driver="WEBP", QUALITY=quality)
for extra in (out + ".aux.xml",):
    if os.path.exists(extra):
        os.remove(extra)
lon = lambda x: math.degrees(x / R)
lat = lambda y: math.degrees(2 * math.atan(math.exp(y / R)) - math.pi / 2)
info = {"image": os.path.basename(out), "bytes": os.path.getsize(out), "sha256": hashlib.sha256(open(out, "rb").read()).hexdigest(),
        "crs": "EPSG:3857", "width": w, "height": h, "pixel_m_mercator": round((x1 - x0) / w, 4),
        "pixel_m_ground_at_centre": round((x1 - x0) / w * math.cos(math.radians((box[1] + box[3]) / 2)), 2),
        "coordinates": [[box[0], box[3]], [box[2], box[3]], [box[2], box[1]], [box[0], box[1]]],
        "check_corners_from_grid": [[round(lon(x0), 6), round(lat(y1), 6)], [round(lon(x1), 6), round(lat(y0), 6)]],
        "share_of_pixels_with_data": round(covered, 4), "encoder": f"GDAL {rasterio.__gdal_version__} WEBP, QUALITY={quality}",
        "source": os.path.basename(src)}
json.dump(info, open(out + ".json", "w"), indent=1)
print(json.dumps(info))
