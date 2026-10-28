"""Compare the MODIS Terra items kept from Planetary Computer with NASA's Common Metadata Repository (CMR) for the same place.

Usage: python -I modis-archive-gaps.py <place.json> <repo_root> <product> <raw_dir>
  product   mod13q1 or mod10a1, as for modis-fetch.py; reads the newest search record that modis-fetch.py wrote in
            <raw_dir>/<collection>/

Expected acquisition dates: every 16-day period start (day of year 1, 17, ..., 353) for MOD13Q1, every day for MOD10A1,
from the later of the search's first date and the product's first date to the search's last date. A date is absent when
no kept item has it for a tile that the kept items use. Each absent date and tile is then looked up in CMR (public
granule search, no login) by short name, version, temporal range and the place's bounding box. Writes
archive-gaps-<first>-<last>.json next to the search record: absent dates, those listed in CMR (held by the NASA archive
but not on Planetary Computer) and those missing in both. Prints counts only.
"""
import datetime
import json
import os
import sys
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import place_config  # noqa: E402

CMR = "https://cmr.earthdata.nasa.gov/search/granules.json"
UA = "siterra-science-pipeline/0.1 (research; contact via project repository)"
PRODUCTS = {
    "mod13q1": {"collection": "modis-13Q1-061", "short_name": "MOD13Q1", "version": "061", "step_days": 16,
                "first": "2000-02-18"},
    "mod10a1": {"collection": "modis-10A1-061", "short_name": "MOD10A1", "version": "61", "step_days": 1,
                "first": "2000-02-24"},
}


def now():
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def adate(d):
    return f"A{d.year}{d.timetuple().tm_yday:03d}"


def expected(first, last, step):
    d = first
    while d <= last:
        doy = d.timetuple().tm_yday
        if step == 1 or (doy - 1) % step == 0:
            yield d
        d += datetime.timedelta(days=1)


def cmr_granules(short_name, version, bbox, year):
    """(acquisition date, tile) pairs listed in CMR for one year, following CMR-Search-After."""
    q = urllib.parse.urlencode({"short_name": short_name, "version": version, "page_size": 2000,
                                "temporal": f"{year}-01-01T00:00:00Z,{year}-12-31T23:59:59Z",
                                "bounding_box": ",".join(str(v) for v in bbox)})
    out, after = set(), None
    while True:
        headers = {"User-Agent": UA}
        if after:
            headers["CMR-Search-After"] = after
        with urllib.request.urlopen(urllib.request.Request(f"{CMR}?{q}", headers=headers), timeout=120) as r:
            entries = json.load(r)["feed"]["entry"]
            after = r.headers.get("CMR-Search-After")
        for e in entries:
            parts = (e.get("producer_granule_id") or e["title"]).split(".")
            out.add((next(p for p in parts if p.startswith("A") and len(p) == 8),
                     next(p for p in parts if len(p) == 6 and p[0] == "h" and p[3] == "v")))
        if not entries or not after:
            return out


def main():
    place, repo, product, raw = sys.argv[1:5]
    spec = PRODUCTS[product]
    cfg = place_config.load(place, repo)
    bbox = [round(v, 6) for v in place_config.geometry(cfg).bounds]
    cdir = os.path.join(raw, spec["collection"])
    rec_name = sorted(f for f in os.listdir(cdir) if f.startswith("search-"))[-1]
    rec = json.load(open(os.path.join(cdir, rec_name)))
    have = {(i.split(".")[1], i.split(".")[2]) for i in rec["kept"]}
    tiles = sorted({t for _, t in have})
    first = max(datetime.date.fromisoformat(rec["first"]), datetime.date.fromisoformat(spec["first"]))
    last = datetime.date.fromisoformat(rec["last"])
    absent = [(adate(d), t) for d in expected(first, last, spec["step_days"]) for t in tiles if (adate(d), t) not in have]
    listed = set()
    for y in sorted({int(a[1:5]) for a, _ in absent}):
        listed |= cmr_granules(spec["short_name"], spec["version"], bbox, y)
    in_cmr = sorted(p for p in absent if p in listed)
    in_neither = sorted(p for p in absent if p not in listed)
    out = {"product": product, "collection": spec["collection"], "search_record": rec_name, "tiles": tiles,
           "first": first.isoformat(), "last": last.isoformat(), "step_days": spec["step_days"],
           "cmr": {"endpoint": CMR, "short_name": spec["short_name"], "version": spec["version"], "bounding_box": bbox},
           "checked_at": now(), "expected": len(list(expected(first, last, spec["step_days"]))) * len(tiles),
           "absent_on_planetary_computer": [f"{a}.{t}" for a, t in sorted(absent)],
           "listed_in_cmr": [f"{a}.{t}" for a, t in in_cmr],
           "missing_in_both": [f"{a}.{t}" for a, t in in_neither]}
    path = os.path.join(cdir, f"archive-gaps-{rec['first']}-{rec['last']}.json")
    with open(path, "w") as f:
        json.dump(out, f, indent=1)
    print(f"expected {out['expected']}, absent on Planetary Computer {len(absent)}, listed in CMR {len(in_cmr)}, "
          f"missing in both {len(in_neither)}; wrote {os.path.basename(path)}")


if __name__ == "__main__":
    main()
