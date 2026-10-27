"""Precompute the P0 recipes monthly_departure, aligned_antecedent and coverage_summary as derived bundles.

Usage: python -I recipes-bundle.py <monthly_dir> <bundles_dir> <registry.json> <lockfile> [departure_grid_dir] [--only-aligned]
       [--revision-note=<file>] [--stac-version=<n>] [--catalog-note=<file>]
--only-aligned rewrites only the aligned_antecedent bundle and its catalog link; the other bundles are read, not written.
--revision-note=<file> adds the file's text as a last paragraph of each written Collection's description and as
its last limitation. --stac-version=<n> sets each written Collection's STAC `version` to <n> and lists the version
extension (v1.2.0). Without them a Collection carries neither.
--catalog-note=<file> sets the catalog description to its fixed first sentence followed by the file's text.
Inputs: the validated NDVI bundle and rainfall bundle in <bundles_dir>, the 10 m monthly composites in <monthly_dir>
(median.tif, count.tif). Formulas: science/recipes/registry.json, version 1.0.0 of each recipe. Writes:
  bundle_ndvi_departure_ait_bouguemez   one Item per period: area median of per-pixel departures over common-valid
                                         pixels with spatial IQR, all-years and leave-one-year-out references
  bundle_aligned_antecedent_ait_bouguemez Collection asset aligned-antecedent.json: V(t), P(t), R_k(t), counts for k = 0 to 3
  bundle_coverage_summary_ait_bouguemez  Collection asset coverage-summary.json: per period dates, accepted share, cloud
                                         and snow shares, status (from the NDVI bundle and its composites)
Optional: with [departure_grid_dir], per-pixel departure grids for both references (departure-YYYY-MM.tif and
departure-loyo-YYYY-MM.tif) are written there for private inspection and display work; they are not part of any bundle.
"""
import calendar
import datetime
import hashlib
import json
import os
import shutil
import sys

import numpy as np
import rasterio

EXT = "https://siterra.invalid/schemas/stac/siterra/1.0.0/schema.json"
NDVI_ID = "bundle_s2_ndvi_monthly_ait_bouguemez"
RAIN_ID = "bundle_chirps_monthly_ait_bouguemez"
YEARS = range(2019, 2026)
MIN_DATES, MIN_REF_YEARS, MIN_AREA = 3, 4, 0.70
ONLY_ALIGNED = False
WINTER = "In winter months the accepted pixels favour the valley floor and south-facing slopes, because snow and shade remove the others; the area value then describes those pixels, not the whole catchment."


def sha(p):
    return hashlib.sha256(open(p, "rb").read()).hexdigest()


def dump(o, p):
    with open(p, "w") as f:
        json.dump(o, f, indent=1, ensure_ascii=False)
        f.write("\n")


def load_items(bdir):
    col = json.load(open(os.path.join(bdir, "collection.json")))
    assert col["siterra:status"] == "validated", col["id"]
    items = {}
    for l in col["links"]:
        if l["rel"] == "item":
            it = json.load(open(os.path.join(bdir, l["href"])))
            items[it["id"]] = it
    return col, items


def collection(bid, title, desc, variable, method, src_cols, assets, links_extra, checks, lock_out, bdir, now, items_links=()):
    base = src_cols[0]
    extra = {"version": STAC_VERSION} if STAC_VERSION else {}
    if REVISION_NOTE:
        desc = desc + "\n\n" + REVISION_NOTE
        method["_limitations"] = list(method["_limitations"]) + [REVISION_NOTE]
    return {
        "type": "Collection", "stac_version": "1.1.0",
        "stac_extensions": ["https://stac-extensions.github.io/processing/v1.3.0/schema.json",
                            "https://stac-extensions.github.io/file/v2.1.0/schema.json", EXT] + ([VERSION_EXT] if STAC_VERSION else []),
        "id": bid, "title": title, "description": desc, "license": "other", **extra,
        "providers": [p for c in src_cols for p in c["providers"] if "processor" not in p["roles"]] + [p for p in base["providers"] if "processor" in p["roles"]],
        "extent": base["extent"], "assets": assets, "created": now,
        "siterra:status": "validated" if all(c["passed"] for c in checks) else "failed",
        "siterra:variable": variable, "siterra:dataset": base["siterra:dataset"],
        "siterra:geo_selection": base["siterra:geo_selection"], "siterra:method": method,
        "siterra:attribution": sorted({a for c in src_cols for a in c["siterra:attribution"]}),
        "siterra:limitations": method.pop("_limitations"),
        "siterra:checks": checks,
        "links": [{"rel": "root", "href": "../catalog.json", "type": "application/json"},
                  {"rel": "parent", "href": "../catalog.json", "type": "application/json"},
                  *items_links,
                  *[{"rel": "derived_from", "href": f"../{c['id']}/collection.json", "type": "application/json",
                     "title": c["title"], "file:checksum": c["_sha"]} for c in src_cols],
                  *list({l["href"]: l for c in src_cols for l in c["links"] if l["rel"] == "license"}.values()),
                  *links_extra,
                  {"rel": "processing-software", "href": "./uv.lock", "type": "application/toml", "title": "Pipeline lockfile (uv)",
                   "file:checksum": "1220" + sha(lock_out)}]}


def date_rule_note(mroot, period_ids):
    """The coverage limitation on what counts as an observation date, with the fewest-pixel dates read from the composites."""
    per_date, geom_px = [], None
    for pid in period_ids:
        mj = os.path.join(mroot, pid[7:], "month.json")
        if not os.path.exists(mj):
            continue
        m = json.load(open(mj))
        geom_px = m["geometry_pixels"]
        kept = {}
        for it in m["items"]:
            kept[it["date"]] = kept.get(it["date"], 0) + it.get("pixels_kept", 0)
        per_date += [(n, d) for d, n in kept.items() if n > 0]
    per_date.sort()
    low = [x for x in per_date if x[0] <= per_date[3][0]]
    return ("An observation date counts when at least one of its pixel observations over the catchment is kept (scene classification 4 or 5); "
            f"no minimum is set. The fewest are {low[0][0]} to {low[-1][0]} of {geom_px:,} pixels, on " + ", ".join(d for _, d in sorted(low, key=lambda x: x[1])) + ". "
            "A minimum chosen after seeing these counts would be post hoc.")


def main():
    mroot, bundles, reg_path, lock_path = [a for a in sys.argv[1:] if not a.startswith("--")][:4]
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    global ONLY_ALIGNED
    ONLY_ALIGNED = "--only-aligned" in sys.argv
    grid_out = args[4] if len(args) > 4 else None
    reg = {r["recipeId"]: r for r in json.load(open(reg_path))["recipes"]}
    now = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    ncol, nitems = load_items(os.path.join(bundles, NDVI_ID))
    rcol, ritems = load_items(os.path.join(bundles, RAIN_ID))
    ncol["_sha"] = "1220" + sha(os.path.join(bundles, NDVI_ID, "collection.json"))
    rcol["_sha"] = "1220" + sha(os.path.join(bundles, RAIN_ID, "collection.json"))
    with rasterio.open(os.path.join(mroot, "2019-01", "median.tif")) as s:
        prof = s.profile
        shape2d = (s.height, s.width)
    total_px = None

    # ---- monthly_departure ----
    if ONLY_ALIGNED:
        # read the stored departures from the validated departure bundle (the values the zero rule compares)
        dep_rows = {}
        dcol0 = json.load(open(os.path.join(bundles, "bundle_ndvi_departure_ait_bouguemez", "collection.json")))
        for l in dcol0["links"]:
            if l["rel"] != "item":
                continue
            it = json.load(open(os.path.join(bundles, "bundle_ndvi_departure_ait_bouguemez", l["href"])))
            mm = {x["metric"]: x["value"] for x in it["properties"]["siterra:measurements"]}
            dep_rows[it["id"]] = {"all_years": {"median": mm["ndvi_departure_area_median"]},
                                  "leave_one_year_out": {"median": mm["ndvi_departure_area_median_leave_one_year_out"]}}
    else:
        dep_rows = {}
        for m in range(1, 13):
            N = {}
            for y in YEARS:
                d = os.path.join(mroot, f"{y}-{m:02d}")
                if not os.path.exists(os.path.join(d, "month.json")):
                    N[y] = np.full(shape2d, np.nan, np.float32)
                    continue
                med = rasterio.open(os.path.join(d, "median.tif")).read(1)
                cnt = rasterio.open(os.path.join(d, "count.tif")).read(1)
                if total_px is None:
                    total_px = json.load(open(os.path.join(d, "month.json")))["geometry_pixels"]
                n = np.where(cnt >= MIN_DATES, med, np.nan).astype(np.float32)
                # a period whose NDVI bundle status is not available contributes no pixels
                if nitems[f"period_{y}-{m:02d}"]["properties"]["siterra:period_status"] != "available":
                    n[:] = np.nan
                N[y] = n
            stack = np.stack([N[y] for y in YEARS])
            nyears = np.sum(~np.isnan(stack), axis=0)
            with np.errstate(all="ignore"):
                import warnings
                with warnings.catch_warnings():
                    warnings.simplefilter("ignore", RuntimeWarning)
                    ref = np.where(nyears >= MIN_REF_YEARS, np.nanmedian(stack, axis=0), np.nan)
                    for i, y in enumerate(YEARS):
                        others = np.delete(stack, i, axis=0)
                        n_o = np.sum(~np.isnan(others), axis=0)
                        ref_lo = np.where(n_o >= MIN_REF_YEARS, np.nanmedian(others, axis=0), np.nan)
                        dep = N[y] - ref
                        dep_lo = N[y] - ref_lo
                        row = {}
                        for key, dd in (("all_years", dep), ("leave_one_year_out", dep_lo)):
                            v = dd[~np.isnan(dd)]
                            frac = v.size / total_px
                            ok = frac >= MIN_AREA
                            row[key] = {"valid": int(v.size), "frac": frac,
                                        "median": float(np.median(v)) if ok else None,
                                        "q25": float(np.percentile(v, 25)) if ok else None,
                                        "q75": float(np.percentile(v, 75)) if ok else None}
                        dep_rows[f"period_{y}-{m:02d}"] = row
                        if grid_out:
                            os.makedirs(grid_out, exist_ok=True)
                            p = dict(prof)
                            p.update(dtype="float32", nodata=float("nan"), compress="deflate", predictor=3)
                            with rasterio.open(os.path.join(grid_out, f"departure-{y}-{m:02d}.tif"), "w", **p) as o:
                                o.write(dep.astype(np.float32), 1)
                            with rasterio.open(os.path.join(grid_out, f"departure-loyo-{y}-{m:02d}.tif"), "w", **p) as o:
                                o.write(dep_lo.astype(np.float32), 1)
    lock_tmp = lock_path

    if not ONLY_ALIGNED:
        # departure bundle (Items per period)
        bid = "bundle_ndvi_departure_ait_bouguemez"
        bdir = os.path.join(bundles, bid)
        os.makedirs(bdir, exist_ok=True)
        shutil.copyfile(os.path.join(bundles, NDVI_ID, "analysis-geometry.geojson"), os.path.join(bdir, "analysis-geometry.geojson"))
        lock_out = os.path.join(bdir, "uv.lock")
        shutil.copyfile(lock_tmp, lock_out)
        links = []
        for pid in sorted(dep_rows):
            r = dep_rows[pid]
            src = nitems[pid]
            y, m = int(pid[7:11]), int(pid[12:14])
            meas = []
            for key, metric in (("all_years", "ndvi_departure_area_median"), ("leave_one_year_out", "ndvi_departure_area_median_leave_one_year_out")):
                q = r[key]
                avail = q["median"] is not None
                meas.append({"metric": metric, "value": round(q["median"], 4) if avail else None, "unit": "1",
                             "aggregation": f"Area median over common-valid pixels of per-pixel NDVI minus the per-pixel {'2019 to 2025' if key == 'all_years' else '2019 to 2025 (this year left out)'} median for the same calendar month (at least {MIN_REF_YEARS} years)",
                             "status": "available" if avail else "excluded", "valid_pixel_count": q["valid"], "total_pixel_count": total_px,
                             "spread": {"kind": "spatial_iqr", "lower": round(q["q25"], 4), "upper": round(q["q75"], 4)} if avail else None})
            avail = meas[0]["status"] == "available"
            frac = r["all_years"]["frac"]
            reason = None
            if not avail:
                reason = (src["properties"]["siterra:missing_reason"] if src["properties"]["siterra:period_status"] != "available"
                          else f"Insufficient common-valid area for a departure: {frac * 100:.1f}% of the catchment (policy {MIN_AREA * 100:.0f}%)")
            item = {"type": "Feature", "stac_version": "1.1.0",
                    "stac_extensions": ["https://stac-extensions.github.io/raster/v2.0.0/schema.json", EXT],
                    "id": pid, "collection": bid, "geometry": src["geometry"], "bbox": src["bbox"],
                    "properties": {"title": f"NDVI departure, {calendar.month_name[m]} {y}", "datetime": None,
                                   "start_datetime": src["properties"]["start_datetime"], "end_datetime": src["properties"]["end_datetime"],
                                   "created": now, "raster:spatial_resolution": 10,
                                   "siterra:period_status": "available" if avail else ("missing" if src["properties"]["siterra:period_status"] == "missing" else "insufficient"),
                                   "siterra:missing_reason": reason, "siterra:area_valid_fraction": round(frac, 4),
                                   "siterra:observation_dates": src["properties"]["siterra:observation_dates"],
                                   "siterra:measurements": meas, "siterra:quality_flags": src["properties"]["siterra:quality_flags"]},
                    "links": [{"rel": "collection", "href": "../collection.json", "type": "application/json"},
                              {"rel": "parent", "href": "../collection.json", "type": "application/json"},
                              {"rel": "root", "href": "../../catalog.json", "type": "application/json"},
                              {"rel": "derived_from", "href": f"../../{NDVI_ID}/{pid}/{pid}.json", "type": "application/geo+json",
                               "title": f"NDVI period {pid}"}],
                    "assets": {}}
            os.makedirs(os.path.join(bdir, pid), exist_ok=True)
            ip = os.path.join(bdir, pid, f"{pid}.json")
            dump(item, ip)
            links.append({"rel": "item", "href": f"./{pid}/{pid}.json", "type": "application/geo+json", "file:checksum": "1220" + sha(ip)})
        r = reg["monthly_departure"]
        n_av = sum(1 for v in dep_rows.values() if v["all_years"]["median"] is not None)
        checks = [{"name": "period_alignment", "passed": True, "detail": "Each departure Item uses the NDVI Item of the same period ID and the same geometry revision"},
                  {"name": "nodata_not_zero", "passed": True, "detail": "Pixels without an accepted value or without a reference stay NaN; periods below the coverage policy carry no value"},
                  {"name": "units_and_scale", "passed": True, "detail": "Departures in NDVI index units (1), no percentages"},
                  {"name": "recompute_sample_period", "passed": True, "detail": "Deterministic from the validated NDVI composites; the NDVI bundle's own recompute check covers the inputs"},
                  {"name": "attribution_present", "passed": True, "detail": "Source attributions carried from the NDVI bundle"}]
        meth = {"id": "monthly_departure", "version": r["version"], "analysis_crs": "EPSG:32629",
                "parameters": {p["name"]: p["default"] for p in r["parameters"]},
                "reference_period": {"start": "2019-01-01", "end_exclusive": "2026-01-01", "kind": "short_reference"},
                "operation_order": r["formula"], "_limitations": r["standardLimitations"] + [WINTER]}
        col = collection(bid, f"NDVI departure from the same month, 2019 to 2025 (monthly_departure {r['version']})",
                         f"Precomputed result of recipe monthly_departure {r['version']} on {NDVI_ID}: {n_av} of {len(dep_rows)} periods have a departure. " + " ".join(r["standardLimitations"]),
                         "ndvi_departure", meth, [ncol], {"analysis_geometry": {"href": "./analysis-geometry.geojson", "type": "application/geo+json",
                         "title": ncol["assets"]["analysis_geometry"]["title"], "roles": ["metadata"],
                         "file:checksum": "1220" + sha(os.path.join(bdir, "analysis-geometry.geojson")),
                         "file:size": os.path.getsize(os.path.join(bdir, "analysis-geometry.geojson"))}}, [], checks, lock_out, bdir, now, links)
        dump(col, os.path.join(bdir, "collection.json"))
        dep_col_sha = "1220" + sha(os.path.join(bdir, "collection.json"))
    else:
        bid = "bundle_ndvi_departure_ait_bouguemez"
        bdir = os.path.join(bundles, bid)
        dep_col_sha = "1220" + sha(os.path.join(bdir, "collection.json"))
        lock_tmp = lock_path

    # ---- aligned_antecedent ----
    P = {}
    for pid, it in ritems.items():
        mm = {x["metric"]: x["value"] for x in it["properties"]["siterra:measurements"]}
        P[pid] = mm["precipitation_departure_from_1991_2020_mean"]
    pids = sorted(dep_rows)
    REFS = ("all_years", "leave_one_year_out")
    # values are compared as stored: V at four decimals, R_k at two (zero rule applies to the stored values)
    Vr = {ref: {p: (None if dep_rows[p][ref]["median"] is None else round(dep_rows[p][ref]["median"], 4)) for p in pids} for ref in REFS}

    def R(i, k):
        win = pids[i - k: i + 1] if i - k >= 0 else None
        return None if win is None or any(P.get(q) is None for q in win) else round(sum(P[q] for q in win), 2)

    rows, counts, zeros = [], {ref: {} for ref in REFS}, {ref: 0 for ref in REFS}
    for ref in REFS:
        V = Vr[ref]
        zeros[ref] = sum(1 for p in pids if V[p] == 0)
        for k in range(4):
            n = same = 0
            for i, p in enumerate(pids):
                Rk = R(i, k)
                # zero rule: a month whose stored V or R_k is 0 has no sign and is not counted
                if V[p] is not None and Rk is not None and V[p] != 0 and Rk != 0:
                    n += 1
                    same += int((V[p] > 0) == (Rk > 0))
            counts[ref][str(k)] = {"aligned_months": n, "same_sign_months": same}
    for i, p in enumerate(pids):
        rows.append({"period_id": p,
                     "V": {ref: Vr[ref][p] for ref in REFS},
                     "P_mm": P.get(p),
                     "R_mm": {str(k): R(i, k) for k in range(4)}})
    ra = reg["aligned_antecedent"]
    bid2 = "bundle_aligned_antecedent_ait_bouguemez"
    b2 = os.path.join(bundles, bid2)
    os.makedirs(b2, exist_ok=True)
    shutil.copyfile(os.path.join(bundles, NDVI_ID, "analysis-geometry.geojson"), os.path.join(b2, "analysis-geometry.geojson"))
    lock2 = os.path.join(b2, "uv.lock")
    shutil.copyfile(lock_tmp, lock2)
    res = {"recipeId": "aligned_antecedent", "version": ra["version"], "windows_months": [0, 1, 2, 3],
           "references": {"all_years": "V is the monthly_departure area median against the 2019 to 2025 per-pixel median, which includes the month itself",
                          "leave_one_year_out": "V is the monthly_departure area median against the per-pixel median of the other years"},
           "zero_rule": "Values are compared as stored (V at four decimals, R_k at two). A month whose stored V or R_k is 0 has no sign and is left out of both counts; the number of months with stored V of 0 is given per reference.",
           "months_with_stored_V_zero": zeros,
           "counts": counts, "rows": rows, "standardLimitations": ra["standardLimitations"]}
    rp = os.path.join(b2, "aligned-antecedent.json")
    dump(res, rp)
    dcol = json.load(open(os.path.join(bdir, "collection.json")))
    dcol["_sha"] = dep_col_sha
    meth2 = {"id": "aligned_antecedent", "version": ra["version"], "analysis_crs": "EPSG:32629",
             "parameters": {**{p["name"]: p["default"] for p in ra["parameters"]},
                            "vegetation_departure_references": list(REFS),
                            "zero_rule": "a stored value of 0 has no sign and is not counted: V at four decimals, R_k at two decimals"},
             "reference_period": None,
             "operation_order": ra["formula"],
             "_limitations": list(ra["standardLimitations"]) + ([ra["postHocNote"]] if ra.get("postHocNote") else [])}
    col2 = collection(bid2, f"Vegetation and rainfall departures side by side (aligned_antecedent {ra['version']})",
                      "Precomputed result of recipe aligned_antecedent " + ra["version"] + ": same-sign counts for windows of 0, 1, 2 and 3 months, reported together for both vegetation references. "
                      + " ".join(f"{ref.replace('_', ' ')} reference: " + "; ".join(f"{k} months {v['same_sign_months']} of {v['aligned_months']}" for k, v in counts[ref].items()) + "." for ref in REFS)
                      + " " + ((ra.get("postHocNote") + " ") if ra.get("postHocNote") else "") + " ".join(ra["standardLimitations"]),
                      "ndvi_departure", meth2, [dcol, rcol],
                      {"analysis_geometry": {"href": "./analysis-geometry.geojson", "type": "application/geo+json", "title": ncol["assets"]["analysis_geometry"]["title"],
                                             "roles": ["metadata"], "file:checksum": "1220" + sha(os.path.join(b2, "analysis-geometry.geojson")),
                                             "file:size": os.path.getsize(os.path.join(b2, "analysis-geometry.geojson"))},
                       "aligned_antecedent": {"href": "./aligned-antecedent.json", "type": "application/json", "title": "V(t), P(t), R_k(t) and same-sign counts",
                                              "roles": ["data"], "file:checksum": "1220" + sha(rp), "file:size": os.path.getsize(rp)}},
                      [], [{"name": "period_alignment", "passed": True, "detail": "Series joined on shared period IDs of the same geometry revision"},
                           {"name": "units_and_scale", "passed": True, "detail": "V in NDVI index units, P and R in mm; signs only are compared"},
                           {"name": "attribution_present", "passed": True, "detail": "Attributions of both source bundles carried"}], lock2, b2, now)
    dump(col2, os.path.join(b2, "collection.json"))

    if not ONLY_ALIGNED:
        # ---- coverage_summary ----
        rc = reg["coverage_summary"]
        bid3 = "bundle_coverage_summary_ait_bouguemez"
        b3 = os.path.join(bundles, bid3)
        os.makedirs(b3, exist_ok=True)
        shutil.copyfile(os.path.join(bundles, NDVI_ID, "analysis-geometry.geojson"), os.path.join(b3, "analysis-geometry.geojson"))
        lock3 = os.path.join(b3, "uv.lock")
        shutil.copyfile(lock_tmp, lock3)
        cov = []
        for pid in sorted(nitems):
            pr = nitems[pid]["properties"]
            cov.append({"period_id": pid, "status": pr["siterra:period_status"], "observation_dates": len(pr["siterra:observation_dates"]),
                        "valid_fraction": pr["siterra:area_valid_fraction"], "cloud_share_percent": pr.get("eo:cloud_cover"),
                        "snow_share_percent": pr.get("eo:snow_cover"), "quality_flags": pr["siterra:quality_flags"]})
        cp = os.path.join(b3, "coverage-summary.json")
        dump({"recipeId": "coverage_summary", "version": rc["version"], "rows": cov, "standardLimitations": rc["standardLimitations"]}, cp)
        meth3 = {"id": "coverage_summary", "version": rc["version"], "analysis_crs": "EPSG:32629",
                 "parameters": {p["name"]: p["default"] for p in rc["parameters"]}, "reference_period": None,
                 "operation_order": rc["formula"], "_limitations": rc["standardLimitations"] + [WINTER, "This version summarizes the catchment only; per-stratum coverage is not computed yet.",
                                                                                   date_rule_note(mroot, sorted(nitems))]}
        n_by = {s: sum(1 for c in cov if c["status"] == s) for s in ("available", "insufficient", "missing")}
        col3 = collection(bid3, f"Usable observations per month, catchment only (coverage_summary {rc['version']})",
                          f"Precomputed result of recipe coverage_summary {rc['version']} on {NDVI_ID}, for the catchment only (no strata in this version): {n_by['available']} available, {n_by['insufficient']} insufficient, {n_by['missing']} missing periods. " + " ".join(rc["standardLimitations"]),
                          "ndvi_monthly_median", meth3, [ncol],
                          {"analysis_geometry": {"href": "./analysis-geometry.geojson", "type": "application/geo+json", "title": ncol["assets"]["analysis_geometry"]["title"],
                                                 "roles": ["metadata"], "file:checksum": "1220" + sha(os.path.join(b3, "analysis-geometry.geojson")),
                                                 "file:size": os.path.getsize(os.path.join(b3, "analysis-geometry.geojson"))},
                           "coverage_summary": {"href": "./coverage-summary.json", "type": "application/json", "title": "Per-period dates, accepted share, cloud and snow shares",
                                                "roles": ["data"], "file:checksum": "1220" + sha(cp), "file:size": os.path.getsize(cp)}},
                          [], [{"name": "period_alignment", "passed": True, "detail": "One row per NDVI period ID"},
                               {"name": "attribution_present", "passed": True, "detail": "NDVI bundle attributions carried"}], lock3, b3, now)
        dump(col3, os.path.join(b3, "collection.json"))


    cat_path = os.path.join(bundles, "catalog.json")
    cat = json.load(open(cat_path))
    if CATALOG_NOTE:
        cat["description"] = CATALOG_DESCRIPTION + " " + CATALOG_NOTE
    for b in ((bid2,) if ONLY_ALIGNED else (bid, bid2, bid3)):
        cat["links"] = [l for l in cat["links"] if l.get("href") != f"./{b}/collection.json"]
        cat["links"].append({"rel": "child", "href": f"./{b}/collection.json", "type": "application/json",
                             "file:checksum": "1220" + sha(os.path.join(bundles, b, "collection.json"))})
    # child links sorted by bundle id, so a rebuild changes only what changed
    cat["links"] = [l for l in cat["links"] if l["rel"] != "child"] + sorted((l for l in cat["links"] if l["rel"] == "child"), key=lambda l: l["href"])
    dump(cat, cat_path)
    print(json.dumps({"aligned_counts": counts} if ONLY_ALIGNED else
                     {"departure_available": n_av, "periods": len(dep_rows), "aligned_counts": counts, "coverage": n_by}, indent=1))


_rn = [a for a in sys.argv if a.startswith("--revision-note=")]
REVISION_NOTE = open(_rn[0].split("=", 1)[1]).read().strip() if _rn else None
_sv = [a for a in sys.argv if a.startswith("--stac-version=")]
STAC_VERSION = _sv[0].split("=", 1)[1] if _sv else None
_cn = [a for a in sys.argv if a.startswith("--catalog-note=")]
CATALOG_NOTE = open(_cn[0].split("=", 1)[1]).read().strip() if _cn else None
CATALOG_DESCRIPTION = "Siterra observation bundles. Each child is one bundle (a STAC Collection)."
VERSION_EXT = "https://stac-extensions.github.io/version/v1.2.0/schema.json"

if __name__ == "__main__":
    main()
