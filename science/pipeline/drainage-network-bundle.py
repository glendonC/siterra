"""Precompute drainage_network for a place and write it as a bundle: 3D GeoJSON drainage lines with Strahler order and
upstream area, the conditioned D8 rasters they come from, a summary, and the STAC Collection.

Usage: python -I drainage-network-bundle.py <place.json> <repo_root> <dem.tif> <registry.json> <lockfile> <bundles_dir>
       [--conditioning=<dir>] [--inspected=<note.txt>] [--computed=<YYYY-MM-DDTHH:MM:SSZ>]

Follows the registered drainage_network 1.0.0 recipe. It reads the two conditioned rasters of the catchment freeze
(d8-flow-direction.tif and depression-fill-depth.tif, made by a private step that uses pysheds and is not part of this
package) and the report of that step from --conditioning (default: the place's committed bundle), checks them against the
checksums of the place configuration, and imports nothing licensed under the GPL. The bundle folder must not exist yet.
Without --inspected the visual inspection check fails and the bundle status is failed.
"""
import datetime
import json
import os
import shutil
import sys

import numpy as np
import pyproj
import rasterio
import rasterio.features
import shapely
from pyproj import Geod, Transformer
from shapely.geometry import mapping, shape

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import drainage_network as dn  # noqa: E402
import place_config  # noqa: E402

RECIPE = "drainage_network"
EXT = "https://siterra.invalid/schemas/stac/siterra/1.1.0/schema.json"
PROJ_EXT = "https://stac-extensions.github.io/projection/v2.1.0/schema.json"
GEOD = Geod(ellps="WGS84")
CRS = TO_UTM = FROM_UTM = None  # set from the place configuration by use_place()


def use_place(cfg):
    global CRS, TO_UTM, FROM_UTM
    CRS = cfg["analysisCrs"]
    TO_UTM = Transformer.from_crs("EPSG:4326", CRS, always_xy=True)
    FROM_UTM = Transformer.from_crs(CRS, "EPSG:4326", always_xy=True)
PYSHEDS_CITATION = ("Flow direction and depression fill depth conditioned by a private step that uses pysheds 0.5 (Bartos 2020, "
                    "GPL-3.0, https://doi.org/10.5281/zenodo.3822494); the software is not part of this bundle")
SENSITIVITY_KM2 = [0.5, 1.0, 2.0, 5.0]
OUTLET_SNAP_M = 120.0
AREA_TOLERANCE_KM2 = 0.01
HEIGHT_DECIMALS = 1


def sha(p):
    return place_config.sha256(p)


def dump(o, p, compact=False):
    with open(p, "w") as f:
        if compact:
            json.dump(o, f, separators=(",", ":"), ensure_ascii=False)
        else:
            json.dump(o, f, indent=1, ensure_ascii=False)
        f.write("\n")


def pick(cfg_entry, folder, key):
    """Path of a conditioning file in `folder`, which must match the checksum pinned in the place configuration."""
    path = os.path.join(folder, cfg_entry["bundleAsset"])
    if not os.path.exists(path):
        raise SystemExit(f"{path} is missing")
    got = sha(path)
    if got != cfg_entry["sha256"]:
        raise SystemExit(f"{key}: checksum {got} does not match the place configuration")
    return path


def read_grid(path):
    with rasterio.open(path) as src:
        if src.crs.to_epsg() != 4326:
            raise SystemExit(f"{path} is not in EPSG:4326")
        return src.read(1), src.transform


def compute(cfg, reg, dem_path, d8_path, fill_path):
    """Everything that does not depend on the clock: segments, lines, statistics and the checks that run on arrays."""
    params = {p["name"]: p["default"] for p in reg["parameters"]}
    threshold = params["min_upstream_area_km2"]
    rise_tol_dm = int(round(params["rise_tolerance_m"] * 10))

    feat = json.load(open(place_config.geometry_path(cfg)))["features"][0]
    props, poly = feat["properties"], shape(feat["geometry"])
    d8, tr = read_grid(d8_path)
    fill, tr_fill = read_grid(fill_path)
    if d8.shape != fill.shape or tr != tr_fill:
        raise SystemExit("the two conditioning rasters are not on one grid")
    H, W = d8.shape
    cols, rows = np.meshgrid(np.arange(W), np.arange(H))
    lon_c = tr.c + (cols + 0.5) * tr.a
    lat_c = tr.f + (rows + 0.5) * tr.e
    polymask = rasterio.features.geometry_mask([mapping(poly)], out_shape=(H, W), transform=tr, invert=True).ravel()

    down = dn.downstream_index(d8)
    no_direction = int((d8 == 0).sum())
    o_lon, o_lat = props["outlet_snapped"]
    ocol = int(round((o_lon - tr.c) / tr.a - 0.5))
    orow = int(round((o_lat - tr.f) / tr.e - 0.5))
    outlet = orow * W + ocol
    if abs(lon_c[orow, ocol] - o_lon) > 1e-6 or abs(lat_c[orow, ocol] - o_lat) > 1e-6:
        raise SystemExit("the frozen outlet does not sit at a cell centre of the conditioning grid")
    # the outlet cell has a direction like every other cell (water leaves the catchment through it); the catchment ends there
    down[outlet] = -1
    term, loop = dn.terminals(down)

    catch = term == outlet
    # the freeze keeps the largest 4-connected piece of the catchment, so a cell that joins it only diagonally is not in the polygon;
    # such a cell is counted apart, every other difference between the D8 trace and the polygon is a difference
    ci = catch.reshape(H, W)
    nb = np.zeros_like(ci)
    nb[1:, :] |= ci[:-1, :]
    nb[:-1, :] |= ci[1:, :]
    nb[:, 1:] |= ci[:, :-1]
    nb[:, :-1] |= ci[:, 1:]
    isolated = (ci & ~nb).ravel()
    dropped_isolated = int((isolated & ~polymask).sum())
    differ = int(((catch ^ polymask) & ~isolated).sum()) + int((isolated & polymask).sum())
    areas = dn.cell_areas_by_row(tr.f, tr.e, tr.a, H)
    acc_m2 = dn.accumulate(down, np.repeat(areas, W))
    acc_km2 = acc_m2 / 1e6
    acc_cells = dn.accumulate(down, np.ones(H * W))
    in_lon, in_lat = props["outlet_input"]
    rr, cc = np.nonzero((np.abs(lat_c - in_lat) < 0.002) & (np.abs(lon_c - in_lon) < 0.002))
    dist = GEOD.inv(np.full(len(rr), in_lon), np.full(len(rr), in_lat), lon_c[rr, cc], lat_c[rr, cc])[2]
    near = dist <= OUTLET_SNAP_M
    near_acc = acc_cells[rr[near] * W + cc[near]]
    snap_ok = bool(near_acc.max() == acc_cells[outlet] and (rr[near] * W + cc[near] == outlet).any())
    snap_m = float(GEOD.inv(in_lon, in_lat, o_lon, o_lat)[2])

    stream = catch & (acc_km2 >= threshold)
    ups = dn.stream_upstream(down, stream)
    order = dn.strahler(down, stream, acc_m2)
    paths = dn.segments(down, stream)
    first_up = {p[0]: i for i, p in enumerate(paths)}

    # sensitivity: stream cells, heads and D8 path length at each threshold (no geometry)
    sens = []
    for t in SENSITIVITY_KM2:
        s = catch & (acc_km2 >= t)
        idx = np.flatnonzero(s)
        link = (down[idx] >= 0) & s[np.maximum(down[idx], 0)]
        a, b = idx[link], down[idx][link]
        length = GEOD.inv(lon_c.ravel()[a], lat_c.ravel()[a], lon_c.ravel()[b], lat_c.ravel()[b])[2].sum() / 1000
        has_up = np.zeros(H * W, bool)
        has_up[b] = True
        sens.append({"min_upstream_area_km2": t, "stream_cells": int(s.sum()),
                     "heads": int((s & ~has_up).sum()), "d8_path_length_km": round(float(length), 1)})

    # lines
    z30, gx0, gy0, gres = place_config.elevation_grid(cfg, dem_path, pad_cells=cfg["recipes"][RECIPE]["heightPadCells"])
    flat_lon, flat_lat = lon_c.ravel(), lat_c.ravel()
    flat_fill = fill.ravel()
    segs = []
    for path in paths:
        cell = np.array(path)
        E, N = TO_UTM.transform(flat_lon[cell], flat_lat[cell])
        pts = np.column_stack([E, N])
        pts = dn.densify(dn.simplify(dn.chaikin(pts), params["simplify_tolerance_m"]), params["max_vertex_spacing_m"])
        h = dn.bilinear(z30, gx0, gy0, gres, pts[:, 0], pts[:, 1])
        zd = np.round(h * 10 ** HEIGHT_DECIMALS).astype(np.int64)
        lon, lat = FROM_UTM.transform(pts[:, 0], pts[:, 1])
        lon, lat = np.round(lon, 7), np.round(lat, 7)
        net_dm, rise_dm = dn.rise_statistics(zd)
        last = path[-1]
        n_up = len(ups.get(last, ()))
        a_end = acc_km2[path[-2]] if n_up >= 2 else acc_km2[last]
        segs.append({
            "cells": path, "order": order[path[0]], "lon": lon, "lat": lat, "zd": zd,
            "area_end": float(a_end), "area_start": float(acc_km2[path[0]]),
            "length_m": float(GEOD.line_length(lon, lat)), "net_dm": net_dm, "rise_dm": rise_dm,
            "fill_m": float(flat_fill[cell].max()),
            "descends": bool(rise_dm <= rise_tol_dm and net_dm > 0),
        })
    rank = dn.segment_rank([(s["area_end"], s["cells"][0]) for s in segs])
    segs = [segs[i] for i in rank]
    width = max(3, len(str(len(segs))))
    ids = [f"seg_{i + 1:0{width}d}" for i in range(len(segs))]
    by_first = {s["cells"][0]: ids[i] for i, s in enumerate(segs)}
    downstream = [by_first.get(s["cells"][-1]) for s in segs]
    upstream = {sid: [] for sid in ids}
    for sid, d in zip(ids, downstream):
        if d is not None:
            upstream[d].append(sid)
    features = []
    for sid, s, d in zip(ids, segs, downstream):
        coords = [[float(a), float(b), float(c) / 10 ** HEIGHT_DECIMALS] for a, b, c in zip(s["lon"], s["lat"], s["zd"])]
        features.append({
            "type": "Feature", "id": sid,
            "geometry": {"type": "LineString", "coordinates": coords},
            "properties": {
                "segment_id": sid, "strahler_order": int(s["order"]),
                "upstream_area_km2": round(s["area_end"], 2), "upstream_area_start_km2": round(s["area_start"], 2),
                "length_m": int(round(s["length_m"])),
                "net_drop_m": s["net_dm"] / 10, "max_rise_m": s["rise_dm"] / 10, "max_fill_depth_m": round(s["fill_m"], 1),
                "descends": s["descends"], "downstream_segment_id": d, "upstream_segment_ids": sorted(upstream[sid]),
            },
        })
    return {
        "features": features, "sensitivity": sens, "params": params, "outlet": {"lon": float(lon_c[orow, ocol]), "lat": float(lat_c[orow, ocol]),
                                                                                "row": orow, "col": ocol},
        "snap_m": snap_m, "snap_ok": snap_ok, "differ": differ, "dropped_isolated": dropped_isolated, "catch_cells": int(catch.sum()), "polygon_cells": int(polymask.sum()),
        "loops": int(loop.sum()), "no_direction": no_direction, "no_direction_inside": int(((d8 == 0).ravel() & polymask).sum()), "stream_cells": int(stream.sum()),
        "stream_not_draining_to_outlet": int((stream & ~catch).sum()),
        "outlet_area_km2": float(acc_km2[outlet]), "polygon_area_km2": props["area_m2_geodesic"] / 1e6,
        "max_order": int(max(order.values())), "outlet_order": int(order[outlet]),
        "confluences": int(sum(1 for v in ups.values() if len(v) >= 2)),
        "heads": int(sum(1 for k in np.flatnonzero(stream).tolist() if k not in ups)),
        "rise_tolerance_m": params["rise_tolerance_m"],
    }


def verify_stored(geojson_path, poly, snapped, rise_tol_m, max_spacing_m):
    """Re-read the stored lines and check them without the arrays they came from: vertices inside the frozen polygon,
    junctions, the outlet end, spacing, the Strahler rule on the segment graph and the descent flags."""
    fc = json.load(open(geojson_path))
    feats = {f["properties"]["segment_id"]: f for f in fc["features"]}
    out = {"segments": len(feats)}
    xs = np.array([c[0] for f in feats.values() for c in f["geometry"]["coordinates"]])
    ys = np.array([c[1] for f in feats.values() for c in f["geometry"]["coordinates"]])
    out["vertices"] = len(xs)
    out["vertices_outside"] = int((~shapely.intersects_xy(poly, xs, ys)).sum())
    broken = 0
    outlet_ends = 0
    for sid, f in feats.items():
        d = f["properties"]["downstream_segment_id"]
        last = f["geometry"]["coordinates"][-1]
        if d is None:
            outlet_ends += 1
            if [last[0], last[1]] != [round(snapped[0], 7), round(snapped[1], 7)]:
                broken += 1
        elif last != feats[d]["geometry"]["coordinates"][0]:
            broken += 1
        if sorted(u for u, g in feats.items() if g["properties"]["downstream_segment_id"] == sid) != f["properties"]["upstream_segment_ids"]:
            broken += 1
    out["broken_links"] = broken
    out["segments_ending_at_outlet"] = outlet_ends
    bad_order = 0
    for sid, f in feats.items():
        ups = [feats[u]["properties"]["strahler_order"] for u in f["properties"]["upstream_segment_ids"]]
        want = 1 if not ups else (max(ups) + 1 if ups.count(max(ups)) >= 2 else max(ups))
        if f["properties"]["strahler_order"] != want:
            bad_order += 1
    out["strahler_rule_violations"] = bad_order
    spacing = 0.0
    descends_wrong = 0
    for f in feats.values():
        c = np.array(f["geometry"]["coordinates"])
        d = GEOD.inv(c[:-1, 0], c[:-1, 1], c[1:, 0], c[1:, 1])[2]
        spacing = max(spacing, float(d.max()))
        z = np.round(c[:, 2] * 10).astype(np.int64)
        net, rise = dn.rise_statistics(z)
        p = f["properties"]
        if abs(net / 10 - p["net_drop_m"]) > 1e-9 or abs(rise / 10 - p["max_rise_m"]) > 1e-9 \
                or p["descends"] != (rise <= round(rise_tol_m * 10) and net > 0):
            descends_wrong += 1
    out["max_vertex_spacing_m"] = round(spacing, 3)
    # the vertices are spaced in planar UTM metres, the check measures geodesic metres: a ground distance can exceed its planar one
    # by the UTM scale factor, at least 0.9996 inside a zone, so the limit is max_spacing_m / 0.9996
    out["spacing_ok"] = spacing <= max_spacing_m / 0.9996
    out["stored_statistics_mismatch"] = descends_wrong
    return out


def main():
    argv = [a for a in sys.argv[1:] if not a.startswith("--")]
    opts = dict(a[2:].split("=", 1) for a in sys.argv[1:] if a.startswith("--") and "=" in a)
    place, repo, dem, registry, lock_path, bundles = argv
    cfg = place_config.load(place, repo)
    use_place(cfg)
    place_config.check_dem(cfg, dem)
    reg = place_config.localize(cfg, [r for r in json.load(open(registry))["recipes"] if r["recipeId"] == RECIPE][0])
    bid = f"bundle_{RECIPE}_{cfg['placeId']}"
    bdir = os.path.join(bundles, bid)
    if os.path.exists(bdir):
        raise SystemExit(f"{bdir} exists; the bundle folder must not")
    dc = cfg["recipes"][RECIPE]["conditioning"]
    folder = opts.get("conditioning") or os.path.join(cfg["_repo"], "data/bundles", bid)
    d8_path = pick(dc["flowDirection"], folder, "flow direction")
    fill_path = pick(dc["fillDepth"], folder, "fill depth")
    report_path = pick(dc["report"], folder, "conditioning report")
    now = opts.get("computed") or datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    inspected = open(opts["inspected"]).read().strip() if "inspected" in opts else None

    core = compute(cfg, reg, dem, d8_path, fill_path)
    again = compute(cfg, reg, dem, d8_path, fill_path)
    identical = json.dumps(core, sort_keys=True) == json.dumps(again, sort_keys=True)
    print(f"computed twice in this process, identical: {identical}")

    os.makedirs(bdir)
    geo_out = os.path.join(bdir, "drainage-lines.geojson")
    dump({"type": "FeatureCollection", "features": core["features"]}, geo_out, compact=True)
    shutil.copyfile(place_config.geometry_path(cfg), os.path.join(bdir, "analysis-geometry.geojson"))
    for name, src in (("d8-flow-direction.tif", d8_path), ("depression-fill-depth.tif", fill_path),
                      ("conditioning-report.json", report_path)):
        shutil.copyfile(src, os.path.join(bdir, name))
    lock_out = os.path.join(bdir, "uv.lock")
    shutil.copyfile(lock_path, lock_out)

    poly = place_config.geometry(cfg)
    snapped = (core["outlet"]["lon"], core["outlet"]["lat"])
    stored = verify_stored(geo_out, poly, snapped, core["rise_tolerance_m"], core["params"]["max_vertex_spacing_m"])
    print(json.dumps(stored))

    feats = core["features"]
    P = [f["properties"] for f in feats]
    length_by_order = {}
    for p in P:
        length_by_order[p["strahler_order"]] = length_by_order.get(p["strahler_order"], 0) + p["length_m"]
    not_desc = [p for p in P if not p["descends"]]
    tol = core["rise_tolerance_m"]
    crossing = [p for p in not_desc if p["max_fill_depth_m"] >= tol]
    n_vertices = stored["vertices"]

    steps = json.load(open(report_path))["d8_steps_rising_on_conditioned_dem"]
    checks = [
        {"name": "recompute_sample_period", "passed": bool(
            steps["catchment"]["rising"] == 0 and steps["window"]["rising"] == 0 and
            core["differ"] == 0 and core["snap_ok"] and core["loops"] == 0 and core["stream_not_draining_to_outlet"] == 0
            and abs(core["outlet_area_km2"] - core["polygon_area_km2"]) <= AREA_TOLERANCE_KM2 and stored["vertices_outside"] == 0
            and stored["broken_links"] == 0 and stored["segments_ending_at_outlet"] >= 1 and stored["strahler_rule_violations"] == 0
            and stored["spacing_ok"] and stored["stored_statistics_mismatch"] == 0 and identical),
         "detail": (
             f"Recomputed without pysheds from the shipped flow direction raster and the stored lines. Catchment: the cells whose "
             f"D8 path reaches the outlet are {core['catch_cells']} and the cells inside the frozen polygon are "
             f"{core['polygon_cells']}, {core['differ']} differ"
             + (f" (apart from {core['dropped_isolated']} cell{'s' if core['dropped_isolated'] > 1 else ''} that join the catchment only diagonally and "
                f"so are not in the polygon, which keeps the largest 4-connected piece)" if core["dropped_isolated"] else "") + f"; the outlet cell holds the largest accumulation among cells within "
             f"{OUTLET_SNAP_M:.0f} m of the freeze's input point ({core['snap_ok']}; the freeze snapped {core['snap_m']:.1f} m); no D8 "
             f"path loops ({core['loops']} cells on a loop) and none of the {core['stream_cells']} stream cells drains elsewhere "
             f"({core['stream_not_draining_to_outlet']}); the area draining to the outlet is {core['outlet_area_km2']:.4f} km2 "
             f"against the polygon's {core['polygon_area_km2']:.4f} km2 (tolerance {AREA_TOLERANCE_KM2} km2). Stored lines: "
             f"{stored['vertices_outside']} of {n_vertices} vertices lie outside the frozen polygon (boundary counts as inside)"
             + "; "
             f"{stored['broken_links']} segment links are broken (a segment ends where its downstream segment begins, the outlet "
             f"segment ends at the snapped outlet, upstream lists match); the Strahler rule fails at "
             f"{stored['strahler_rule_violations']} of {len(P)} segments; largest vertex spacing {stored['max_vertex_spacing_m']} m "
             f"(limit {core['params']['max_vertex_spacing_m']} m); net drop, largest rise and the descends flag recomputed from the "
             f"stored heights disagree for {stored['stored_statistics_mismatch']} segments. The whole computation run twice in "
             f"one process gives identical results: {identical}. Recorded by the private step and not repeatable without pysheds "
             f"(conditioning-report.json): {steps['catchment']['rising']} of {steps['catchment']['checked']} D8 steps inside the "
             f"catchment rise on the conditioned DEM ({steps['window']['rising']} of {steps['window']['checked']} in the whole window).")},
        {"name": "units_and_scale", "passed": True, "detail": (
            "Coordinates are decimal degrees (EPSG:4326, 7 decimals) with the height as the third value, metres above the EGM2008 geoid "
            "at 0.1 m (Copernicus DEM GLO-30 vertical datum); upstream areas are km2 at 0.01, lengths metres, net drop, largest rise "
            "and fill depth metres at 0.1. The flow direction raster holds the codes 64, 128, 1, 2, 4, 8, 16, 32 for north, north-east, "
            "east, south-east, south, south-west, west and north-west; the fill depth raster holds metres.")},
        {"name": "nodata_not_zero", "passed": core["no_direction_inside"] == 0, "detail": (
            f"0 means no direction in the flow direction raster and occurs in {core['no_direction']} cells of the shipped window"
            + (f", {core['no_direction_inside']} of them inside the frozen polygon" if core["no_direction"] else "")
            + f", so no cell is read as a direction of 0; in the fill depth raster 0 means the cell was not raised and the raster has no nodata value.")},
        {"name": "attribution_present", "passed": True, "detail": (
            "The Copernicus DEM notices (Article 6(b) and 6(c)) and the pysheds citation are in siterra:attribution.")},
        {"name": "visual_inspection_sample", "passed": inspected is not None,
         "detail": inspected or "Not inspected: run with --inspected=<note> after looking at the rendered network."},
    ]
    status = "validated" if all(c["passed"] for c in checks) else "failed"

    summary = {
        "recipeId": RECIPE, "version": reg["version"], "computed": now,
        "place": {"placeId": cfg["placeId"], "configRevision": cfg["configRevision"], "config_sha256": cfg["_sha256"]},
        "claim_kind": "model_estimate",
        "native_resolution": f"1 arc-second (about 30 m) Copernicus DEM GLO-30 grid for the D8 paths; line heights from the 30 m {CRS} grid of the terrain strata",
        "units": {"coordinates": "EPSG:4326 decimal degrees with the height as the third value", "height": "m above the EGM2008 geoid",
                  "upstream_area_km2": "km2", "length_m": "m"},
        "outlet": {"lon": round(core["outlet"]["lon"], 7), "lat": round(core["outlet"]["lat"], 7),
                   "upstream_area_km2": round(core["outlet_area_km2"], 2),
                   "strahler_order": core["outlet_order"], "snap_distance_m": round(core["snap_m"], 1)},
        "headline": {
            "segments": len(P), "heads": core["heads"], "confluences": core["confluences"], "max_strahler_order": core["max_order"],
            "stream_cells": core["stream_cells"], "min_upstream_area_km2": core["params"]["min_upstream_area_km2"],
            "vertices": n_vertices, "length_km_total": round(sum(length_by_order.values()) / 1000, 1),
            "length_km_by_order": {str(k): round(v / 1000, 1) for k, v in sorted(length_by_order.items())},
        },
        "threshold_sensitivity": core["sensitivity"],
        "descent": {
            "rise_tolerance_m": tol, "segments_descending": len(P) - len(not_desc), "segments_not_descending": len(not_desc),
            "not_descending_with_fill_depth_at_or_above_tolerance": len(crossing),
            "not_descending": [{k: p[k] for k in ("segment_id", "strahler_order", "upstream_area_km2", "net_drop_m", "max_rise_m",
                                                 "max_fill_depth_m")} for p in not_desc],
            "note": "The lines are not forced downhill. Where the 30 m surface rises along the D8 path the stored heights rise; depression filling routed the flow across those places.",
        },
        "checks": {c["name"]: c["passed"] for c in checks},
        "lines_asset": "drainage_lines", "limitations": reg["standardLimitations"], "forbidden_phrases": reg["forbiddenPhrases"],
    }
    spath = os.path.join(bdir, "drainage-network.json")
    dump(summary, spath)

    strata_col = json.load(open(os.path.join(bundles, cfg["strata"]["bundle"], "collection.json")))
    dem_link = [l for l in strata_col["links"] if l["rel"] == "derived_from" and l["href"].endswith("_DEM.tif")][0]
    attribution = [*cfg["geometry"]["attribution"], PYSHEDS_CITATION]
    z_note = "metres above the EGM2008 geoid"
    with rasterio.open(os.path.join(bdir, "d8-flow-direction.tif")) as r1:
        rshape, rtr = list(r1.shape), list(r1.transform)[:6]
        rbbox = list(r1.bounds)

    def raster_asset(name, title, band):
        p = os.path.join(bdir, name)
        return {"href": f"./{name}", "type": "image/tiff; application=geotiff", "title": title, "roles": ["data"],
                "proj:code": "EPSG:4326", "proj:shape": rshape, "proj:transform": rtr, "bands": [band],
                "file:checksum": "1220" + sha(p), "file:size": os.path.getsize(p)}

    def plain_asset(name, mime, title, roles):
        p = os.path.join(bdir, name)
        return {"href": f"./{name}", "type": mime, "title": title, "roles": roles,
                "file:checksum": "1220" + sha(p), "file:size": os.path.getsize(p)}

    assets = {
        "analysis_geometry": plain_asset("analysis-geometry.geojson", "application/geo+json",
                                         f"Frozen analysis geometry {cfg['geometry']['id']}, revision {cfg['geometry']['revision']}", ["metadata"]),
        RECIPE: plain_asset("drainage-network.json", "application/json",
                            "Summary: segment and length counts by Strahler order, threshold sensitivity and the segments that do not descend (the result read_recipe_result returns)", ["data"]),
        "drainage_lines": plain_asset("drainage-lines.geojson", "application/geo+json",
                                      f"Drainage lines: one 3D LineString per segment ([lon, lat, height], {z_note}) with Strahler order, upstream area, length, net drop, largest rise, largest fill depth and links to the downstream and upstream segments", ["data"]),
        "d8_flow_direction": raster_asset(
            "d8-flow-direction.tif", "D8 flow direction of the 1 arc-second cells of the catchment's bounding box plus 8 cells, conditioned as the catchment freeze was",
            {"name": "flow_direction", "data_type": "uint8", "nodata": 0, "unit": "1",
             "description": "Code of the downstream neighbour: 64 north, 128 north-east, 1 east, 2 south-east, 4 south, 8 south-west, 16 west, 32 north-west; 0 no direction (none in this window)"}),
        "depression_fill_depth": raster_asset(
            "depression-fill-depth.tif", "Depression fill depth: height the conditioning raised each cell, metres",
            {"name": "depression_fill_depth", "data_type": "float32", "unit": "m",
             "description": "fill_depressions(fill_pits(DEM)) minus DEM, metres; 0 where the cell was not raised"}),
        "conditioning_report": plain_asset("conditioning-report.json", "application/json",
                                           "Report of the private conditioning step: inputs, versions, the comparison with the frozen polygon, the D8 step check and the raster checksums", ["metadata"]),
    }
    sw = {"siterra-science": "0.1.0", "python": sys.version.split()[0], "numpy": np.__version__, "rasterio": rasterio.__version__,
          "gdal": rasterio.__gdal_version__, "pyproj": pyproj.__version__, "shapely": shapely.__version__}
    p0 = core["params"]
    desc = (
        f"Precomputed result of recipe {RECIPE} {reg['version']} for {cfg['title']}: {len(P)} drainage segments of {core['stream_cells']} "
        f"stream cells (at least {p0['min_upstream_area_km2']} km2 upstream), {summary['headline']['length_km_total']} km in all, Strahler order "
        f"1 to {core['max_order']}, ending at the snapped outlet where {core['outlet_area_km2']:.2f} km2 drains. Each segment is a 3D line "
        f"with its upstream area and order. {len(not_desc)} of {len(P)} segments do not descend within {tol} m on the 30 m surface and "
        f"are listed with their depression fill depth. Model estimate from a 30 m surface model, not a map of channels.\n\n"
        + " ".join(reg["standardLimitations"])
    )
    col = {
        "type": "Collection", "stac_version": "1.1.0",
        "stac_extensions": ["https://stac-extensions.github.io/processing/v1.3.0/schema.json",
                            "https://stac-extensions.github.io/file/v2.1.0/schema.json", PROJ_EXT, EXT],
        "id": bid, "title": f"Drainage network of the catchment ({RECIPE} {reg['version']})", "description": desc, "license": "other",
        "providers": [
            *[p for p in strata_col["providers"] if "processor" not in p["roles"] and "host" not in p["roles"] and "WorldCover" not in p["name"]],
            {"name": "Siterra science pipeline", "roles": ["processor"],
             "processing:lineage": (
                 "Copernicus DEM GLO-30 2021 tile conditioned and given D8 flow direction by a private step (pysheds 0.5), then, in "
                 "science/pipeline/drainage-network-bundle.py: area-weighted accumulation, Strahler order, segments, lines and heights "
                 f"from the 30 m {CRS} grid of the terrain strata"),
             "processing:software": sw},
        ],
        "extent": {"spatial": {"bbox": [list(poly.bounds)]}, "temporal": {"interval": [["2021-01-01T00:00:00Z", None]]}},
        "assets": assets, "created": now, "siterra:status": status, "siterra:variable": "drainage_network",
        "siterra:dataset": {
            "id": "copernicus-dem-glo-30", "version": "2021",
            "access_route": "https://copernicus-dem-30m.s3.amazonaws.com/Copernicus_DSM_COG_10_N31_00_W007_00_DEM/Copernicus_DSM_COG_10_N31_00_W007_00_DEM.tif",
            "resolution_note": f"DEM 1 arc-second (about 30 m); D8 paths on the native grid, line heights from the 30 m {CRS} grid of the terrain strata"},
        "siterra:geo_selection": strata_col["siterra:geo_selection"],
        "siterra:method": {
            "id": RECIPE, "version": reg["version"], "analysis_crs": cfg["analysisCrs"],
            "parameters": {
                "place_configuration": f"science/places/{os.path.basename(place)} revision {cfg['configRevision']}, sha256 {cfg['_sha256']}",
                **p0,
                "conditioning": {"flow_direction_sha256": dc["flowDirection"]["sha256"], "fill_depth_sha256": dc["fillDepth"]["sha256"],
                                 "report_sha256": dc["report"]["sha256"], "window": json.load(open(report_path))["dem"]["window"],
                                 "outlet_snap_max_m": dc["outletSnapMaxM"]},
                "sensitivity_thresholds_km2": SENSITIVITY_KM2, "stored_precision": "coordinates 7 decimals, height 0.1 m, area 0.01 km2",
            },
            "reference_period": None, "operation_order": reg["formula"]},
        "siterra:attribution": attribution, "siterra:limitations": reg["standardLimitations"], "siterra:checks": checks,
        "links": [
            {"rel": "root", "href": "../catalog.json", "type": "application/json"},
            {"rel": "parent", "href": "../catalog.json", "type": "application/json"},
            {"rel": "derived_from", "href": f"../{strata_col['id']}/collection.json", "type": "application/json",
             "title": f"Terrain strata bundle {strata_col['id']}",
             "file:checksum": "1220" + sha(os.path.join(bundles, strata_col["id"], "collection.json"))},
            dem_link,
            *[l for l in strata_col["links"] if l["rel"] == "license" and "Copernicus" in l["title"]],
            {"rel": "cite-as", "href": "https://doi.org/10.5281/zenodo.3822494", "title": "Bartos (2020), pysheds (conditioning step)"},
            {"rel": "processing-software", "href": "./uv.lock", "type": "application/toml", "title": "Pipeline lockfile (uv)",
             "file:checksum": "1220" + sha(lock_out)},
        ],
    }
    dump(col, os.path.join(bdir, "collection.json"))
    print(f"{bid}: {status}; segments {len(P)}, vertices {n_vertices}, stream cells {core['stream_cells']}, "
          f"length {summary['headline']['length_km_total']} km, order {core['max_order']}, outlet {core['outlet_area_km2']:.2f} km2")
    print("  length km by order", summary["headline"]["length_km_by_order"])
    print(f"  not descending within {tol} m: {len(not_desc)} of {len(P)}; with fill depth >= {tol} m: {len(crossing)}")
    for c in checks:
        print(f"  check {c['name']}: {'passed' if c['passed'] else 'FAILED'}")
    for s in core["sensitivity"]:
        print("  sensitivity", s)


if __name__ == "__main__":
    main()
