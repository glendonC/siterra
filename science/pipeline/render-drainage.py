"""Render the drainage lines of a bundle over the frozen catchment outline for the visual inspection check.

Usage: python -I render-drainage.py <bundle_dir> <out.png> [--width=1600]
Lines are drawn by Strahler order (thicker is higher); segments that do not descend within the recipe tolerance are
drawn in amber, the outlet is ringed. Plate carree scaled by the cosine of the mean latitude; for inspection only.
"""
import json
import math
import os
import sys

from PIL import Image, ImageDraw

bundle, out = sys.argv[1:3]
opts = dict(a[2:].split("=", 1) for a in sys.argv[3:] if a.startswith("--") and "=" in a)
width = int(opts.get("width", 1600))

geom = json.load(open(os.path.join(bundle, "analysis-geometry.geojson")))["features"][0]
ring = geom["geometry"]["coordinates"][0]
lines = json.load(open(os.path.join(bundle, "drainage-lines.geojson")))["features"]
lons = [p[0] for p in ring]
lats = [p[1] for p in ring]
lon0, lon1, lat0, lat1 = min(lons), max(lons), min(lats), max(lats)
k = math.cos(math.radians((lat0 + lat1) / 2))
pad = 30
scale = (width - 2 * pad) / ((lon1 - lon0) * k)
height = int((lat1 - lat0) * scale) + 2 * pad


def xy(lon, lat):
    return pad + (lon - lon0) * k * scale, height - pad - (lat - lat0) * scale


img = Image.new("RGB", (width, height), (11, 16, 18))
d = ImageDraw.Draw(img)
d.polygon([xy(*p[:2]) for p in ring], fill=(20, 28, 31), outline=(70, 82, 86))
blue = {1: (110, 150, 190), 2: (120, 170, 215), 3: (140, 190, 235), 4: (170, 210, 245), 5: (210, 230, 250)}
for f in sorted(lines, key=lambda f: f["properties"]["strahler_order"]):
    p = f["properties"]
    colour = blue[p["strahler_order"]] if p["descends"] else (224, 122, 58)
    w = [1, 1, 2, 3, 4, 5][p["strahler_order"]]
    d.line([xy(*c[:2]) for c in f["geometry"]["coordinates"]], fill=colour, width=w, joint="curve")
outlet = [f for f in lines if f["properties"]["downstream_segment_id"] is None]
for f in outlet:
    x, y = xy(*f["geometry"]["coordinates"][-1][:2])
    d.ellipse([x - 9, y - 9, x + 9, y + 9], outline=(255, 255, 255), width=2)
d.text((pad, 8), f"{len(lines)} segments, order 1 to {max(f['properties']['strahler_order'] for f in lines)}; amber: does not descend; ring: outlet",
       fill=(220, 220, 220))
img.save(out)
print(out, img.size)
