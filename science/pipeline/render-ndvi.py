"""Render one month's NDVI composite for visual inspection: median NDVI (grey, 0 to 0.6), date count, catchment outline.

Usage: python -I render-ndvi.py <month_dir> <geometry.geojson> <out.png>
Downsampled by 4 (40 m display pixels) for viewing; pixels with fewer than 3 dates are drawn in red so gaps stand apart
from low vegetation. For inspection only; never a display product.
"""
import json
import sys

import numpy as np
import rasterio
from PIL import Image, ImageDraw
from pyproj import Transformer

mdir, geo, out = sys.argv[1:4]
with rasterio.open(f"{mdir}/median.tif") as s:
    med = s.read(1)
    tr = s.transform
cnt = rasterio.open(f"{mdir}/count.tif").read(1)
k = 4
med, cnt = med[::k, ::k], cnt[::k, ::k]
inside = ~np.isnan(med) | (cnt > 0)
g = np.clip(np.nan_to_num(med, nan=0) / 0.6, 0, 1)
rgb = np.full(med.shape + (3,), 255, np.uint8)
grey = (235 - 200 * g).astype(np.uint8)
ok = cnt >= 3
rgb[ok] = np.stack([grey[ok]] * 3, axis=-1)
gap = (cnt < 3) & (cnt > 0)
rgb[gap] = (230, 60, 60)
left = Image.fromarray(rgb)
c = np.clip(cnt.astype(float) / 15, 0, 1)
crgb = np.full(med.shape + (3,), 255, np.uint8)
v = (240 - 220 * c).astype(np.uint8)
m = cnt > 0
crgb[m] = np.stack([v[m], v[m], np.full(v[m].shape, 255, np.uint8)], axis=-1)
right = Image.fromarray(crgb)
W, H = left.size
img = Image.new("RGB", (2 * W + 10, H + 30), "white")
img.paste(left, (0, 30))
img.paste(right, (W + 10, 30))
d = ImageDraw.Draw(img)
ring = json.load(open(geo))["features"][0]["geometry"]["coordinates"][0]
to = Transformer.from_crs("EPSG:4326", "EPSG:32629", always_xy=True).transform
pts = []
for lon, lat in ring[::5]:
    x, y = to(lon, lat)
    col, row = ~tr * (x, y)
    pts.append((col / k, row / k + 30))
d.line(pts, fill=(200, 30, 30), width=1)
d.line([(p[0] + W + 10, p[1]) for p in pts], fill=(200, 30, 30), width=1)
acc = (cnt >= 3).sum() / max(1, inside.sum())
d.text((5, 5), f"{mdir.rstrip('/').split('/')[-1]}  median NDVI (white 0, black 0.6; red = fewer than 3 dates)   accepted share of drawn pixels {acc:.3f}", fill="black")
d.text((W + 15, 5), "clear dates per pixel (white 0, blue 15+)", fill="black")
img.save(out)
print(out, img.size)
