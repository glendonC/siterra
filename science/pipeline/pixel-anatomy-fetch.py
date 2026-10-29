"""Choose the Sentinel-2 scene for one MODIS pixel and read its band windows: the only network reads of pixel_anatomy.

Usage: python -I pixel-anatomy-fetch.py <place.json> <repo_root> <pixel_id> <interim_root> <out_dir>

Follows the registered pixel_anatomy 1.0.0 recipe. The candidate scenes are the Earth Search items the science lane
cached for the pixel's Sentinel-2 tile and the configured month (<interim_root>/s2-monthly/items). For each one on the
configured relative orbit the scene classification (SCL) window over the pixel's display window is read from the public
sentinel-cogs bucket; the scene with data over every footprint cell and the largest share of footprint cells with SCL 4 or
5 is chosen, ties by the latest date. Its B02, B03, B04, B05, B06, B07, B08, B8A, B11, B12 and SCL windows are written to
<out_dir> as read (no rescaling) together with scene-record.json: every candidate's share, the item's properties, and each
extract's address, window and sha256. <out_dir> must not exist.
"""
import datetime
import glob
import hashlib
import json
import os
import re
import sys

import numpy as np
import rasterio
import rasterio.windows
from rasterio.transform import Affine

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pixel_anatomy as pa  # noqa: E402
import place_config  # noqa: E402

ENV = dict(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", GDAL_HTTP_MAX_RETRY="6", GDAL_HTTP_RETRY_DELAY="3",
           GDAL_HTTP_TIMEOUT="90", GDAL_HTTP_CONNECTTIMEOUT="20", GDAL_HTTP_MULTIRANGE="YES",
           GDAL_HTTP_MERGE_CONSECUTIVE_RANGES="YES", CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".tif")
ASSETS = [("blue", "B02"), ("green", "B03"), ("red", "B04"), ("rededge1", "B05"), ("rededge2", "B06"), ("rededge3", "B07"),
          ("nir", "B08"), ("nir08", "B8A"), ("swir16", "B11"), ("swir22", "B12"), ("scl", "SCL")]
HOST = "https://sentinel-cogs.s3.us-west-2.amazonaws.com/"


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def read_window(href, x0, y0, H, W):
    """The window of a UTM 29N COG that covers the display window (x0, y0 is its upper left corner, H x W 10 m cells)."""
    with rasterio.open("/vsicurl/" + href) as s:
        assert s.crs.to_epsg() == 32629
        res = abs(s.transform.a)
        col_off, row_off = (x0 - s.transform.c) / res, (s.transform.f - y0) / res
        assert col_off == int(col_off) and row_off == int(row_off), (href, col_off, row_off)
        w, h = int(W * 10 // res), int(H * 10 // res)
        arr = s.read(1, window=rasterio.windows.Window(int(col_off), int(row_off), w, h))
        return arr, res, [s.height, s.width], {"col_off": int(col_off), "row_off": int(row_off), "width": w, "height": h}


def main():
    place, repo, pid, interim, out_dir = sys.argv[1:6]
    if os.path.exists(out_dir):
        raise SystemExit(f"{out_dir} exists; it must not")
    cfg = place_config.load(place, repo)
    pc = cfg["recipes"]["pixel_anatomy"]
    pcfg = next(p for p in pc["pixels"] if p["id"] == pid) if any(p["id"] == pid for p in pc["pixels"]) else None
    sc = pc["scene"]
    h, v, trow, tcol = pa.parse_pixel_id(pid)
    trend = os.path.join(cfg["_repo"], "data/bundles", pc["trendBundle"]["bundle"], pc["trendBundle"]["grid"])
    with rasterio.open(trend) as t:
        mtr, mcrs = t.transform, t.crs
    ox, oy = pa.lattice_offset(mtr)
    if min(ox, 1 - ox) > 1e-3 or min(oy, 1 - oy) > 1e-3:
        raise SystemExit("the trend grid is not on the MODIS tile lattice")
    brow, bcol = pa.bundle_index(mtr, h, v, trow, tcol)
    atr, ashape, _ = place_config.analysis_grid(cfg)
    rows, cols = pa.cells_in_footprint(atr, ashape, mtr, mcrs, cfg["analysisCrs"], brow, bcol)
    r0, r1, c0, c1 = pa.display_window(rows, cols, 1)
    H, W = r1 - r0, c1 - c0
    x0, y0 = atr.c + c0 * atr.a, atr.f + r0 * atr.e
    inside = np.zeros((H, W), bool)
    inside[rows - r0, cols - c0] = True
    print(f"pixel {pid}: bundle row {brow} column {bcol}, {len(rows)} footprint cells, display window {H} x {W} at {x0}, {y0}")

    month = sc["month"].replace("-", "")
    items = sorted(glob.glob(os.path.join(interim, sc["itemsFolder"], f"*_{sc['tile']}_{month}*_L2A.json")))
    if not items:
        raise SystemExit("no cached items for the tile and month")
    cands, by_id = [], {}
    with rasterio.Env(**ENV):
        for p in items:
            it = json.load(open(p))
            pr = it["properties"]
            orbit = "R" + re.search(r"_R(\d{3})_", pr["s2:product_uri"]).group(1)
            rec = {"id": it["id"], "date": pr["datetime"][:10], "orbit": orbit, "cloud_cover": pr["eo:cloud_cover"],
                   "nodata_percent": pr["s2:nodata_pixel_percentage"], "cells": int(inside.sum())}
            if orbit == sc["relativeOrbit"]:
                scl20, _, _, _ = read_window(it["assets"]["scl"]["href"], x0, y0, H, W)
                scl = np.repeat(np.repeat(scl20, 2, axis=0), 2, axis=1)
                rec["cells_with_data"] = int((scl[inside] > 0).sum())
                rec["clear_share"] = round(float(np.isin(scl[inside], [4, 5]).mean()), 6)
            else:
                rec["cells_with_data"], rec["clear_share"] = None, None
            cands.append(rec)
            by_id[it["id"]] = (p, it)
        on_orbit = [c for c in cands if c["orbit"] == sc["relativeOrbit"]]
        chosen = pa.choose_scene(on_orbit, sc["relativeOrbit"])
        item_path, item = by_id[chosen["id"]]
        print("chosen", chosen["id"], f"clear share {chosen['clear_share']}", f"of {len(on_orbit)} scenes on {sc['relativeOrbit']}")
        os.makedirs(out_dir)
        records = []
        red_href = item["assets"]["red"]["href"]
        assert red_href.startswith(HOST) and red_href.endswith("/B04.tif")
        for key, name in ASSETS:
            href = item["assets"][key]["href"]
            assert href == red_href[: -len("B04.tif")] + f"{name}.tif", (href, name)
            arr, res, cog_shape, win = read_window(href, x0, y0, H, W)
            path = os.path.join(out_dir, f"{item['id']}_{name}.tif")
            profile = dict(driver="GTiff", width=win["width"], height=win["height"], count=1, dtype=arr.dtype, crs="EPSG:32629",
                           transform=Affine(res, 0, x0, 0, -res, y0), nodata=0, compress="deflate")
            with rasterio.open(path, "w", **profile) as o:
                o.write(arr, 1)
                o.update_tags(source_href=href, scene_id=item["id"], band=name,
                              window=f"col_off={win['col_off']} row_off={win['row_off']} width={win['width']} height={win['height']}")
            records.append({"scene_id": item["id"], "band": name, "asset_key": key, "href": href, "resolution_m": res,
                            "cog_shape": cog_shape, "window": win, "dtype": str(arr.dtype), "zero_dn_cells": int((arr == 0).sum()),
                            "extract": os.path.basename(path), "extract_bytes": os.path.getsize(path), "extract_sha256": sha256(path)})
            print(name, win, records[-1]["extract_sha256"][:16])
    pr = item["properties"]
    out = {
        "pixel": pid, "read_utc": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "display_window": {"crs": "EPSG:32629", "origin_x": x0, "origin_y": y0, "rows": H, "cols": W, "analysis_grid_row0": r0,
                           "analysis_grid_col0": c0, "cell_m": 10},
        "scene_rule": {"tile": sc["tile"], "month": sc["month"], "relative_orbit": sc["relativeOrbit"],
                       "rule": "largest share of footprint cells with SCL 4 or 5 among scenes on the orbit with data over every footprint cell; ties by the latest date",
                       "candidates": cands, "chosen": chosen["id"]},
        "stac_item": {"sha256": sha256(item_path), "id": item["id"],
                      "self": f"https://earth-search.aws.element84.com/v1/collections/sentinel-2-l2a/items/{item['id']}",
                      "cached_by_science_lane_utc": item.get("siterra_retrieved_datetime"),
                      "properties": {k: pr.get(k) for k in ("datetime", "platform", "s2:processing_baseline", "s2:product_uri",
                                                            "eo:cloud_cover", "earthsearch:boa_offset_applied", "view:sun_elevation",
                                                            "view:sun_azimuth", "view:incidence_angle", "s2:nodata_pixel_percentage")},
                      "eo_bands": {n: item["assets"][k].get("eo:bands") for k, n in ASSETS if k != "scl"}},
        "extracts": records,
    }
    with open(os.path.join(out_dir, "scene-record.json"), "w") as f:
        json.dump(out, f, indent=1)
        f.write("\n")


if __name__ == "__main__":
    main()
