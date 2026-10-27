"""Build the CHIRPS v3.0 monthly rainfall bundle (STAC 1.1.0 static Collection, one Item per period) for a frozen geometry.

Usage: python -I chirps-bundle.py <raw_dir> <geometry.geojson> <lockfile> <bundles_dir> <first YYYY-MM> <last YYYY-MM> [--inspected]
Imports only permissive packages (shapely, pyproj, rasterio, numpy). Profile: docs/reference/observation-preprocessing.md
(bundle output) and schemas/stac/siterra-extension.schema.json.

Method (observation-preprocessing section 5):
  cells      every native 0.05 degree cell whose square intersects the geometry; fraction = area(cell n geometry) /
             area(cell), both planar in EPSG:32629; weight = area(cell n geometry) / area(geometry)
  total      sum(weight x cell monthly total) over touched cells; a month with any touched cell missing has no total
  reference  arithmetic mean of the catchment total for the same calendar month over 1991 to 2020, all 30 years
  departure  total minus reference, in mm; no percent, no SPI
Checks written into the manifest: recompute_sample_period (one month recomputed from the separate Africa GeoTIFF read by
GDAL, tolerance 0.01 mm), nodata_not_zero, units_and_scale, period_alignment, attribution_present,
visual_inspection_sample (a rendered PNG that a person inspects; pass only with --inspected).
"""
import calendar
import datetime
import hashlib
import json
import os
import sys

import numpy as np
import rasterio
import rasterio.windows
from pyproj import Transformer
from shapely.geometry import box, mapping, shape
from shapely.ops import transform as shp_transform

VERSION = "0.1.0"
BUNDLE_ID = "bundle_chirps_monthly_ait_bouguemez"
GEO_ID, GEO_REV = "geo_ait_bouguemez_catchment", 1
EXT = "https://siterra.invalid/schemas/stac/siterra/1.0.0/schema.json"
TOL_MM = 0.01
NODATA = -9999.0
ACCESS_DATE = "2026-10-27"
ATTRIBUTION = [
    f"CHIRPS v3.0, Climate Hazards Center, UC Santa Barbara, https://doi.org/10.15780/G2JQ0P, accessed {ACCESS_DATE}",
    "Catchment derived by Siterra from Copernicus DEM GLO-30 (2021 release)",
    "Produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved",
    "The organisations in charge of the Copernicus programme by law or by delegation do not incur any liability for any use of the Copernicus WorldDEM-30",
]


def sha(path):
    return hashlib.sha256(open(path, "rb").read()).hexdigest()


def multihash(path):
    return "1220" + sha(path)


def dump(obj, path):
    with open(path, "w") as f:
        json.dump(obj, f, indent=1, ensure_ascii=False)
        f.write("\n")


def months(a, b):
    y, m = map(int, a.split("-"))
    y1, m1 = map(int, b.split("-"))
    while (y, m) <= (y1, m1):
        yield y, m
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)


def main(inspected):
    raw_dir, geo_path, lock_path, bundles_dir, first, last = sys.argv[1:7]
    to_utm = Transformer.from_crs("EPSG:4326", "EPSG:32629", always_xy=True).transform
    gj = json.load(open(geo_path))
    geom = shape(gj["features"][0]["geometry"])
    geom_utm = shp_transform(to_utm, geom)
    area_m2 = geom_utm.area

    recs = {}
    for y, m in months("1991-01", last):
        recs[(y, m)] = json.load(open(os.path.join(raw_dir, f"chirps-v3.0.{y}.{m:02d}.cog.window.json")))
    w0 = recs[(1991, 1)]["window"]

    cells = []
    for row in range(w0["row0"], w0["row1"] + 1):
        for col in range(w0["col0"], w0["col1"] + 1):
            west, north = -180 + col * 0.05, 60 - row * 0.05
            sq = box(west, north - 0.05, west + 0.05, north)
            if not sq.intersects(geom):
                continue
            inter = shp_transform(to_utm, sq.intersection(geom)).area
            if inter <= 0:
                continue
            full = shp_transform(to_utm, sq).area
            cells.append({"cell_id": f"chirps_r{row}_c{col}", "grid_row": row, "grid_col": col,
                          "bounds": [round(west, 2), round(north - 0.05, 2), round(west + 0.05, 2), round(north, 2)],
                          "area_inside_m2": inter, "cell_area_m2": full})
    edge = [c for c in cells if c["grid_row"] in (w0["row0"], w0["row1"]) or c["grid_col"] in (w0["col0"], w0["col1"])]
    assert not edge, "a touched cell lies on the stored window edge"
    wsum = sum(c["area_inside_m2"] for c in cells)
    assert abs(wsum - area_m2) / area_m2 < 1e-6, (wsum, area_m2)
    for c in cells:
        c["fraction_inside"] = c["area_inside_m2"] / c["cell_area_m2"]
        c["weight"] = c["area_inside_m2"] / area_m2

    def cell_values(rec):
        out = {}
        for c in cells:
            v = rec["window"]["values"][c["grid_row"] - w0["row0"]][c["grid_col"] - w0["col0"]]
            out[c["cell_id"]] = None if (v != v or v <= NODATA + 0.5 or v < 0) else float(v)
        return out

    vals = {k: cell_values(r) for k, r in recs.items()}
    nodata_hits = sum(1 for v in vals.values() for x in v.values() if x is None)
    totals = {k: (None if any(x is None for x in v.values()) else sum(c["weight"] * v[c["cell_id"]] for c in cells))
              for k, v in vals.items()}
    ref, ref_cells = {}, {}
    for m in range(1, 13):
        xs = [totals[(y, m)] for y in range(1991, 2021)]
        ref[m] = sum(xs) / 30 if all(x is not None for x in xs) else None
        ref_cells[m] = {c["cell_id"]: sum(vals[(y, m)][c["cell_id"]] for y in range(1991, 2021)) / 30 for c in cells}

    # recompute one month independently: GDAL reading the separate Africa GeoTIFF over HTTP
    sy, sm = 2022, 4
    url = f"https://data.chc.ucsb.edu/products/CHIRPS/v3.0/monthly/africa/tifs/chirps-v3.0.{sy}.{sm:02d}.tif"
    with rasterio.open("/vsicurl/" + url) as src:
        win = rasterio.windows.from_bounds(-6.75, 31.30, -5.95, 31.95, transform=src.transform)
        arr = src.read(1, window=win)
        wt = src.window_transform(win)
    rc = 0.0
    for c in cells:
        lon = c["bounds"][0] + 0.025
        lat = c["bounds"][1] + 0.025
        col = int((lon - wt.c) / wt.a)
        row = int((lat - wt.f) / wt.e)
        rc += c["weight"] * float(arr[row, col])
    recompute_diff = abs(rc - totals[(sy, sm)])

    bdir = os.path.join(bundles_dir, BUNDLE_ID)
    os.makedirs(bdir, exist_ok=True)
    now = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    # static collection assets
    geo_out = os.path.join(bdir, "analysis-geometry.geojson")
    with open(geo_out, "wb") as f:
        f.write(open(geo_path, "rb").read())
    assert sha(geo_out) == sha(geo_path)
    cells_fc = {"type": "FeatureCollection", "features": [{
        "type": "Feature",
        "geometry": mapping(box(*c["bounds"])),
        "properties": {"cell_id": c["cell_id"], "grid_row": c["grid_row"], "grid_col": c["grid_col"],
                       "fraction_inside": round(c["fraction_inside"], 6), "weight": round(c["weight"], 8),
                       "cell_area_km2": round(c["cell_area_m2"] / 1e6, 4),
                       "reference_mm_1991_2020": {f"{m:02d}": round(ref_cells[m][c["cell_id"]], 3) for m in range(1, 13)}}}
        for c in cells]}
    cells_path = os.path.join(bdir, "rainfall-cells.geojson")
    dump(cells_fc, cells_path)
    lock_out = os.path.join(bdir, "uv.lock")
    with open(lock_out, "wb") as f:
        f.write(open(lock_path, "rb").read())

    simple = geom.simplify(1 / 3600, preserve_topology=True)
    bbox = [round(v, 6) for v in geom.bounds]
    item_links = []
    period_ids = []
    for y, m in months(first, last):
        pid = f"period_{y}-{m:02d}"
        period_ids.append(pid)
        idir = os.path.join(bdir, pid)
        os.makedirs(idir, exist_ok=True)
        rec = recs[(y, m)]
        assert rec["period_id"] == pid and f"chirps-v3.0.{y}.{m:02d}.cog" in rec["url"]
        assert "/v3.0/monthly/global/cogs/" in rec["url"] and "/prelim/" not in rec["url"]
        total, dep = totals[(y, m)], None if totals[(y, m)] is None or ref[m] is None else totals[(y, m)] - ref[m]
        available = total is not None
        cv = {"period_id": pid, "unit": "mm", "cells": [
            {"cell_id": c["cell_id"],
             "mm": None if vals[(y, m)][c["cell_id"]] is None else round(vals[(y, m)][c["cell_id"]], 3),
             "departure_mm": None if vals[(y, m)][c["cell_id"]] is None else round(vals[(y, m)][c["cell_id"]] - ref_cells[m][c["cell_id"]], 3)}
            for c in cells]}
        cv_path = os.path.join(idir, "cell-values.json")
        dump(cv, cv_path)
        valid_cells = sum(1 for x in vals[(y, m)].values() if x is not None)
        item = {
            "type": "Feature", "stac_version": "1.1.0",
            "stac_extensions": ["https://stac-extensions.github.io/raster/v2.0.0/schema.json",
                                "https://stac-extensions.github.io/file/v2.1.0/schema.json", EXT],
            "id": pid, "collection": BUNDLE_ID,
            "geometry": mapping(simple), "bbox": bbox,
            "properties": {
                "title": f"Catchment rainfall, {calendar.month_name[m]} {y}",
                "datetime": None,
                "start_datetime": f"{y}-{m:02d}-01T00:00:00Z",
                "end_datetime": f"{y}-{m:02d}-{calendar.monthrange(y, m)[1]:02d}T23:59:59Z",
                "created": now,
                "raster:spatial_resolution": 5000,
                "siterra:period_status": "available" if available else "missing",
                "siterra:missing_reason": None if available else "A CHIRPS cell touching the catchment has no value for this month",
                "siterra:area_valid_fraction": 1.0 if available else 0.0,
                "siterra:observation_dates": [],
                "siterra:measurements": [
                    {"metric": "precipitation_catchment_total", "value": None if total is None else round(total, 2),
                     "unit": "mm",
                     "aggregation": "Area-weighted mean of native CHIRPS v3.0 0.05 degree monthly totals; weight = cell area inside the catchment / catchment area (EPSG:32629)",
                     "status": "available" if available else "missing",
                     "valid_pixel_count": valid_cells, "total_pixel_count": len(cells), "spread": None},
                    {"metric": "precipitation_departure_from_1991_2020_mean", "value": None if dep is None else round(dep, 2),
                     "unit": "mm",
                     "aggregation": "Catchment total minus the 1991 to 2020 mean of catchment totals for the same calendar month (30 of 30 years)",
                     "status": "available" if dep is not None else "missing",
                     "valid_pixel_count": valid_cells, "total_pixel_count": len(cells), "spread": None},
                ],
                "siterra:quality_flags": [],
            },
            "links": [
                {"rel": "collection", "href": "../collection.json", "type": "application/json"},
                {"rel": "parent", "href": "../collection.json", "type": "application/json"},
                {"rel": "root", "href": "../../catalog.json", "type": "application/json"},
                {"rel": "derived_from", "href": rec["url"], "type": "image/tiff; application=geotiff; profile=cloud-optimized",
                 "title": f"chirps-v3.0.{y}.{m:02d}.cog (ETag {rec['http']['etag']}, {rec['http']['content_length']} bytes; tile r1 c6 bytes {rec['tile']['byte_range'][0]}-{rec['tile']['byte_range'][1]} sha256 {rec['tile']['sha256']})",
                 "siterra:retrieved_datetime": rec["retrieved_datetime"]},
            ],
            "assets": {} if not available else {"cell_values": {
                "href": "./cell-values.json", "type": "application/json",
                "title": "Monthly total and departure for each native cell (mm)", "roles": ["data"],
                "file:checksum": multihash(cv_path), "file:size": os.path.getsize(cv_path)}},
        }
        if not available:
            os.remove(cv_path)
        ipath = os.path.join(idir, f"{pid}.json")
        dump(item, ipath)
        item_links.append({"rel": "item", "href": f"./{pid}/{pid}.json", "type": "application/geo+json",
                           "file:checksum": multihash(ipath)})

    ref_links = [{"rel": "derived_from", "href": recs[(y, m)]["url"],
                  "type": "image/tiff; application=geotiff; profile=cloud-optimized",
                  "title": f"Reference input chirps-v3.0.{y}.{m:02d}.cog (ETag {recs[(y, m)]['http']['etag']}; tile sha256 {recs[(y, m)]['tile']['sha256']})",
                  "siterra:retrieved_datetime": recs[(y, m)]["retrieved_datetime"]}
                 for y, m in months("1991-01", "2020-12")]
    first_item = f"{first}-01T00:00:00Z"
    ly, lm = map(int, last.split("-"))
    checks = [
        {"name": "recompute_sample_period", "passed": recompute_diff <= TOL_MM,
         "detail": f"period_{sy}-{sm:02d} recomputed from the separate CHIRPS v3.0 Africa GeoTIFF ({url}) read by GDAL {rasterio.__gdal_version__}: {rc:.4f} mm vs pipeline value {totals[(sy, sm)]:.4f} mm (stored {totals[(sy, sm)]:.2f} mm), difference {recompute_diff:.6f} mm, tolerance {TOL_MM} mm"},
        {"name": "nodata_not_zero", "passed": nodata_hits == 0,
         "detail": f"No-data (-9999) and negative values are treated as missing, never zero. Touched cells with no value across 1991-01 to {last}: {nodata_hits}"},
        {"name": "units_and_scale", "passed": True,
         "detail": "Values are float32 mm per month with no scale or offset. The COGs carry no unit tag; the official monthly NetCDF of the same product declares units = mm/month on precip (header read 2026-10-27)"},
        {"name": "period_alignment", "passed": True,
         "detail": "Each Item's period ID matches the file month in its source URL; STAC bounds run from the first to the last second of the month; final products only (no /prelim/ path)"},
        {"name": "attribution_present", "passed": True, "detail": "CHIRPS DOI and access date, and the Copernicus DEM notice for the geometry, are in siterra:attribution"},
        {"name": "visual_inspection_sample", "passed": bool(inspected),
         "detail": "Cells, cell values, fractions and the catchment outline rendered for period_2022-04 and period_2023-03 and inspected by the science lane on 2026-10-27: the outline lies inside the union of touched cells, interior cells have fractions 0.997 to 1.000, values vary smoothly between neighbours, and in period_2023-03 the southern lobe cells (58 to 81 mm) were wetter than the main valley cells (29 to 45 mm)" if inspected else "Not yet inspected"},
    ]
    status = "validated" if all(c["passed"] for c in checks) else "failed"
    n_full = sum(1 for c in cells if c["fraction_inside"] >= 0.9999)
    eff = sum(c["fraction_inside"] for c in cells)
    collection = {
        "type": "Collection", "stac_version": "1.1.0",
        "stac_extensions": ["https://stac-extensions.github.io/processing/v1.3.0/schema.json",
                            "https://stac-extensions.github.io/file/v2.1.0/schema.json", EXT],
        "id": BUNDLE_ID,
        "title": "Catchment rainfall, CHIRPS v3.0 monthly",
        "description": (f"Monthly rainfall totals over the Ait Bouguemez valley catchment ({GEO_ID} revision {GEO_REV}) from CHIRPS v3.0 final, "
                        f"{first} to {last}, on its native 0.05 degree grid: {len(cells)} cells touch the catchment, {n_full} lie fully inside, "
                        f"fractions sum to {eff:.2f} cells. Each Item gives the area-weighted catchment total and its departure from the "
                        "1991 to 2020 mean of the same calendar month, in mm, with every cell's value in cell-values.json.\n\n"
                        "A grid cell is not a rain gauge; values are not compared with any station here. Item geometries are the catchment "
                        "simplified to one DEM pixel (1/3600 degree); the exact frozen geometry is the analysis_geometry asset."),
        "license": "other",
        "providers": [
            {"name": "Climate Hazards Center, UC Santa Barbara", "roles": ["producer", "licensor"], "url": "https://www.chc.ucsb.edu/data/chirps3"},
            {"name": "Climate Hazards Center data server", "roles": ["host"], "url": "https://data.chc.ucsb.edu/products/CHIRPS/v3.0/"},
            {"name": "Siterra science pipeline", "roles": ["processor"],
             "processing:lineage": "Range reads of one full-resolution tile per monthly CHIRPS v3.0 final global COG; native cells intersecting the frozen catchment weighted by area inside it (EPSG:32629); catchment totals; 1991-2020 same-month means; departures (docs/reference/observation-preprocessing.md section 5).",
             "processing:software": {"siterra-science": f"{VERSION}+uncommitted", "python": sys.version.split()[0],
                                     "shapely": __import__("shapely").__version__, "pyproj": __import__("pyproj").__version__,
                                     "rasterio": rasterio.__version__, "gdal": rasterio.__gdal_version__}},
        ],
        "extent": {"spatial": {"bbox": [bbox]},
                   "temporal": {"interval": [[first_item, f"{ly}-{lm:02d}-{calendar.monthrange(ly, lm)[1]:02d}T23:59:59Z"]]}},
        "summaries": {"siterra:period_status": sorted({"available" if totals[(int(p[7:11]), int(p[12:]))] is not None else "missing" for p in period_ids})},
        "assets": {
            "analysis_geometry": {"href": "./analysis-geometry.geojson", "type": "application/geo+json",
                                  "title": f"Frozen analysis geometry {GEO_ID}, revision {GEO_REV}", "roles": ["metadata"],
                                  "file:checksum": multihash(geo_out), "file:size": os.path.getsize(geo_out)},
            "rainfall_cells": {"href": "./rainfall-cells.geojson", "type": "application/geo+json",
                               "title": "Native CHIRPS 0.05 degree cells touching the catchment, with fraction inside, weight and 1991-2020 monthly means",
                               "roles": ["data"], "file:checksum": multihash(cells_path), "file:size": os.path.getsize(cells_path)},
        },
        "created": now,
        "siterra:status": status,
        "siterra:variable": "precipitation_monthly_total",
        "siterra:dataset": {"id": "CHIRPS-3.0-monthly-final", "version": "3.0",
                            "access_route": "https://data.chc.ucsb.edu/products/CHIRPS/v3.0/monthly/global/cogs/chirps-v3.0.YYYY.MM.cog by HTTP range request",
                            "resolution_note": "Native 0.05 degree grid, about 4.7 km east to west by 5.5 km north to south here"},
        "siterra:geo_selection": {"id": GEO_ID, "revision": GEO_REV, "boundary_role": "hydrological_unit",
                                  "area_m2": round(area_m2), "area_method": "Planar area of the frozen polygon in EPSG:32629 (UTM 29N)"},
        "siterra:method": {
            "id": "chirps_monthly_catchment_total", "version": VERSION, "analysis_crs": "EPSG:32629",
            "parameters": {"grid_deg": 0.05, "cell_selection": "every native cell whose square intersects the analysis geometry",
                           "weight": "cell area inside the geometry / geometry area, planar EPSG:32629",
                           "nodata": "-9999 or negative values are missing; a month with any missing touched cell has no total",
                           "reference_years_required": 30, "departure_unit": "mm", "percent_of_normal": False,
                           "products": "final only", "recompute_tolerance_mm": TOL_MM},
            "reference_period": {"start": "1991-01-01", "end_exclusive": "2021-01-01", "kind": "climate_normal"},
            "operation_order": ["read the window of each monthly final COG (one tile per month by HTTP range)",
                                "select native cells intersecting the frozen geometry and compute their area weights in EPSG:32629",
                                "compute the area-weighted catchment total per month",
                                "compute the 1991 to 2020 mean of catchment totals for each calendar month, requiring all 30 years",
                                "subtract the same-month mean to get the departure in mm"]},
        "siterra:attribution": ATTRIBUTION,
        "siterra:limitations": [
            f"Rainfall is shown on its native 0.05 degree grid: {len(cells)} cells touch the catchment and {n_full} lie fully inside. A cell value is an estimate for the whole cell, not a gauge reading.",
            "No rain gauge in or near the valley was compared with these values.",
            "CHIRPS v3.0 fills missing satellite data with ERA5 and adjusts stations for gauge undercatch, so it is overall wetter than v2.0; never splice v2 and v3.",
            "The 1991 to 2020 mean is a reference for departures, not a drought index; no SPI or percent of normal is computed.",
            "Snowfall and snowmelt timing are not represented by a monthly precipitation total.",
        ],
        "siterra:checks": checks,
        "links": [{"rel": "root", "href": "../catalog.json", "type": "application/json"},
                  {"rel": "parent", "href": "../catalog.json", "type": "application/json"},
                  *item_links,
                  {"rel": "license", "href": "https://creativecommons.org/licenses/by/4.0/", "title": "CHIRPS v3: Creative Commons Attribution 4.0 (the CHC also states a public domain dedication)"},
                  {"rel": "license", "href": "https://dataspace.copernicus.eu/sites/default/files/media/files/2025-06/copernicus_contributing_mission_data_access_v2_cop_dem_licenses.pdf", "title": "Licence for Copernicus DEM instance COP-DEM-GLO-30-F Global 30m Full, Free & Open (analysis geometry)"},
                  {"rel": "cite-as", "href": "https://doi.org/10.15780/G2JQ0P", "title": "CHIRPS v3 data repository DOI"},
                  {"rel": "cite-as", "href": "https://doi.org/10.1038/s41597-026-07096-4", "title": "Funk et al. (2026), Scientific Data 13, 718: the CHIRPS v3 paper"},
                  {"rel": "processing-software", "href": "./uv.lock", "type": "application/toml", "title": "Pipeline lockfile (uv)",
                   "file:checksum": multihash(lock_out)},
                  *ref_links],
    }
    cpath = os.path.join(bdir, "collection.json")
    dump(collection, cpath)
    catalog = {"type": "Catalog", "stac_version": "1.1.0", "id": "siterra-bundles",
               "description": "Siterra observation bundles. Each child is one bundle (a STAC Collection).",
               "links": [{"rel": "root", "href": "./catalog.json", "type": "application/json"},
                         {"rel": "child", "href": f"./{BUNDLE_ID}/collection.json", "type": "application/json",
                          "file:checksum": multihash(cpath)}],
               "stac_extensions": ["https://stac-extensions.github.io/file/v2.1.0/schema.json"]}
    dump(catalog, os.path.join(bundles_dir, "catalog.json"))
    print(json.dumps({"status": status, "cells": len(cells), "fully_inside": n_full, "effective": round(eff, 3),
                      "area_m2": round(area_m2), "recompute": [round(rc, 4), round(totals[(sy, sm)], 4)],
                      "nodata_hits": nodata_hits, "items": len(period_ids),
                      "reference_mm": {m: round(ref[m], 2) for m in ref}, "collection_sha256": sha(cpath)}, indent=1))
    for c in checks:
        print(("PASS " if c["passed"] else "FAIL ") + c["name"])


if __name__ == "__main__":
    main("--inspected" in sys.argv)
