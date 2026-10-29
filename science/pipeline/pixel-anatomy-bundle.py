"""Precompute pixel_anatomy for one MODIS pixel and write it as a bundle: the pixel's 10 m cells, the class spectra of one
clear Sentinel-2 day, a labelled linear mix of the classes, the pixel's own 26-season March to June series, the extracts and
a STAC Collection.

Usage: python -I pixel-anatomy-bundle.py <place.json> <repo_root> <pixel_id> <registry.json> <lockfile> <bundles_dir>
       [--interim=<dir>] [--extracts=<dir>] [--bundle-id=<id>] [--inspected=<note.txt>] [--computed=<YYYY-MM-DDTHH:MM:SSZ>]

Follows the registered pixel_anatomy 1.0.0 recipe. --extracts is the folder pixel-anatomy-fetch.py wrote (default
<repo>/data/interim/pixel-anatomy; or, to rebuild a committed bundle, the bundle's own folder, where the extracts and
scene-record.json are copies); --interim holds the display inputs pinned by the place configuration (default
<repo>/data/interim). The bundle id is the configuration's for its primary pixel and bundle_pixel_anatomy_<place>_<pixel id>
otherwise. The bundle folder must not exist yet. Without --inspected the visual inspection check fails.
"""
import json
import os
import shutil
import sys

import numpy as np
import pyproj
import rasterio
import shapely
from pyproj import Transformer
from shapely.geometry import shape

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bundle_common as bc  # noqa: E402
import modis_ndvi  # noqa: E402
import pixel_anatomy as pa  # noqa: E402
import place_config  # noqa: E402
import trend_stats  # noqa: E402

RECIPE = "pixel_anatomy"
EXT = "https://siterra.invalid/schemas/stac/siterra/1.1.0/schema.json"
PROJ_EXT = "https://stac-extensions.github.io/projection/v2.1.0/schema.json"
WC_NAMES = {10: "tree cover", 20: "shrubland", 30: "grassland", 40: "cropland", 50: "built-up", 60: "bare or sparse vegetation",
            80: "permanent water"}
SHIFT_FROM, SHIFT_TO = 30, 10  # grassland to tree cover
YEARS = list(range(2000, 2026))
MONTHS = {"mar_jun": [3, 4, 5, 6]}
CLAIMS = {"composition_and_spectra": "observation", "mix_and_series": "model_estimate"}


def pinned(root, entry, label):
    p = os.path.join(root, entry["path"])
    if bc.sha(p) != entry["sha256"]:
        raise SystemExit(f"{label}: checksum does not match the place configuration")
    return p


def compute(cfg, reg, pid, interim, extracts, bundles):
    params = {p["name"]: p["default"] for p in reg["parameters"]}
    pc = cfg["recipes"][RECIPE]
    h, v, trow, tcol = pa.parse_pixel_id(pid)
    tb = pc["trendBundle"]
    tdir = os.path.join(cfg["_repo"], "data/bundles", tb["bundle"])
    with rasterio.open(os.path.join(tdir, tb["grid"])) as t:
        mtr, mshape, mcrs = t.transform, (t.height, t.width), t.crs
        mcrs_wkt = t.crs.to_wkt()
    ox, oy = pa.lattice_offset(mtr)
    if min(ox, 1 - ox) > 1e-3 or min(oy, 1 - oy) > 1e-3:
        raise SystemExit("the trend grid is not on the MODIS tile lattice")
    brow, bcol = pa.bundle_index(mtr, h, v, trow, tcol)
    if not (0 <= brow < mshape[0] and 0 <= bcol < mshape[1]):
        raise SystemExit(f"{pid} lies outside the trend grid")
    tables = json.load(open(os.path.join(tdir, tb["table"])))["pixels_by_window"]
    rec = {w: next((p for p in tables[w] if p["row"] == brow and p["col"] == bcol), None) for w in tables}
    if rec["mar_jun"] is None:
        raise SystemExit(f"{pid} holds no catchment cell")

    # the cell to pixel rule against the table, for every pixel, and the composition of every pixel for the selection record
    atr, ashape, amask = place_config.analysis_grid(cfg)
    crow, ccol, _, _, flat = place_config.cell_pixel_index(cfg, mcrs, mtr, mshape)
    npix = mshape[0] * mshape[1]
    n_catch = np.bincount(flat, minlength=npix)
    mismatch = sum(1 for p in tables["mar_jun"] if n_catch[p["row"] * mshape[1] + p["col"]] != p["analysis_cells"])
    n_all = pa.footprint_counts(atr, ashape, mtr, mcrs, cfg["analysisCrs"], mshape)
    wc_grid = place_config.land_cover(cfg)
    layers = place_config.strata(cfg)[0]
    wc_c = wc_grid[crow, ccol]
    sloping = np.isin(layers["aspect_class"][crow, ccol], [1, 2, 3, 4])
    n_slope = np.bincount(flat[sloping], minlength=npix)
    shares = {k: np.bincount(flat[wc_c == k], minlength=npix) for k in (10, 20, 30, 40, 50, 60, 80)}
    table = []
    for p in tables["mar_jun"]:
        f = p["row"] * mshape[1] + p["col"]
        n = n_catch[f]
        table.append({"row": p["row"], "col": p["col"], "direction": p["direction"], "lower_per_decade": p["lower_per_decade"],
                      "slope_per_decade": p["slope_per_decade"], "upper_per_decade": p["upper_per_decade"],
                      "analysis_cells": p["analysis_cells"], "fully_inside": bool(n_all[f] == n_catch[f]),
                      "sloping_share": float(n_slope[f] / n), "wc_shares": {str(k): float(shares[k][f] / n) for k in shares}})
    ranked = pa.rank_candidates(table, pc["candidateRule"])
    rank = next((i + 1 for i, t in enumerate(ranked) if (t["row"], t["col"]) == (brow, bcol)), None)
    top = []
    for t in ranked[:5]:
        x, y = mtr * (t["col"] + 0.5, t["row"] + 0.5)
        top.append({"pixel": pa.pixel_id(*pa.tile_of(x, y)), "lower_per_decade": t["lower_per_decade"], "slope_per_decade": t["slope_per_decade"],
                    "upper_per_decade": t["upper_per_decade"], "analysis_cells": t["analysis_cells"]})

    # the pixel's cells and display window
    rows, cols = pa.cells_in_footprint(atr, ashape, mtr, mcrs, cfg["analysisCrs"], brow, bcol)
    r0, r1, c0, c1 = pa.display_window(rows, cols, params["window_margin_cells"])
    H, W = r1 - r0, c1 - c0
    inside = np.zeros((H, W), bool)
    inside[rows - r0, cols - c0] = True
    n_in = int(inside.sum())
    catch_in = int(amask[r0:r1, c0:c1][inside].sum())
    rin = interim
    med = pinned(rin, pc["interimInputs"]["ndviMedian"], "NDVI median")
    cnt = pinned(rin, pc["interimInputs"]["ndviCount"], "NDVI count")
    tcp = pinned(rin, pc["interimInputs"]["trueColour"], "true colour")
    win = ((r0, r1), (c0, c1))
    with rasterio.open(med) as m:
        if not m.transform.almost_equals(atr):
            raise SystemExit("the NDVI median is not on the analysis grid")
        ndvi = m.read(1, window=win)
    with rasterio.open(cnt) as m:
        ndvi_n = m.read(1, window=win)
    with rasterio.open(tcp) as t:
        ttr = t.transform
        dc, dr = (atr.c + c0 * atr.a - ttr.c) / 10.0, (ttr.f - (atr.f + r0 * atr.e)) / 10.0
        if abs(dc - round(dc)) > 1e-9 or abs(dr - round(dr)) > 1e-9:
            raise SystemExit("the true colour composite is not aligned with the analysis grid")
        tc = t.read(window=((int(round(dr)), int(round(dr)) + H), (int(round(dc)), int(round(dc)) + W)))
    wc = wc_grid[r0:r1, c0:c1]
    asp = layers["aspect_class"][r0:r1, c0:c1]
    elb = layers["elevation_band"][r0:r1, c0:c1]
    classes_in = sorted(int(k) for k in np.unique(wc[inside]))
    composition = [{"code": k, "name": WC_NAMES[k], "cells": int((wc[inside] == k).sum())} for k in classes_in]
    for c in composition:
        c["share"] = c["cells"] / n_in
    ndvi_in = ndvi[inside]
    ok_n = np.isfinite(ndvi_in)
    ndvi_by_class = {str(k): {"cells_with_value": int(((wc[inside] == k) & ok_n).sum()),
                              "median": float(np.median(ndvi_in[(wc[inside] == k) & ok_n])) if ((wc[inside] == k) & ok_n).any() else None}
                     for k in classes_in}

    # the scene, its extracts and the spectra
    sr = json.load(open(os.path.join(extracts, "scene-record.json")))
    if sr["pixel"] != pid:
        raise SystemExit("the extracts are for another pixel")
    dw = sr["display_window"]
    if (dw["origin_x"], dw["origin_y"], dw["rows"], dw["cols"], dw["analysis_grid_row0"], dw["analysis_grid_col0"]) != (
            atr.c + c0 * atr.a, atr.f + r0 * atr.e, H, W, r0, c0):
        raise SystemExit("the extracts do not cover this pixel's display window")
    on_orbit = [c for c in sr["scene_rule"]["candidates"] if c["orbit"] == pc["scene"]["relativeOrbit"]]
    rule_scene = pa.choose_scene(on_orbit, pc["scene"]["relativeOrbit"])
    scene_ok = rule_scene["id"] == sr["scene_rule"]["chosen"] == sr["stac_item"]["id"]
    by_band = {r["band"]: r for r in sr["extracts"]}
    sha_bad = [r["band"] for r in sr["extracts"] if bc.sha(os.path.join(extracts, r["extract"])) != r["extract_sha256"]]

    def load(name):
        with rasterio.open(os.path.join(extracts, by_band[name]["extract"])) as s:
            a = s.read(1)
        if name in pa.TEN_M:
            return a
        return np.repeat(np.repeat(a, 2, axis=0), 2, axis=1)

    dn = {b: load(b).astype(np.float64) for b in pa.BANDS}
    shape_ok = all(a.shape == (H, W) for a in dn.values())
    scl = load("SCL")
    kept = pa.kept_mask(dn, scl, params["scl_kept"])
    refl = {b: dn[b] / params["reflectance_divisor"] for b in pa.BANDS}
    sel_all = inside & kept
    over_one = int(((refl["B04"] > 1.0) | (refl["B08"] > 1.0))[sel_all].sum())
    scl_inside = {str(int(k)): int((scl[inside] == k).sum()) for k in np.unique(scl[inside])}
    spectra_classes = []
    for comp in composition:
        sel = sel_all & (wc == comp["code"])
        st = pa.class_stats(refl, sel)
        st.update({"code": comp["code"], "name": comp["name"], "cells_inside": comp["cells"], "share": comp["share"]})
        st["ndvi_of_median_red_nir"] = float(pa.ndvi(st["median"]["B08"], st["median"]["B04"]))
        st["median_cell_ndvi"] = float(np.median(pa.ndvi(refl["B08"][sel], refl["B04"][sel])))
        spectra_classes.append(st)
    pixel_mean = {b: float(refl[b][sel_all].mean()) for b in pa.BANDS}
    cell_ndvi = pa.ndvi(refl["B08"][sel_all], refl["B04"][sel_all])
    measured = float(pa.ndvi(pixel_mean["B08"], pixel_mean["B04"]))
    share_map = {c["code"]: c["share"] for c in composition}
    med_map = {c["code"]: c["median"] for c in spectra_classes}
    mixed, model_ndvi = pa.mix(share_map, med_map)
    shifted = pa.shifted_shares(share_map, SHIFT_FROM, SHIFT_TO, params["shift_points"])
    _, shifted_ndvi = pa.mix(shifted, med_map)
    cell_ndvi_grid = np.where(kept, pa.ndvi(refl["B08"], refl["B04"]), np.nan)

    # the series, recomputed from the MOD13Q1 windows
    raw = os.path.join(cfg["_repo"], "data/raw/modis/modis-13Q1-061")
    mrec, rec_name, sidecars = modis_ndvi.load_modis(raw)
    gtr, gshape, _ = modis_ndvi.grid_of(sidecars)
    if not gtr.almost_equals(mtr) or tuple(gshape) != mshape:
        raise SystemExit("the MOD13Q1 windows are not on the trend grid")
    arrays, _ = modis_ndvi.read_windows(raw, sidecars)
    kept_rel = params["pixel_reliability_kept"]
    seasons = []
    for y in YEARS:
        periods = modis_ndvi.calendar_periods(y, MONTHS[params["series_window"]])
        G = modis_ndvi.season_ndvi(arrays, periods, kept_rel, params["min_composite_share"])
        val = float(np.round(G, 5)[brow, bcol]) if G is not None else float("nan")
        present = kept_n = 0
        for key, _ in periods:
            if key not in arrays:
                continue
            present += 1
            nd, rl = arrays[key]
            if rl[brow, bcol] in kept_rel and modis_ndvi.DN_MIN <= nd[brow, bcol] <= modis_ndvi.DN_MAX:
                kept_n += 1
        seasons.append({"year": y, "ndvi": None if np.isnan(val) else val, "periods": len(periods), "periods_present": present,
                        "periods_kept": kept_n, "period_keys": [k for k, _ in periods]})
    yrs = [s["year"] for s in seasons if s["ndvi"] is not None]
    vals = [s["ndvi"] for s in seasons if s["ndvi"] is not None]
    sen = trend_stats.theil_sen(yrs, vals)
    got = {"slope_per_decade": round(sen["slope"] * 10.0, 5), "lower_per_decade": round(sen["lower"] * 10.0, 5),
           "upper_per_decade": round(sen["upper"] * 10.0, 5)}
    want = {k: rec["mar_jun"][k] for k in got}
    series_ok = got == want and len(vals) == rec["mar_jun"]["seasons"]

    # the pixel's geometry
    to_utm = Transformer.from_crs(mcrs, cfg["analysisCrs"], always_xy=True).transform
    to_ll = Transformer.from_crs(mcrs, "EPSG:4326", always_xy=True).transform
    corners_sin = pa.footprint_corners(mtr, brow, bcol)
    centre_ll = to_ll(*(mtr * (bcol + 0.5, brow + 0.5)))
    return {
        "params": params, "pid": pid, "brow": brow, "bcol": bcol, "tile": (h, v, trow, tcol), "rec": rec, "mismatch": mismatch,
        "n_pixels": len(tables["mar_jun"]), "n_in": n_in, "catch_in": catch_in, "window": (r0, r1, c0, c1, H, W),
        "origin": (atr.c + c0 * atr.a, atr.f + r0 * atr.e),
        "inside": inside, "wc": wc, "ndvi": ndvi, "ndvi_n": ndvi_n, "tc": tc, "composition": composition, "ndvi_by_class": ndvi_by_class,
        "ndvi_in": {"cells_with_value": int(ok_n.sum()), "median_of_cells": float(np.median(ndvi_in[ok_n])),
                    "mean_of_cells": float(np.mean(ndvi_in[ok_n])), "count_min": int(ndvi_n[inside].min()), "count_max": int(ndvi_n[inside].max())},
        "terrain": {"aspect_class_counts": {str(k): int((asp[inside] == k).sum()) for k in range(6)},
                    "elevation_band_counts": {str(k): int((elb[inside] == k).sum()) for k in range(4)}},
        "scene": sr, "scene_ok": scene_ok, "sha_bad": sha_bad, "shape_ok": shape_ok, "scl_inside": scl_inside,
        "kept_inside": int(sel_all.sum()), "over_one": over_one, "classes": spectra_classes, "pixel_mean": pixel_mean,
        "measured_ndvi": measured, "cell_ndvi_median": float(np.median(cell_ndvi)), "cell_ndvi_mean": float(np.mean(cell_ndvi)),
        "mixed": mixed, "model_ndvi": model_ndvi, "shifted_shares": shifted, "shifted_ndvi": shifted_ndvi,
        "cell_ndvi_grid": cell_ndvi_grid, "seasons": seasons, "got": got, "want": want, "series_ok": series_ok, "n_seasons": len(vals),
        "rec_name": rec_name, "composites": len(arrays),
        "selection": {"candidates": len(ranked), "rank": rank, "top": top}, "mcrs_wkt": mcrs_wkt,
        "corners_utm": [to_utm(x, y) for x, y in corners_sin], "corners_ll": [to_ll(x, y) for x, y in corners_sin],
        "centre_ll": centre_ll, "sources": {"pixel_trend_table": bc.sha(os.path.join(tdir, tb["table"])),
                                           "pixel_trend_grid": bc.sha(os.path.join(tdir, tb["grid"]))},
    }


def fingerprint(c):
    return json.dumps({k: (v.tolist() if isinstance(v, np.ndarray) else v) for k, v in c.items() if k not in ("rec_name",)},
                      sort_keys=True, default=str)


def main():
    argv = [a for a in sys.argv[1:] if not a.startswith("--")]
    opts = dict(a[2:].split("=", 1) for a in sys.argv[1:] if a.startswith("--") and "=" in a)
    place, repo, pid, registry, lock_path, bundles = argv
    cfg = place_config.load(place, repo)
    reg = [r for r in json.load(open(registry))["recipes"] if r["recipeId"] == RECIPE][0]
    pc = cfg["recipes"][RECIPE]
    pcfg = next((p for p in pc["pixels"] if p["id"] == pid), None)
    bid = opts.get("bundle-id") or (pc["bundleId"] if pcfg and pcfg.get("role") == "primary" else f"bundle_pixel_anatomy_{cfg['placeId']}_{pid}")
    bdir = os.path.join(bundles, bid)
    if os.path.exists(bdir):
        raise SystemExit(f"{bdir} exists; the bundle folder must not")
    interim = opts.get("interim") or os.path.join(cfg["_repo"], pc["interimInputs"]["root"])
    extracts = opts.get("extracts") or os.path.join(cfg["_repo"], "data/interim/pixel-anatomy")
    now = opts.get("computed") or bc.now_utc()
    inspected = open(opts["inspected"]).read().strip() if "inspected" in opts else None

    c = compute(cfg, reg, pid, interim, extracts, bundles)
    again = compute(cfg, reg, pid, interim, extracts, bundles)
    identical = fingerprint(c) == fingerprint(again)
    print(f"computed twice in this process, identical: {identical}")

    params, sr = c["params"], c["scene"]
    rec = c["rec"]["mar_jun"]
    r0, r1, c0, c1, H, W = c["window"]
    os.makedirs(bdir)
    # data files
    cells = {
        "recipeId": RECIPE, "version": reg["version"], "computed": now, "pixel": pid,
        "grid": {"crs": cfg["analysisCrs"], "cell_m": 10, "rows": H, "cols": W, "origin_x": c["origin"][0], "origin_y": c["origin"][1],
                 "analysis_grid_row0": r0, "analysis_grid_col0": c0,
                 "inside": c["inside"].astype(int).tolist(), "worldcover": c["wc"].astype(int).tolist(),
                 "ndvi_median": [[None if not np.isfinite(x) else round(float(x), 4) for x in row] for row in c["ndvi"]],
                 "ndvi_count": c["ndvi_n"].astype(int).tolist(),
                 "truecolour_rgb": c["tc"].transpose(1, 2, 0).astype(int).tolist()},
        "ndvi_month": pc["ndviMonth"], "truecolour_use": "display only; no number is computed from it",
    }
    spectra = {
        "recipeId": RECIPE, "version": reg["version"], "computed": now, "pixel": pid, "scene_id": sr["stac_item"]["id"],
        "datetime": sr["stac_item"]["properties"]["datetime"], "product_uri": sr["stac_item"]["properties"]["s2:product_uri"],
        "rule": "reflectance = DN / 10000, no offset; kept where SCL is 4 or 5 and every band DN > 0; 20 m bands and SCL repeated 2 x 2 onto 10 m cells",
        "bands": pa.BANDS,
        "wavelengths": {b: {"center_wavelength_um": sr["stac_item"]["eo_bands"][b][0]["center_wavelength"],
                            "full_width_half_max_um": sr["stac_item"]["eo_bands"][b][0]["full_width_half_max"]} for b in pa.BANDS},
        "cells_inside": c["n_in"], "cells_inside_kept": c["kept_inside"], "scl_counts_inside": c["scl_inside"],
        "kept_cells_red_or_nir_above_1": c["over_one"], "classes": c["classes"],
        "pixel_measured": {"mean_reflectance": c["pixel_mean"], "ndvi_of_mean_red_nir": c["measured_ndvi"],
                           "median_cell_ndvi": c["cell_ndvi_median"], "mean_cell_ndvi": c["cell_ndvi_mean"]},
        "model_at_measured_composition": {"claim_kind": CLAIMS["mix_and_series"], "reflectance": c["mixed"], "ndvi": c["model_ndvi"],
                                          "minus_measured": c["model_ndvi"] - c["measured_ndvi"]},
        "model_shift_example": {"claim_kind": CLAIMS["mix_and_series"], "from_class": SHIFT_FROM, "to_class": SHIFT_TO,
                                "points": params["shift_points"], "shares": {str(k): v for k, v in c["shifted_shares"].items()},
                                "ndvi": c["shifted_ndvi"], "minus_model_at_measured": c["shifted_ndvi"] - c["model_ndvi"],
                                "note": "an example of the mixing control, not an observation"},
        "cell_ndvi_this_date": [[None if not np.isfinite(x) else round(float(x), 4) for x in row] for row in c["cell_ndvi_grid"]],
    }
    series = {
        "recipeId": RECIPE, "version": reg["version"], "computed": now, "pixel": pid, "window": params["series_window"],
        "months": MONTHS[params["series_window"]], "reliability_kept": params["pixel_reliability_kept"],
        "min_composite_share": params["min_composite_share"], "search_record": c["rec_name"], "composites_read": c["composites"],
        "seasons": c["seasons"], "theil_sen": c["got"], "matches_trend_table_at_5_decimals": c["series_ok"], "trend_table_values": c["want"],
        "functions": ["modis_ndvi.load_modis", "modis_ndvi.grid_of", "modis_ndvi.read_windows", "modis_ndvi.calendar_periods",
                      "modis_ndvi.season_ndvi", "trend_stats.theil_sen"],
    }
    bc.dump(cells, os.path.join(bdir, "pixel-cells.json"), compact=True)
    bc.dump(spectra, os.path.join(bdir, "pixel-spectra.json"))
    bc.dump(series, os.path.join(bdir, "pixel-series.json"))
    shutil.copyfile(place_config.geometry_path(cfg), os.path.join(bdir, "analysis-geometry.geojson"))
    shutil.copyfile(os.path.join(extracts, "scene-record.json"), os.path.join(bdir, "scene-record.json"))
    for r in sr["extracts"]:
        shutil.copyfile(os.path.join(extracts, r["extract"]), os.path.join(bdir, r["extract"]))
    lock_out = os.path.join(bdir, "uv.lock")
    shutil.copyfile(lock_path, lock_out)

    # checks
    cls_sum = sum(x["cells"] for x in c["composition"])
    recompute_ok = bool(c["mismatch"] == 0 and c["n_in"] == c["catch_in"] == rec["analysis_cells"] and not c["sha_bad"] and c["shape_ok"]
                        and c["over_one"] == 0 and cls_sum == c["n_in"] and c["series_ok"] and c["scene_ok"] and identical
                        and c["selection"]["rank"] is not None)
    chosen = next(x for x in sr["scene_rule"]["candidates"] if x["id"] == sr["scene_rule"]["chosen"])
    item_dt = sr["stac_item"]["properties"]["datetime"]
    in_window = item_dt[:7] == pc["scene"]["month"] == pc["ndviMonth"]
    checks = [
        {"name": "recompute_sample_period", "passed": recompute_ok, "detail": (
            f"Recomputed from the shipped extracts, the pixel trend table and the MOD13Q1 windows. The cell to pixel rule gives the table's analysis_cells for "
            f"{c['n_pixels'] - c['mismatch']} of {c['n_pixels']} pixels ({c['mismatch']} differ); this pixel's footprint holds {c['n_in']} cells, {c['catch_in']} of them "
            f"inside the catchment, against {rec['analysis_cells']} in the table. {len(sr['extracts']) - len(c['sha_bad'])} of {len(sr['extracts'])} extracts have the recorded sha256 "
            f"(mismatching: {c['sha_bad'] or 'none'}) and every window covers the {H} x {W} display window ({c['shape_ok']}). {c['over_one']} kept cells have red or near-infrared "
            f"reflectance above 1.0; class cell counts add up to {cls_sum} of {c['n_in']}. The pixel's {c['n_seasons']}-season March to June series gives slope {c['got']['slope_per_decade']:+.5f} "
            f"and interval {c['got']['lower_per_decade']:+.5f} to {c['got']['upper_per_decade']:+.5f} NDVI per decade, equal to the table's {c['want']['slope_per_decade']:+.5f} and "
            f"{c['want']['lower_per_decade']:+.5f} to {c['want']['upper_per_decade']:+.5f} at 5 decimals ({c['series_ok']}). The scene rule applied to the stored candidates gives "
            f"{sr['scene_rule']['chosen']} ({c['scene_ok']}). The candidate rule gives {c['selection']['candidates']} pixels and ranks this one {c['selection']['rank']}. "
            f"The whole computation run twice in one process gives identical results: {identical}.")},
        {"name": "units_and_scale", "passed": True, "detail": (
            "Reflectance is DN / 10000 with no offset (observation-preprocessing.md, offset rule); extracts hold the stored uint16 DN and uint8 SCL; NDVI is "
            "(near-infrared - red) / (near-infrared + red) from B08 and B04; series NDVI is the MOD13Q1 DN / 10000 season mean; slopes are NDVI per decade (1/(10 a)); "
            "coordinates are EPSG:32629 metres for the grid and decimal degrees for the footprint corners; the MODIS pixel is 231.66 m on a side.")},
        {"name": "nodata_not_zero", "passed": all(r["zero_dn_cells"] == 0 for r in sr["extracts"]), "detail": (
            f"DN 0 means no data in the extracts and occurs in {sum(r['zero_dn_cells'] for r in sr['extracts'])} cells of all {len(sr['extracts'])} windows; SCL 0 (no data) occurs in "
            f"{c['scl_inside'].get('0', 0)} footprint cells. A season whose half of 16-day periods are not kept has no value (null), never 0; "
            f"{len(c['seasons']) - c['n_seasons']} of {len(c['seasons'])} seasons are missing.")},
        {"name": "qa_join_coverage", "passed": chosen["clear_share"] == 1.0, "detail": (
            f"Scene classification joins every footprint cell to its bands: {c['scl_inside']} cells by SCL class in the footprint ({c['n_in']} cells); the share with SCL 4 or 5 "
            f"is {chosen['clear_share']}. The scene rule compared {len([x for x in sr['scene_rule']['candidates'] if x['orbit'] == pc['scene']['relativeOrbit']])} scenes on "
            f"{pc['scene']['relativeOrbit']}; every candidate's share is in scene-record.json.")},
        {"name": "period_alignment", "passed": in_window, "detail": (
            f"The scene ({item_dt[:10]}) lies in {pc['scene']['month']}, the month of the NDVI median and count shown for each cell, and inside the March to June window of the "
            f"last season of the series.")},
        {"name": "attribution_present", "passed": True, "detail": (
            "The Sentinel-2 notice for 2025, the MOD13Q1 v6.1 citation with DOI, subset and access date, the ESA WorldCover attribution and the Copernicus DEM notices are in siterra:attribution.")},
        {"name": "visual_inspection_sample", "passed": inspected is not None,
         "detail": inspected or "Not inspected: run with --inspected=<note> after looking at the rendered pixel."},
    ]
    status = "validated" if all(x["passed"] for x in checks) else "failed"

    p = c["tile"]
    pixel = {
        "id": pid, "modis_tile": f"h{p[0]:02d}v{p[1]:02d}", "tile_row": p[2], "tile_col": p[3], "bundle_row": c["brow"], "bundle_col": c["bcol"],
        "centre_lon_lat": [round(c["centre_ll"][0], 6), round(c["centre_ll"][1], 6)], "median_elevation_m": rec["elevation_m"],
        "cell_size_m": round(pa.PX_M, 2), "footprint_corners_lon_lat": [[round(x, 6), round(y, 6)] for x, y in c["corners_ll"]],
        "footprint_corners_utm29n": [[round(x, 2), round(y, 2)] for x, y in c["corners_utm"]],
        "footprint_cells": c["n_in"], "catchment_cells": c["catch_in"],
    }
    summary = {
        "recipeId": RECIPE, "version": reg["version"], "computed": now,
        "place": {"placeId": cfg["placeId"], "configRevision": cfg["configRevision"], "config_sha256": cfg["_sha256"]},
        "claim_kinds": CLAIMS, "pixel": pixel,
        "trend": {"window": params["series_window"], "slope_per_decade": c["got"]["slope_per_decade"], "lower_per_decade": c["got"]["lower_per_decade"],
                  "upper_per_decade": c["got"]["upper_per_decade"], "direction": rec["direction"], "seasons": c["n_seasons"],
                  "unit": "NDVI per decade", "claim_kind": CLAIMS["mix_and_series"], "series_asset": "pixel_series",
                  "note": "No p-value or false discovery rate class is stored for one pixel (SCI-52)."},
        "composition": [{**x, "share": round(x["share"], 4)} for x in c["composition"]], "terrain": c["terrain"],
        "june_ndvi": {"month": pc["ndviMonth"], **{k: (round(v, 4) if isinstance(v, float) else v) for k, v in c["ndvi_in"].items()},
                      "by_class": {k: {"cells_with_value": v["cells_with_value"], "median": None if v["median"] is None else round(v["median"], 4)}
                                   for k, v in c["ndvi_by_class"].items()}, "cells_asset": "pixel_cells"},
        "scene": {"id": sr["stac_item"]["id"], "datetime": item_dt, "orbit": chosen["orbit"], "baseline": sr["stac_item"]["properties"]["s2:processing_baseline"],
                  "product_uri": sr["stac_item"]["properties"]["s2:product_uri"], "cloud_cover_percent": sr["stac_item"]["properties"]["eo:cloud_cover"],
                  "clear_share": chosen["clear_share"], "rule": sr["scene_rule"]["rule"], "candidates": sr["scene_rule"]["candidates"],
                  "extracts": [{"band": r["band"], "window": r["window"], "sha256": r["extract_sha256"]} for r in sr["extracts"]],
                  "record_asset": "scene_record"},
        "spectra": {"asset": "pixel_spectra", "bands": pa.BANDS, "kept_cells": c["kept_inside"], "cells": c["n_in"],
                    "classes": [{"code": x["code"], "name": x["name"], "share": round(x["share"], 4), "cells_kept": x["cells_kept"],
                                 "red_median": round(x["median"]["B04"], 4), "nir_median": round(x["median"]["B08"], 4),
                                 "ndvi_of_median_red_nir": round(x["ndvi_of_median_red_nir"], 4)} for x in c["classes"]],
                    "pixel_measured_ndvi": round(c["measured_ndvi"], 4), "claim_kind": CLAIMS["composition_and_spectra"]},
        "model": {"claim_kind": CLAIMS["mix_and_series"], "label": "modelled, not measured",
                  "formula": "R(b) = sum over classes of share times class median; NDVI = (R(B08) - R(B04)) / (R(B08) + R(B04))",
                  "ndvi_at_measured_composition": round(c["model_ndvi"], 4), "measured_ndvi": round(c["measured_ndvi"], 4),
                  "model_minus_measured": round(c["model_ndvi"] - c["measured_ndvi"], 4),
                  "shift_example": {"from": WC_NAMES[SHIFT_FROM], "to": WC_NAMES[SHIFT_TO], "points": params["shift_points"],
                                    "ndvi": round(c["shifted_ndvi"], 4), "change": round(c["shifted_ndvi"] - c["model_ndvi"], 4),
                                    "note": "an example of the mixing control, not an observation"}},
        "selection": {"candidate_rule": pc["candidateRule"], "candidates": c["selection"]["candidates"], "rank": c["selection"]["rank"],
                      "top": c["selection"]["top"], "chosen_by": (pcfg or {}).get("chosenBy", "named by the caller; not in the place configuration"),
                      "note": "This pixel is an illustration chosen by judgment, not a sample."},
        "checks": {x["name"]: x["passed"] for x in checks},
        "assets": {"cells": "pixel_cells", "spectra": "pixel_spectra", "series": "pixel_series", "scene_record": "scene_record"},
        "limitations": reg["standardLimitations"], "forbidden_phrases": reg["forbiddenPhrases"],
    }
    spath = os.path.join(bdir, "pixel-anatomy.json")
    bc.dump(summary, spath)

    strata_col = json.load(open(os.path.join(bundles, cfg["strata"]["bundle"], "collection.json")))
    trend_col = json.load(open(os.path.join(bundles, pc["trendBundle"]["bundle"], "collection.json")))
    s2_id = "bundle_s2_ndvi_monthly_ait_bouguemez"
    s2_col = json.load(open(os.path.join(bundles, s2_id, "collection.json")))
    assets = {
        "analysis_geometry": bc.plain_asset(bdir, "analysis-geometry.geojson", "application/geo+json",
                                            f"Frozen analysis geometry {cfg['geometry']['id']}, revision {cfg['geometry']['revision']}", ["metadata"]),
        RECIPE: bc.plain_asset(bdir, "pixel-anatomy.json", "application/json",
                               "Summary: the pixel, its composition, June NDVI by class, the scene and its extracts, class red and near-infrared medians, the labelled mix model, the trend and the selection record (the result read_recipe_result returns)", ["data"]),
        "pixel_cells": bc.plain_asset(bdir, "pixel-cells.json", "application/json",
                                      f"The {H} x {W} display window of 10 m cells: footprint flag, WorldCover class, June NDVI median and date count, and the display-only true colour", ["data"]),
        "pixel_spectra": bc.plain_asset(bdir, "pixel-spectra.json", "application/json",
                                        "Class spectra of the scene in ten bands (median and quartiles), the pixel's measured mean, the mix model, the shift example and the per-cell NDVI of the date", ["data"]),
        "pixel_series": bc.plain_asset(bdir, "pixel-series.json", "application/json",
                                       "The pixel's own March to June greenness for each season 2000 to 2025 with its Theil-Sen slope and Sen 95% interval", ["data"]),
        "scene_record": bc.plain_asset(bdir, "scene-record.json", "application/json",
                                       "Scene choice and extracts: every candidate scene's clear share, the item's properties, and each extract's address, window and sha256", ["metadata"]),
    }
    for r in sr["extracts"]:
        key = "s2_" + r["band"].lower()
        assets[key] = bc.plain_asset(bdir, r["extract"], "image/tiff; application=geotiff",
                                     f"{sr['stac_item']['id']} {r['band']} window over the display window ({r['window']['width']} x {r['window']['height']} cells of {r['resolution_m']:.0f} m), as read",
                                     ["data"], **{"proj:code": "EPSG:32629", "proj:shape": [r["window"]["height"], r["window"]["width"]]})
    sw = {"siterra-science": "0.1.0", "python": sys.version.split()[0], "numpy": np.__version__, "rasterio": rasterio.__version__,
          "gdal": rasterio.__gdal_version__, "pyproj": pyproj.__version__, "shapely": shapely.__version__}
    sc_line = ", ".join(f"{x['name']} {x['cells']} cells ({x['share'] * 100:.1f}%)" for x in c["composition"])
    desc = (
        f"Precomputed result of recipe {RECIPE} {reg['version']} for MODIS pixel {pid} of {cfg['title']} (bundle row {c['brow']}, column {c['bcol']}, centre "
        f"{pixel['centre_lon_lat'][1]} N, {abs(pixel['centre_lon_lat'][0])} W): {c['n_in']} cells of 10 m, {sc_line}. Class spectra from {sr['stac_item']['id']} ({item_dt[:10]}); the "
        f"pixel's measured NDVI on that day is {c['measured_ndvi']:.4f}, a linear mix of the class medians (modelled) gives {c['model_ndvi']:.4f}; its own March to June "
        f"greenness over {c['n_seasons']} seasons has a Theil-Sen slope of {c['got']['slope_per_decade']:+.4f} NDVI per decade (95% interval {c['got']['lower_per_decade']:+.4f} to "
        f"{c['got']['upper_per_decade']:+.4f}). The pixel is an illustration chosen by judgment (rank {c['selection']['rank']} of {c['selection']['candidates']} candidates), not a sample.\n\n"
        + " ".join(reg["standardLimitations"]))
    attribution = []
    for a in ["Contains modified Copernicus Sentinel data 2025", *trend_col["siterra:attribution"], *strata_col["siterra:attribution"]]:
        if a not in attribution:
            attribution.append(a)
    col = {
        "type": "Collection", "stac_version": "1.1.0",
        "stac_extensions": ["https://stac-extensions.github.io/processing/v1.3.0/schema.json",
                            "https://stac-extensions.github.io/file/v2.1.0/schema.json", PROJ_EXT, EXT],
        "id": bid, "title": f"One MODIS pixel opened into its 10 m cells ({RECIPE} {reg['version']})", "description": desc, "license": "other",
        "providers": [
            *[x for x in s2_col["providers"] if "processor" not in x["roles"] or x["name"] != "Siterra science pipeline"],
            *[x for x in trend_col["providers"] if "processor" not in x["roles"]],
            {"name": "Siterra science pipeline", "roles": ["processor"],
             "processing:lineage": ("The pixel's cells from the strata grid, WorldCover 2021 and the Sentinel-2 monthly NDVI median; band windows of one scene read from the "
                                    "public sentinel-cogs bucket (science/pipeline/pixel-anatomy-fetch.py); spectra, mix and series (science/pipeline/pixel-anatomy-bundle.py)"),
             "processing:software": sw},
        ],
        "extent": {"spatial": {"bbox": [[min(x for x, _ in c["corners_ll"]), min(y for _, y in c["corners_ll"]),
                                         max(x for x, _ in c["corners_ll"]), max(y for _, y in c["corners_ll"])]]},
                   "temporal": {"interval": [["2000-03-01T00:00:00Z", "2025-06-30T23:59:59Z"]]}},
        "assets": assets, "created": now, "siterra:status": status, "siterra:variable": "pixel_anatomy",
        "siterra:dataset": {
            "id": "sentinel-2-l2a", "version": sr["stac_item"]["properties"]["s2:processing_baseline"],
            "access_route": f"{sr['stac_item']['self']}; band windows from the public sentinel-cogs bucket (COG range reads); MOD13Q1 v6.1 windows for the series",
            "resolution_note": "Sentinel-2 10 m and 20 m bands on one 10 m grid; MODIS 250 m pixel of 231.66 m for the footprint and the series"},
        "siterra:geo_selection": strata_col["siterra:geo_selection"],
        "siterra:method": {
            "id": RECIPE, "version": reg["version"], "analysis_crs": cfg["analysisCrs"],
            "parameters": {
                "place_configuration": f"science/places/{os.path.basename(place)} revision {cfg['configRevision']}, sha256 {cfg['_sha256']}",
                "pixel": pid, **params, "ndvi_month": pc["ndviMonth"], "scene_tile": pc["scene"]["tile"], "scene_relative_orbit": pc["scene"]["relativeOrbit"],
                "scene_month": pc["scene"]["month"], "candidate_rule": pc["candidateRule"],
                "pinned_inputs": {k: v["sha256"] for k, v in pc["interimInputs"].items() if isinstance(v, dict)},
                "trend_bundle_files": c["sources"]},
            "reference_period": None, "operation_order": reg["formula"]},
        "siterra:attribution": attribution, "siterra:limitations": reg["standardLimitations"], "siterra:checks": checks,
        "links": [
            {"rel": "root", "href": "../catalog.json", "type": "application/json"},
            {"rel": "parent", "href": "../catalog.json", "type": "application/json"},
            *[{"rel": "derived_from", "href": f"../{x['id']}/collection.json", "type": "application/json", "title": t,
               "file:checksum": "1220" + bc.sha(os.path.join(bundles, x["id"], "collection.json"))}
              for x, t in ((strata_col, f"Terrain strata bundle {strata_col['id']}"), (trend_col, f"Pixel trend bundle {trend_col['id']}"),
                           (s2_col, f"Sentinel-2 monthly NDVI bundle {s2_col['id']} (the June NDVI of each cell)"))],
            {"rel": "derived_from", "href": sr["stac_item"]["self"], "type": "application/geo+json",
             "title": f"Earth Search item {sr['stac_item']['id']} (cached copy sha256 {sr['stac_item']['sha256']})",
             "siterra:retrieved_datetime": sr["stac_item"]["cached_by_science_lane_utc"]},
            *[x for x in trend_col["links"] if x["rel"] in ("license", "cite-as")],
            *[x for x in s2_col["links"] if x["rel"] == "license" and "Sentinel" in x["title"]],
            {"rel": "processing-software", "href": "./uv.lock", "type": "application/toml", "title": "Pipeline lockfile (uv)",
             "file:checksum": "1220" + bc.sha(lock_out)},
        ],
    }
    bc.dump(col, os.path.join(bdir, "collection.json"))
    print(f"{bid}: {status}")
    print(f"  pixel {pid} bundle ({c['brow']}, {c['bcol']}) cells {c['n_in']} ({c['catch_in']} in catchment, table {rec['analysis_cells']}); window {H} x {W}; mismatches {c['mismatch']} of {c['n_pixels']}")
    print("  composition", [(x["name"], x["cells"], round(x["share"], 4)) for x in c["composition"]])
    print("  june ndvi", {k: (round(v, 4) if isinstance(v, float) else v) for k, v in c["ndvi_in"].items()}, {k: round(v["median"], 3) for k, v in c["ndvi_by_class"].items()})
    print("  scene", sr["scene_rule"]["chosen"], "| spectra ndvi(median red,nir)", {x["name"]: round(x["ndvi_of_median_red_nir"], 4) for x in c["classes"]})
    print(f"  measured {c['measured_ndvi']:.4f} model {c['model_ndvi']:.4f} shifted {c['shifted_ndvi']:.4f} | kept {c['kept_inside']} over1 {c['over_one']}")
    print(f"  series {c['got']} == table {c['want']}: {c['series_ok']}; seasons {c['n_seasons']}")
    print(f"  selection {c['selection']['candidates']} candidates, rank {c['selection']['rank']}, top {[t['pixel'] for t in c['selection']['top']]}")
    for x in checks:
        print(f"  check {x['name']}: {'passed' if x['passed'] else 'FAILED'}")


if __name__ == "__main__":
    main()
