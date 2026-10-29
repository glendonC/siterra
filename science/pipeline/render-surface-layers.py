"""Render the relief and land cover bundles to PNGs for visual inspection.

Usage: python -I render-surface-layers.py <bundles_dir> <out_dir>
Relief: hillshade (sun from the north-west, 45 degrees) tinted by height; the nodata ring and everything outside is dark.
Land cover: the WorldCover legend colours; outside the catchment is dark.
"""
import os
import sys

import numpy as np
import rasterio
from PIL import Image

LEGEND = {10: (0, 100, 0), 20: (255, 187, 34), 30: (255, 255, 76), 40: (240, 150, 255), 50: (250, 0, 0), 60: (180, 180, 180), 80: (0, 100, 200)}


def main():
    bundles, out = sys.argv[1:3]
    os.makedirs(out, exist_ok=True)
    with rasterio.open(os.path.join(bundles, "bundle_relief_ait_bouguemez", "elevation-surface.tif")) as s:
        z = s.read(1).astype(np.float64)
        res = s.res[0]
        nodata = s.nodata
    ok = z != nodata
    zz = np.where(ok, z, np.nan)
    fill = np.where(ok, z, np.nanmean(zz))
    gy, gx = np.gradient(fill, res)
    slope = np.arctan(np.hypot(gx, gy))
    aspect = np.arctan2(-gx, gy)
    az, alt = np.radians(315), np.radians(45)
    shade = np.clip(np.sin(alt) * np.cos(slope) + np.cos(alt) * np.sin(slope) * np.cos(az - aspect), 0, 1)
    t = np.clip((fill - np.nanmin(zz)) / (np.nanmax(zz) - np.nanmin(zz)), 0, 1)
    low, high = np.array([60, 90, 60.0]), np.array([240, 235, 225.0])
    rgb = (low[None, None] * (1 - t[..., None]) + high[None, None] * t[..., None]) * (0.35 + 0.65 * shade[..., None])
    rgb[~ok] = (11, 16, 18)
    Image.fromarray(rgb.astype(np.uint8)).save(os.path.join(out, "relief.png"))
    with rasterio.open(os.path.join(bundles, "bundle_land_cover_ait_bouguemez", "land-cover.tif")) as s:
        lc = s.read(1)
    img = np.zeros(lc.shape + (3,), np.uint8)
    img[:] = (11, 16, 18)
    for c, col in LEGEND.items():
        img[lc == c] = col
    Image.fromarray(img).resize((img.shape[1] // 4, img.shape[0] // 4), Image.NEAREST).save(os.path.join(out, "land-cover.png"))
    print("wrote relief.png and land-cover.png in", out)


if __name__ == "__main__":
    main()
