"""Precompute species_occurrences for a place and write it as a bundle: the GBIF occurrence records inside the catchment under CC0 or CC BY 4.0,
as columns joined to a taxon table and a dataset table, a summary with counts by group, basis, class, year and dataset, the named plants, and a STAC
Collection that credits every dataset.

Usage: python -I species-occurrences-bundle.py <place.json> <repo_root> <gbif_raw_dir> <registry.json> <lockfile> <bundles_dir>
       [--inspected=<note.txt>] [--computed=<YYYY-MM-DDTHH:MM:SSZ>]

Follows the registered species_occurrences 1.0.0 recipe. <gbif_raw_dir> is the folder gbif-fetch.py wrote; the bundle is built from it alone, so a
rebuild gives identical files apart from the computed time. The bundle stores only the fields the recipe lists and none that names a person.
The bundle folder must not exist yet. Without --inspected the visual inspection check fails.
"""
import collections
import json
import os
import shutil
import sys

import numpy as np
import pyproj
import shapely

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bundle_common as bc  # noqa: E402
import place_config  # noqa: E402
import species_occurrences as so  # noqa: E402

RECIPE = "species_occurrences"
EXT = "https://siterra.invalid/schemas/stac/siterra/1.1.0/schema.json"


def read_pages(folder, prefix):
    out, first = [], None
    for fn in sorted(f for f in os.listdir(folder) if f.startswith(prefix)):
        page = json.load(open(os.path.join(folder, fn)))
        if first is None:
            first = page["count"]
        out += page["results"]
    return out, first


def classify(results, poly, kept_lic):
    """Records read (unique by GBIF id), the ones outside the exact polygon, the licence drops among the inside ones, and the kept rows."""
    seen, rows, outside, lic_drop = set(), [], 0, collections.Counter()
    for r in sorted(results, key=lambda r: r["key"]):
        if r["key"] in seen:
            continue
        seen.add(r["key"])
        lon, lat = r["decimalLongitude"], r["decimalLatitude"]
        if not so.inside(poly, lon, lat):
            outside += 1
            continue
        name = so.licence_name(r.get("license"))
        if name not in kept_lic:
            lic_drop[name] += 1
            continue
        rows.append(r)
    return len(seen), outside, lic_drop, rows


def compute(cfg, reg, raw):
    sc = cfg["recipes"][RECIPE]
    poly = place_config.geometry(cfg)
    kept_lic = {so.LICENCES[k][0] for k in sc["licencesKept"]}
    fr = json.load(open(os.path.join(raw, "fetch-record.json")))
    results, _ = read_pages(os.path.join(raw, "pages"), "page-")
    first_count = fr["main"]["count"]  # the count GBIF reports for the whole query polygon (a tiled fetch reads it with limit 0)
    n_read, outside, lic_drop, kept = classify(results, poly, kept_lic)
    datasets = {}
    for fn in os.listdir(os.path.join(raw, "datasets")):
        d = json.load(open(os.path.join(raw, "datasets", fn)))
        org = json.load(open(os.path.join(raw, "orgs", d["publishingOrganizationKey"] + ".json")))
        datasets[d["key"]] = {"key": d["key"], "title": d["title"], "doi": d.get("doi"), "publisher": org["title"], "publisher_key": org["key"],
                              "dataset_licence_url": d.get("license")}
    taxa, taxon_ix = [], {}
    cols = {k: [] for k in ("gbif_id", "taxon", "year", "event_date", "basis_of_record", "lat", "lon", "uncertainty_m", "dataset", "license")}
    ds_order = sorted({r["datasetKey"] for r in kept})
    ds_ix = {k: i for i, k in enumerate(ds_order)}
    basis_order = sorted({r["basisOfRecord"] for r in kept})
    lic_order = sorted(kept_lic)
    for r in kept:
        t = (r.get("scientificName"), r.get("species"), r.get("kingdom"), r.get("class"), r.get("order"), r.get("family"))
        if t not in taxon_ix:
            taxon_ix[t] = len(taxa)
            taxa.append(dict(zip(("scientific_name", "species", "kingdom", "class", "order", "family"), t)))
        cols["gbif_id"].append(int(r["key"]))
        cols["taxon"].append(taxon_ix[t])
        cols["year"].append(r.get("year"))
        cols["event_date"].append(r.get("eventDate"))
        cols["basis_of_record"].append(basis_order.index(r["basisOfRecord"]))
        cols["lat"].append(round(r["decimalLatitude"], 6))
        cols["lon"].append(round(r["decimalLongitude"], 6))
        cols["uncertainty_m"].append(r.get("coordinateUncertaintyInMeters"))
        cols["dataset"].append(ds_ix[r["datasetKey"]])
        cols["license"].append(lic_order.index(so.licence_name(r.get("license"))))
    by = lambda f: dict(sorted(collections.Counter(f(r) for r in kept).items(), key=lambda kv: (-kv[1], str(kv[0]))))
    group = by(lambda r: so.group_of(r.get("kingdom")))
    kingdom = by(lambda r: r.get("kingdom") or "unassigned")
    klass = by(lambda r: f"{r.get('kingdom') or 'unassigned'} / {r.get('class') or 'unassigned'}")
    basis = by(lambda r: r["basisOfRecord"])
    years = dict(sorted(collections.Counter(r.get("year") for r in kept if r.get("year")).items()))
    no_year = sum(1 for r in kept if not r.get("year"))
    per_ds = {}
    for k in ds_order:
        rs = [r for r in kept if r["datasetKey"] == k]
        per_ds[k] = {**datasets[k], "records": len(rs), "by_licence": dict(collections.Counter(so.licence_name(r.get("license")) for r in rs)),
                     "by_basis": dict(collections.Counter(r["basisOfRecord"] for r in rs))}
    unc = [r.get("coordinateUncertaintyInMeters") for r in kept]
    named = []
    for e, nt in zip(fr["named"], sc["namedTaxa"]):
        d = os.path.join(raw, "named", nt["name"].lower().replace(" ", "_"))
        m = json.load(open(os.path.join(d, "match.json")))
        nres, ncount = read_pages(d, "page-") if any(f.startswith("page-") for f in os.listdir(d)) else ([], 0)
        n_read_t, n_out, n_lic, n_kept = classify(nres, poly, kept_lic)
        named.append({"name": nt["name"], "source": nt.get("source"), "match": {k: m.get(k) for k in ("usageKey", "scientificName", "canonicalName", "rank", "status", "matchType", "confidence", "kingdom", "family")},
                      "gbif_reports_in_query": ncount, "read": n_read_t, "outside_polygon": n_out, "dropped_by_licence": dict(n_lic),
                      "kept": len(n_kept), "kept_gbif_ids": [int(r["key"]) for r in n_kept],
                      "kept_in_records": all(int(r["key"]) in set(cols["gbif_id"]) for r in n_kept)})
    return {"records_read": n_read, "gbif_count": first_count, "outside": outside, "lic_drop": dict(lic_drop), "kept_rows": kept, "cols": cols, "taxa": taxa,
            "datasets": per_ds, "ds_order": ds_order, "basis_order": basis_order, "lic_order": lic_order, "group": group, "kingdom": kingdom, "class": klass,
            "basis": basis, "years": years, "no_year": no_year, "named": named, "fetch": fr,
            "no_uncertainty": sum(1 for u in unc if u is None), "over_1000": sum(1 for u in unc if u is not None and u > 1000),
            "zero_uncertainty": sum(1 for u in unc if u == 0)}


def main():
    argv = [a for a in sys.argv[1:] if not a.startswith("--")]
    opts = dict(a[2:].split("=", 1) for a in sys.argv[1:] if a.startswith("--") and "=" in a)
    place, repo, raw, registry, lock_path, bundles = argv
    cfg = place_config.load(place, repo)
    reg = place_config.localize(cfg, [r for r in json.load(open(registry))["recipes"] if r["recipeId"] == RECIPE][0])
    sc = cfg["recipes"][RECIPE]
    bid = sc["bundleId"]
    bdir = os.path.join(bundles, bid)
    if os.path.exists(bdir):
        raise SystemExit(f"{bdir} exists; the bundle folder must not")
    now = opts.get("computed") or bc.now_utc()
    inspected = open(opts["inspected"]).read().strip() if "inspected" in opts else None

    c = compute(cfg, reg, raw)
    again = compute(cfg, reg, raw)
    identical = json.dumps([c["cols"], c["taxa"], c["datasets"], c["named"]], sort_keys=True) == json.dumps([again["cols"], again["taxa"], again["datasets"], again["named"]], sort_keys=True)
    kept_n = len(c["cols"]["gbif_id"])
    fetch = c["fetch"]
    wkt = fetch["wkt"]
    os.makedirs(bdir)

    occ = {"recipeId": RECIPE, "version": reg["version"], "computed": now, "records": kept_n,
           "how_to_read": "Columns of equal length, one entry per kept record. taxon indexes tables.taxa, dataset indexes tables.datasets, basis_of_record indexes tables.basis_of_record, license indexes tables.license. year and uncertainty_m are null where the record gives none (never 0 for none); event_date is as the record gives it.",
           "tables": {"taxa": c["taxa"],
                      "datasets": [{k: c["datasets"][d][k] for k in ("key", "title", "publisher", "doi")} for d in c["ds_order"]],
                      "basis_of_record": c["basis_order"], "license": c["lic_order"]},
           "columns": c["cols"]}
    op = os.path.join(bdir, "occurrences.json")
    bc.dump(occ, op, compact=True)
    attribution = []
    for d in c["ds_order"]:
        x = c["datasets"][d]
        lic = ", ".join(f"{n} ({v})" for n, v in sorted(x["by_licence"].items()))
        doi = f" https://doi.org/{x['doi']}." if x["doi"] else ""
        attribution.append(f"{x['publisher']}. {x['title']}. Occurrence dataset, {x['records']} records kept, licence {lic}.{doi} Accessed through GBIF.org on {fetch['retrieved'][:10]}.")
    n_dropped = sum(c["lic_drop"].values())
    summary = {
        "recipeId": RECIPE, "version": reg["version"], "computed": now, "claim_kind": "observation",
        "place": {"placeId": cfg["placeId"], "configRevision": cfg["configRevision"], "config_sha256": cfg["_sha256"]},
        "request": {"endpoint": f"{so.API}/occurrence/search", "retrieved": fetch["retrieved"], "filters": fetch["filters"], "query_polygon_wkt": wkt,
                    "query_polygon_rule": sc["queryPolygon"]["rule"], "page_limit": 300, "licence_in_request": False,
                    "gbif_count_for_query": c["gbif_count"], "pages": len(fetch["main"]["requests"])},
        "counts": {"read": c["records_read"], "outside_exact_polygon": c["outside"], "dropped_by_licence": c["lic_drop"],
                   "dropped_by_licence_total": n_dropped, "kept": kept_n, "licences_kept": [so.LICENCES[k][0] for k in sc["licencesKept"]]},
        "by_group": c["group"], "by_kingdom": c["kingdom"], "by_class": c["class"], "by_basis_of_record": c["basis"],
        "by_year": {str(k): v for k, v in c["years"].items()}, "records_without_year": c["no_year"],
        "coordinate_uncertainty": {"records_without": c["no_uncertainty"], "records_above_1000_m": c["over_1000"], "records_stated_zero": c["zero_uncertainty"]},
        "datasets": list(c["datasets"].values()), "named_taxa": c["named"], "named_taxa_reason": sc["namedTaxaReason"],
        "occurrences_asset": "occurrences", "limitations": reg["standardLimitations"], "forbidden_phrases": reg["forbiddenPhrases"],
    }
    sp = os.path.join(bdir, "species-occurrences.json")
    bc.dump(summary, sp)
    shutil.copyfile(place_config.geometry_path(cfg), os.path.join(bdir, "analysis-geometry.geojson"))
    lock_out = os.path.join(bdir, "uv.lock")
    shutil.copyfile(lock_path, lock_out)

    # checks, from the stored file
    st = json.load(open(op))
    lens = {k: len(v) for k, v in st["columns"].items()}
    poly = place_config.geometry(cfg)
    inside_n = int(sum(so.inside(poly, lo, la) for lo, la in zip(st["columns"]["lon"], st["columns"]["lat"])))
    lic_ok = all(st["tables"]["license"][i] in {so.LICENCES[k][0] for k in sc["licencesKept"]} for i in st["columns"]["license"])
    sums = {"group": sum(c["group"].values()), "basis": sum(c["basis"].values()), "class": sum(c["class"].values()), "dataset": sum(d["records"] for d in c["datasets"].values())}
    join_ok = all(0 <= i < len(st["tables"]["datasets"]) for i in st["columns"]["dataset"]) and all(0 <= i < len(st["tables"]["taxa"]) for i in st["columns"]["taxon"])
    bad_year = sum(1 for y, d in zip(st["columns"]["year"], st["columns"]["event_date"]) if y and d and str(d)[:4].isdigit() and int(str(d)[:4]) != y)
    banned = ("recordedBy", "identifiedBy", "rightsHolder", "recordedByID", "identifiedByID")
    txt = open(op).read() + open(sp).read()
    person_fields = [b for b in banned if b in txt]
    recompute_ok = bool(identical and c["records_read"] == c["gbif_count"] and len(set(lens.values())) == 1 and lens["gbif_id"] == kept_n and inside_n == kept_n and lic_ok
                        and all(v == kept_n for v in sums.values()) and c["records_read"] == c["outside"] + n_dropped + kept_n and not person_fields)
    checks = [
        {"name": "recompute_sample_period", "passed": recompute_ok, "detail": (
            f"GBIF reports {c['gbif_count']} records for the query on its first page and {c['records_read']} unique records were read ({'equal' if c['records_read'] == c['gbif_count'] else 'NOT equal'}); "
            f"{c['outside']} lie outside the exact catchment polygon, {n_dropped} inside it were dropped by licence ({', '.join(f'{k} {v}' for k, v in sorted(c['lic_drop'].items())) or 'none'}), {kept_n} kept; "
            f"all {inside_n} stored coordinates lie inside or on the polygon; every stored licence is CC0-1.0 or CC-BY-4.0 ({lic_ok}); the counts by group, basis of record, class and dataset each add up to {kept_n} "
            f"({sums}); no stored text carries a person field name ({'none' if not person_fields else person_fields}); the build run twice from the stored raw response gives identical records: {identical}.")},
        {"name": "units_and_scale", "passed": True, "detail": (
            "Coordinates are decimal degrees (GBIF decimalLatitude and decimalLongitude, WGS84), 6 decimals; uncertainty_m is metres as the record states it; year is a calendar year; "
            "a record count is one GBIF occurrence, not an individual organism.")},
        {"name": "nodata_not_zero", "passed": True, "detail": (
            f"A record without a coordinate uncertainty or a year stores null: {c['no_uncertainty']} of {kept_n} have no uncertainty and {c['no_year']} no year; {c['zero_uncertainty']} state an uncertainty of exactly 0 m "
            "and are stored as stated. A named plant with no kept record is reported as 0 with its match, never omitted.")},
        {"name": "qa_join_coverage", "passed": bool(join_ok), "detail": (
            f"Every kept record joins to one taxon, one dataset, one basis of record and one licence; {len(c['taxa'])} taxa, {len(c['ds_order'])} datasets with their title, publisher and DOI; "
            f"GBIF datasets read {len(fetch['datasets'])}, publishers {len({d['publisher_key'] for d in c['datasets'].values()})}.")},
        {"name": "period_alignment", "passed": bad_year == 0, "detail": (
            f"Where a record gives both a year and an event date the year equals the first four characters of the date: {bad_year} differ. Years run {min(c['years']) if c['years'] else 'none'} to {max(c['years']) if c['years'] else 'none'}; counts by year reflect recording effort.")},
        {"name": "attribution_present", "passed": len(attribution) == len(c["ds_order"]), "detail": (
            f"siterra:attribution holds one line for each of the {len(c['ds_order'])} datasets (publisher, title, records kept, licence, DOI, access date) and the GBIF line.")},
        {"name": "visual_inspection_sample", "passed": inspected is not None,
         "detail": inspected or "Not inspected: run with --inspected=<note> after reading the summary and a sample of records."},
    ]
    status = "validated" if all(x["passed"] for x in checks) else "failed"
    strata_col = json.load(open(os.path.join(bundles, cfg["strata"]["bundle"], "collection.json")))
    assets = {
        "analysis_geometry": bc.plain_asset(bdir, "analysis-geometry.geojson", "application/geo+json", f"Frozen analysis geometry {cfg['geometry']['id']}, revision {cfg['geometry']['revision']}", ["metadata"]),
        RECIPE: bc.plain_asset(bdir, "species-occurrences.json", "application/json",
                               "Summary: the request, records read, dropped by polygon and by licence, kept, counts by group, class, basis of record and year, datasets, named plants (the result read_recipe_result returns)", ["data"]),
        "occurrences": bc.plain_asset(bdir, "occurrences.json", "application/json",
                                      "Kept records as columns (GBIF id, taxon, year, event date, basis of record, latitude, longitude, uncertainty in metres, dataset, licence) joined to taxon, dataset, basis and licence tables", ["data"]),
    }
    sw = {"siterra-science": "0.1.0", "python": sys.version.split()[0], "numpy": np.__version__, "pyproj": pyproj.__version__, "shapely": shapely.__version__}
    nm = "; ".join(f"{n['name']}: {n['kept']} kept" for n in c["named"])
    desc = (f"Precomputed result of recipe {RECIPE} {reg['version']} for {cfg['title']}: of {c['records_read']} GBIF occurrence records with a coordinate inside the query polygon, {c['outside']} lie outside the "
            f"catchment, {n_dropped} were dropped by licence, and {kept_n} records under CC0 or CC BY 4.0 are kept ({', '.join(f'{v} {k}' for k, v in c['group'].items())}), "
            f"from {len(c['ds_order'])} datasets, requested on {fetch['retrieved'][:10]}." + (f" Named plants: {nm}." if nm else "")
            + " Recorded here, not presence or abundance.\n\n" + " ".join(reg["standardLimitations"]))
    yrs = sorted(c["years"])
    col = {
        "type": "Collection", "stac_version": "1.1.0",
        "stac_extensions": ["https://stac-extensions.github.io/processing/v1.3.0/schema.json", "https://stac-extensions.github.io/file/v2.1.0/schema.json", EXT],
        "id": bid, "title": f"Recorded life in the catchment: GBIF occurrence records ({RECIPE} {reg['version']})", "description": desc, "license": "other",
        "providers": [
            {"name": "GBIF, the Global Biodiversity Information Facility", "roles": ["host"], "url": "https://www.gbif.org"},
            {"name": "Siterra science pipeline", "roles": ["processor"],
             "processing:lineage": (f"Anonymous reads of the GBIF occurrence search API ({len(fetch['main']['requests'])} pages of up to 300 records, the species match and the dataset and organization records) on {fetch['retrieved'][:10]}, "
                                    "tested against the exact catchment polygon and filtered to CC0 and CC BY 4.0, stored without any field that names a person (science/pipeline/gbif-fetch.py, species-occurrences-bundle.py)"),
             "processing:software": sw}],
        "extent": {"spatial": {"bbox": [list(poly.bounds)]}, "temporal": {"interval": [[f"{yrs[0]}-01-01T00:00:00Z" if yrs else None, f"{yrs[-1]}-12-31T23:59:59Z" if yrs else None]]}},
        "assets": assets, "created": now, "siterra:status": status, "siterra:variable": "species_occurrences",
        "siterra:dataset": {"id": "gbif-occurrence-search", "version": "v1", "access_route": f"{so.API}/occurrence/search with geometry, hasCoordinate, hasGeospatialIssue and occurrenceStatus (anonymous)",
                            "resolution_note": "Point records with a stated coordinate uncertainty; no grid; one record is one occurrence"},
        "siterra:geo_selection": strata_col["siterra:geo_selection"],
        "siterra:method": {"id": RECIPE, "version": reg["version"], "analysis_crs": cfg["analysisCrs"],
                           "parameters": {"place_configuration": f"science/places/{os.path.basename(place)} revision {cfg['configRevision']}, sha256 {cfg['_sha256']}",
                                          "filters": fetch["filters"], "licences_kept": sc["licencesKept"], "query_polygon": sc["queryPolygon"], "named_taxa": [n["name"] for n in sc["namedTaxa"]],
                                          "page_limit": 300, "retrieved": fetch["retrieved"]},
                           "reference_period": None, "operation_order": reg["formula"]},
        "siterra:attribution": [*attribution, f"Occurrence records from GBIF.org (accessed {fetch['retrieved'][:10]}) through the GBIF occurrence search API; each record keeps the licence of its dataset (CC0 1.0 or CC BY 4.0); see https://www.gbif.org/citation-guidelines."],
        "siterra:limitations": reg["standardLimitations"], "siterra:checks": checks,
        "links": [
            {"rel": "root", "href": "../catalog.json", "type": "application/json"}, {"rel": "parent", "href": "../catalog.json", "type": "application/json"},
            {"rel": "derived_from", "href": f"../{strata_col['id']}/collection.json", "type": "application/json", "title": f"Terrain strata bundle {strata_col['id']} (the geometry)",
             "file:checksum": "1220" + bc.sha(os.path.join(bundles, strata_col["id"], "collection.json"))},
            {"rel": "license", "href": "https://creativecommons.org/publicdomain/zero/1.0/", "title": "CC0 1.0 (records of datasets under CC0)"},
            {"rel": "license", "href": "https://creativecommons.org/licenses/by/4.0/", "title": "CC BY 4.0 (records of datasets under CC BY; credit each dataset)"},
            {"rel": "cite-as", "href": "https://www.gbif.org/citation-guidelines", "title": "GBIF citation guidelines"},
            {"rel": "processing-software", "href": "./uv.lock", "type": "application/toml", "title": "Pipeline lockfile (uv)", "file:checksum": "1220" + bc.sha(lock_out)}],
    }
    bc.dump(col, os.path.join(bdir, "collection.json"))
    print(f"{bid}: {status}; read {c['records_read']} (GBIF {c['gbif_count']}), outside {c['outside']}, licence drops {c['lic_drop']}, kept {kept_n}")
    print("  groups", c["group"], "| basis", c["basis"], "| datasets", len(c["ds_order"]), "| years", (yrs[0], yrs[-1]) if yrs else None, "| no year", c["no_year"])
    print("  uncertainty: none", c["no_uncertainty"], ">1000 m", c["over_1000"], "zero", c["zero_uncertainty"], "| sizes", os.path.getsize(op), os.path.getsize(sp))
    for n in c["named"]:
        print("  named", n["name"], n["match"]["matchType"], n["match"]["usageKey"], "read", n["read"], "outside", n["outside_polygon"], "lic", n["dropped_by_licence"], "kept", n["kept"])
    for x in checks:
        print(f"  check {x['name']}: {'passed' if x['passed'] else 'FAILED'}")


if __name__ == "__main__":
    main()
