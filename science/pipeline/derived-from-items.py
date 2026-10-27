"""Turn an NDVI bundle's derived_from links into the item list (kept.jsonl) that s2_ndvi.py and ndvi-bundle.py read.

Usage: python3 -I derived-from-items.py <ndvi_bundle_dir> <out kept.jsonl>
This reproduces a bundle's exact input set without a new catalog search. For each period Item, every derived_from
link names one Earth Search item: its ID gives tile, sensing date and sequence; its title gives the processing baseline
and relative orbit ("<id> (baseline 05.00, R094; kept pixels N)"). Stdlib only.
"""
import json
import os
import re
import sys

bdir, out = sys.argv[1:3]
col = json.load(open(os.path.join(bdir, "collection.json")))
rows = []
for l in col["links"]:
    if l["rel"] != "item":
        continue
    it = json.load(open(os.path.join(bdir, l["href"])))
    for d in it["links"]:
        if d["rel"] != "derived_from":
            continue
        m = re.match(r"(S2[ABC]_(\d\d[A-Z]{3})_(\d{8})_(\d+)_L2A) \(baseline ([\d.]+), (R\d{3});", d["title"])
        assert m, d["title"]
        iid, tile, ymd, seq, baseline, orbit = m.groups()
        rows.append({"id": iid, "tile": tile, "date": f"{ymd[:4]}-{ymd[4:6]}-{ymd[6:]}", "seq": int(seq),
                     "baseline": baseline, "orbit": orbit, "platform": "sentinel-" + iid[1:3].lower(),
                     "self": d["href"], "period_id": it["id"]})
rows.sort(key=lambda r: (r["date"], r["tile"]))
with open(out, "w") as f:
    for r in rows:
        f.write(json.dumps(r) + "\n")
print(len(rows), "items from", len({r["period_id"] for r in rows}), "periods")
