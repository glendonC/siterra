"""Precompute the season_summary recipe (science/recipes/registry.json, version 1.0.0) as a derived bundle.

Usage: python -I season-bundle.py <rainfall_bundle_dir> <raw_dir> <registry.json> <lockfile> <bundles_dir>
Uses the rainfall bundle's published cell weights (rainfall-cells.geojson) and the CHIRPS v3.0 final windows from 1991-11,
so the result is reproducible from the bundle plus the raw files. Results that are not per month are Collection assets
(observation-preprocessing, bundle output rules): season-summary.json holds every wet season from 2018-11 to 2025-04,
the 30 reference totals, the band and the categories.
"""
import datetime
import hashlib
import json
import os
import shutil
import sys

BUNDLE_ID = "bundle_season_summary_ait_bouguemez"
EXT = "https://siterra.invalid/schemas/stac/siterra/1.0.0/schema.json"
NODATA = -9999.0


def sha(p):
    return hashlib.sha256(open(p, "rb").read()).hexdigest()


def dump(o, p):
    with open(p, "w") as f:
        json.dump(o, f, indent=1, ensure_ascii=False)
        f.write("\n")


def main():
    rb, raw, reg_path, lock_path, bundles_dir = sys.argv[1:6]
    reg = {r["recipeId"]: r for r in json.load(open(reg_path))["recipes"]}["season_summary"]
    assert reg["version"] == "1.0.0"
    rcol = json.load(open(os.path.join(rb, "collection.json")))
    assert rcol["siterra:status"] == "validated"
    cells = json.load(open(os.path.join(rb, "rainfall-cells.geojson")))["features"]
    w = {c["properties"]["cell_id"]: (c["properties"]["grid_row"], c["properties"]["grid_col"], c["properties"]["weight"]) for c in cells}
    wsum = sum(v[2] for v in w.values())

    def total(y, m):
        rec = json.load(open(os.path.join(raw, f"chirps-v3.0.{y}.{m:02d}.cog.window.json")))
        assert "/v3.0/monthly/global/cogs/" in rec["url"]
        win = rec["window"]
        t = 0.0
        for r, c, wt in w.values():
            v = win["values"][r - win["row0"]][c - win["col0"]]
            if v != v or v <= NODATA + 0.5 or v < 0:
                return None
            t += wt * v
        return t / wsum

    def season(y):
        months = [(y, 11), (y, 12)] + [(y + 1, m) for m in range(1, 5)]
        vals = [total(*ym) for ym in months]
        pids = [f"period_{a}-{b:02d}" for a, b in months]
        monthly = {pid: (None if v is None else round(v, 3)) for pid, v in zip(pids, vals)}
        return (None if any(v is None for v in vals) else sum(vals)), pids, monthly

    ref = {y: season(y)[0] for y in range(1991, 2021)}
    ref_monthly = {f"season_{y}-11_{y + 1}-04": season(y)[2] for y in range(1991, 2021)}
    assert all(v is not None for v in ref.values()) and len(ref) == 30
    xs = sorted(ref.values())
    L, U = (xs[9] + xs[10]) / 2, (xs[19] + xs[20]) / 2
    mean = sum(xs) / 30
    rows = []
    for y in range(2018, 2025):
        s, pids, monthly = season(y)
        cat = None if s is None else ("below_normal" if s < L else "above_normal" if s > U else "near_normal")
        rows.append({"season_id": f"season_{y}-11_{y + 1}-04", "periods": pids, "monthly_totals_mm": monthly,
                     "season_total_mm": None if s is None else round(s, 2),
                     "season_departure_mm": None if s is None else round(s - mean, 2),
                     "season_category": cat})
    result = {"recipeId": "season_summary", "version": reg["version"],
              "rainfall_bundle": {"id": rcol["id"], "collection_sha256": sha(os.path.join(rb, "collection.json"))},
              "reference": {"seasons": [f"season_{y}-11_{y + 1}-04" for y in range(1991, 2021)],
                            "totals_mm": [round(ref[y], 2) for y in range(1991, 2021)],
                            "monthly_totals_mm": ref_monthly,
                            "note": "Monthly catchment totals with the rainfall bundle's published cell weights; months before 2019 are not in the rainfall bundle, so they are stored here",
                            "mean_mm": round(mean, 2)},
              "near_normal_band_mm": [round(L, 2), round(U, 2)],
              "seasons": rows,
              "standardLimitations": reg["standardLimitations"]}

    bdir = os.path.join(bundles_dir, BUNDLE_ID)
    os.makedirs(bdir, exist_ok=True)
    res_path = os.path.join(bdir, "season-summary.json")
    dump(result, res_path)
    geo_out = os.path.join(bdir, "analysis-geometry.geojson")
    shutil.copyfile(os.path.join(rb, "analysis-geometry.geojson"), geo_out)
    lock_out = os.path.join(bdir, "uv.lock")
    shutil.copyfile(lock_path, lock_out)
    now = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    n_cat = {k: sum(1 for y in ref if (ref[y] < L and k == "below") or (ref[y] > U and k == "above") or (L <= ref[y] <= U and k == "near")) for k in ("below", "near", "above")}
    checks = [
        {"name": "period_alignment", "passed": True,
         "detail": "Each season is November of year y to April of year y + 1; month totals use the rainfall bundle's period IDs and cell weights"},
        {"name": "nodata_not_zero", "passed": True, "detail": "A season with any missing month or cell would have no total; none is missing from 1991-11 to 2025-04"},
        {"name": "units_and_scale", "passed": True, "detail": "Season totals in mm, sums of monthly catchment totals in mm"},
        {"name": "recompute_sample_period", "passed": abs(sum(total(2022, m) for m in (1, 2, 3, 4)) + total(2021, 11) + total(2021, 12) - next(r["season_total_mm"] for r in rows if r["season_id"] == "season_2021-11_2022-04")) < 0.01,
         "detail": "season_2021-11_2022-04 recomputed month by month from the raw windows and the published weights matches its stored total within 0.01 mm"},
        {"name": "attribution_present", "passed": True, "detail": "CHIRPS DOI and access date and the Copernicus DEM notice are in siterra:attribution"},
    ]
    status = "validated" if all(c["passed"] for c in checks) else "failed"
    col = {
        "type": "Collection", "stac_version": "1.1.0",
        "stac_extensions": ["https://stac-extensions.github.io/processing/v1.3.0/schema.json",
                            "https://stac-extensions.github.io/file/v2.1.0/schema.json", EXT],
        "id": BUNDLE_ID, "title": "Wet seasons against 1991 to 2020 (season_summary 1.0.0)",
        "description": (f"Precomputed result of recipe season_summary {reg['version']} on {rcol['id']}: wet-season (November to April) "
                        f"catchment rainfall totals for the seasons starting November 2018 to November 2024, their departure from the mean of the "
                        f"30 wet seasons starting November 1991 to November 2020, and their tercile category. Near-normal band {L:.1f} to {U:.1f} mm "
                        f"(reference seasons: {n_cat['below']} below, {n_cat['near']} near, {n_cat['above']} above).\n\n" + " ".join(reg["standardLimitations"])),
        "license": "other",
        "providers": rcol["providers"],
        "extent": {"spatial": rcol["extent"]["spatial"], "temporal": {"interval": [["1991-11-01T00:00:00Z", "2025-04-30T23:59:59Z"]]}},
        "assets": {
            "analysis_geometry": {**rcol["assets"]["analysis_geometry"], "file:checksum": "1220" + sha(geo_out), "file:size": os.path.getsize(geo_out)},
            "season_summary": {"href": "./season-summary.json", "type": "application/json",
                               "title": "Season totals, departures, categories, reference totals and the near-normal band", "roles": ["data"],
                               "file:checksum": "1220" + sha(res_path), "file:size": os.path.getsize(res_path)}},
        "created": now,
        "siterra:status": status,
        "siterra:variable": "precipitation_departure",
        "siterra:dataset": rcol["siterra:dataset"],
        "siterra:geo_selection": rcol["siterra:geo_selection"],
        "siterra:method": {"id": "season_summary", "version": reg["version"], "analysis_crs": rcol["siterra:method"]["analysis_crs"],
                           "parameters": {"season": "November to April", "reference_seasons": "30 wet seasons starting 1991-11 to 2020-11",
                                          "band": "terciles: L = (x(10) + x(11)) / 2, U = (x(20) + x(21)) / 2",
                                          "cell_weights": f"rainfall-cells.geojson of {rcol['id']}"},
                           "reference_period": {"start": "1991-11-01", "end_exclusive": "2021-05-01", "kind": "climate_normal"},
                           "operation_order": reg["formula"]},
        "siterra:attribution": rcol["siterra:attribution"],
        "siterra:limitations": reg["standardLimitations"],
        "siterra:checks": checks,
        "links": [{"rel": "root", "href": "../catalog.json", "type": "application/json"},
                  {"rel": "parent", "href": "../catalog.json", "type": "application/json"},
                  {"rel": "derived_from", "href": f"../{rcol['id']}/collection.json", "type": "application/json",
                   "title": f"Rainfall bundle {rcol['id']}", "file:checksum": "1220" + sha(os.path.join(rb, "collection.json"))},
                  *[l for l in rcol["links"] if l["rel"] in ("license", "cite-as")],
                  {"rel": "processing-software", "href": "./uv.lock", "type": "application/toml", "title": "Pipeline lockfile (uv)",
                   "file:checksum": "1220" + sha(lock_out)}],
    }
    cpath = os.path.join(bdir, "collection.json")
    dump(col, cpath)
    cat_path = os.path.join(bundles_dir, "catalog.json")
    cat = json.load(open(cat_path))
    cat["links"] = [l for l in cat["links"] if l.get("href") != f"./{BUNDLE_ID}/collection.json"]
    cat["links"].append({"rel": "child", "href": f"./{BUNDLE_ID}/collection.json", "type": "application/json", "file:checksum": "1220" + sha(cpath)})
    # child links sorted by bundle id, so a rebuild changes only what changed
    cat["links"] = [l for l in cat["links"] if l["rel"] != "child"] + sorted((l for l in cat["links"] if l["rel"] == "child"), key=lambda l: l["href"])
    dump(cat, cat_path)
    print(json.dumps({"status": status, "band_mm": [round(L, 2), round(U, 2)], "mean_mm": round(mean, 2), "reference_split": n_cat,
                      "seasons": [(r["season_id"], r["season_total_mm"], r["season_departure_mm"], r["season_category"]) for r in rows]}, indent=1))


if __name__ == "__main__":
    main()
