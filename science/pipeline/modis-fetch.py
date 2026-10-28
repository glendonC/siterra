"""Fetch windows of MODIS Terra products over a place's geometry from Microsoft Planetary Computer, anonymously.

Usage: python -I modis-fetch.py <place.json> <repo_root> <product> <raw_dir> <first YYYY-MM-DD> <last YYYY-MM-DD> [--workers=4]
  product   mod13q1 (MOD13Q1 v6.1: 16-day NDVI and pixel reliability, 250 m) or mod10a1 (MOD10A1 v6.1: daily NDSI snow
            cover, 500 m)

Search: the Planetary Computer STAC API, collection modis-13Q1-061 or modis-10A1-061, bbox of the place geometry,
Terra only: the MOD product prefix of the item ID (the collections also hold Aqua, MYD), and the platform property
when an item carries one. Items of the same tile and date are deduplicated: the newest
production timestamp (last part of the item ID) is kept and the others are recorded as dropped.
Read: each asset COG is signed with an anonymous SAS token for its storage container and read through GDAL by HTTP range
for a window that covers the geometry with a two-pixel margin. One HEAD per asset records size, ETag, Last-Modified and
Content-MD5. Each window is stored as a small GeoTIFF with a sidecar JSON (item ID, asset URL without token, HTTP
validators, window, transform, SHA-256 of the window values, retrieval time). Resumable: an item whose sidecar exists is
skipped. Prints counts only; no statistic of the values.
"""
import datetime
import hashlib
import json
import os
import sys
import threading
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed

import numpy as np
import rasterio
from rasterio.warp import transform_bounds
from rasterio.windows import Window, from_bounds

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import place_config  # noqa: E402

API = "https://planetarycomputer.microsoft.com/api/stac/v1"
SAS = "https://planetarycomputer.microsoft.com/api/sas/v1/token"
UA = "siterra-science-pipeline/0.1 (research; contact via project repository)"
PRODUCTS = {
    "mod13q1": {"collection": "modis-13Q1-061", "prefix": "MOD13Q1",
                "assets": ["250m_16_days_NDVI", "250m_16_days_pixel_reliability"]},
    "mod10a1": {"collection": "modis-10A1-061", "prefix": "MOD10A1",
                "assets": ["NDSI_Snow_Cover"]},
}
MARGIN_PX = 2
_tokens = {}
_lock = threading.Lock()


def now():
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def http(url, body=None, method=None, tries=6):
    data = None if body is None else json.dumps(body).encode()
    headers = {"User-Agent": UA}
    if data is not None:
        headers["Content-Type"] = "application/json"
    for k in range(tries):
        try:
            req = urllib.request.Request(url, data=data, headers=headers, method=method)
            with urllib.request.urlopen(req, timeout=120) as r:
                return r.status, dict(r.headers), r.read()
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503, 504) and k < tries - 1:
                time.sleep(int(e.headers.get("Retry-After", 0) or 0) or 5 * (k + 1))
                continue
            raise
        except (urllib.error.URLError, TimeoutError, ConnectionError):
            if k == tries - 1:
                raise
            time.sleep(5 * (k + 1))


def token(account, container):
    key = (account, container)
    with _lock:
        t = _tokens.get(key)
        if t is None or datetime.datetime.fromisoformat(t["msft:expiry"].replace("Z", "+00:00")) - datetime.datetime.now(datetime.timezone.utc) < datetime.timedelta(minutes=5):
            _, _, b = http(f"{SAS}/{account}/{container}")
            t = json.loads(b)
            _tokens[key] = t
        return t["token"]


def sign(href):
    account = href.split("//")[1].split(".")[0]
    container = href.split("/")[3]
    return href + "?" + token(account, container)


def search(collection, bbox, first, last):
    """Every item of the collection over bbox in [first, last], searched year by year, following next links."""
    out = []
    y0, y1 = int(first[:4]), int(last[:4])
    for y in range(y0, y1 + 1):
        a = max(first, f"{y}-01-01")
        b = min(last, f"{y}-12-31")
        body = {"collections": [collection], "bbox": bbox, "datetime": f"{a}T00:00:00Z/{b}T23:59:59Z", "limit": 1000}
        url = f"{API}/search"
        while True:
            _, _, raw = http(url, body)
            page = json.loads(raw)
            out.extend(page["features"])
            nxt = [l for l in page.get("links", []) if l.get("rel") == "next"]
            if not nxt:
                break
            url = nxt[0]["href"]
            body = nxt[0].get("body") or body
            if nxt[0].get("method", "POST") == "GET":
                body = None
        time.sleep(0.5)
    return out


def dedupe(items, prefix):
    keep, dropped = {}, []
    for it in items:
        # Some Planetary Computer items carry no platform property; the MOD product prefix is Terra.
        if it["properties"].get("platform", "terra") != "terra" or not it["id"].startswith(prefix + "."):
            continue
        _, adate, tile, _, prod = it["id"].split(".")
        key = (tile, adate)
        if key in keep:
            old = keep[key]
            if prod > old["id"].split(".")[4]:
                dropped.append(old["id"])
                keep[key] = it
            else:
                dropped.append(it["id"])
        else:
            keep[key] = it
    return sorted(keep.values(), key=lambda i: i["id"]), sorted(dropped)


def window_for(src, geom_bounds):
    b = transform_bounds("EPSG:4326", src.crs, *geom_bounds, densify_pts=41)
    w = from_bounds(*b, transform=src.transform)
    c0 = max(0, int(np.floor(w.col_off)) - MARGIN_PX)
    r0 = max(0, int(np.floor(w.row_off)) - MARGIN_PX)
    c1 = min(src.width, int(np.ceil(w.col_off + w.width)) + MARGIN_PX)
    r1 = min(src.height, int(np.ceil(w.row_off + w.height)) + MARGIN_PX)
    return Window(c0, r0, c1 - c0, r1 - r0)


def fetch_item(item, assets, out_dir, geom_bounds):
    side = os.path.join(out_dir, item["id"] + ".json")
    if os.path.exists(side):
        return "skip"
    rec = {"item_id": item["id"], "collection": item["collection"], "platform": item["properties"].get("platform"),
           "start_datetime": item["properties"].get("start_datetime"), "end_datetime": item["properties"].get("end_datetime"),
           "item_url": f"{API}/collections/{item['collection']}/items/{item['id']}",
           "item_created": item["properties"].get("created"), "assets": {}}
    for key in assets:
        a = item["assets"].get(key)
        if a is None:
            rec["assets"][key] = {"missing": True}
            continue
        href = a["href"]
        for attempt in range(4):
            try:
                url = sign(href)
                st, h, _ = http(url, method="HEAD")
                with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", GDAL_HTTP_MAX_RETRY="4", GDAL_HTTP_RETRY_DELAY="3"):
                    with rasterio.open("/vsicurl/" + url) as src:
                        w = window_for(src, geom_bounds)
                        arr = src.read(1, window=w)
                        wt = src.window_transform(w)
                        crs = src.crs.to_wkt()
                        nodata = src.nodata
                        dtype = src.dtypes[0]
                        scale = src.scales[0]
                        offset = src.offsets[0]
                        full_shape = [src.height, src.width]
                break
            except urllib.error.HTTPError as e:
                if e.code == 403 and attempt < 3:
                    with _lock:
                        _tokens.clear()
                    continue
                raise
            except rasterio.errors.RasterioIOError:
                if attempt == 3:
                    raise
                with _lock:
                    _tokens.clear()
                time.sleep(5 * (attempt + 1))
        tif = os.path.join(out_dir, f"{item['id']}.{key}.tif")
        prof = {"driver": "GTiff", "width": arr.shape[1], "height": arr.shape[0], "count": 1, "dtype": dtype, "crs": crs,
                "transform": wt, "compress": "deflate", "nodata": nodata}
        with rasterio.open(tif + ".tmp", "w", **prof) as o:
            o.write(arr, 1)
        os.replace(tif + ".tmp", tif)
        rec["assets"][key] = {
            "href": href, "file": os.path.basename(tif),
            "http": {"content_length": int(h.get("Content-Length", 0)) or None, "etag": h.get("ETag"),
                     "last_modified": h.get("Last-Modified"), "content_md5": h.get("Content-MD5")},
            "window": {"col_off": int(w.col_off), "row_off": int(w.row_off), "width": int(w.width), "height": int(w.height)},
            "full_shape": full_shape, "transform": list(wt)[:6], "dtype": dtype, "nodata": nodata, "scale": scale, "offset": offset,
            "values_sha256": hashlib.sha256(np.ascontiguousarray(arr).tobytes()).hexdigest(),
            "retrieved_datetime": now()}
    rec["crs_wkt"] = crs if rec["assets"] else None
    with open(side + ".tmp", "w") as f:
        json.dump(rec, f, indent=1)
    os.replace(side + ".tmp", side)
    return "ok"


def main():
    place, repo, product, raw, first, last = sys.argv[1:7]
    workers = int(next((a.split("=", 1)[1] for a in sys.argv if a.startswith("--workers=")), "4"))
    spec = PRODUCTS[product]
    cfg = place_config.load(place, repo)
    bounds = list(place_config.geometry(cfg).bounds)
    out_dir = os.path.join(raw, spec["collection"])
    os.makedirs(os.path.join(out_dir, "items"), exist_ok=True)
    items = search(spec["collection"], bounds, first, last)
    kept, dropped = dedupe(items, spec["prefix"])
    for it in kept:
        p = os.path.join(out_dir, "items", it["id"] + ".json")
        if not os.path.exists(p):
            it["siterra_retrieved_datetime"] = now()
            with open(p, "w") as f:
                json.dump(it, f)
    run = {"product": product, "collection": spec["collection"], "bbox": bounds, "first": first, "last": last,
           "searched": len(items), "kept": [it["id"] for it in kept], "dropped_duplicates": dropped, "searched_at": now(),
           "place_config_sha256": cfg["_sha256"]}
    with open(os.path.join(out_dir, f"search-{first}-{last}.json"), "w") as f:
        json.dump(run, f, indent=1)
    print(f"searched {len(items)} items, kept {len(kept)} terra items, dropped {len(dropped)} duplicates", flush=True)
    done = skipped = failed = 0
    with ThreadPoolExecutor(max_workers=workers) as ex:
        futs = {ex.submit(fetch_item, it, spec["assets"], out_dir, bounds): it["id"] for it in kept}
        for fu in as_completed(futs):
            try:
                r = fu.result()
                done += r == "ok"
                skipped += r == "skip"
            except Exception as e:  # recorded, the run continues; a rerun retries the item
                failed += 1
                print(f"FAILED {futs[fu]}: {type(e).__name__}: {str(e)[:200]}", flush=True)
            n = done + skipped + failed
            if n % 50 == 0:
                print(f"{n}/{len(kept)} fetched {done} skipped {skipped} failed {failed}", flush=True)
    print(f"done: fetched {done} skipped {skipped} failed {failed} of {len(kept)}", flush=True)
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
