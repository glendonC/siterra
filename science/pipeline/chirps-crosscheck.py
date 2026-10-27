"""Independent cross-check of the global-COG window against the CHIRPS v3.0 Africa GeoTIFF for one month.

Usage: python3 -I chirps-crosscheck.py <window.json> <YYYY> <MM> [prelim]
The Africa file is strip-organized (RowsPerStrip 1, LZW), origin -20 E, 40 N, 0.05 deg, IFD at the end of the file.
Reads only the IFD and the strips for the window rows, decodes them and compares cell by cell.
Also inspects the stored global tile for no-data values (ocean cells) to report how no-data is encoded.
"""
import json
import os
import struct
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from chirps_fetch import lzw_decode, request  # noqa: E402

win_path, y, m = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
tree = "prelim/monthly/global/tifs" if len(sys.argv) > 4 else "monthly/africa/tifs"
url = f"https://data.chc.ucsb.edu/products/CHIRPS/v3.0/{tree}/chirps-v3.0.{y}.{m:02d}.tif"
w = json.load(open(win_path))
win = w["window"]

st, h, _ = request(url, "HEAD")
size = int(h["Content-Length"])
st, _, head = request(url, rng=(0, 15))
bo = "<" if head[:2] == b"II" else ">"
ifd_off = struct.unpack(bo + "I", head[4:8])[0]
st, _, ifd = request(url, rng=(ifd_off, min(size - 1, ifd_off + 4095)))
n = struct.unpack(bo + "H", ifd[:2])[0]
tags = {}
for i in range(n):
    e = ifd[2 + 12 * i: 14 + 12 * i]
    tag, typ, cnt = struct.unpack(bo + "HHI", e[:8])
    tags[tag] = (typ, cnt, e[8:12])


def values(tag):
    typ, cnt, inline = tags[tag]
    fmt = {3: "H", 4: "I", 11: "f", 12: "d"}[typ]
    sz = struct.calcsize(fmt) * cnt
    if sz <= 4:
        data = inline[:sz]
    else:
        off = struct.unpack(bo + "I", inline)[0]
        _, _, data = request(url, rng=(off, off + sz - 1))
    return list(struct.unpack(bo + fmt * cnt, data))


W, H = values(256)[0], values(257)[0]
scale, tie = values(33550), values(33922)
rps = values(278)[0]
offs, cnts = values(273), values(279)
comp, pred = values(259)[0], values(317)[0] if 317 in tags else 1
nodata = None
if 42113 in tags:
    typ, cnt, inline = tags[42113]
    nodata = inline[:cnt] if cnt <= 4 else request(url, rng=(struct.unpack(bo + "I", inline)[0], struct.unpack(bo + "I", inline)[0] + cnt - 1))[2]
print("africa", url, "size", size, "etag", h.get("ETag"), "dims", W, H, "rps", rps, "comp", comp, "pred", pred,
      "tie", tie[3:5], "scale", scale[:2], "nodata tag", nodata)
assert rps == 1 and comp == 5 and pred == 1
west, north = win["west"], win["north"]
c0 = round((west - tie[3]) / 0.05)
r0 = round((tie[4] - north) / 0.05)
ncols = win["col1"] - win["col0"] + 1
maxdiff = 0.0
for k, row in enumerate(win["values"]):
    r = r0 + k
    _, _, strip = request(url, rng=(offs[r], offs[r] + cnts[r] - 1))
    vals = struct.unpack(bo + "%df" % W, lzw_decode(strip)[:W * 4])
    other = vals[c0:c0 + ncols]
    maxdiff = max(maxdiff, max(abs(a - b) for a, b in zip(row, other)))
print("cells compared", len(win["values"]) * ncols, "max abs difference mm", round(maxdiff, 4))

tile = lzw_decode(open(os.path.join(os.path.dirname(win_path), w["tile"]["file"]), "rb").read())
tv = struct.unpack("<%df" % (512 * 512), tile)
neg = sorted(set(v for v in tv if v < 0))
print("global tile: min", min(tv), "max", max(tv), "distinct negative values", neg[:5], "count", sum(1 for v in tv if v < 0))
