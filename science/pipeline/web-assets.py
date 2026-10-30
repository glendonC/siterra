"""Add web-ready derived assets to four committed bundles and repair the checksums of the links that point at them.

Usage: python -I web-assets.py <bundles_dir> <bundle id | all> [--cell-metres=<n>]
The GeoTIFFs stay the canonical assets; these are copies a browser can read without a GeoTIFF decoder or a sinusoidal reprojection:
  bundle_pixel_trend_long_record  pixel-trend-mar_jun-cells.json    every MODIS 250 m cell with a March to June Theil-Sen slope as a
                                                                    quadrilateral in EPSG:32629 (sinusoidal corners, pyproj, 0.1 m)
  bundle_relief                   elevation-surface.bin + .json     little-endian float32 grid as the GeoTIFF holds it, with a JSON header
  bundle_land_cover               land-cover.png + .json            indexed PNG, palette index = class code, index 0 transparent, with a header
  bundle_terrain_strata           elevation-band.png + .json        indexed PNG of band 1, index = band 1 to 3, index 0 transparent, with a header
Each derived file is read back and compared with the GeoTIFF before it is listed; a difference stops the run. Running the script again on
a bundle that already has the assets replaces them with identical bytes. After the assets are added, every collection that links to a
changed collection gets the new file:checksum on that link (to a fixed point), and so does the catalog.
"""
import hashlib
import json
import os
import struct  # noqa: F401
import sys

import numpy as np
import rasterio
from PIL import Image
from pyproj import Transformer

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bundle_common as bc  # noqa: E402

TREND, RELIEF, COVER, STRATA = ("bundle_pixel_trend_long_record_ait_bouguemez", "bundle_relief_ait_bouguemez",
                                "bundle_land_cover_ait_bouguemez", "bundle_terrain_strata_ait_bouguemez")
NOTE = " Web-ready derived assets ({names}) are copies of the canonical GeoTIFF values written by science/pipeline/web-assets.py."
PALETTE = {0: (0, 0, 0), 1: (31, 119, 180), 2: (255, 127, 14), 3: (44, 160, 44), 10: (0, 100, 0), 20: (255, 187, 34), 30: (255, 255, 76),
           40: (240, 150, 255), 50: (250, 0, 0), 60: (180, 180, 180), 80: (0, 100, 200)}
SIN2LL = None


def sha(p):
    return hashlib.sha256(open(p, "rb").read()).hexdigest()


def grid_header(src, dtype, extra):
    return {"crs": src.crs.to_string(), "transform": list(src.transform)[:6], "shape": [src.height, src.width], "dtype": dtype,
            "origin": "top left corner of the top left cell; row 0 is north", **extra}


def drop_assets(col, keys):
    for k in keys:
        a = col["assets"].pop(k, None)
        if a:
            p = os.path.join(col["_dir"], a["href"])
            if os.path.exists(p):
                os.remove(p)


def add_asset(col, key, name, mime, title, **extra):
    col["assets"][key] = bc.plain_asset(col["_dir"], name, mime, title, ["data"], **extra)


def finish(col, names):
    lin = [p for p in col["providers"] if "processor" in p["roles"]][0]
    base = lin["processing:lineage"].split(" Web-ready derived assets")[0]
    lin["processing:lineage"] = base + NOTE.format(names=", ".join(names))
    d = col.pop("_dir")
    bc.dump(col, os.path.join(d, "collection.json"))


def load(bundles, bid):
    d = os.path.join(bundles, bid)
    col = json.load(open(os.path.join(d, "collection.json")))
    col["_dir"] = d
    return col


def do_trend(bundles):
    col = load(bundles, TREND)
    drop_assets(col, ["trend_cells"])
    tif = os.path.join(col["_dir"], "pixel-trend-mar_jun.tif")
    summary = json.load(open(os.path.join(col["_dir"], "pixel-trend-long-record.json")))
    with rasterio.open(tif) as r:
        assert r.descriptions[0] == "theil_sen_slope_per_decade"
        slope, tr = r.read(1), r.transform
        sin2ll = Transformer.from_crs(r.crs, "EPSG:4326", always_xy=True)
    to_utm = Transformer.from_crs("EPSG:4326", "EPSG:32629", always_xy=True)
    rows, cols = np.nonzero(np.isfinite(slope))
    cells = []
    for rr, cc in zip(rows, cols):
        xs = [tr.c + cc * tr.a, tr.c + (cc + 1) * tr.a, tr.c + (cc + 1) * tr.a, tr.c + cc * tr.a]
        ys = [tr.f + rr * tr.e, tr.f + rr * tr.e, tr.f + (rr + 1) * tr.e, tr.f + (rr + 1) * tr.e]
        lon, lat = sin2ll.transform(xs, ys)
        e, n = to_utm.transform(lon, lat)
        cells.append([int(rr), int(cc)] + [round(float(v), 1) for pair in zip(e, n) for v in pair] + [round(float(slope[rr, cc]), 5)])
    back = np.array([c[-1] for c in cells])
    assert len(cells) == int(np.isfinite(slope).sum()) and np.array_equal(back, np.round(slope[rows, cols].astype(np.float64), 5))
    disp = summary["display"]
    doc = {"source_asset": "pixel_trend_mar_jun", "source_sha256": sha(tif), "band": "1 theil_sen_slope_per_decade",
           "units": summary["units"]["pixel_trend_per_decade"], "window": "March to June", "period": [2000, 2025],
           "crs": "EPSG:32629", "cell_corners": "MODIS sinusoidal pixel corners (231.66 m) to lon/lat to EPSG:32629 (pyproj), metres to 0.1",
           "display_scale": {"domain_per_decade": disp["domain_per_decade"], "neutral_per_decade": disp["neutral_per_decade"], "color_scale": disp["color_scale"]},
           "count": len(cells), "median_slope_per_decade": round(float(np.median(slope[rows, cols])), 5),
           "fields": ["row", "col", "E0", "N0", "E1", "N1", "E2", "N2", "E3", "N3", "slope_per_decade"],
           "verified": "the 5 decimal slope of every cell equals the GeoTIFF value at its row and column; the count equals the finite cells of band 1",
           "cells": cells}
    bc.dump(doc, os.path.join(col["_dir"], "pixel-trend-mar_jun-cells.json"), compact=True)
    add_asset(col, "trend_cells", "pixel-trend-mar_jun-cells.json", "application/json",
              "March to June Theil-Sen slope of every MODIS 250 m cell as a quadrilateral in EPSG:32629 (web copy of pixel_trend_mar_jun)")
    finish(col, ["pixel-trend-mar_jun-cells.json"])


def do_relief(bundles):
    col = load(bundles, RELIEF)
    drop_assets(col, ["elevation_surface_bin", "elevation_surface_bin_header"])
    tif = os.path.join(col["_dir"], "elevation-surface.tif")
    with rasterio.open(tif) as r:
        z = r.read(1).astype("<f4")
        head = grid_header(r, "float32", {"byte_order": "little", "nodata": float(r.nodata), "unit": "m above the EGM2008 geoid"})
    p = os.path.join(col["_dir"], "elevation-surface.bin")
    open(p, "wb").write(z.tobytes())
    with rasterio.open(tif) as r:
        assert np.array_equal(np.fromfile(p, dtype="<f4").reshape(z.shape), r.read(1))
    head.update({"source_asset": "elevation_surface", "source_sha256": sha(tif), "verified": "every value equals the GeoTIFF value"})
    bc.dump(head, os.path.join(col["_dir"], "elevation-surface.bin.json"))
    add_asset(col, "elevation_surface_bin", "elevation-surface.bin", "application/octet-stream",
              "Elevation surface as a little-endian float32 grid, row 0 north (web copy of elevation_surface)")
    add_asset(col, "elevation_surface_bin_header", "elevation-surface.bin.json", "application/json", "Header of elevation-surface.bin: CRS, transform, shape, nodata")
    finish(col, ["elevation-surface.bin"])


def indexed_png(arr, path, codes):
    pal = []
    for i in range(256):
        pal += list(PALETTE.get(i, (128, 128, 128)))
    im = Image.fromarray(arr.astype(np.uint8), mode="P")
    im.putpalette(pal)
    im.save(path, "PNG", optimize=True, transparency=0)
    back = np.array(Image.open(path))
    assert back.dtype == np.uint8 and np.array_equal(back, arr)
    return {str(c): list(PALETTE[c]) for c in codes}


def do_indexed(bundles, bid, tif_name, band, png_name, key, source_key, title, codes, unit_note):
    col = load(bundles, bid)
    drop_assets(col, [key, key + "_header"])
    tif = os.path.join(col["_dir"], tif_name)
    with rasterio.open(tif) as r:
        arr = r.read(band)
        head = grid_header(r, "uint8", {"nodata": 0})
    present = sorted(int(v) for v in np.unique(arr) if v != 0)
    assert all(c in PALETTE for c in present), present
    pal = indexed_png(arr, os.path.join(col["_dir"], png_name), present)
    head.update({"format": "indexed PNG, 8 bit, palette index = value, index 0 transparent (nodata)", "values": unit_note,
                 "palette_rgb": pal, "source_asset": source_key, "source_sha256": sha(tif), "source_band": band,
                 "verified": "the decoded PNG indices equal the GeoTIFF values cell for cell"})
    bc.dump(head, os.path.join(col["_dir"], png_name + ".json"))
    add_asset(col, key, png_name, "image/png", title)
    add_asset(col, key + "_header", png_name + ".json", "application/json", f"Header of {png_name}: CRS, transform, shape, palette")
    finish(col, [png_name])


def do_cover(bundles):
    do_indexed(bundles, COVER, "land-cover.tif", 1, "land-cover.png", "land_cover_png", "land_cover",
               "WorldCover 2021 class codes as an indexed PNG (web copy of land_cover)", [10, 20, 30, 40, 50, 60, 80],
               {"10": "tree cover", "20": "shrubland", "30": "grassland", "40": "cropland", "50": "built-up", "60": "bare or sparse vegetation", "80": "permanent water"})


def do_strata(bundles):
    do_indexed(bundles, STRATA, "strata.tif", 1, "elevation-band.png", "elevation_band_png", "strata",
               "Elevation band 1 to 3 as an indexed PNG (web copy of band 1 of strata)", [1, 2, 3],
               {"1": "elevation band 1 (low)", "2": "elevation band 2 (mid)", "3": "elevation band 3 (high)"})


def relink(bundles):
    """Set every collection-to-collection link checksum, and the catalog's, to the current file checksums, to a fixed point."""
    cols = {}
    for name in sorted(os.listdir(bundles)):
        p = os.path.join(bundles, name, "collection.json")
        if name.startswith("bundle_") and os.path.exists(p):
            cols[name] = p
    changed = set()
    for _ in range(len(cols) + 1):
        moved = False
        for bid, p in cols.items():
            c = json.load(open(p))
            edit = False
            for l in c["links"]:
                h = l.get("href", "")
                if h.startswith("../") and h.endswith("/collection.json") and "file:checksum" in l:
                    want = "1220" + sha(cols[h.split("/")[1]])
                    if l["file:checksum"] != want:
                        l["file:checksum"], edit = want, True
            if edit:
                bc.dump(c, p)
                changed.add(bid)
                moved = True
        if not moved:
            break
    cp = os.path.join(bundles, "catalog.json")
    cat = json.load(open(cp))
    for l in cat["links"]:
        if l["rel"] == "child":
            want = "1220" + sha(cols[l["href"].split("/")[1]])
            if l["file:checksum"] != want:
                l["file:checksum"] = want
    bc.dump(cat, cp)
    return sorted(changed)


def main():
    bundles, which = sys.argv[1:3]
    todo = {"trend": do_trend, "relief": do_relief, "land_cover": do_cover, "strata": do_strata}
    for k in (todo if which == "all" else [which]):
        todo[k](bundles)
        print("derived assets written for", k)
    print("links repaired in", relink(bundles))


if __name__ == "__main__":
    main()
