"""Extract the valley terrain tiles (Terrarium-encoded WebP, 512 px) from the Mapterhorn planet archive into a z/x/y
folder, by HTTP range requests and the PMTiles version 3 format. Standard library only; no pmtiles CLI.

Usage: python -I map-terrain.py <archive_url> <min_lon,min_lat,max_lon,max_lat> <max_zoom> <out_dir> [--check=<tile_url_template>]
Reads the archive header and directories (gzip), finds every tile of zoom 0 to max_zoom that touches the box, and
writes <out_dir>/<z>/<x>/<y>.webp unchanged. Writes <out_dir>/tiles.json: archive URL, header fields, the box, and
per tile its size and SHA-256. With --check, each tile is also fetched from the given z/x/y URL template and must be
byte-identical, which checks the directory reading. Resumable: tiles already written are read back, not fetched.
"""
import gzip
import hashlib
import json
import math
import os
import struct
import sys
import urllib.request

UA = "siterra-science-pipeline/0.1 (map terrain extract)"


def get(url, start=None, length=None):
    h = {"User-Agent": UA}
    if start is not None:
        h["Range"] = f"bytes={start}-{start + length - 1}"
    for k in range(5):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=h), timeout=90) as r:
                body = r.read()
                if start is not None:
                    assert r.status == 206 and len(body) == length, (r.status, len(body), length)
                return body
        except (OSError, AssertionError):
            if k == 4:
                raise


def varint(b, i):
    v = s = 0
    while True:
        c = b[i]
        i += 1
        v |= (c & 0x7F) << s
        if c < 0x80:
            return v, i
        s += 7


def directory(b):
    n, i = varint(b, 0)
    ids, runs, lens, offs = [], [], [], []
    last = 0
    for _ in range(n):
        d, i = varint(b, i)
        last += d
        ids.append(last)
    for _ in range(n):
        v, i = varint(b, i)
        runs.append(v)
    for _ in range(n):
        v, i = varint(b, i)
        lens.append(v)
    for k in range(n):
        v, i = varint(b, i)
        offs.append(offs[k - 1] + lens[k - 1] if (v == 0 and k > 0) else v - 1)
    return list(zip(ids, runs, lens, offs))


def rotate(n, x, y, rx, ry):
    if ry == 0:
        if rx != 0:
            x, y = n - 1 - x, n - 1 - y
        return y, x
    return x, y


def tile_id(z, x, y):
    acc = ((1 << (2 * z)) - 1) // 3
    a = z - 1
    while a >= 0:
        s = 1 << a
        rx, ry = s & x, s & y
        acc += ((3 * (1 if rx else 0)) ^ (1 if ry else 0)) << (2 * a)
        x, y = rotate(s, x, y, rx, ry)
        a -= 1
    return acc


def lonlat_to_tile(lon, lat, z):
    n = 1 << z
    x = int((lon + 180.0) / 360.0 * n)
    r = math.radians(lat)
    y = int((1.0 - math.asinh(math.tan(r)) / math.pi) / 2.0 * n)
    return min(max(x, 0), n - 1), min(max(y, 0), n - 1)


def main():
    pos = [a for a in sys.argv[1:] if not a.startswith("--")]
    url, box, maxz, out = pos[0], [float(v) for v in pos[1].split(",")], int(pos[2]), pos[3]
    check = next((a.split("=", 1)[1] for a in sys.argv if a.startswith("--check=")), None)
    head = get(url, 0, 127)
    assert head[:7] == b"PMTiles" and head[7] == 3, "not a PMTiles v3 archive"
    f = struct.unpack("<11Q", head[8:96])
    hdr = dict(zip(("root_offset", "root_length", "metadata_offset", "metadata_length", "leaf_offset", "leaf_length",
                    "data_offset", "data_length", "addressed_tiles", "tile_entries", "tile_contents"), f))
    hdr.update(dict(zip(("clustered", "internal_compression", "tile_compression", "tile_type", "min_zoom", "max_zoom"), head[96:102])))
    assert hdr["internal_compression"] == 2, "expects gzip directories"
    cache = {}

    def dirat(off, length):
        if (off, length) not in cache:
            cache[(off, length)] = directory(gzip.decompress(get(url, off, length)))
        return cache[(off, length)]

    def find(tid):
        entries = dirat(hdr["root_offset"], hdr["root_length"])
        for _ in range(4):
            lo, hi = 0, len(entries) - 1
            best = None
            while lo <= hi:
                mid = (lo + hi) // 2
                if entries[mid][0] <= tid:
                    best, lo = entries[mid], mid + 1
                else:
                    hi = mid - 1
            if best is None:
                return None
            eid, run, length, off = best
            if run == 0:
                entries = dirat(hdr["leaf_offset"] + off, length)
                continue
            return (hdr["data_offset"] + off, length) if tid < eid + run else None
        return None

    rows = []
    for z in range(maxz + 1):
        x0, y0 = lonlat_to_tile(box[0], box[3], z)
        x1, y1 = lonlat_to_tile(box[2], box[1], z)
        for x in range(x0, x1 + 1):
            for y in range(y0, y1 + 1):
                p = os.path.join(out, str(z), str(x), f"{y}.webp")
                if os.path.exists(p):
                    body = open(p, "rb").read()
                else:
                    loc = find(tile_id(z, x, y))
                    assert loc, ("tile not in archive", z, x, y)
                    body = get(url, *loc)
                    assert body[:4] == b"RIFF" and body[8:12] == b"WEBP", ("not WebP", z, x, y)
                    if check:
                        ref = get(check.format(z=z, x=x, y=y))
                        assert ref == body, ("differs from the tile server", z, x, y)
                    os.makedirs(os.path.dirname(p), exist_ok=True)
                    open(p + ".tmp", "wb").write(body)
                    os.replace(p + ".tmp", p)
                rows.append({"z": z, "x": x, "y": y, "bytes": len(body), "sha256": hashlib.sha256(body).hexdigest()})
        print(f"z{z}: {sum(1 for r in rows if r['z'] == z)} tiles", flush=True)
    json.dump({"archive": url, "header": hdr, "bbox": box, "max_zoom": maxz, "checked_against": check,
               "tiles": len(rows), "bytes": sum(r["bytes"] for r in rows), "rows": rows}, open(os.path.join(out, "tiles.json"), "w"), indent=1)
    print(len(rows), "tiles,", sum(r["bytes"] for r in rows), "bytes")


if __name__ == "__main__":
    main()
