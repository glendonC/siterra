"""Check the DN / 10000 scaling: read one overview level of Sentinel-2 uint16 COGs by HTTP range and report DN percentiles.

Usage: python3 -I s2-dn-scale-check.py <ifd_index> <url> [<url> ...]
Used to settle the baseline 04.00 offset rule empirically: the same tile on dates either side of 2022-01-25
should show a DN shift of about +1000 if the stored DN still carries BOA_ADD_OFFSET (reflectance = DN/10000 - 0.1).
Reads every internal tile of the chosen overview (small), DEFLATE or LZW, predictor 1 or 2. Zero is no-data.
"""
import os
import struct
import sys
import zlib

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from chirps_fetch import lzw_decode, request  # noqa: E402

ifd_index = int(sys.argv[1])
for url in sys.argv[2:]:
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
    W, H, TW, TH = d[256][0], d[257][0], d[322][0], d[323][0]
    comp, pred = d[259][0], d.get(317, [1])[0]
    assert d[258][0] == 16
    vals = []
    for o, c in zip(d[324], d[325]):
        if c == 0:
            continue
        _, _, raw = request(url, rng=(o, o + c - 1))
        buf = zlib.decompress(raw) if comp in (8, 32946) else lzw_decode(raw)
        px = list(struct.unpack(bo + "%dH" % (TW * TH), buf[:TW * TH * 2]))
        if pred == 2:
            for r in range(TH):
                for k in range(1, TW):
                    px[r * TW + k] = (px[r * TW + k] + px[r * TW + k - 1]) & 0xFFFF
        vals += [v for v in px if v]
    vals.sort()
    q = lambda f: vals[int(f * (len(vals) - 1))]
    print(f"{url.rsplit('/', 2)[-2]} ifd {ifd_index} {W}x{H} comp {comp} pred {pred} n {len(vals)} "
          f"p01 {q(0.01)} p05 {q(0.05)} p50 {q(0.5)} p95 {q(0.95)} min {vals[0]}")
