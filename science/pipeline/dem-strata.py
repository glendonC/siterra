"""Elevation and aspect strata from the pinned Copernicus DEM GLO-30 (2021) on the 10 m analysis grid of the place.

Usage: python -I dem-strata.py <place.json> <repo_root> <dem.tif> <out_dir>
  The geometry, analysis CRS and grid, DEM checksum, DEM grid and the WorldCover grid (landCover.path) come from the place
  configuration. The excluded classes (WorldCover 40 and 50) are those of the registered terrain_strata recipe, not a place value.
  elevation   DEM reprojected once to a 30 m grid in the analysis CRS aligned with the analysis grid (bilinear), then repeated
              3 x 3 onto the 10 m grid (nearest); the DEM's real resolution stays 30 m
  bands       three equal-area elevation bands: boundaries at the 1/3 and 2/3 quantiles of catchment elevation
  slope, aspect  Horn (1981) 3 x 3 gradient on the 30 m grid; aspect classes N (315 to 45 deg), E, S, W; slope below 5 deg
              is "level"; flat cells have no aspect class
  excluded    WorldCover 2021 cropland (40) and built-up (50): the patterned neutral stratum, never low vegetation
Writes strata.tif (band 1 elevation band 1 to 3, 0 outside; band 2 aspect class 1 N, 2 E, 3 S, 4 W, 5 level; band 3
excluded flag), elevation.tif (float32, 30 m values on the 10 m grid) and strata.json (boundaries, shares, method).
"""
import json
import os
import sys

import numpy as np
import rasterio
from affine import Affine
from rasterio.warp import Resampling, reproject

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import place_config  # noqa: E402

place, repo, dem_path, out = sys.argv[1:5]
cfg = place_config.load(place, repo)
place_config.check_dem(cfg, dem_path)
CRS = cfg["analysisCrs"]
G = cfg["elevation"]["gridM"]
K = int(round(G / cfg["analysisGridM"]))
EXCLUDED_CLASSES = (40, 50)  # WorldCover cropland and built-up, fixed by the registered terrain_strata recipe
wc_path = os.path.join(cfg["_repo"], cfg["landCover"]["path"])
os.makedirs(out, exist_ok=True)
tr, shp, mask = place_config.analysis_grid(cfg)
H30, W30 = -(-shp[0] // K), -(-shp[1] // K)
z30 = np.full((H30 + 2, W30 + 2), np.nan, np.float32)
tr30b = Affine(G, 0, tr.c - G, 0, -G, tr.f + G)
with rasterio.open(dem_path) as src:
    reproject(rasterio.band(src, 1), z30, src_transform=src.transform, src_crs=src.crs, dst_transform=tr30b,
              dst_crs=CRS, resampling=Resampling[cfg["elevation"]["resampling"]], dst_nodata=np.nan)
# Horn gradient on the padded 30 m grid
a, b, c = z30[:-2, :-2], z30[:-2, 1:-1], z30[:-2, 2:]
d, f = z30[1:-1, :-2], z30[1:-1, 2:]
g, h, i = z30[2:, :-2], z30[2:, 1:-1], z30[2:, 2:]
dzdx = ((c + 2 * f + i) - (a + 2 * d + g)) / (8 * G)
dzdy = ((g + 2 * h + i) - (a + 2 * b + c)) / (8 * G)  # rows increase southward
slope = np.degrees(np.arctan(np.hypot(dzdx, dzdy)))
# downslope direction as a compass bearing (0 = north-facing, clockwise): east component -dz/dx, north component
# +dz/dy_south (dzdy above grows southward, so a slope falling to the north has dzdy > 0)
aspect = (np.degrees(np.arctan2(-dzdx, dzdy)) + 360) % 360
z = z30[1:-1, 1:-1]


def up(x):
    return np.repeat(np.repeat(x, K, axis=0), K, axis=1)[: shp[0], : shp[1]]


Z, S, A = up(z), up(slope), up(aspect)
inside = mask & ~np.isnan(Z)
q1, q2 = np.quantile(Z[inside], [1 / 3, 2 / 3])
band = np.zeros(shp, np.uint8)
band[inside & (Z < q1)] = 1
band[inside & (Z >= q1) & (Z < q2)] = 2
band[inside & (Z >= q2)] = 3
asp = np.zeros(shp, np.uint8)
lev = inside & (S < 5)
n_ = inside & ~lev & ((A >= 315) | (A < 45))
e_ = inside & ~lev & (A >= 45) & (A < 135)
s_ = inside & ~lev & (A >= 135) & (A < 225)
w_ = inside & ~lev & (A >= 225) & (A < 315)
for k, sel in ((1, n_), (2, e_), (3, s_), (4, w_), (5, lev)):
    asp[sel] = k
wc = rasterio.open(wc_path).read(1)
excl = (inside & np.isin(wc, EXCLUDED_CLASSES)).astype(np.uint8)
prof = dict(driver="GTiff", width=shp[1], height=shp[0], crs=CRS, transform=tr, tiled=True,
            blockxsize=512, blockysize=512, compress="deflate")
with rasterio.open(os.path.join(out, "strata.tif"), "w", count=3, dtype="uint8", nodata=0, **prof) as o:
    o.write(band, 1)
    o.write(asp, 2)
    o.write(excl, 3)
with rasterio.open(os.path.join(out, "elevation.tif"), "w", count=1, dtype="float32", nodata=np.nan, predictor=3, **prof) as o:
    o.write(np.where(inside, Z, np.nan).astype(np.float32), 1)
n = int(inside.sum())
info = {"elevation_band_boundaries_m": [round(float(q1), 1), round(float(q2), 1)],
        "elevation_m": {"min": round(float(Z[inside].min()), 1), "median": round(float(np.median(Z[inside])), 1), "max": round(float(Z[inside].max()), 1)},
        "band_shares": {str(k): round(float((band == k).sum()) / n, 4) for k in (1, 2, 3)},
        "aspect_shares": {name: round(float((asp == k).sum()) / n, 4) for k, name in ((1, "N"), (2, "E"), (3, "S"), (4, "W"), (5, "level"))},
        "excluded_share": round(float(excl.sum()) / n, 4),
        "excluded_by_band": {str(k): round(float((excl.astype(bool) & (band == k)).sum()) / max(1, (band == k).sum()), 4) for k in (1, 2, 3)},
        "method": f"Copernicus DEM GLO-30 2021 tile, bilinear to {G} m {CRS}, Horn slope and aspect, equal-area elevation terciles, aspect quadrants, level below 5 degrees; WorldCover 2021 classes 40 and 50 excluded",
        "geometry_pixels_with_elevation": n}
json.dump(info, open(os.path.join(out, "strata.json"), "w"), indent=1)
print(json.dumps(info, indent=1))
