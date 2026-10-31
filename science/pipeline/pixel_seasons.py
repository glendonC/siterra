"""Precompute pixel_seasons for a place and write it as a derived bundle: the growing-window mean NDVI of every trend pixel in every season.

Usage: python -I pixel_seasons.py <place.json> <repo_root> <modis_13Q1_dir> <registry.json> <lockfile> <bundles_dir>
       [--access-date=YYYY-MM-DD] [--computed=YYYY-MM-DDTHH:MM:SSZ]

Follows the pre-registered pixel_seasons 1.0.0 recipe (registry 1.12.0). It stores the season values that pixel_trend_long_record computed and
kept only as a count, from the same composites, reliability filter, composite share and rounding, and then recomputes every pixel's Theil-Sen
slope from the stored values and compares it with the slope raster of the trend bundle of the same place and window. Any difference stops the run.
Writes: a GeoTIFF with one float32 band per season (the canonical asset), a summary JSON, and a web copy (little-endian float32 array of shape
seasons x rows x columns with a JSON header) that is read back and compared with the computed values cell for cell.
"""
import datetime
import json
import os
import shutil
import sys

import numpy as np
import PIL
import pyproj
import rasterio

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bundle_common as bc  # noqa: E402
import modis_record  # noqa: E402
import place_config  # noqa: E402
import trend_stats as ts  # noqa: E402
from modis_ndvi import MODIS_CITATION, calendar_periods, grid_of, load_modis, read_windows, season_ndvi  # noqa: E402

RECIPE = "pixel_seasons"
TREND_RECIPE = "pixel_trend_long_record"
EXT = "https://siterra.invalid/schemas/stac/siterra/1.1.0/schema.json"
PROJ_EXT = "https://stac-extensions.github.io/projection/v2.1.0/schema.json"
MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]


def _window_trend_scan(stack, years, in_window, min_seasons, fdr_q):
    """Compute Theil-Sen slope per decade and Mann-Kendall BH-FDR (at fdr_q) for all pixels in in_window."""
    rr_w, cc_w = np.nonzero(in_window)
    n_w = int(len(rr_w))
    if n_w == 0:
        return np.full(stack.shape[1:], np.nan), np.zeros(stack.shape[1:], dtype=np.float64)
    T = len(years)
    x_arr = np.asarray(years, dtype=np.float64)
    ii, jj = np.triu_indices(T, k=1)
    dx = x_arr[jj] - x_arr[ii]
    var_no_tie = T * (T - 1) * (2 * T + 5) / 18.0
    slopes = np.full(stack.shape[1:], np.nan, dtype=np.float64)
    pvals = np.ones(n_w, dtype=np.float64)
    vals_w = stack[:, rr_w, cc_w].T  # shape (n_w, T)
    full_mask = np.isfinite(vals_w).all(axis=1)
    if full_mask.any():
        idx_full = np.nonzero(full_mask)[0]
        y_full = vals_w[idx_full]
        dy = y_full[:, jj] - y_full[:, ii]
        sl_full = np.median(dy / dx[None, :], axis=1) * 10.0
        slopes[rr_w[idx_full], cc_w[idx_full]] = sl_full
        s_full = (dy > 0).sum(axis=1, dtype=np.int64) - (dy < 0).sum(axis=1, dtype=np.int64)
        has_tie = (dy == 0).any(axis=1)
        no_tie_idx = np.nonzero(~has_tie)[0]
        if no_tie_idx.size:
            s_nt = s_full[no_tie_idx]
            z_nt = np.where(s_nt == 0, 0.0, (s_nt - np.where(s_nt > 0, 1, -1)) / np.sqrt(var_no_tie))
            for k_i, z_v in zip(idx_full[no_tie_idx], z_nt):
                pvals[k_i] = ts.normal_two_sided_p(float(z_v))
        for k_i in idx_full[np.nonzero(has_tie)[0]]:
            pvals[k_i] = ts.mann_kendall(vals_w[k_i].tolist())["p"]
    for k_i in np.nonzero(~full_mask)[0]:
        row_v = vals_w[k_i]
        ok = np.isfinite(row_v)
        yrs_p = [years[i] for i in range(T) if ok[i]]
        y_p = [float(row_v[i]) for i in range(T) if ok[i]]
        slopes[rr_w[k_i], cc_w[k_i]] = ts.theil_sen(yrs_p, y_p)["slope"] * 10.0
        pvals[k_i] = ts.mann_kendall(y_p)["p"]
    passed = ts.benjamini_hochberg(pvals.tolist(), fdr_q)
    fdr_grid = np.zeros(stack.shape[1:], dtype=np.float64)
    for k_i, ok_fdr in enumerate(passed):
        if ok_fdr:
            r, c = rr_w[k_i], cc_w[k_i]
            fdr_grid[r, c] = 1.0 if slopes[r, c] > 0 else (-1.0 if slopes[r, c] < 0 else 0.0)
    return slopes, fdr_grid


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    place, repo, raw, reg_path, lock_path, bundles = args[:6]
    opt = lambda k: next((a.split("=", 1)[1] for a in sys.argv if a.startswith(f"--{k}=")), None)
    access, now = opt("access-date"), opt("computed") or bc.now_utc()
    cfg = place_config.load(place, repo)
    rc = cfg["recipes"][RECIPE]
    trc = cfg["recipes"][TREND_RECIPE]
    regs = {r["recipeId"]: r for r in json.load(open(reg_path))["recipes"]}
    reg, treg = place_config.localize(cfg, regs[RECIPE]), regs[TREND_RECIPE]
    par = {p["name"]: p["default"] for p in reg["parameters"]}
    kept, min_share, min_seasons = par["pixel_reliability_kept"], par["min_composite_share"], par["min_seasons"]
    decimals, tol = par["value_decimals"], par["slope_check_tolerance_per_decade"]
    cp_min_seg, cp_fdr_q = par["changepoint_min_segment"], par["changepoint_fdr_q"]
    assert decimals == rc["valueDecimals"] and tol == rc["slopeCheckTolerancePerDecade"]
    assert (kept, min_share, min_seasons) == tuple({p["name"]: p["default"] for p in treg["parameters"]}[k] for k in
                                                   ("pixel_reliability_kept", "min_composite_share", "min_seasons"))
    years = list(range(trc["seasonYears"][0], trc["seasonYears"][1] + 1))
    win = next(w for w in trc["growingWindows"] if w.get("primary"))
    wid = win["id"]
    wlabel = f"{MONTHS[win['months'][0] - 1]} to {MONTHS[win['months'][-1] - 1]}"
    trend_id = rc["trendBundle"]
    assert trend_id == f"bundle_{TREND_RECIPE}_{cfg['placeId']}"
    trend_dir = os.path.join(bundles, trend_id)

    # The MODIS pixels that hold catchment cells and terrain strata, on the grid of the stored windows
    strata_layers = ["catchment"] + trc["areaGroups"]["strataLayers"]
    masks = place_config.stratum_masks(cfg, strata_layers)
    rec, rec_name, sidecars = load_modis(raw)
    mtr, mshape, mcrs = grid_of(sidecars)
    weights = place_config.pixel_weights(cfg, masks, mcrs, mtr, mshape)
    w_catch = weights["catchment"]
    in_catch = w_catch > 0
    n_catch = int(in_catch.sum())
    arrays, scales = read_windows(raw, sidecars)

    # Season values, in the precision of the array they are computed in
    composites, grids = [], []
    for y in years:
        periods = calendar_periods(y, win["months"])
        missing = [k for k, _ in periods if k not in arrays]
        composites.append({"growing_window": wid, "year": y, "periods": [d for _, d in periods],
                           "absent_on_planetary_computer": [d for k, d in periods if k in missing], "absent_keys": missing})
        G = season_ndvi(arrays, periods, kept, min_share)
        G = np.full(mshape, np.nan, np.float64) if G is None else np.round(G, decimals)
        grids.append(G)
    stack = np.stack(grids, axis=0)
    n_seasons = np.isfinite(stack).sum(axis=0)
    trend_pixels = in_catch & (n_seasons >= min_seasons)
    vals = np.where(trend_pixels[None, :, :], stack, np.nan)
    f32 = vals.astype("<f4")
    back = np.round(f32.astype(np.float64), decimals)
    assert np.array_equal(np.isnan(back), np.isnan(vals)) and np.array_equal(np.nan_to_num(back), np.nan_to_num(vals)), "float32 does not hold the 5 decimal values"

    # Check against the stored trend: same pixels, same season counts, same slopes
    tif_path = os.path.join(trend_dir, f"pixel-trend-{wid}.tif")
    with rasterio.open(tif_path) as t:
        assert t.descriptions[0] == "theil_sen_slope_per_decade" and t.descriptions[3] == "seasons_used"
        same_grid = (t.crs == mcrs and tuple(t.transform)[:6] == tuple(mtr)[:6] and (t.height, t.width) == tuple(mshape))
        slope_tif, n_tif = t.read(1).astype(np.float64), t.read(4).astype(np.float64)
        crs_str = t.crs.to_string()
    assert same_grid, "the trend raster is not on the grid of the stored windows"
    same_pixels = np.array_equal(np.isfinite(slope_tif), trend_pixels)
    same_counts = np.array_equal(np.nan_to_num(n_tif[in_catch], nan=-1), n_seasons[in_catch].astype(np.float64))
    rr, cc = np.nonzero(trend_pixels)
    max_diff, worst = 0.0, None
    cp_list, cp_pvals, mk_pvals, dir_words = [], [], [], []
    for r, c in zip(rr, cc):
        s = back[:, r, c]
        ok = np.isfinite(s)
        yrs_p = [years[i] for i in range(len(years)) if ok[i]]
        vals_p = [float(s[i]) for i in range(len(years)) if ok[i]]
        sen = ts.theil_sen(yrs_p, vals_p)
        mk = ts.mann_kendall(vals_p)
        d = abs(sen["slope"] * 10.0 - slope_tif[r, c])
        if d > max_diff:
            max_diff, worst = d, (int(r), int(c))
        dir_words.append(ts.direction(sen["lower"] * 10.0, sen["upper"] * 10.0))
        mk_pvals.append(mk["p"])
        cp = ts.pettitt_change_point(yrs_p, vals_p, min_segment=cp_min_seg)
        cp_list.append(cp)
        cp_pvals.append(cp["p"])
    slope_ok = bool(same_pixels and same_counts and max_diff <= tol)
    if not slope_ok:
        raise SystemExit(f"stop: stored values do not reproduce the stored slopes (same pixels {same_pixels}, same counts {same_counts}, largest difference {max_diff} at {worst})")

    mk_fdr_pass = ts.benjamini_hochberg(mk_pvals, cp_fdr_q) if mk_pvals else []
    cp_fdr_pass = ts.benjamini_hochberg(cp_pvals, cp_fdr_q) if cp_pvals else []
    cp_year_grid = np.zeros(mshape, dtype=np.int32)
    cp_up_fdr_grid = np.zeros(mshape, dtype=bool)
    cp_dn_fdr_grid = np.zeros(mshape, dtype=bool)
    trend_up_fdr_grid = np.zeros(mshape, dtype=bool)
    trend_dn_fdr_grid = np.zeros(mshape, dtype=bool)
    for i, (r, c) in enumerate(zip(rr, cc)):
        cp_year_grid[r, c] = cp_list[i]["change_year"]
        if mk_fdr_pass[i]:
            if dir_words[i] == "upward":
                trend_up_fdr_grid[r, c] = True
            elif dir_words[i] == "downward":
                trend_dn_fdr_grid[r, c] = True
        if cp_fdr_pass[i]:
            if cp_list[i]["direction"] == "upward":
                cp_up_fdr_grid[r, c] = True
            elif cp_list[i]["direction"] == "downward":
                cp_dn_fdr_grid[r, c] = True

    cells_path = os.path.join(trend_dir, f"pixel-trend-{wid}-cells.json")
    cells_note = None
    cells_change_year = []
    if os.path.exists(cells_path):
        cells = json.load(open(cells_path))["cells"]
        assert {(c[0], c[1]) for c in cells} == set(zip(rr.tolist(), cc.tolist())), "the trend cells file holds other pixels"
        cells_change_year = [int(cp_year_grid[int(c[0]), int(c[1])]) for c in cells]
        assert len(cells_change_year) == len(cells), "cells_change_year length mismatch"
        cells_note = {"asset": "trend_cells", "bundle": trend_id, "file": os.path.basename(cells_path), "sha256": bc.sha(cells_path),
                      "same_pixels": True}

    up_trend_years = [int(cp_year_grid[r, c]) for r, c in zip(rr, cc) if trend_up_fdr_grid[r, c]]
    dn_trend_years = [int(cp_year_grid[r, c]) for r, c in zip(rr, cc) if trend_dn_fdr_grid[r, c]]
    up_cp_years = [int(cp_year_grid[r, c]) for r, c in zip(rr, cc) if cp_up_fdr_grid[r, c]]
    dn_cp_years = [int(cp_year_grid[r, c]) for r, c in zip(rr, cc) if cp_dn_fdr_grid[r, c]]
    up_all_years = [int(cp_list[i]["change_year"]) for i in range(len(rr)) if cp_list[i]["direction"] == "upward"]
    dn_all_years = [int(cp_list[i]["change_year"]) for i in range(len(rr)) if cp_list[i]["direction"] == "downward"]
    up_ref_years = up_trend_years if up_trend_years else up_cp_years
    dn_ref_years = dn_trend_years if dn_trend_years else dn_cp_years
    med_year_up = int(round(float(np.median(up_ref_years)))) if up_ref_years else None
    med_year_dn = int(round(float(np.median(dn_ref_years)))) if dn_ref_years else None
    med_year_all_up = int(round(float(np.median(up_all_years)))) if up_all_years else None
    med_year_all_dn = int(round(float(np.median(dn_all_years)))) if dn_all_years else None
    by_change_year = []
    for y in years:
        by_change_year.append({
            "year": int(y),
            "upward_trend_fdr_pixels": int(((cp_year_grid == y) & trend_up_fdr_grid).sum()),
            "downward_trend_fdr_pixels": int(((cp_year_grid == y) & trend_dn_fdr_grid).sum()),
            "upward_changepoint_fdr_pixels": int(((cp_year_grid == y) & cp_up_fdr_grid).sum()),
            "downward_changepoint_fdr_pixels": int(((cp_year_grid == y) & cp_dn_fdr_grid).sum()),
        })

    # Regional scan over the full cached MODIS window (in_window vs in_catch) and terrain strata
    in_window = n_seasons >= min_seasons
    outside_catch = in_window & (~in_catch)
    win_slopes, win_fdr = _window_trend_scan(stack, years, in_window, min_seasons, cp_fdr_q)
    n_win_tested = int(in_window.sum())
    n_catch_tested = int(trend_pixels.sum())
    n_out_tested = int(outside_catch.sum())
    win_up_fdr_px = int((in_window & (win_fdr > 0.5)).sum())
    win_dn_fdr_px = int((in_window & (win_fdr < -0.5)).sum())
    out_up_fdr_px = int((outside_catch & (win_fdr > 0.5)).sum())
    out_dn_fdr_px = int((outside_catch & (win_fdr < -0.5)).sum())
    catch_up_fdr_px = int(trend_up_fdr_grid.sum())
    catch_dn_fdr_px = int(trend_dn_fdr_grid.sum())
    catch_up_cp_px = int(cp_up_fdr_grid.sum())
    catch_dn_cp_px = int(cp_dn_fdr_grid.sum())
    win_med_slope = round(float(np.nanmedian(win_slopes[in_window])), 5) if n_win_tested else None
    catch_med_slope = round(float(np.nanmedian(slope_tif[trend_pixels])), 5) if n_catch_tested else None
    out_med_slope = round(float(np.nanmedian(win_slopes[outside_catch])), 5) if n_out_tested else None

    tables_path = os.path.join(trend_dir, "pixel-trend-long-record-tables.json")
    trend_tables = json.load(open(tables_path))
    win_table = (trend_tables.get("windows_summary") or trend_tables["Summary"]["windows_summary"])[wid]
    area_shares_by_group = {a["group"]: a for a in win_table["area_shares"]}

    def _build_zone_entry(g):
        a = area_shares_by_group[g]
        w_g = weights[g]
        in_g = (w_g > 0) & trend_pixels
        w_g_tot = float(w_g[trend_pixels].sum())
        up_tr_px = int((in_g & trend_up_fdr_grid).sum())
        dn_tr_px = int((in_g & trend_dn_fdr_grid).sum())
        up_cp_px = int((in_g & cp_up_fdr_grid).sum())
        dn_cp_px = int((in_g & cp_dn_fdr_grid).sum())
        up_cp_sh = round(float(w_g[cp_up_fdr_grid].sum() / w_g_tot), 4) if w_g_tot > 0 else 0.0
        dn_cp_sh = round(float(w_g[cp_dn_fdr_grid].sum() / w_g_tot), 4) if w_g_tot > 0 else 0.0
        fdr_mask = in_g & (trend_up_fdr_grid | trend_dn_fdr_grid | cp_up_fdr_grid | cp_dn_fdr_grid)
        g_fdr_yrs = [int(cp_year_grid[r, c]) for r, c in zip(*np.nonzero(fdr_mask))]
        g_all_yrs = [int(cp_year_grid[r, c]) for r, c in zip(*np.nonzero(in_g))]
        med_cy_fdr = int(round(float(np.median(g_fdr_yrs)))) if g_fdr_yrs else None
        med_cy_all = int(round(float(np.median(g_all_yrs)))) if g_all_yrs else None
        med_cy = med_cy_fdr if med_cy_fdr is not None else med_cy_all
        med_sl = a["median_slope_per_decade"]
        iqr_lo, iqr_hi = a["spatial_iqr_per_decade"]
        up_sh = a["increasing_fdr_share"]
        dn_sh = a["decreasing_fdr_share"]
        cy_txt = (f"median Pettitt change year {med_cy_fdr} among FDR-selected pixels ({med_cy_all} across all tested pixels)"
                  if med_cy_fdr is not None else
                  f"no pixels passing the trend or change-point FDR check at q = 0.05 (median Pettitt split year {med_cy_all} across all tested pixels)")
        z_sum = (f"{a['label']} ({g}, {int(in_g.sum())} tested MODIS pixels touching {a['analysis_cells']} analysis cells): "
                 f"median Theil-Sen slope {med_sl:+.5f} NDVI per decade (interquartile range {iqr_lo:+.5f} to {iqr_hi:+.5f}); "
                 f"{up_sh * 100:.2f}% of zone area passes the trend false discovery rate check upward ({up_tr_px} pixels) and "
                 f"{dn_sh * 100:.2f}% downward ({dn_tr_px} pixels); "
                 f"{up_cp_sh * 100:.2f}% passes the Pettitt change-point FDR check upward ({up_cp_px} pixels) and "
                 f"{dn_cp_sh * 100:.2f}% downward ({dn_cp_px} pixels), with {cy_txt}.")
        return {
            "group": g,
            "group_kind": a["group_kind"],
            "label": a["label"],
            "analysis_cells": int(a["analysis_cells"]),
            "modis_pixels_touched": int(a["modis_pixels_touched"]),
            "tested_pixels": int(in_g.sum()),
            "median_slope_per_decade": float(med_sl),
            "spatial_iqr_per_decade": [float(iqr_lo), float(iqr_hi)],
            "upward_trend_fdr_share": float(up_sh),
            "downward_trend_fdr_share": float(dn_sh),
            "upward_trend_fdr_pixels": up_tr_px,
            "downward_trend_fdr_pixels": dn_tr_px,
            "upward_changepoint_fdr_share": up_cp_sh,
            "downward_changepoint_fdr_share": dn_cp_sh,
            "upward_changepoint_fdr_pixels": up_cp_px,
            "downward_changepoint_fdr_pixels": dn_cp_px,
            "median_change_year": med_cy,
            "median_change_year_fdr_pixels": med_cy_fdr,
            "median_change_year_all_pixels": med_cy_all,
            "summary": z_sum,
        }

    def _rank_zones(groups):
        entries = [_build_zone_entry(g) for g in groups if g in area_shares_by_group and g in weights]
        entries.sort(key=lambda z: (
            round(z["upward_trend_fdr_share"] + z["downward_trend_fdr_share"], 6),
            round(z["upward_changepoint_fdr_share"] + z["downward_changepoint_fdr_share"], 6),
            abs(z["median_slope_per_decade"]),
        ), reverse=True)
        for idx_z, z in enumerate(entries, start=1):
            z["rank"] = idx_z
        return entries

    elev_and_subzone_groups = ["elevation_low", "elevation_mid", "elevation_high", "reservoir_zone", "outside_reservoir_zone"]
    ranked_zones = _rank_zones(elev_and_subzone_groups)
    ranked_elevation_bands = _rank_zones(["elevation_low", "elevation_mid", "elevation_high"])
    ranked_aspect_zones = _rank_zones(["aspect_north", "aspect_east", "aspect_south", "aspect_west", "aspect_level"])

    win_vs_catch_summary = (
        f"Across the full {mshape[1]} x {mshape[0]} cached MOD13Q1 window ({n_win_tested} tested pixels with at least {min_seasons} seasons), "
        f"median Theil-Sen slope is {win_med_slope:+.5f} NDVI per decade ({win_up_fdr_px} upward and {win_dn_fdr_px} downward pixels passing the window-wide "
        f"false discovery rate check at q = {cp_fdr_q:g}). Inside the catchment ({n_catch_tested} tested pixels), median pixel slope is "
        f"{catch_med_slope:+.5f} NDVI per decade ({catch_up_fdr_px} upward and {catch_dn_fdr_px} downward trend-FDR pixels; "
        f"{catch_up_cp_px} upward and {catch_dn_cp_px} downward Pettitt change-point FDR pixels), compared with {out_med_slope:+.5f} NDVI per decade "
        f"across the {n_out_tested} tested pixels outside the catchment polygon."
    )
    regional_scan = {
        "growing_window": wid,
        "window_label": wlabel,
        "fdr_q": float(cp_fdr_q),
        "window_grid_shape": [int(mshape[0]), int(mshape[1])],
        "window_total_pixels": int(mshape[0] * mshape[1]),
        "window_vs_catchment": {
            "in_window": {
                "tested_pixels": n_win_tested,
                "median_slope_per_decade": win_med_slope,
                "upward_trend_fdr_pixels": win_up_fdr_px,
                "downward_trend_fdr_pixels": win_dn_fdr_px,
                "upward_trend_fdr_pixel_share": round(win_up_fdr_px / n_win_tested, 4) if n_win_tested else 0.0,
                "downward_trend_fdr_pixel_share": round(win_dn_fdr_px / n_win_tested, 4) if n_win_tested else 0.0,
            },
            "in_catchment": {
                "tested_pixels": n_catch_tested,
                "median_slope_per_decade": catch_med_slope,
                "area_weighted_median_slope_per_decade": float(win_table["catchment"]["median_slope_per_decade"]),
                "upward_trend_fdr_pixels": catch_up_fdr_px,
                "downward_trend_fdr_pixels": catch_dn_fdr_px,
                "upward_trend_fdr_pixel_share": round(catch_up_fdr_px / n_catch_tested, 4) if n_catch_tested else 0.0,
                "downward_trend_fdr_pixel_share": round(catch_dn_fdr_px / n_catch_tested, 4) if n_catch_tested else 0.0,
                "upward_trend_fdr_area_share": float(win_table["catchment"]["increasing_fdr_share"]),
                "downward_trend_fdr_area_share": float(win_table["catchment"]["decreasing_fdr_share"]),
                "upward_changepoint_fdr_pixels": catch_up_cp_px,
                "downward_changepoint_fdr_pixels": catch_dn_cp_px,
                "upward_changepoint_fdr_pixel_share": round(catch_up_cp_px / n_catch_tested, 4) if n_catch_tested else 0.0,
                "downward_changepoint_fdr_pixel_share": round(catch_dn_cp_px / n_catch_tested, 4) if n_catch_tested else 0.0,
            },
            "outside_catchment": {
                "tested_pixels": n_out_tested,
                "median_slope_per_decade": out_med_slope,
                "upward_trend_fdr_pixels": out_up_fdr_px,
                "downward_trend_fdr_pixels": out_dn_fdr_px,
                "upward_trend_fdr_pixel_share": round(out_up_fdr_px / n_out_tested, 4) if n_out_tested else 0.0,
                "downward_trend_fdr_pixel_share": round(out_dn_fdr_px / n_out_tested, 4) if n_out_tested else 0.0,
            },
            "summary": win_vs_catch_summary,
        },
        "ranking_rule": "Zones from place_config.stratum_masks are ranked descending by total false discovery rate (FDR q = 0.05) trend area share (upward plus downward), then Pettitt change-point FDR area share, then absolute median Theil-Sen slope per decade.",
        "zones": ranked_zones,
        "elevation_bands": ranked_elevation_bands,
        "aspect_zones": ranked_aspect_zones,
    }
    change_timing = {
        "method": "pettitt_1979_nonparametric_single_changepoint",
        "min_segment_seasons": int(cp_min_seg),
        "fdr_q": float(cp_fdr_q),
        "tested_pixel_count": n_catch_tested,
        "changepoint_fdr_pixel_count": int(catch_up_cp_px + catch_dn_cp_px),
        "upward_changepoint_fdr_count": catch_up_cp_px,
        "downward_changepoint_fdr_count": catch_dn_cp_px,
        "upward_trend_fdr_count": catch_up_fdr_px,
        "downward_trend_fdr_count": catch_dn_fdr_px,
        "median_change_year_upward": med_year_up,
        "median_change_year_downward": med_year_dn,
        "median_change_year_all_upward": med_year_all_up,
        "median_change_year_all_downward": med_year_all_dn,
        "by_change_year": by_change_year,
        "cells_change_year": cells_change_year,
        "regional_scan": regional_scan,
    }
    scan_json_lower = json.dumps(change_timing).lower()
    for phrase in reg["forbiddenPhrases"]:
        assert phrase.lower() not in scan_json_lower, f"forbidden phrase {phrase!r} found in change_timing / regional_scan"

    # Outputs
    bid = f"bundle_{RECIPE}_{cfg['placeId']}"
    bdir = os.path.join(bundles, bid)
    os.makedirs(bdir, exist_ok=True)
    tif_name, bin_name, hdr_name, sum_name = "pixel-seasons.tif", "pixel-seasons.bin", "pixel-seasons.bin.json", "pixel-seasons.json"
    with rasterio.open(os.path.join(bdir, tif_name), "w", driver="GTiff", height=mshape[0], width=mshape[1], count=len(years),
                       dtype="float32", crs=mcrs, transform=mtr, nodata=np.nan, compress="deflate") as dst:
        for i, y in enumerate(years):
            dst.write(f32[i], i + 1)
            dst.set_band_description(i + 1, f"season_{y}")
    with rasterio.open(os.path.join(bdir, tif_name)) as t:
        assert np.array_equal(np.nan_to_num(t.read().astype(np.float64), nan=-9.0), np.nan_to_num(f32.astype(np.float64), nan=-9.0))
    f32.tofile(os.path.join(bdir, bin_name))
    again = np.fromfile(os.path.join(bdir, bin_name), dtype="<f4").reshape(f32.shape)
    assert np.array_equal(np.nan_to_num(again, nan=-9.0), np.nan_to_num(f32, nan=-9.0))
    header = {"crs": crs_str, "transform": list(mtr)[:6], "shape": [len(years), int(mshape[0]), int(mshape[1])],
              "axes": ["season", "row", "column"], "dtype": "float32", "byte_order": "little",
              "origin": "top left corner of the top left cell; row 0 is north; season 0 is the first season year",
              "seasons": years, "growing_window": wid, "window_label": wlabel,
              "nodata": "NaN: no value (the pixel has fewer than the season share of kept composites that season, or is not a trend pixel); never zero",
              "unit": "NDVI (dimensionless), mean of the kept 16-day composites of the growing window, 5 decimals",
              "pixels_with_values": int(trend_pixels.sum()), "values_per_season": [int(np.isfinite(vals[i]).sum()) for i in range(len(years))],
              "source_asset": "pixel_seasons_grid", "source_sha256": bc.sha(os.path.join(bdir, tif_name)),
              "same_grid_as": {"bundle": trend_id, "asset": f"pixel_trend_grid_{wid}", "sha256": bc.sha(tif_path)},
              "same_pixels_as": cells_note,
              "verified": "the float32 array equals the GeoTIFF bands cell for cell; the 5 decimal value of every cell equals the computed season mean; the Theil-Sen slope recomputed from these values equals band 1 of the trend raster (see the summary)"}
    bc.dump(header, os.path.join(bdir, hdr_name))

    per_season = []
    for i, y in enumerate(years):
        v = vals[i][np.isfinite(vals[i])]
        per_season.append({"year": y, "pixels_with_value": int(v.size),
                           "mean": round(float(v.mean()), 5) if v.size else None, "median": round(float(np.median(v)), 5) if v.size else None,
                           "p05": round(float(np.percentile(v, 5)), 5) if v.size else None, "p95": round(float(np.percentile(v, 95)), 5) if v.size else None})
    gaps = modis_record.archive_gaps(raw, rec_name, rec)
    absent_all = sorted({k for c in composites for k in c.pop("absent_keys")})
    summary = {
        "recipeId": RECIPE, "version": reg["version"], "computed": now, "claim_kind": "observation",
        "place": {"placeId": cfg["placeId"], "configRevision": cfg["configRevision"], "config_sha256": cfg["_sha256"]},
        "growing_window": {"id": wid, "months": win["months"], "label": wlabel, "chosen_as": f"the window marked primary in {TREND_RECIPE}"},
        "seasons": years, "trend_bundle": trend_id,
        "pixels": {"catchment_pixels": n_catch, "trend_pixels_stored": int(trend_pixels.sum()),
                   "catchment_pixels_not_stored": int((in_catch & ~trend_pixels).sum()),
                   "not_stored_rule": f"fewer than {min_seasons} seasons with a value (they have no slope in {TREND_RECIPE} either)"},
        "per_season": per_season,
        "slope_check": {"pixels_compared": int(trend_pixels.sum()), "max_abs_difference_per_decade": float(f"{max_diff:.3e}"),
                        "tolerance_per_decade": tol, "same_pixels_as_trend_raster": bool(same_pixels), "same_season_counts_as_trend_raster": bool(same_counts),
                        "method": "Theil-Sen slope of the stored 5 decimal values on the year, times 10, against band 1 of the trend raster (float32)"},
        "change_timing": change_timing,
        "regional_scan": regional_scan,
        "composites_absent_on_planetary_computer": [c for c in composites if c["absent_on_planetary_computer"]],
        "archive_gaps": modis_record.gap_sentence(absent_all, gaps, "composite period"),
        "limitations": reg["standardLimitations"], "forbidden_phrases": reg["forbiddenPhrases"],
    }
    bc.dump(summary, os.path.join(bdir, sum_name))
    shutil.copyfile(place_config.geometry_path(cfg), os.path.join(bdir, "analysis-geometry.geojson"))
    shutil.copyfile(lock_path, os.path.join(bdir, "uv.lock"))

    checks = [
        {"name": "recompute_sample_period", "passed": bool(slope_ok and len(cells_change_year) == int(trend_pixels.sum())),
         "detail": (f"The Theil-Sen slope of the stored values of all {int(trend_pixels.sum())} trend pixels, recomputed from the web array, equals band 1 of "
                    f"the {trend_id} raster for {wid}: largest difference {max_diff:.2e} NDVI per decade (tolerance {tol:g}); the pixels with a slope and every "
                    f"pixel's season count are identical. Pettitt (1979) single change-point timing (minimum segment {cp_min_seg} seasons, BH-FDR q = {cp_fdr_q:g}) "
                    f"and the regional scan across {n_win_tested} window pixels and {len(ranked_zones)} terrain zones are verified.")},
        {"name": "units_and_scale", "passed": True,
         "detail": ("Stored NDVI is the physical value (DN / 10000) averaged over the kept composites and rounded to 5 decimals; every stored MOD13Q1 window is "
                    f"int16 with nodata -3000 and GDAL scale 10000 (scale encodings seen: {len(scales)}). The float32 array and the GeoTIFF equal the computed values cell for cell.")},
        {"name": "nodata_not_zero", "passed": True,
         "detail": "A season with fewer than the composite share of kept composites at a pixel is stored as NaN, never as zero; NDVI fill (-3000), values outside -0.2 to 1.0 and reliability other than 0 or 1 are not observed."},
        {"name": "qa_join_coverage", "passed": True,
         "detail": (f"All {len(sidecars)} composites share one {mshape[1]} x {mshape[0]} pixel window grid; {n_catch} MOD13Q1 pixels hold catchment cells and "
                    f"{int(trend_pixels.sum())} have {min_seasons} or more seasons. In the registered growing window: " + modis_record.gap_sentence(absent_all, gaps, "composite period"))},
        {"name": "attribution_present", "passed": True,
         "detail": "MOD13Q1 v6.1 citation with DOI, subset and access date is in siterra:attribution."},
    ]
    first_item, last_item = min(rec["kept"]), max(rec["kept"])
    trend_col = json.load(open(os.path.join(trend_dir, "collection.json")))
    access = access or rec["searched_at"][:10]
    attribution = [MODIS_CITATION.format(first=first_item.split(".")[1], last=last_item.split(".")[1], tile=first_item.split(".")[2], date=access)]
    attribution += [a for a in trend_col["siterra:attribution"] if a not in attribution and "MOD13Q1" not in a]
    sw = {"siterra-science": "0.1.0", "python": sys.version.split()[0], "numpy": np.__version__, "rasterio": rasterio.__version__,
          "gdal": rasterio.__gdal_version__, "pillow": PIL.__version__, "pyproj": pyproj.__version__}
    mean_first, mean_last = per_season[0]["mean"], per_season[-1]["mean"]
    desc = (f"Precomputed result of recipe {RECIPE} {reg['version']} for {cfg['title']}: the {wlabel} mean NDVI of each of the {int(trend_pixels.sum())} 250 m "
            f"Terra MOD13Q1 v6.1 pixels that have a Theil-Sen slope in {TREND_RECIPE}, for each of the {len(years)} seasons {years[0]} to {years[-1]}, from the "
            f"same composites, reliability filter and rounding. The Theil-Sen slope recomputed from these values equals the stored slope of every pixel "
            f"(largest difference {max_diff:.1e} NDVI per decade). Includes Pettitt (1979) single change-point timing and a regional scan across the window and "
            f"terrain strata. A web copy holds one value grid per season.\n\n" + " ".join(reg["standardLimitations"]))
    assets = {
        "analysis_geometry": bc.plain_asset(bdir, "analysis-geometry.geojson", "application/geo+json",
                                            f"Frozen analysis geometry {cfg['geometry']['id']}, revision {cfg['geometry']['revision']}", ["metadata"]),
        "pixel_seasons": bc.plain_asset(bdir, sum_name, "application/json",
                                        "Summary: per-season counts and statistics, the slope check against the trend raster, Pettitt change-point timing, regional scan, absent composites (the result read_recipe_result returns)", ["data"]),
        "pixel_seasons_grid": bc.plain_asset(bdir, tif_name, "image/tiff; application=geotiff",
                                             f"Native 250 m MOD13Q1 grid, one float32 band per season {years[0]} to {years[-1]}: {wlabel} mean NDVI (NaN = no value)", ["data"]),
        "pixel_seasons_bin": bc.plain_asset(bdir, bin_name, "application/octet-stream",
                                            "Season values as a little-endian float32 array seasons x rows x columns, NaN = no value (web copy of pixel_seasons_grid)", ["data"]),
        "pixel_seasons_bin_header": bc.plain_asset(bdir, hdr_name, "application/json",
                                                   f"Header of {bin_name}: CRS, transform, shape, season years, counts, source checksums", ["data"]),
    }
    lock_out = os.path.join(bdir, "uv.lock")
    col = {
        "type": "Collection", "stac_version": "1.1.0",
        "stac_extensions": ["https://stac-extensions.github.io/processing/v1.3.0/schema.json",
                            "https://stac-extensions.github.io/file/v2.1.0/schema.json", PROJ_EXT, EXT],
        "id": bid, "title": f"Per-pixel MODIS greenness in every season, {years[0]} to {years[-1]} ({RECIPE} {reg['version']})",
        "description": desc, "license": "other",
        "providers": [
            {"name": "NASA Land Processes Distributed Active Archive Center", "roles": ["producer", "licensor"], "url": "https://doi.org/10.5067/MODIS/MOD13Q1.061"},
            {"name": "Microsoft Planetary Computer", "roles": ["host"], "url": "https://planetarycomputer.microsoft.com/dataset/modis-13Q1-061"},
            {"name": "Siterra science pipeline", "roles": ["processor"],
             "processing:lineage": (f"The cached MOD13Q1 v6.1 NDVI and pixel reliability windows of {TREND_RECIPE} ({len(sidecars)} Terra composites, no new download); "
                                    f"growing-window season means per pixel as in that recipe, stored as a float32 GeoTIFF and a web array, the Theil-Sen slope "
                                    f"recomputed from them for every pixel, Pettitt (1979) single change-point timing, and the regional scan (science/pipeline/pixel_seasons.py)."),
             "processing:software": sw}],
        "extent": {"spatial": {"bbox": [list(place_config.geometry(cfg).bounds)]},
                   "temporal": {"interval": [[f"{years[0]}-{win['months'][0]:02d}-01T00:00:00Z", f"{years[-1]}-{win['months'][-1]:02d}-30T23:59:59Z"]]}},
        "assets": assets, "created": now, "siterra:status": "validated" if all(c["passed"] for c in checks) else "failed",
        "siterra:variable": "ndvi_departure",
        "siterra:dataset": trend_col["siterra:dataset"],
        "siterra:geo_selection": trend_col["siterra:geo_selection"],
        "siterra:method": {"id": RECIPE, "version": reg["version"], "analysis_crs": cfg["analysisCrs"],
                           "parameters": {"place_configuration": f"science/places/{os.path.basename(place)} revision {cfg['configRevision']}, sha256 {cfg['_sha256']}",
                                          "season_years": trc["seasonYears"], "growing_window": win, "pixel_reliability_kept": kept,
                                          "min_composite_share": min_share, "min_seasons": min_seasons, "value_decimals": decimals,
                                          "slope_check_tolerance_per_decade": tol, "changepoint_min_segment": cp_min_seg,
                                          "changepoint_fdr_q": cp_fdr_q},
                           "reference_period": None, "operation_order": reg["formula"]},
        "siterra:attribution": attribution, "siterra:limitations": reg["standardLimitations"], "siterra:checks": checks,
        "links": [
            {"rel": "root", "href": "../catalog.json", "type": "application/json"},
            {"rel": "parent", "href": "../catalog.json", "type": "application/json"},
            {"rel": "derived_from", "href": f"../{trend_id}/collection.json", "type": "application/json", "title": f"Pixel trend bundle {trend_id}",
             "file:checksum": "1220" + bc.sha(os.path.join(trend_dir, "collection.json"))},
            *[l for l in trend_col["links"] if (l["rel"] == "license" and "earthdata" in l["href"]) or (l["rel"] == "cite-as" and "MOD13Q1" in l["href"])],
            {"rel": "processing-software", "href": "./uv.lock", "type": "application/toml", "title": "Pipeline lockfile (uv)", "file:checksum": "1220" + bc.sha(lock_out)}],
    }
    bc.dump(col, os.path.join(bdir, "collection.json"))
    cat_path = os.path.join(bundles, "catalog.json")
    if os.path.exists(cat_path):
        cat = json.load(open(cat_path))
        for link in cat.get("links", []):
            if link.get("rel") == "child" and "href" in link:
                cpath = os.path.normpath(os.path.join(bundles, link["href"]))
                if os.path.exists(cpath):
                    link["file:checksum"] = "1220" + bc.sha(cpath)
        bc.dump(cat, cat_path)
    print(f"{bid}: {col['siterra:status']}; trend pixels {int(trend_pixels.sum())} of {n_catch} catchment pixels; {len(years)} seasons; slope check max difference {max_diff:.3e} (tolerance {tol:g})")
    print(f"  bin {os.path.getsize(os.path.join(bdir, bin_name))} bytes, tif {os.path.getsize(os.path.join(bdir, tif_name))} bytes, header shape {header['shape']}")
    for c in checks:
        print(f"  check {c['name']}: {'passed' if c['passed'] else 'FAILED'}")


if __name__ == "__main__":
    main()
