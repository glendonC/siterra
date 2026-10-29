"""Render the optical visibility bundle for inspection: one row per elevation band, one column per month (2019-01 to 2025-12), grey level = clear share
(any_date), winter months (December to March) marked by an amber tick below the strip.

Usage: python -I render-optical-visibility.py <bundle_dir> <out.png>
"""
import json
import os
import sys

import numpy as np
from PIL import Image, ImageDraw


def main():
    bdir, out = sys.argv[1:3]
    m = json.load(open(os.path.join(bdir, "optical-visibility-monthly.json")))
    share = m["clear_share"]["any_date"]
    months = list(share["1"].keys())
    cw, rh = 14, 60
    img = Image.new("RGB", (cw * len(months) + 40, rh * 3 + 40), (11, 16, 18))
    d = ImageDraw.Draw(img)
    for r, b in enumerate(("3", "2", "1")):
        for c, mo in enumerate(months):
            v = int(255 * share[b][mo])
            d.rectangle([40 + c * cw, 10 + r * rh, 40 + (c + 1) * cw - 2, 10 + (r + 1) * rh - 4], fill=(v, v, v))
        d.text((4, 10 + r * rh + 20), f"band {b}", fill=(200, 200, 200))
    for c, mo in enumerate(months):
        if int(mo[5:7]) in (12, 1, 2, 3):
            d.rectangle([40 + c * cw, 10 + 3 * rh, 40 + (c + 1) * cw - 2, 10 + 3 * rh + 8], fill=(224, 122, 58))
    img.save(out)
    print("wrote", out, np.array([share["3"][mo] for mo in months]).min())


if __name__ == "__main__":
    main()
