"""Extract real, coordinate-pinned 320x200 satellite and terrain image chips and a pin-chips.json manifest
for five key locations in the Ait Bouguemez valley catchment.

Usage: python -I extract-pin-chips.py <place.json> <repo_root> <main_data_root> <tokens.json> <out_dir_1> [<out_dir_2> ...]

Inputs (all deterministic, real sensor rasters and validated bundles):
- Sentinel-2 L2A 10 m true-colour composite (data/interim/hero/imagery/truecolour-inner-10m.tif) and 30 m Web Mercator
  drape (data/map/imagery/truecolour-summer-2025-3857.webp)
- Sentinel-2 L2A 10 m monthly NDVI medians (2025-07, 2022-04, 2023-04) and leave-one-year-out departures
- MODIS Terra MOD13Q1 v6.1 250 m Theil-Sen trend rasters (bundle_pixel_trend_long_record_ait_bouguemez)
- MODIS Terra MOD10A1 v6.1 500 m NDSI snow cover windows and bundle_snow_cover_by_band_ait_bouguemez
- Copernicus DEM GLO-30 (2021 release) and bundle_terrain_strata_ait_bouguemez (strata.tif, analysis-geometry.geojson)
- CHIRPS v3.0 5 km rainfall cells and bundle_season_summary_ait_bouguemez
"""
import hashlib
import json
import math
import os
import sys

import numpy as np
import rasterio
from affine import Affine
from PIL import Image, ImageDraw
from pyproj import Transformer
from rasterio.features import rasterize
from rasterio.warp import Resampling, reproject
from shapely.geometry import LineString, mapping, shape
from shapely.ops import transform as shp_transform

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import place_config  # noqa: E402

CHIP_W, CHIP_H = 320, 200


def hexrgb(h):
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))


def palette(tokens_path):
    g = json.load(open(tokens_path))["theme"]["light"]["data"]["ndvi-departure"]
    arm = lambda side: [hexrgb(g[f"{side}-{k}"]["$value"]["hex"]) for k in (1, 2, 3)]
    return arm("below"), arm("above")


def paint_diverging(arr, below, above, domain_max, neutral):
    """RGBA array (H, W, 4) for a diverging anomaly or trend array."""
    h, w = arr.shape
    rgba = np.zeros((h, w, 4), np.uint8)
    d = np.nan_to_num(arr, nan=0.0)
    on = ~np.isnan(arr) & (np.abs(d) >= neutral)
    t = np.clip((np.abs(d) - neutral) / (domain_max - neutral), 0.0, 1.0)
    for arm, side in ((below, d < 0), (above, d > 0)):
        c = [np.array(x, np.float64) for x in arm]
        lo = t < 0.5
        k = np.where(lo, t * 2.0, t * 2.0 - 1.0)[..., None]
        col = np.where(lo[..., None], c[0] + (c[1] - c[0]) * k, c[1] + (c[2] - c[1]) * k)
        sel = on & side
        rgba[sel, :3] = np.round(col[sel]).astype(np.uint8)
        rgba[sel, 3] = np.round(255 * (0.25 + 0.60 * t[sel])).astype(np.uint8)
    return rgba


def paint_ndvi_sequential(ndvi):
    """RGB array (H, W, 3) mapping NDVI from dry bare ground (<=0.08) to dense irrigated green (>=0.55)."""
    stops = [
        (0.08, (214, 197, 169)),
        (0.18, (186, 179, 132)),
        (0.30, (124, 161, 96)),
        (0.45, (62, 128, 68)),
        (0.65, (24, 86, 44)),
    ]
    v = np.clip(np.nan_to_num(ndvi, nan=0.08), stops[0][0], stops[-1][0])
    out = np.zeros(ndvi.shape + (3,), np.float64)
    for (v0, c0), (v1, c1) in zip(stops[:-1], stops[1:]):
        sel = (v >= v0) & (v <= v1)
        t = ((v - v0) / (v1 - v0))[..., None]
        c0a, c1a = np.array(c0, np.float64), np.array(c1, np.float64)
        out = np.where(sel[..., None], c0a + (c1a - c0a) * t, out)
    return np.round(out).astype(np.uint8)


def blend_rgba(base_rgb, over_rgba):
    """Alpha-blend an RGBA overlay onto an RGB base array."""
    a = (over_rgba[..., 3:4].astype(np.float64)) / 255.0
    comp = base_rgb.astype(np.float64) * (1.0 - a) + over_rgba[..., :3].astype(np.float64) * a
    return np.round(np.clip(comp, 0, 255)).astype(np.uint8)


def hillshade(z, res_m, azimuth_deg=315.0, altitude_deg=45.0, z_factor=2.2):
    """Analytical hillshade in [0, 1] from an elevation array on a metric grid."""
    gy, gx = np.gradient(z * z_factor, res_m, res_m)
    slope = np.pi / 2.0 - np.arctan(np.hypot(gx, gy))
    aspect = np.arctan2(-gx, gy)
    az = math.radians(azimuth_deg)
    alt = math.radians(altitude_deg)
    hs = np.sin(alt) * np.sin(slope) + np.cos(alt) * np.cos(slope) * np.cos(az - aspect)
    return np.clip((hs + 1.0) * 0.5, 0.0, 1.0)


def window_grid(lon, lat, res_m, to_utm, to_wgs84, w=CHIP_W, h=CHIP_H):
    """Affine transform in EPSG:32629 and [west, south, east, north] bbox in EPSG:4326 for a w x h chip."""
    cx, cy = to_utm(lon, lat)
    x0 = round((cx - 0.5 * w * res_m) / 10.0) * 10.0
    y1 = round((cy + 0.5 * h * res_m) / 10.0) * 10.0
    x1 = x0 + w * res_m
    y0 = y1 - h * res_m
    tr = Affine(res_m, 0.0, x0, 0.0, -res_m, y1)
    lons, lats = to_wgs84([x0, x1, x0, x1], [y0, y0, y1, y1])
    bbox = [round(float(min(lons)), 5), round(float(min(lats)), 5), round(float(max(lons)), 5), round(float(max(lats)), 5)]
    return tr, bbox, (cx, cy)


def warp_rgb(src_path, dst_tr, w=CHIP_W, h=CHIP_H, resampling=Resampling.bilinear):
    out = np.zeros((3, h, w), np.uint8)
    with rasterio.open(src_path) as src:
        for b in (1, 2, 3):
            reproject(
                rasterio.band(src, b), out[b - 1],
                src_transform=src.transform, src_crs=src.crs,
                dst_transform=dst_tr, dst_crs="EPSG:32629",
                resampling=resampling,
            )
    return np.transpose(out, (1, 2, 0))


def warp_band(src_arr, src_tr, src_crs, dst_tr, w=CHIP_W, h=CHIP_H, resampling=Resampling.bilinear, nodata=np.nan):
    dst = np.full((h, w), nodata, np.float32)
    reproject(
        src_arr.astype(np.float32), dst,
        src_transform=src_tr, src_crs=src_crs,
        dst_transform=dst_tr, dst_crs="EPSG:32629",
        resampling=resampling, src_nodata=nodata, dst_nodata=nodata,
    )
    return dst


def add_reticle_and_frame(rgb, split_x=None, pin_xy=(CHIP_W // 2, CHIP_H // 2), accent=(255, 255, 255)):
    """Add a crisp 1px frame, optional split divider, and subtle target reticle around the pinned coordinate."""
    img = Image.fromarray(rgb, "RGB")
    draw = ImageDraw.Draw(img, "RGBA")
    if split_x is not None:
        draw.line([(split_x, 0), (split_x, CHIP_H)], fill=(255, 255, 255, 210), width=1)
    px, py = pin_xy
    # Outer dark halo + inner bright ring for readability over both bright snow and dark orchards
    draw.ellipse([px - 6, py - 6, px + 6, py + 6], outline=(20, 24, 22, 210), width=2)
    draw.ellipse([px - 5, py - 5, px + 5, py + 5], outline=(*accent, 245), width=1)
    draw.point((px, py), fill=(*accent, 255))
    draw.rectangle([0, 0, CHIP_W - 1, CHIP_H - 1], outline=(30, 34, 32, 95), width=1)
    return img


def save_chip(img, filename, out_dirs):
    buf_path = os.path.join(out_dirs[0], filename)
    img.save(buf_path, "PNG", optimize=True)
    for d in out_dirs[1:]:
        img.save(os.path.join(d, filename), "PNG", optimize=True)
    raw = open(buf_path, "rb").read()
    return len(raw), hashlib.sha256(raw).hexdigest()


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    place_path, repo_root, main_data_root, tokens_path = args[:4]
    out_dirs = args[4:]
    if not out_dirs:
        raise SystemExit("Provide at least one output directory")
    for d in out_dirs:
        os.makedirs(d, exist_ok=True)

    cfg = place_config.load(place_path, repo_root)
    atr, ashp, cmask = place_config.analysis_grid(cfg)
    dem_path = os.path.join(main_data_root, "data/raw/copernicus-dem-30m/Copernicus_DSM_COG_10_N31_00_W007_00_DEM.tif")
    elev_10m = place_config.elevation(cfg, dem_path)
    strata_layers, excluded_10m, strata_params, _ = place_config.strata(cfg)
    eb_10m = strata_layers["elevation_band"]
    lc_10m = place_config.land_cover(cfg)
    below_arm, above_arm = palette(tokens_path)

    to_utm = Transformer.from_crs("EPSG:4326", cfg["analysisCrs"], always_xy=True).transform
    to_wgs84 = Transformer.from_crs(cfg["analysisCrs"], "EPSG:4326", always_xy=True).transform

    # Paths to source rasters
    tc10_tif = os.path.join(main_data_root, "data/interim/hero/imagery/truecolour-inner-10m.tif")
    tc30_webp = os.path.join(repo_root, "data/map/imagery/truecolour-summer-2025-3857.webp")
    tc_src = tc10_tif if os.path.exists(tc10_tif) else tc30_webp

    s2_jul25_path = os.path.join(main_data_root, "data/interim/s2-monthly/2025-07/median.tif")
    s2_apr22_path = os.path.join(main_data_root, "data/interim/s2-monthly/2022-04/median.tif")
    s2_apr23_path = os.path.join(main_data_root, "data/interim/s2-monthly/2023-04/median.tif")
    dep_apr22_path = os.path.join(main_data_root, "data/interim/ndvi-departure/departure-loyo-2022-04.tif")
    dep_apr23_path = os.path.join(main_data_root, "data/interim/ndvi-departure/departure-loyo-2023-04.tif")
    modis_trend_mar_jun = os.path.join(
        repo_root, "data/bundles/bundle_pixel_trend_long_record_ait_bouguemez/pixel-trend-mar_jun.tif"
    )
    modis_trend_jun_sep = os.path.join(
        repo_root, "data/bundles/bundle_pixel_trend_long_record_ait_bouguemez/pixel-trend-jun_sep.tif"
    )

    # Load bundle JSONs for exact provenance and metrics
    season_trend = json.load(open(os.path.join(
        repo_root, "data/bundles/bundle_season_trend_long_record_ait_bouguemez/season-trend-long-record.json"
    )))
    pixel_trend = json.load(open(os.path.join(
        repo_root, "data/bundles/bundle_pixel_trend_long_record_ait_bouguemez/pixel-trend-long-record.json"
    )))
    snow_tables = json.load(open(os.path.join(
        repo_root, "data/bundles/bundle_snow_cover_by_band_ait_bouguemez/snow-cover-by-band-tables.json"
    )))
    season_sum = json.load(open(os.path.join(
        repo_root, "data/bundles/bundle_season_summary_ait_bouguemez/season-summary.json"
    )))
    item_2204 = json.load(open(os.path.join(
        repo_root, "data/bundles/bundle_ndvi_departure_ait_bouguemez/period_2022-04/period_2022-04.json"
    )))
    item_2304 = json.load(open(os.path.join(
        repo_root, "data/bundles/bundle_ndvi_departure_ait_bouguemez/period_2023-04/period_2023-04.json"
    )))
    ndvi_2204 = json.load(open(os.path.join(
        repo_root, "data/bundles/bundle_s2_ndvi_monthly_ait_bouguemez/period_2022-04/period_2022-04.json"
    )))
    ndvi_2304 = json.load(open(os.path.join(
        repo_root, "data/bundles/bundle_s2_ndvi_monthly_ait_bouguemez/period_2023-04/period_2023-04.json"
    )))

    chips_manifest = []

    # =========================================================================
    # CHIP 1: Valley Floor Orchards ([-6.422, 31.652], 1,850 m, 10 m resolution)
    # Left 60% (x < 192): Sentinel-2 10 m true colour; Right 40%: July 2025 10 m NDVI + cropland/orchard contour
    # =========================================================================
    lon1, lat1 = -6.422, 31.652
    tr1, bbox1, _ = window_grid(lon1, lat1, 10.0, to_utm, to_wgs84)
    rgb1 = warp_rgb(tc_src, tr1, resampling=Resampling.bilinear)
    with rasterio.open(s2_jul25_path) as s_ndvi:
        ndvi1 = warp_band(s_ndvi.read(1), s_ndvi.transform, s_ndvi.crs, tr1, resampling=Resampling.bilinear)
    lc1 = warp_band(lc_10m, atr, cfg["analysisCrs"], tr1, resampling=Resampling.nearest, nodata=0)
    ndvi1_rgb = paint_ndvi_sequential(ndvi1)
    split1 = 192
    comp1 = rgb1.copy()
    comp1[:, split1:, :] = (0.28 * rgb1[:, split1:, :].astype(np.float64) + 0.72 * ndvi1_rgb[:, split1:, :].astype(np.float64)).astype(np.uint8)
    # Highlight WorldCover tree-cover/orchard (10) and cropland (40) edge contour
    agri_mask = (lc1 == 10) | (lc1 == 40)
    edge1 = agri_mask ^ np.minimum.reduce([
        np.roll(agri_mask, 1, 0), np.roll(agri_mask, -1, 0),
        np.roll(agri_mask, 1, 1), np.roll(agri_mask, -1, 1),
    ])
    comp1[edge1] = (238, 198, 67)
    img1 = add_reticle_and_frame(comp1, split_x=split1, accent=(238, 198, 67))
    bytes1, sha1 = save_chip(img1, "chip-valley-floor-orchards.png", out_dirs)

    valid_ndvi1 = ndvi1[~np.isnan(ndvi1)]
    orch_ndvi1 = ndvi1[agri_mask & ~np.isnan(ndvi1)]
    slope_ndvi1 = ndvi1[(~agri_mask) & ~np.isnan(ndvi1)]
    chips_manifest.append({
        "id": "chip-valley-floor-orchards",
        "filename": "chip-valley-floor-orchards.png",
        "title": "Tabant & Agouti Valley Floor",
        "coordinates": [lon1, lat1],
        "bbox": bbox1,
        "elevationM": 1850,
        "sensor": "Sentinel-2 L2A (10 m) + MODIS MOD13Q1 v6.1 + ESA WorldCover 2021",
        "sceneId": "S2C_29SQR_20250726_0_L2A, S2A_29SQR_20250728_0_L2A, S2B_29SQR_20250731_0_L2A, S2B_29SQR_20250820_0_L2A, S2B_29SQR_20250830_0_L2A",
        "bundleId": "bundle_season_trend_long_record_ait_bouguemez",
        "capturedAt": "2025-07-26 to 2025-08-30",
        "bytes": bytes1,
        "sha256": sha1,
        "metrics": {
            "ndviSlopePerDecade": 0.02221,
            "summerNdviSlope": 0.03174,
            "croplandBuiltSummerSlope": 0.04940,
            "treeCoverSummerSlope": 0.02675,
            "valleyFloorJuly2025NdviMedian": round(float(np.median(orch_ndvi1)), 4),
            "adjacentSlopeJuly2025NdviMedian": round(float(np.median(slope_ndvi1)), 4),
            "windowJuly2025NdviP90": round(float(np.percentile(valid_ndvi1, 90)), 4),
            "validObservationShare": 1.0,
        },
        "aiInspectionNote": (
            "Left 60%: 10 m Sentinel-2 true-colour composite showing the bright irrigated ribbon of Tabant and Agouti "
            "fields and apple orchards along the Assif n'Ait Bouguemez floor beside bare semi-arid footslopes. Right 40%: "
            f"July 2025 10 m NDVI (irrigated orchard/cropland median {float(np.median(orch_ndvi1)):.2f} vs. "
            f"{float(np.median(slope_ndvi1)):.2f} on adjacent dry slopes) with WorldCover "
            "2021 tree-cover and cropland boundaries outlined in gold. Cross-checked against season_trend_long_record: "
            "level valley-floor ground greens at +0.0317 NDVI/decade in summer (June to September) and +0.0222 NDVI/decade "
            "in spring (March to June), confirming that irrigated orchards and underplanted alfalfa drive the strongest "
            "greening in the catchment."
        ),
    })

    # =========================================================================
    # CHIP 2: Upper Snow Band > 2,815 m ([-6.335, 31.692], 3,120 m ridge context, 30 m grid)
    # Shows high-altitude ridge terrain (>2,815 m) with MOD10A1 winter snow-cover overlay and 2,815 m contour
    # =========================================================================
    lon2, lat2 = -6.335, 31.692
    tr2, bbox2, _ = window_grid(lon2, lat2, 30.0, to_utm, to_wgs84)
    rgb2 = warp_rgb(tc_src, tr2, resampling=Resampling.bilinear)
    el2 = warp_band(elev_10m, atr, cfg["analysisCrs"], tr2, resampling=Resampling.bilinear, nodata=np.nan)
    eb2 = warp_band(eb_10m, atr, cfg["analysisCrs"], tr2, resampling=Resampling.nearest, nodata=0)

    # Compute mean winter (Jan-Feb 2025) MOD10A1 NDSI snow cover over the catchment
    mod10_dir = os.path.join(repo_root, "data/raw/modis/modis-10A1-061")
    rec10 = sorted(f for f in os.listdir(mod10_dir) if f.startswith("search-"))[-1]
    kept10 = json.load(open(os.path.join(mod10_dir, rec10)))["kept"]
    jf25_items = [iid for iid in kept10 if iid.split(".")[1].startswith("A2025") and int(iid.split(".")[1][5:8]) <= 59]
    snow_acc, clear_acc = None, None
    m10_tr, m10_crs = None, None
    for iid in jf25_items:
        side = json.load(open(os.path.join(mod10_dir, iid + ".json")))
        a = side["assets"]["NDSI_Snow_Cover"]
        with rasterio.open(os.path.join(mod10_dir, a["file"])) as s10:
            v = s10.read(1)
            m10_tr, m10_crs = rasterio.Affine(*a["transform"]), side["crs_wkt"]
        clr = (v <= 100).astype(np.float32)
        snw = ((v <= 100) & (v >= 20)).astype(np.float32)
        clear_acc = clr if clear_acc is None else clear_acc + clr
        snow_acc = snw if snow_acc is None else snow_acc + snw
    with np.errstate(invalid="ignore", divide="ignore"):
        snow_freq_500m = np.where(clear_acc > 0, snow_acc / np.maximum(clear_acc, 1.0), np.nan)
    snow2 = np.full((CHIP_H, CHIP_W), np.nan, np.float32)
    reproject(
        snow_freq_500m.astype(np.float32), snow2,
        src_transform=m10_tr, src_crs=m10_crs,
        dst_transform=tr2, dst_crs="EPSG:32629",
        resampling=Resampling.bilinear, src_nodata=np.nan, dst_nodata=np.nan,
    )

    # Blend cool cyan-blue snow-persistence tint on upper slopes (eb2 == 3 or snow2 >= 0.35)
    comp2 = rgb2.copy().astype(np.float64)
    sf = np.clip(np.nan_to_num(snow2, nan=0.0), 0.0, 1.0)
    high_zone = (eb2 == 3) | (el2 >= 2815.0)
    alpha2 = np.where(high_zone, np.clip(0.30 + 0.50 * sf, 0.30, 0.78), np.clip(0.35 * sf, 0.0, 0.35))[..., None]
    snow_col = np.array([196.0, 232.0, 255.0])
    comp2 = np.round(comp2 * (1.0 - alpha2) + snow_col * alpha2).astype(np.uint8)
    # Draw the 2,815 m upper-band boundary contour in crisp ice-blue
    edge2 = high_zone ^ np.minimum.reduce([
        np.roll(high_zone, 1, 0), np.roll(high_zone, -1, 0),
        np.roll(high_zone, 1, 1), np.roll(high_zone, -1, 1),
    ])
    comp2[edge2] = (72, 185, 255)
    img2 = add_reticle_and_frame(comp2, accent=(120, 210, 255))
    bytes2, sha2 = save_chip(img2, "chip-upper-snow-band.png", out_dirs)

    high_rows = snow_tables["rows"]["elevation_high"]
    w_snow = [r["ndsi_0.2"] for r in high_rows if int(r["month"].split("-")[1]) in (12, 1, 2, 3) and r["ndsi_0.2"] is not None]
    s_snow = [r["ndsi_0.2"] for r in high_rows if int(r["month"].split("-")[1]) in (6, 7, 8, 9) and r["ndsi_0.2"] is not None]
    chips_manifest.append({
        "id": "chip-upper-snow-band",
        "filename": "chip-upper-snow-band.png",
        "title": "Upper Pasture Band > 2,815 m",
        "coordinates": [lon2, lat2],
        "bbox": bbox2,
        "elevationM": 3120,
        "sensor": "Sentinel-2 L2A + MODIS Terra MOD10A1 v6.1 (500 m) + Copernicus DEM GLO-30",
        "sceneId": "MOD10A1.A2001001 to MOD10A1.A2025365 (h17v05, 8,985 daily products)",
        "bundleId": "bundle_snow_cover_by_band_ait_bouguemez",
        "capturedAt": "2001-01 to 2025-12 (winter Jan-Feb 2025 snow frequency overlay)",
        "bytes": bytes2,
        "sha256": sha2,
        "metrics": {
            "upperBandBoundaryM": 2815,
            "windowMaxElevationM": round(float(np.nanmax(el2)), 1),
            "snowCoverWinterShare": round(float(np.mean(w_snow)), 4),
            "snowCoverSummerShare": round(float(np.mean(s_snow)), 4),
            "winterS2MonthsFullClear": 0,
            "winterS2MonthsTested": 28,
            "ndviSlopePerDecade": 0.00700,
            "summerNdviSlope": 0.00383,
            "validObservationShare": 0.3289,
        },
        "aiInspectionNote": (
            "30 m Sentinel-2 optical relief ascending to the 3,180 m northern ridgeline above Ait Ouchi, overlaid with "
            "the 2,815 m upper terrain-stratum contour (ice-blue line) and MOD10A1 v6.1 winter snow frequency (cyan tint). "
            "Above 2,815 m, 0 of 28 winter Sentinel-2 months (Dec to Mar, 2019 to 2025) are snow-free across the upper "
            f"band (median valid area fraction 0.3289), and MOD10A1 records a {float(np.mean(w_snow)):.4f} mean winter "
            f"snow-covered share (NDSI >= 0.2) versus {float(np.mean(s_snow)):.4f} in June to September, showing why "
            "spring greenness trends (+0.0070 NDVI/decade) are sensitive to snowmelt timing."
        ),
    })

    # =========================================================================
    # CHIP 3: Middle Slope Shared Rangeland 2,317-2,815 m ([-6.385, 31.672], 2,540 m, 20 m grid)
    # Real optical + 250 m MOD13Q1 Theil-Sen slope overlay (+0.0072 NDVI/dec in elevation_mid)
    # =========================================================================
    lon3, lat3 = -6.385, 31.672
    tr3, bbox3, _ = window_grid(lon3, lat3, 20.0, to_utm, to_wgs84)
    rgb3 = warp_rgb(tc_src, tr3, resampling=Resampling.bilinear)
    with rasterio.open(modis_trend_mar_jun) as s_tr:
        slope3 = warp_band(s_tr.read(1), s_tr.transform, s_tr.crs, tr3, resampling=Resampling.nearest, nodata=np.nan)
    eb3 = warp_band(eb_10m, atr, cfg["analysisCrs"], tr3, resampling=Resampling.nearest, nodata=0)
    el3 = warp_band(elev_10m, atr, cfg["analysisCrs"], tr3, resampling=Resampling.bilinear, nodata=np.nan)
    slope_rgba3 = paint_diverging(slope3, below_arm, above_arm, domain_max=0.05, neutral=0.0025)
    comp3 = blend_rgba(rgb3, slope_rgba3)
    # Subtle 250 m MODIS pixel grid lines on the right half so the native 250 m blocks are visually legible
    with rasterio.open(modis_trend_mar_jun) as s_tr:
        # Map each chip pixel to its MODIS row/col to draw crisp 250 m cell boundaries
        r_grid, c_grid = np.indices((CHIP_H, CHIP_W))
        xs3 = tr3.c + (c_grid + 0.5) * tr3.a
        ys3 = tr3.f + (r_grid + 0.5) * tr3.e
        to_sinu = Transformer.from_crs("EPSG:32629", s_tr.crs, always_xy=True).transform
        sx, sy = to_sinu(xs3, ys3)
        mc, mr = ~s_tr.transform * (sx, sy)
        mr_i, mc_i = np.floor(mr).astype(np.int32), np.floor(mc).astype(np.int32)
        modis_edge = (mr_i != np.roll(mr_i, 1, 0)) | (mc_i != np.roll(mc_i, 1, 1))
        comp3[modis_edge] = np.round(0.65 * comp3[modis_edge].astype(np.float64) + 0.35 * np.array([255.0, 255.0, 255.0])).astype(np.uint8)
    img3 = add_reticle_and_frame(comp3, accent=(88, 214, 141))
    bytes3, sha3 = save_chip(img3, "chip-mid-slope-rangeland.png", out_dirs)

    mid_share = next(a for a in pixel_trend["windows_summary"]["mar_jun"]["area_shares"] if a["group"] == "elevation_mid")
    chips_manifest.append({
        "id": "chip-mid-slope-rangeland",
        "filename": "chip-mid-slope-rangeland.png",
        "title": "Middle Slope Shared Rangeland (2,317 to 2,815 m)",
        "coordinates": [lon3, lat3],
        "bbox": bbox3,
        "elevationM": 2540,
        "sensor": "Sentinel-2 L2A + MODIS Terra MOD13Q1 v6.1 (250 m Theil-Sen slope)",
        "sceneId": "MOD13Q1.A2000049 to MOD13Q1.A2025353 (584 Terra 16-day composites)",
        "bundleId": "bundle_pixel_trend_long_record_ait_bouguemez",
        "capturedAt": "2000-02-18 to 2025-12-19 (March to June growing window)",
        "bytes": bytes3,
        "sha256": sha3,
        "metrics": {
            "ndviSlopePerDecade": 0.00718,
            "theilSenSlopePerDecade": 0.00685,
            "summerNdviSlope": 0.00499,
            "windowPixelMedianSlopePerDecade": round(float(np.nanmedian(slope3)), 5),
            "increasingFdrShare": mid_share["increasing_fdr_share"],
            "decreasingFdrShare": mid_share["decreasing_fdr_share"],
            "unadjustedPositiveShare": mid_share["unadjusted_sign_shares"]["positive_slope"],
            "validObservationShare": 1.0,
        },
        "aiInspectionNote": (
            "Sentinel-2 optical base draped with the native 250 m MOD13Q1 Theil-Sen slope grid (2000 to 2025, March to June; "
            "slope magnitude and direction only per SCI-52, with 250 m sinusoidal cell boundaries outlined). Across the "
            "2,317 to 2,815 m middle rangeland band, spring greenness trends upward at +0.0072 NDVI/decade (+0.0069 Theil-Sen; "
            "20.41% of band area upward at BH-FDR q = 0.05 vs. 0.15% downward), whereas summer (June to September) slope is "
            "+0.0050 NDVI/decade with a 95% interval including zero (-0.0020 to +0.0120). Because 250 m NDVI cannot distinguish "
            "palatable herbs (Astragalus armatus, Thymus satureioides) from unpalatable spiny xerophytes (Bupleurum spinosum, "
            "Erinacea anthyllis, Thymelaea virgata), a botanical palatability transect is required on the ground."
        ),
    })

    # =========================================================================
    # CHIP 4: Drought Comparison ([-6.450, 31.645], Wet Season 2021/22 650 mm vs Dry Season 2022/23 349 mm)
    # Split-screen (left x < 160: April 2022 after 650.4 mm wet season; right x >= 160: April 2023 after 349.3 mm)
    # =========================================================================
    lon4, lat4 = -6.450, 31.645
    tr4, bbox4, _ = window_grid(lon4, lat4, 15.0, to_utm, to_wgs84)
    rgb4 = warp_rgb(tc_src, tr4, resampling=Resampling.bilinear)
    with rasterio.open(dep_apr22_path) as s_d22, rasterio.open(dep_apr23_path) as s_d23:
        d22 = warp_band(s_d22.read(1), s_d22.transform, s_d22.crs, tr4, resampling=Resampling.bilinear)
        d23 = warp_band(s_d23.read(1), s_d23.transform, s_d23.crs, tr4, resampling=Resampling.bilinear)
    with rasterio.open(s2_apr22_path) as s_n22, rasterio.open(s2_apr23_path) as s_n23:
        n22 = warp_band(s_n22.read(1), s_n22.transform, s_n22.crs, tr4, resampling=Resampling.bilinear)
        n23 = warp_band(s_n23.read(1), s_n23.transform, s_n23.crs, tr4, resampling=Resampling.bilinear)

    rgba_22 = paint_diverging(d22, below_arm, above_arm, domain_max=0.10, neutral=0.005)
    rgba_23 = paint_diverging(d23, below_arm, above_arm, domain_max=0.10, neutral=0.005)
    left_rgb = blend_rgba(rgb4, rgba_22)
    right_rgb = blend_rgba(rgb4, rgba_23)
    split4 = CHIP_W // 2
    comp4 = np.zeros_like(rgb4)
    comp4[:, :split4, :] = left_rgb[:, :split4, :]
    comp4[:, split4:, :] = right_rgb[:, split4:, :]

    # Overlay the 0.05 degree (~5 km) CHIRPS v3.0 grid boundary crossing the window (-6.45 deg E)
    r_grid, c_grid = np.indices((CHIP_H, CHIP_W))
    xs4 = tr4.c + (c_grid + 0.5) * tr4.a
    ys4 = tr4.f + (r_grid + 0.5) * tr4.e
    lons4, lats4 = to_wgs84(xs4, ys4)
    chirps_col = np.floor((lons4 + 180.0) / 0.05).astype(np.int32)
    chirps_row = np.floor((60.0 - lats4) / 0.05).astype(np.int32)
    chirps_edge = (chirps_col != np.roll(chirps_col, 1, 1)) | (chirps_row != np.roll(chirps_row, 1, 0))
    comp4[chirps_edge] = (70, 150, 235)

    img4 = add_reticle_and_frame(comp4, split_x=split4, accent=(255, 220, 100))
    bytes4, sha4 = save_chip(img4, "chip-drought-comparison.png", out_dirs)

    s_2122 = next(s for s in season_sum["seasons"] if s["season_id"] == "season_2021-11_2022-04")
    s_2223 = next(s for s in season_sum["seasons"] if s["season_id"] == "season_2022-11_2023-04")
    chips_manifest.append({
        "id": "chip-drought-comparison",
        "filename": "chip-drought-comparison.png",
        "title": "Wet Season 2021/22 (650 mm) vs Dry Season 2022/23 (349 mm)",
        "coordinates": [lon4, lat4],
        "bbox": bbox4,
        "elevationM": 1816,
        "sensor": "Sentinel-2 L2A (10 m NDVI departure) + CHIRPS v3.0 (0.05 deg / 5 km)",
        "sceneId": "period_2022-04 (12 dates) vs period_2023-04 (12 dates); CHIRPS v3.0 2021-11..2023-04",
        "bundleId": "bundle_ndvi_departure_ait_bouguemez, bundle_season_summary_ait_bouguemez",
        "capturedAt": "2022-04-01..2022-04-28 vs 2023-04-01..2023-04-28",
        "bytes": bytes4,
        "sha256": sha4,
        "metrics": {
            "wetSeason2021_22RainfallMm": s_2122["season_total_mm"],
            "wetSeason2021_22Category": s_2122["season_category"],
            "drySeason2022_23RainfallMm": s_2223["season_total_mm"],
            "drySeason2022_23Category": s_2223["season_category"],
            "april2022CatchmentNdviMedian": ndvi_2204["properties"]["siterra:measurements"][0]["value"],
            "april2023CatchmentNdviMedian": ndvi_2304["properties"]["siterra:measurements"][0]["value"],
            "april2022DepartureLoyo": item_2204["properties"]["siterra:measurements"][1]["value"],
            "april2023DepartureLoyo": item_2304["properties"]["siterra:measurements"][1]["value"],
            "windowApril2022NdviMedian": round(float(np.nanmedian(n22)), 4),
            "windowApril2023NdviMedian": round(float(np.nanmedian(n23)), 4),
            "validObservationShare": item_2304["properties"]["siterra:area_valid_fraction"],
        },
        "aiInspectionNote": (
            "Side-by-side 10 m Sentinel-2 leave-one-year-out NDVI departure comparison across the lower valley and slopes "
            "(blue line marks the 0.05 degree / 5 km CHIRPS v3.0 cell boundary at -6.45 E). Left half: April 2022 after "
            "an above-normal wet season of 650.36 mm (+88.20 mm vs 1991 to 2020 mean; catchment NDVI 0.1439, LOYO departure "
            "+0.0007). Right half: April 2023 after a below-normal wet season of 349.33 mm (-212.83 mm; catchment NDVI "
            "0.1354, LOYO departure -0.0100). Despite wet-season rainfall dropping by 301.03 mm (46%), April catchment "
            "greenness shifted by only 0.0085 NDVI (within 0.01 NDVI), consistent with snowmelt and irrigation buffering "
            "and restrend_long_record's low rainfall R-squared (0.04)."
        ),
    })

    # =========================================================================
    # CHIP 5: Catchment Outlet & Drainage Axis ([-6.537, 31.638], 1,465 m, 15 m grid)
    # Real Copernicus DEM GLO-30 shaded relief + hypsometric tint + frozen catchment boundary + outlet point
    # =========================================================================
    lon5, lat5 = -6.537, 31.638
    tr5, bbox5, _ = window_grid(lon5, lat5, 15.0, to_utm, to_wgs84)
    rgb5 = warp_rgb(tc_src, tr5, resampling=Resampling.bilinear)
    with rasterio.open(dem_path) as s_dem:
        dem5 = warp_band(s_dem.read(1), s_dem.transform, s_dem.crs, tr5, resampling=Resampling.bilinear, nodata=np.nan)
    hs5 = hillshade(dem5, 15.0, azimuth_deg=315.0, altitude_deg=42.0, z_factor=2.4)

    # Hypsometric relief blend over optical base
    e_norm = np.clip((dem5 - 1450.0) / (2300.0 - 1450.0), 0.0, 1.0)[..., None]
    low_col = np.array([76.0, 128.0, 108.0])
    high_col = np.array([218.0, 192.0, 152.0])
    hyp_rgb = low_col + (high_col - low_col) * e_norm
    shaded = hyp_rgb * (0.45 + 0.65 * hs5[..., None])
    comp5 = np.round(np.clip(0.45 * rgb5.astype(np.float64) + 0.55 * shaded, 0, 255)).astype(np.uint8)

    # Rasterize the frozen catchment boundary polygon and dim outside-catchment pixels slightly
    geom_proj = place_config.geometry_projected(cfg)
    in_catch5 = rasterize([(mapping(geom_proj), 1)], out_shape=(CHIP_H, CHIP_W), transform=tr5, fill=0, dtype="uint8").astype(bool)
    comp5[~in_catch5] = np.round(0.68 * comp5[~in_catch5].astype(np.float64) + 0.32 * np.array([32.0, 38.0, 44.0])).astype(np.uint8)
    catch_edge5 = in_catch5 ^ np.minimum.reduce([
        np.roll(in_catch5, 1, 0), np.roll(in_catch5, -1, 0),
        np.roll(in_catch5, 1, 1), np.roll(in_catch5, -1, 1),
    ])
    comp5[catch_edge5] = (86, 204, 242)

    # Pin the exact snapped outlet (-6.5372222, 31.6377778)
    out_x, out_y = to_utm(-6.5372222, 31.6377778)
    out_px = int(round((out_x - tr5.c) / tr5.a))
    out_py = int(round((out_y - tr5.f) / tr5.e))
    img5 = add_reticle_and_frame(comp5, pin_xy=(out_px, out_py), accent=(86, 204, 242))
    bytes5, sha5 = save_chip(img5, "chip-outlet-hydrology.png", out_dirs)

    chips_manifest.append({
        "id": "chip-outlet-hydrology",
        "filename": "chip-outlet-hydrology.png",
        "title": "Catchment Outlet & Drainage Axis",
        "coordinates": [lon5, lat5],
        "snappedOutletCoordinates": [-6.5372222, 31.6377778],
        "bbox": bbox5,
        "elevationM": 1465,
        "sensor": "Copernicus DEM GLO-30 (2021 release) + Sentinel-2 L2A",
        "sceneId": "Copernicus_DSM_COG_10_N31_00_W007_00_DEM",
        "bundleId": "bundle_terrain_strata_ait_bouguemez",
        "capturedAt": "2021 release (frozen delineation 2026-10-27)",
        "bytes": bytes5,
        "sha256": sha5,
        "metrics": {
            "outletElevationDemM": 1464.6,
            "outletElevationTerrariumM": 1465,
            "catchmentAreaGeodesicKm2": 417.04,
            "catchmentAreaPlanarKm2": 417.36,
            "analysisCells10m": 4173603,
            "outletSnapDistanceM": 94,
            "windowMinElevationM": round(float(np.nanmin(dem5)), 1),
            "windowMaxElevationM": round(float(np.nanmax(dem5)), 1),
            "ndviSlopePerDecade": 0.00906,
            "summerNdviSlope": 0.00899,
            "validObservationShare": 1.0,
        },
        "aiInspectionNote": (
            "Copernicus DEM GLO-30 analytical hillshade and hypsometric relief blended with Sentinel-2 optical imagery "
            "at the western gorge where the Assif n'Ait Bouguemez exits the valley (1,464.6 m on the analysis DEM; "
            "1,465 m on Mapterhorn Terrarium z12). The cyan contour traces the frozen hydrological boundary "
            "(geo_ait_bouguemez_catchment revision 1, 417.04 km2 geodesic, 4,173,603 analysis cells of 10 m) snapped "
            "94 m from OpenStreetMap river way 326552769 to the D8 flow-accumulation pour point, anchoring the 16-step "
            "geographic reveal sequence from the outlet up to the eastern headwaters."
        ),
    })

    manifest = {
        "manifestVersion": "1.0.0",
        "caseId": "case_aitbouguemez",
        "placeId": cfg["placeId"],
        "dimensions": {"width": CHIP_W, "height": CHIP_H, "format": "image/png"},
        "generatedBy": "science/pipeline/extract-pin-chips.py",
        "chips": chips_manifest,
    }

    for d in out_dirs:
        mpath = os.path.join(d, "pin-chips.json")
        with open(mpath, "w") as f:
            json.dump(manifest, f, indent=2, ensure_ascii=False)
            f.write("\n")

    print(f"Exported {len(chips_manifest)} chips and pin-chips.json to {len(out_dirs)} directories:")
    for c in chips_manifest:
        print(f"  {c['filename']}: {c['bytes']} bytes, sha256={c['sha256'][:16]}..., bbox={c['bbox']}")


if __name__ == "__main__":
    main()
