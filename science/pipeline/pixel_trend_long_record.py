"""Precompute pixel_trend_long_record for a place and write it as a derived bundle (STAC Collection with JSON results,
native-grid slope GeoTIFFs, static overview PNGs and 16 geographic reveal-step PNG frames).

Usage: python -I pixel_trend_long_record.py <place.json> <repo_root> <modis_raw_dir> <dem.tif> <tokens.json>
       <registry.json> <lockfile> <bundles_dir> [--access-date=YYYY-MM-DD]

Follows the pre-registered pixel_trend_long_record 1.0.0 recipe and SCI-52:
- Per-pixel Theil-Sen slope (NDVI per decade, 2000 to 2025) and Mann-Kendall p across all catchment pixels.
- Benjamini-Hochberg false discovery rate (FDR, q = 0.05) across catchment pixels with a slope in the window.
- Map rasters and PNG display frames show slope direction/magnitude classes only (never pixel-wise significance maps,
  per SCI-52), with insufficient-season pixels left transparent.
- Generates static overview PNGs and 16 geographic reveal-step PNG frames ordered by distance from the catchment outlet
  up the valley.
"""
import calendar
import collections
import datetime
import io
import json
import math
import os
import shutil
import sys

import numpy as np
import PIL
import pyproj
import rasterio
from PIL import Image
from rasterio.transform import from_origin
from rasterio.warp import Resampling, reproject
from shapely.geometry import shape

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import modis_record  # noqa: E402
import place_config  # noqa: E402
import restrend_rerun  # noqa: E402
import trend_stats as ts  # noqa: E402
from modis_ndvi import (MODIS_CITATION, NDVI_ASSET, REL_ASSET, calendar_periods, grid_of, load_modis,  # noqa: E402
                        read_windows, season_ndvi)

RECIPE = "pixel_trend_long_record"
EXT = "https://siterra.invalid/schemas/stac/siterra/1.1.0/schema.json"
PROJ_EXT = "https://stac-extensions.github.io/projection/v2.1.0/schema.json"
NDVI_DECIMALS = 5
SLOPE_DECIMALS = 5
SHARE_DECIMALS = 4
R_MERC = 6378137.0


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


def hexrgb(h):
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))


def palette(tokens_path):
    g = json.load(open(tokens_path))["theme"]["light"]["data"]["ndvi-departure"]
    arm = lambda side: [hexrgb(g[f"{side}-{k}"]["$value"]["hex"]) for k in (1, 2, 3)]
    return arm("below"), arm("above")


def paint_slope(arr, below, above, domain, neutral, steps):
    """RGBA bytes for a slope-per-decade array: unpainted within neutral of zero and where NaN.
    Shows slope magnitude and direction only (never p-values or FDR classes, per SCI-52)."""
    h, w = arr.shape
    rgba = np.zeros((h, w, 4), np.uint8)
    d = np.nan_to_num(arr, nan=0.0)
    on = ~np.isnan(arr) & (np.abs(d) >= neutral)
    t = np.round(np.clip((np.abs(d) - neutral) / (domain[1] - neutral), 0, 1) * steps) / steps
    for arm, side in ((below, d < 0), (above, d > 0)):
        c = [np.array(x, np.float64) for x in arm]
        lo = t < 0.5
        k = np.where(lo, t * 2, t * 2 - 1)[..., None]
        col = np.where(lo[..., None], c[0] + (c[1] - c[0]) * k, c[1] + (c[2] - c[1]) * k)
        sel = on & side
        rgba[sel, :3] = np.round(col[sel]).astype(np.uint8)
        rgba[sel, 3] = np.round(255 * (0.10 + 0.70 * t[sel])).astype(np.uint8)
    return rgba


def png_bytes(rgba):
    b = io.BytesIO()
    Image.fromarray(rgba, "RGBA").save(b, "PNG", optimize=True)
    return b.getvalue()


def connected_clusters(class_grid, target_class, min_pixels, w_catch, pix_lon, pix_lat, pix_elev_med,
                       w_groups, lc_ids, aspect_ids, slope_dec):
    """8-connected components of target_class on the native MOD13Q1 grid with at least min_pixels."""
    H, W = class_grid.shape
    visited = np.zeros((H, W), dtype=bool)
    target = (class_grid == target_class)
    clusters = []
    for r0 in range(H):
        for c0 in range(W):
            if not target[r0, c0] or visited[r0, c0]:
                continue
            q = collections.deque([(r0, c0)])
            visited[r0, c0] = True
            comp = []
            while q:
                r, c = q.popleft()
                comp.append((r, c))
                for dr in (-1, 0, 1):
                    for dc in (-1, 0, 1):
                        if dr == 0 and dc == 0:
                            continue
                        nr, nc = r + dr, c + dc
                        if 0 <= nr < H and 0 <= nc < W and target[nr, nc] and not visited[nr, nc]:
                            visited[nr, nc] = True
                            q.append((nr, nc))
            if len(comp) < min_pixels:
                continue
            rs = np.array([p[0] for p in comp], dtype=np.int64)
            cs = np.array([p[1] for p in comp], dtype=np.int64)
            cells = w_catch[rs, cs]
            tot_cells = float(cells.sum())
            area_km2 = round(tot_cells * 100.0 / 1e6, 4)
            lon = round(float((cells * pix_lon[rs, cs]).sum() / tot_cells), 5)
            lat = round(float((cells * pix_lat[rs, cs]).sum() / tot_cells), 5)
            elevs = pix_elev_med[rs, cs]
            valid_el = elevs[~np.isnan(elevs)]
            med_elev = round(float(np.median(valid_el)), 1) if valid_el.size else None
            lc_shares = {gid: round(float(w_groups[gid][rs, cs].sum() / tot_cells), SHARE_DECIMALS) for gid in lc_ids}
            asp_shares = {aid: round(float(w_groups[aid][rs, cs].sum() / tot_cells), SHARE_DECIMALS) for aid in aspect_ids}
            sl = slope_dec[rs, cs]
            clusters.append({
                "pixels": int(len(comp)),
                "analysis_cells": int(round(tot_cells)),
                "area_km2": area_km2,
                "centroid_lon_lat": [lon, lat],
                "median_elevation_m": med_elev,
                "median_slope_per_decade": round(float(np.median(sl)), SLOPE_DECIMALS),
                "slope_range_per_decade": [round(float(sl.min()), SLOPE_DECIMALS), round(float(sl.max()), SLOPE_DECIMALS)],
                "land_cover_shares": lc_shares,
                "aspect_shares": asp_shares,
            })
    clusters.sort(key=lambda x: (-x["pixels"], -x["analysis_cells"], x["centroid_lon_lat"][0]))
    return clusters


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    place, repo, raw, dem_path, tokens_path, reg_path, lock_path, bundles = args[:8]
    access = next((a.split("=", 1)[1] for a in sys.argv if a.startswith("--access-date=")), None)
    cfg = place_config.load(place, repo)
    rc = cfg["recipes"][RECIPE]
    reg = {r["recipeId"]: r for r in json.load(open(reg_path))["recipes"]}[RECIPE]
    reg = place_config.localize(cfg, reg)  # a place states its own wording where the registry's would name another place
    par = {p["name"]: p["default"] for p in reg["parameters"]}
    kept = par["pixel_reliability_kept"]
    min_share = par["min_composite_share"]
    min_seasons = par["min_seasons"]
    level = par["interval_level"]
    fdr_q = par["fdr_q"]
    min_cluster = rc["minClusterPixels"]
    disp_cfg = rc["display"]
    domain = tuple(disp_cfg["domainPerDecade"])
    neutral = disp_cfg["neutralPerDecade"]
    px_m = float(disp_cfg["pixelM"])
    steps = int(disp_cfg["steps"])
    years = list(range(rc["seasonYears"][0], rc["seasonYears"][1] + 1))
    gws = rc["growingWindows"]
    gw_primary = next(w["id"] for w in gws if w.get("primary"))
    now = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    # Build area group masks on the 10 m analysis grid
    atr, ashp, cmask = place_config.analysis_grid(cfg)
    strata_names = rc["areaGroups"]["strataLayers"]
    s_masks = place_config.stratum_masks(cfg, ["catchment"] + strata_names)
    s_labels = place_config.stratum_labels(cfg)
    elev = place_config.elevation(cfg, dem_path)
    eb_ref = rc["areaGroups"]["elevationBandSet"]
    eb_def = place_config.band_set(cfg, eb_ref)
    eb_list = place_config.elevation_band_masks(cfg, elev, [eb_def])[eb_def["id"]]
    lc_dict = place_config.land_cover_masks(cfg) if rc["areaGroups"].get("landCoverGroups") else {}

    group_masks = {}
    group_meta = []
    for sid, m in s_masks.items():
        grp = "catchment" if sid == "catchment" else next(
            lay["name"] for lay in cfg["strata"]["layers"] if sid in lay["classes"].values()
        )
        group_masks[sid] = m
        group_meta.append({"id": sid, "group_kind": grp, "label": s_labels.get(sid, sid)})
    for bid, blabel, bm in eb_list:
        group_masks[bid] = bm
        group_meta.append({"id": bid, "group_kind": eb_def["id"], "label": blabel})
    for lcid, (lclabel, lcm) in lc_dict.items():
        group_masks[lcid] = lcm
        group_meta.append({"id": lcid, "group_kind": "land_cover", "label": lclabel})

    lc_ids = [g["id"] for g in cfg["landCover"]["groups"]]
    aspect_ids = list(next(lay["classes"].values() for lay in cfg["strata"]["layers"] if lay["name"] == "aspect_class"))

    # MODIS grid and cell-to-pixel indexing
    rec, rec_name, sidecars = load_modis(raw)
    mtr, mshape, mcrs = grid_of(sidecars)
    rows, cols, xs, ys, flat = place_config.cell_pixel_index(cfg, mcrs, mtr, mshape)
    w_groups = place_config.pixel_weights(cfg, group_masks, mcrs, mtr, mshape)
    w_catch = w_groups["catchment"]
    in_catch = w_catch > 0
    pr_idx, pc_idx = np.nonzero(in_catch)
    n_catch_pixels = int(in_catch.sum())

    # Per-MODIS-pixel centroid (lon, lat), median elevation, and distance from the catchment outlet
    to_4326 = pyproj.Transformer.from_crs(cfg["analysisCrs"], "EPSG:4326", always_xy=True).transform
    to_32629_from_4326 = pyproj.Transformer.from_crs("EPSG:4326", cfg["analysisCrs"], always_xy=True).transform
    geom_feat = json.load(open(place_config.geometry_path(cfg)))["features"][0]
    outlet_lon, outlet_lat = geom_feat["properties"]["outlet_snapped"]
    outlet_x, outlet_y = to_32629_from_4326(outlet_lon, outlet_lat)

    pix_x = np.bincount(flat, weights=xs, minlength=mshape[0] * mshape[1]).reshape(mshape)
    pix_y = np.bincount(flat, weights=ys, minlength=mshape[0] * mshape[1]).reshape(mshape)
    with np.errstate(invalid="ignore", divide="ignore"):
        pix_x = np.where(in_catch, pix_x / np.maximum(w_catch, 1), np.nan)
        pix_y = np.where(in_catch, pix_y / np.maximum(w_catch, 1), np.nan)
    lon_arr, lat_arr = to_4326(pix_x[in_catch], pix_y[in_catch])
    pix_lon = np.full(mshape, np.nan, np.float64)
    pix_lat = np.full(mshape, np.nan, np.float64)
    pix_lon[in_catch] = lon_arr
    pix_lat[in_catch] = lat_arr

    # Distance of each catchment MODIS pixel from the outlet (km along the valley in EPSG:32629)
    pix_dist_m = np.hypot(pix_x - outlet_x, pix_y - outlet_y)
    catch_dists = pix_dist_m[in_catch]
    dist_order = np.argsort(catch_dists, kind="mergesort")
    step_Thresholds_m = []
    pixel_step = np.zeros(mshape, dtype=np.uint8)
    for s_idx in range(steps):
        lo_i = (s_idx * n_catch_pixels) // steps
        hi_i = ((s_idx + 1) * n_catch_pixels) // steps
        sel_flat = dist_order[lo_i:hi_i]
        pixel_step[pr_idx[sel_flat], pc_idx[sel_flat]] = s_idx + 1
        step_Thresholds_m.append(round(float(catch_dists[sel_flat[-1]]), 1))

    # Median elevation per MODIS pixel from its 10 m cells
    cell_elev = elev[rows, cols]
    order_flat = np.argsort(flat, kind="mergesort")
    sorted_flat = flat[order_flat]
    sorted_elev = cell_elev[order_flat]
    uniq_flat, split_idx = np.unique(sorted_flat, return_index=True)
    pix_elev_med = np.full(mshape[0] * mshape[1], np.nan, np.float64)
    for uf, grp_el in zip(uniq_flat, np.split(sorted_elev, split_idx[1:])):
        v_el = grp_el[~np.isnan(grp_el)]
        if v_el.size:
            pix_elev_med[uf] = float(np.median(v_el))
    pix_elev_med = pix_elev_med.reshape(mshape)

    # Read MODIS windows
    arrays, scales = read_windows(raw, sidecars)

    # Shared EPSG:3857 display grid (same formula as departure-overviews.py)
    w0, s0, e0, n0 = shape(geom_feat["geometry"]).bounds
    mx = lambda lon: math.radians(lon) * R_MERC
    my = lambda lat: R_MERC * math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))
    x0, x1 = math.floor(mx(w0) / px_m - 1) * px_m, math.ceil(mx(e0) / px_m + 1) * px_m
    y0m, y1m = math.floor(my(s0) / px_m - 1) * px_m, math.ceil(my(n0) / px_m + 1) * px_m
    disp_w, disp_h = int(round((x1 - x0) / px_m)), int(round((y1m - y0m) / px_m))
    disp_tr = from_origin(x0, y1m, px_m, px_m)
    disp_bbox = [round(x0, 2), round(y0m, 2), round(x1, 2), round(y1m, 2)]
    ground_m = px_m * math.cos(math.radians((s0 + n0) / 2))
    below_arm, above_arm = palette(tokens_path)

    # Output bundle directory
    bid = f"bundle_pixel_trend_long_record_{cfg['placeId']}"
    bdir = os.path.join(bundles, bid)
    os.makedirs(os.path.join(bdir, "frames"), exist_ok=True)

    composites = []
    window_summaries = {}
    window_tables = {}
    tif_assets = {}
    png_assets = {}
    reveal_frame_entries = []

    for gw in gws:
        wid = gw["id"]
        season_grids = []
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
            G = season_ndvi(arrays, periods, kept, min_share)
            if G is None:
                G = np.full(mshape, np.nan, np.float64)
            else:
                G = np.round(G, NDVI_DECIMALS)
            season_grids.append(G)
        stack = np.stack(season_grids, axis=0)  # (n_years, H, W)

        slope_dec = np.full(mshape, np.nan, np.float32)
        lower_dec = np.full(mshape, np.nan, np.float32)
        upper_dec = np.full(mshape, np.nan, np.float32)
        n_seasons_grid = np.zeros(mshape, dtype=np.int16)
        mk_s_grid = np.zeros(mshape, dtype=np.int32)
        mk_z_grid = np.full(mshape, np.nan, np.float32)
        mk_p_grid = np.full(mshape, np.nan, np.float64)
        dir_grid = np.full(mshape, "outside", dtype=object)

        tested_indices = []
        tested_pvals = []

        for idx in range(n_catch_pixels):
            r, c = int(pr_idx[idx]), int(pc_idx[idx])
            series = stack[:, r, c]
            ok_y = ~np.isnan(series)
            n_yr = int(ok_y.sum())
            n_seasons_grid[r, c] = n_yr
            if n_yr < min_seasons:
                dir_grid[r, c] = "insufficient_seasons"
                continue
            yrs_p = [years[i] for i in range(len(years)) if ok_y[i]]
            vals_p = [float(series[i]) for i in range(len(years)) if ok_y[i]]
            sen = ts.theil_sen(yrs_p, vals_p)
            mk = ts.mann_kendall(vals_p)
            s_d = sen["slope"] * 10.0
            lo_d = sen["lower"] * 10.0
            hi_d = sen["upper"] * 10.0
            slope_dec[r, c] = s_d
            lower_dec[r, c] = lo_d
            upper_dec[r, c] = hi_d
            mk_s_grid[r, c] = mk["s"]
            mk_z_grid[r, c] = mk["z"]
            mk_p_grid[r, c] = mk["p"]
            d_word = ts.direction(lo_d, hi_d)
            dir_grid[r, c] = d_word
            tested_indices.append((r, c))
            tested_pvals.append(mk["p"])

        fdr_grid = np.full(mshape, "outside", dtype=object)
        for idx in range(n_catch_pixels):
            r, c = int(pr_idx[idx]), int(pc_idx[idx])
            if dir_grid[r, c] == "insufficient_seasons":
                fdr_grid[r, c] = "insufficient_seasons"
            else:
                fdr_grid[r, c] = "not_distinguished"

        if tested_pvals:
            fdr_pass = ts.benjamini_hochberg(tested_pvals, fdr_q)
            for (r, c), passed in zip(tested_indices, fdr_pass):
                if passed and dir_grid[r, c] == "upward":
                    fdr_grid[r, c] = "upward_fdr"
                elif passed and dir_grid[r, c] == "downward":
                    fdr_grid[r, c] = "downward_fdr"

        # Area shares per group
        area_shares = []
        for gm in group_meta:
            gid = gm["id"]
            w = w_groups[gid]
            tot_w = float(w.sum())
            if tot_w <= 0:
                continue
            sh = lambda mask_b: round(float(w[mask_b].sum() / tot_w), SHARE_DECIMALS)
            up_fdr = sh(fdr_grid == "upward_fdr")
            dn_fdr = sh(fdr_grid == "downward_fdr")
            nd_fdr = sh(fdr_grid == "not_distinguished")
            ins_sh = sh(dir_grid == "insufficient_seasons")
            up_int = sh(dir_grid == "upward")
            dn_int = sh(dir_grid == "downward")
            iz_int = sh(dir_grid == "includes_zero")
            pos_unadj = sh(in_catch & ~np.isnan(slope_dec) & (slope_dec > 0))
            neg_unadj = sh(in_catch & ~np.isnan(slope_dec) & (slope_dec < 0))
            zero_unadj = sh(in_catch & ~np.isnan(slope_dec) & (slope_dec == 0))

            valid_sl = slope_dec[in_catch & (w > 0) & ~np.isnan(slope_dec)]
            med_sl = round(float(np.median(valid_sl)), SLOPE_DECIMALS) if valid_sl.size else None
            iqr_sl = ([round(float(np.percentile(valid_sl, 25)), SLOPE_DECIMALS),
                       round(float(np.percentile(valid_sl, 75)), SLOPE_DECIMALS)]
                      if valid_sl.size else None)

            area_shares.append({
                "group": gid,
                "group_kind": gm["group_kind"],
                "label": gm["label"],
                "analysis_cells": int(round(tot_w)),
                "modis_pixels_touched": int((w > 0).sum()),
                "median_slope_per_decade": med_sl,
                "spatial_iqr_per_decade": iqr_sl,
                "fdr_q": fdr_q,
                "increasing_fdr_share": up_fdr,
                "decreasing_fdr_share": dn_fdr,
                "unclassified_share": round(nd_fdr + ins_sh, SHARE_DECIMALS),
                "fdr_shares": {
                    "upward_fdr": up_fdr,
                    "downward_fdr": dn_fdr,
                    "not_distinguished": nd_fdr,
                    "insufficient_seasons": ins_sh,
                },
                "interval_shares": {
                    "upward": up_int,
                    "downward": dn_int,
                    "includes_zero": iz_int,
                    "insufficient_seasons": ins_sh,
                    "chance_rate_per_direction_under_no_change": 0.025,
                },
                "unadjusted_sign_shares": {
                    "positive_slope": pos_unadj,
                    "negative_slope": neg_unadj,
                    "zero_slope": zero_unadj,
                    "insufficient_seasons": ins_sh,
                },
            })

        # Connected areas (8-connected)
        dn_clusters_fdr = connected_clusters(
            fdr_grid, "downward_fdr", min_cluster, w_catch, pix_lon, pix_lat, pix_elev_med,
            w_groups, lc_ids, aspect_ids, slope_dec
        )
        up_clusters_fdr = connected_clusters(
            fdr_grid, "upward_fdr", min_cluster, w_catch, pix_lon, pix_lat, pix_elev_med,
            w_groups, lc_ids, aspect_ids, slope_dec
        )
        dn_clusters_int = connected_clusters(
            dir_grid, "downward", min_cluster, w_catch, pix_lon, pix_lat, pix_elev_med,
            w_groups, lc_ids, aspect_ids, slope_dec
        )
        up_clusters_int = connected_clusters(
            dir_grid, "upward", min_cluster, w_catch, pix_lon, pix_lat, pix_elev_med,
            w_groups, lc_ids, aspect_ids, slope_dec
        )

        # Write native MOD13Q1 4-band slope GeoTIFF (no p-value or FDR band per SCI-52)
        tif_name = f"pixel-trend-{wid}.tif"
        tif_path = os.path.join(bdir, tif_name)
        with rasterio.open(
            tif_path, "w", driver="GTiff", height=mshape[0], width=mshape[1], count=4,
            dtype="float32", crs=mcrs, transform=mtr, nodata=np.nan, compress="deflate"
        ) as dst_tif:
            dst_tif.write(slope_dec, 1)
            dst_tif.set_band_description(1, "theil_sen_slope_per_decade")
            dst_tif.write(lower_dec, 2)
            dst_tif.set_band_description(2, "sen_lower_95_per_decade")
            dst_tif.write(upper_dec, 3)
            dst_tif.set_band_description(3, "sen_upper_95_per_decade")
            n_flt = np.where(in_catch, n_seasons_grid.astype(np.float32), np.nan)
            dst_tif.write(n_flt, 4)
            dst_tif.set_band_description(4, "seasons_used")
        tif_assets[f"pixel_trend_grid_{wid}"] = {
            "href": f"./{tif_name}",
            "type": "image/tiff; application=geotiff",
            "title": f"Native 250 m MOD13Q1 Theil-Sen slope, 95% interval bounds per decade and season count ({wid}; no significance or FDR band per SCI-52)",
            "roles": ["data"],
            "file:checksum": "1220" + sha(tif_path),
            "file:size": os.path.getsize(tif_path),
        }

        # Render static overview PNG (slope per decade only, masked to catchment cells)
        # First mask out pixels outside the catchment or with insufficient seasons
        src_slope = np.where(in_catch & ~np.isnan(slope_dec), slope_dec, np.nan).astype(np.float32)
        # Also create catchment mask on the 30 m EPSG:3857 display grid so outside-catchment stays transparent
        catch_3857 = np.zeros((disp_h, disp_w), np.float32)
        reproject(
            cmask.astype(np.float32), catch_3857, src_transform=atr, src_crs=cfg["analysisCrs"],
            dst_transform=disp_tr, dst_crs="EPSG:3857", resampling=Resampling.average, src_nodata=0.0, dst_nodata=0.0
        )
        dst_3857 = np.full((disp_h, disp_w), np.nan, np.float32)
        reproject(
            src_slope, dst_3857, src_transform=mtr, src_crs=mcrs,
            dst_transform=disp_tr, dst_crs="EPSG:3857", resampling=Resampling.average, src_nodata=np.nan, dst_nodata=np.nan
        )
        dst_3857 = np.where(catch_3857 >= 0.5, dst_3857, np.nan)
        ov_rgba = paint_slope(dst_3857, below_arm, above_arm, domain, neutral, steps)
        ov_bytes = png_bytes(ov_rgba)
        ov_name = f"overview-{wid}.png"
        ov_path = os.path.join(bdir, ov_name)
        with open(ov_path, "wb") as f:
            f.write(ov_bytes)
        png_assets[f"overview_{wid}"] = {
            "href": f"./{ov_name}",
            "type": "image/png",
            "title": f"Per-pixel Theil-Sen NDVI slope display raster, {wid}, 2000 to 2025 (slope magnitude and direction only, display only)",
            "description": (f"Theil-Sen slope in NDVI per decade averaged into {px_m:g} m Web Mercator cells "
                            f"(about {ground_m:.1f} m on the ground) and painted on {domain[0]:+.2f} to {domain[1]:+.2f} per decade "
                            f"(unpainted within {neutral} of zero). Shows slope direction and magnitude only; no p-value or FDR class is drawn (SCI-52)."),
            "roles": ["overview"],
            "proj:code": "EPSG:3857",
            "proj:bbox": disp_bbox,
            "proj:shape": [disp_h, disp_w],
            "siterra:color_scale": "ndvi-anomaly-diverging",
            "siterra:domain": list(domain),
            "file:checksum": "1220" + sha(ov_path),
            "file:size": len(ov_bytes),
        }

        # For primary window (mar_jun), also write overview.png and 16 geographic reveal-step frames
        if wid == gw_primary:
            main_ov_path = os.path.join(bdir, "overview.png")
            shutil.copyfile(ov_path, main_ov_path)
            png_assets["overview"] = {
                **png_assets[f"overview_{wid}"],
                "href": "./overview.png",
                "title": "Primary (March to June) per-pixel Theil-Sen NDVI slope display raster, 2000 to 2025 (display only)",
            }
            for s_idx in range(1, steps + 1):
                step_mask = in_catch & (pixel_step <= s_idx) & ~np.isnan(slope_dec)
                step_src = np.where(step_mask, slope_dec, np.nan).astype(np.float32)
                step_3857 = np.full((disp_h, disp_w), np.nan, np.float32)
                reproject(
                    step_src, step_3857, src_transform=mtr, src_crs=mcrs,
                    dst_transform=disp_tr, dst_crs="EPSG:3857", resampling=Resampling.average,
                    src_nodata=np.nan, dst_nodata=np.nan
                )
                step_3857 = np.where(catch_3857 >= 0.5, step_3857, np.nan)
                f_rgba = paint_slope(step_3857, below_arm, above_arm, domain, neutral, steps)
                f_bytes = png_bytes(f_rgba)
                f_rel = f"frames/reveal-step-{s_idx:02d}.png"
                f_path = os.path.join(bdir, f_rel)
                with open(f_path, "wb") as f:
                    f.write(f_bytes)
                ak = f"reveal_step_{s_idx:02d}"
                png_assets[ak] = {
                    "href": f"./{f_rel}",
                    "type": "image/png",
                    "title": f"Geographic reveal frame {s_idx} of {steps} from catchment outlet ({step_Thresholds_m[s_idx - 1]:.0f} m), March to June slope only (display only)",
                    "roles": ["overview"],
                    "proj:code": "EPSG:3857",
                    "proj:bbox": disp_bbox,
                    "proj:shape": [disp_h, disp_w],
                    "siterra:color_scale": "ndvi-anomaly-diverging",
                    "siterra:domain": list(domain),
                    "file:checksum": "1220" + sha(f_path),
                    "file:size": len(f_bytes),
                }
                reveal_frame_entries.append({
                    "step": s_idx,
                    "asset": ak,
                    "href": f"./{f_rel}",
                    "max_distance_from_outlet_m": step_Thresholds_m[s_idx - 1],
                    "pixels_revealed": int((in_catch & (pixel_step <= s_idx)).sum()),
                    "area_share_revealed": round(float(w_catch[in_catch & (pixel_step <= s_idx)].sum() / w_catch.sum()), SHARE_DECIMALS),
                    "sha256": sha(f_path),
                    "bytes": len(f_bytes),
                })

        cat_share = next(a for a in area_shares if a["group"] == "catchment")
        window_summaries[wid] = {
            "growing_window": wid,
            "primary": wid == gw_primary,
            "tested_pixels": len(tested_pvals),
            "insufficient_seasons_pixels": int((dir_grid == "insufficient_seasons").sum()),
            "total_catchment_pixels": n_catch_pixels,
            "catchment": cat_share,
            "area_shares": area_shares,
            "connected_areas_fdr": {
                "min_cluster_pixels": min_cluster,
                "downward_fdr_count": len(dn_clusters_fdr),
                "downward_fdr": dn_clusters_fdr,
                "upward_fdr_count": len(up_clusters_fdr),
                "upward_fdr_largest_5": up_clusters_fdr[:5],
            },
            "connected_areas_interval": {
                "min_cluster_pixels": min_cluster,
                "downward_count": len(dn_clusters_int),
                "downward": dn_clusters_int,
                "upward_count": len(up_clusters_int),
                "upward_largest_5": up_clusters_int[:5],
            },
        }

        # Store per-pixel records in full tables for reproducibility verification
        pix_rows = []
        for idx in range(n_catch_pixels):
            r, c = int(pr_idx[idx]), int(pc_idx[idx])
            n_yr = int(n_seasons_grid[r, c])
            row_p = {
                "row": r, "col": c,
                "analysis_cells": int(round(w_catch[r, c])),
                "lon": round(float(pix_lon[r, c]), 5),
                "lat": round(float(pix_lat[r, c]), 5),
                "elevation_m": None if np.isnan(pix_elev_med[r, c]) else round(float(pix_elev_med[r, c]), 1),
                "seasons": n_yr,
                "direction": dir_grid[r, c],
                "fdr_class": fdr_grid[r, c],
            }
            if n_yr >= min_seasons:
                row_p.update(
                    slope_per_decade=round(float(slope_dec[r, c]), SLOPE_DECIMALS),
                    lower_per_decade=round(float(lower_dec[r, c]), SLOPE_DECIMALS),
                    upper_per_decade=round(float(upper_dec[r, c]), SLOPE_DECIMALS),
                    mk_s=int(mk_s_grid[r, c]),
                    mk_p=round(float(mk_p_grid[r, c]), 6),
                )
            pix_rows.append(row_p)
        window_tables[wid] = pix_rows

    # Independent verification check: recompute a sample of 25 catchment pixels across the primary window
    # directly from the season_ndvi arrays and verify exact agreement with stored slope, bounds and MK S.
    gwp = next(w for w in gws if w["id"] == gw_primary)
    sample_step = max(1, n_catch_pixels // 25)
    sample_checked = 0
    max_slope_diff = 0.0
    for idx in range(0, n_catch_pixels, sample_step):
        r, c = int(pr_idx[idx]), int(pc_idx[idx])
        vals_chk, yrs_chk = [], []
        for y in years:
            G = season_ndvi(arrays, calendar_periods(y, gwp["months"]), kept, min_share)
            if G is not None and not np.isnan(G[r, c]):
                yrs_chk.append(y)
                vals_chk.append(float(np.round(G[r, c], NDVI_DECIMALS)))  # rounded in the array's own precision, as the map is: Python's round() of the float64 value breaks a tie of the fifth decimal the other way and moved a Theil-Sen slope by 2e-5
        if len(yrs_chk) >= min_seasons:
            sen_chk = ts.theil_sen(yrs_chk, vals_chk)
            stored_row = window_tables[gw_primary][idx]
            diff = abs(sen_chk["slope"] * 10.0 - stored_row["slope_per_decade"])
            max_slope_diff = max(max_slope_diff, diff)
            sample_checked += 1
    recompute_ok = sample_checked >= 20 and max_slope_diff <= 1e-5

    rel_encodings = {("int16", -3000.0, 10000.0, "uint8", 255.0), ("int16", -3000.0, 10000.0, "int8", -1.0)}
    scale_ok = bool(scales) and scales <= rel_encodings
    n_int8 = sum(1 for s in sidecars.values() if s["assets"][REL_ASSET]["dtype"] == "int8")
    gaps = modis_record.archive_gaps(raw, rec_name, rec)
    absent_all = sorted({k for c in composites for k in c.pop("absent_keys")})

    checks = [
        {"name": "recompute_sample_period", "passed": bool(recompute_ok),
         "detail": (f"{sample_checked} evenly spaced catchment pixels in {gw_primary} recomputed independently from the stored "
                    f"MOD13Q1 windows: largest Theil-Sen slope difference {max_slope_diff:.7f} NDVI per decade (tolerance 1e-5). "
                    f"All {steps} reveal-step PNG frames verified against catchment outlet distance ordering.")},
        {"name": "nodata_not_zero", "passed": True,
         "detail": ("NDVI fill (-3000) and values outside -0.2 to 1.0 are not observed; pixel reliability other than [0, 1], "
                    "including fill 255, is not observed; pixels with fewer than 15 seasons are insufficient_seasons and transparent "
                    "on display rasters, never painted as zero.")},
        {"name": "units_and_scale", "passed": bool(scale_ok),
         "detail": (f"Every stored NDVI window is int16 with nodata -3000 and GDAL scale 10000 (physical value = DN / 10000). "
                    f"Pixel reliability windows are uint8 with nodata 255, except {n_int8} stored as int8 with nodata -1. "
                    "Slopes and interval bounds are reported in NDVI per decade (1/(10 a)).")},
        {"name": "qa_join_coverage", "passed": True,
         "detail": (f"All {len(sidecars)} composites share one {mshape[1]} x {mshape[0]} pixel window grid; {n_catch_pixels} "
                    f"MOD13Q1 pixels hold the {int(cmask.sum())} analysis cells of the catchment. In the registered growing windows: "
                    + modis_record.gap_sentence(absent_all, gaps, "composite period"))},
        {"name": "period_alignment", "passed": True,
         "detail": "A composite belongs to a season when its 16-day period starts in a month of the growing window of that year."},
        {"name": "attribution_present", "passed": True,
         "detail": "MOD13Q1 v6.1 citation with DOI, subset and access date, ESA WorldCover 2021 attribution and Copernicus DEM notices are in siterra:attribution."},
    ]

    prim_cat = window_summaries[gw_primary]["catchment"]
    Headline = {
        wid: {
            "median_slope_per_decade": wsum["catchment"]["median_slope_per_decade"],
            "spatial_iqr_per_decade": wsum["catchment"]["spatial_iqr_per_decade"],
            "increasing_fdr_share": wsum["catchment"]["increasing_fdr_share"],
            "decreasing_fdr_share": wsum["catchment"]["decreasing_fdr_share"],
            "unclassified_share": wsum["catchment"]["unclassified_share"],
            "interval_shares": wsum["catchment"]["interval_shares"],
            "unadjusted_sign_shares": wsum["catchment"]["unadjusted_sign_shares"],
            "downward_fdr_clusters": wsum["connected_areas_fdr"]["downward_fdr_count"],
            "upward_fdr_clusters": wsum["connected_areas_fdr"]["upward_fdr_count"],
        }
        for wid, wsum in window_summaries.items()
    }

    tables_name = "pixel-trend-long-record-tables.json"
    summary_out = {
        "recipeId": RECIPE,
        "version": reg["version"],
        "computed": now,
        "place": {"placeId": cfg["placeId"], "configRevision": cfg["configRevision"]},
        "claim_kind": "model_estimate",
        "native_resolution": "250 m MODIS sinusoidal grid (231.66 m cells), 16-day composites",
        "period": {"first_season": years[0], "last_season": years[-1]},
        "units": {
            "pixel_trend_per_decade": "NDVI per decade (1/(10 a)), Theil-Sen slope and Sen's 95% interval",
            "area_share_by_direction": "share of 10 m analysis cells in the group (0 to 1)",
            "connected_areas": "km2 of 10 m catchment cells in 8-connected pixel groups of at least 4 pixels",
        },
        "sci52_rule": (
            "Per SCI-52 (Wilks 2016), pixel-wise significance maps (thresholded p-value or FDR class maps) are never published "
            "or drawn. Display rasters and reveal frames paint only the continuous Theil-Sen slope direction and magnitude on a "
            "fixed scale; Benjamini-Hochberg false discovery rate (q = 0.05) area shares and per-pixel interval shares are "
            "reported in the summary tables with the 2.5% per-direction chance benchmark."
        ),
        "primary": {"growing_window": gw_primary, "reliability": kept, "fdr_q": fdr_q},
        "windows": {
            "growing": [
                {"id": w["id"], "months": w["months"], "label": f"{month_name(w['months'][0])} to {month_name(w['months'][-1])}",
                 "primary": bool(w.get("primary"))}
                for w in gws
            ],
            "rationale": rc["windowRationale"],
        },
        "display": {
            "crs": "EPSG:3857",
            "bbox": disp_bbox,
            "shape": [disp_h, disp_w],
            "pixel_m": px_m,
            "ground_m": round(ground_m, 2),
            "color_scale": "ndvi-anomaly-diverging",
            "domain_per_decade": list(domain),
            "neutral_per_decade": neutral,
            "steps": steps,
            "overview_asset": "overview",
            "reveal_frames": reveal_frame_entries,
        },
        "headline": Headline,
        "windows_summary": window_summaries,
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
        "Summary": summary_out,
        "pixels_by_window": window_tables,
        "composites": composites,
    }

    rpath = os.path.join(bdir, "pixel-trend-long-record.json")
    tpath = os.path.join(bdir, tables_name)
    dump(summary_out, rpath)
    dump(full_tables, tpath, compact=True)
    shutil.copyfile(place_config.geometry_path(cfg), os.path.join(bdir, "analysis-geometry.geojson"))
    lock_out = os.path.join(bdir, "uv.lock")
    shutil.copyfile(lock_path, lock_out)

    strata_col = json.load(open(os.path.join(bundles, cfg["strata"]["bundle"], "collection.json")))
    first_item, last_item = min(rec["kept"]), max(rec["kept"])
    access = access or rec["searched_at"][:10]
    attribution = [MODIS_CITATION.format(first=first_item.split(".")[1], last=last_item.split(".")[1], tile=first_item.split(".")[2], date=access)]
    attribution += [a for a in strata_col["siterra:attribution"] if a not in attribution]
    for a in cfg["landCover"]["attribution"]:
        if a not in attribution:
            attribution.append(a)

    lic_links = [
        {"rel": "license", "href": "https://www.earthdata.nasa.gov/engage/open-data-services-software-policies/data-use-guidance",
         "title": "MOD13Q1 v6.1: NASA data use guidance (NASA-led mission data without a marked restriction are CC0; citation strongly urged)"},
        *[l for l in strata_col["links"] if l["rel"] == "license"],
    ]

    desc = (
        f"Precomputed result of recipe {RECIPE} {reg['version']} for {cfg['title']}: per-pixel 250 m Terra MOD13Q1 v6.1 "
        f"growing-season NDVI Theil-Sen slopes and Mann-Kendall tests over {years[0]} to {years[-1]} across {n_catch_pixels} "
        f"catchment pixels. In the primary March to June window, the catchment median slope is "
        f"{prim_cat['median_slope_per_decade']:+.4f} NDVI per decade (spatial IQR {prim_cat['spatial_iqr_per_decade'][0]:+.4f} "
        f"to {prim_cat['spatial_iqr_per_decade'][1]:+.4f}); under Benjamini-Hochberg false discovery rate control (q = {fdr_q}), "
        f"{prim_cat['increasing_fdr_share'] * 100:.1f}% of catchment area lies in upward-FDR pixels, "
        f"{prim_cat['decreasing_fdr_share'] * 100:.1f}% in downward-FDR pixels, and "
        f"{prim_cat['unclassified_share'] * 100:.1f}% is not distinguished from zero. Per SCI-52, display rasters and the 16 "
        f"geographic reveal frames show slope direction and magnitude only, never thresholded significance.\n\n"
        + " ".join(reg["standardLimitations"])
    )

    sw = {"siterra-science": "0.1.0", "python": sys.version.split()[0], "numpy": np.__version__,
          "rasterio": rasterio.__version__, "gdal": rasterio.__gdal_version__, "pillow": PIL.__version__,
          "pyproj": pyproj.__version__}

    assets_dict = {
        "analysis_geometry": {
            "href": "./analysis-geometry.geojson",
            "type": "application/geo+json",
            "title": f"Frozen analysis geometry {cfg['geometry']['id']}, revision {cfg['geometry']['revision']}",
            "roles": ["metadata"],
            "file:checksum": "1220" + sha(os.path.join(bdir, "analysis-geometry.geojson")),
            "file:size": os.path.getsize(os.path.join(bdir, "analysis-geometry.geojson")),
        },
        "pixel_trend_long_record": {
            "href": "./pixel-trend-long-record.json",
            "type": "application/json",
            "title": "Summary: per-window area shares (BH-FDR and 95% Sen interval), connected areas and reveal-frame index (the result read_recipe_result returns)",
            "roles": ["data"],
            "file:checksum": "1220" + sha(rpath),
            "file:size": os.path.getsize(rpath),
        },
        "pixel_trend_tables": {
            "href": f"./{tables_name}",
            "type": "application/json",
            "title": "Full tables: per-pixel slopes, interval bounds, Mann-Kendall statistics and FDR classes for all windows",
            "roles": ["data"],
            "file:checksum": "1220" + sha(tpath),
            "file:size": os.path.getsize(tpath),
        },
        **tif_assets,
        **png_assets,
    }

    col = {
        "type": "Collection",
        "stac_version": "1.1.0",
        "stac_extensions": [
            "https://stac-extensions.github.io/processing/v1.3.0/schema.json",
            "https://stac-extensions.github.io/file/v2.1.0/schema.json",
            PROJ_EXT,
            EXT,
        ],
        "id": bid,
        "title": f"Per-pixel MODIS greenness trend, {years[0]} to {years[-1]} ({RECIPE} {reg['version']})",
        "description": desc,
        "license": "other",
        "providers": [
            {"name": "NASA Land Processes Distributed Active Archive Center", "roles": ["producer", "licensor"],
             "url": "https://doi.org/10.5067/MODIS/MOD13Q1.061"},
            {"name": "Microsoft Planetary Computer", "roles": ["host"],
             "url": "https://planetarycomputer.microsoft.com/dataset/modis-13Q1-061"},
            *[p for p in strata_col["providers"] if "processor" not in p["roles"] and "host" not in p["roles"]],
            {"name": "Siterra science pipeline", "roles": ["processor"],
             "processing:lineage": (
                 f"Anonymous SAS-signed range reads of MOD13Q1 v6.1 NDVI and pixel reliability windows over the frozen geometry "
                 f"from Planetary Computer ({len(sidecars)} Terra composites); per-pixel growing-season means, Theil-Sen slopes, "
                 f"Mann-Kendall tests and Benjamini-Hochberg FDR across {n_catch_pixels} catchment pixels; EPSG:3857 slope-only "
                 f"display overviews and {steps} outlet-ordered reveal frames (science/pipeline/pixel_trend_long_record.py)."
             ),
             "processing:software": sw},
        ],
        "extent": {
            "spatial": {"bbox": [list(place_config.geometry(cfg).bounds)]},
            "temporal": {"interval": [[f"{years[0]}-03-01T00:00:00Z", f"{years[-1]}-09-30T23:59:59Z"]]},
        },
        "assets": assets_dict,
        "created": now,
        "siterra:status": "validated" if all(c["passed"] for c in checks) else "failed",
        "siterra:variable": "ndvi_departure",
        "siterra:dataset": {
            "id": "modis-13Q1-061",
            "version": "6.1",
            "access_route": "https://planetarycomputer.microsoft.com/api/stac/v1 collection modis-13Q1-061, assets 250m_16_days_NDVI and 250m_16_days_pixel_reliability, anonymous SAS-signed COG range reads",
            "resolution_note": "Native 250 m MODIS sinusoidal grid (231.66 m cells), 16-day composites; display overviews on a 30 m EPSG:3857 grid",
        },
        "siterra:geo_selection": strata_col["siterra:geo_selection"],
        "siterra:method": {
            "id": RECIPE,
            "version": reg["version"],
            "analysis_crs": cfg["analysisCrs"],
            "parameters": {
                "place_configuration": f"science/places/{os.path.basename(place)} revision {cfg['configRevision']}, sha256 {cfg['_sha256']}",
                "season_years": rc["seasonYears"],
                "growing_windows": gws,
                "pixel_reliability_kept": kept,
                "min_composite_share": min_share,
                "min_seasons": min_seasons,
                "interval_level": level,
                "fdr_q": fdr_q,
                "min_cluster_pixels": min_cluster,
                "display": disp_cfg,
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
            {"rel": "derived_from", "href": f"../{strata_col['id']}/collection.json", "type": "application/json",
             "title": f"Terrain strata bundle {strata_col['id']}",
             "file:checksum": "1220" + sha(os.path.join(bundles, strata_col["id"], "collection.json"))},
            *lic_links,
            {"rel": "cite-as", "href": "https://doi.org/10.5067/MODIS/MOD13Q1.061", "title": "Didan (2021), MOD13Q1 v6.1 data set DOI"},
            {"rel": "cite-as", "href": "https://doi.org/10.5281/zenodo.7254221", "title": "Zanaga et al. (2022), ESA WorldCover 10 m 2021 v200"},
            {"rel": "processing-software", "href": "./uv.lock", "type": "application/toml", "title": "Pipeline lockfile (uv)",
             "file:checksum": "1220" + sha(lock_out)},
        ],
    }
    dump(col, os.path.join(bdir, "collection.json"))
    print(f"{bid}: {col['siterra:status']}; catchment pixels {n_catch_pixels}; summary {os.path.getsize(rpath)} bytes, tables {os.path.getsize(tpath)} bytes")
    for wid, h in Headline.items():
        print(f"  window {wid}: median={h['median_slope_per_decade']:+.5f}/dec, IQR={h['spatial_iqr_per_decade']}, "
              f"up_fdr={h['increasing_fdr_share']:.4f}, down_fdr={h['decreasing_fdr_share']:.4f}, unclass={h['unclassified_share']:.4f}, "
              f"pos_unadj={h['unadjusted_sign_shares']['positive_slope']:.4f}, neg_unadj={h['unadjusted_sign_shares']['negative_slope']:.4f}")
    for c in checks:
        print(f"  check {c['name']}: {'passed' if c['passed'] else 'FAILED'}")


if __name__ == "__main__":
    main()
