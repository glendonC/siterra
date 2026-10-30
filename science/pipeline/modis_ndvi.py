"""MOD13Q1 v6.1 NDVI windows and growing-season greenness, shared by the long-record bundle builders.

Reads the windows and sidecars that modis-fetch.py wrote, checks each window against its sidecar checksum, and computes
the per-pixel season mean G(p, y, W) of the registered long-record recipes.
"""
import datetime
import hashlib
import json
import math
import os

import numpy as np
import rasterio

import modis_record

NDVI_ASSET, REL_ASSET = "250m_16_days_NDVI", "250m_16_days_pixel_reliability"
DN_MIN, DN_MAX = -2000, 10000
MODIS_CITATION = ("Didan, K. (2021). MODIS/Terra Vegetation Indices 16-Day L3 Global 250m SIN Grid V061. NASA Land Processes "
                  "Distributed Active Archive Center. https://doi.org/10.5067/MODIS/MOD13Q1.061. Tile {tile}, {first} to {last}, "
                  "read from Microsoft Planetary Computer, accessed {date}")


def calendar_periods(year, months):
    """MODIS 16-day composite periods (start days of year 1, 17, ..., 353) whose start date falls in one of months."""
    out = []
    for doy in range(1, 366, 16):
        d = datetime.date(year, 1, 1) + datetime.timedelta(days=doy - 1)
        if d.year == year and d.month in months:
            out.append((f"A{year}{doy:03d}", d.isoformat()))
    return out


def load_modis(raw):
    rec_name, rec = modis_record.search_record(raw)
    sidecars = {}
    for iid in rec["kept"]:
        side = json.load(open(os.path.join(raw, iid + ".json")))
        sidecars[iid.split(".")[1]] = side
    return rec, rec_name, sidecars


def grid_of(sidecars):
    """The common window grid of every stored NDVI and reliability window; raises if any differs."""
    ref = None
    for side in sidecars.values():
        for a in (NDVI_ASSET, REL_ASSET):
            g = (tuple(side["assets"][a]["transform"]), side["assets"][a]["window"]["width"], side["assets"][a]["window"]["height"])
            if ref is None:
                ref = g
            elif g != ref:
                raise SystemExit(f"window grid differs for {side['item_id']} {a}")
    first = next(iter(sidecars.values()))
    return rasterio.Affine(*ref[0]), (ref[2], ref[1]), first["crs_wkt"]


def read_windows(raw, sidecars):
    arrays, scales = {}, set()
    for key, side in sidecars.items():
        an, ar = side["assets"][NDVI_ASSET], side["assets"][REL_ASSET]
        with rasterio.open(os.path.join(raw, an["file"])) as s:
            n = s.read(1)
        with rasterio.open(os.path.join(raw, ar["file"])) as s:
            r = s.read(1)
        if hashlib.sha256(np.ascontiguousarray(n).tobytes()).hexdigest() != an["values_sha256"]:
            raise SystemExit(f"stored NDVI window of {side['item_id']} does not match its sidecar checksum")
        if hashlib.sha256(np.ascontiguousarray(r).tobytes()).hexdigest() != ar["values_sha256"]:
            raise SystemExit(f"stored reliability window of {side['item_id']} does not match its sidecar checksum")
        scales.add((an["dtype"], an["nodata"], an["scale"], ar["dtype"], ar["nodata"]))
        arrays[key] = (n, r)
    return arrays, scales


def season_ndvi(arrays, periods, kept, min_share):
    """Per-pixel mean of kept NDVI over the season's periods; NaN where fewer than ceil(len(periods) * min_share) kept."""
    need = math.ceil(len(periods) * min_share)
    s = c = None
    for key, _ in periods:
        if key not in arrays:
            continue
        n, r = arrays[key]
        ok = np.isin(r, kept) & (n >= DN_MIN) & (n <= DN_MAX)
        v = np.where(ok, n.astype(np.float64) / 10000.0, 0.0)
        s = v if s is None else s + v
        c = ok.astype(np.int32) if c is None else c + ok
    if s is None:
        return None
    with np.errstate(invalid="ignore", divide="ignore"):
        return np.where(c >= need, s / np.maximum(c, 1), np.nan)
