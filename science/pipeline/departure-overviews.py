"""Add the map's display rasters to the NDVI departure bundle, as a new revision built in a separate folder.

Usage: python -I departure-overviews.py <bundles_dir> <departure_grid_dir> <monthly_dir> <tokens.json> <out_bundles_dir>
       --revision-note=<file> --stac-version=<n> [--pixel-m=30] [--steps=16]
Copies <bundles_dir> to <out_bundles_dir> (which must not exist) and revises bundle_ndvi_departure_ait_bouguemez there:
  - each Item whose leave-one-year-out departure is available gains an `overview` asset, <period>/overview.webp: the
    per-pixel leave-one-year-out departure grid (departure-loyo-YYYY-MM.tif, written by recipes-bundle.py into its
    optional grid folder), averaged into square cells of <pixel-m> Web Mercator metres on one fixed EPSG:3857 grid,
    painted with the light-theme `data.ndvi-departure` ramp of the design tokens on the fixed domain -0.10 to +0.10
    (within 0.005 of zero unpainted; t = (|d| - 0.005) / 0.095 clamped to 0..1, the colour mixed between steps 1 and
    2 of its arm for t below 0.5 and steps 2 and 3 above, opacity 0.10 + 0.70 t; t quantised to <steps> steps), and
    written as lossless WebP. Periods without an available leave-one-year-out value get no overview;
  - the Collection gains `excluded_land`, excluded-land.geojson: the mapped cropland and buildings of the terrain
    strata bundle's `excluded` band (WorldCover 2021 classes 40 and 50) as polygons in EPSG:4326 at 5 decimals, for
    the map's hatch, and `item_assets.overview` with the shared grid;
  - the aligned bundle's derived_from link is re-pinned and the catalog's child checksums are updated.
Before any file is written it checks that every grid reproduces its Item's stored measurements (valid pixel count,
area median and spatial IQR, both references) and that the latest available period's grids, recomputed from the
monthly composites in <monthly_dir> as recipes-bundle.py does, are pixel-identical to the stored grids.
Display only: no number on a screen is read from an overview; the measurements stay as they are.
"""
import datetime
import hashlib
import io
import json
import math
import os
import shutil
import sys
import warnings

import numpy as np
import PIL
import pyproj
import rasterio
import shapely
from PIL import Image
from rasterio import features
from rasterio.transform import from_origin
from rasterio.warp import Resampling, reproject
from shapely.geometry import mapping, shape
from shapely.ops import unary_union

DEP = "bundle_ndvi_departure_ait_bouguemez"
NDVI = "bundle_s2_ndvi_monthly_ait_bouguemez"
STRATA = "bundle_terrain_strata_ait_bouguemez"
ALIGNED = "bundle_aligned_antecedent_ait_bouguemez"
LOYO = "ndvi_departure_area_median_leave_one_year_out"
ALL = "ndvi_departure_area_median"
FILE_EXT = "https://stac-extensions.github.io/file/v2.1.0/schema.json"
PROJ_EXT = "https://stac-extensions.github.io/projection/v2.1.0/schema.json"
VERSION_EXT = "https://stac-extensions.github.io/version/v1.2.0/schema.json"
YEARS = range(2019, 2026)
MIN_DATES, MIN_REF_YEARS = 3, 4
DOMAIN, NEUTRAL = (-0.1, 0.1), 0.005
R = 6378137.0


def sha(path):
    return hashlib.sha256(open(path, "rb").read()).hexdigest()


def dump(o, path):
    with open(path, "w") as f:
        json.dump(o, f, indent=1, ensure_ascii=False)
        f.write("\n")


def opt(name, default=None):
    v = [a.split("=", 1)[1] for a in sys.argv if a.startswith(f"--{name}=")]
    return v[0] if v else default


def items_of(bdir):
    col = json.load(open(os.path.join(bdir, "collection.json")))
    out = []
    for l in col["links"]:
        if l["rel"] == "item":
            out.append((l, json.load(open(os.path.join(bdir, l["href"])))))
    return col, out


def read(path):
    with rasterio.open(path) as s:
        return s.read(1), s.transform, s.crs


def grid_statistics(grids, items):
    """Every grid against its Item: valid count exactly, median and IQR at the stored four decimals."""
    bad, n = [], 0
    for _, it in items:
        ym = it["id"][7:]
        m = {x["metric"]: x for x in it["properties"]["siterra:measurements"]}
        for name, metric in (("departure", ALL), ("departure-loyo", LOYO)):
            d = read(os.path.join(grids, f"{name}-{ym}.tif"))[0]
            v = d[~np.isnan(d)]
            q = m[metric]
            n += 1
            if v.size != q["valid_pixel_count"]:
                bad.append(f"{it['id']} {metric}: {v.size} valid pixels, stored {q['valid_pixel_count']}")
            elif q["status"] == "available":
                got = [round(float(np.median(v)), 4), round(float(np.percentile(v, 25)), 4), round(float(np.percentile(v, 75)), 4)]
                if got != [q["value"], q["spread"]["lower"], q["spread"]["upper"]]:
                    bad.append(f"{it['id']} {metric}: {got}")
    return n, bad


def recompute(monthly, ndvi_items, y0, m0):
    """The two departure grids of one period from the composites, in recipes-bundle.py's order of operations."""
    N = {}
    shape2d = None
    for y in YEARS:
        d = os.path.join(monthly, f"{y}-{m0:02d}")
        if not os.path.exists(os.path.join(d, "month.json")):
            N[y] = None
            continue
        med, cnt = read(os.path.join(d, "median.tif"))[0], read(os.path.join(d, "count.tif"))[0]
        shape2d = med.shape
        n = np.where(cnt >= MIN_DATES, med, np.nan).astype(np.float32)
        if ndvi_items[f"period_{y}-{m0:02d}"]["properties"]["siterra:period_status"] != "available":
            n[:] = np.nan
        N[y] = n
    N = {y: (v if v is not None else np.full(shape2d, np.nan, np.float32)) for y, v in N.items()}
    stack = np.stack([N[y] for y in YEARS])
    i = list(YEARS).index(y0)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)
        ref = np.where(np.sum(~np.isnan(stack), axis=0) >= MIN_REF_YEARS, np.nanmedian(stack, axis=0), np.nan)
        others = np.delete(stack, i, axis=0)
        ref_lo = np.where(np.sum(~np.isnan(others), axis=0) >= MIN_REF_YEARS, np.nanmedian(others, axis=0), np.nan)
    return (N[y0] - ref).astype(np.float32), (N[y0] - ref_lo).astype(np.float32)


def hexrgb(h):
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))


def palette(tokens):
    g = json.load(open(tokens))["theme"]["light"]["data"]["ndvi-departure"]
    rule = g["$extensions"]["siterra"]["scale"]
    assert rule["domain"] == list(DOMAIN) and rule["neutral"] == NEUTRAL, rule
    arm = lambda side: [hexrgb(g[f"{side}-{k}"]["$value"]["hex"]) for k in (1, 2, 3)]
    return arm("below"), arm("above"), rule["rule"]


def paint(dep, below, above, steps):
    """RGBA bytes for a departure array: unpainted near zero and where there is no value."""
    h, w = dep.shape
    rgba = np.zeros((h, w, 4), np.uint8)
    d = np.nan_to_num(dep, nan=0.0)
    on = ~np.isnan(dep) & (np.abs(d) >= NEUTRAL)
    t = np.round(np.clip((np.abs(d) - NEUTRAL) / (DOMAIN[1] - NEUTRAL), 0, 1) * steps) / steps
    for arm, side in ((below, d < 0), (above, d > 0)):
        c = [np.array(x, np.float64) for x in arm]
        lo = t < 0.5
        k = np.where(lo, t * 2, t * 2 - 1)[..., None]
        col = np.where(lo[..., None], c[0] + (c[1] - c[0]) * k, c[1] + (c[2] - c[1]) * k)
        sel = on & side
        rgba[sel, :3] = np.round(col[sel]).astype(np.uint8)
        rgba[sel, 3] = np.round(255 * (0.10 + 0.70 * t[sel])).astype(np.uint8)
    return rgba


def webp(rgba):
    b = io.BytesIO()
    Image.fromarray(rgba, "RGBA").save(b, "WEBP", lossless=True, quality=100, method=6, exact=False)
    return b.getvalue()


def main():
    src, grids, monthly, tokens, out = [a for a in sys.argv[1:] if not a.startswith("--")][:5]
    note = open(opt("revision-note")).read().strip()
    version = opt("stac-version")
    px = float(opt("pixel-m", "30"))
    steps = int(opt("steps", "16"))
    assert note and version, "--revision-note and --stac-version are required"
    assert not os.path.exists(out), f"{out} exists; build into a new folder"
    now = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    dcol, ditems = items_of(os.path.join(src, DEP))
    assert dcol["siterra:status"] == "validated", DEP
    ncol, nitems_l = items_of(os.path.join(src, NDVI))
    nitems = {it["id"]: it for _, it in nitems_l}
    scol = json.load(open(os.path.join(src, STRATA, "collection.json")))
    assert scol["siterra:status"] == "validated", STRATA

    # ---- checks before anything is written ----
    n_stats, bad = grid_statistics(grids, ditems)
    assert not bad, bad
    latest = max(it["id"] for _, it in ditems
                 if {x["metric"]: x for x in it["properties"]["siterra:measurements"]}[LOYO]["status"] == "available")
    y0, m0 = int(latest[7:11]), int(latest[12:14])
    dep_a, dep_lo = recompute(monthly, nitems, y0, m0)
    same = all(np.array_equal(a, read(os.path.join(grids, f"{name}-{latest[7:]}.tif"))[0], equal_nan=True)
               for a, name in ((dep_a, "departure"), (dep_lo, "departure-loyo")))
    assert same, f"the {latest} grids do not match a recompute from the composites"
    below, above, _ = palette(tokens)

    # the strata bundle's excluded band, checked against its own checksum
    sasset = scol["assets"]["strata"]
    spath = os.path.join(src, STRATA, sasset["href"])
    assert "1220" + sha(spath) == sasset["file:checksum"], "strata.tif checksum"
    band = [b["name"] for b in sasset["bands"]].index("excluded") + 1
    with rasterio.open(spath) as s:
        ex = s.read(band)
        ex_tr, ex_crs, ex_shape = s.transform, s.crs, (s.height, s.width)
    polys = [shape(g) for g, v in features.shapes(ex, mask=ex == 1, transform=ex_tr) if v == 1]
    union = unary_union(polys)
    back = features.rasterize([union], out_shape=ex_shape, transform=ex_tr, fill=0, default_value=1, dtype="uint8")
    assert np.array_equal(back, (ex == 1).astype(np.uint8)), "the excluded polygons do not rasterize back to the band"
    to4326 = pyproj.Transformer.from_crs(ex_crs, "EPSG:4326", always_xy=True)
    geo = shapely.transform(union, lambda xy: np.column_stack(to4326.transform(xy[:, 0], xy[:, 1])))

    # ---- the shared display grid: the catchment's box in EPSG:3857, padded one cell, snapped to the cell size ----
    geom = json.load(open(os.path.join(src, DEP, "analysis-geometry.geojson")))
    w0, s0, e0, n0 = shape(geom["features"][0]["geometry"]).bounds
    mx = lambda lon: math.radians(lon) * R
    my = lambda lat: R * math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))
    x0, x1 = math.floor(mx(w0) / px - 1) * px, math.ceil(mx(e0) / px + 1) * px
    y0m, y1m = math.floor(my(s0) / px - 1) * px, math.ceil(my(n0) / px + 1) * px
    width, height = int(round((x1 - x0) / px)), int(round((y1m - y0m) / px))
    tr = from_origin(x0, y1m, px, px)
    bbox = [round(x0, 2), round(y0m, 2), round(x1, 2), round(y1m, 2)]
    ground = px * math.cos(math.radians((s0 + n0) / 2))

    # ---- build ----
    shutil.copytree(src, out)
    bdir = os.path.join(out, DEP)
    rendered, total = [], 0
    for link, it in ditems:
        m = {x["metric"]: x for x in it["properties"]["siterra:measurements"]}
        if m[LOYO]["status"] != "available":
            assert "overview" not in it["assets"]
            continue
        g, gtr, gcrs = read(os.path.join(grids, f"departure-loyo-{it['id'][7:]}.tif"))
        dst = np.full((height, width), np.nan, np.float32)
        reproject(g, dst, src_transform=gtr, src_crs=gcrs, dst_transform=tr, dst_crs="EPSG:3857",
                  resampling=Resampling.average, src_nodata=np.nan, dst_nodata=np.nan)
        data = webp(paint(dst, below, above, steps))
        path = os.path.join(bdir, it["id"], "overview.webp")
        with open(path, "wb") as f:
            f.write(data)
        total += len(data)
        it["stac_extensions"] = it["stac_extensions"] + [e for e in (FILE_EXT, PROJ_EXT) if e not in it["stac_extensions"]]
        it["properties"]["updated"] = now
        it["assets"]["overview"] = {
            "href": "./overview.webp", "type": "image/webp",
            "title": f"NDVI departure display raster, {it['properties']['title'].split(', ', 1)[1]}, leave-one-year-out reference (display only)",
            "description": (f"The per-pixel departure from the median of the other years' same month, averaged into {px:g} m Web Mercator "
                            f"cells (about {ground:.1f} m on the ground here) and painted on the fixed scale {DOMAIN[0]:.2f} to {DOMAIN[1]:.2f}. "
                            "No number is read from it."),
            "roles": ["overview"], "proj:code": "EPSG:3857", "proj:bbox": bbox, "proj:shape": [height, width],
            "siterra:color_scale": "ndvi-anomaly-diverging", "siterra:domain": list(DOMAIN),
            "file:checksum": "1220" + sha(path), "file:size": len(data)}
        ip = os.path.join(bdir, link["href"])
        dump(it, ip)
        link["file:checksum"] = "1220" + sha(ip)
        rendered.append(it["id"])

    def rnd(c):
        if isinstance(c[0], (int, float)):
            return [round(c[0], 5), round(c[1], 5)]
        return [rnd(x) for x in c]
    gm = mapping(geo)
    ex_path = os.path.join(bdir, "excluded-land.geojson")
    with open(ex_path, "w") as f:
        json.dump({"type": "FeatureCollection", "features": [{
            "type": "Feature", "properties": {"worldcover_classes": [40, 50]},
            "geometry": {"type": gm["type"], "coordinates": rnd(gm["coordinates"])}}]}, f, separators=(",", ":"))
        f.write("\n")
    n_ex = int((ex == 1).sum())

    col = json.load(open(os.path.join(bdir, "collection.json")))
    col["links"] = [next((l for l, _ in ditems if l["href"] == x["href"]), x) if x["rel"] == "item" else x for x in col["links"]]
    col["stac_extensions"] = col["stac_extensions"] + [e for e in (PROJ_EXT,) if e not in col["stac_extensions"]]
    if VERSION_EXT not in col["stac_extensions"]:
        col["stac_extensions"].append(VERSION_EXT)
    col["version"] = version
    col["created"] = now
    col["description"] = col["description"] + "\n\n" + note
    col["siterra:limitations"] = col["siterra:limitations"] + [note]
    col["assets"]["excluded_land"] = {
        "href": "./excluded-land.geojson", "type": "application/geo+json",
        "title": "Mapped cropland and buildings (ESA WorldCover 2021 classes 40 and 50), for the map's hatch (display only)",
        "description": (f"The excluded layer of {STRATA} ({n_ex:,} pixels of 10 m, from WorldCover's 10 m map) as polygons in EPSG:4326, "
                        "coordinates at 5 decimals. A 2021 context mask, not a field survey; no departure value is masked by it."),
        "roles": ["data"], "file:checksum": "1220" + sha(ex_path), "file:size": os.path.getsize(ex_path)}
    col["item_assets"] = {"overview": {
        "type": "image/webp", "title": "NDVI departure display raster, leave-one-year-out reference (display only)",
        "roles": ["overview"], "proj:code": "EPSG:3857", "proj:bbox": bbox, "proj:shape": [height, width],
        "siterra:color_scale": "ndvi-anomaly-diverging", "siterra:domain": list(DOMAIN)}}
    wc = [p for p in scol["providers"] if p["name"] == "ESA WorldCover consortium"]
    col["providers"] = col["providers"][:-1] + [p for p in wc if p not in col["providers"]] + col["providers"][-1:]
    proc = col["providers"][-1]
    assert "processor" in proc["roles"]
    proc["processing:lineage"] = (proc["processing:lineage"] + " Display rasters: the leave-one-year-out departure grid averaged into "
                                  f"{px:g} m EPSG:3857 cells and painted with the light-theme data.ndvi-departure ramp on its fixed scale, t in {steps} steps, "
                                  "lossless WebP; mapped cropland and buildings from the terrain strata bundle's excluded band, polygonized.")
    proc["processing:software"] = {**proc["processing:software"], "pillow": PIL.__version__, "pyproj": pyproj.__version__, "shapely": shapely.__version__}
    attribution = [a for a in scol["siterra:attribution"] if "WorldCover" in a]
    col["siterra:attribution"] = col["siterra:attribution"] + [a for a in attribution if a not in col["siterra:attribution"]]
    lic = [l for l in scol["links"] if l["rel"] == "license" and "WorldCover" in l.get("title", "")]
    strata_sha = "1220" + sha(os.path.join(out, STRATA, "collection.json"))
    extra = [{"rel": "derived_from", "href": f"../{STRATA}/collection.json", "type": "application/json",
              "title": scol["title"], "file:checksum": strata_sha}] + [l for l in lic if l not in col["links"]]
    at = max(i for i, l in enumerate(col["links"]) if l["rel"] in ("derived_from", "license")) + 1
    col["links"] = col["links"][:at] + extra + col["links"][at:]
    more = {
        "recompute_sample_period": (
            f"Display rasters: the {latest[7:]} grids of both references, recomputed from the NDVI composites, are pixel-identical "
            f"to the grids rendered; all {n_stats} grid statistics (valid pixel count, area median and spatial IQR, both references) "
            "equal the stored measurements; the cropland and buildings polygons rasterize back to the strata bundle's excluded band "
            f"exactly ({n_ex:,} pixels)"),
        "nodata_not_zero": "In the display rasters, cells without a value are transparent, never painted as zero",
        "attribution_present": "ESA WorldCover attribution and licence added for the cropland and buildings layer",
    }
    for c in col["siterra:checks"]:
        if c["name"] in more:
            c["detail"] = c["detail"] + ". " + more.pop(c["name"])
    assert not more, f"checks not found: {list(more)}"
    dump(col, os.path.join(bdir, "collection.json"))
    dep_sha = "1220" + sha(os.path.join(bdir, "collection.json"))

    ap = os.path.join(out, ALIGNED, "collection.json")
    acol = json.load(open(ap))
    pins = [l for l in acol["links"] if l["rel"] == "derived_from" and l["href"] == f"../{DEP}/collection.json"]
    assert len(pins) == 1
    pins[0]["file:checksum"] = dep_sha
    dump(acol, ap)
    cp = os.path.join(out, "catalog.json")
    cat = json.load(open(cp))
    for l in cat["links"]:
        for b in (DEP, ALIGNED):
            if l.get("rel") == "child" and l["href"] == f"./{b}/collection.json":
                l["file:checksum"] = "1220" + sha(os.path.join(out, b, "collection.json"))
    dump(cat, cp)
    print(json.dumps({"overviews": len(rendered), "overview_bytes": total, "excluded_land_bytes": os.path.getsize(ex_path),
                      "grid": {"bbox": bbox, "shape": [height, width], "pixel_m": px, "ground_m": round(ground, 2)},
                      "recomputed_period": latest, "grid_statistics_checked": n_stats,
                      "departure_collection_sha256": dep_sha[4:], "catalog_sha256": sha(cp)}, indent=1))


if __name__ == "__main__":
    main()
