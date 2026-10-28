"""Independent rerun of one restrend_long_record season, for the recompute_sample_period check.

Shares no reading or aggregation code with restrend-bundle.py. For each composite period of the season it signs the
asset URLs with a fresh anonymous Planetary Computer SAS token, reads the full-tile COG windows again through GDAL and
compares their SHA-256 with the stored windows. The season mean is then computed with numpy masked arrays, resampled
onto the 10 m analysis grid by nearest neighbour (rasterio.warp.reproject) and averaged over the stratum's analysis
cells, instead of the per-pixel cell-count weights of the main path.
"""
import hashlib
import json
import math
import time
import urllib.parse
import urllib.request

import numpy as np
import rasterio
from rasterio.warp import Resampling, reproject
from rasterio.windows import Window

import place_config

SAS = "https://planetarycomputer.microsoft.com/api/sas/v1/token"


_TOKENS = {}


def _token(href):
    host = urllib.parse.urlparse(href).netloc
    account = host.split(".")[0]
    container = urllib.parse.urlparse(href).path.lstrip("/").split("/")[0]
    if (account, container) in _TOKENS:
        return _TOKENS[(account, container)]
    req = urllib.request.Request(f"{SAS}/{account}/{container}", headers={"User-Agent": "siterra-science rerun"})
    err = None
    for attempt in range(6):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                _TOKENS[(account, container)] = json.load(r)["token"]
                return _TOKENS[(account, container)]
        except Exception as e:
            err = e
            time.sleep(5 * (attempt + 1))
    raise RuntimeError(f"no SAS token: {type(err).__name__}: {str(err)[:120]}")


def _read(href, win):
    tok = _token(href)
    env = {"GDAL_DISABLE_READDIR_ON_OPEN": "EMPTY_DIR", "GDAL_HTTP_MAX_RETRY": "4", "GDAL_HTTP_RETRY_DELAY": "2"}
    with rasterio.Env(**env):
        with rasterio.open(f"/vsicurl/{href}?{tok}") as s:
            return s.read(1, window=Window(win["col_off"], win["row_off"], win["width"], win["height"]))


def rerun_season(cfg, sidecars, periods, stratum_mask, kept_reliability, min_share, ndvi_asset, rel_asset):
    """sidecars: {period start date: sidecar dict or None}; returns the rerun value, coverage and the read comparison."""
    reads, ndvi_stack, ok_stack = [], [], []
    tr = crs = None
    for start, side in periods:
        if side is None:
            continue
        a_n, a_r = side["assets"][ndvi_asset], side["assets"][rel_asset]
        n = _read(a_n["href"], a_n["window"])
        r = _read(a_r["href"], a_r["window"])
        same_n = hashlib.sha256(np.ascontiguousarray(n).tobytes()).hexdigest() == a_n["values_sha256"]
        same_r = hashlib.sha256(np.ascontiguousarray(r).tobytes()).hexdigest() == a_r["values_sha256"]
        reads.append({"item_id": side["item_id"], "ndvi_window_identical": same_n, "reliability_window_identical": same_r})
        v = np.ma.masked_where(~(np.isin(r, kept_reliability) & (n >= -2000) & (n <= 10000)), n.astype(np.float64) / 10000.0)
        ndvi_stack.append(v)
        tr, crs = rasterio.Affine(*a_n["transform"]), side["crs_wkt"]
    need = math.ceil(len(periods) * min_share)
    st = np.ma.stack(ndvi_stack)
    count = st.count(axis=0)
    mean = np.ma.masked_where(count < need, st.mean(axis=0)).filled(np.nan)
    atr, ashp, _ = place_config.analysis_grid(cfg)
    dst = np.full(ashp, np.nan, np.float64)
    reproject(mean, dst, src_transform=tr, src_crs=crs, dst_transform=atr, dst_crs=cfg["analysisCrs"],
              resampling=Resampling.nearest, src_nodata=np.nan, dst_nodata=np.nan)
    vals = dst[stratum_mask]
    good = ~np.isnan(vals)
    return {"value": float(vals[good].mean()) if good.any() else None, "coverage": float(good.mean()), "reads": reads}
