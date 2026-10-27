"""Render a rainfall bundle period for visual inspection: native cells shaded by mm with values, catchment outline.

Usage: python -I render-cells.py <bundle_dir> <period_id> <out.png>
Plate carree, 0.05 degree cells; grey scale from 0 to the period maximum; numbers are the cell mm and fraction inside.
For inspection only; never a display product.
"""
import json
import os
import sys

from PIL import Image, ImageDraw

bdir, pid, out = sys.argv[1:4]
cells = json.load(open(os.path.join(bdir, "rainfall-cells.geojson")))["features"]
vals = {c["cell_id"]: c for c in json.load(open(os.path.join(bdir, pid, "cell-values.json")))["cells"]}
geom = json.load(open(os.path.join(bdir, "analysis-geometry.geojson")))["features"][0]["geometry"]["coordinates"][0]
xs = [c["geometry"]["coordinates"][0][0][0] for c in cells] + [c["geometry"]["coordinates"][0][2][0] for c in cells]
ys = [c["geometry"]["coordinates"][0][0][1] for c in cells] + [c["geometry"]["coordinates"][0][2][1] for c in cells]
x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
S = 1400 / (x1 - x0)
W, H = int((x1 - x0) * S) + 20, int((y1 - y0) * S) + 20
px = lambda lon, lat: (10 + (lon - x0) * S, 10 + (y1 - lat) * S)
img = Image.new("RGB", (W, H), "white")
d = ImageDraw.Draw(img)
vmax = max(v["mm"] for v in vals.values())
for c in cells:
    p = c["properties"]
    ring = c["geometry"]["coordinates"][0]
    v = vals[p["cell_id"]]["mm"]
    g = int(235 - 175 * v / vmax) if vmax else 235
    d.polygon([px(*q) for q in ring], fill=(g, g, 255), outline=(90, 90, 90))
    cx, cy = px(min(q[0] for q in ring) + 0.025, min(q[1] for q in ring) + 0.025)
    d.text((cx - 22, cy - 12), f"{v:.1f} mm", fill="black")
    d.text((cx - 22, cy + 2), f"f {p['fraction_inside']:.3f}", fill=(80, 80, 80))
d.line([px(*q) for q in geom], fill=(200, 30, 30), width=2)
d.text((12, 12), f"{pid}  max {vmax:.1f} mm", fill="black")
img.save(out)
print(out, W, H)
