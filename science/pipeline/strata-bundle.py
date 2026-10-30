"""Write the sampling-strata bundle: a STAC Collection whose assets are static layers (no Items, no periods).

Usage: python -I strata-bundle.py <place.json> <repo_root> <strata_dir> <worldcover_dir> <lockfile> <bundles_dir> [--inspected=<note.txt>]
       [--computed=<YYYY-MM-DDTHH:MM:SSZ>]
The bundle id, geometry, CRS, DEM source and limitations come from the place configuration (bundle_terrain_strata_<placeId>).
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

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import place_config  # noqa: E402

EXT = "https://siterra.invalid/schemas/stac/siterra/1.0.0/schema.json"
LIAB = "The organisations in charge of the Copernicus programme by law or by delegation do not incur any liability for any use of the Copernicus WorldDEM-30"


def sha(p):
    return hashlib.sha256(open(p, "rb").read()).hexdigest()


def dump(o, p):
    with open(p, "w") as f:
        json.dump(o, f, indent=1, ensure_ascii=False)
        f.write("\n")


place, repo, sdir, wdir, lock, bundles = sys.argv[1:7]
cfg = place_config.load(place, repo)
geo = place_config.geometry_path(cfg)
BUNDLE_ID = f"bundle_terrain_strata_{cfg['placeId']}"
CRS = cfg["analysisCrs"]
GRID_M = cfg["analysisGridM"]
GEO = cfg["geometry"]
DEM_URL = cfg["elevation"]["url"]
DEM_FILE = DEM_URL.rsplit("/", 1)[1]
computed = [a.split("=", 1)[1] for a in sys.argv if a.startswith("--computed=")]
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
now = computed[0] if computed else datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
q1, q2 = info["elevation_band_boundaries_m"]
WZ = info.get("water_zone")  # terrain_strata 1.1.0: band 4 and its parameters when the place configuration has strata.waterZone
METHOD_VERSION = next(r["version"] for r in json.load(open(os.path.join(repo, "science/recipes/registry.json")))["recipes"] if r["recipeId"] == "terrain_strata")  # the registry's: a place without a water zone has three bands under 1.1.0, water_zone none
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
    "description": (f"Static sampling strata for the {cfg['title']} on the {GRID_M} m {CRS} analysis grid: three equal-area "
                    f"elevation bands (below {q1:.0f} m, {q1:.0f} to {q2:.0f} m, {q2:.0f} m and above), aspect classes (north, east, south, west, "
                    f"level below 5 degrees) and an excluded layer (WorldCover 2021 cropland and built-up, {info['excluded_share'] * 100:.1f}% of the "
                    "catchment)" + (f", and a reservoir zone (the {WZ['selection'].replace('_', ' ')} of WorldCover permanent water plus {WZ['buffer_m']} m, {WZ['zone_share'] * 100:.1f}% of the catchment)" if WZ else "")
                    + ". Strata organize field sampling; they are not vegetation types, pasture units or management boundaries."),
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
                              "title": f"Frozen analysis geometry {GEO['id']}, revision {GEO['revision']}", "roles": ["metadata"],
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
                              "description": "1 where WorldCover 2021 v200 is cropland (40) or built-up (50); shown as excluded, never as low vegetation"},
                             *([{"name": "reservoir_zone", "data_type": "uint8", "nodata": 0, "unit": "1",
                                 "description": f"1 within {WZ['buffer_m']} m of the {WZ['selection'].replace('_', ' ')} of the WorldCover 2021 v200 classes {WZ['worldcover_classes']} inside the catchment, 2 elsewhere inside the catchment"}] if WZ else [])],
                   "file:checksum": "1220" + sha(cog), "file:size": os.path.getsize(cog)}},
    "created": now, "siterra:status": "validated" if all(c["passed"] for c in checks) else "failed",
    "siterra:variable": "elevation_band",
    "siterra:dataset": {"id": "copernicus-dem-glo-30", "version": "2021", "access_route": DEM_URL,
                        "resolution_note": "DEM 1 arc-second (about 30 m), strata repeated onto the 10 m analysis grid"},
    "siterra:geo_selection": {"id": GEO["id"], "revision": GEO["revision"], "boundary_role": GEO["boundaryRole"],
                              "area_m2": info["geometry_pixels_with_elevation"] * GRID_M * GRID_M,
                              "area_method": f"Count of {GRID_M} m analysis pixels whose centres fall inside the frozen polygon, {CRS}"},
    "siterra:method": {"id": "terrain_strata", "version": METHOD_VERSION, "analysis_crs": CRS,
                       "parameters": {"elevation_bands": "equal-area terciles", "boundaries_m": [q1, q2], "aspect": "quadrants centred on N, E, S, W",
                                      "level_slope_deg": 5, "excluded_worldcover_classes": [40, 50],
                                      **({"water_zone": {"worldcover_classes": WZ["worldcover_classes"], "buffer_m": WZ["buffer_m"], "selection": WZ["selection"]}} if WZ else {})},
                       "reference_period": None,
                       "operation_order": [f"reproject the DEM once to a {cfg['elevation']['gridM']} m {CRS} grid aligned with the analysis grid (bilinear)",
                                           "compute Horn slope and aspect on the 30 m grid",
                                           "repeat the 30 m cells 3 x 3 onto the 10 m grid",
                                           "split catchment elevation at its 1/3 and 2/3 quantiles",
                                           "classify aspect into quadrants and level ground",
                                           "flag WorldCover 2021 cropland and built-up as excluded",
                                           *([f"mark cells within {WZ['buffer_m']} m of the {WZ['selection'].replace('_', ' ')} of the WorldCover water classes {WZ['worldcover_classes']} as the reservoir zone (band 4)"] if WZ else [])]},
    "siterra:attribution": ["Catchment and strata derived by Siterra from Copernicus DEM GLO-30 (2021 release)",
                            "produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved",
                            LIAB,
                            "\u00a9 ESA WorldCover project / Contains modified Copernicus Sentinel data (2021) processed by ESA WorldCover consortium",
                            "ESA WorldCover 2021 v200 (Zanaga et al. 2022), CC BY 4.0, https://doi.org/10.5281/zenodo.7254221"],
    "siterra:limitations": cfg["strata"]["limitations"],
    "siterra:checks": checks,
    "links": [{"rel": "root", "href": "../catalog.json", "type": "application/json"},
              {"rel": "parent", "href": "../catalog.json", "type": "application/json"},
              {"rel": "derived_from", "href": DEM_URL, "type": "image/tiff; application=geotiff; profile=cloud-optimized",
               "title": f"{DEM_FILE} ({cfg['elevation']['bytes']:,} bytes, ETag {cfg['elevation']['etag']})",
               "file:checksum": "1220" + cfg["elevation"]["sha256"]},
              {"rel": "derived_from", "href": wc["source"], "type": "image/tiff; application=geotiff; profile=cloud-optimized",
               "title": f"ESA WorldCover 2021 v200 tile {wc['source'].rsplit('_', 2)[1]} (ETag {wc['http']['etag']})", "siterra:retrieved_datetime": wc["retrieved"]},
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
# child links sorted by bundle id, so a rebuild changes only what changed
cat["links"] = [l for l in cat["links"] if l["rel"] != "child"] + sorted((l for l in cat["links"] if l["rel"] == "child"), key=lambda l: l["href"])
dump(cat, cat_path)
print(col["siterra:status"], os.path.getsize(cog), "bytes")
