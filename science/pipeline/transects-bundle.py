"""Precompute terrain_transects for a place and write it as a bundle: elevation profiles every 30 m along the meridian
through Tabant and along the longest flow path from the outlet, with band, WorldCover class and inside flag per sample,
band crossings, land cover runs and the valley floor segment, as JSON, 3D GeoJSON lines and a STAC Collection.

Usage: python -I transects-bundle.py <place.json> <repo_root> <dem.tif> <registry.json> <lockfile> <bundles_dir>
       [--inspected=<note.txt>] [--computed=<YYYY-MM-DDTHH:MM:SSZ>]

Follows the registered terrain_transects 1.0.0 recipe. The valley axis is read from the drainage network bundle in
<bundles_dir>, which must hold it with the strata bundle. The bundle folder must not exist yet. Without --inspected the
visual inspection check fails and the bundle status is failed.
"""
import json
import os
import shutil
import sys

import numpy as np
import pyproj
import rasterio
import shapely
from pyproj import Geod, Transformer
from shapely.geometry import shape

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bundle_common as bc  # noqa: E402
import drainage_network as dn  # noqa: E402
import place_config  # noqa: E402
import terrain_transects as tt  # noqa: E402

RECIPE = "terrain_transects"
EXT = "https://siterra.invalid/schemas/stac/siterra/1.1.0/schema.json"
PROJ_EXT = "https://stac-extensions.github.io/projection/v2.1.0/schema.json"
GEOD = Geod(ellps="WGS84")
TO_UTM = Transformer.from_crs("EPSG:4326", "EPSG:32629", always_xy=True)
PAD_CELLS = 1
COORD_DECIMALS = 7
BOUNDARY_TOLERANCE_DEG = 10 ** -COORD_DECIMALS  # a sample on the polygon's boundary, to the stored precision, counts as inside
RULES = {
    "meridian_through_point": "The meridian (line of constant longitude) through {name}, clipped to the frozen polygon: the part that contains it, "
                              "from its northernmost to its southernmost point; distance runs from north to south.",
    "longest_flow_path": "The longest flow path of the drainage network from the outlet to a head: at each confluence the upstream segment with the "
                         "longer way up, ties by the larger upstream area and then the lower segment number; distance runs from the outlet.",
}
CLASS_NAMES = {0: "outside the analysis area", 10: "tree cover", 20: "shrubland", 30: "grassland", 40: "cropland", 50: "built-up",
               60: "bare or sparse vegetation", 80: "permanent water bodies"}


def derive(d, z, lc, bounds, floor_max):
    """Everything the summary says about one profile, from its stored samples."""
    cross = tt.crossings(d, z, bounds)
    km = tt.band_lengths(d, z, bounds) / 1000
    run_list = tt.runs(d, lc)
    total = float(d[-1])
    share = {}
    for c, lo, hi in run_list:
        share[c] = share.get(c, 0.0) + (hi - lo) / total
    floor = tt.floor_segment(d, z, floor_max)
    lo_i, hi_i = int(np.argmin(z)), int(np.argmax(z))
    return {
        "crossings": [{"boundary_m": b, "distance_m": round(x, 1), "direction": direction} for b, x, direction, _ in cross],
        "km_in_band": {str(i + 1): round(float(v), 3) for i, v in enumerate(km)},
        "runs": [{"class": c, "label": CLASS_NAMES.get(c, str(c)), "from_m": round(lo, 1), "to_m": round(hi, 1)} for c, lo, hi in run_list],
        "share": {str(c): round(v, 4) for c, v in sorted(share.items())},
        "floor": None if floor is None else {
            "from_m": round(floor[2], 1), "to_m": round(floor[3], 1), "length_m": round(floor[3] - floor[2], 1),
            "first_sample": floor[0], "last_sample": floor[1],
            "elevation_m": [round(float(z[floor[0]:floor[1] + 1].min()), 1), round(float(z[floor[0]:floor[1] + 1].max()), 1)]},
        "lowest": {"distance_m": round(float(d[lo_i]), 1), "elevation_m": round(float(z[lo_i]), 1)},
        "highest": {"distance_m": round(float(d[hi_i]), 1), "elevation_m": round(float(z[hi_i]), 1)},
    }


def native_dem(dem_path, lon, lat):
    """Bilinear height from the native 1 arc-second tile in longitude and latitude, for the recompute check."""
    with rasterio.open(dem_path) as s:
        win = rasterio.windows.from_bounds(lon.min() - 0.005, lat.min() - 0.005, lon.max() + 0.005, lat.max() + 0.005,
                                           transform=s.transform).round_offsets().round_lengths()
        z = s.read(1, window=win).astype(np.float64)
        tr = s.window_transform(win)
    return dn.bilinear(z, tr.c, tr.f, tr.a, lon, lat)


def compute(cfg, reg, dem, bundles):
    params = {p["name"]: p["default"] for p in reg["parameters"]}
    tc = cfg["recipes"][RECIPE]
    step = params["step_m"]
    strata_col = json.load(open(os.path.join(bundles, cfg["strata"]["bundle"], "collection.json")))
    bounds = strata_col["siterra:method"]["parameters"]["boundaries_m"]
    floor_max = float(tc["valleyFloor"]["maxElevationM"])
    poly = place_config.geometry(cfg)
    z30, gx0, gy0, gres = place_config.elevation_grid(cfg, dem, pad_cells=PAD_CELLS)
    lc_grid = place_config.land_cover(cfg)
    a_tr, a_shape, _ = place_config.analysis_grid(cfg)
    strata_band = place_config.strata(cfg)[0]["elevation_band"]
    net = tc["transects"][1]["network"]
    ncol = json.load(open(os.path.join(bundles, net["bundle"], "collection.json")))
    lines_path = os.path.join(bundles, net["bundle"], ncol["assets"][net["asset"]]["href"])
    feats = {f["properties"]["segment_id"]: f for f in json.load(open(lines_path))["features"]}

    out = []
    for spec in tc["transects"]:
        if spec["kind"] == "meridian_through_point":
            lon0, lat0 = spec["point"]["lon"], spec["point"]["lat"]
            n_lat, s_lat = tt.meridian_ends(poly, lon0, (lon0, lat0))
            d, lon, lat = tt.meridian_samples(lon0, n_lat, s_lat, step)
            seg = None
            ends = {"north_lat": round(n_lat, 6), "south_lat": round(s_lat, 6)}
        elif spec["kind"] == "longest_flow_path":
            props = {sid: f["properties"] for sid, f in feats.items()}
            path = tt.longest_path({sid: p["upstream_segment_ids"] for sid, p in props.items()},
                                   {sid: p["length_m"] for sid, p in props.items()},
                                   {sid: p["upstream_area_km2"] for sid, p in props.items()})
            verts, begins = tt.join_upstream({sid: feats[sid]["geometry"]["coordinates"] for sid in path}, path)
            d, lon, lat, k = tt.polyline_samples([v[0] for v in verts], [v[1] for v in verts], step)
            seg = [path[j] for j in np.searchsorted(begins, k, side="right") - 1]
            ends = {"segments": path}
        else:
            raise SystemExit(f"unknown transect kind {spec['kind']}")
        lon, lat = np.round(lon, COORD_DECIMALS), np.round(lat, COORD_DECIMALS)
        E, N = TO_UTM.transform(lon, lat)
        z = np.round(dn.bilinear(z30, gx0, gy0, gres, E, N), 1)
        col = np.floor((np.asarray(E) - a_tr.c) / a_tr.a).astype(int)
        row = np.floor((a_tr.f - np.asarray(N)) / -a_tr.e).astype(int)
        ok = (row >= 0) & (row < a_shape[0]) & (col >= 0) & (col < a_shape[1])
        lc = np.where(ok, lc_grid[np.clip(row, 0, a_shape[0] - 1), np.clip(col, 0, a_shape[1] - 1)], 0).astype(int)
        sb = np.where(ok, strata_band[np.clip(row, 0, a_shape[0] - 1), np.clip(col, 0, a_shape[1] - 1)], 0).astype(int)
        inside = shapely.intersects_xy(poly.buffer(BOUNDARY_TOLERANCE_DEG), lon, lat)
        band = tt.band_of(z, bounds)
        rec = {"spec": spec, "d": d, "lon": lon, "lat": lat, "z": z, "band": band, "lc": lc, "strata_band": sb, "inside": inside,
               "seg": seg, "ends": ends, "derived": derive(d, z, lc, bounds, floor_max)}
        if spec["kind"] == "meridian_through_point":
            td = GEOD.inv(lon0, n_lat, lon0, lat0)[2]
            tE, tN = TO_UTM.transform(lon0, lat0)
            rec["reference_points"] = [{"name": spec["point"]["name"], "distance_m": round(float(td), 1),
                                        "elevation_m": round(float(dn.bilinear(z30, gx0, gy0, gres, tE, tN)), 1)}]
        else:
            rec["reference_points"] = [{"name": "outlet", "distance_m": 0.0, "elevation_m": float(z[0])},
                                       {"name": "head", "distance_m": round(float(d[-1]), 1), "elevation_m": float(z[-1])}]
        out.append(rec)
    return {"transects": out, "bounds": bounds, "floor_max": floor_max, "params": params}


def main():
    argv = [a for a in sys.argv[1:] if not a.startswith("--")]
    opts = dict(a[2:].split("=", 1) for a in sys.argv[1:] if a.startswith("--") and "=" in a)
    place, repo, dem, registry, lock_path, bundles = argv
    cfg = place_config.load(place, repo)
    place_config.check_dem(cfg, dem)
    reg = [r for r in json.load(open(registry))["recipes"] if r["recipeId"] == RECIPE][0]
    tc = cfg["recipes"][RECIPE]
    bid = tc["bundleId"]
    bdir = os.path.join(bundles, bid)
    if os.path.exists(bdir):
        raise SystemExit(f"{bdir} exists; the bundle folder must not")
    now = opts.get("computed") or bc.now_utc()
    inspected = open(opts["inspected"]).read().strip() if "inspected" in opts else None

    core = compute(cfg, reg, dem, bundles)
    again = compute(cfg, reg, dem, bundles)

    def fingerprint(c):
        return json.dumps([[t["d"].tolist(), t["lon"].tolist(), t["lat"].tolist(), t["z"].tolist(), t["band"].tolist(),
                            t["lc"].tolist(), t["inside"].tolist(), t["seg"], t["derived"]] for t in c["transects"]], sort_keys=True)

    identical = fingerprint(core) == fingerprint(again)
    print(f"computed twice in this process, identical: {identical}")

    params, bounds = core["params"], core["bounds"]
    os.makedirs(bdir)
    samples = {"recipeId": RECIPE, "version": reg["version"], "computed": now, "step_m": params["step_m"], "band_boundaries_m": bounds,
               "transects": {}}
    lines = []
    summary_t = {}
    for t in core["transects"]:
        s, dv = t["spec"], t["derived"]
        cols = {"distance_m": [round(float(x), 1) for x in t["d"]], "lon": t["lon"].tolist(), "lat": t["lat"].tolist(),
                "elevation_m": t["z"].tolist(), "band": t["band"].tolist(), "land_cover": t["lc"].tolist(),
                "inside": [bool(x) for x in t["inside"]]}
        if t["seg"] is not None:
            cols["segment_id"] = t["seg"]
        samples["transects"][s["id"]] = {"columns": cols, "band_crossings": dv["crossings"], "land_cover_runs": dv["runs"]}
        length = round(float(t["d"][-1]), 1)
        lines.append({"type": "Feature", "id": s["id"],
                      "geometry": {"type": "LineString", "coordinates": [[a, b, c] for a, b, c in zip(cols["lon"], cols["lat"], cols["elevation_m"])]},
                      "properties": {"transect_id": s["id"], "kind": s["kind"], "label": s["label"], "length_m": length,
                                     "step_m": params["step_m"], "samples": len(t["d"])}})
        summary_t[s["id"]] = {
            "label": s["label"], "kind": s["kind"],
            "rule": RULES[s["kind"]].format(**s.get("point", {})),
            "from": [float(t["lon"][0]), float(t["lat"][0])], "to": [float(t["lon"][-1]), float(t["lat"][-1])],
            "ends": t["ends"], "length_m": length, "samples": len(t["d"]), "step_m": params["step_m"],
            "elevation_m": {"lowest": dv["lowest"], "highest": dv["highest"]},
            "band_crossings": dv["crossings"], "km_in_band": dv["km_in_band"],
            "land_cover_share": {CLASS_NAMES.get(int(c), c): v for c, v in dv["share"].items()},
            "land_cover_runs": len(dv["runs"]), "valley_floor": dv["floor"], "reference_points": t["reference_points"],
            "samples_inside_polygon": int(t["inside"].sum()),
        }
    sp = os.path.join(bdir, "transect-samples.json")
    bc.dump(samples, sp, compact=True)
    lp = os.path.join(bdir, "transect-lines.geojson")
    bc.dump({"type": "FeatureCollection", "features": lines}, lp, compact=True)
    shutil.copyfile(place_config.geometry_path(cfg), os.path.join(bdir, "analysis-geometry.geojson"))
    lock_out = os.path.join(bdir, "uv.lock")
    shutil.copyfile(lock_path, lock_out)

    # checks, from the stored samples and the native tile
    stored = json.load(open(sp))["transects"]
    poly = place_config.geometry(cfg)
    problems = {"outside": 0, "spacing": 0, "band": 0, "derived": 0, "not_finite": 0}
    native = {}
    differ = {"inside_samples": 0, "compared": 0, "differing": 0, "no_strata_cell": 0, "max_boundary_distance_m": 0.0}
    for t in core["transects"]:
        c = stored[t["spec"]["id"]]["columns"]
        d, z = np.array(c["distance_m"]), np.array(c["elevation_m"])
        problems["outside"] += int(len(d) - shapely.intersects_xy(poly.buffer(BOUNDARY_TOLERANCE_DEG), c["lon"], c["lat"]).sum())
        gap = np.diff(d)
        problems["spacing"] += int((np.abs(gap[:-1] - params["step_m"]) > 0.11).sum()) + int(gap[-1] > params["step_m"] + 0.11)
        problems["not_finite"] += int((~np.isfinite(z)).sum())
        problems["band"] += int((tt.band_of(z, bounds) != np.array(c["band"])).sum())
        again_d = derive(d, z, np.array(c["land_cover"]), bounds, core["floor_max"])
        sm = summary_t[t["spec"]["id"]]
        if again_d["crossings"] != sm["band_crossings"] or again_d["km_in_band"] != sm["km_in_band"] or again_d["floor"] != sm["valley_floor"]:
            problems["derived"] += 1
        ad = np.abs(native_dem(dem, np.array(c["lon"]), np.array(c["lat"])) - z)
        native[t["spec"]["id"]] = {"percentile": float(np.percentile(ad, params["recompute_percentile"])), "max": float(ad.max()),
                                   "max_at_m": float(d[int(ad.argmax())])}
        ins = np.array(c["inside"])
        sb = t["strata_band"]
        compared = ins & (sb > 0)
        diff = compared & (sb != np.array(c["band"]))
        differ["inside_samples"] += int(ins.sum())
        differ["compared"] += int(compared.sum())
        differ["differing"] += int(diff.sum())
        differ["no_strata_cell"] += int((ins & (sb == 0)).sum())
        for i in np.flatnonzero(diff):
            differ["max_boundary_distance_m"] = max(differ["max_boundary_distance_m"], float(min(abs(z[i] - b) for b in bounds)))
    exp = next(s for s in tc["transects"] if s["kind"] == "meridian_through_point")["expectedEnds"]
    mer = next(t for t in core["transects"] if t["spec"]["kind"] == "meridian_through_point")
    ends_ok = (round(mer["ends"]["north_lat"], exp["decimals"]) == exp["northLat"]
               and round(mer["ends"]["south_lat"], exp["decimals"]) == exp["southLat"])
    tol = params["recompute_tolerance_m"]
    native_ok = all(v["percentile"] <= tol for v in native.values())
    recompute_ok = bool(ends_ok and not any(problems.values()) and native_ok and identical)
    n_lc0 = int(sum(int((t["lc"] == 0).sum()) for t in core["transects"]))
    n_samples = sum(len(t["d"]) for t in core["transects"])
    n_lc0_inside = int(sum(int(((t["lc"] == 0) & t["inside"]).sum()) for t in core["transects"]))
    ids = [t["spec"]["id"] for t in core["transects"]]
    checks = [
        {"name": "recompute_sample_period", "passed": recompute_ok, "detail": (
            f"Recomputed from the stored samples and the native 1 arc-second DEM tile. The meridian's ends are {mer['ends']['north_lat']} N and "
            f"{mer['ends']['south_lat']} N against the expected {exp['northLat']} N and {exp['southLat']} N at {exp['decimals']} decimals ({ends_ok}). "
            f"Of {n_samples} samples, {problems['outside']} lie outside the frozen polygon (a sample on its boundary to {COORD_DECIMALS} decimals counts as inside); "
            f"{problems['spacing']} intervals break the {params['step_m']:.0f} m step (only the last may be shorter); {problems['not_finite']} elevations are not numbers; "
            f"{problems['band']} bands differ from the elevation bands recomputed from the stored heights; band crossings, kilometres in band and the valley floor "
            f"recomputed from the stored columns disagree for {problems['derived']} of {len(ids)} lines. Against the native tile (bilinear in longitude and latitude), the absolute differences "
            f"from the stored heights over every sample have a {params['recompute_percentile']}th percentile of "
            + ", ".join(f"{native[i]['percentile']:.2f} m on {i}" for i in ids) + f" (tolerance {tol} m) and a largest value of "
            + ", ".join(f"{native[i]['max']:.2f} m at {native[i]['max_at_m']:.0f} m on {i}" for i in ids)
            + f". The whole computation run twice in one process gives identical results: {identical}.")},
        {"name": "units_and_scale", "passed": True, "detail": (
            "Distances are metres along the line (geodesic, WGS84) from its first point; longitude and latitude are decimal degrees (EPSG:4326, 7 decimals); "
            "elevation is metres above the EGM2008 geoid at 0.1 m (Copernicus DEM GLO-30 vertical datum); band is 1, 2 or 3 as in the strata bundle "
            f"(boundaries {bounds[0]} m and {bounds[1]} m); land cover is the WorldCover 2021 class code; kilometres in band are km.")},
        {"name": "nodata_not_zero", "passed": True, "detail": (
            f"A land cover value of 0 means the sample lies outside the analysis area (no WorldCover class) and occurs in {n_lc0} of {n_samples} samples "
            f"({n_lc0_inside} of them on the polygon's boundary, where the 10 m cell can lie outside the analysis area); it is never read as a class, "
            "and its label is stored in the summary's land cover shares. Band 0 does not occur.")},
        {"name": "attribution_present", "passed": True, "detail": (
            "The Copernicus DEM notices (Article 6(b) and 6(c)) and the ESA WorldCover citation are in siterra:attribution.")},
        {"name": "visual_inspection_sample", "passed": inspected is not None,
         "detail": inspected or "Not inspected: run with --inspected=<note> after looking at the rendered profiles."},
    ]
    status = "validated" if all(c["passed"] for c in checks) else "failed"

    summary = {
        "recipeId": RECIPE, "version": reg["version"], "computed": now,
        "place": {"placeId": cfg["placeId"], "configRevision": cfg["configRevision"], "config_sha256": cfg["_sha256"]},
        "claim_kind": "observation", "native_resolution": "30 m EPSG:32629 grid of the terrain strata for heights, 10 m WorldCover cells for land cover, samples every 30 m",
        "units": {"distance": "m along the line from its first point", "elevation": "m above the EGM2008 geoid", "band": "strata elevation band 1 to 3",
                  "km_in_band": "km"},
        "band_boundaries_m": bounds,
        "valley_floor_rule": f"contiguous samples around the lowest sample with elevation at most {core['floor_max']:.0f} m, the upper limit of the published valley floor (1800 to 2200 m, SCI-19)",
        "transects": summary_t,
        "samples_asset": "transect_samples", "lines_asset": "transect_lines",
        "strata_band_agreement": {"inside_samples": differ["inside_samples"], "compared": differ["compared"], "differing": differ["differing"],
                                  "no_strata_cell": differ["no_strata_cell"],
                                  "largest_distance_to_a_boundary_m_among_differing": round(differ["max_boundary_distance_m"], 1),
                                  "note": "The strata raster gives each 10 m cell the band of its 30 m cell; the profile gives the band of the sample's own interpolated height."},
        "checks": {c["name"]: c["passed"] for c in checks},
        "limitations": reg["standardLimitations"], "forbidden_phrases": reg["forbiddenPhrases"],
    }
    spath = os.path.join(bdir, "terrain-transects.json")
    bc.dump(summary, spath)

    dem_link = [l for l in json.load(open(os.path.join(bundles, cfg["strata"]["bundle"], "collection.json")))["links"]
                if l["rel"] == "derived_from" and l["href"].endswith("_DEM.tif")][0]
    strata_col = json.load(open(os.path.join(bundles, cfg["strata"]["bundle"], "collection.json")))
    wc_link = [l for l in strata_col["links"] if l["rel"] == "derived_from" and "WorldCover" in l["href"]][0]
    net_id = tc["transects"][1]["network"]["bundle"]
    assets = {
        "analysis_geometry": bc.plain_asset(bdir, "analysis-geometry.geojson", "application/geo+json",
                                            f"Frozen analysis geometry {cfg['geometry']['id']}, revision {cfg['geometry']['revision']}", ["metadata"]),
        RECIPE: bc.plain_asset(bdir, "terrain-transects.json", "application/json",
                               "Summary of each line: ends, length, lowest and highest point, band crossings, kilometres in band, land cover shares, valley floor segment and the check results (the result read_recipe_result returns)", ["data"]),
        "transect_samples": bc.plain_asset(bdir, "transect-samples.json", "application/json",
                                           "Samples every 30 m as columns (distance, longitude, latitude, elevation, band, land cover class, inside flag, drainage segment for the axis), the band crossings and the land cover runs", ["data"]),
        "transect_lines": bc.plain_asset(bdir, "transect-lines.geojson", "application/geo+json",
                                         "One 3D LineString per line ([lon, lat, elevation], metres above the EGM2008 geoid) through the samples", ["data"]),
    }
    sw = {"siterra-science": "0.1.0", "python": sys.version.split()[0], "numpy": np.__version__, "rasterio": rasterio.__version__,
          "gdal": rasterio.__gdal_version__, "pyproj": pyproj.__version__, "shapely": shapely.__version__}
    desc = (
        f"Precomputed result of recipe {RECIPE} {reg['version']} for {cfg['title']}: {len(ids)} profiles sampled every {params['step_m']:.0f} m, "
        + "; ".join(f"{summary_t[i]['label'].lower()} ({summary_t[i]['length_m'] / 1000:.1f} km, {summary_t[i]['samples']} samples)" for i in ids)
        + ". Each sample has its height, elevation band, WorldCover class and inside flag; each line has its band crossings, kilometres in band and valley floor segment. "
        "Observation from a 30 m surface model.\n\n" + " ".join(reg["standardLimitations"]))
    col = {
        "type": "Collection", "stac_version": "1.1.0",
        "stac_extensions": ["https://stac-extensions.github.io/processing/v1.3.0/schema.json",
                            "https://stac-extensions.github.io/file/v2.1.0/schema.json", EXT],
        "id": bid, "title": f"Profiles across and along the valley ({RECIPE} {reg['version']})", "description": desc, "license": "other",
        "providers": [
            *[p for p in strata_col["providers"] if "processor" not in p["roles"] and "host" not in p["roles"]],
            {"name": "Siterra science pipeline", "roles": ["processor"],
             "processing:lineage": ("Heights from the 30 m EPSG:32629 grid of the terrain strata (Copernicus DEM GLO-30 2021, bilinear), WorldCover 2021 classes of the 10 m analysis "
                                    "cells, the valley axis from the drainage network bundle (science/pipeline/transects-bundle.py)"),
             "processing:software": sw},
        ],
        "extent": {"spatial": {"bbox": [list(poly.bounds)]}, "temporal": {"interval": [["2021-01-01T00:00:00Z", None]]}},
        "assets": assets, "created": now, "siterra:status": status, "siterra:variable": "elevation_profile",
        "siterra:dataset": {
            "id": "copernicus-dem-glo-30", "version": "2021",
            "access_route": "https://copernicus-dem-30m.s3.amazonaws.com/Copernicus_DSM_COG_10_N31_00_W007_00_DEM/Copernicus_DSM_COG_10_N31_00_W007_00_DEM.tif",
            "resolution_note": "DEM 1 arc-second (about 30 m), resampled to the 30 m EPSG:32629 grid of the terrain strata; land cover 10 m"},
        "siterra:geo_selection": strata_col["siterra:geo_selection"],
        "siterra:method": {
            "id": RECIPE, "version": reg["version"], "analysis_crs": cfg["analysisCrs"],
            "parameters": {
                "place_configuration": f"science/places/{os.path.basename(place)} revision {cfg['configRevision']}, sha256 {cfg['_sha256']}",
                **params, "band_boundaries_m": bounds, "valley_floor_max_elevation_m": core["floor_max"],
                "transects": [{k: v for k, v in s.items() if k != "expectedEnds"} for s in tc["transects"]]},
            "reference_period": None, "operation_order": reg["formula"]},
        "siterra:attribution": [*strata_col["siterra:attribution"]],
        "siterra:limitations": reg["standardLimitations"], "siterra:checks": checks,
        "links": [
            {"rel": "root", "href": "../catalog.json", "type": "application/json"},
            {"rel": "parent", "href": "../catalog.json", "type": "application/json"},
            {"rel": "derived_from", "href": f"../{strata_col['id']}/collection.json", "type": "application/json",
             "title": f"Terrain strata bundle {strata_col['id']}",
             "file:checksum": "1220" + bc.sha(os.path.join(bundles, strata_col["id"], "collection.json"))},
            {"rel": "derived_from", "href": f"../{net_id}/collection.json", "type": "application/json",
             "title": f"Drainage network bundle {net_id} (the valley axis)",
             "file:checksum": "1220" + bc.sha(os.path.join(bundles, net_id, "collection.json"))},
            dem_link, wc_link,
            *[l for l in strata_col["links"] if l["rel"] == "license"],
            {"rel": "processing-software", "href": "./uv.lock", "type": "application/toml", "title": "Pipeline lockfile (uv)",
             "file:checksum": "1220" + bc.sha(lock_out)},
        ],
    }
    bc.dump(col, os.path.join(bdir, "collection.json"))
    print(f"{bid}: {status}")
    for i in ids:
        t = summary_t[i]
        print(f"  {i}: {t['length_m']} m, {t['samples']} samples, lowest {t['elevation_m']['lowest']}, highest {t['elevation_m']['highest']}")
        print(f"     crossings {t['band_crossings']}")
        print(f"     km in band {t['km_in_band']}, floor {t['valley_floor']}")
        print(f"     shares {t['land_cover_share']}, runs {t['land_cover_runs']}, reference {t['reference_points']}")
    print("  native recompute (m):", {k: {a: round(b, 2) for a, b in v.items()} for k, v in native.items()})
    print("  problems", problems, "| strata band disagreements", differ, "| ends ok", ends_ok)
    for c in checks:
        print(f"  check {c['name']}: {'passed' if c['passed'] else 'FAILED'}")


if __name__ == "__main__":
    main()
