"""Pixel-paired DN difference between two Sentinel-2 COGs of the same tile and acquisition. Stdlib only.

Usage: python3 -I s2-pair-diff.py <ifd_index> <url_a> <url_b>
Reads the same overview level from both, decodes every internal tile, and reports the distribution of b - a over
pixels valid (non-zero) in both. A shift near +1000 means b still carries BOA_ADD_OFFSET and a does not.
"""
import os
import struct
import sys
import zlib

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from chirps_fetch import request  # noqa: E402


def read(url, ifd_index):
    _, _, head = request(url, rng=(0, 65535))
    bo = "<" if head[:2] == b"II" else ">"
    off = struct.unpack(bo + "I", head[4:8])[0]
    ifds = []
    while off:
        n = struct.unpack(bo + "H", head[off:off + 2])[0]
        tags = {}
        for i in range(n):
            e = head[off + 2 + 12 * i: off + 14 + 12 * i]
            tag, typ, cnt = struct.unpack(bo + "HHI", e[:8])
            fmt = {3: "H", 4: "I", 16: "Q"}.get(typ)
            if fmt is None:
                continue
            sz = struct.calcsize(fmt) * cnt
            data = e[8:8 + sz] if sz <= 4 else head[struct.unpack(bo + "I", e[8:12])[0]:][:sz]
            tags[tag] = list(struct.unpack(bo + fmt * cnt, data))
        ifds.append(tags)
        off = struct.unpack(bo + "I", head[off + 2 + 12 * n: off + 6 + 12 * n])[0]
    d = ifds[ifd_index]
    TW, TH, pred = d[322][0], d[323][0], d.get(317, [1])[0]
    assert d[259][0] in (8, 32946) and d[258][0] == 16
    tiles = []
    for o, c in zip(d[324], d[325]):
        if c == 0:
            tiles.append(None)
            continue
        _, _, raw = request(url, rng=(o, o + c - 1))
        px = list(struct.unpack(bo + "%dH" % (TW * TH), zlib.decompress(raw)[:TW * TH * 2]))
        if pred == 2:
            for r in range(TH):
                for k in range(1, TW):
                    px[r * TW + k] = (px[r * TW + k] + px[r * TW + k - 1]) & 0xFFFF
        tiles.append(px)
    return (d[256][0], d[257][0]), tiles


ifd = int(sys.argv[1])
(sa, ta), (sb, tb) = read(sys.argv[2], ifd), read(sys.argv[3], ifd)
assert sa == sb, (sa, sb)
diffs = []
for a, b in zip(ta, tb):
    if a is None or b is None:
        continue
    diffs += [y - x for x, y in zip(a, b) if x and y]
diffs.sort()
q = lambda f: diffs[int(f * (len(diffs) - 1))]
print(f"a {sys.argv[2].rsplit('/', 2)[-2]}  b {sys.argv[3].rsplit('/', 2)[-2]}  pixels {len(diffs)}")
print(f"  b - a: p05 {q(0.05)} p25 {q(0.25)} p50 {q(0.5)} p75 {q(0.75)} p95 {q(0.95)}; share within +-50: "
      f"{sum(1 for v in diffs if -50 <= v <= 50) / len(diffs):.3f}; share within 1000+-50: "
      f"{sum(1 for v in diffs if 950 <= v <= 1050) / len(diffs):.3f}")
