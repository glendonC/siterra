"""Build the public globe assets in data/map/globe/ from the outputs of globe-relief.py and globe-rangeland.py.

Usage: python -I map-globe.py <globe_interim_dir> <out_dir>
Inputs in <globe_interim_dir>: relief-elevation-0p04.tif (GLO-90, int16 m, 9000 x 4500), relief-hillshade-8192x4096.png,
relief-hillshade-4096x2048.png, relief.json, rangeland-fraction-0p25.png, biome-0p25.tif.
Writes:
  dots-elevation-0p08-4500x2250.int16le.bin.gz  dot grid: mean elevation of each 2 x 2 block of the 0.04 degree grid,
                                                int16 little-endian metres, rows north to south (ocean 0 m)
  dots-land-0p08-4500x2250.uint8.bin.gz         share of the block's four cells that are land (non-zero), 0 to 255
  relief-hillshade-8192x4096.png, relief-hillshade-4096x2048.png  copied, checked against relief.json
  rangeland-fraction-0p25.png                   copied (share of each 0.25 degree cell in the rangeland biomes)
  rangeland-biome-0p25.png                      dominant rangeland biome per cell (WWF biome 7 to 13, 0 none), 8-bit grey
The gzip streams carry no file name or time, so a rebuild is byte-identical. Prints each output's size and SHA-256.
"""
import gzip
import hashlib
import io
import json
import os
import shutil
import struct
import sys
import zlib

import numpy as np
import rasterio

src, out = sys.argv[1:3]
os.makedirs(out, exist_ok=True)
sha = lambda p: hashlib.sha256(open(p, "rb").read()).hexdigest()


def gz(data, path):
    buf = io.BytesIO()
    with gzip.GzipFile(filename="", mode="wb", fileobj=buf, mtime=0, compresslevel=9) as g:
        g.write(data)
    open(path, "wb").write(buf.getvalue())


def png_grey8(a, path):
    h, w = a.shape
    raw = b"".join(b"\x00" + a[y].astype(np.uint8).tobytes() for y in range(h))
    chunk = lambda t, d: struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)
    open(path, "wb").write(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 0, 0, 0, 0))
                           + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b""))


with rasterio.open(os.path.join(src, "relief-elevation-0p04.tif")) as s:
    e = s.read(1).astype(np.int32)
H, W = e.shape
blocks = e.reshape(H // 2, 2, W // 2, 2)
# mean of the four cells, rounded down (floor of the sum divided by 4), as in the globe's reference tool
elev = (blocks.sum(axis=(1, 3)) // 4).astype("<i2")
land = ((blocks != 0).sum(axis=(1, 3)) * 255 // 4).astype(np.uint8)
gz(elev.tobytes(), os.path.join(out, f"dots-elevation-0p08-{W // 2}x{H // 2}.int16le.bin.gz"))
gz(land.tobytes(), os.path.join(out, f"dots-land-0p08-{W // 2}x{H // 2}.uint8.bin.gz"))

rel = json.load(open(os.path.join(src, "relief.json")))
recorded = json.dumps(rel)
for name in ("relief-hillshade-8192x4096.png", "relief-hillshade-4096x2048.png"):
    assert sha(os.path.join(src, name)) in recorded, (name, "sha256 not in relief.json")
    shutil.copyfile(os.path.join(src, name), os.path.join(out, name))
shutil.copyfile(os.path.join(src, "rangeland-fraction-0p25.png"), os.path.join(out, "rangeland-fraction-0p25.png"))
with rasterio.open(os.path.join(src, "biome-0p25.tif")) as s:
    png_grey8(s.read(1), os.path.join(out, "rangeland-biome-0p25.png"))

for name in sorted(os.listdir(out)):
    p = os.path.join(out, name)
    print(f"{name}  {os.path.getsize(p)}  {sha(p)}")
