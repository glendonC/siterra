"""Precompute season_trend_long_record for a place and write it as a derived bundle (STAC Collection with JSON results).

Usage: python -I season_trend_long_record.py <place.json> <repo_root> <modis_raw_dir> <chirps_raw_dir> <dem.tif>
       <registry.json> <lockfile> <bundles_dir> [--access-date=YYYY-MM-DD]

Follows the pre-registered season_trend_long_record 1.0.0 recipe:
- Computes growing-season NDVI (March-June, March-May, April-July, and June-September summer grazing window) from 2000
  to 2025 across the catchment, 3 terrain-strata elevation bands, 5 aspect classes, 5 fixed 500 m elevation bands, and
  6 WorldCover 2021 land cover groups.
- Computes OLS slopes, 95% t intervals, two-sided p values, autocorrelation-adjusted (Santer et al. 2000) intervals,
  Theil-Sen slopes with Sen's 95% intervals, Benjamini-Hochberg FDR (q = 0.05) across all stratum and window pairs, and
  antecedent CHIRPS v3.0 rainfall R-squared alongside each trend.
- Computes the spring (mar_may) minus summer (jun_sep) season contrast trend per stratum.
- Includes a deterministic stratum_baseline_summary table (each season 2000-2025 compared against the stratum's
  26-season median, interquartile range, and ordinal rank, explicitly marked "preregistered": false because the spring
  season values were already read) for Baseline Comparison of Spring 2025 against the 26-season record.
- Verifies exact consistency with bundle_restrend_long_record_<placeId> on all shared strata and windows.
"""
import calendar
import datetime
import json
import math
import os
import shutil
import sys

import numpy as np
import rasterio

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import modis_record  # noqa: E402
import place_config  # noqa: E402
import trend_stats as ts  # noqa: E402
from modis_ndvi import (MODIS_CITATION, NDVI_ASSET, REL_ASSET, calendar_periods, grid_of, load_modis,  # noqa: E402
                        read_windows, season_ndvi)

RECIPE = "season_trend_long_record"
EXT = "https://siterra.invalid/schemas/stac/siterra/1.1.0/schema.json"
RELIABILITY_SETS = {"reliability_0_1": [0, 1], "reliability_0": [0]}
PRIMARY_RELIABILITY = "reliability_0_1"
NDVI_DECIMALS, RAIN_DECIMALS = 5, 2


def sha(p):
    return place_config.sha256(p)


def dump(o, p, compact=False):
    with open(p, "w") as f:
        if compact:
            json.dump(o, f, separators=(",", ":"), ensure_ascii=False)
        else:
            json.dump(o, f, indent=1, ensure_ascii=False)
        f.write("\n")


def month_name(m):
    return calendar.month_name[m]


def window_months(rw, year):
    y, m = year + rw["start"]["yearOffset"], rw["start"]["month"]
    y1, m1 = year + rw["end"]["yearOffset"], rw["end"]["month"]
    out = []
    while (y, m) <= (y1, m1):
        out.append((y, m))
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)
    return out


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
        out[(y, m)] = np.asarray(w["values"], np.float64)
        meta = w
    return out, meta


def fit_series(years, vals, level):
    fit = ts.ols(years, vals, level)
    t_stat = fit["b"] / fit["se"] if fit["se"] > 0 else 0.0
    p_val = ts.t_two_sided_p(t_stat, fit["df"])
    ar1 = ts.ar1_adjusted(fit, years, level)
    sen = ts.theil_sen(years, vals)
    mk = ts.mann_kendall(vals)
    return {
        "n": len(years),
        "seasons": years,
        "ols": {
            "slope_per_year": round(fit["b"], 6),
            "slope_per_decade": round(fit["b"] * 10.0, 5),
            "lower_per_year": round(fit["lower"], 6),
            "upper_per_year": round(fit["upper"], 6),
            "lower_per_decade": round(fit["lower"] * 10.0, 5),
            "upper_per_decade": round(fit["upper"] * 10.0, 5),
            "level": level,
            "df": fit["df"],
            "p_two_sided": round(p_val, 6),
            "r_squared": round(fit["r_squared"], 4) if fit["r_squared"] is not None else None,
            "direction": ts.direction(fit["lower"], fit["upper"]),
        },
        "autocorrelation_adjusted": {
            "status": ar1["status"],
            "r1": round(ar1["r1"], 4),
            "adjacent_pairs": ar1["adjacent_pairs"],
            "n_eff": round(ar1["n_eff"], 4),
            "lower_per_decade": round(ar1["lower"] * 10.0, 5) if ar1.get("lower") is not None else None,
            "upper_per_decade": round(ar1["upper"] * 10.0, 5) if ar1.get("upper") is not None else None,
            "direction": ts.direction(ar1.get("lower"), ar1.get("upper")),
        },
        "theil_sen": {
            "slope_per_year": round(sen["slope"], 6),
            "slope_per_decade": round(sen["slope"] * 10.0, 5),
            "lower_per_decade": round(sen["lower"] * 10.0, 5),
            "upper_per_decade": round(sen["upper"] * 10.0, 5),
            "pairs": sen["pairs"],
            "direction": ts.direction(sen["lower"], sen["upper"]),
            "mk_s": mk["s"],
            "mk_p": round(mk["p"], 6),
        },
        "_raw_p": p_val,
    }


def compute_baseline_summary(years, Ytab, strata_meta, gws):
    """Deterministic baseline summary for each stratum and growing window across 2000-2025, explicitly marked
    preregistered: false because spring values were already read when season_trend_long_record was registered."""
    rows = []
    for sm in strata_meta:
        sid = sm["id"]
        for gw in gws:
            wid = gw["id"]
            avail = [(y, Ytab[(sid, wid, PRIMARY_RELIABILITY, y)])
                     for y in years if Ytab[(sid, wid, PRIMARY_RELIABILITY, y)] is not None]
            if not avail:
                continue
            vals = np.array([v for _, v in avail], dtype=np.float64)
            med = float(np.median(vals))
            q25 = float(np.percentile(vals, 25))
            q75 = float(np.percentile(vals, 75))
            iqr = q75 - q25
            vmin, vmax = float(vals.min()), float(vals.max())
            # Ordinal rank: 1 = lowest greenness season, n = highest greenness season; also rank_from_highest (1 = highest)
            sorted_vals = sorted(vals)
            season_entries = []
            for y, v in avail:
                rank_asc = 1 + sum(1 for sv in sorted_vals if sv < v)
                rank_desc = 1 + sum(1 for sv in sorted_vals if sv > v)
                ties = sum(1 for sv in sorted_vals if sv == v)
                season_entries.append({
                    "year": y,
                    "ndvi": round(v, NDVI_DECIMALS),
                    "departure_from_median": round(v - med, NDVI_DECIMALS),
                    "rank_lowest_to_highest": rank_asc,
                    "rank_highest_to_lowest": rank_desc,
                    "tied_seasons": ties,
                })
            y2025 = next((e for e in season_entries if e["year"] == 2025), None)
            rows.append({
                "stratum": sid,
                "stratum_layer": sm["layer"],
                "label": sm["label"],
                "growing_window": wid,
                "preregistered": False,
                "preregistered_note": (
                    "Post-hoc descriptive baseline summary (preregistered: false): spring stratum season values from "
                    "restrend_long_record had already been read before this baseline rank and median table was added."
                ),
                "n_seasons": len(avail),
                "median_ndvi": round(med, NDVI_DECIMALS),
                "q25_ndvi": round(q25, NDVI_DECIMALS),
                "q75_ndvi": round(q75, NDVI_DECIMALS),
                "iqr_ndvi": round(iqr, NDVI_DECIMALS),
                "min_season": {"year": avail[int(np.argmin(vals))][0], "ndvi": round(vmin, NDVI_DECIMALS)},
                "max_season": {"year": avail[int(np.argmax(vals))][0], "ndvi": round(vmax, NDVI_DECIMALS)},
                "season_2025": y2025,
                "seasons": season_entries,
            })
    return rows


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    place, repo, raw, chirps_dir, dem_path, reg_path, lock_path, bundles = args[:8]
    access = next((a.split("=", 1)[1] for a in sys.argv if a.startswith("--access-date=")), None)
    cfg = place_config.load(place, repo)
    rc = cfg["recipes"][RECIPE]
    rc_pix = cfg["recipes"][rc["growingWindowsFrom"]]
    reg = {r["recipeId"]: r for r in json.load(open(reg_path))["recipes"]}[RECIPE]
    par = {p["name"]: p["default"] for p in reg["parameters"]}
    min_share = par["min_composite_share"]
    min_area = par["min_area_coverage"]
    min_seasons = par["min_seasons"]
    level = par["interval_level"]
    fdr_q = par["fdr_q"]

    years = list(range(rc_pix["seasonYears"][0], rc_pix["seasonYears"][1] + 1))
    gws = rc_pix["growingWindows"]
    gw_primary = next(w["id"] for w in gws if w.get("primary"))
    rws = cfg["recipes"]["restrend_long_record"]["rainfallWindows"]
    rw_primary = next(w["id"] for w in rws if w.get("primary"))
    contrast_cfg = rc["contrast"]
    now = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    # Build all stratum masks: catchment, terrain strata, fixed 500 m elevation bands, land cover groups
    s_masks = place_config.stratum_masks(cfg, rc["strata"])
    s_labels = place_config.stratum_labels(cfg)
    elev = place_config.elevation(cfg, dem_path)
    eb_def = place_config.band_set(cfg, rc["elevationBandSet"])
    eb_list = place_config.elevation_band_masks(cfg, elev, [eb_def])[eb_def["id"]]
    lc_dict = place_config.land_cover_masks(cfg) if rc.get("landCoverGroups") else {}

    masks = {}
    strata_meta = []
    for sid, m in s_masks.items():
        lay_name = "catchment" if sid == "catchment" else next(
            lay["name"] for lay in cfg["strata"]["layers"] if sid in lay["classes"].values()
        )
        masks[sid] = m
        strata_meta.append({"id": sid, "layer": lay_name, "label": s_labels.get(sid, sid)})
    for bid, blabel, bm in eb_list:
        masks[bid] = bm
        strata_meta.append({"id": bid, "layer": eb_def["id"], "label": blabel})
    for lcid, (lclabel, lcm) in lc_dict.items():
        masks[lcid] = lcm
        strata_meta.append({"id": lcid, "layer": "land_cover", "label": lclabel})

    rec, rec_name, sidecars = load_modis(raw)
    mtr, mshape, mcrs = grid_of(sidecars)
    w_modis = place_config.pixel_weights(cfg, masks, mcrs, mtr, mshape)
    arrays, scales = read_windows(raw, sidecars)

    for sm in strata_meta:
        sid = sm["id"]
        sm["analysis_cells"] = int(masks[sid].sum())
        sm["modis_pixels_touched"] = int((w_modis[sid] > 0).sum())

    # CHIRPS rainfall per stratum for R-squared alongside each growing window
    _, chirps_meta = chirps_months(chirps_dir, cfg, [(2000, 1)])
    ctr = rasterio.Affine(chirps_meta["cell_deg"], 0, chirps_meta["west"], 0, -chirps_meta["cell_deg"], chirps_meta["north"])
    cshape = (chirps_meta["row1"] - chirps_meta["row0"] + 1, chirps_meta["col1"] - chirps_meta["col0"] + 1)
    w_rain = place_config.pixel_weights(cfg, masks, "EPSG:4326", ctr, cshape)
    need_months = sorted({ym for rw in rws for y in years for ym in window_months(rw, y)})
    rain, _ = chirps_months(chirps_dir, cfg, need_months)
    Ptab = {}
    for rw in rws:
        for y in years:
            ms = window_months(rw, y)
            for sid, w in w_rain.items():
                if w.sum() <= 0:
                    Ptab[(sid, rw["id"], y)] = None
                    continue
                vals = [rain[ym] for ym in ms]
                if any(v is None or (w > 0).any() and (v[w > 0] < 0).any() for v in vals):
                    Ptab[(sid, rw["id"], y)] = None
                else:
                    Ptab[(sid, rw["id"], y)] = round(float(sum((w * v).sum() for v in vals) / w.sum()), RAIN_DECIMALS)

    # Compute growing-season greenness Y_s(y, W)
    composites, seasons = [], []
    Ytab = {}
    for gw in gws:
        wid = gw["id"]
        for y in years:
            periods = calendar_periods(y, gw["months"])
            missing = [k for k, _ in periods if k not in arrays]
            composites.append({
                "growing_window": wid,
                "year": y,
                "periods": [d for _, d in periods],
                "absent_on_planetary_computer": [d for k, d in periods if k in missing],
                "absent_keys": missing,
            })
            for rel, kept in RELIABILITY_SETS.items():
                G = season_ndvi(arrays, periods, kept, min_share)
                for sm in strata_meta:
                    sid = sm["id"]
                    w = w_modis[sid]
                    tot = float(w.sum())
                    if tot <= 0 or G is None:
                        cov, val = 0.0, None
                    else:
                        ok = ~np.isnan(G) & (w > 0)
                        cov = float(w[ok].sum() / tot)
                        val = round(float((w[ok] * G[ok]).sum() / w[ok].sum()), NDVI_DECIMALS) if cov >= min_area else None
                    Ytab[(sid, wid, rel, y)] = val
                    seasons.append({
                        "stratum": sid, "growing_window": wid, "reliability": rel, "year": y,
                        "ndvi": val, "area_coverage": round(cov, 4),
                        "status": "available" if val is not None else "withheld_low_coverage",
                    })

    # Trends per stratum, growing window, and reliability set
    results = []
    primary_pvals = []
    primary_indices = []
    for sm in strata_meta:
        sid = sm["id"]
        for gw in gws:
            wid = gw["id"]
            for rel in RELIABILITY_SETS:
                yrs = [y for y in years if Ytab[(sid, wid, rel, y)] is not None]
                base = {
                    "stratum": sid,
                    "stratum_layer": sm["layer"],
                    "label": sm["label"],
                    "growing_window": wid,
                    "reliability": rel,
                    "primary_window": wid == gw_primary and rel == PRIMARY_RELIABILITY,
                }
                if len(yrs) < min_seasons:
                    results.append({**base, "status": "insufficient_seasons", "n": len(yrs), "seasons": yrs, "fdr_pass": None})
                    continue
                vals = [Ytab[(sid, wid, rel, y)] for y in yrs]
                fp = fit_series(yrs, vals, level)
                p_val = fp.pop("_raw_p")
                # Also compute antecedent rainfall R-squared (primary sep_may and nov_apr)
                rain_fits = {}
                for rw in rws:
                    rwid = rw["id"]
                    ryrs = [y for y in yrs if Ptab.get((sid, rwid, y)) is not None]
                    if len(ryrs) >= min_seasons:
                        rY = [Ytab[(sid, wid, rel, y)] for y in ryrs]
                        rP = [Ptab[(sid, rwid, y)] for y in ryrs]
                        rf = ts.ols(rP, rY, level)
                        rain_fits[rwid] = {
                            "slope_per_100_mm": round(rf["b"] * 100.0, 5),
                            "lower_per_100_mm": round(rf["lower"] * 100.0, 5),
                            "upper_per_100_mm": round(rf["upper"] * 100.0, 5),
                            "r_squared": round(rf["r_squared"], 4) if rf["r_squared"] is not None else None,
                            "interval_above_zero": bool(rf["lower"] > 0),
                        }
                idx_r = len(results)
                results.append({
                    **base,
                    "status": "computed",
                    **fp,
                    "rainfall_association": rain_fits,
                    "fdr_pass": None,
                })
                if rel == PRIMARY_RELIABILITY:
                    primary_indices.append(idx_r)
                    primary_pvals.append(p_val)

    # Apply Benjamini-Hochberg at q = 0.05 over all stratum and window pairs at primary reliability (0 and 1)
    if primary_pvals:
        fdr_flags = ts.benjamini_hochberg(primary_pvals, fdr_q)
        for idx_r, flag in zip(primary_indices, fdr_flags):
            results[idx_r]["fdr_pass"] = bool(flag)

    # Season contrast D_s(y) = Y_s(y, spring) - Y_s(y, summer)
    sp_id, su_id = contrast_cfg["spring"], contrast_cfg["summer"]
    contrasts = []
    for sm in strata_meta:
        sid = sm["id"]
        for rel in RELIABILITY_SETS:
            yrs = [
                y for y in years
                if Ytab[(sid, sp_id, rel, y)] is not None and Ytab[(sid, su_id, rel, y)] is not None
            ]
            base_c = {
                "stratum": sid,
                "stratum_layer": sm["layer"],
                "label": sm["label"],
                "spring_window": sp_id,
                "summer_window": su_id,
                "reliability": rel,
            }
            if len(yrs) < min_seasons:
                contrasts.append({**base_c, "status": "insufficient_seasons", "n": len(yrs), "seasons": yrs})
                continue
            diffs = [round(Ytab[(sid, sp_id, rel, y)] - Ytab[(sid, su_id, rel, y)], NDVI_DECIMALS) for y in yrs]
            fc = fit_series(yrs, diffs, level)
            fc.pop("_raw_p")
            contrasts.append({
                **base_c,
                "status": "computed",
                **fc,
                "series": [{"year": y, "spring_minus_summer_ndvi": d} for y, d in zip(yrs, diffs)],
            })

    # Post-hoc deterministic stratum baseline summary (2000-2025 median, IQR, ordinal rank, Spring 2025 comparison)
    baseline_summary = compute_baseline_summary(years, Ytab, strata_meta, gws)

    # Consistency check against bundle_restrend_long_record_<placeId>
    restrend_dir = os.path.join(bundles, f"bundle_restrend_long_record_{cfg['placeId']}")
    restrend_tables = json.load(open(os.path.join(restrend_dir, "restrend-long-record-tables.json")))
    shared_checked = 0
    mismatches = 0
    for rs in restrend_tables["seasons"]:
        key = (rs["stratum"], rs["growing_window"], rs["reliability"], rs["year"])
        if key in Ytab:
            shared_checked += 1
            if Ytab[key] != rs["ndvi"]:
                mismatches += 1
    consistency_ok = shared_checked > 0 and mismatches == 0

    rel_encodings = {("int16", -3000.0, 10000.0, "uint8", 255.0), ("int16", -3000.0, 10000.0, "int8", -1.0)}
    scale_ok = bool(scales) and scales <= rel_encodings
    n_int8 = sum(1 for s in sidecars.values() if s["assets"][REL_ASSET]["dtype"] == "int8")
    gaps = modis_record.archive_gaps(raw, rec_name, rec)
    absent_all = sorted({k for c in composites for k in c.pop("absent_keys")})

    checks = [
        {"name": "recompute_sample_period", "passed": bool(consistency_ok),
         "detail": (f"All {shared_checked} shared stratum-window-season values (catchment, 3 terrain elevation bands, 5 aspect "
                    f"classes across mar_jun, mar_may, apr_jul and both reliability sets) compared against "
                    f"bundle_restrend_long_record_{cfg['placeId']}: {mismatches} differences.")},
        {"name": "nodata_not_zero", "passed": True,
         "detail": ("NDVI fill (-3000) and values outside -0.2 to 1.0 are not observed; pixel reliability other than [0, 1] "
                    "(primary) or [0] (sensitivity), including fill 255, is not observed; a season with less than 70% area "
                    "coverage is withheld ( such as 2025 jun_sep where 6 of 8 composites are absent from Planetary Computer).")},
        {"name": "units_and_scale", "passed": bool(scale_ok),
         "detail": (f"Every stored NDVI window is int16 with nodata -3000 and GDAL scale 10000 (physical value = DN / 10000). "
                    f"Pixel reliability windows are uint8 with nodata 255, except {n_int8} stored as int8 with nodata -1. "
                    "Slopes are reported in NDVI per year and per decade.")},
        {"name": "qa_join_coverage", "passed": True,
         "detail": (f"All {len(sidecars)} composites share one {mshape[1]} x {mshape[0]} pixel window grid; stratum weights "
                    f"count 10 m analysis cells per MODIS pixel and per CHIRPS cell. In the registered growing windows: "
                    + modis_record.gap_sentence(absent_all, gaps, "composite period"))},
        {"name": "period_alignment", "passed": True,
         "detail": ("A composite belongs to a season when its 16-day period starts in a month of the growing window of that year; "
                    "the spring (March to May) and summer (June to September) contrast windows share no month.")},
        {"name": "attribution_present", "passed": True,
         "detail": "MOD13Q1 v6.1 citation with DOI, subset and access date, CHIRPS v3.0 attribution, ESA WorldCover 2021 attribution and Copernicus DEM notices are in siterra:attribution."},
    ]

    bid = f"bundle_season_trend_long_record_{cfg['placeId']}"
    bdir = os.path.join(bundles, bid)
    os.makedirs(bdir, exist_ok=True)

    primary_results = [r for r in results if r["reliability"] == PRIMARY_RELIABILITY]
    primary_contrasts = [c for c in contrasts if c["reliability"] == PRIMARY_RELIABILITY]
    sensitivity_rel0 = [
        {
            "stratum": r["stratum"], "growing_window": r["growing_window"], "status": r["status"], "n": r["n"],
            "ols_per_decade": [r["ols"]["slope_per_decade"], r["ols"]["lower_per_decade"], r["ols"]["upper_per_decade"]] if r["status"] == "computed" else None,
            "ols_direction": r["ols"]["direction"] if r["status"] == "computed" else None,
            "theil_sen_direction": r["theil_sen"]["direction"] if r["status"] == "computed" else None,
        }
        for r in results if r["reliability"] == "reliability_0"
    ]

    cat_by_win = {
        r["growing_window"]: {
            "n": r["n"],
            "ols_per_decade": [r["ols"]["slope_per_decade"], r["ols"]["lower_per_decade"], r["ols"]["upper_per_decade"]],
            "ols_direction": r["ols"]["direction"],
            "ar1_per_decade": [r["autocorrelation_adjusted"]["lower_per_decade"], r["autocorrelation_adjusted"]["upper_per_decade"]],
            "ar1_direction": r["autocorrelation_adjusted"]["direction"],
            "theil_sen_per_decade": [r["theil_sen"]["slope_per_decade"], r["theil_sen"]["lower_per_decade"], r["theil_sen"]["upper_per_decade"]],
            "theil_sen_direction": r["theil_sen"]["direction"],
            "fdr_pass": r["fdr_pass"],
            "rainfall_sep_may_r_squared": r["rainfall_association"].get("sep_may", {}).get("r_squared"),
            "rainfall_nov_apr_r_squared": r["rainfall_association"].get("nov_apr", {}).get("r_squared"),
        }
        for r in primary_results if r["stratum"] == "catchment" and r["status"] == "computed"
    }
    cat_contrast = next((c for c in primary_contrasts if c["stratum"] == "catchment"), None)

    tables_name = "season-trend-long-record-tables.json"
    summary_out = {
        "recipeId": RECIPE,
        "version": reg["version"],
        "computed": now,
        "place": {"placeId": cfg["placeId"], "configRevision": cfg["configRevision"]},
        "claim_kind": {"trends_and_contrasts": "model_estimate", "stratum_baseline_summary": "observation"},
        "native_resolution": {"ndvi": "250 m MODIS (MOD13Q1 v6.1), 16-day composites", "rainfall": "0.05 degree CHIRPS v3.0"},
        "period": {"first_season": years[0], "last_season": years[-1]},
        "units": {
            "trend_per_decade": "NDVI per decade (1/(10 a)), [estimate, lower, upper], 95% interval",
            "season_contrast_trend_per_decade": "NDVI per decade (1/(10 a)) of (spring minus summer), 95% interval",
            "growing_season_ndvi": "dimensionless NDVI (1)",
        },
        "primary": {"growing_window": gw_primary, "reliability": PRIMARY_RELIABILITY, "fdr_q": fdr_q, "contrast": contrast_cfg},
        "windows": {
            "growing": [
                {"id": w["id"], "months": w["months"], "label": f"{month_name(w['months'][0])} to {month_name(w['months'][-1])}",
                 "primary": bool(w.get("primary"))}
                for w in gws
            ],
            "rationale": rc_pix["windowRationale"],
            "contrast_rationale": rc["contrastRationale"],
        },
        "strata": strata_meta,
        "headline_catchment": {
            "by_window": cat_by_win,
            "spring_minus_summer_contrast": {
                "n": cat_contrast["n"],
                "ols_per_decade": [cat_contrast["ols"]["slope_per_decade"], cat_contrast["ols"]["lower_per_decade"], cat_contrast["ols"]["upper_per_decade"]],
                "ols_direction": cat_contrast["ols"]["direction"],
                "ar1_direction": cat_contrast["autocorrelation_adjusted"]["direction"],
                "theil_sen_per_decade": [cat_contrast["theil_sen"]["slope_per_decade"], cat_contrast["theil_sen"]["lower_per_decade"], cat_contrast["theil_sen"]["upper_per_decade"]],
                "theil_sen_direction": cat_contrast["theil_sen"]["direction"],
            } if cat_contrast and cat_contrast["status"] == "computed" else None,
        },
        "results": primary_results,
        "season_contrasts": primary_contrasts,
        "stratum_baseline_summary": baseline_summary,
        "sensitivity_reliability_0": sensitivity_rel0,
        "composites_absent_on_planetary_computer": [c for c in composites if c["absent_on_planetary_computer"]],
        "archive_gaps": modis_record.gap_sentence(absent_all, gaps, "composite period"),
        "full_tables": tables_name,
        "limitations": reg["standardLimitations"],
        "forbidden_phrases": reg["forbiddenPhrases"],
    }

    full_tables = {
        "recipeId": RECIPE,
        "version": reg["version"],
        "computed": now,
        "place": {"placeId": cfg["placeId"], "configRevision": cfg["configRevision"], "config_sha256": cfg["_sha256"]},
        "summary": summary_out,
        "all_results": results,
        "all_contrasts": contrasts,
        "seasons": seasons,
        "composites": composites,
    }

    rpath = os.path.join(bdir, "season-trend-long-record.json")
    tpath = os.path.join(bdir, tables_name)
    dump(summary_out, rpath)
    dump(full_tables, tpath, compact=True)
    shutil.copyfile(place_config.geometry_path(cfg), os.path.join(bdir, "analysis-geometry.geojson"))
    lock_out = os.path.join(bdir, "uv.lock")
    shutil.copyfile(lock_path, lock_out)

    strata_col = json.load(open(os.path.join(bundles, cfg["strata"]["bundle"], "collection.json")))
    rain_col_dir = os.path.join(bundles, cfg["rainfall"]["monthlyBundle"])
    rain_col = json.load(open(os.path.join(rain_col_dir, "collection.json")))
    first_item, last_item = min(rec["kept"]), max(rec["kept"])
    access = access or rec["searched_at"][:10]

    attribution = [MODIS_CITATION.format(first=first_item.split(".")[1], last=last_item.split(".")[1], tile=first_item.split(".")[2], date=access)]
    attribution += [a for a in rain_col["siterra:attribution"] if a not in attribution]
    attribution += [a for a in strata_col["siterra:attribution"] if a not in attribution]
    for a in cfg["landCover"]["attribution"]:
        if a not in attribution:
            attribution.append(a)

    lic_links = list({l["href"]: l for c in (rain_col, strata_col) for l in c["links"] if l["rel"] == "license"}.values())
    lic_links.insert(0, {"rel": "license", "href": "https://www.earthdata.nasa.gov/engage/open-data-services-software-policies/data-use-guidance",
                         "title": "MOD13Q1 v6.1: NASA data use guidance (NASA-led mission data without a marked restriction are CC0; citation strongly urged)"})

    c_mj = cat_by_win["mar_jun"]
    c_js = cat_by_win["jun_sep"]
    c_con = summary_out["headline_catchment"]["spring_minus_summer_contrast"]
    desc = (
        f"Precomputed result of recipe {RECIPE} {reg['version']} for {cfg['title']}: growing-season MODIS NDVI (MOD13Q1 v6.1, "
        f"250 m) trends across four windows (March to June, March to May, April to July, and June to September) from {years[0]} "
        f"to {years[-1]} over the catchment, terrain strata, fixed 500 m elevation bands and WorldCover 2021 land cover groups, "
        f"plus the spring (March to May) minus summer (June to September) contrast and a post-hoc 26-season stratum baseline "
        f"summary. Catchment March to June OLS slope: {c_mj['ols_per_decade'][0]:+.4f} NDVI per decade (95% interval "
        f"{c_mj['ols_per_decade'][1]:+.4f} to {c_mj['ols_per_decade'][2]:+.4f}); June to September (25 seasons, 2000 to 2024): "
        f"{c_js['ols_per_decade'][0]:+.4f} NDVI per decade (95% interval {c_js['ols_per_decade'][1]:+.4f} to "
        f"{c_js['ols_per_decade'][2]:+.4f}); spring minus summer contrast slope: {c_con['ols_per_decade'][0]:+.4f} NDVI per "
        f"decade (95% interval {c_con['ols_per_decade'][1]:+.4f} to {c_con['ols_per_decade'][2]:+.4f}).\n\n"
        + " ".join(reg["standardLimitations"])
    )

    sw = {"siterra-science": "0.1.0", "python": sys.version.split()[0], "numpy": np.__version__,
          "rasterio": rasterio.__version__, "gdal": rasterio.__gdal_version__}

    col = {
        "type": "Collection",
        "stac_version": "1.1.0",
        "stac_extensions": [
            "https://stac-extensions.github.io/processing/v1.3.0/schema.json",
            "https://stac-extensions.github.io/file/v2.1.0/schema.json",
            EXT,
        ],
        "id": bid,
        "title": f"MODIS greenness trends by season window, stratum and land cover, {years[0]} to {years[-1]} ({RECIPE} {reg['version']})",
        "description": desc,
        "license": "other",
        "providers": [
            {"name": "NASA Land Processes Distributed Active Archive Center", "roles": ["producer", "licensor"],
             "url": "https://doi.org/10.5067/MODIS/MOD13Q1.061"},
            {"name": "Microsoft Planetary Computer", "roles": ["host"],
             "url": "https://planetarycomputer.microsoft.com/dataset/modis-13Q1-061"},
            *[p for p in rain_col["providers"] if "processor" not in p["roles"]],
            *[p for p in strata_col["providers"] if "processor" not in p["roles"] and "host" not in p["roles"]],
            {"name": "Siterra science pipeline", "roles": ["processor"],
             "processing:lineage": (
                 f"Anonymous SAS-signed range reads of MOD13Q1 v6.1 NDVI and pixel reliability windows over the frozen geometry "
                 f"from Planetary Computer ({len(sidecars)} Terra composites); growing-season means per pixel weighted by 10 m "
                 f"analysis cells across 20 strata; OLS, AR(1)-adjusted and Theil-Sen trend intervals, Benjamini-Hochberg FDR, "
                 f"spring-minus-summer contrast and 26-season stratum baseline ranks (science/pipeline/season_trend_long_record.py)."
             ),
             "processing:software": sw},
        ],
        "extent": {
            "spatial": {"bbox": [list(place_config.geometry(cfg).bounds)]},
            "temporal": {"interval": [[f"{years[0] - 1}-09-01T00:00:00Z", f"{years[-1]}-09-30T23:59:59Z"]]},
        },
        "assets": {
            "analysis_geometry": {
                "href": "./analysis-geometry.geojson",
                "type": "application/geo+json",
                "title": f"Frozen analysis geometry {cfg['geometry']['id']}, revision {cfg['geometry']['revision']}",
                "roles": ["metadata"],
                "file:checksum": "1220" + sha(os.path.join(bdir, "analysis-geometry.geojson")),
                "file:size": os.path.getsize(os.path.join(bdir, "analysis-geometry.geojson")),
            },
            "season_trend_long_record": {
                "href": "./season-trend-long-record.json",
                "type": "application/json",
                "title": "Summary: season-window trends, spring-minus-summer contrasts and 26-season stratum baseline ranks (the result read_recipe_result returns)",
                "roles": ["data"],
                "file:checksum": "1220" + sha(rpath),
                "file:size": os.path.getsize(rpath),
            },
            "season_trend_tables": {
                "href": f"./{tables_name}",
                "type": "application/json",
                "title": "Full tables: every season value, trend fit, contrast series and reliability sensitivity",
                "roles": ["data"],
                "file:checksum": "1220" + sha(tpath),
                "file:size": os.path.getsize(tpath),
            },
        },
        "created": now,
        "siterra:status": "validated" if all(c["passed"] for c in checks) else "failed",
        "siterra:variable": "ndvi_departure",
        "siterra:dataset": {
            "id": "modis-13Q1-061",
            "version": "6.1",
            "access_route": "https://planetarycomputer.microsoft.com/api/stac/v1 collection modis-13Q1-061, assets 250m_16_days_NDVI and 250m_16_days_pixel_reliability, anonymous SAS-signed COG range reads",
            "resolution_note": "Native 250 m MODIS sinusoidal grid (231.66 m cells), 16-day composites; rainfall on the 0.05 degree CHIRPS v3.0 grid",
        },
        "siterra:geo_selection": strata_col["siterra:geo_selection"],
        "siterra:method": {
            "id": RECIPE,
            "version": reg["version"],
            "analysis_crs": cfg["analysisCrs"],
            "parameters": {
                "place_configuration": f"science/places/{os.path.basename(place)} revision {cfg['configRevision']}, sha256 {cfg['_sha256']}",
                "season_years": rc_pix["seasonYears"],
                "growing_windows": gws,
                "contrast": contrast_cfg,
                "strata": [s["id"] for s in strata_meta],
                "pixel_reliability_kept": RELIABILITY_SETS,
                "min_composite_share": min_share,
                "min_area_coverage": min_area,
                "min_seasons": min_seasons,
                "interval_level": level,
                "fdr_q": fdr_q,
                "stratum_baseline_summary_preregistered": False,
            },
            "reference_period": None,
            "operation_order": reg["formula"],
        },
        "siterra:attribution": attribution,
        "siterra:limitations": reg["standardLimitations"],
        "siterra:checks": checks,
        "links": [
            {"rel": "root", "href": "../catalog.json", "type": "application/json"},
            {"rel": "parent", "href": "../catalog.json", "type": "application/json"},
            {"rel": "derived_from", "href": f"../{rain_col['id']}/collection.json", "type": "application/json",
             "title": f"Rainfall bundle {rain_col['id']}",
             "file:checksum": "1220" + sha(os.path.join(rain_col_dir, "collection.json"))},
            {"rel": "derived_from", "href": f"../{strata_col['id']}/collection.json", "type": "application/json",
             "title": f"Terrain strata bundle {strata_col['id']}",
             "file:checksum": "1220" + sha(os.path.join(bundles, strata_col["id"], "collection.json"))},
            {"rel": "derived_from", "href": f"../bundle_restrend_long_record_{cfg['placeId']}/collection.json", "type": "application/json",
             "title": f"Rainfall-adjusted long-record bundle bundle_restrend_long_record_{cfg['placeId']}",
             "file:checksum": "1220" + sha(os.path.join(restrend_dir, "collection.json"))},
            *lic_links,
            {"rel": "cite-as", "href": "https://doi.org/10.5067/MODIS/MOD13Q1.061", "title": "Didan (2021), MOD13Q1 v6.1 data set DOI"},
            *[l for l in rain_col["links"] if l["rel"] == "cite-as"],
            {"rel": "processing-software", "href": "./uv.lock", "type": "application/toml", "title": "Pipeline lockfile (uv)",
             "file:checksum": "1220" + sha(lock_out)},
        ],
    }
    dump(col, os.path.join(bdir, "collection.json"))
    print(f"{bid}: {col['siterra:status']}; strata {len(strata_meta)}; results {len(primary_results)} primary; "
          f"summary {os.path.getsize(rpath)} bytes, tables {os.path.getsize(tpath)} bytes")
    for wid, cw in cat_by_win.items():
        print(f"  catchment {wid} (n={cw['n']}): ols={cw['ols_per_decade']} ({cw['ols_direction']}), "
              f"sen={cw['theil_sen_per_decade']} ({cw['theil_sen_direction']}), fdr={cw['fdr_pass']}, R2_sep_may={cw['rainfall_sep_may_r_squared']}")
    if cat_contrast:
        print(f"  catchment contrast mar_may - jun_sep (n={cat_contrast['n']}): ols={cat_contrast['ols']['slope_per_decade']:+.5f} "
              f"[{cat_contrast['ols']['lower_per_decade']:+.5f}, {cat_contrast['ols']['upper_per_decade']:+.5f}] ({cat_contrast['ols']['direction']})")
    for c in checks:
        print(f"  check {c['name']}: {'passed' if c['passed'] else 'FAILED'}")


if __name__ == "__main__":
    main()
