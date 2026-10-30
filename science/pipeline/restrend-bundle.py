"""Precompute restrend_long_record for a place and write it as a derived bundle (STAC Collection with one JSON result).

Usage: python -I restrend-bundle.py <place.json> <repo_root> <modis_raw_dir> <chirps_raw_dir> <registry.json> <lockfile>
       <bundles_dir> [--access-date=YYYY-MM-DD]
  modis_raw_dir   the modis-13Q1-061 folder written by modis-fetch.py (search record, item JSON, windows, sidecars)
  chirps_raw_dir  the CHIRPS v3.0 monthly window JSON files written by chirps_fetch.py
  bundles_dir     the bundle folder holding the place's rainfall and strata bundles; the new bundle is written there

Every place-specific value (geometry, strata, windows, seasons) comes from the place configuration; the formula and
thresholds are those of registry entry restrend_long_record. Writes bundle_restrend_long_record_<placeId>:
  collection.json             manifest with checks, attribution, licences and provenance
  restrend-long-record.json   the compact summary read by read_recipe_result (first JSON data asset): every stratum and
                              window pair of the primary reliability set, with slopes, intervals, directions and statuses
  restrend-long-record-tables.json  every season value, window rainfall, residual and fit, both reliability sets
  analysis-geometry.geojson   the frozen geometry; uv.lock the pipeline lockfile
The catalog is not changed. The script prints a short summary of statuses and checks, not the slopes.
"""
import calendar
import datetime
import json
import os
import shutil
import sys

import numpy as np
import rasterio

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import modis_record  # noqa: E402
import place_config  # noqa: E402
import restrend_rerun  # noqa: E402
import trend_stats as ts  # noqa: E402
from modis_ndvi import (MODIS_CITATION, NDVI_ASSET, REL_ASSET, calendar_periods, grid_of, load_modis,  # noqa: E402
                        read_windows, season_ndvi)

RECIPE = "restrend_long_record"
EXT = "https://siterra.invalid/schemas/stac/siterra/1.1.0/schema.json"
RELIABILITY_SETS = {"reliability_0_1": [0, 1], "reliability_0": [0]}
PRIMARY_RELIABILITY = "reliability_0_1"
NDVI_DECIMALS, RAIN_DECIMALS = 5, 2
RAIN_CROSSCHECK_TOL = 0.02
RERUN_TOL_NDVI, RERUN_TOL_COVERAGE = 1e-4, 1e-3


def sha(p):
    return place_config.sha256(p)


def dump(o, p):
    with open(p, "w") as f:
        json.dump(o, f, indent=1, ensure_ascii=False)
        f.write("\n")


def window_months(rw, year):
    """(year, month) pairs of a rainfall window that ends in season year."""
    y, m = year + rw["start"]["yearOffset"], rw["start"]["month"]
    y1, m1 = year + rw["end"]["yearOffset"], rw["end"]["month"]
    out = []
    while (y, m) <= (y1, m1):
        out.append((y, m))
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)
    return out


def month_name(m):
    return calendar.month_name[m]


def chirps_months(chirps_dir, cfg, months):
    out, meta = {}, None
    rw = cfg["rainfall"]["rawWindow"]
    for y, m in months:
        p = os.path.join(chirps_dir, f"chirps-v3.0.{y}.{m:02d}.cog.window.json")
        if not os.path.exists(p):
            out[(y, m)] = None
            continue
        d = json.load(open(p))
        w = d["window"]
        if (w["row0"], w["row1"], w["col0"], w["col1"]) != (rw["row0"], rw["row1"], rw["col0"], rw["col1"]):
            raise SystemExit(f"CHIRPS window of {y}-{m:02d} differs from the place configuration")
        v = np.asarray(w["values"], np.float64)
        out[(y, m)] = v
        meta = w
    return out, meta


def fit_pair(years, Y, P, level):
    fit = ts.ols(P, Y, level)
    res = [round(e, 10) for e in fit["residuals"]]
    trend = ts.ols(years, res, level)
    ar1 = ts.ar1_adjusted(trend, years, level)
    sen = ts.theil_sen(years, res)
    raw = ts.ols(years, Y, level)
    rain = ts.ols(years, P, level)
    precondition_met = fit["lower"] > 0
    return {
        "status": "computed" if precondition_met else "precondition_not_met",
        "n": len(years), "seasons": years,
        "rainfall_fit": {"intercept": fit["a"], "slope_per_mm": fit["b"], "slope_per_100_mm": fit["b"] * 100,
                         "lower": fit["lower"], "upper": fit["upper"], "level": level, "df": fit["df"],
                         "r_squared": fit["r_squared"], "interval_above_zero": precondition_met},
        "residuals": [{"year": y, "residual": round(e, NDVI_DECIMALS + 1)} for y, e in zip(years, fit["residuals"])],
        "residual_trend": {"slope_per_year": trend["b"], "slope_per_decade": trend["b"] * 10, "lower": trend["lower"],
                           "upper": trend["upper"], "level": level, "df": trend["df"],
                           "direction": ts.direction(trend["lower"], trend["upper"])},
        "residual_trend_autocorrelation_adjusted": {**{k: ar1[k] for k in ("r1", "adjacent_pairs", "n_eff", "status")},
                                                    "lower": ar1.get("lower"), "upper": ar1.get("upper"),
                                                    "direction": ts.direction(ar1.get("lower"), ar1.get("upper"))},
        "residual_trend_theil_sen": {**sen, "direction": ts.direction(sen["lower"], sen["upper"])},
        "unadjusted_ndvi_trend": {"slope_per_year": raw["b"], "lower": raw["lower"], "upper": raw["upper"],
                                  "direction": ts.direction(raw["lower"], raw["upper"])},
        "rainfall_trend": {"slope_mm_per_year": rain["b"], "lower": rain["lower"], "upper": rain["upper"],
                           "direction": ts.direction(rain["lower"], rain["upper"])},
    }


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    place, repo, raw, chirps_dir, reg_path, lock_path, bundles = args[:7]
    access = next((a.split("=", 1)[1] for a in sys.argv if a.startswith("--access-date=")), None)
    cfg = place_config.load(place, repo)
    rc = cfg["recipes"][RECIPE]
    reg = {r["recipeId"]: r for r in json.load(open(reg_path))["recipes"]}[RECIPE]
    par = {p["name"]: p["default"] for p in reg["parameters"]}
    kept_default, min_share = par["pixel_reliability_kept"], par["min_composite_share"]
    min_area, min_seasons, level = par["min_area_coverage"], par["min_seasons"], par["interval_level"]
    assert kept_default == RELIABILITY_SETS[PRIMARY_RELIABILITY]
    years = list(range(rc["seasonYears"][0], rc["seasonYears"][1] + 1))
    gws, rws = rc["growingWindows"], rc["rainfallWindows"]
    gw_primary = next(w["id"] for w in gws if w.get("primary"))
    rw_primary = next(w["id"] for w in rws if w.get("primary"))
    now = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    # strata and weights
    masks = place_config.stratum_masks(cfg, rc["strata"])
    labels = place_config.stratum_labels(cfg)
    strata_layer = {"catchment": "catchment"}
    for lay in cfg["strata"]["layers"]:
        for sid in lay["classes"].values():
            strata_layer[sid] = lay["name"]
    rec, rec_name, sidecars = load_modis(raw)
    mtr, mshape, mcrs = grid_of(sidecars)
    w_modis = place_config.pixel_weights(cfg, masks, mcrs, mtr, mshape)
    arrays, scales = read_windows(raw, sidecars)
    _, chirps_meta = chirps_months(chirps_dir, cfg, [(2000, 1)])
    ctr = rasterio.Affine(chirps_meta["cell_deg"], 0, chirps_meta["west"], 0, -chirps_meta["cell_deg"], chirps_meta["north"])
    cshape = (chirps_meta["row1"] - chirps_meta["row0"] + 1, chirps_meta["col1"] - chirps_meta["col0"] + 1)
    w_rain = place_config.pixel_weights(cfg, masks, "EPSG:4326", ctr, cshape)

    # growing-season greenness per stratum, window, reliability set
    composites, seasons = [], []
    Ytab = {}
    for gw in gws:
        for y in years:
            periods = calendar_periods(y, gw["months"])
            missing = [k for k, _ in periods if k not in arrays]
            composites.append({"growing_window": gw["id"], "year": y, "periods": [d for _, d in periods],
                               "absent_on_planetary_computer": [d for k, d in periods if k in missing],
                               "absent_keys": missing})
            for rel, kept in RELIABILITY_SETS.items():
                G = season_ndvi(arrays, periods, kept, min_share)
                for sid, w in w_modis.items():
                    tot = w.sum()
                    if G is None:
                        cov, val = 0.0, None
                    else:
                        ok = ~np.isnan(G) & (w > 0)
                        cov = float(w[ok].sum() / tot)
                        val = round(float((w[ok] * G[ok]).sum() / w[ok].sum()), NDVI_DECIMALS) if cov >= min_area else None
                    Ytab[(sid, gw["id"], rel, y)] = val
                    seasons.append({"stratum": sid, "growing_window": gw["id"], "reliability": rel, "year": y,
                                    "ndvi": val, "area_coverage": round(cov, 4),
                                    "status": "available" if val is not None else "withheld_low_coverage"})

    # window rainfall per stratum
    need_months = sorted({ym for rw in rws for y in years for ym in window_months(rw, y)})
    rain, _ = chirps_months(chirps_dir, cfg, need_months)
    Ptab, rainfall = {}, []
    for rw in rws:
        for y in years:
            ms = window_months(rw, y)
            for sid, w in w_rain.items():
                vals = [rain[ym] for ym in ms]
                if any(v is None or (w > 0).any() and (v[w > 0] < 0).any() for v in vals):
                    val = None
                else:
                    val = round(float(sum((w * v).sum() for v in vals) / w.sum()), RAIN_DECIMALS)
                Ptab[(sid, rw["id"], y)] = val
                rainfall.append({"stratum": sid, "rainfall_window": rw["id"], "year": y, "rainfall_mm": val,
                                 "months": [f"{a}-{b:02d}" for a, b in ms]})

    # fits
    results = []
    for sid in masks:
        for gw in gws:
            for rw in rws:
                for rel in RELIABILITY_SETS:
                    yrs = [y for y in years if Ytab[(sid, gw["id"], rel, y)] is not None and Ptab[(sid, rw["id"], y)] is not None]
                    base = {"stratum": sid, "stratum_layer": strata_layer[sid], "growing_window": gw["id"],
                            "rainfall_window": rw["id"], "reliability": rel,
                            "primary": gw["id"] == gw_primary and rw["id"] == rw_primary and rel == PRIMARY_RELIABILITY}
                    if len(yrs) < min_seasons:
                        results.append({**base, "status": "insufficient_seasons", "n": len(yrs), "seasons": yrs})
                        continue
                    Y = [Ytab[(sid, gw["id"], rel, y)] for y in yrs]
                    P = [Ptab[(sid, rw["id"], y)] for y in yrs]
                    results.append({**base, **fit_pair(yrs, Y, P, level)})

    # checks
    rain_col_dir = os.path.join(bundles, cfg["rainfall"]["monthlyBundle"])
    cells = json.load(open(os.path.join(rain_col_dir, "rainfall-cells.geojson")))["features"]
    worst = 0.0
    for rw in rws:
        for y in years:
            ms = window_months(rw, y)
            pub = sum(sum(c["properties"]["weight"] * rain[ym][c["properties"]["grid_row"] - chirps_meta["row0"],
                                                               c["properties"]["grid_col"] - chirps_meta["col0"]]
                          for c in cells) for ym in ms)
            mine = Ptab[("catchment", rw["id"], y)]
            worst = max(worst, abs(mine - pub) / pub)
    rain_ok = worst <= RAIN_CROSSCHECK_TOL

    rerun_year = years[-1]
    gwp = next(w for w in gws if w["id"] == gw_primary)
    periods = calendar_periods(rerun_year, gwp["months"])
    rr = restrend_rerun.rerun_season(cfg, sidecars, [(d, sidecars.get(k)) for k, d in periods], masks["catchment"],
                                     RELIABILITY_SETS[PRIMARY_RELIABILITY], min_share, NDVI_ASSET, REL_ASSET)
    stored = next(s for s in seasons if s["stratum"] == "catchment" and s["growing_window"] == gw_primary
                  and s["reliability"] == PRIMARY_RELIABILITY and s["year"] == rerun_year)
    reads_ok = all(r["ndvi_window_identical"] and r["reliability_window_identical"] for r in rr["reads"])
    val_ok = stored["ndvi"] is not None and rr["value"] is not None and abs(rr["value"] - stored["ndvi"]) <= RERUN_TOL_NDVI
    cov_ok = abs(rr["coverage"] - stored["area_coverage"]) <= RERUN_TOL_COVERAGE
    rel_encodings = {("int16", -3000.0, 10000.0, "uint8", 255.0), ("int16", -3000.0, 10000.0, "int8", -1.0)}
    scale_ok = bool(scales) and scales <= rel_encodings
    n_int8 = sum(1 for s in sidecars.values() if s["assets"][REL_ASSET]["dtype"] == "int8")
    item_scales = set()
    for iid in rec["kept"]:
        it = json.load(open(os.path.join(raw, "items", iid + ".json")))
        item_scales.add(it["assets"][NDVI_ASSET]["raster:bands"][0].get("scale"))
    scale_ok = scale_ok and item_scales == {0.0001}
    gaps = modis_record.archive_gaps(raw, rec_name, rec)
    absent_all = sorted({k for c in composites for k in c.pop("absent_keys")})

    rerun_detail = (f"Season {rerun_year} ({gw_primary}, catchment) rerun independently: {len(rr['reads'])} composites read again from "
                    f"Planetary Computer with a fresh token; windows identical to the stored ones: {reads_ok}. Season mean resampled "
                    f"to the 10 m analysis grid by nearest neighbour and averaged over the catchment cells: {rr['value']:.6f} against "
                    f"the stored {stored['ndvi']:.5f} (tolerance {RERUN_TOL_NDVI}); coverage {rr['coverage']:.4f} against "
                    f"{stored['area_coverage']:.4f} (tolerance {RERUN_TOL_COVERAGE}). Rainfall: catchment window totals from 10 m cell "
                    f"weights against the published area weights of {cfg['rainfall']['monthlyBundle']} (rainfall-cells.geojson), "
                    f"largest relative difference {worst * 100:.4f}% over every window and season (tolerance {RAIN_CROSSCHECK_TOL * 100:.0f}%).")
    checks = [
        {"name": "recompute_sample_period", "passed": bool(reads_ok and val_ok and cov_ok and rain_ok), "detail": rerun_detail},
        {"name": "nodata_not_zero", "passed": True,
         "detail": f"NDVI fill (-3000) and values outside -0.2 to 1.0 are not observed; pixel reliability other than "
                   f"{RELIABILITY_SETS[PRIMARY_RELIABILITY]} (primary) or [0] (sensitivity), including fill 255, is not observed; "
                   f"a composite period absent from Planetary Computer counts as nothing kept. A missing CHIRPS month or cell leaves the "
                   f"window total undefined."},
        {"name": "units_and_scale", "passed": bool(scale_ok),
         "detail": "Every stored NDVI window is int16 with nodata -3000 and GDAL scale 10000 (physical value = DN / 10000), and every "
                   f"item's raster:bands scale is 0.0001. Pixel reliability windows are uint8 with nodata 255, except {n_int8} stored "
                   "as int8 with nodata -1 (the product's own fill); classes 0 to 3 mean the same in both, and only listed classes "
                   "are kept. Rainfall in mm per window."},
        {"name": "qa_join_coverage", "passed": True,
         "detail": f"All {len(sidecars)} composites share one window grid for NDVI and pixel reliability ({mshape[1]} x {mshape[0]} "
                   f"pixels); stratum weights count 10 m analysis cells per MODIS pixel and per CHIRPS cell. In the registered "
                   f"growing windows: " + modis_record.gap_sentence(absent_all, gaps, "composite period")},
        {"name": "period_alignment", "passed": True,
         "detail": "A composite belongs to a season when its 16-day period starts in a month of the growing window of that year; "
                   "rainfall windows end in the season's year as configured (start and end month with year offsets)."},
        {"name": "attribution_present", "passed": True,
         "detail": "MOD13Q1 v6.1 citation with DOI, subset and access date, the CHIRPS v3.0 attribution and the Copernicus DEM notices are in siterra:attribution"},
    ]

    # output
    bid = f"bundle_restrend_long_record_{cfg['placeId']}"
    bdir = os.path.join(bundles, bid)
    os.makedirs(bdir, exist_ok=True)
    strata_col = json.load(open(os.path.join(bundles, cfg["strata"]["bundle"], "collection.json")))
    rain_col = json.load(open(os.path.join(rain_col_dir, "collection.json")))
    first_item = min(rec["kept"])
    last_item = max(rec["kept"])
    access = access or rec["searched_at"][:10]
    headline = {}
    for r in results:
        if r["primary"]:
            headline[r["stratum"]] = {k: r.get(k) for k in ("status", "n")}
            if r["status"] != "insufficient_seasons":
                headline[r["stratum"]].update(
                    residual_trend_per_decade=r["residual_trend"]["slope_per_decade"],
                    lower_per_decade=r["residual_trend"]["lower"] * 10, upper_per_decade=r["residual_trend"]["upper"] * 10,
                    direction=r["residual_trend"]["direction"],
                    rainfall_slope_per_100_mm=r["rainfall_fit"]["slope_per_100_mm"],
                    rainfall_slope_interval_per_100_mm=[r["rainfall_fit"]["lower"] * 100, r["rainfall_fit"]["upper"] * 100],
                    rainfall_fit_r_squared=r["rainfall_fit"]["r_squared"],
                    unadjusted_trend_per_decade=[r["unadjusted_ndvi_trend"]["slope_per_year"] * 10,
                                                 r["unadjusted_ndvi_trend"]["lower"] * 10, r["unadjusted_ndvi_trend"]["upper"] * 10],
                    unadjusted_direction=r["unadjusted_ndvi_trend"]["direction"],
                    rainfall_trend_mm_per_decade=[r["rainfall_trend"]["slope_mm_per_year"] * 10,
                                                  r["rainfall_trend"]["lower"] * 10, r["rainfall_trend"]["upper"] * 10],
                    rainfall_trend_direction=r["rainfall_trend"]["direction"])
    def r5(x):
        return None if x is None else round(x, 5)

    compact = []
    sens = []
    for r in results:
        row = {"stratum": r["stratum"], "growing_window": r["growing_window"], "rainfall_window": r["rainfall_window"],
               "primary": r["primary"], "status": r["status"], "n": r["n"]}
        if r["status"] != "insufficient_seasons":
            rf, rt = r["rainfall_fit"], r["residual_trend"]
            ar, sn = r["residual_trend_autocorrelation_adjusted"], r["residual_trend_theil_sen"]
            row.update(
                rainfall_slope_per_100_mm=[r5(rf["slope_per_100_mm"]), r5(rf["lower"] * 100), r5(rf["upper"] * 100)],
                r_squared=r5(rf["r_squared"]),
                residual_trend_per_decade=[r5(rt["slope_per_year"] * 10), r5(rt["lower"] * 10), r5(rt["upper"] * 10)],
                direction=rt["direction"],
                autocorrelation_adjusted_per_decade=[r5(ar["lower"] * 10) if ar["lower"] is not None else None,
                                                     r5(ar["upper"] * 10) if ar["upper"] is not None else None],
                autocorrelation_adjusted_direction=ar["direction"], n_eff=r5(ar["n_eff"]),
                theil_sen_per_decade=[r5(sn["slope"] * 10), r5(sn["lower"] * 10), r5(sn["upper"] * 10)],
                theil_sen_direction=sn["direction"],
                unadjusted_ndvi_trend_direction=r["unadjusted_ndvi_trend"]["direction"],
                rainfall_trend_direction=r["rainfall_trend"]["direction"])
        if r["reliability"] == PRIMARY_RELIABILITY:
            compact.append(row)
        else:
            sens.append({k: row.get(k) for k in ("stratum", "growing_window", "rainfall_window", "status", "n", "direction")})
    tables_name = "restrend-long-record-tables.json"
    summary_out = {
        "recipeId": RECIPE, "version": reg["version"], "computed": now,
        "place": {"placeId": cfg["placeId"], "configRevision": cfg["configRevision"]},
        "claim_kind": "model_estimate",
        "native_resolution": {"ndvi": "250 m MODIS (MOD13Q1 v6.1), 16-day composites", "rainfall": "0.05 degree CHIRPS v3.0"},
        "period": {"first_season": years[0], "last_season": years[-1]},
        "units": {"rainfall_slope_per_100_mm": "NDVI per 100 mm, [estimate, lower, upper], 95% interval",
                  "residual_trend_per_decade": "NDVI per decade, [estimate, lower, upper], 95% t interval",
                  "autocorrelation_adjusted_per_decade": "NDVI per decade, [lower, upper], effective sample size interval",
                  "theil_sen_per_decade": "NDVI per decade, [estimate, lower, upper], Sen's 95% interval"},
        "status_meanings": {"computed": "rainfall slope interval entirely above zero; the residual trend is rainfall-adjusted",
                            "precondition_not_met": "rainfall slope interval not entirely above zero; the residual trend is stored but is not described as rainfall-adjusted",
                            "insufficient_seasons": f"fewer than {min_seasons} seasons with both values; no slope"},
        "direction_meanings": {"upward": "interval entirely above zero", "downward": "interval entirely below zero",
                               "includes_zero": "interval includes zero; no direction is stated"},
        "primary": {"growing_window": gw_primary, "rainfall_window": rw_primary, "reliability": PRIMARY_RELIABILITY},
        "windows": None, "strata": None, "headline": headline,
        "results": compact,
        "sensitivity_reliability_0": sens,
        "composites_absent_on_planetary_computer": [c for c in composites if c["absent_on_planetary_computer"]],
        "archive_gaps": modis_record.gap_sentence(absent_all, gaps, "composite period"),
        "full_tables": tables_name,
        "limitations": reg["standardLimitations"],
    }
    result = {
        "recipeId": RECIPE, "version": reg["version"], "computed": now,
        "place": {"placeId": cfg["placeId"], "configRevision": cfg["configRevision"], "config_sha256": cfg["_sha256"]},
        "claim_kind": {"fits_and_trends": "model_estimate", "season_tables": "observation"},
        "native_resolution": {"ndvi": "250 m MODIS sinusoidal grid (231.66 m cells), 16-day composites",
                              "rainfall": "0.05 degree CHIRPS v3.0 cells (about 4.7 by 5.5 km here)"},
        "period": {"first_season": years[0], "last_season": years[-1]},
        "primary": {"growing_window": gw_primary, "rainfall_window": rw_primary, "reliability": PRIMARY_RELIABILITY},
        "windows": {"growing": [{"id": w["id"], "months": w["months"], "label": f"{month_name(w['months'][0])} to {month_name(w['months'][-1])}"} for w in gws],
                    "rainfall": [{"id": w["id"], "start": w["start"], "end": w["end"],
                                  "label": f"{month_name(w['start']['month'])} (previous year) to {month_name(w['end']['month'])}"
                                  if w["start"]["yearOffset"] < 0 else f"{month_name(w['start']['month'])} to {month_name(w['end']['month'])}"} for w in rws],
                    "rationale": rc["windowRationale"]},
        "reliability_sets": RELIABILITY_SETS,
        "strata": [{"id": sid, "layer": strata_layer[sid], "label": labels.get(sid, sid), "analysis_cells": int(masks[sid].sum()),
                    "modis_pixels_touched": int((w_modis[sid] > 0).sum())} for sid in masks],
        "thresholds": {"min_composite_share": min_share, "min_area_coverage": min_area, "min_seasons": min_seasons,
                       "interval_level": level, "ndvi_valid_range": [-0.2, 1.0]},
        "stored_precision": {"ndvi_decimals": NDVI_DECIMALS, "rainfall_decimals": RAIN_DECIMALS,
                             "note": "Fits use the stored season values, so the tables reproduce every result"},
        "headline": headline,
        "results": results,
        "seasons": seasons,
        "rainfall": rainfall,
        "composites": composites,
        "inputs": {"modis": {"collection": rec["collection"], "search_record": rec_name, "items": len(rec["kept"]),
                             "first_item": first_item, "last_item": last_item, "dropped_duplicates": rec["dropped_duplicates"],
                             "searched_at": rec["searched_at"],
                             "archive_gaps": None if gaps is None else {k: gaps[k] for k in ("checked_at", "cmr", "listed_in_cmr", "missing_in_both")}},
                   "rainfall_bundle": {"id": rain_col["id"], "collection_sha256": sha(os.path.join(rain_col_dir, "collection.json"))},
                   "strata_bundle": {"id": strata_col["id"], "asset_sha256": cfg["strata"]["sha256"]}},
        "limitations": reg["standardLimitations"],
        "forbidden_phrases": reg["forbiddenPhrases"],
    }
    summary_out["windows"] = result["windows"]
    summary_out["strata"] = result["strata"]
    tpath = os.path.join(bdir, tables_name)
    with open(tpath, "w") as f:
        json.dump(result, f, separators=(",", ":"), ensure_ascii=False)
        f.write("\n")
    rpath = os.path.join(bdir, "restrend-long-record.json")
    dump(summary_out, rpath)
    shutil.copyfile(place_config.geometry_path(cfg), os.path.join(bdir, "analysis-geometry.geojson"))
    lock_out = os.path.join(bdir, "uv.lock")
    shutil.copyfile(lock_path, lock_out)

    cat = headline.get("catchment", {})
    if cat.get("status") in ("computed", "precondition_not_met"):
        d = cat["direction"]
        words = {"upward": "the interval lies entirely above zero", "downward": "the interval lies entirely below zero",
                 "includes_zero": "the interval includes zero, so no direction is stated"}[d]
        gl = next(w["label"] for w in result["windows"]["growing"] if w["id"] == gw_primary)
        rl = next(w["label"] for w in result["windows"]["rainfall"] if w["id"] == rw_primary)
        lo, hi = cat["rainfall_slope_interval_per_100_mm"]
        u = cat["unadjusted_trend_per_decade"]
        uw = {"upward": "entirely above zero", "downward": "entirely below zero", "includes_zero": "including zero"}[cat["unadjusted_direction"]]
        summary = (f"Catchment, {gl} greenness against {rl} rainfall, {cat['n']} seasons: "
                   f"{cat['rainfall_slope_per_100_mm']:+.4f} NDVI per 100 mm of rain (95% interval {lo:+.4f} to {hi:+.4f}, "
                   f"R squared {cat['rainfall_fit_r_squared']:.2f}). ")
        if cat["status"] == "computed":
            summary += (f"Rainfall-adjusted residual trend {cat['residual_trend_per_decade']:+.4f} NDVI per decade (95% interval "
                        f"{cat['lower_per_decade']:+.4f} to {cat['upper_per_decade']:+.4f}); {words}.")
        else:
            summary += (f"The rainfall slope interval does not lie entirely above zero, so the registered precondition is not met "
                        f"and no rainfall-adjusted trend is stated. Unadjusted greenness changed by {u[0]:+.4f} NDVI per decade "
                        f"(95% interval {u[1]:+.4f} to {u[2]:+.4f}, {uw}); the residual trend is stored for reference only.")
    else:
        summary = "The catchment has too few seasons for the primary windows; no slope is given."
    desc = (f"Precomputed result of recipe {RECIPE} {reg['version']} for {cfg['title']}: growing-season MODIS NDVI (MOD13Q1 v6.1, "
            f"250 m) regressed on antecedent CHIRPS v3.0 rainfall for each season {years[0]} to {years[-1]}, for the catchment and "
            f"each terrain stratum, and the trend of what is left (the residual, a departure of greenness from the value expected "
            f"from rainfall). Model estimate. {summary}\n\n" + " ".join(reg["standardLimitations"]))
    lic_links = list({l["href"]: l for c in (rain_col, strata_col) for l in c["links"] if l["rel"] == "license"}.values())
    lic_links.insert(0, {"rel": "license", "href": "https://www.earthdata.nasa.gov/engage/open-data-services-software-policies/data-use-guidance",
                         "title": "MOD13Q1 v6.1: NASA data use guidance (NASA-led mission data without a marked restriction are CC0; citation strongly urged)"})
    attribution = [MODIS_CITATION.format(first=first_item.split(".")[1], last=last_item.split(".")[1], tile=first_item.split(".")[2], date=access)]
    attribution += [a for a in rain_col["siterra:attribution"]]
    attribution += [a for a in strata_col["siterra:attribution"] if a not in attribution]
    sw = {"siterra-science": "0.1.0", "python": sys.version.split()[0], "numpy": np.__version__,
          "rasterio": rasterio.__version__, "gdal": rasterio.__gdal_version__}
    col = {
        "type": "Collection", "stac_version": "1.1.0",
        "stac_extensions": ["https://stac-extensions.github.io/processing/v1.3.0/schema.json",
                            "https://stac-extensions.github.io/file/v2.1.0/schema.json", EXT],
        "id": bid, "title": f"Rainfall-adjusted MODIS greenness trend, {years[0]} to {years[-1]} ({RECIPE} {reg['version']})",
        "description": desc, "license": "other",
        "providers": [
            {"name": "NASA Land Processes Distributed Active Archive Center", "roles": ["producer", "licensor"], "url": "https://doi.org/10.5067/MODIS/MOD13Q1.061"},
            {"name": "Microsoft Planetary Computer", "roles": ["host"], "url": "https://planetarycomputer.microsoft.com/dataset/modis-13Q1-061"},
            *[p for p in rain_col["providers"] if "processor" not in p["roles"]],
            {"name": "Siterra science pipeline", "roles": ["processor"],
             "processing:lineage": (f"Anonymous SAS-signed range reads of MOD13Q1 v6.1 NDVI and pixel reliability windows over the frozen "
                                    f"geometry from Planetary Computer ({len(sidecars)} Terra composites); CHIRPS v3.0 monthly windows; "
                                    f"growing-season means per pixel; stratum means weighted by 10 m analysis cells; least squares fits "
                                    f"and trend intervals (science/pipeline/restrend-bundle.py, trend_stats.py)."),
             "processing:software": sw}],
        "extent": {"spatial": {"bbox": [list(place_config.geometry(cfg).bounds)]},
                   "temporal": {"interval": [["{0}-{1:02d}-01T00:00:00Z".format(*min(window_months(w, years[0])[0] for w in rws)),
                                              f"{years[-1]}-{max(max(w['months']) for w in gws):02d}-{calendar.monthrange(years[-1], max(max(w['months']) for w in gws))[1]}T23:59:59Z"]]}},
        "assets": {
            "analysis_geometry": {"href": "./analysis-geometry.geojson", "type": "application/geo+json",
                                  "title": f"Frozen analysis geometry {cfg['geometry']['id']}, revision {cfg['geometry']['revision']}",
                                  "roles": ["metadata"], "file:checksum": "1220" + sha(os.path.join(bdir, "analysis-geometry.geojson")),
                                  "file:size": os.path.getsize(os.path.join(bdir, "analysis-geometry.geojson"))},
            "restrend_long_record": {"href": "./restrend-long-record.json", "type": "application/json",
                                     "title": "Summary: rainfall slopes and residual trends with intervals per stratum and window (the result read_recipe_result returns)",
                                     "roles": ["data"], "file:checksum": "1220" + sha(rpath), "file:size": os.path.getsize(rpath)},
            "restrend_tables": {"href": f"./{tables_name}", "type": "application/json",
                                "title": "Full tables: every season value, window rainfall, residual, fit and sensitivity, both reliability sets",
                                "roles": ["data"], "file:checksum": "1220" + sha(tpath), "file:size": os.path.getsize(tpath)}},
        "created": now,
        "siterra:status": "validated" if all(c["passed"] for c in checks) else "failed",
        "siterra:variable": "ndvi_departure",
        "siterra:dataset": {"id": "modis-13Q1-061", "version": "6.1",
                            "access_route": "https://planetarycomputer.microsoft.com/api/stac/v1 collection modis-13Q1-061, assets 250m_16_days_NDVI and 250m_16_days_pixel_reliability, anonymous SAS-signed COG range reads",
                            "resolution_note": "Native 250 m MODIS sinusoidal grid (231.66 m cells), 16-day composites; rainfall on the 0.05 degree CHIRPS v3.0 grid"},
        "siterra:geo_selection": strata_col["siterra:geo_selection"],
        "siterra:method": {"id": RECIPE, "version": reg["version"], "analysis_crs": cfg["analysisCrs"],
                           "parameters": {"place_configuration": f"science/places/{os.path.basename(place)} revision {cfg['configRevision']}, sha256 {cfg['_sha256']}",
                                          "season_years": rc["seasonYears"], "growing_windows": gws, "rainfall_windows": rws,
                                          "strata": list(masks), "pixel_reliability_kept": RELIABILITY_SETS,
                                          "min_composite_share": min_share, "min_area_coverage": min_area, "min_seasons": min_seasons,
                                          "interval_level": level, "fit_on_stored_values": stored_note(),
                                          "lag1_pairs": "adjacent years both present",
                                          "theil_sen_ranks": "rounded to the nearest integer"},
                           "reference_period": None, "operation_order": reg["formula"]},
        "siterra:attribution": attribution,
        "siterra:limitations": reg["standardLimitations"],
        "siterra:checks": checks,
        "links": [{"rel": "root", "href": "../catalog.json", "type": "application/json"},
                  {"rel": "parent", "href": "../catalog.json", "type": "application/json"},
                  {"rel": "derived_from", "href": f"../{rain_col['id']}/collection.json", "type": "application/json",
                   "title": f"Rainfall bundle {rain_col['id']} (rainfall-cells.geojson used for the rainfall cross-check)",
                   "file:checksum": "1220" + sha(os.path.join(rain_col_dir, "collection.json"))},
                  {"rel": "derived_from", "href": f"../{strata_col['id']}/collection.json", "type": "application/json",
                   "title": f"Terrain strata bundle {strata_col['id']}",
                   "file:checksum": "1220" + sha(os.path.join(bundles, strata_col["id"], "collection.json"))},
                  *lic_links,
                  {"rel": "cite-as", "href": "https://doi.org/10.5067/MODIS/MOD13Q1.061", "title": "Didan (2021), MOD13Q1 v6.1 data set DOI"},
                  *[l for l in rain_col["links"] if l["rel"] == "cite-as"],
                  {"rel": "processing-software", "href": "./uv.lock", "type": "application/toml", "title": "Pipeline lockfile (uv)",
                   "file:checksum": "1220" + sha(lock_out)}]}
    dump(col, os.path.join(bdir, "collection.json"))
    st = {}
    for r in results:
        st[r["status"]] = st.get(r["status"], 0) + 1
    print(f"{bid}: {col['siterra:status']}; results {len(results)} {st}; seasons rows {len(seasons)}; "
          f"summary {os.path.getsize(rpath)} bytes, tables {os.path.getsize(tpath)} bytes")
    for c in checks:
        print(f"  check {c['name']}: {'passed' if c['passed'] else 'FAILED'}")


def stored_note():
    return f"NDVI season values stored at {NDVI_DECIMALS} decimals and rainfall at {RAIN_DECIMALS}; fits use the stored values"


if __name__ == "__main__":
    main()
