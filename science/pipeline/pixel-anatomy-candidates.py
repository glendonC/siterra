"""List the candidates of a place's pixel anatomy rule, in rank order, without building anything.

Usage: python -I pixel-anatomy-candidates.py <place.json> <repo_root> [<top>]
Reads the pixel trend bundle of the place configuration and applies the candidate rule of its pixel_anatomy block (the first direction of
directionOrder that has a candidate): the number of pixels, the number of candidates in each direction, and the first <top> (default 10).
"""
import importlib.util
import json
import os
import sys

import numpy as np
import rasterio

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pixel_anatomy as pa  # noqa: E402
import place_config  # noqa: E402

spec = importlib.util.spec_from_file_location("pab", os.path.join(os.path.dirname(os.path.abspath(__file__)), "pixel-anatomy-bundle.py"))
pab = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pab)

place, repo = sys.argv[1:3]
top_n = int(sys.argv[3]) if len(sys.argv) > 3 else 10
cfg = place_config.load(place, repo)
pc = cfg["recipes"]["pixel_anatomy"]
rule = pc["candidateRule"]
WIN = rule["window"]
tb = pc["trendBundle"]
tdir = os.path.join(cfg["_repo"], "data/bundles", tb["bundle"])
with rasterio.open(os.path.join(tdir, tb["grid"])) as t:
    mtr, mshape, mcrs = t.transform, (t.height, t.width), t.crs
tables = json.load(open(os.path.join(tdir, tb["table"])))["pixels_by_window"]
table, mismatch, *_ = pab.selection_table(cfg, WIN, tables, mtr, mshape, mcrs)
print(f"{len(table)} pixels in {WIN}; cell to pixel rule differs from the table for {mismatch}")
for d in pa.directions(rule):
    print(f"  {d}: {len(pa.rank_candidates(table, rule, d))} candidates")
d = pa.chosen_direction(table, rule)
print(f"direction used: {d}")
for i, t in enumerate(pa.rank_candidates(table, rule, d)[:top_n]):
    x, y = mtr * (t["col"] + 0.5, t["row"] + 0.5)
    print(f"  {i + 1:2d} {pa.pixel_id(*pa.tile_of(x, y))} row {t['row']} col {t['col']} slope {t['slope_per_decade']:+.5f} interval {t['lower_per_decade']:+.5f} to {t['upper_per_decade']:+.5f} cells {t['analysis_cells']} "
          f"tree+crop {t['wc_shares']['10'] + t['wc_shares']['40']:.2f} open {t['wc_shares']['20'] + t['wc_shares']['30'] + t['wc_shares']['60']:.2f} sloping {t['sloping_share']:.2f}")
