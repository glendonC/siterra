"""Render a pixel anatomy bundle for the visual inspection check.

Usage: python -I render-pixel-anatomy.py <bundle_dir> <out.png>
Panels: the cells coloured by WorldCover class (the footprint's cells bright, the margin dim), the month NDVI of each cell, the
display true colour, the class spectra of the scene in ten bands with the pixel's mean, and the pixel's own series
with its Theil-Sen line. For inspection only.
"""
import json
import os
import sys

from PIL import Image, ImageDraw

bundle, out = sys.argv[1:3]
cells = json.load(open(os.path.join(bundle, "pixel-cells.json")))["grid"]
spec = json.load(open(os.path.join(bundle, "pixel-spectra.json")))
ser = json.load(open(os.path.join(bundle, "pixel-series.json")))
summ = json.load(open(os.path.join(bundle, "pixel-anatomy.json")))
H, W = cells["rows"], cells["cols"]
CLS = {10: (60, 140, 80), 20: (150, 170, 90), 30: (200, 190, 120), 40: (225, 130, 190), 50: (200, 70, 70), 60: (120, 150, 210), 80: (70, 120, 200)}
LINE = {10: (80, 200, 100), 30: (230, 210, 120), 40: (230, 120, 200), 60: (130, 170, 240)}
img = Image.new("RGB", (1500, 920), (11, 16, 18))
d = ImageDraw.Draw(img)
S = 16  # pixels per cell


def grid(x0, y0, colour, title):
    d.text((x0, y0 - 16), title, fill=(220, 220, 220))
    for r in range(H):
        for c in range(W):
            col = colour(r, c)
            d.rectangle([x0 + c * S, y0 + r * S, x0 + (c + 1) * S - 1, y0 + (r + 1) * S - 1], fill=col)


def dim(rgb, inside):
    return rgb if inside else tuple(int(v * 0.35) for v in rgb)


def ramp(v):
    if v is None:
        return (40, 40, 40)
    t = max(0.0, min(1.0, (v - 0.0) / 0.9))
    return (int(60 + 170 * (1 - t)), int(60 + 150 * t), 70)


x1, x2, x3, y0 = 20, 20 + W * S + 30, 20 + 2 * (W * S + 30), 40
grid(x1, y0, lambda r, c: dim(CLS.get(cells["worldcover"][r][c], (255, 0, 255)), cells["inside"][r][c]), "WorldCover class (footprint cells bright)")
grid(x2, y0, lambda r, c: dim(ramp(cells["ndvi_median"][r][c]), cells["inside"][r][c]), f"{(summ.get('month_ndvi') or summ['june_ndvi'])['month']} NDVI median (red low, green high)")
grid(x3, y0, lambda r, c: dim(tuple(cells["truecolour_rgb"][r][c]), cells["inside"][r][c]), "true colour (display only)")

# spectra
px0, py0, pw, ph = 20, 560, 640, 300
d.text((px0, py0 - 20), f"class median reflectance, {spec['scene_id']} ({spec['datetime'][:10]}), bands B02 to B12", fill=(220, 220, 220))
d.rectangle([px0, py0, px0 + pw, py0 + ph], outline=(60, 70, 75))
bands = spec["bands"]
vmax = 0.5
X = lambda i: px0 + 20 + i * (pw - 40) / (len(bands) - 1)
Y = lambda v: py0 + ph - 10 - v / vmax * (ph - 20)
for cl in spec["classes"]:
    d.line([(X(i), Y(cl["median"][b])) for i, b in enumerate(bands)], fill=LINE.get(cl["code"], (200, 200, 200)), width=2)
    d.text((px0 + pw + 8, Y(cl["median"]["B12"]) - 6), f"{cl['name']} {cl['ndvi_of_median_red_nir']:.2f}", fill=LINE.get(cl["code"], (200, 200, 200)))
d.line([(X(i), Y(spec["pixel_measured"]["mean_reflectance"][b])) for i, b in enumerate(bands)], fill=(255, 255, 255), width=2)
d.text((px0 + 10, py0 + 6), f"white: pixel mean, NDVI {spec['pixel_measured']['ndvi_of_mean_red_nir']:.3f}; model {spec['model_at_measured_composition']['ndvi']:.3f}", fill=(255, 255, 255))
for i, b in enumerate(bands):
    d.text((X(i) - 10, py0 + ph + 2), b, fill=(150, 160, 165))

# series
sx0, sy0, sw, sh = 840, 560, 620, 300
d.text((sx0, sy0 - 20), f"pixel greenness in {summ['trend']['window']}, {summ['trend']['seasons']} seasons: {summ['trend']['slope_per_decade']:+.4f} per decade "
       f"[{summ['trend']['lower_per_decade']:+.4f}, {summ['trend']['upper_per_decade']:+.4f}]", fill=(220, 220, 220))
d.rectangle([sx0, sy0, sx0 + sw, sy0 + sh], outline=(60, 70, 75))
pts = [(s["year"], s["ndvi"]) for s in ser["seasons"] if s["ndvi"] is not None]
lo, hi = min(v for _, v in pts) - 0.03, max(v for _, v in pts) + 0.03
SX = lambda y: sx0 + 15 + (y - 2000) / 25 * (sw - 30)
SY = lambda v: sy0 + sh - 10 - (v - lo) / (hi - lo) * (sh - 20)
d.line([(SX(y), SY(v)) for y, v in pts], fill=(224, 122, 58), width=2)
for y, v in pts:
    d.ellipse([SX(y) - 3, SY(v) - 3, SX(y) + 3, SY(v) + 3], fill=(224, 122, 58))
mid_y = sorted(y for y, _ in pts)[len(pts) // 2]
mid_v = sorted(v for _, v in pts)[len(pts) // 2]
slope = summ["trend"]["slope_per_decade"] / 10
d.line([(SX(2000), SY(mid_v + slope * (2000 - mid_y))), (SX(2025), SY(mid_v + slope * (2025 - mid_y)))], fill=(255, 255, 255), width=1)
for y in (2000, 2010, 2020, 2025):
    d.text((SX(y) - 12, sy0 + sh + 2), str(y), fill=(150, 160, 165))
img.save(out)
print(out, img.size)
