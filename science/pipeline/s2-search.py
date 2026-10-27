"""Search Earth Search (legacy sentinel-2-l2a) month by month for an envelope bbox and write the item list. Stdlib only.

Usage: python3 -I s2-search.py <bbox west,south,east,north> <first YYYY-MM> <last YYYY-MM> <out.jsonl>
For the Ait Bouguemez catchment the bbox used on 2026-10-26 was -6.60,31.50,-6.10,31.80 (2019-01 to 2025-12).
Each line: {"id", "props", "geometry", "month", "retrieved"}; props hold the fields s2-inventory.py reads
(datetime, eo:cloud_cover, s2:processing_baseline, s2:product_uri, earthsearch:boa_offset_applied, platform, ...).
The query is POST https://earth-search.aws.element84.com/v1/search with {"collections": ["sentinel-2-l2a"], "bbox",
"datetime": "<month start>/<month end>", "limit": 100, "fields": ...}, following "next" links until exhausted.
The catalog can change (reprocessed items appear later), so a bundle's own input set is its derived_from list
(derived-from-items.py), not a fresh search.
"""
import calendar
import datetime
import json
import sys
import time
import urllib.error
import urllib.request

URL = "https://earth-search.aws.element84.com/v1/search"
UA = "siterra-science-pipeline/0.1"
PROPS = ["datetime", "eo:cloud_cover", "grid:code", "s2:processing_baseline", "s2:datatake_id",
         "s2:nodata_pixel_percentage", "s2:product_uri", "earthsearch:boa_offset_applied", "platform",
         "s2:granule_id", "s2:sequence"]


def call(url, body=None, tries=6):
    for i in range(tries):
        try:
            data = None if body is None else json.dumps(body).encode()
            req = urllib.request.Request(url, data=data, headers={"User-Agent": UA, "Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=180) as r:
                return json.loads(r.read())
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError) as e:
            print("  retry", i, e, file=sys.stderr)
            time.sleep(3 * (i + 1))
    raise SystemExit("request failed: " + url)


def months(a, b):
    y, m = map(int, a.split("-"))
    y1, m1 = map(int, b.split("-"))
    while (y, m) <= (y1, m1):
        yield y, m
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)


bbox_s, first, last, out = sys.argv[1:5]
bbox = [float(v) for v in bbox_s.split(",")]
retrieved = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
total = 0
with open(out, "w") as fh:
    for y, m in months(first, last):
        end = calendar.monthrange(y, m)[1]
        body = {"collections": ["sentinel-2-l2a"], "bbox": bbox, "limit": 100,
                "datetime": f"{y:04d}-{m:02d}-01T00:00:00Z/{y:04d}-{m:02d}-{end:02d}T23:59:59.999Z",
                "fields": {"include": ["id", "geometry"] + ["properties." + p for p in PROPS], "exclude": ["assets", "links"]}}
        d, n = call(URL, body), 0
        while True:
            for f in d.get("features", []):
                fh.write(json.dumps({"id": f["id"], "props": f.get("properties", {}), "geometry": f.get("geometry"),
                                     "month": f"{y:04d}-{m:02d}", "retrieved": retrieved}) + "\n")
                n += 1
            nxt = [l for l in d.get("links", []) if l.get("rel") == "next"]
            if not nxt or not d.get("features"):
                break
            l = nxt[0]
            if l.get("method", "GET").upper() == "POST":
                d = call(l["href"], dict(body, **l.get("body", {})) if l.get("merge") else l.get("body", body))
            else:
                d = call(l["href"])
        total += n
        print(f"{y:04d}-{m:02d} items {n}", flush=True)
print("total", total, "retrieved", retrieved)
