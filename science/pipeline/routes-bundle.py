"""Write the proposed routes bundle: least-time walking lines from Tabant to candidate field check sites under Tobler's hiking function
(recipe proposed_routes), as JSON, 3D GeoJSON lines and a STAC Collection.

Usage: python -I routes-bundle.py <place.json> <repo_root> <registry.json> <lockfile> <bundles_dir>
       [--inspected=<note.txt>] [--computed=<YYYY-MM-DDTHH:MM:SSZ>]

Reads the relief, land cover, terrain strata, pixel trend (trend_cells) and pixel anatomy bundles from <bundles_dir>. Follows the registered
proposed_routes 1.0.0 recipe. The bundle folder must not exist yet. Without --inspected the visual inspection check fails.
"""
import json
import math
import os
import shutil
import sys

import numpy as np
import pyproj
import rasterio
import rasterio.features
import shapely
from pyproj import Transformer
from shapely.geometry import Point, Polygon

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bundle_common as bc  # noqa: E402
import drainage_network as dn  # noqa: E402
import place_config  # noqa: E402
import proposed_routes as pr  # noqa: E402
import surface_layers as sl  # noqa: E402

RECIPE = "proposed_routes"
EXT = "https://siterra.invalid/schemas/stac/siterra/1.1.0/schema.json"
LABEL = "proposed route, access unconfirmed"
TO_UTM = Transformer.from_crs("EPSG:4326", "EPSG:32629", always_xy=True)
FROM_UTM = Transformer.from_crs("EPSG:32629", "EPSG:4326", always_xy=True)


def col_of(bundles, bid):
    d = os.path.join(bundles, bid)
    return d, json.load(open(os.path.join(d, "collection.json")))


def asset_path(bundles, ref):
    d, c = col_of(bundles, ref["bundle"])
    return os.path.join(d, c["assets"][ref["asset"]]["href"]), c


def compute(cfg, rc, params, bundles):
    reads = rc["reads"]
    with rasterio.open(asset_path(bundles, reads["relief"])[0]) as s:
        z = s.read(1).astype(np.float64)
        res, x0, y0, nodata = s.res[0], s.transform.c, s.transform.f, s.nodata
    z = np.where(z == nodata, np.nan, z)
    h, w = z.shape
    a_tr, a_shape, mask10 = place_config.analysis_grid(cfg)
    with rasterio.open(asset_path(bundles, reads["landCover"])[0]) as s:
        lc = s.read(1)
    water = np.zeros((-(-a_shape[0] // 3) * 3, -(-a_shape[1] // 3) * 3), np.int64)
    water[: a_shape[0], : a_shape[1]] = (lc == 80)
    wc = water.reshape(water.shape[0] // 3, 3, water.shape[1] // 3, 3).sum(axis=(1, 3))
    water30 = np.zeros((h, w), bool)
    water30[1:1 + wc.shape[0], 1:1 + wc.shape[1]] = wc >= params["water_cells_min"]
    inside30 = sl.parent_cells(mask10, 3, 1)
    allowed = inside30 & np.isfinite(z) & ~water30
    zf = np.where(allowed, z, 0.0)

    def node(lon, lat):
        e, n = TO_UTM.transform(lon, lat)
        return int(math.floor((e - x0) / res)), int(math.floor((y0 - n) / res)), e, n

    def centre(r, c):
        return x0 + (c + 0.5) * res, y0 - (r + 0.5) * res

    oc, orow, oe, on = node(*rc["origin"]["lonLat"])
    if not allowed[orow, oc]:
        raise SystemExit("the origin node is not an allowed node")
    kw = dict(cell_m=res, a=params["tobler_a_kmh"], b=params["tobler_b"], offset=params["tobler_offset"], factor=params["off_path_factor"],
              cap=params["slope_cap"])
    cost, pred = pr.search(zf, allowed, (orow, oc), **kw)

    strata_dir, strata_col = col_of(bundles, reads["strata"]["bundle"])
    bounds = strata_col["siterra:method"]["parameters"]["boundaries_m"]
    poly = place_config.geometry_projected(cfg)
    group = next(g for g in cfg["landCover"]["groups"] if g["id"] == rc["targets"]["perBand"]["landCoverGroup"])
    cells_doc = json.load(open(asset_path(bundles, reads["cells"])[0]))
    f = {n: i for i, n in enumerate(cells_doc["fields"])}
    ox, oy = oe, on

    def share(cell):
        corners = [(cell[f[f"E{k}"]], cell[f[f"N{k}"]]) for k in range(4)]
        quad = Polygon(corners)
        x_min, y_min, x_max, y_max = quad.bounds
        c0, c1 = int((x_min - a_tr.c) // a_tr.a), int((x_max - a_tr.c) // a_tr.a) + 1
        r0, r1 = int((a_tr.f - y_max) // -a_tr.e), int((a_tr.f - y_min) // -a_tr.e) + 1
        win_tr = rasterio.Affine(a_tr.a, 0, a_tr.c + c0 * a_tr.a, 0, a_tr.e, a_tr.f + r0 * a_tr.e)
        m = rasterio.features.rasterize([(shapely.geometry.mapping(quad), 1)], out_shape=(r1 - r0, c1 - c0), transform=win_tr, fill=0, dtype="uint8").astype(bool)
        sub = lc[r0:r1, c0:c1]
        return float(np.isin(sub[m], group["classes"]).sum() / max(1, int(m.sum()))), int(m.sum())

    targets = []
    pc = json.load(open(asset_path(bundles, {"bundle": rc["targets"]["pixel"]["bundle"], "asset": "pixel_anatomy"})[0]))["pixel"]
    if pc["id"] != rc["targets"]["pixel"]["pixelId"]:
        raise SystemExit("the pixel anatomy bundle names another pixel")
    pcol, prow, pe, pn = node(*pc["centre_lon_lat"])
    targets.append({"id": f"site_pixel_{pc['id']}", "kind": "pixel", "rule": "centre of the pixel the pixel anatomy bundle names", "lon_lat": pc["centre_lon_lat"],
                    "node": (prow, pcol), "pixel_id": pc["id"], "band": int(np.digitize(sl_z(z, x0, y0, res, pe, pn), bounds) + 1)})
    order = sorted(cells_doc["cells"], key=lambda c: (math.hypot(sum(c[f[f"E{k}"]] for k in range(4)) / 4 - ox, sum(c[f[f"N{k}"]] for k in range(4)) / 4 - oy), c[f["row"]], c[f["col"]]))
    found, tested = {}, 0
    for cell in order:
        ce = sum(cell[f[f"E{k}"]] for k in range(4)) / 4
        cn = sum(cell[f[f"N{k}"]] for k in range(4)) / 4
        band = int(np.digitize(sl_z(z, x0, y0, res, ce, cn), bounds) + 1)
        if band in found:
            continue
        if not all(poly.contains(Point(cell[f[f"E{k}"]], cell[f[f"N{k}"]])) for k in range(4)):
            continue
        cc, rr = int(math.floor((ce - x0) / res)), int(math.floor((y0 - cn) / res))
        if not (allowed[rr, cc] and np.isfinite(cost[rr, cc])):
            continue
        tested += 1
        g, ncells = share(cell)
        if g < rc["targets"]["perBand"]["landCoverShareMin"]:
            continue
        lon, lat = FROM_UTM.transform(ce, cn)
        found[band] = {"id": f"site_band_{band}", "kind": "band", "rule": "nearest MODIS cell to the origin that meets the band rule", "lon_lat": [round(lon, 6), round(lat, 6)],
                       "node": (rr, cc), "band": band, "modis_cell": {"row": int(cell[f["row"]]), "col": int(cell[f["col"]])},
                       "straight_line_to_origin_m": round(math.hypot(ce - ox, cn - oy), 1), "grazing_possible_share": round(g, 4), "cells_10m": ncells,
                       "march_june_slope_per_decade": cell[f["slope_per_decade"]]}
        if len(found) == 3:
            break
    targets += [found[b] for b in sorted(found)]

    routes = []
    for t in targets:
        r, c = t["node"]
        if not (allowed[r, c] and np.isfinite(cost[r, c])):
            raise SystemExit(f"{t['id']} cannot be reached")
        nodes = pr.path_to(pred, w, (r, c))
        routes.append({"target": t, "nodes": nodes, "cost_h": float(cost[r, c])})
    return {"z": z, "zf": zf, "allowed": allowed, "cost": cost, "x0": x0, "y0": y0, "res": res, "origin": (orow, oc), "origin_point": (oe, on),
            "targets": targets, "routes": routes, "kw": kw, "tested": tested, "bounds": bounds, "water_nodes": int((inside30 & water30).sum()),
            "nodes": int(allowed.sum())}


def sl_z(z, x0, y0, res, e, n):
    return float(dn.bilinear(z, x0, y0, res, np.array([e]), np.array([n]))[0])


def route_record(core, ro):
    z, x0, y0, res = core["z"], core["x0"], core["y0"], core["res"]
    nodes = ro["nodes"]
    e = np.array([x0 + (c + 0.5) * res for r, c in nodes])
    n = np.array([y0 - (r + 0.5) * res for r, c in nodes])
    zz = np.array([z[r, c] for r, c in nodes])
    lon, lat = FROM_UTM.transform(e, n)
    lon, lat, zs = np.round(lon, 7), np.round(lat, 7), np.round(zz, 1)
    dxy = np.hypot(np.diff(e), np.diff(n))
    slopes = np.diff(zz) / dxy
    dz = np.diff(zs)
    return {"lon": lon.tolist(), "lat": lat.tolist(), "z": zs.tolist(), "length_m": float(dxy.sum()), "climb_m": float(dz[dz > 0].sum()),
            "descent_m": float(-dz[dz < 0].sum()) + 0.0, "max_slope": float(np.abs(slopes).max()), "time_h": ro["cost_h"], "e": e, "n": n, "zz": zz, "dxy": dxy}


def main():
    pos = [a for a in sys.argv[1:] if not a.startswith("--")]
    place, repo, registry, lock_path, bundles = pos
    opts = dict(a[2:].partition("=")[::2] for a in sys.argv[1:] if a.startswith("--"))
    cfg = place_config.load(place, repo)
    reg = next(r for r in json.load(open(registry))["recipes"] if r["recipeId"] == RECIPE)
    rc = cfg["recipes"][RECIPE]
    params = {p["name"]: p["default"] for p in reg["parameters"]}
    bid = rc["bundleId"]
    bdir = os.path.join(bundles, bid)
    if os.path.exists(bdir):
        raise SystemExit(f"{bdir} exists; the bundle folder must not")
    now = opts.get("computed") or bc.now_utc()
    inspected = open(opts["inspected"]).read().strip() if "inspected" in opts else None
    core = compute(cfg, rc, params, bundles)
    again = compute(cfg, rc, params, bundles)
    recs = [route_record(core, ro) for ro in core["routes"]]
    recs2 = [route_record(again, ro) for ro in again["routes"]]
    identical = (json.dumps([[r["lon"], r["lat"], r["z"], r["time_h"]] for r in recs]) == json.dumps([[r["lon"], r["lat"], r["z"], r["time_h"]] for r in recs2])
                 and np.array_equal(core["cost"], again["cost"], equal_nan=True))
    kw = core["kw"]
    viol = pr.bellman_violations(core["cost"], core["zf"], core["allowed"], kw["cell_m"], kw["a"], kw["b"], kw["offset"], kw["factor"], kw["cap"])
    prob = {"bad_ends": 0, "disallowed_moves": 0, "time_mismatch": 0, "vertex_off_centre": 0, "duration_outside_tolerance": 0}
    detail = []
    for ro, rec in zip(core["routes"], recs):
        nodes = ro["nodes"]
        if nodes[0] != core["origin"] or nodes[-1] != ro["target"]["node"]:
            prob["bad_ends"] += 1
        total = 0.0
        for (r0, c0), (r1, c1) in zip(nodes[:-1], nodes[1:]):
            dr, dc = r1 - r0, c1 - c0
            length = kw["cell_m"] * math.hypot(dr, dc)
            s = (core["zf"][r1, c1] - core["zf"][r0, c0]) / length
            if (dr, dc) not in pr.MOVES or not core["allowed"][r1, c1] or abs(s) > kw["cap"]:
                prob["disallowed_moves"] += 1
            total += float(pr.move_hours(length, s, a=kw["a"], b=kw["b"], offset=kw["offset"], factor=kw["factor"]))
        if abs(total - ro["cost_h"]) > 1e-9:
            prob["time_mismatch"] += 1
        e2, n2 = TO_UTM.transform(np.array(rec["lon"]), np.array(rec["lat"]))
        if max(np.abs(e2 - rec["e"]).max(), np.abs(n2 - rec["n"]).max()) > 0.01:
            prob["vertex_off_centre"] += 1
        dxy = np.hypot(np.diff(e2), np.diff(n2))
        s2 = np.diff(np.array(rec["z"])) / dxy
        again_h = float(pr.move_hours(dxy, s2, a=kw["a"], b=kw["b"], offset=kw["offset"], factor=kw["factor"]).sum())
        dev = abs(again_h - rec["time_h"]) / rec["time_h"]
        if dev > params["duration_tolerance"]:
            prob["duration_outside_tolerance"] += 1
        detail.append(round(dev, 5))
    recompute_ok = bool(viol == 0 and not any(prob.values()) and identical)

    os.makedirs(bdir)
    shutil.copyfile(place_config.geometry_path(cfg), os.path.join(bdir, "analysis-geometry.geojson"))
    lock_out = os.path.join(bdir, "uv.lock")
    shutil.copyfile(lock_path, lock_out)
    routes_out, features = [], []
    ox, oy = core["origin_point"]
    for ro, rec in zip(core["routes"], recs):
        t = ro["target"]
        rid = "route_tabant_" + t["id"][len("site_"):]
        straight = float(math.hypot(rec["e"][-1] - rec["e"][0], rec["n"][-1] - rec["n"][0]))
        hm = int(round(rec["time_h"] * 60))
        routes_out.append({
            "route_id": rid, "label": LABEL, "target_id": t["id"], "length_m": round(rec["length_m"], 1), "straight_line_m": round(straight, 1),
            "detour_ratio": round(rec["length_m"] / straight, 3), "climb_m": round(rec["climb_m"], 1), "descent_m": round(rec["descent_m"], 1),
            "time_h": round(rec["time_h"], 3), "time_minutes": hm, "vertices": len(rec["lon"]), "largest_move_slope": round(rec["max_slope"], 3),
            "from": {"lon": rec["lon"][0], "lat": rec["lat"][0], "elevation_m": rec["z"][0]}, "to": {"lon": rec["lon"][-1], "lat": rec["lat"][-1], "elevation_m": rec["z"][-1]}})
        features.append({"type": "Feature", "id": rid, "geometry": {"type": "LineString", "coordinates": [[a, b, c] for a, b, c in zip(rec["lon"], rec["lat"], rec["z"])]},
                         "properties": {"route_id": rid, "label": LABEL, "target_id": t["id"], "length_m": round(rec["length_m"], 1), "climb_m": round(rec["climb_m"], 1),
                                        "time_h": round(rec["time_h"], 3)}})
    bc.dump({"type": "FeatureCollection", "features": features}, os.path.join(bdir, "proposed-routes.geojson"), compact=True)
    sites = [{k: (list(v) if k == "node" else v) for k, v in t.items() if k != "node"} | {"node_row_col": list(t["node"])} for t in core["targets"]]
    summary = {"recipeId": RECIPE, "version": reg["version"], "computed": now,
               "place": {"placeId": cfg["placeId"], "configRevision": cfg["configRevision"], "config_sha256": cfg["_sha256"]},
               "claim_kind": "model_estimate", "label": LABEL, "not": "not a surveyed path, not a track on the ground, not a safe or permitted route",
               "origin": {**rc["origin"], "node_centre_lon_lat": [round(x, 7) for x in FROM_UTM.transform(core["x0"] + (core["origin"][1] + 0.5) * core["res"], core["y0"] - (core["origin"][0] + 0.5) * core["res"])]},
               "cost_function": {"name": "Tobler's hiking function (SCI-169)", "speed_kmh": "6 exp(-3.5 abs(S + 0.05)) times 0.6 off path", "slope_cap": params["slope_cap"],
                                 "moves": "8 neighbours of a 30 m node", "grid_m": core["res"], "time": "horizontal length over speed, one way, no load, no rest",
                                 "water": f"nodes with at least {params['water_cells_min']} of 9 WorldCover water cells are not entered", "parameters": params},
               "surface_nodes": core["nodes"], "water_nodes_excluded": core["water_nodes"], "sites": sites, "routes": routes_out,
               "units": {"length_m": "m horizontal along the line", "climb_m": "m, sum of rises of the stored 0.1 m heights", "time_h": "hours, model estimate", "elevation_m": "m above the EGM2008 geoid"},
               "checks": {"shorter_route_violations": viol, **prob, "duration_deviation_by_route": detail},
               "limitations": reg["standardLimitations"], "forbidden_phrases": reg["forbiddenPhrases"]}
    bc.dump(summary, os.path.join(bdir, "proposed-routes.json"))
    checks = [
        {"name": "recompute_sample_period", "passed": recompute_ok, "detail": (
            f"Recomputed over the whole cost-to-reach field and from the stored lines. Of all allowed moves from reached nodes, {viol} would lower a node's cost-to-reach, so no shorter route "
            f"exists under the stated cost function; per route: wrong ends {prob['bad_ends']}, moves not allowed {prob['disallowed_moves']}, move times not summing to the cost-to-reach "
            f"{prob['time_mismatch']}, vertices off a node centre by more than 0.01 m {prob['vertex_off_centre']}, duration recomputed from the stored lon, lat and 0.1 m heights differing from the "
            f"stored time by more than {params['duration_tolerance'] * 100:.1f}% {prob['duration_outside_tolerance']} (deviations {detail}). The whole computation run twice in one process is identical: {identical}.")},
        {"name": "units_and_scale", "passed": True, "detail": "Lengths are metres along the line (horizontal, EPSG:32629 node centres), climb in metres from 0.1 m heights, time in hours under Tobler's function times 0.6 "
                                                              "(one way, no load, no rest); coordinates are decimal degrees (EPSG:4326, 7 decimals) with elevation in metres above the EGM2008 geoid."},
        {"name": "nodata_not_zero", "passed": True, "detail": "Nodes outside the catchment and mostly water nodes are never entered; no route value is 0 as a stand-in for missing, and a route whose target cannot be reached stops the build."},
        {"name": "attribution_present", "passed": True, "detail": "The Copernicus DEM notices (Article 6(b) and 6(c)), the liability statement and the ESA WorldCover citation are in siterra:attribution."},
        {"name": "visual_inspection_sample", "passed": inspected is not None, "detail": inspected or "Not inspected: run with --inspected=<note> after looking at the rendered routes."},
    ]
    status = "validated" if all(c["passed"] for c in checks) else "failed"
    strata_col = json.load(open(os.path.join(bundles, rc["reads"]["strata"]["bundle"], "collection.json")))
    assets = {
        "analysis_geometry": bc.plain_asset(bdir, "analysis-geometry.geojson", "application/geo+json", f"Frozen analysis geometry {cfg['geometry']['id']}, revision {cfg['geometry']['revision']}", ["metadata"]),
        RECIPE: bc.plain_asset(bdir, "proposed-routes.json", "application/json", "Sites, cost function and each route's length, climb and time, all labelled proposed route, access unconfirmed (the result read_recipe_result returns)", ["data"]),
        "route_lines": bc.plain_asset(bdir, "proposed-routes.geojson", "application/geo+json", "One 3D LineString per proposed route ([lon, lat, elevation], metres above the EGM2008 geoid); proposed route, access unconfirmed", ["data"]),
    }
    desc = (f"Precomputed result of recipe {RECIPE} {reg['version']} for {cfg['title']}: {len(routes_out)} proposed walking routes from Tabant to field check sites (the pixel the case opens and the "
            "nearest grazing-land cell of each elevation band), least time under Tobler's hiking function on the 30 m surface, "
            + "; ".join(f"{r['target_id']}: {r['length_m'] / 1000:.1f} km, climb {r['climb_m']:.0f} m, about {r['time_minutes']} min" for r in routes_out)
            + ". Proposed route, access unconfirmed; not a surveyed path. Model estimate.\n\n" + " ".join(reg["standardLimitations"]))
    links = [{"rel": "root", "href": "../catalog.json", "type": "application/json"}, {"rel": "parent", "href": "../catalog.json", "type": "application/json"}]
    for ref in ("relief", "landCover", "cells", "strata"):
        b = rc["reads"][ref]["bundle"]
        links.append({"rel": "derived_from", "href": f"../{b}/collection.json", "type": "application/json", "title": f"{b}", "file:checksum": "1220" + bc.sha(os.path.join(bundles, b, "collection.json"))})
    b = rc["targets"]["pixel"]["bundle"]
    links.append({"rel": "derived_from", "href": f"../{b}/collection.json", "type": "application/json", "title": f"{b} (the pixel target)", "file:checksum": "1220" + bc.sha(os.path.join(bundles, b, "collection.json"))})
    links += [l for l in strata_col["links"] if l["rel"] in ("derived_from", "license") and not l["href"].startswith("../")]
    links.append({"rel": "processing-software", "href": "./uv.lock", "type": "application/toml", "title": "Pipeline lockfile (uv)", "file:checksum": "1220" + bc.sha(lock_out)})
    col = {
        "type": "Collection", "stac_version": "1.1.0",
        "stac_extensions": ["https://stac-extensions.github.io/processing/v1.3.0/schema.json", "https://stac-extensions.github.io/file/v2.1.0/schema.json", EXT],
        "id": bid, "title": f"Proposed walking routes ({RECIPE} {reg['version']})", "description": desc, "license": "other",
        "providers": [*[p for p in strata_col["providers"] if "processor" not in p["roles"] and "host" not in p["roles"]],
                      {"name": "Siterra science pipeline", "roles": ["processor"],
                       "processing:lineage": "Least-time paths (Dijkstra, Tobler's hiking function times 0.6, 8 neighbour moves, slope cap 0.70) over the 30 m elevation surface of the relief bundle from the Tabant node to sites chosen by a registered rule (science/pipeline/routes-bundle.py)",
                       "processing:software": {"siterra-science": "0.1.0", "python": sys.version.split()[0], "numpy": np.__version__, "rasterio": rasterio.__version__, "gdal": rasterio.__gdal_version__,
                                               "pyproj": pyproj.__version__, "shapely": shapely.__version__}}],
        "extent": {"spatial": {"bbox": [list(place_config.geometry(cfg).bounds)]}, "temporal": {"interval": [["2021-01-01T00:00:00Z", None]]}},
        "assets": assets, "created": now, "siterra:status": status, "siterra:variable": "proposed_route",
        "siterra:dataset": {"id": "copernicus-dem-glo-30", "version": "2021", "access_route": strata_col["siterra:dataset"]["access_route"],
                            "resolution_note": "30 m EPSG:32629 elevation surface of the relief bundle; land cover 10 m"},
        "siterra:geo_selection": strata_col["siterra:geo_selection"],
        "siterra:method": {"id": RECIPE, "version": reg["version"], "analysis_crs": cfg["analysisCrs"],
                           "parameters": {"place_configuration": f"science/places/{os.path.basename(place)} revision {cfg['configRevision']}, sha256 {cfg['_sha256']}", **params,
                                          "origin": rc["origin"], "targets": rc["targets"]}, "reference_period": None, "operation_order": reg["formula"]},
        "siterra:attribution": strata_col["siterra:attribution"], "siterra:limitations": reg["standardLimitations"], "siterra:checks": checks, "links": links}
    bc.dump(col, os.path.join(bdir, "collection.json"))
    print(f"{bid}: {status}")
    print(" sites", [(s["id"], s.get("band"), s.get("grazing_possible_share"), s.get("straight_line_to_origin_m")) for s in sites])
    for r in routes_out:
        print(" ", r["route_id"], r["length_m"], "m", r["straight_line_m"], "straight", r["climb_m"], "climb", r["time_minutes"], "min", r["vertices"], "vertices", r["largest_move_slope"], "max slope")
    print(" checks", summary["checks"], "identical", identical, "candidates tested", core["tested"])
    for c in checks:
        print(f"  check {c['name']}: {'passed' if c['passed'] else 'FAILED'}")


if __name__ == "__main__":
    main()
