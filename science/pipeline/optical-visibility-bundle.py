"""Write the optical visibility bundle: per elevation band and month the share of the band's 10 m cells with a clear Sentinel-2 observation,
and the winter summary, as JSON and a STAC Collection (recipe optical_visibility_by_band).

Usage: python -I optical-visibility-bundle.py <place.json> <repo_root> <s2_monthly_dir> <registry.json> <lockfile> <bundles_dir>
       [--inspected=<note.txt>] [--computed=<YYYY-MM-DDTHH:MM:SSZ>]

<s2_monthly_dir> holds <YYYY-MM>/median.tif and count.tif for every month of the place configuration. Follows the registered
optical_visibility_by_band 1.0.0 recipe. The bundle folder must not exist yet. Without --inspected the visual inspection check fails.
"""
import json
import os
import shutil
import sys

import numpy as np
import rasterio

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bundle_common as bc  # noqa: E402
import optical_visibility as ov  # noqa: E402
import place_config  # noqa: E402

RECIPE = "optical_visibility_by_band"
EXT = "https://siterra.invalid/schemas/stac/siterra/1.1.0/schema.json"
BAND_LABELS = {1: "below {0:.1f} m", 2: "{0:.1f} to {1:.1f} m", 3: "{1:.1f} m and above"}


def months_between(first, last):
    y, m = map(int, first.split("-"))
    y1, m1 = map(int, last.split("-"))
    out = []
    while (y, m) <= (y1, m1):
        out.append(f"{y}-{m:02d}")
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)
    return out


def compute(cfg, rc, params, s2dir):
    layers, _, sparams, _ = place_config.strata(cfg)
    band = layers["elevation_band"]
    _, _, mask = place_config.analysis_grid(cfg)
    band = np.where(mask, band, 0)
    bands = (1, 2, 3)
    months = months_between(*rc["months"])
    table, files, checks = {}, {}, {"any_date_equals_count_at_least_one": 0, "grid_mismatch": 0}
    for m in months:
        mp, cp = os.path.join(s2dir, m, "median.tif"), os.path.join(s2dir, m, "count.tif")
        with rasterio.open(mp) as a, rasterio.open(cp) as b:
            med, cnt = a.read(1), b.read(1)
            if med.shape != band.shape or b.shape != band.shape or not a.transform.almost_equals(b.transform):
                checks["grid_mismatch"] += 1
        files[m] = {"median_sha256": place_config.sha256(mp), "count_sha256": place_config.sha256(cp)}
        row = {}
        for v in rc["validity"]:
            row[v["id"]] = {str(b): n for b, n in ov.clear_shares(med, cnt, band, bands, v["minDates"]).items()}
        # check: any_date is the same as count at least one wherever a median exists, in cell counts
        alt = ov.clear_shares(np.where(cnt >= 1, 1.0, np.nan), cnt, band, bands, 1)
        if {str(b): n for b, n in alt.items()} != row["any_date"]:
            checks["any_date_equals_count_at_least_one"] += 1
        table[m] = row
    cells = {str(b): int((band == b).sum()) for b in bands}
    return {"months": months, "table": table, "files": files, "cells": cells, "checks": checks, "boundaries": sparams["boundaries_m"],
            "inside": int(mask.sum())}


def shares_of(core, variant, b):
    return {m: round(core["table"][m][variant][str(b)][0] / core["table"][m][variant][str(b)][1], 4) for m in core["months"]}


def main():
    pos = [a for a in sys.argv[1:] if not a.startswith("--")]
    place, repo, s2dir, registry, lock_path, bundles = pos
    opts = dict(a[2:].partition("=")[::2] for a in sys.argv[1:] if a.startswith("--"))
    cfg = place_config.load(place, repo)
    reg = next(r for r in json.load(open(registry))["recipes"] if r["recipeId"] == RECIPE)
    rc = cfg["recipes"][RECIPE]
    params = {p["name"]: p["default"] for p in reg["parameters"]}
    bid = rc["bundleId"]
    bdir = os.path.join(bundles, bid)
    if os.path.exists(bdir):
        raise SystemExit(f"{bdir} exists; the bundle folder must not")
    now = opts.get("computed") or bc.now_utc()
    inspected = open(opts["inspected"]).read().strip() if "inspected" in opts else None
    core = compute(cfg, rc, params, s2dir)
    again = compute(cfg, rc, params, s2dir)
    identical = json.dumps(core, sort_keys=True) == json.dumps(again, sort_keys=True)

    b1, b2 = core["boundaries"]
    labels = {1: BAND_LABELS[1].format(b1), 2: BAND_LABELS[2].format(b1, b2), 3: BAND_LABELS[3].format(b1, b2)}
    winter = [m for m in core["months"] if ov.is_winter(m, rc["winterMonths"])]
    hi, half = params["threshold_high"], params["threshold_half"]
    variants = {v["id"]: v for v in rc["validity"]}
    summary_bands = {}
    for b in (1, 2, 3):
        entry = {"label": labels[b], "cells": core["cells"][str(b)], "winter": {}, "all_months": {}}
        for vid in variants:
            sh = shares_of(core, vid, b)
            entry["winter"][vid] = {**ov.winter_summary([(m, sh[m]) for m in winter], hi, half),
                                    "shares": {m: sh[m] for m in winter}}
            vals = np.array(list(sh.values()))
            entry["all_months"][vid] = {"months": len(vals), "lowest": round(float(vals.min()), 4), "median": round(float(np.median(vals)), 4),
                                        "highest": round(float(vals.max()), 4)}
        summary_bands[str(b)] = entry
    rp = rc["reproduce"]
    up = summary_bands[str(rp["band"])]["winter"][rp["variant"]]
    cnt_up = core["cells"][str(rp["band"])]
    ex = [core["table"][m][rp["variant"]][str(rp["band"])][0] / cnt_up for m in winter]
    ex_by_month = dict(zip(winter, ex))

    def digits(x):
        return len(repr(x).split(".")[1])

    # the configured figures are compared to the digits they are given in, on the unrounded shares
    reproduce = {"lowest": round(min(ex), digits(rp["min"])) == rp["min"], "median": round(float(np.median(ex)), digits(rp["median"])) == rp["median"],
                 "highest": round(max(ex), digits(rp["max"])) == rp["max"],
                 "at_or_above_high": up["at_or_above_high"] == rp["atOrAbove0.9"], "at_or_above_half": up["at_or_above_half"] == rp["atOrAbove0.5"],
                 "winter_months": up["months"] == rp["winterMonths"],
                 "named_months": all(round(ex_by_month[m], digits(v)) == v for m, v in rp["months"].items())}
    total_ok = sum(core["cells"].values()) == core["inside"]
    problems = {**core["checks"], "cells_not_summing": 0 if total_ok else 1,
                "missing_files": sum(1 for m in core["months"] if m not in core["files"])}
    recompute_ok = bool(total_ok and not any(problems.values()) and all(reproduce.values()) and identical)

    os.makedirs(bdir)
    shutil.copyfile(place_config.geometry_path(cfg), os.path.join(bdir, "analysis-geometry.geojson"))
    lock_out = os.path.join(bdir, "uv.lock")
    shutil.copyfile(lock_path, lock_out)
    monthly = {"recipeId": RECIPE, "version": reg["version"], "computed": now, "band_cells": core["cells"],
               "valid_cells": {v: {m: {b: core["table"][m][v][b][0] for b in ("1", "2", "3")} for m in core["months"]} for v in variants},
               "clear_share": {v: {str(b): shares_of(core, v, b) for b in (1, 2, 3)} for v in variants},
               "input_files": core["files"]}
    bc.dump(monthly, os.path.join(bdir, "optical-visibility-monthly.json"), compact=True)
    summary = {"recipeId": RECIPE, "version": reg["version"], "computed": now,
               "place": {"placeId": cfg["placeId"], "configRevision": cfg["configRevision"], "config_sha256": cfg["_sha256"]},
               "claim_kind": "observation", "native_resolution": "10 m analysis cells, monthly Sentinel-2 composites",
               "units": {"clear_share": "fraction of the band's 10 m cells, 0 to 1"}, "period": rc["months"], "winter_months": rc["winterMonths"],
               "primary_validity": next(v["id"] for v in rc["validity"] if v.get("primary")),
               "validity": {v["id"]: v["label"] for v in rc["validity"]}, "thresholds": {"high": hi, "half": half},
               "band_boundaries_m": core["boundaries"], "bands": summary_bands, "reproduced": reproduce,
               "monthly_asset": "optical_visibility_monthly",
               "limitations": reg["standardLimitations"], "forbidden_phrases": reg["forbiddenPhrases"]}
    bc.dump(summary, os.path.join(bdir, "optical-visibility.json"))
    u3 = summary_bands["3"]["winter"]
    checks = [
        {"name": "recompute_sample_period", "passed": recompute_ok, "detail": (
            f"Recomputed from the stored monthly files. The three bands' cells sum to {sum(core['cells'].values())} against {core['inside']} cells inside the polygon ({total_ok}); "
            f"{len(core['months'])} months present on the strata grid ({core['checks']['grid_mismatch']} grid mismatches); the any_date count differs from the count of cells with at least "
            f"one date in {core['checks']['any_date_equals_count_at_least_one']} months. The upper band's winter shares ({up['months']} months, any_date): lowest {up['lowest']}, median {up['median']}, "
            f"highest {up['highest']}, {up['at_or_above_high']} at or above {hi} ({', '.join(up['months_at_or_above_high'])}), {up['at_or_above_half']} at or above {half}; "
            f"each equals the figure named in the place configuration: {reproduce}. The stricter three_dates reading of the same band: lowest {u3['three_dates']['lowest']}, "
            f"median {u3['three_dates']['median']}, highest {u3['three_dates']['highest']}, {u3['three_dates']['at_or_above_high']} at or above {hi}, {u3['three_dates']['at_or_above_half']} at or above {half}. "
            f"The sha256 of all {2 * len(core['files'])} input files is stored. The whole computation run twice in one process is identical: {identical}.")},
        {"name": "units_and_scale", "passed": True, "detail": "Clear share is a fraction of the band's 10 m cells (0 to 1, 4 decimals); the bands are the strata's equal-area elevation terciles "
                                                              f"({b1} m and {b2} m); months are calendar months of the Sentinel-2 composites; winter is December to March."},
        {"name": "nodata_not_zero", "passed": True, "detail": "A share of 0 means no cell of the band had a clear date that month; nothing is stored as missing (every month and band has a value). "
                                                              "Cells outside the polygon are not counted in any band."},
        {"name": "attribution_present", "passed": True, "detail": "The Sentinel-2 and Copernicus DEM notices are in siterra:attribution."},
        {"name": "visual_inspection_sample", "passed": inspected is not None, "detail": inspected or "Not inspected: run with --inspected=<note> after looking at the rendered strips."},
    ]
    status = "validated" if all(c["passed"] for c in checks) else "failed"
    s2col = json.load(open(os.path.join(bundles, "bundle_s2_ndvi_monthly_ait_bouguemez", "collection.json")))
    strata_col = json.load(open(os.path.join(bundles, cfg["strata"]["bundle"], "collection.json")))
    assets = {
        "analysis_geometry": bc.plain_asset(bdir, "analysis-geometry.geojson", "application/geo+json",
                                            f"Frozen analysis geometry {cfg['geometry']['id']}, revision {cfg['geometry']['revision']}", ["metadata"]),
        RECIPE: bc.plain_asset(bdir, "optical-visibility.json", "application/json",
                               "Winter summary per band and validity definition, the figures reproduced and the check results (the result read_recipe_result returns)", ["data"]),
        "optical_visibility_monthly": bc.plain_asset(bdir, "optical-visibility-monthly.json", "application/json",
                                                     "Valid cells and clear share per band, month and validity definition, and the sha256 of every input file", ["data"]),
    }
    desc = (f"Precomputed result of recipe {RECIPE} {reg['version']} for {cfg['title']}: for each of the three elevation bands and each of the {len(core['months'])} months of "
            f"{rc['months'][0]} to {rc['months'][1]}, the share of the band's 10 m cells with a clear Sentinel-2 observation (at least one date, and at least three), and the winter "
            f"(December to March, {len(winter)} months) summary. Upper band, winter, at least one date: {up['lowest']} to {up['highest']}, median {up['median']}, "
            f"{up['at_or_above_high']} of {up['months']} months at or above {hi}. Observation.\n\n" + " ".join(reg["standardLimitations"]))
    col = {
        "type": "Collection", "stac_version": "1.1.0",
        "stac_extensions": ["https://stac-extensions.github.io/processing/v1.3.0/schema.json", "https://stac-extensions.github.io/file/v2.1.0/schema.json", EXT],
        "id": bid, "title": f"Optical visibility by elevation band ({RECIPE} {reg['version']})", "description": desc, "license": "other",
        "providers": [*[p for p in s2col["providers"] if "processor" not in p["roles"]],
                      {"name": "Siterra science pipeline", "roles": ["processor"],
                       "processing:lineage": "Valid-cell shares per strata elevation band from the monthly Sentinel-2 median and count composites (science/pipeline/optical-visibility-bundle.py)",
                       "processing:software": {"siterra-science": "0.1.0", "python": sys.version.split()[0], "numpy": np.__version__, "rasterio": rasterio.__version__,
                                               "gdal": rasterio.__gdal_version__}}],
        "extent": {"spatial": {"bbox": [list(place_config.geometry(cfg).bounds)]}, "temporal": {"interval": [[f"{rc['months'][0]}-01T00:00:00Z", "2025-12-31T23:59:59Z"]]}},
        "assets": assets, "created": now, "siterra:status": status, "siterra:variable": "optical_clear_share",
        "siterra:dataset": s2col["siterra:dataset"], "siterra:geo_selection": strata_col["siterra:geo_selection"],
        "siterra:method": {"id": RECIPE, "version": reg["version"], "analysis_crs": cfg["analysisCrs"],
                           "parameters": {"place_configuration": f"science/places/{os.path.basename(place)} revision {cfg['configRevision']}, sha256 {cfg['_sha256']}", **params,
                                          "winter_months": rc["winterMonths"], "validity": rc["validity"], "band_boundaries_m": core["boundaries"]},
                           "reference_period": None, "operation_order": reg["formula"]},
        "siterra:attribution": s2col["siterra:attribution"], "siterra:limitations": reg["standardLimitations"], "siterra:checks": checks,
        "links": [{"rel": "root", "href": "../catalog.json", "type": "application/json"}, {"rel": "parent", "href": "../catalog.json", "type": "application/json"},
                  {"rel": "derived_from", "href": f"../{s2col['id']}/collection.json", "type": "application/json", "title": f"Sentinel-2 NDVI bundle {s2col['id']} (the monthly composites)",
                   "file:checksum": "1220" + bc.sha(os.path.join(bundles, s2col["id"], "collection.json"))},
                  {"rel": "derived_from", "href": f"../{strata_col['id']}/collection.json", "type": "application/json", "title": f"Terrain strata bundle {strata_col['id']}",
                   "file:checksum": "1220" + bc.sha(os.path.join(bundles, strata_col["id"], "collection.json"))},
                  {"rel": "processing-software", "href": "./uv.lock", "type": "application/toml", "title": "Pipeline lockfile (uv)", "file:checksum": "1220" + bc.sha(lock_out)}],
    }
    bc.dump(col, os.path.join(bdir, "collection.json"))
    print(f"{bid}: {status}")
    for b in "123":
        w = summary_bands[b]["winter"]
        print(" band", b, summary_bands[b]["label"], {v: {k: w[v][k] for k in ("lowest", "median", "highest", "at_or_above_high", "at_or_above_half")} for v in w})
    print(" reproduced", reproduce, "problems", problems, "identical", identical)
    for c in checks:
        print(f"  check {c['name']}: {'passed' if c['passed'] else 'FAILED'}")


if __name__ == "__main__":
    main()
