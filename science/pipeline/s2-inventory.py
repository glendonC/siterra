"""Sentinel-2 item inventory for the catchment from an Earth Search item list (s2-search.py output; the 2026-10-26 list was made the same way). Stdlib only.

Usage: python -I s2-inventory.py <earthsearch-s2-l2a-items.jsonl> <out_dir> [--skip-empty <geometry.geojson> <item_cache_dir>]
With --skip-empty (needs rasterio; reads only the scene classification of duplicated tile-dates over the catchment):
  among duplicates, in the order newest baseline then highest sequence, keep the first item that has at least one
  clear pixel (scene classification 4 or 5) inside the catchment; if none has, keep the first. Clear counts are
  written to kept.jsonl and dropped.jsonl as clear_pixels.
Rules (docs/reference/observation-preprocessing.md section 2, default route):
  keep MGRS tiles 29SQR and 29RQQ only (30STA duplicates the same passes in another zone);
  deduplicate per tile and sensing date: keep the newest processing baseline, then the highest item sequence
  number (the trailing _N before _L2A); record every dropped item ID with the ID that replaced it;
  months 2019-01 to 2025-12.
Writes kept.jsonl, dropped.jsonl and monthly.csv (per month: distinct dates per tile, distinct dates with both
tiles, items kept, items dropped, relative orbits). Tile-level cloud cover is carried but never used as AOI cover.
"""
import collections
import csv
import json
import os
import sys

src, out = sys.argv[1:3]
SKIP = "--skip-empty" in sys.argv
if SKIP:
    k = sys.argv.index("--skip-empty")
    geo_path, cache_dir = sys.argv[k + 1], sys.argv[k + 2]
    import concurrent.futures as cf
    import numpy as np
    import rasterio
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import s2_ndvi
    tr, shp, mask = s2_ndvi.analysis_grid(geo_path)
    os.makedirs(cache_dir, exist_ok=True)

    def clear_pixels(iid):
        d = s2_ndvi.fetch_item(iid, cache_dir)
        with rasterio.Env(**s2_ndvi.ENV):
            scl20 = s2_ndvi.read_band("/vsicurl/" + d["assets"]["scl"]["href"], tr, shp, 20)
        scl = np.repeat(np.repeat(scl20, 2, axis=0), 2, axis=1)[: shp[0], : shp[1]]
        return int((mask & np.isin(scl, (4, 5))).sum())
os.makedirs(out, exist_ok=True)
TILES = {"29SQR", "29RQQ"}
groups = collections.defaultdict(list)
skipped_tile = 0
for line in open(src):
    d = json.loads(line)
    p = d["props"]
    tile = d["id"].split("_")[1]
    if tile not in TILES:
        skipped_tile += 1
        continue
    date = p["datetime"][:10]
    if not ("2019-01-01" <= date <= "2025-12-31"):
        continue
    seq = int(d["id"].split("_")[3])
    orbit = p["s2:product_uri"].split("_")[4]
    groups[(tile, date)].append({"id": d["id"], "tile": tile, "date": date, "datetime": p["datetime"],
                                 "baseline": p["s2:processing_baseline"], "seq": seq, "orbit": orbit,
                                 "platform": p["platform"], "boa_offset_applied": p.get("earthsearch:boa_offset_applied"),
                                 "tile_cloud_cover": p.get("eo:cloud_cover"),
                                 "nodata_pct": p.get("s2:nodata_pixel_percentage")})
kept, dropped = [], []
clear = {}
if SKIP:
    todo = [r["id"] for items in groups.values() if len(items) > 1 for r in items]
    with cf.ThreadPoolExecutor(8) as ex:
        for iid, n in zip(todo, ex.map(clear_pixels, todo)):
            clear[iid] = n
    print("clear pixels read for", len(todo), "duplicated items", flush=True)
for key, items in sorted(groups.items()):
    items.sort(key=lambda r: (r["baseline"], r["seq"]), reverse=True)
    if SKIP and len(items) > 1:
        for r in items:
            r["clear_pixels"] = clear[r["id"]]
        first = next((r for r in items if r["clear_pixels"] > 0), items[0])
        items.remove(first)
        items.insert(0, first)
    kept.append(items[0])
    for r in items[1:]:
        dropped.append({**r, "replaced_by": items[0]["id"]})
with open(os.path.join(out, "kept.jsonl"), "w") as f:
    for r in kept:
        f.write(json.dumps(r) + "\n")
with open(os.path.join(out, "dropped.jsonl"), "w") as f:
    for r in dropped:
        f.write(json.dumps(r) + "\n")
by_month = collections.defaultdict(lambda: {"29SQR": set(), "29RQQ": set(), "kept": 0, "dropped": 0, "orbits": set()})
for r in kept:
    m = by_month[r["date"][:7]]
    m[r["tile"]].add(r["date"])
    m["kept"] += 1
    m["orbits"].add(r["orbit"])
for r in dropped:
    by_month[r["date"][:7]]["dropped"] += 1
with open(os.path.join(out, "monthly.csv"), "w", newline="") as f:
    w = csv.writer(f)
    w.writerow(["month", "dates_29SQR", "dates_29RQQ", "dates_both_tiles", "items_kept", "items_dropped", "orbits"])
    for mo in sorted(by_month):
        m = by_month[mo]
        w.writerow([mo, len(m["29SQR"]), len(m["29RQQ"]), len(m["29SQR"] & m["29RQQ"]), m["kept"], m["dropped"],
                    " ".join(sorted(m["orbits"]))])
months = [f"{y}-{mm:02d}" for y in range(2019, 2026) for mm in range(1, 13)]
missing = [mo for mo in months if mo not in by_month]
low = [mo for mo in months if mo in by_month and len(by_month[mo]["29SQR"]) < 3]
print(f"groups {len(groups)} kept {len(kept)} dropped {len(dropped)} other-tile items skipped {skipped_tile}")
print(f"months with no item: {missing or 'none'}; months with fewer than 3 dates on 29SQR: {low or 'none'}")
print("baselines kept:", dict(collections.Counter(r["baseline"] for r in kept)))
print("dropped kept-baseline pairs:", dict(collections.Counter((r["baseline"], next(k["baseline"] for k in kept if k["id"] == r["replaced_by"])) for r in dropped)))
