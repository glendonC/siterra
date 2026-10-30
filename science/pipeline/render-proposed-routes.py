"""Render the proposed routes bundle for inspection: hillshade of the relief bundle, a crop around the routes, the routes in amber, Tabant and the sites.

Usage: python -I render-proposed-routes.py <bundles_dir> <out.png> [--scale=<pixels per 30 m cell>]
"""
import json
import os
import sys

import numpy as np
import rasterio
from PIL import Image, ImageDraw
from pyproj import Transformer


def main():
    bundles, out = [a for a in sys.argv[1:] if not a.startswith("--")][:2]
    scale = int(next((a.split("=")[1] for a in sys.argv if a.startswith("--scale=")), 4))
    with rasterio.open(os.path.join(bundles, "bundle_relief_ait_bouguemez", "elevation-surface.tif")) as s:
        z, tr, nodata = s.read(1).astype(np.float64), s.transform, s.nodata
    ok = z != nodata
    fill = np.where(ok, z, np.nanmean(np.where(ok, z, np.nan)))
    gy, gx = np.gradient(fill, tr.a)
    slope, aspect = np.arctan(np.hypot(gx, gy)), np.arctan2(-gx, gy)
    shade = np.clip(np.sin(np.radians(45)) * np.cos(slope) + np.cos(np.radians(45)) * np.sin(slope) * np.cos(np.radians(315) - aspect), 0, 1)
    rgb = np.repeat((60 + 160 * shade)[..., None], 3, axis=2)
    rgb[~ok] = (11, 16, 18)
    feats = json.load(open(os.path.join(bundles, "bundle_proposed_routes_ait_bouguemez", "proposed-routes.geojson")))["features"]
    to = Transformer.from_crs("EPSG:4326", "EPSG:32629", always_xy=True)
    pts = []
    for f in feats:
        c = np.array(f["geometry"]["coordinates"])
        e, n = to.transform(c[:, 0], c[:, 1])
        pts.append(((np.array(e) - tr.c) / tr.a, (tr.f - np.array(n)) / tr.a))
    allx, ally = np.concatenate([p[0] for p in pts]), np.concatenate([p[1] for p in pts])
    c0, c1 = int(allx.min()) - 25, int(allx.max()) + 25
    r0, r1 = int(ally.min()) - 25, int(ally.max()) + 25
    img = Image.fromarray(rgb[r0:r1, c0:c1].astype(np.uint8)).resize(((c1 - c0) * scale, (r1 - r0) * scale), Image.BILINEAR)
    d = ImageDraw.Draw(img)
    for (x, y) in pts:
        d.line([((a - c0) * scale, (b - r0) * scale) for a, b in zip(x, y)], fill=(224, 122, 58), width=2)
        d.ellipse([(x[-1] - c0) * scale - 4, (y[-1] - r0) * scale - 4, (x[-1] - c0) * scale + 4, (y[-1] - r0) * scale + 4], outline=(255, 255, 255), width=2)
    x, y = pts[0][0][0], pts[0][1][0]
    d.rectangle([(x - c0) * scale - 4, (y - r0) * scale - 4, (x - c0) * scale + 4, (y - r0) * scale + 4], outline=(120, 210, 255), width=2)
    img.save(out)
    print("wrote", out, img.size)


if __name__ == "__main__":
    main()
