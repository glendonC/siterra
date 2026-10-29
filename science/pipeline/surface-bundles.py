"""Write the relief or the land cover bundle of a place: the elevation surface on the 30 m EPSG:32629 grid (terrain_relief) or the WorldCover
2021 classes on the 10 m analysis grid with their class table (land_cover_classes), each as a cloud-optimised GeoTIFF plus a summary and a
STAC Collection.

Usage: python -I surface-bundles.py <relief|land_cover> <place.json> <repo_root> <dem.tif> <registry.json> <lockfile> <bundles_dir>
       [--inspected=<note.txt>] [--computed=<YYYY-MM-DDTHH:MM:SSZ>] [--heights-from=<bundle dir>]...

Follows the registered terrain_relief 1.0.1 and land_cover_classes 1.0.0 recipes. The terrain strata bundle named in the place configuration
must be in <bundles_dir>. --heights-from names a drainage network or transects bundle folder whose stored heights the relief check recomputes.
The bundle folder must not exist yet. Without --inspected the visual inspection check fails and the bundle status is failed.
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
from rasterio.shutil import copy as rio_copy
from rasterio.transform import Affine

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bundle_common as bc  # noqa: E402
import drainage_network as dn  # noqa: E402
import place_config  # noqa: E402
import surface_layers as sl  # noqa: E402

EXT = "https://siterra.invalid/schemas/stac/siterra/1.1.0/schema.json"
PROJ_EXT = "https://stac-extensions.github.io/projection/v2.1.0/schema.json"
RASTER_EXT = "https://stac-extensions.github.io/raster/v1.1.0/schema.json"
BUNDLES = {"relief": ("terrain_relief", "bundle_relief_ait_bouguemez", "elevation_surface"),
           "land_cover": ("land_cover_classes", "bundle_land_cover_ait_bouguemez", "landcover_mask")}
TO_UTM = Transformer.from_crs("EPSG:4326", "EPSG:32629", always_xy=True)
FROM_UTM = Transformer.from_crs("EPSG:32629", "EPSG:4326", always_xy=True)
CELL_NOTE = {"relief": "terrain-relief.json", "land_cover": "land-cover-classes.json"}


def native_dem(dem_path, lon, lat):
    """Bilinear height from the native 1 arc-second tile in longitude and latitude."""
    with rasterio.open(dem_path) as s:
        win = rasterio.windows.from_bounds(lon.min() - 0.005, lat.min() - 0.005, lon.max() + 0.005, lat.max() + 0.005,
                                           transform=s.transform).round_offsets().round_lengths()
        z = s.read(1, window=win).astype(np.float64)
        tr = s.window_transform(win)
    return dn.bilinear(z, tr.c, tr.f, tr.a, lon, lat)


def native_inside_stats(dem_path, poly):
    """Lowest and highest native tile height among the cells whose centres lie inside the polygon."""
    with rasterio.open(dem_path) as s:
        win = rasterio.windows.from_bounds(*poly.bounds, transform=s.transform).round_offsets().round_lengths()
        z = s.read(1, window=win)
        tr = s.window_transform(win)
    ins = rasterio.features.geometry_mask([shapely.geometry.mapping(poly)], z.shape, tr, invert=True)
    return float(z[ins].min()), float(z[ins].max()), int(ins.sum())


def build_relief(cfg, reg, dem, bundles, bdir, params, strata_col):
    place_config.check_dem(cfg, dem)
    a_tr, a_shape, mask10 = place_config.analysis_grid(cfg)
    pad = params["pad_cells"]
    z30, gx0, gy0, res = place_config.elevation_grid(cfg, dem, pad_cells=pad)
    k = int(round(res / cfg["analysisGridM"]))
    inside30 = sl.parent_cells(mask10, k, pad)
    keep = sl.dilate(inside30, 1)
    nodata = np.float32(params["nodata"])
    surf = np.where(keep & ~np.isnan(z30), z30, nodata).astype(np.float32)
    path = os.path.join(bdir, "elevation-surface.tif")
    tmp = os.path.join(bdir, "_surface.tif")
    tr = Affine(res, 0, gx0, 0, -res, gy0)
    prof = dict(driver="GTiff", dtype="float32", count=1, height=surf.shape[0], width=surf.shape[1], crs=cfg["analysisCrs"], transform=tr, nodata=float(nodata))
    with rasterio.open(tmp, "w", **prof) as w:
        w.write(surf, 1)
    rio_copy(tmp, path, driver="COG", compress="DEFLATE", predictor="FLOATING_POINT", overviews="NONE")
    os.remove(tmp)

    with rasterio.open(path) as s:
        stored = s.read(1)
        s_tr, s_crs, s_shape = s.transform, s.crs.to_string(), [s.height, s.width]
    inside_stored = inside30 & (stored != nodata)
    n_inside_nodata = int((inside30 & (stored == nodata)).sum())
    # 1: the stored surface repeated 3 x 3 equals place_config.elevation() on every inside cell
    rep = np.repeat(np.repeat(stored[pad:-pad, pad:-pad], k, axis=0), k, axis=1)[: a_shape[0], : a_shape[1]]
    ref = place_config.elevation(cfg, dem)
    differing = int((mask10 & (rep != ref)).sum())
    # 2: heights stored in other bundles reproduce from the stored surface
    stored_nan = np.where(stored == nodata, np.nan, stored)
    reproduced = []
    for folder in params["_heights_from"]:
        col = json.load(open(os.path.join(folder, "collection.json")))
        values = []
        if "drainage_lines" in col["assets"]:
            for f in json.load(open(os.path.join(folder, col["assets"]["drainage_lines"]["href"])))["features"]:
                geoms = f["geometry"]["coordinates"] if f["geometry"]["type"] == "MultiLineString" else [f["geometry"]["coordinates"]]
                values += [v for g in geoms for v in g]
        elif "transect_samples" in col["assets"]:
            s_json = json.load(open(os.path.join(folder, col["assets"]["transect_samples"]["href"])))["transects"]
            for t in s_json.values():
                values += [[a, b, c] for a, b, c in zip(t["columns"]["lon"], t["columns"]["lat"], t["columns"]["elevation_m"])]
        else:
            raise SystemExit(f"{folder} has neither drainage lines nor transect samples")
        v = np.array(values, np.float64)
        E, N = TO_UTM.transform(v[:, 0], v[:, 1])
        got = dn.bilinear(stored_nan, gx0, gy0, res, E, N)
        diff = np.abs(got - v[:, 2])
        reproduced.append({"bundle": col["id"], "collection_sha256": bc.sha(os.path.join(folder, "collection.json")), "values": int(len(v)),
                           "differing_more_than_tolerance": int(((diff > params["vertex_tolerance_m"] + 1e-9) | np.isnan(diff)).sum()),
                           "largest_difference_m": round(float(np.nanmax(diff)), 3)})
    # 3: against the native tile at the inside cell centres
    rr, cc = np.nonzero(inside_stored)
    E, N = gx0 + (cc + 0.5) * res, gy0 - (rr + 0.5) * res
    lon, lat = FROM_UTM.transform(E, N)
    ad = np.abs(native_dem(dem, lon, lat) - stored[rr, cc].astype(np.float64))
    native = {"percentile": float(np.percentile(ad, params["recompute_percentile"])), "max": float(ad.max()),
              "max_at": [round(float(lon[ad.argmax()]), 6), round(float(lat[ad.argmax()]), 6)], "cells": int(len(ad))}
    # summary numbers
    poly = place_config.geometry(cfg)
    nmin, nmax, ncells = native_inside_stats(dem, poly)
    z_in = rep[mask10]
    bounds = strata_col["siterra:method"]["parameters"]["boundaries_m"]
    band = np.digitize(z_in, bounds) + 1
    ok = (differing == 0 and n_inside_nodata == 0 and native["percentile"] <= params["recompute_tolerance_m"]
          and all(r["differing_more_than_tolerance"] == 0 for r in reproduced))
    core = {
        "grid": {"crs": s_crs, "cell_m": res, "shape": s_shape, "transform": list(s_tr)[:6], "pad_cells": pad, "nodata": float(nodata)},
        "cells": {"kept": int((stored != nodata).sum()), "inside_polygon_parents": int(inside30.sum()), "ring_outside": int(((stored != nodata) & ~inside30).sum()),
                  "analysis_cells_inside_10m": int(mask10.sum())},
        "elevation_m_inside_cells_10m": {"lowest": round(float(z_in.min()), 1), "highest": round(float(z_in.max()), 1), "mean": round(float(z_in.mean()), 1)},
        "native_tile_inside_polygon_m": {"lowest": nmin, "highest": nmax, "cells": ncells},
        "band_boundaries_m": bounds,
        "band_share_of_inside_cells": {str(i): round(float((band == i).mean()), 4) for i in (1, 2, 3)},
        "checks": {"repeat_equals_elevation_differing_cells": differing, "inside_cells_without_height": n_inside_nodata,
                   "heights_reproduced": reproduced, "native_tile": native},
    }
    return path, core, ok, {"native": native, "differing": differing, "nodata_inside": n_inside_nodata, "reproduced": reproduced}


def build_land_cover(cfg, reg, dem, bundles, bdir, params, strata_col):
    a_tr, a_shape, mask10 = place_config.analysis_grid(cfg)
    lc = place_config.land_cover(cfg)
    lcfg = cfg["landCover"]
    path = os.path.join(bdir, "land-cover.tif")
    tmp = os.path.join(bdir, "_land_cover.tif")
    prof = dict(driver="GTiff", dtype="uint8", count=1, height=a_shape[0], width=a_shape[1], crs=cfg["analysisCrs"], transform=a_tr, nodata=params["nodata"])
    out = np.where(mask10, lc, 0).astype(np.uint8)
    with rasterio.open(tmp, "w", **prof) as w:
        w.write(out, 1)
    rio_copy(tmp, path, driver="COG", compress="DEFLATE", overview_resampling="nearest")
    os.remove(tmp)
    with rasterio.open(path) as s:
        stored = s.read(1)
        s_tr, s_crs, s_shape = s.transform, s.crs.to_string(), [s.height, s.width]
    rows, unknown = sl.class_table(stored, mask10, lcfg["classes"], a_tr.a * -a_tr.e)
    total = int(mask10.sum())
    zero_inside = int((stored[mask10] == 0).sum())
    counts = {r["code"]: r["cells"] for r in rows}
    layers, excluded, _, _ = place_config.strata(cfg)
    n_excl = int(excluded[mask10].sum())
    excl_cells = counts.get(40, 0) + counts.get(50, 0)
    differ_read_back = int((np.where(mask10, lc, 0) != stored).sum())
    groups = []
    for g in lcfg["groups"]:
        n = int(sum(counts.get(c, 0) for c in g["classes"]))
        groups.append({"id": g["id"], "label": g["label"], "classes": g["classes"], "cells": n, "share": round(n / total, 4)})
    ok = (sum(r["cells"] for r in rows) == total and not unknown and zero_inside == 0 and n_excl == excl_cells and differ_read_back == 0)
    core = {
        "grid": {"crs": s_crs, "cell_m": a_tr.a, "shape": s_shape, "transform": list(s_tr)[:6], "nodata": params["nodata"]},
        "cells_inside": total, "classes": rows, "groups": groups,
        "dataset": lcfg["dataset"], "layer_sha256_in_place_configuration": lcfg["sha256"],
        "checks": {"class_counts_sum": sum(r["cells"] for r in rows), "unlisted_classes": unknown, "zero_inside": zero_inside,
                   "excluded_layer_cells": n_excl, "cropland_plus_built_up_cells": excl_cells, "differing_from_placed_grid": differ_read_back},
    }
    return path, core, ok, {"rows": rows, "unknown": unknown, "zero": zero_inside, "n_excl": n_excl, "excl": excl_cells, "read_back": differ_read_back,
                            "total": total}


def main():
    pos = [a for a in sys.argv[1:] if not a.startswith("--")]
    which, place, repo, dem, registry, lock_path, bundles = pos
    opts = {}
    heights = []
    for a in sys.argv[1:]:
        if a.startswith("--heights-from="):
            heights.append(a.split("=", 1)[1])
        elif a.startswith("--"):
            k, _, v = a[2:].partition("=")
            opts[k] = v
    recipe, bid, variable = BUNDLES[which]
    cfg = place_config.load(place, repo)
    reg = next(r for r in json.load(open(registry))["recipes"] if r["recipeId"] == recipe)
    params = {p["name"]: p["default"] for p in reg["parameters"]}
    params["_heights_from"] = heights
    bdir = os.path.join(bundles, bid)
    if os.path.exists(bdir):
        raise SystemExit(f"{bdir} exists; the bundle folder must not")
    now = opts.get("computed") or bc.now_utc()
    inspected = open(opts["inspected"]).read().strip() if "inspected" in opts else None
    strata_col = json.load(open(os.path.join(bundles, cfg["strata"]["bundle"], "collection.json")))
    os.makedirs(bdir)
    build = build_relief if which == "relief" else build_land_cover
    tif, core, ok, detail = build(cfg, reg, dem, bundles, bdir, params, strata_col)
    # a second pass in this process must give the same file
    again = os.path.join(os.path.dirname(bdir), "_again_" + bid)
    os.makedirs(again)
    tif2, _, _, _ = build(cfg, reg, dem, bundles, again, params, strata_col)
    identical = bc.sha(tif) == bc.sha(tif2)
    shutil.rmtree(again)
    shutil.copyfile(place_config.geometry_path(cfg), os.path.join(bdir, "analysis-geometry.geojson"))
    lock_out = os.path.join(bdir, "uv.lock")
    shutil.copyfile(lock_path, lock_out)
    poly = place_config.geometry(cfg)
    recompute_ok = bool(ok and identical)

    if which == "relief":
        n = detail["native"]
        rec_detail = (
            f"Recomputed from the stored surface and the native 1 arc-second DEM tile. The stored surface repeated 3 x 3 onto the 10 m grid differs from "
            f"place_config.elevation() in {detail['differing']} of {core['cells']['analysis_cells_inside_10m']} cells inside the polygon; {detail['nodata_inside']} inside cells have no height. "
            "Heights interpolated bilinearly from the stored surface (not rounded) against the stored heights of other bundles: "
            + "; ".join(f"{r['bundle']} (collection sha256 {r['collection_sha256'][:12]}): {r['differing_more_than_tolerance']} of {r['values']} values differ by more than "
                        f"{params['vertex_tolerance_m']} m (unrounded interpolation), largest {r['largest_difference_m']} m" for r in detail["reproduced"])
            + f". Against the native tile (bilinear in longitude and latitude) at the centres of the {n['cells']} inside 30 m cells, the absolute differences have a "
            f"{params['recompute_percentile']}th percentile of {n['percentile']:.2f} m (tolerance {params['recompute_tolerance_m']} m) and a largest value of {n['max']:.2f} m "
            f"at lon {n['max_at'][0]}, lat {n['max_at'][1]}. The whole build run twice in one process gives an identical file: {identical}.")
        units = ("Elevation is float32 metres above the EGM2008 geoid (Copernicus DEM GLO-30 vertical datum) on a 30 m EPSG:32629 grid, not rounded; "
                 f"nodata is {params['nodata']}; the three elevation bands are {core['band_boundaries_m'][0]} m and {core['band_boundaries_m'][1]} m as in the strata bundle.")
        nodata_detail = (f"Nodata is {params['nodata']}, never 0 (sea level is not in the catchment, but 0 is not used to mean missing); "
                         f"{core['cells']['ring_outside']} kept cells lie in the one-cell ring outside the catchment and {detail['nodata_inside']} inside cells are nodata.")
        title = f"Elevation surface of the valley catchment ({recipe} {reg['version']})"
        desc = (f"Precomputed result of recipe {recipe} {reg['version']} for {cfg['title']}: the Copernicus DEM GLO-30 (2021) height of every 30 m cell of the catchment "
                f"({core['cells']['inside_polygon_parents']} cells plus a ring of {core['cells']['ring_outside']} cells for interpolation) on the 30 m EPSG:32629 grid that gives the drainage "
                f"lines, the profiles and the terrain strata their heights; heights from {core['elevation_m_inside_cells_10m']['lowest']} to {core['elevation_m_inside_cells_10m']['highest']} m. "
                "Observation from a 30 m surface model.\n\n" + " ".join(reg["standardLimitations"]))
        data_asset = {"title": "Elevation surface: float32 metres above the EGM2008 geoid on the 30 m EPSG:32629 grid; nodata -9999.0 outside the catchment and its one-cell ring",
                      "bands": [{"name": "elevation", "data_type": "float32", "nodata": float(params["nodata"]), "unit": "m",
                                 "description": "Copernicus DEM GLO-30 2021, bilinear to 30 m, metres above the EGM2008 geoid"}]}
        attribution = [a for a in strata_col["siterra:attribution"] if "WorldCover" not in a]
        dataset = {"id": "copernicus-dem-glo-30", "version": "2021", "access_route": strata_col["siterra:dataset"]["access_route"],
                   "resolution_note": "DEM 1 arc-second (about 30 m), resampled once to the 30 m EPSG:32629 grid of the terrain strata"}
        links_src = [l for l in strata_col["links"] if l["rel"] == "derived_from" and l["href"].endswith("_DEM.tif")]
        licenses = [l for l in strata_col["links"] if l["rel"] == "license" and "copernicus" in l["href"]]
        lineage = ("The Copernicus DEM GLO-30 (2021) tile resampled once, bilinear, to the 30 m EPSG:32629 grid of the terrain strata with a one-cell margin; "
                   "cells outside the catchment and its ring are nodata (science/pipeline/surface-bundles.py)")
        extent_t = [["2021-01-01T00:00:00Z", None]]
        derived = [{"rel": "derived_from", "href": f"../{strata_col['id']}/collection.json", "type": "application/json",
                    "title": f"Terrain strata bundle {strata_col['id']}", "file:checksum": "1220" + bc.sha(os.path.join(bundles, strata_col["id"], "collection.json"))}]
        for r in detail["reproduced"]:
            derived.append({"rel": "derived_from", "href": f"../{r['bundle']}/collection.json", "type": "application/json",
                            "title": f"{r['bundle']} (heights recomputed from this surface)", "file:checksum": "1220" + r["collection_sha256"]})
        param_out = {k: v for k, v in params.items() if not k.startswith("_")}
    else:
        rows = detail["rows"]
        rec_detail = (
            f"Recomputed from the stored layer. The class counts sum to {core['checks']['class_counts_sum']} against {detail['total']} 10 m cells inside the polygon; "
            f"{detail['zero']} inside cells have class 0; classes outside the configured list: {detail['unknown'] or 'none'}; cropland plus built-up cells {detail['excl']} against "
            f"{detail['n_excl']} in the excluded layer of the strata raster; {detail['read_back']} cells of the stored file differ from the placed WorldCover grid. "
            f"The whole build run twice in one process gives an identical file: {identical}.")
        units = ("Class codes are the ESA WorldCover 2021 v200 legend values (10 tree cover, 20 shrubland, 30 grassland, 40 cropland, 50 built-up, 60 bare or sparse vegetation, "
                 "80 permanent water bodies); areas are km2 from 10 m cells of 100 m2 in EPSG:32629; shares are fractions of the cells inside the polygon.")
        nodata_detail = ("Nodata is 0 and means outside the polygon; no WorldCover class has code 0 and "
                         f"{detail['zero']} cells inside the polygon carry it.")
        title = f"Land cover of the valley catchment ({recipe} {reg['version']})"
        desc = (f"Precomputed result of recipe {recipe} {reg['version']} for {cfg['title']}: the ESA WorldCover 2021 v200 class of each of the {core['cells_inside']} 10 m cells of the "
                "catchment, with a table of cells, area and share per class and per configured group. A 2021 context map, not pasture types.\n\n" + " ".join(reg["standardLimitations"]))
        data_asset = {"title": "WorldCover 2021 v200 class codes on the 10 m EPSG:32629 analysis grid; 0 outside the catchment",
                      "bands": [{"name": "land_cover_class", "data_type": "uint8", "nodata": params["nodata"], "unit": "1",
                                 "description": "ESA WorldCover 2021 v200 class code; 0 outside the polygon"}]}
        attribution = list(strata_col["siterra:attribution"])
        dataset = {"id": "esa-worldcover-v200", "version": "2021", "access_route": cfg["landCover"]["source"],
                   "resolution_note": "WorldCover 10 m 2021 v200, nearest neighbour onto the 10 m EPSG:32629 analysis grid"}
        links_src = [l for l in strata_col["links"] if l["rel"] == "derived_from" and "WorldCover" in l["href"]]
        licenses = [l for l in strata_col["links"] if l["rel"] == "license"]
        lineage = ("The ESA WorldCover 2021 v200 class map read for the catchment and placed on the 10 m analysis grid (nearest neighbour, science/pipeline/worldcover-grid.py), "
                   "clipped to the frozen polygon, with its class table (science/pipeline/surface-bundles.py)")
        extent_t = [["2021-01-01T00:00:00Z", "2021-12-31T23:59:59Z"]]
        derived = [{"rel": "derived_from", "href": f"../{strata_col['id']}/collection.json", "type": "application/json",
                    "title": f"Terrain strata bundle {strata_col['id']} (excluded layer, for a check)",
                    "file:checksum": "1220" + bc.sha(os.path.join(bundles, strata_col["id"], "collection.json"))}]
        param_out = {k: v for k, v in params.items() if not k.startswith("_")}

    checks = [
        {"name": "recompute_sample_period", "passed": recompute_ok, "detail": rec_detail},
        {"name": "units_and_scale", "passed": True, "detail": units},
        {"name": "nodata_not_zero", "passed": True, "detail": nodata_detail},
        {"name": "attribution_present", "passed": True, "detail": (
            "The Copernicus DEM notices (Article 6(b) and 6(c)) and the liability statement" + (" and the ESA WorldCover citation (CC BY 4.0)" if which == "land_cover" else "")
            + " are in siterra:attribution.")},
        {"name": "visual_inspection_sample", "passed": inspected is not None,
         "detail": inspected or "Not inspected: run with --inspected=<note> after looking at the rendered layer."},
    ]
    status = "validated" if all(c["passed"] for c in checks) else "failed"
    summary = {"recipeId": recipe, "version": reg["version"], "computed": now,
               "place": {"placeId": cfg["placeId"], "configRevision": cfg["configRevision"], "config_sha256": cfg["_sha256"]},
               "claim_kind": "observation", **core, "units": units, "check_results": {c["name"]: c["passed"] for c in checks},
               "limitations": reg["standardLimitations"], "forbidden_phrases": reg["forbiddenPhrases"]}
    sp = os.path.join(bdir, CELL_NOTE[which])
    bc.dump(summary, sp)
    tif_name = os.path.basename(tif)
    assets = {
        "analysis_geometry": bc.plain_asset(bdir, "analysis-geometry.geojson", "application/geo+json",
                                            f"Frozen analysis geometry {cfg['geometry']['id']}, revision {cfg['geometry']['revision']}", ["metadata"]),
        recipe: bc.plain_asset(bdir, CELL_NOTE[which], "application/json",
                               "Summary: grid, cell counts, " + ("heights and checks" if which == "relief" else "class table, groups and checks")
                               + " (the result read_recipe_result returns)", ["data"]),
        ("elevation_surface" if which == "relief" else "land_cover"): bc.plain_asset(
            bdir, tif_name, "image/tiff; application=geotiff; profile=cloud-optimized", data_asset["title"], ["data"],
            **{"proj:code": core["grid"]["crs"], "proj:shape": core["grid"]["shape"], "proj:transform": core["grid"]["transform"], "bands": data_asset["bands"]}),
    }
    sw = {"siterra-science": "0.1.0", "python": sys.version.split()[0], "numpy": np.__version__, "rasterio": rasterio.__version__,
          "gdal": rasterio.__gdal_version__, "pyproj": pyproj.__version__, "shapely": shapely.__version__}
    col = {
        "type": "Collection", "stac_version": "1.1.0",
        "stac_extensions": ["https://stac-extensions.github.io/processing/v1.3.0/schema.json",
                            "https://stac-extensions.github.io/file/v2.1.0/schema.json", PROJ_EXT, EXT],
        "id": bid, "title": title, "description": desc, "license": "other",
        "providers": [*[p for p in strata_col["providers"] if "processor" not in p["roles"] and "host" not in p["roles"]
                        and (which == "land_cover" or "WorldCover" not in p["name"])],
                      {"name": "Siterra science pipeline", "roles": ["processor"], "processing:lineage": lineage, "processing:software": sw}],
        "extent": {"spatial": {"bbox": [list(poly.bounds)]}, "temporal": {"interval": extent_t}},
        "assets": assets, "created": now, "siterra:status": status, "siterra:variable": variable,
        "siterra:dataset": dataset, "siterra:geo_selection": strata_col["siterra:geo_selection"],
        "siterra:method": {"id": recipe, "version": reg["version"], "analysis_crs": cfg["analysisCrs"],
                           "parameters": {"place_configuration": f"science/places/{os.path.basename(place)} revision {cfg['configRevision']}, sha256 {cfg['_sha256']}", **param_out},
                           "reference_period": None, "operation_order": reg["formula"]},
        "siterra:attribution": attribution, "siterra:limitations": reg["standardLimitations"], "siterra:checks": checks,
        "links": [{"rel": "root", "href": "../catalog.json", "type": "application/json"},
                  {"rel": "parent", "href": "../catalog.json", "type": "application/json"},
                  *derived, *links_src, *licenses,
                  {"rel": "processing-software", "href": "./uv.lock", "type": "application/toml", "title": "Pipeline lockfile (uv)",
                   "file:checksum": "1220" + bc.sha(lock_out)}],
    }
    bc.dump(col, os.path.join(bdir, "collection.json"))
    print(f"{bid}: {status}; {os.path.getsize(tif)} bytes; identical rerun {identical}")
    print(json.dumps(core["checks"], indent=1)[:2500])
    if which == "relief":
        print(json.dumps({k: core[k] for k in ("cells", "elevation_m_inside_cells_10m", "native_tile_inside_polygon_m", "band_share_of_inside_cells")}))
    else:
        for r in core["classes"]:
            print(" ", r)
        print(" groups", core["groups"])
    for c in checks:
        print(f"  check {c['name']}: {'passed' if c['passed'] else 'FAILED'}")


if __name__ == "__main__":
    main()
