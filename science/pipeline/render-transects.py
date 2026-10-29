"""Render the profiles of a transects bundle for the visual inspection check.

Usage: python -I render-transects.py <bundle_dir> <out.png> [--width=1500]
One panel per line: the elevation profile with the band limits as lines, the valley floor segment shaded, band crossings
marked and a strip of WorldCover classes beneath. For inspection only.
"""
import json
import os
import sys

from PIL import Image, ImageDraw

bundle, out = sys.argv[1:3]
opts = dict(a[2:].split("=", 1) for a in sys.argv[3:] if a.startswith("--") and "=" in a)
width = int(opts.get("width", 1500))
samples = json.load(open(os.path.join(bundle, "transect-samples.json")))
summary = json.load(open(os.path.join(bundle, "terrain-transects.json")))
bounds = samples["band_boundaries_m"]
COLORS = {0: (60, 60, 60), 10: (60, 140, 80), 20: (150, 170, 90), 30: (200, 190, 120), 40: (225, 160, 80), 50: (200, 70, 70),
          60: (170, 150, 140), 80: (70, 120, 200)}
panel_h, strip_h, pad_l, pad_r, pad_t = 330, 22, 70, 20, 28
ids = list(samples["transects"])
img = Image.new("RGB", (width, len(ids) * (panel_h + strip_h + 50) + 10), (11, 16, 18))
d = ImageDraw.Draw(img)
for n, tid in enumerate(ids):
    t = samples["transects"][tid]["columns"]
    s = summary["transects"][tid]
    dist, z, band, lc = t["distance_m"], t["elevation_m"], t["band"], t["land_cover"]
    top = n * (panel_h + strip_h + 50) + pad_t
    zmin, zmax = min(z) - 50, max(z) + 50
    L = dist[-1]
    px = lambda x: pad_l + (x / L) * (width - pad_l - pad_r)
    py = lambda v: top + (zmax - v) / (zmax - zmin) * panel_h
    d.text((pad_l, top - 20), f"{tid}: {s['label']} ({L / 1000:.1f} km, {len(dist)} samples)", fill=(230, 230, 230))
    f = s["valley_floor"]
    if f:
        d.rectangle([px(f["from_m"]), top, px(f["to_m"]), top + panel_h], fill=(24, 34, 38))
    for b in bounds:
        d.line([pad_l, py(b), width - pad_r, py(b)], fill=(90, 100, 105), width=1)
        d.text((8, py(b) - 6), f"{b:.0f} m", fill=(150, 160, 165))
    pts = [(px(x), py(v)) for x, v in zip(dist, z)]
    d.polygon(pts + [(px(L), top + panel_h), (px(0), top + panel_h)], fill=(30, 40, 44))
    d.line(pts, fill=(224, 122, 58), width=2)
    for c in s["band_crossings"]:
        x = px(c["distance_m"])
        d.ellipse([x - 4, py(c["boundary_m"]) - 4, x + 4, py(c["boundary_m"]) + 4], outline=(255, 255, 255))
    for r in s["reference_points"]:
        x = px(r["distance_m"])
        d.line([x, top, x, top + panel_h], fill=(255, 255, 255), width=1)
        d.text((x + 4, top + 2), f"{r['name']} {r['elevation_m']:.0f} m", fill=(255, 255, 255))
    for k in range(len(dist)):
        x0 = px(dist[k] - 15 if k else 0)
        x1 = px(dist[k] + 15 if k < len(dist) - 1 else L)
        d.rectangle([x0, top + panel_h + 8, max(x1, x0 + 1), top + panel_h + 8 + strip_h], fill=COLORS.get(lc[k], (255, 0, 255)))
    d.text((8, top + panel_h + 12), "land cover", fill=(150, 160, 165))
    d.text((pad_l, top + panel_h + strip_h + 14),
           "0 m" + " " * 4 + "valley floor shaded; circles: band limits crossed; strip: WorldCover class (green tree, olive shrub, sand grass, orange crop, red built-up, grey bare, blue water)",
           fill=(150, 160, 165))
img.save(out)
print(out, img.size)
