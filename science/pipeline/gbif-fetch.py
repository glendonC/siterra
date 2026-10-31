"""Read the GBIF occurrence records of a place: the only network reads of species_occurrences.

Usage: python -I gbif-fetch.py <place.json> <repo_root> <out_dir> [--resume]

Follows the registered species_occurrences 1.0.0 recipe. Requests https://api.gbif.org/v1/occurrence/search with the query polygon,
hasCoordinate, hasGeospatialIssue and occurrenceStatus of the place configuration (no licence filter, so the records dropped by licence can
be counted) in pages of 300 until every record is read; then each named taxon (species/match, then the same request with its taxonKey) and
the dataset and organization record of every dataset among the records. Anonymous, no account. The responses are written as received to
<out_dir> (they hold fields the bundle never reads, among them people's names: keep <out_dir> out of the repository, data/raw is ignored)
with fetch-record.json (the requests, the time, the counts). <out_dir> must not exist unless --resume is given (a page already on disk is read, not requested again).
"""
import datetime
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import place_config  # noqa: E402
import species_occurrences as so  # noqa: E402

MAX_TILE = 10000  # deep paging is slow: a query that matches more is cut into rectangles
UA = "siterra-science/0.1 (https://github.com; contact via repository)"


def get(url, tries=5):
    for k in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.loads(r.read().decode("utf-8"))
        except (urllib.error.URLError, TimeoutError) as e:
            if k == tries - 1:
                raise SystemExit(f"{url[:120]}: {e}")
            time.sleep(2 * (k + 1))


def query(params, limit, offset=0):
    """The search URL; params may hold a list for a repeated key (several polygons of one tile)."""
    return f"{so.API}/occurrence/search?" + urllib.parse.urlencode({**params, "limit": limit, "offset": offset}, doseq=True, quote_via=urllib.parse.quote)


def tiles(poly, base, depth=0, rect=None):
    """Rectangles of the query polygon, by repeated halving, each matching at most MAX_TILE records (cheap counts with limit 0)."""
    from shapely.geometry import box, MultiPolygon
    from shapely.geometry.polygon import orient
    rect = rect or poly.bounds
    part = poly.intersection(box(*rect))
    if part.is_empty:
        return []
    polys = [part] if part.geom_type == "Polygon" else [g for g in getattr(part, "geoms", []) if g.geom_type == "Polygon"]
    wkts = ["POLYGON((" + ",".join(f"{round(x, 5):.5f} {round(y, 5):.5f}" for x, y in orient(g, 1.0).exterior.coords) + "))" for g in polys]
    n = get(query({**base, "geometry": wkts}, 0))["count"]
    if n == 0:
        return []
    if n <= MAX_TILE:
        return [({**base, "geometry": wkts}, n)]
    if depth >= 8:
        return split_dense({**base, "geometry": wkts}, n)
    x0, y0, x1, y1 = rect
    xm, ym = (x0 + x1) / 2, (y0 + y1) / 2
    out = []
    for r in ((x0, y0, xm, ym), (xm, y0, x1, ym), (x0, ym, xm, y1), (xm, ym, x1, y1)):
        out += tiles(poly, base, depth + 1, r)
    return out


def facet(params, field):
    page = get(query({**params, "facet": field, "facetLimit": 1000, "facetMincount": 1}, 0))
    return [(f["name"], f["count"]) for f in page["facets"][0]["counts"]]


def split_dense(params, n):
    """A rectangle at the smallest size that still matches more than MAX_TILE (many records at one point): split by dataset, then by year.
    Every record has a dataset; a part that is still too large must be fully covered by its year counts, or the run stops."""
    parts = []
    ds = facet(params, "DATASET_KEY")
    if sum(c for _, c in ds) != n:
        raise SystemExit("the dataset counts do not add up to the part's count")
    for key, c in ds:
        if c <= MAX_TILE:
            parts.append(({**params, "datasetKey": key}, c))
            continue
        yr = facet({**params, "datasetKey": key}, "YEAR")
        if sum(cc for _, cc in yr) != c:
            raise SystemExit(f"dataset {key}: {c - sum(cc for _, cc in yr)} records without a year cannot be split off")
        for y, cc in yr:
            if cc > MAX_TILE:
                raise SystemExit(f"dataset {key} year {y}: {cc} records at one point, more than {MAX_TILE}")
            parts.append(({**params, "datasetKey": key, "year": y}, cc))
    return parts


def pages(params, out, name, log):
    off, n = 0, 0
    while True:
        url = query(params, 300, off)
        fp = os.path.join(out, f"{name}-{n:04d}.json")
        if os.path.exists(fp):  # a rerun after an interruption reads the page it already holds
            page = json.load(open(fp))
        else:
            page = get(url)
            json.dump(page, open(fp, "w"), ensure_ascii=False)
        if n == 0:
            log["count"] = page["count"]
        log["requests"].append(url)
        n += 1
        off += 300
        if page.get("endOfRecords", True) or not page["results"]:
            return
        if off >= 100000:
            raise SystemExit("more than 100,000 records: the search API cannot page past that")
        time.sleep(0.2)


def main():
    place, repo, out = [a for a in sys.argv[1:] if not a.startswith("--")][:3]
    cfg = place_config.load(place, repo)
    sc = cfg["recipes"]["species_occurrences"]
    if os.path.exists(out) and "--resume" not in sys.argv:
        raise SystemExit(f"{out} exists; it must not (or pass --resume to read the pages it holds)")
    for sub in ("pages", "named", "datasets"):
        os.makedirs(os.path.join(out, sub), exist_ok=True)
    _, wkt = so.query_polygon(cfg)
    f = sc["filters"]
    base = {"geometry": wkt, "hasCoordinate": str(f["hasCoordinate"]).lower(), "hasGeospatialIssue": str(f["hasGeospatialIssue"]).lower(),
            "occurrenceStatus": f["occurrenceStatus"]}
    rec = {"recipe": "species_occurrences", "version": "1.0.0", "place": cfg["placeId"], "config_revision": cfg["configRevision"],
           "retrieved": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "wkt": wkt, "filters": base,
           "main": {"count": None, "requests": []}, "named": [], "datasets": []}
    total = get(query(base, 0))["count"]
    if total <= MAX_TILE:
        pages(base, os.path.join(out, "pages"), "page", rec["main"])
    else:
        poly, _ = so.query_polygon(cfg)
        rec["main"]["tiles"] = []
        n_tiles = tiles(poly, base)
        for i, (tp, tn) in enumerate(n_tiles):
            log = {"count": None, "requests": []}
            pages(tp, os.path.join(out, "pages"), f"page-t{i:03d}", log)
            rec["main"]["tiles"].append({"tile": i, "count": log["count"], "requests": log["requests"]})
            rec["main"]["requests"] += log["requests"]
            print(f"tile {i + 1}/{len(n_tiles)}: {log['count']} records", flush=True)
    rec["main"]["count"] = total
    keys = set()
    for fn in sorted(os.listdir(os.path.join(out, "pages"))):
        for r in json.load(open(os.path.join(out, "pages", fn)))["results"]:
            keys.add(r["datasetKey"])
    for t in sc["namedTaxa"]:
        slug = t["name"].lower().replace(" ", "_")
        d = os.path.join(out, "named", slug)
        os.makedirs(d)
        m = get(f"{so.API}/species/match?" + urllib.parse.urlencode({"name": t["name"]}))
        json.dump(m, open(os.path.join(d, "match.json"), "w"), ensure_ascii=False)
        entry = {"name": t["name"], "match_request": f"{so.API}/species/match?name={urllib.parse.quote(t['name'])}", "usageKey": m.get("usageKey"),
                 "main": {"count": None, "requests": []}}
        if m.get("usageKey") and m.get("matchType") != "NONE":
            pages({**base, "taxonKey": m["usageKey"]}, d, "page", entry["main"])
            for fn in sorted(os.listdir(d)):
                if fn.startswith("page-"):
                    for r in json.load(open(os.path.join(d, fn)))["results"]:
                        keys.add(r["datasetKey"])
        rec["named"].append(entry)
    orgs = set()
    for k in sorted(keys):
        ds = get(f"{so.API}/dataset/{k}")
        json.dump(ds, open(os.path.join(out, "datasets", f"{k}.json"), "w"), ensure_ascii=False)
        orgs.add(ds["publishingOrganizationKey"])
        rec["datasets"].append(f"{so.API}/dataset/{k}")
        time.sleep(0.1)
    os.makedirs(os.path.join(out, "orgs"))
    for k in sorted(orgs):
        json.dump(get(f"{so.API}/organization/{k}"), open(os.path.join(out, "orgs", f"{k}.json"), "w"), ensure_ascii=False)
    json.dump(rec, open(os.path.join(out, "fetch-record.json"), "w"), indent=1, ensure_ascii=False)
    print(f"{cfg['placeId']}: GBIF reports {rec['main']['count']} records for the query; {len(keys)} datasets, {len(orgs)} publishers; "
          f"named taxa: " + ", ".join(f"{e['name']} key {e['usageKey']} count {e['main']['count']}" for e in rec["named"]))


if __name__ == "__main__":
    main()
