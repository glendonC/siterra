"""Write data/map/manifest.json: every file under data/map/ with its size and SHA-256, grouped by layer, with each layer's
label, source, licence file and credit line.

Usage: python -I map-manifest.py <map_dir>
The README and the manifest itself are not listed. layers_total_bytes counts the layer files only;
licences_total_bytes counts the licence notices. A file outside the known layer folders stops the build.
"""
import datetime
import hashlib
import json
import os
import sys

LAYERS = {
    "globe-relief": {"files": ("globe/relief-hillshade-8192x4096.png", "globe/relief-hillshade-4096x2048.png"),
                     "label": "Relief", "status": "display only",
                     "source": "Copernicus DEM GLO-90 (AWS copernicus-dem-90m), coarsest overviews averaged to 0.04 degree; hillshade azimuth 315, altitude 45 degrees, vertical exaggeration 10",
                     "licence": "licences/copernicus-dem-glo-90.md",
                     "credit": "Relief: produced using Copernicus WorldDEM™-90 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved"},
    "globe-dots": {"files": ("globe/dots-elevation-0p08-4500x2250.int16le.bin.gz", "globe/dots-land-0p08-4500x2250.uint8.bin.gz"),
                   "label": "Relief dots (dot size by elevation)", "status": "display only",
                   "source": "Copernicus DEM GLO-90, the 0.04 degree grid of the globe relief averaged over 2 x 2 cells to 0.08 degree",
                   "licence": "licences/copernicus-dem-glo-90.md",
                   "credit": "Relief: produced using Copernicus WorldDEM™-90 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved"},
    "rangeland-biomes": {"files": ("globe/rangeland-fraction-0p25.png", "globe/rangeland-biome-0p25.png"),
                         "label": "Rangeland biomes, potential extent (Rangelands Atlas method)", "status": "preliminary",
                         "source": "RESOLVE Ecoregions 2017, WWF biomes 7 to 13 without Rock and Ice, rasterized at 0.01 degree and averaged to 0.25 degree",
                         "licence": "licences/resolve-ecoregions-2017.md",
                         "credit": "Ecoregions 2017 (c) Resolve, CC BY 4.0"},
    "valley-terrain": {"prefix": "terrain/",
                       "label": "Valley terrain (Terrarium-encoded elevation tiles, 512 px WebP, z0 to z12)", "status": "display only",
                       "source": "Mapterhorn planet.pmtiles (version 0.0.13), from Copernicus DEM GLO-30, unchanged tiles: zooms 0 to 12 for the asset extent -6.71,31.33,-5.98,31.92, and zooms 0 to 11 for one more ring of z11 tiles around it (-7.0312,31.0529,-5.8008,32.1012)",
                       "licence": "licences/copernicus-dem-glo-30-mapterhorn.md",
                       "credit": "© Mapterhorn (https://mapterhorn.com/attribution/); Produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved"},
    "valley-imagery": {"files": ("imagery/truecolour-summer-2025-3857.webp", "imagery/truecolour-summer-2025-3857.webp.json"),
                       "label": "Summer true colour (Sentinel-2, July and August 2025)", "status": "display only",
                       "source": "Copernicus Sentinel-2 L2A, five summer 2025 dates, per-pixel median of B04, B03, B02 at 30 m, fixed display stretch, warped to EPSG:3857 over the asset extent -6.71,31.33,-5.98,31.92; the .json gives the four corners for a MapLibre image source",
                       "licence": "licences/copernicus-sentinel.md",
                       "credit": "Contains modified Copernicus Sentinel data 2025"},
}
SKIP = {"README.md", "manifest.json"}

root = sys.argv[1]
sha = lambda p: hashlib.sha256(open(p, "rb").read()).hexdigest()
found = sorted(os.path.relpath(os.path.join(d, f), root) for d, _, fs in os.walk(root) for f in fs)
assigned, layers = set(), {}
for key, L in LAYERS.items():
    files = [f for f in found if f.startswith(L["prefix"])] if "prefix" in L else list(L["files"])
    for f in files:
        assert f in found, ("missing", f)
    assigned.update(files)
    entry = {k: v for k, v in L.items() if k not in ("files", "prefix")}
    entry["files"] = [{"path": f, "bytes": os.path.getsize(os.path.join(root, f)), "sha256": sha(os.path.join(root, f))} for f in files]
    entry["bytes"] = sum(x["bytes"] for x in entry["files"])
    layers[key] = entry
licences = [f for f in found if f.startswith("licences/")]
assigned.update(licences)
rest = [f for f in found if f not in assigned and f not in SKIP]
assert not rest, ("files outside the known layers", rest)
man = {"bundle": "siterra-map", "version": 1, "created": datetime.datetime.now().astimezone().isoformat(timespec="seconds"),
       "layers": layers,
       "licences": [{"path": f, "bytes": os.path.getsize(os.path.join(root, f)), "sha256": sha(os.path.join(root, f))} for f in licences],
       "layers_total_bytes": sum(L["bytes"] for L in layers.values()),
       "licences_total_bytes": sum(os.path.getsize(os.path.join(root, f)) for f in licences)}
json.dump(man, open(os.path.join(root, "manifest.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
for k, L in layers.items():
    print(k, len(L["files"]), "files", L["bytes"], "bytes")
print("layers", man["layers_total_bytes"], "licences", man["licences_total_bytes"])
