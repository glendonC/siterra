"""Global rangeland-biome fraction on a 0.25 degree grid from RESOLVE Ecoregions 2017 (Rangelands Atlas method).

Usage: python -I globe-rangeland.py <Ecoregions2017.zip> <out_dir>
Selection (Rangelands Atlas 2021, used by the UNCCD 2024 report): WWF biomes 7 to 13 (tropical and subtropical, temperate,
flooded and montane grasslands, savannas and shrublands; tundra; Mediterranean forests, woodlands and scrub; deserts and
xeric shrublands), excluding the ecoregion "Rock and Ice" (coded biome 11). Polygons are rasterized at 0.01 degree
(pixel centre), then block-averaged to 0.25 degree, so each cell holds the fraction of its area in those biomes.
Areas use the spherical cell area at each latitude. Reads the shapefile with a minimal stdlib parser (polygon records only).
Writes rangeland-fraction-0p25.tif (uint8 percent, 1440 x 720, EPSG:4326), rangeland-fraction-0p25.png (greyscale texture),
biome-0p25.tif (dominant rangeland biome per cell, 0 none) and globe.json (totals, checks).
"""
import io
import json
import math
import os
import struct
import sys
import zipfile

import numpy as np
import rasterio
import rasterio.features
from affine import Affine
from PIL import Image
from shapely.geometry import Polygon, MultiPolygon, mapping

BIOMES = {7: "Tropical and subtropical grasslands, savannas and shrublands", 8: "Temperate grasslands, savannas and shrublands",
          9: "Flooded grasslands and savannas", 10: "Montane grasslands and shrublands", 11: "Tundra",
          12: "Mediterranean forests, woodlands and scrub", 13: "Deserts and xeric shrublands"}
R = 6371007.181


def read_dbf(b):
    n, hlen, rlen = struct.unpack("<IHH", b[4:12])
    fields, off = [], 32
    while b[off] != 0x0D:
        name = b[off:off + 11].split(b"\0")[0].decode()
        fields.append((name, b[off + 11:off + 12].decode(), b[off + 16]))
        off += 32
    rows = []
    for i in range(n):
        rec = b[hlen + i * rlen: hlen + (i + 1) * rlen]
        p, row = 1, {}
        for name, typ, ln in fields:
            raw = rec[p:p + ln].decode("latin-1").strip()
            row[name] = (float(raw) if raw else None) if typ in "NF" else raw
            p += ln
        rows.append(row)
    return rows


def read_shp(b):
    off, shapes = 100, []
    while off < len(b):
        _, clen = struct.unpack(">ii", b[off:off + 8])
        rec = b[off + 8: off + 8 + clen * 2]
        off += 8 + clen * 2
        st = struct.unpack("<i", rec[:4])[0]
        if st == 0:
            shapes.append(None)
            continue
        assert st in (5, 15, 25), st
        nparts, npts = struct.unpack("<ii", rec[36:44])
        parts = list(struct.unpack("<%di" % nparts, rec[44:44 + 4 * nparts])) + [npts]
        pts = np.frombuffer(rec[44 + 4 * nparts: 44 + 4 * nparts + 16 * npts], dtype="<f8").reshape(-1, 2)
        rings = [pts[parts[k]:parts[k + 1]] for k in range(nparts)]
        shapes.append(rings)
    return shapes


def ring_area(r):
    x, y = r[:, 0], r[:, 1]
    return 0.5 * float(np.sum(x[:-1] * y[1:] - x[1:] * y[:-1]))


def to_geom(rings):
    # shapefile: outer rings clockwise (negative signed area here), holes counter-clockwise
    polys = []
    for r in rings:
        if len(r) < 4:
            continue
        if ring_area(r) < 0:
            polys.append([r, []])
        elif polys:
            polys[-1][1].append(r)
    return MultiPolygon([Polygon(o, h) for o, h in polys]) if polys else None


zp, out = sys.argv[1:3]
os.makedirs(out, exist_ok=True)
z = zipfile.ZipFile(zp)
names = {os.path.splitext(n)[1].lower(): n for n in z.namelist() if not n.startswith("__")}
rows = read_dbf(z.read(names[".dbf"]))
shapes = read_shp(z.read(names[".shp"]))
assert len(rows) == len(shapes)
licences = sorted({r.get("LICENSE") for r in rows})
sel = [(to_geom(s), int(r["BIOME_NUM"])) for r, s in zip(rows, shapes)
       if s is not None and r.get("BIOME_NUM") is not None and int(r["BIOME_NUM"]) in BIOMES and r["ECO_NAME"] != "Rock and Ice"]
sel = [(g, b) for g, b in sel if g is not None]
feats = [(mapping(g), b) for g, b in sel]
fine = 0.01
W, H = 36000, 18000
tr = Affine(fine, 0, -180, 0, -fine, 90)
k = 25  # 0.01 -> 0.25 degree
frac = np.zeros((H // k, W // k), np.float32)
dom = np.zeros((H // k, W // k, len(BIOMES)), np.float32)
band_rows = 1800  # process 18 degree latitude bands to bound memory
for r0 in range(0, H, band_rows):
    btr = Affine(fine, 0, -180, 0, -fine, 90 - r0 * fine)
    arr = rasterio.features.rasterize(feats, out_shape=(band_rows, W), transform=btr,
                                      fill=0, dtype="uint8", all_touched=False)
    blk = arr.reshape(band_rows // k, k, W // k, k)
    frac[r0 // k:(r0 + band_rows) // k] = (blk > 0).mean(axis=(1, 3))
    for i, b in enumerate(BIOMES):
        dom[r0 // k:(r0 + band_rows) // k, :, i] = (blk == b).mean(axis=(1, 3))
    print("band", r0, flush=True)
lat_n = 90 - np.arange(H // k) * 0.25
cell_km2 = (R * R * math.radians(0.25) * (np.sin(np.radians(lat_n)) - np.sin(np.radians(lat_n - 0.25))) / 1e6)[:, None]
total_km2 = float((frac * cell_km2).sum())
by_biome = {BIOMES[b]: round(float((dom[:, :, i] * cell_km2).sum()) / 1e6, 2) for i, b in enumerate(BIOMES)}
pct = np.round(frac * 100).astype(np.uint8)
dominant = np.where(frac > 0, np.array(list(BIOMES))[dom.argmax(axis=2)], 0).astype(np.uint8)
gtr = Affine(0.25, 0, -180, 0, -0.25, 90)
prof = dict(driver="GTiff", width=1440, height=720, count=1, dtype="uint8", crs="EPSG:4326", transform=gtr, compress="deflate")
with rasterio.open(os.path.join(out, "rangeland-fraction-0p25.tif"), "w", nodata=255, **prof) as o:
    o.write(pct, 1)
with rasterio.open(os.path.join(out, "biome-0p25.tif"), "w", nodata=0, **prof) as o:
    o.write(dominant, 1)
Image.fromarray((pct.astype(np.float32) * 2.55).astype(np.uint8)).save(os.path.join(out, "rangeland-fraction-0p25.png"))
info = {"selected_ecoregions": len(sel), "records": len(rows), "licence_values_in_dbf": licences,
        "total_rangeland_biome_area_million_km2": round(total_km2 / 1e6, 2), "by_biome_million_km2": by_biome,
        "atlas_reference_million_km2": 79.51, "grid": "0.25 degree, 1440 x 720, EPSG:4326, rows north to south",
        "method": "rasterize selected ecoregion polygons at 0.01 degree (pixel centre), block mean to 0.25 degree; spherical cell areas"}
json.dump(info, open(os.path.join(out, "globe.json"), "w"), indent=1)
print(json.dumps(info, indent=1))
