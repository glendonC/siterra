"""Render strata.tif for inspection: elevation bands (left), aspect classes (middle), excluded layer (right).

Usage: python -I render-strata.py <strata.tif> <out.png>
Downsampled by 4. For inspection only.
"""
import sys

import numpy as np
from PIL import Image, ImageDraw
import rasterio

src, out = sys.argv[1:3]
with rasterio.open(src) as s:
    b, a, e = (s.read(i)[::4, ::4] for i in (1, 2, 3))
pal_b = {1: (90, 140, 90), 2: (190, 170, 110), 3: (130, 110, 160)}
pal_a = {1: (60, 90, 200), 2: (230, 160, 40), 3: (220, 70, 60), 4: (70, 170, 90), 5: (200, 200, 200)}
H, W = b.shape


def paint(arr, pal):
    img = np.full((H, W, 3), 255, np.uint8)
    for k, c in pal.items():
        img[arr == k] = c
    return Image.fromarray(img)


ex = np.full((H, W, 3), 255, np.uint8)
ex[b > 0] = (225, 225, 225)
ex[e == 1] = (0, 0, 0)
canvas = Image.new("RGB", (3 * W + 20, H + 24), "white")
for i, im in enumerate((paint(b, pal_b), paint(a, pal_a), Image.fromarray(ex))):
    canvas.paste(im, (i * (W + 10), 24))
d = ImageDraw.Draw(canvas)
d.text((4, 4), "elevation band: green low, sand mid, violet high", fill="black")
d.text((W + 14, 4), "aspect: blue N, orange E, red S, green W, grey level", fill="black")
d.text((2 * W + 24, 4), "excluded (WorldCover cropland, built-up) in black", fill="black")
canvas.save(out)
print(out, canvas.size)
