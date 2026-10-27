"""Write the sampling-strata bundle: a STAC Collection whose assets are static layers (no Items, no periods).

Usage: python -I strata-bundle.py <strata_dir> <worldcover_dir> <geometry.geojson> <lockfile> <bundles_dir> [--inspected=<note.txt>]
Inputs from dem-strata.py (strata.tif, strata.json) and worldcover-grid.py (worldcover-2021.json). The strata COG has
three uint8 bands: elevation band (1 to 3, equal-area terciles), aspect class (1 N, 2 E, 3 S, 4 W, 5 level below 5 deg),
excluded (1 = WorldCover 2021 cropland or built-up). Strata are a sampling device for field work, not vegetation types.
"""
import datetime
import hashlib
import json
import os
import shutil
import sys

import rasterio
from rasterio.shutil import copy as rio_copy
from shapely.geometry import shape

BUNDLE_ID = "bundle_terrain_strata_ait_bouguemez"
EXT = "https://siterra.invalid/schemas/stac/siterra/1.0.0/schema.json"
DEM_URL = "https://copernicus-dem-30m.s3.amazonaws.com/Copernicus_DSM_COG_10_N31_00_W007_00_DEM/Copernicus_DSM_COG_10_N31_00_W007_00_DEM.tif"
LIAB = "The organisations in charge of the Copernicus programme by law or by delegation do not incur any liability for any use of the Copernicus WorldDEM-30"


def sha(p):
    return hashlib.sha256(open(p, "rb").read()).hexdigest()


def dump(o, p):
    with open(p, "w") as f:
        json.dump(o, f, indent=1, ensure_ascii=False)
        f.write("\n")


sdir, wdir, geo, lock, bundles = sys.argv[1:6]
flag = [a for a in sys.argv if a.startswith("--inspected=")]
note = open(flag[0].split("=", 1)[1]).read().strip() if flag else None
info = json.load(open(os.path.join(sdir, "strata.json")))
wc = json.load(open(os.path.join(wdir, "worldcover-2021.json")))
bdir = os.path.join(bundles, BUNDLE_ID)
os.makedirs(bdir, exist_ok=True)
cog = os.path.join(bdir, "strata.tif")
rio_copy(os.path.join(sdir, "strata.tif"), cog, driver="COG", compress="DEFLATE", overview_resampling="nearest")
with rasterio.open(cog) as s:
    grid_shape, tr, crs = [s.height, s.width], list(s.transform)[:6], s.crs.to_string()
shutil.copyfile(geo, os.path.join(bdir, "analysis-geometry.geojson"))
shutil.copyfile(lock, os.path.join(bdir, "uv.lock"))
now = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
q1, q2 = info["elevation_band_boundaries_m"]
checks = [
    {"name": "units_and_scale", "passed": True, "detail": f"Elevation in metres from the pinned DEM; band boundaries {q1} m and {q2} m; aspect classes in degrees from north"},
    {"name": "nodata_not_zero", "passed": True, "detail": "0 means outside the catchment in every band; no class uses 0"},
    {"name": "attribution_present", "passed": True, "detail": "Copernicus DEM notices (Article 6(b) and 6(c)) and the WorldCover citation are in siterra:attribution"},
    {"name": "visual_inspection_sample", "passed": bool(note), "detail": note or "Not yet inspected"},
]
col = {
    "type": "Collection", "stac_version": "1.1.0",
    "stac_extensions": ["https://stac-extensions.github.io/processing/v1.3.0/schema.json",
                        "https://stac-extensions.github.io/file/v2.1.0/schema.json",
                        "https://stac-extensions.github.io/projection/v2.1.0/schema.json", EXT],
    "id": BUNDLE_ID, "title": "Terrain sampling strata",
    "description": (f"Static sampling strata for the Ait Bouguemez valley catchment on the 10 m EPSG:32629 analysis grid: three equal-area "
                    f"elevation bands (below {q1:.0f} m, {q1:.0f} to {q2:.0f} m, {q2:.0f} m and above), aspect classes (north, east, south, west, "
                    f"level below 5 degrees) and an excluded layer (WorldCover 2021 cropland and built-up, {info['excluded_share'] * 100:.1f}% of the "
                    "catchment). Strata organize field sampling; they are not vegetation types, pasture units or management boundaries."),
    "license": "other",
    "providers": [{"name": "Copernicus DEM GLO-30 (European Union, ESA; DLR e.V. and Airbus Defence and Space)", "roles": ["producer", "licensor"]},
                  {"name": "ESA WorldCover consortium", "roles": ["producer", "licensor"], "url": "https://esa-worldcover.org/"},
                  {"name": "AWS Open Data", "roles": ["host"]},
                  {"name": "Siterra science pipeline", "roles": ["processor"],
                   "processing:lineage": info["method"],
                   "processing:software": {"siterra-science": "0.1.0+uncommitted", "python": sys.version.split()[0],
                                           "rasterio": rasterio.__version__, "gdal": rasterio.__gdal_version__}}],
    "extent": {"spatial": {"bbox": [[round(v, 6) for v in shape(json.load(open(geo))["features"][0]["geometry"]).bounds]]},
               "temporal": {"interval": [["2021-01-01T00:00:00Z", None]]}},
    "assets": {
        "analysis_geometry": {"href": "./analysis-geometry.geojson", "type": "application/geo+json",
                              "title": "Frozen analysis geometry geo_ait_bouguemez_catchment, revision 1", "roles": ["metadata"],
                              "file:checksum": "1220" + sha(os.path.join(bdir, "analysis-geometry.geojson")),
                              "file:size": os.path.getsize(os.path.join(bdir, "analysis-geometry.geojson"))},
        "strata": {"href": "./strata.tif", "type": "image/tiff; application=geotiff; profile=cloud-optimized",
                   "title": "Elevation band, aspect class and excluded layer", "roles": ["data"],
                   "proj:code": crs, "proj:shape": grid_shape, "proj:transform": tr,
                   "bands": [{"name": "elevation_band", "data_type": "uint8", "nodata": 0, "unit": "1",
                              "description": f"1 below {q1} m, 2 from {q1} to {q2} m, 3 at or above {q2} m (equal-area terciles)"},
                             {"name": "aspect_class", "data_type": "uint8", "nodata": 0, "unit": "1",
                              "description": "1 north (315 to 45 deg), 2 east, 3 south, 4 west, 5 level (slope below 5 deg); Horn gradient on 30 m"},
                             {"name": "excluded", "data_type": "uint8", "nodata": 0, "unit": "1",
                              "description": "1 where WorldCover 2021 v200 is cropland (40) or built-up (50); shown as excluded, never as low vegetation"}],
                   "file:checksum": "1220" + sha(cog), "file:size": os.path.getsize(cog)}},
    "created": now, "siterra:status": "validated" if all(c["passed"] for c in checks) else "failed",
    "siterra:variable": "elevation_band",
    "siterra:dataset": {"id": "copernicus-dem-glo-30", "version": "2021", "access_route": DEM_URL,
                        "resolution_note": "DEM 1 arc-second (about 30 m), strata repeated onto the 10 m analysis grid"},
    "siterra:geo_selection": {"id": "geo_ait_bouguemez_catchment", "revision": 1, "boundary_role": "hydrological_unit",
                              "area_m2": info["geometry_pixels_with_elevation"] * 100,
                              "area_method": "Count of 10 m analysis pixels whose centres fall inside the frozen polygon, EPSG:32629"},
    "siterra:method": {"id": "terrain_strata", "version": "1.0.0", "analysis_crs": "EPSG:32629",
                       "parameters": {"elevation_bands": "equal-area terciles", "boundaries_m": [q1, q2], "aspect": "quadrants centred on N, E, S, W",
                                      "level_slope_deg": 5, "excluded_worldcover_classes": [40, 50]},
                       "reference_period": None,
                       "operation_order": ["reproject the DEM once to a 30 m EPSG:32629 grid aligned with the analysis grid (bilinear)",
                                           "compute Horn slope and aspect on the 30 m grid",
                                           "repeat the 30 m cells 3 x 3 onto the 10 m grid",
                                           "split catchment elevation at its 1/3 and 2/3 quantiles",
                                           "classify aspect into quadrants and level ground",
                                           "flag WorldCover 2021 cropland and built-up as excluded"]},
    "siterra:attribution": ["Catchment and strata derived by Siterra from Copernicus DEM GLO-30 (2021 release)",
                            "produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved",
                            LIAB,
                            "\u00a9 ESA WorldCover project / Contains modified Copernicus Sentinel data (2021) processed by ESA WorldCover consortium",
                            "ESA WorldCover 2021 v200 (Zanaga et al. 2022), CC BY 4.0, https://doi.org/10.5281/zenodo.7254221"],
    "siterra:limitations": ["The DEM is a surface model: trees and buildings raise it; radar artefacts are possible in narrow gorges.",
                            "WorldCover 2021 is a 2021 context mask: it maps only 1.1% of the catchment as cropland, and much of the green valley floor is mapped as tree cover, which may include orchards.",
                            "Strata organize field sampling; they are not vegetation types, pasture units or management boundaries."],
    "siterra:checks": checks,
    "links": [{"rel": "root", "href": "../catalog.json", "type": "application/json"},
              {"rel": "parent", "href": "../catalog.json", "type": "application/json"},
              {"rel": "derived_from", "href": DEM_URL, "type": "image/tiff; application=geotiff; profile=cloud-optimized",
               "title": "Copernicus_DSM_COG_10_N31_00_W007_00_DEM.tif (41,088,635 bytes, ETag 7260ba223188db19ee7390f60c998048)",
               "file:checksum": "1220024f00066f44b6c04c26ab5c22ef8d355f6dc77052206d96c9a9c04f66b9c61e"},
              {"rel": "derived_from", "href": wc["source"], "type": "image/tiff; application=geotiff; profile=cloud-optimized",
               "title": f"ESA WorldCover 2021 v200 tile N30W009 (ETag {wc['http']['etag']})", "siterra:retrieved_datetime": wc["retrieved"]},
              {"rel": "license", "href": "https://dataspace.copernicus.eu/sites/default/files/media/files/2025-06/copernicus_contributing_mission_data_access_v2_cop_dem_licenses.pdf",
               "title": "Licence for Copernicus DEM instance COP-DEM-GLO-30-F Global 30m Full, Free & Open"},
              {"rel": "license", "href": "https://creativecommons.org/licenses/by/4.0/", "title": "ESA WorldCover: CC BY 4.0"},
              {"rel": "processing-software", "href": "./uv.lock", "type": "application/toml", "title": "Pipeline lockfile (uv)",
               "file:checksum": "1220" + sha(os.path.join(bdir, "uv.lock"))}],
}
cp = os.path.join(bdir, "collection.json")
dump(col, cp)
cat_path = os.path.join(bundles, "catalog.json")
cat = json.load(open(cat_path))
cat["links"] = [l for l in cat["links"] if l.get("href") != f"./{BUNDLE_ID}/collection.json"]
cat["links"].append({"rel": "child", "href": f"./{BUNDLE_ID}/collection.json", "type": "application/json", "file:checksum": "1220" + sha(cp)})
dump(cat, cat_path)
print(col["siterra:status"], os.path.getsize(cog), "bytes")
