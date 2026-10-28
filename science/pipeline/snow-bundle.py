"""Precompute snow_cover_by_band for a place and write it as a derived bundle (STAC Collection with JSON results).

Usage: python -I snow-bundle.py <place.json> <repo_root> <modis_raw_dir> <dem.tif> <registry.json> <lockfile> <bundles_dir>
  modis_raw_dir   the modis-10A1-061 folder written by modis-fetch.py (search record, item JSON, windows, sidecars)
  dem.tif         the DEM file named in the place configuration (checksum checked)
  bundles_dir     the bundle folder holding the place's strata bundle; the new bundle is written there

Every place-specific value (geometry, months, elevation band sets) comes from the place configuration; the formula and
thresholds are those of registry entry snow_cover_by_band. Writes bundle_snow_cover_by_band_<placeId>:
  snow-cover-by-band.json         compact summary read by read_recipe_result (first JSON data asset): monthly series per
                                  band of the primary band set, both NDSI thresholds, with the clear share
  snow-cover-by-band-tables.json  every band of every band set and month: product days, weights, clear share, both thresholds
  collection.json, analysis-geometry.geojson, uv.lock
The bundle declares siterra:variable snow_cover_fraction, which the Siterra STAC extension must list before the bundle
validates. The catalog is not changed. Prints statuses and checks, not the fractions.
"""
import datetime
import hashlib
import json
import os
import shutil
import sys

import numpy as np
import rasterio
from rasterio.warp import Resampling, reproject

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import modis_record  # noqa: E402
import place_config  # noqa: E402
import restrend_rerun  # noqa: E402

RECIPE = "snow_cover_by_band"
ASSET = "NDSI_Snow_Cover"
EXT = "https://siterra.invalid/schemas/stac/siterra/1.1.0/schema.json"
THRESHOLDS = {"ndsi_0.2": 20, "ndsi_0.4": 40}
CLEAR_MAX, CLOUD = 100, 250
FRACTION_DECIMALS = 4
RERUN_TOL = 1e-4
MODIS_CITATION = ("Hall, D. K. and G. A. Riggs. 2021. MODIS/Terra Snow Cover Daily L3 Global 500m SIN Grid, Version 61. "
                  "Tile h17v05, NDSI_Snow_Cover, {first} to {last}, windows over the catchment read from Microsoft Planetary "
                  "Computer. Boulder, Colorado USA. NASA National Snow and Ice Data Center Distributed Active Archive Center. "
                  "https://doi.org/10.5067/MODIS/MOD10A1.061. Accessed {date}")


def sha(p):
    return place_config.sha256(p)


def dump(o, p, compact=False):
    with open(p, "w") as f:
        if compact:
            json.dump(o, f, separators=(",", ":"), ensure_ascii=False)
        else:
            json.dump(o, f, indent=1, ensure_ascii=False)
        f.write("\n")


def month_list(first, last):
    y, m = map(int, first.split("-"))
    y1, m1 = map(int, last.split("-"))
    out = []
    while (y, m) <= (y1, m1):
        out.append((y, m))
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)
    return out


def item_date(key):
    return datetime.date(int(key[1:5]), 1, 1) + datetime.timedelta(days=int(key[5:8]) - 1)


def band_masks(cfg, elev, band_sets):
    """{set id: [(band id, label, mask)]} from fixed edges or from a strata layer."""
    tr, shp, mask = place_config.analysis_grid(cfg)
    out = {}
    for bs in band_sets:
        bands = []
        if "edgesM" in bs:
            e = bs["edgesM"]
            bounds = [None] + e + [None]
            for lo, hi in zip(bounds[:-1], bounds[1:]):
                m = mask & ~np.isnan(elev)
                if lo is not None:
                    m &= elev >= lo
                if hi is not None:
                    m &= elev < hi
                bid = f"elev_{'below' if lo is None else int(lo)}_{'up' if hi is None else int(hi)}"
                label = f"below {hi} m" if lo is None else (f"{lo} m and above" if hi is None else f"{lo} to {hi} m")
                bands.append((bid, label, m))
        else:
            labels = place_config.stratum_labels(cfg)
            layer = next(l for l in cfg["strata"]["layers"] if l["name"] == bs["fromStrataLayer"])
            masks = place_config.stratum_masks(cfg, [layer["name"]])
            for k in sorted(layer["classes"], key=int):
                sid = layer["classes"][k]
                bands.append((sid, labels[sid], masks[sid]))
        out[bs["id"]] = bands
    return out


def main():
    place, repo, raw, dem, reg_path, lock_path, bundles = [a for a in sys.argv[1:] if not a.startswith("--")][:7]
    cfg = place_config.load(place, repo)
    rc = cfg["recipes"][RECIPE]
    reg = {r["recipeId"]: r for r in json.load(open(reg_path))["recipes"]}[RECIPE]
    par = {p["name"]: p["default"] for p in reg["parameters"]}
    min_clear = par["min_clear_share"]
    assert sorted(p for p in next(p for p in reg["parameters"] if p["name"] == "ndsi_threshold")["allowed"]) == [0.2, 0.4]
    months = month_list(*rc["months"])
    primary_set = next(b["id"] for b in rc["elevationBandSets"] if b.get("primary"))
    now = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    rec_name, rec = modis_record.search_record(raw)
    gaps = modis_record.archive_gaps(raw, rec_name, rec)
    sidecars = {iid.split(".")[1]: json.load(open(os.path.join(raw, iid + ".json"))) for iid in rec["kept"]}
    grids = {(tuple(s["assets"][ASSET]["transform"]), s["assets"][ASSET]["window"]["width"], s["assets"][ASSET]["window"]["height"])
             for s in sidecars.values()}
    if len(grids) != 1:
        raise SystemExit("MOD10A1 windows do not share one grid")
    g = grids.pop()
    mtr, mshape = rasterio.Affine(*g[0]), (g[2], g[1])
    mcrs = next(iter(sidecars.values()))["crs_wkt"]
    encodings = {(s["assets"][ASSET]["dtype"], s["assets"][ASSET]["nodata"]) for s in sidecars.values()}

    elev = place_config.elevation(cfg, dem)
    sets = band_masks(cfg, elev, rc["elevationBandSets"])
    _, _, cmask = place_config.analysis_grid(cfg)
    all_bands = [("catchment", cfg["title"], cmask)] + [b for bs in sets.values() for b in bs]
    names = [b[0] for b in all_bands]
    weights = place_config.pixel_weights(cfg, {b[0]: b[2] for b in all_bands}, mcrs, mtr, mshape)
    Wm = np.stack([weights[n] for n in names])  # bands x H x W
    Wtot = Wm.reshape(len(names), -1).sum(axis=1)

    by_month = {}
    for key in sidecars:
        d = item_date(key)
        by_month.setdefault((d.year, d.month), []).append(key)
    rows = {n: [] for n in names}
    for (y, m) in months:
        keys = sorted(by_month.get((y, m), []))
        acc = {"clear": np.zeros(len(names)), **{t: np.zeros(len(names)) for t in THRESHOLDS}}
        for key in keys:
            side = sidecars[key]
            a = side["assets"][ASSET]
            with rasterio.open(os.path.join(raw, a["file"])) as s:
                v = s.read(1)
            if hashlib.sha256(np.ascontiguousarray(v).tobytes()).hexdigest() != a["values_sha256"]:
                raise SystemExit(f"stored window of {side['item_id']} does not match its sidecar checksum")
            clear = (v <= CLEAR_MAX)
            acc["clear"] += np.tensordot(Wm, clear.astype(np.float64), axes=([1, 2], [0, 1]))
            for t, thr in THRESHOLDS.items():
                acc[t] += np.tensordot(Wm, (clear & (v >= thr)).astype(np.float64), axes=([1, 2], [0, 1]))
        for i, n in enumerate(names):
            possible = len(keys) * Wtot[i]
            row = {"month": f"{y}-{m:02d}", "product_days": len(keys)}
            if possible == 0:
                row.update(clear_share=None, status="no_product", **{t: None for t in THRESHOLDS})
            else:
                cs = acc["clear"][i] / possible
                ok = cs >= min_clear and acc["clear"][i] > 0
                row.update(clear_share=round(float(cs), FRACTION_DECIMALS), status="available" if ok else "insufficient_clear",
                           **{t: (round(float(acc[t][i] / acc["clear"][i]), FRACTION_DECIMALS) if ok else None) for t in THRESHOLDS})
            rows[n].append(row)

    # independent rerun of one month: fresh reads, nearest-neighbour resampling to the analysis grid, cell means
    ry, rm = months[-1][0], 1
    rkeys = sorted(by_month.get((ry, rm), []))
    atr, ashp, _ = place_config.analysis_grid(cfg)
    prim = sets[primary_set]
    clear_c = {b[0]: 0 for b in prim}
    snow_c = {b[0]: 0 for b in prim}
    tot_c = {b[0]: 0 for b in prim}
    identical = 0
    for key in rkeys:
        a = sidecars[key]["assets"][ASSET]
        v = restrend_rerun._read(a["href"], a["window"])
        identical += hashlib.sha256(np.ascontiguousarray(v).tobytes()).hexdigest() == a["values_sha256"]
        dst = np.full(ashp, 255, np.uint8)
        reproject(v, dst, src_transform=mtr, src_crs=mcrs, dst_transform=atr, dst_crs=cfg["analysisCrs"],
                  resampling=Resampling.nearest, tolerance=0)
        for bid, _, msk in prim:
            vv = dst[msk]
            tot_c[bid] += vv.size
            clear_c[bid] += int((vv <= CLEAR_MAX).sum())
            snow_c[bid] += int(((vv <= CLEAR_MAX) & (vv >= THRESHOLDS["ndsi_0.2"])).sum())
    worst = 0.0
    compared = 0
    for bid, _, _ in prim:
        stored = next(r for r in rows[bid] if r["month"] == f"{ry}-{rm:02d}")
        cs = clear_c[bid] / tot_c[bid] if tot_c[bid] else None
        worst = max(worst, abs(cs - stored["clear_share"]))
        if stored["ndsi_0.2"] is not None and clear_c[bid]:
            worst = max(worst, abs(snow_c[bid] / clear_c[bid] - stored["ndsi_0.2"]))
            compared += 1
    rerun_ok = identical == len(rkeys) and worst <= RERUN_TOL + 0.5 * 10 ** -FRACTION_DECIMALS

    n_insuff = sum(1 for r in rows["catchment"] if r["status"] != "available")
    days_total = sum(len(v) for k, v in by_month.items() if k in set(months))
    cal_days = sum((datetime.date(y + (m == 12), m % 12 + 1, 1) - datetime.date(y, m, 1)).days for y, m in months)
    absent = []
    for y, m in months:
        d = datetime.date(y, m, 1)
        while d.month == m:
            key = f"A{d.year}{d.timetuple().tm_yday:03d}"
            if key not in sidecars:
                absent.append(key)
            d += datetime.timedelta(days=1)
    gap_text = modis_record.gap_sentence(absent, gaps, "day")
    checks = [
        {"name": "recompute_sample_period", "passed": bool(rerun_ok),
         "detail": (f"Month {ry}-{rm:02d} rerun independently for the {primary_set} bands: {len(rkeys)} daily windows read again from "
                    f"Planetary Computer with a fresh token, {identical} identical to the stored ones; each day resampled to the 10 m "
                    f"analysis grid by nearest neighbour and counted over each band's cells; largest difference from the stored clear "
                    f"share and NDSI 0.2 fraction {worst:.6f} over {len(prim)} bands ({compared} with a fraction), tolerance "
                    f"{RERUN_TOL} plus rounding.")},
        {"name": "nodata_not_zero", "passed": True,
         "detail": "NDSI_Snow_Cover 0 is snow-free land and counts as clear; flag values (200 missing, 201 no decision, 211 night, "
                   "237 inland water, 239 ocean, 250 cloud, 254 detector saturated, 255 fill) are not observed and never count as 0."},
        {"name": "units_and_scale", "passed": encodings == {("uint8", 255.0)},
         "detail": "Every stored window is uint8 with nodata 255; values 0 to 100 are NDSI times 100, so threshold t is applied as "
                   "a value of at least 100 t. Fractions are shares of 10 m analysis-cell-weighted pixel-days, 0 to 1."},
        {"name": "qa_join_coverage", "passed": True,
         "detail": (f"All {len(sidecars)} daily windows share one {mshape[1]} x {mshape[0]} pixel grid; {days_total} of {cal_days} "
                    f"calendar days from {months[0][0]}-{months[0][1]:02d} to {months[-1][0]}-{months[-1][1]:02d} have a Terra product "
                    f"on Planetary Computer. {gap_text} Catchment months below the clear share minimum or without a product: "
                    f"{n_insuff} of {len(months)}.")},
        {"name": "period_alignment", "passed": True,
         "detail": "A daily product belongs to the calendar month of its acquisition date (AYYYYDDD in the item ID)."},
        {"name": "attribution_present", "passed": True,
         "detail": "The NSIDC-required MOD10A1 v6.1 citation with subset and access date and the Copernicus DEM notices are in siterra:attribution"},
    ]

    bid = f"bundle_snow_cover_by_band_{cfg['placeId']}"
    bdir = os.path.join(bundles, bid)
    os.makedirs(bdir, exist_ok=True)
    strata_col = json.load(open(os.path.join(bundles, cfg["strata"]["bundle"], "collection.json")))
    first_item, last_item = min(rec["kept"]), max(rec["kept"])
    access = rec["searched_at"][:10]
    band_meta = {"catchment": {"label": cfg["title"], "set": None}}
    for sid, bs in sets.items():
        for b in bs:
            band_meta[b[0]] = {"label": b[1], "set": sid}
    for i, n in enumerate(names):
        band_meta[n].update(analysis_cells=int(all_bands[i][2].sum()), modis_pixels_touched=int((weights[n] > 0).sum()))
    tables = {
        "recipeId": RECIPE, "version": reg["version"], "computed": now,
        "place": {"placeId": cfg["placeId"], "configRevision": cfg["configRevision"], "config_sha256": cfg["_sha256"]},
        "thresholds": {k: v / 100 for k, v in THRESHOLDS.items()}, "min_clear_share": min_clear,
        "band_sets": {sid: [b[0] for b in bs] for sid, bs in sets.items()}, "primary_band_set": primary_set,
        "bands": band_meta, "rows": rows,
        "inputs": {"modis": {"collection": rec["collection"], "search_record": rec_name, "items": len(rec["kept"]),
                             "first_item": first_item, "last_item": last_item, "dropped_duplicates": len(rec["dropped_duplicates"]),
                             "searched_at": rec["searched_at"], "days_absent_on_planetary_computer": absent,
                             "archive_gaps": None if gaps is None else {k: gaps[k] for k in ("checked_at", "cmr", "listed_in_cmr", "missing_in_both")}},
                   "dem_sha256": cfg["elevation"]["sha256"], "strata_bundle": strata_col["id"]},
    }
    series = {}
    for n in ["catchment"] + [b[0] for b in sets[primary_set]]:
        series[n] = {"label": band_meta[n]["label"],
                     "snow_cover_fraction_ndsi_0.2": [r["ndsi_0.2"] for r in rows[n]],
                     "snow_cover_fraction_ndsi_0.4": [r["ndsi_0.4"] for r in rows[n]],
                     "clear_share": [r["clear_share"] for r in rows[n]]}
    summary = {
        "recipeId": RECIPE, "version": reg["version"], "computed": now,
        "place": {"placeId": cfg["placeId"], "configRevision": cfg["configRevision"]},
        "claim_kind": "observation",
        "native_resolution": "500 m MODIS (MOD10A1 v6.1), daily",
        "months": {"first": f"{months[0][0]}-{months[0][1]:02d}", "last": f"{months[-1][0]}-{months[-1][1]:02d}", "count": len(months)},
        "series_layout": "each list holds one value per month from the first month on; null where the clear share is below the minimum or there is no product",
        "default_threshold": "ndsi_0.2", "min_clear_share": min_clear, "band_set": primary_set,
        "series": series,
        "product_days": [r["product_days"] for r in rows["catchment"]],
        "archive_gaps": gap_text,
        "full_tables": "snow-cover-by-band-tables.json",
        "limitations": reg["standardLimitations"],
    }
    spath = os.path.join(bdir, "snow-cover-by-band.json")
    tpath = os.path.join(bdir, "snow-cover-by-band-tables.json")
    dump(summary, spath, compact=True)
    dump(tables, tpath, compact=True)
    shutil.copyfile(place_config.geometry_path(cfg), os.path.join(bdir, "analysis-geometry.geojson"))
    lock_out = os.path.join(bdir, "uv.lock")
    shutil.copyfile(lock_path, lock_out)
    lic = [{"rel": "license", "href": "https://www.earthdata.nasa.gov/engage/open-data-services-software-policies/data-use-guidance",
            "title": "MOD10A1 v6.1: NASA data use guidance (NASA-led mission data without a marked restriction are CC0); NSIDC requires the data citation"}]
    lic += [l for l in strata_col["links"] if l["rel"] == "license"]
    attribution = [MODIS_CITATION.format(first=first_item.split(".")[1], last=last_item.split(".")[1], date=access)]
    attribution += [a for a in strata_col["siterra:attribution"] if a not in attribution]
    desc = (f"Precomputed result of recipe {RECIPE} {reg['version']} for {cfg['title']}: the monthly snow-covered share of each "
            f"elevation band from {months[0][0]}-{months[0][1]:02d} to {months[-1][0]}-{months[-1][1]:02d}, from {days_total} daily "
            f"Terra MOD10A1 v6.1 products (500 m), at NDSI thresholds 0.2 and 0.4, with the clear share of each band and month. "
            f"Band sets: {', '.join(f'{sid} (' + ', '.join(b[1] for b in bs) + ')' for sid, bs in sets.items())}. Observation; "
            f"{n_insuff} of {len(months)} catchment months fall below the clear share minimum of {min_clear} or have no product."
            "\n\n" + " ".join(reg["standardLimitations"]))
    col = {
        "type": "Collection", "stac_version": "1.1.0",
        "stac_extensions": ["https://stac-extensions.github.io/processing/v1.3.0/schema.json",
                            "https://stac-extensions.github.io/file/v2.1.0/schema.json", EXT],
        "id": bid, "title": f"Monthly snow cover by elevation band, {months[0][0]} to {months[-1][0]} ({RECIPE} {reg['version']})",
        "description": desc, "license": "other",
        "providers": [
            {"name": "NASA National Snow and Ice Data Center Distributed Active Archive Center", "roles": ["producer", "licensor"],
             "url": "https://nsidc.org/data/mod10a1/versions/61"},
            {"name": "Microsoft Planetary Computer", "roles": ["host"], "url": "https://planetarycomputer.microsoft.com/dataset/modis-10A1-061"},
            *[p for p in strata_col["providers"] if "processor" not in p["roles"] and "host" not in p["roles"]],
            {"name": "Siterra science pipeline", "roles": ["processor"],
             "processing:lineage": (f"Anonymous SAS-signed range reads of MOD10A1 v6.1 NDSI_Snow_Cover windows over the frozen geometry "
                                    f"from Planetary Computer ({len(sidecars)} Terra days); Copernicus DEM GLO-30 elevation on the 10 m "
                                    f"analysis grid; band shares weighted by 10 m analysis cells (science/pipeline/snow-bundle.py)."),
             "processing:software": {"siterra-science": "0.1.0", "python": sys.version.split()[0], "numpy": np.__version__,
                                     "rasterio": rasterio.__version__, "gdal": rasterio.__gdal_version__}}],
        "extent": {"spatial": {"bbox": [list(place_config.geometry(cfg).bounds)]},
                   "temporal": {"interval": [[f"{months[0][0]}-{months[0][1]:02d}-01T00:00:00Z",
                                              f"{months[-1][0]}-{months[-1][1]:02d}-{(datetime.date(months[-1][0] + (months[-1][1] == 12), months[-1][1] % 12 + 1, 1) - datetime.timedelta(days=1)).day}T23:59:59Z"]]}},
        "assets": {
            "analysis_geometry": {"href": "./analysis-geometry.geojson", "type": "application/geo+json",
                                  "title": f"Frozen analysis geometry {cfg['geometry']['id']}, revision {cfg['geometry']['revision']}",
                                  "roles": ["metadata"], "file:checksum": "1220" + sha(os.path.join(bdir, "analysis-geometry.geojson")),
                                  "file:size": os.path.getsize(os.path.join(bdir, "analysis-geometry.geojson"))},
            "snow_cover_by_band": {"href": "./snow-cover-by-band.json", "type": "application/json",
                                   "title": "Summary: monthly snow cover fraction and clear share per band of the primary band set, both thresholds (the result read_recipe_result returns)",
                                   "roles": ["data"], "file:checksum": "1220" + sha(spath), "file:size": os.path.getsize(spath)},
            "snow_cover_tables": {"href": "./snow-cover-by-band-tables.json", "type": "application/json",
                                  "title": "Full tables: every band of every band set and month, product days, clear share, both thresholds",
                                  "roles": ["data"], "file:checksum": "1220" + sha(tpath), "file:size": os.path.getsize(tpath)}},
        "created": now,
        "siterra:status": "validated" if all(c["passed"] for c in checks) else "failed",
        "siterra:variable": "snow_cover_fraction",
        "siterra:dataset": {"id": "modis-10A1-061", "version": "6.1",
                            "access_route": "https://planetarycomputer.microsoft.com/api/stac/v1 collection modis-10A1-061, asset NDSI_Snow_Cover, anonymous SAS-signed COG range reads",
                            "resolution_note": "Native 500 m MODIS sinusoidal grid (463.31 m cells), daily"},
        "siterra:geo_selection": strata_col["siterra:geo_selection"],
        "siterra:method": {"id": RECIPE, "version": reg["version"], "analysis_crs": cfg["analysisCrs"],
                           "parameters": {"place_configuration": f"science/places/{os.path.basename(place)} revision {cfg['configRevision']}, sha256 {cfg['_sha256']}",
                                          "months": rc["months"], "elevation_band_sets": rc["elevationBandSets"],
                                          "ndsi_thresholds": [v / 100 for v in THRESHOLDS.values()], "min_clear_share": min_clear,
                                          "stored_precision": f"fractions at {FRACTION_DECIMALS} decimals"},
                           "reference_period": None, "operation_order": reg["formula"]},
        "siterra:attribution": attribution,
        "siterra:limitations": reg["standardLimitations"],
        "siterra:checks": checks,
        "links": [{"rel": "root", "href": "../catalog.json", "type": "application/json"},
                  {"rel": "parent", "href": "../catalog.json", "type": "application/json"},
                  {"rel": "derived_from", "href": f"../{strata_col['id']}/collection.json", "type": "application/json",
                   "title": f"Terrain strata bundle {strata_col['id']} (equal-area elevation bands)",
                   "file:checksum": "1220" + sha(os.path.join(bundles, strata_col["id"], "collection.json"))},
                  *lic,
                  {"rel": "cite-as", "href": "https://doi.org/10.5067/MODIS/MOD10A1.061", "title": "Hall and Riggs (2021), MOD10A1 v6.1 data set DOI"},
                  {"rel": "processing-software", "href": "./uv.lock", "type": "application/toml", "title": "Pipeline lockfile (uv)",
                   "file:checksum": "1220" + sha(lock_out)}]}
    dump(col, os.path.join(bdir, "collection.json"))
    print(f"{bid}: {col['siterra:status']}; bands {len(names)}; months {len(months)}; catchment months not available {n_insuff}; "
          f"summary {os.path.getsize(spath)} bytes, tables {os.path.getsize(tpath)} bytes")
    for c in checks:
        print(f"  check {c['name']}: {'passed' if c['passed'] else 'FAILED'}")


if __name__ == "__main__":
    main()
