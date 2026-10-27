"""Fetch CHIRPS v3.0 final monthly values for a small window from the official global COGs by HTTP range.

Usage: python3 -I chirps_fetch.py <raw_dir> <first YYYY-MM> <last YYYY-MM>
Stdlib only. For each month: HEAD the COG (size, ETag, Last-Modified), range-read the header (IFDs before data),
range-read the one 512 px full-resolution tile that holds the window, keep the tile bytes as retrieved, decode LZW,
and write a sidecar JSON with provenance and the window values. Resumable: a month whose sidecar exists is skipped.

Window: grid rows ROW0..ROW1 and cols COL0..COL1 of the 7200 x 2400 global grid (origin -180 E, 60 N, 0.05 deg,
PixelIsArea). The catchment cells are rows 564..570, cols 3469..3477; a two-cell margin is kept for map context.
Final products only: the URL path is .../v3.0/monthly/global/cogs/, never .../v3.0/prelim/....
"""
import datetime
import hashlib
import json
import os
import struct
import sys
import time
import urllib.request

BASE = "https://data.chc.ucsb.edu/products/CHIRPS/v3.0/monthly/global/cogs/"
UA = "siterra-science-pipeline/0.1 (research; contact via project repository)"
ROW0, ROW1, COL0, COL1 = 562, 572, 3467, 3479
HEADER_BYTES = 65536


def request(url, method="GET", rng=None, tries=4):
    headers = {"User-Agent": UA}
    if rng:
        headers["Range"] = f"bytes={rng[0]}-{rng[1]}"
    for k in range(tries):
        try:
            req = urllib.request.Request(url, method=method, headers=headers)
            with urllib.request.urlopen(req, timeout=120) as r:
                return r.status, dict(r.headers), r.read()
        except Exception as e:  # network hiccup: back off and retry
            if k == tries - 1:
                raise
            time.sleep(5 * (k + 1))
            last = e
    raise last


def lzw_decode(data):
    """TIFF LZW (MSB-first codes, 9 to 12 bits, early change)."""
    out = bytearray()
    table = [bytes([i]) for i in range(256)] + [b"", b""]
    width, bitpos, nbits = 9, 0, len(data) * 8
    prev = None
    while bitpos + width <= nbits:
        byte = bitpos >> 3
        chunk = int.from_bytes(data[byte:byte + 3].ljust(3, b"\0"), "big")
        code = (chunk >> (24 - (bitpos & 7) - width)) & ((1 << width) - 1)
        bitpos += width
        if code == 256:
            table = table[:258]
            width, prev = 9, None
            continue
        if code == 257:
            break
        if prev is None:
            entry = table[code]
        elif code < len(table):
            entry = table[code]
            table.append(prev + entry[:1])
        else:
            entry = prev + prev[:1]
            table.append(entry)
        out += entry
        prev = entry
        if len(table) + 1 >= (1 << width) and width < 12:
            width += 1
    return bytes(out)


def parse_ifd0(head):
    bo = "<" if head[:2] == b"II" else ">"
    assert struct.unpack(bo + "H", head[2:4])[0] == 42
    off = struct.unpack(bo + "I", head[4:8])[0]
    n = struct.unpack(bo + "H", head[off:off + 2])[0]
    sizes = {3: 2, 4: 4, 11: 4, 12: 8, 2: 1, 1: 1}
    fmts = {3: "H", 4: "I", 11: "f", 12: "d"}
    tags = {}
    for i in range(n):
        e = head[off + 2 + 12 * i: off + 14 + 12 * i]
        tag, typ, cnt = struct.unpack(bo + "HHI", e[:8])
        if typ not in sizes:
            continue
        size = sizes[typ] * cnt
        data = e[8:8 + size] if size <= 4 else head[struct.unpack(bo + "I", e[8:12])[0]:][:size]
        tags[tag] = data if typ in (1, 2) else list(struct.unpack(bo + fmts[typ] * cnt, data))
    return bo, tags


def month_range(a, b):
    y, m = map(int, a.split("-"))
    y1, m1 = map(int, b.split("-"))
    while (y, m) <= (y1, m1):
        yield y, m
        m += 1
        if m == 13:
            y, m = y + 1, 1


def fetch(raw_dir, y, m):
    name = f"chirps-v3.0.{y}.{m:02d}.cog"
    side = os.path.join(raw_dir, name + ".window.json")
    if os.path.exists(side):
        return "skip"
    url = BASE + name
    st, h, _ = request(url, "HEAD")
    size = int(h["Content-Length"])
    st, hh, head = request(url, rng=(0, HEADER_BYTES - 1))
    assert st == 206, st
    bo, t = parse_ifd0(head)
    W, H, TW, TH = t[256][0], t[257][0], t[322][0], t[323][0]
    assert (W, H, TW, TH) == (7200, 2400, 512, 512), (W, H, TW, TH)
    assert t[259][0] == 5 and t.get(317, [1])[0] == 1 and t[339][0] == 3 and t[258][0] == 32
    scale, tie = t[33550], t[33922]
    assert tie[3:5] == [-180.0, 60.0] and abs(scale[0] - 0.05) < 1e-6, (tie, scale)
    nodata = t.get(42113)
    tr0, tr1, tc0, tc1 = ROW0 // TH, ROW1 // TH, COL0 // TW, COL1 // TW
    assert tr0 == tr1 and tc0 == tc1, "window spans more than one tile"
    across = -(-W // TW)
    idx = tr0 * across + tc0
    o, c = t[324][idx], t[325][idx]
    st, th, tile = request(url, rng=(o, o + c - 1))
    assert st == 206 and len(tile) == c
    # etag must not change between requests within one month
    assert th.get("ETag") == h.get("ETag"), (th.get("ETag"), h.get("ETag"))
    raw = lzw_decode(tile)
    assert len(raw) == TW * TH * 4, len(raw)
    vals = struct.unpack(bo + "%df" % (TW * TH), raw)
    window = []
    for r in range(ROW0, ROW1 + 1):
        rr = r - tr0 * TH
        window.append([vals[rr * TW + (cc - tc0 * TW)] for cc in range(COL0, COL1 + 1)])
    tile_path = os.path.join(raw_dir, f"{name}.tile_r{tr0}_c{tc0}.lzw")
    with open(tile_path, "wb") as f:
        f.write(tile)
    rec = {
        "dataset": "CHIRPS v3.0 monthly, final, global COG",
        "period_id": f"period_{y}-{m:02d}",
        "url": url,
        "http": {"content_length": size, "etag": h.get("ETag"), "last_modified": h.get("Last-Modified")},
        "retrieved_datetime": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "header_range": [0, HEADER_BYTES - 1],
        "header_sha256": hashlib.sha256(head).hexdigest(),
        "tile": {"ifd": 0, "row": tr0, "col": tc0, "index": idx, "byte_range": [o, o + c - 1], "bytes": c,
                 "file": os.path.basename(tile_path), "sha256": hashlib.sha256(tile).hexdigest()},
        "geotiff": {"width": W, "height": H, "tile": [TW, TH], "compression": "LZW", "predictor": 1,
                    "sample": "float32", "pixel_scale": scale[:2], "tiepoint": tie[3:5],
                    "gdal_nodata_tag": None if nodata is None else bytes(nodata).decode(errors="replace")},
        "window": {"row0": ROW0, "row1": ROW1, "col0": COL0, "col1": COL1,
                   "west": -180 + COL0 * 0.05, "north": 60 - ROW0 * 0.05, "cell_deg": 0.05,
                   "order": "rows north to south, cols west to east", "unit_assumed": "mm per month",
                   "values": window},
    }
    with open(side + ".tmp", "w") as f:
        json.dump(rec, f)
    os.replace(side + ".tmp", side)
    return c


if __name__ == "__main__":
    raw_dir, a, b = sys.argv[1:4]
    os.makedirs(raw_dir, exist_ok=True)
    for y, m in month_range(a, b):
        r = fetch(raw_dir, y, m)
        print(f"{y}-{m:02d} {r}", flush=True)
        if r != "skip":
            time.sleep(0.5)
