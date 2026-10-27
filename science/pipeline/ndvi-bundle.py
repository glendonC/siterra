"""Build the Sentinel-2 monthly NDVI bundle (STAC 1.1.0 static Collection, one Item per period) from s2_ndvi.py outputs.

Usage: python -I ndvi-bundle.py <monthly_dir> <kept.jsonl> <geometry.geojson> <lockfile> <bundles_dir> <first> <last> [--inspected=<note.txt>]
       [--revision-note=<file>] [--stac-version=<n>]
--revision-note=<file> adds the file's text as a last paragraph of each written Collection's description and as
its last limitation. --stac-version=<n> sets each written Collection's STAC `version` to <n> and lists the version
extension (v1.2.0). Without them a Collection carries neither.
Imports only permissive packages. Policy (docs/reference/observation-preprocessing.md section 4), fixed for this version:
  a pixel-month is accepted with at least 3 distinct dates; a period is available when accepted pixels cover at least 70%
  of the geometry, otherwise insufficient (value withheld, counts kept); a period with no kept observation is missing.
  Flags: reduced_qa_fallback on every period (scene classification only); snow_suspected when SCL snow is at least 1.0% of
  candidate pixel observations in the geometry; low_scene_count when fewer than 4 dates contributed kept pixels.
Checks: recompute_sample_period re-runs the documented preprocessing for one month from fresh downloads into a separate
directory and compares (tolerance 0.0005 NDVI); units_and_scale includes the offset guard (median DN of 03.01 vs 04.00
items of the same tile in January 2022 must differ by less than 500 DN); nodata_not_zero; period_alignment;
attribution_present; visual_inspection_sample (pass only with --inspected=<note>, whose text becomes the check detail).
"""
import calendar
import datetime
import hashlib
import json
import os
import shutil
import sys
import tempfile

import numpy as np
import rasterio
from shapely.geometry import mapping, shape

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import s2_ndvi  # noqa: E402

VERSION = "0.1.0"
BUNDLE_ID = "bundle_s2_ndvi_monthly_ait_bouguemez"
GEO_ID, GEO_REV = "geo_ait_bouguemez_catchment", 1
EXT = "https://siterra.invalid/schemas/stac/siterra/1.0.0/schema.json"
MIN_DATES, MIN_AREA, SNOW_FLAG, LOW_DATES, TOL = 3, 0.70, 1.0, 4, 0.0005
SAMPLE = (2022, 4)
GUARD_MIN_PIXELS = 10000  # 1 km2 of clear pixels; below that a scene's median DN is cloud-edge noise
PENDING_REASON = "Not processed in this bundle revision: Sentinel-2 reads for this month were still running when the bundle was built"


def sha(p):
    return hashlib.sha256(open(p, "rb").read()).hexdigest()


def dump(o, p):
    with open(p, "w") as f:
        json.dump(o, f, indent=1, ensure_ascii=False)
        f.write("\n")


def months(a, b):
    y, m = map(int, a.split("-"))
    y1, m1 = map(int, b.split("-"))
    while (y, m) <= (y1, m1):
        yield y, m
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)


def summarize(mdir):
    j = json.load(open(os.path.join(mdir, "month.json")))
    med = rasterio.open(os.path.join(mdir, "median.tif")).read(1)
    cnt = rasterio.open(os.path.join(mdir, "count.tif")).read(1)
    acc = cnt >= MIN_DATES
    v = med[acc]
    assert not np.isnan(v).any()
    total = j["geometry_pixels"]
    cand = sum(s["pixels_with_data"] for s in j["items"])
    cloud = sum(sum(s["scl_counts_in_geometry"][k] for k in (8, 9, 10)) for s in j["items"])
    snow = sum(s["scl_counts_in_geometry"][11] for s in j["items"])
    out = {"j": j, "accepted": int(acc.sum()), "total": total, "frac": acc.sum() / total,
           "median": float(np.median(v)) if v.size else None,
           "q25": float(np.percentile(v, 25)) if v.size else None, "q75": float(np.percentile(v, 75)) if v.size else None,
           "cloud_pct": 100 * cloud / cand if cand else None, "snow_pct": 100 * snow / cand if cand else None,
           "zero_with_no_obs": int(((cnt == 0) & ~np.isnan(med)).sum())}
    return out


def main(inspected):
    mdir_root, kept_path, geo_path, lock_path, bundles_dir, first, last = sys.argv[1:8]
    now = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    geom = shape(json.load(open(geo_path))["features"][0]["geometry"])
    simple = geom.simplify(1 / 3600, preserve_topology=True)
    bbox = [round(v, 6) for v in geom.bounds]
    tr, shp, mask = s2_ndvi.analysis_grid(geo_path)
    area_m2 = int(mask.sum()) * 100

    # SV-01: re-run the documented preprocessing for one month from fresh downloads and compare
    kept = [json.loads(l) for l in open(kept_path)]
    tmp = tempfile.mkdtemp(prefix="ndvi-recompute-")
    os.makedirs(os.path.join(tmp, "items"))
    s2_ndvi.run_month(*SAMPLE, kept, tr, shp, mask, tmp, os.path.join(tmp, "items"), 8)
    a = summarize(os.path.join(mdir_root, f"{SAMPLE[0]}-{SAMPLE[1]:02d}"))
    b = summarize(os.path.join(tmp, f"{SAMPLE[0]}-{SAMPLE[1]:02d}"))
    rdiff = max(abs(a["median"] - b["median"]), abs(a["q25"] - b["q25"]), abs(a["q75"] - b["q75"]))
    rsame = a["accepted"] == b["accepted"]
    shutil.rmtree(tmp)

    bdir = os.path.join(bundles_dir, BUNDLE_ID)
    os.makedirs(bdir, exist_ok=True)
    geo_out = os.path.join(bdir, "analysis-geometry.geojson")
    shutil.copyfile(geo_path, geo_out)
    lock_out = os.path.join(bdir, "uv.lock")
    shutil.copyfile(lock_path, lock_out)

    guard, item_links, summaries, years, statuses, pending, guard_skipped = [], [], {}, set(), {}, [], []
    for y, m in months(first, last):
        pid = f"period_{y}-{m:02d}"
        mdir = os.path.join(mdir_root, f"{y}-{m:02d}")
        if not os.path.exists(os.path.join(mdir, "month.json")):
            # not processed yet in this revision: a gap with its reason, never a value (SV-04)
            pending.append(pid)
            statuses[pid] = "missing"
            item = {"type": "Feature", "stac_version": "1.1.0",
                    "stac_extensions": ["https://stac-extensions.github.io/raster/v2.0.0/schema.json", EXT],
                    "id": pid, "collection": BUNDLE_ID, "geometry": mapping(simple), "bbox": bbox,
                    "properties": {"title": f"Catchment NDVI, {calendar.month_name[m]} {y}", "datetime": None,
                                   "start_datetime": f"{y}-{m:02d}-01T00:00:00Z",
                                   "end_datetime": f"{y}-{m:02d}-{calendar.monthrange(y, m)[1]:02d}T23:59:59Z",
                                   "created": now, "raster:spatial_resolution": 10,
                                   "siterra:period_status": "missing",
                                   "siterra:missing_reason": PENDING_REASON,
                                   "siterra:area_valid_fraction": None, "siterra:observation_dates": [],
                                   "siterra:measurements": [{"metric": "ndvi_area_median", "value": None, "unit": "1",
                                                             "aggregation": f"Area median of per-pixel monthly medians over accepted pixels (at least {MIN_DATES} clear dates)",
                                                             "status": "missing", "valid_pixel_count": None, "total_pixel_count": None, "spread": None}],
                                   "siterra:quality_flags": []},
                    "links": [{"rel": "collection", "href": "../collection.json", "type": "application/json"},
                              {"rel": "parent", "href": "../collection.json", "type": "application/json"},
                              {"rel": "root", "href": "../../catalog.json", "type": "application/json"}],
                    "assets": {}}
            idir = os.path.join(bdir, pid)
            os.makedirs(idir, exist_ok=True)
            ipath = os.path.join(idir, f"{pid}.json")
            dump(item, ipath)
            item_links.append({"rel": "item", "href": f"./{pid}/{pid}.json", "type": "application/geo+json",
                               "file:checksum": "1220" + sha(ipath)})
            continue
        s = summarize(mdir)
        summaries[pid] = s
        j = s["j"]
        if (y, m) == (2022, 1):
            for tile in ("29SQR", "29RQQ"):
                ok_items = [x for x in j["items"] if x["tile"] == tile and x["pixels_kept"] >= GUARD_MIN_PIXELS]
                old = [x["red_median_dn_kept"] for x in ok_items if x["baseline"] < "04.00"]
                new = [x["red_median_dn_kept"] for x in ok_items if x["baseline"] >= "04.00"]
                if old and new:
                    guard.append((tile, float(np.median(old)), float(np.median(new))))
                else:
                    guard_skipped.append(f"{tile} (no item on one side with at least {GUARD_MIN_PIXELS} clear pixels)")
        dates = j["dates_with_kept_pixels"]
        if s["accepted"] == 0 and not dates:
            status, reason = "missing", "No clear Sentinel-2 observation of the catchment in this month"
        elif s["frac"] < MIN_AREA:
            status = "insufficient"
            reason = (f"Insufficient observations: {s['frac'] * 100:.1f}% of the catchment had at least {MIN_DATES} clear dates "
                      f"(policy {MIN_AREA * 100:.0f}%)")
        else:
            status, reason = "available", None
        if dates:
            years.add(y)
        flags = ["reduced_qa_fallback"]
        if s["snow_pct"] is not None and s["snow_pct"] >= SNOW_FLAG:
            flags.append("snow_suspected")
        if len(dates) < LOW_DATES:
            flags.append("low_scene_count")
        meas = {"metric": "ndvi_area_median", "value": round(s["median"], 4) if status == "available" else None, "unit": "1",
                "aggregation": f"Area median of per-pixel monthly medians over accepted pixels (at least {MIN_DATES} clear dates)",
                "status": "available" if status == "available" else ("missing" if status == "missing" else "excluded"),
                "valid_pixel_count": s["accepted"], "total_pixel_count": s["total"],
                "spread": {"kind": "spatial_iqr", "lower": round(s["q25"], 4), "upper": round(s["q75"], 4)} if status == "available" else None}
        statuses[pid] = status
        props = {"title": f"Catchment NDVI, {calendar.month_name[m]} {y}", "datetime": None,
                 "start_datetime": f"{y}-{m:02d}-01T00:00:00Z",
                 "end_datetime": f"{y}-{m:02d}-{calendar.monthrange(y, m)[1]:02d}T23:59:59Z",
                 "created": now, "raster:spatial_resolution": 10,
                 "siterra:period_status": status, "siterra:missing_reason": reason,
                 "siterra:area_valid_fraction": round(s["frac"], 4),
                 "siterra:observation_dates": dates, "siterra:measurements": [meas], "siterra:quality_flags": flags}
        if s["cloud_pct"] is not None:
            props["eo:cloud_cover"] = round(s["cloud_pct"], 2)
            props["eo:snow_cover"] = round(s["snow_pct"], 2)
        links = [{"rel": "collection", "href": "../collection.json", "type": "application/json"},
                 {"rel": "parent", "href": "../collection.json", "type": "application/json"},
                 {"rel": "root", "href": "../../catalog.json", "type": "application/json"}]
        for it in j["items"]:
            links.append({"rel": "derived_from", "href": it["self"], "type": "application/geo+json",
                          "title": f"{it['id']} (baseline {it['baseline']}, {it['orbit']}; kept pixels {it['pixels_kept']})",
                          "siterra:retrieved_datetime": it["retrieved"]})
        item = {"type": "Feature", "stac_version": "1.1.0",
                "stac_extensions": ["https://stac-extensions.github.io/raster/v2.0.0/schema.json",
                                    "https://stac-extensions.github.io/eo/v2.0.0/schema.json", EXT],
                "id": pid, "collection": BUNDLE_ID, "geometry": mapping(simple), "bbox": bbox,
                "properties": props, "links": links, "assets": {}}
        idir = os.path.join(bdir, pid)
        os.makedirs(idir, exist_ok=True)
        ipath = os.path.join(idir, f"{pid}.json")
        dump(item, ipath)
        item_links.append({"rel": "item", "href": f"./{pid}/{pid}.json", "type": "application/geo+json",
                           "file:checksum": "1220" + sha(ipath)})

    zero_bad = sum(s["zero_with_no_obs"] for s in summaries.values())
    guard_ok = bool(guard) and all(abs(n - o) < 500 for _, o, n in guard)
    checks = [
        {"name": "recompute_sample_period", "passed": rdiff <= TOL and rsame,
         "detail": f"period_{SAMPLE[0]}-{SAMPLE[1]:02d} re-run from fresh item JSON and COG reads into a separate directory: area median {b['median']:.5f} vs pipeline value {a['median']:.5f} (stored {a['median']:.4f}), IQR {b['q25']:.5f} to {b['q75']:.5f} vs {a['q25']:.5f} to {a['q75']:.5f}, accepted pixels {b['accepted']} vs {a['accepted']}; largest difference {rdiff:.6f}, tolerance {TOL}"},
        {"name": "nodata_not_zero", "passed": zero_bad == 0,
         "detail": f"DN 0 is no-data and is never used; pixels with no clear date stay NaN (pixels with a value but no date: {zero_bad}); periods without accepted coverage carry no value"},
        {"name": "units_and_scale", "passed": guard_ok,
         "detail": "Reflectance = DN / 10000 for every baseline, no offset applied (four pixel-paired tests, observation-preprocessing section 2). Guard, January 2022, median red DN of kept pixels by tile, baseline before 04.00 vs 04.00 or later: "
                   + "; ".join(f"{t} {o:.0f} vs {n:.0f}" for t, o, n in guard)
                   + (f"; not compared: {', '.join(guard_skipped)}" if guard_skipped else "")
                   + f" (scenes with at least {GUARD_MIN_PIXELS} clear pixels only; this minimum was added after the first build of this bundle flagged three cloud-covered 29RQQ scenes; fail if 500 DN or more apart)"},
        {"name": "period_alignment", "passed": True,
         "detail": "Each Item's observation dates fall inside its month; STAC bounds run from the first to the last second of the month"},
        {"name": "attribution_present", "passed": True, "detail": "Copernicus Sentinel notice with the actual years and the Copernicus DEM notice are in siterra:attribution"},
        {"name": "visual_inspection_sample", "passed": bool(inspected),
         "detail": INSPECTION if inspected else "Not yet inspected"},
    ]
    for pid, s in summaries.items():
        assert all(d.startswith(pid[7:]) for d in s["j"]["dates"]), pid
    status = "validated" if all(c["passed"] for c in checks) else "failed"
    yr = f"{min(years)}-{max(years)}"
    ly, lm = map(int, last.split("-"))
    collection = {
        "type": "Collection", "stac_version": "1.1.0",
        "stac_extensions": ["https://stac-extensions.github.io/processing/v1.3.0/schema.json",
                            "https://stac-extensions.github.io/file/v2.1.0/schema.json", EXT],
        "id": BUNDLE_ID, "title": "Catchment NDVI, Sentinel-2 monthly",
        "description": (f"Monthly NDVI over the Ait Bouguemez valley catchment ({GEO_ID} revision {GEO_REV}) from Sentinel-2 L2A "
                        f"(Earth Search legacy sentinel-2-l2a), {first} to {last}, at 10 m in EPSG:32629: per-pixel median of clear "
                        f"dates, area median and spatial IQR over pixels with at least {MIN_DATES} clear dates. A period is available "
                        f"when such pixels cover at least {MIN_AREA * 100:.0f}% of the catchment.\n\nReduced QA (scene classification only): "
                        "snow and terrain shadow can survive the mask. The spatial IQR is variability across pixels, not a confidence "
                        "interval. Item geometries are the catchment simplified to one DEM pixel; the exact frozen geometry is the "
                        "analysis_geometry asset. The input set is exactly the derived_from items of each period: one item per tile and sensing date, the newest processing baseline, skipping a duplicate with no clear pixels over the catchment when a twin has some. Display rasters and value grids are not part of this version.")
                       + (("\n\n" + REVISION_NOTE) if REVISION_NOTE else ""),
        "license": "other",
        "providers": [
            {"name": "Copernicus Sentinel-2 (European Union, ESA)", "roles": ["producer", "licensor"]},
            {"name": "Sinergise", "roles": ["processor"], "url": "https://registry.opendata.aws/sentinel-2/"},
            {"name": "AWS", "roles": ["host"], "url": "https://registry.opendata.aws/sentinel-2-l2a-cogs/"},
            {"name": "Element 84 Earth Search", "roles": ["processor", "host"], "url": "https://earth-search.aws.element84.com/v1/"},
            {"name": "Siterra science pipeline", "roles": ["processor"],
             "processing:lineage": "Deduplicated tile-date items (newest baseline), DN/10000 without offset, scene classification classes 4 and 5 kept, NDVI per observation, same-date tiles merged, per-pixel monthly median and date count, acceptance policy, area summaries over the frozen catchment (docs/reference/observation-preprocessing.md).",
             "processing:software": {"siterra-science": f"{VERSION}+uncommitted", "python": sys.version.split()[0],
                                     "rasterio": rasterio.__version__, "gdal": rasterio.__gdal_version__, "numpy": np.__version__}},
        ],
        "extent": {"spatial": {"bbox": [bbox]},
                   "temporal": {"interval": [[f"{first}-01T00:00:00Z", f"{ly}-{lm:02d}-{calendar.monthrange(ly, lm)[1]:02d}T23:59:59Z"]]}},
        "summaries": {"siterra:period_status": sorted(set(statuses.values())),
            "siterra:quality_flags": ["reduced_qa_fallback", "snow_suspected", "low_scene_count"]},
        "assets": {"analysis_geometry": {"href": "./analysis-geometry.geojson", "type": "application/geo+json",
                                         "title": f"Frozen analysis geometry {GEO_ID}, revision {GEO_REV}", "roles": ["metadata"],
                                         "file:checksum": "1220" + sha(geo_out), "file:size": os.path.getsize(geo_out)}},
        "created": now,
        "siterra:status": status,
        "siterra:variable": "ndvi_monthly_median",
        "siterra:dataset": {"id": "sentinel-2-l2a", "version": None,
                            "access_route": "Earth Search STAC API https://earth-search.aws.element84.com/v1/, collection sentinel-2-l2a (legacy), COGs on sentinel-cogs.s3.us-west-2.amazonaws.com read by window",
                            "resolution_note": None},
        "siterra:geo_selection": {"id": GEO_ID, "revision": GEO_REV, "boundary_role": "hydrological_unit", "area_m2": area_m2,
                                  "area_method": "Count of 10 m analysis pixels whose centres fall inside the frozen polygon, EPSG:32629"},
        "siterra:method": {
            "id": "s2_ndvi_monthly_median", "version": VERSION, "analysis_crs": "EPSG:32629",
            "parameters": {"tiles": ["29SQR", "29RQQ"], "dedup": "newest processing baseline, then highest item sequence, per tile and date",
                           "reflectance": "DN / 10000, no offset for any baseline", "scl_keep_classes": [4, 5],
                           "ndvi_denominator_min": 0.0001, "same_date_merge": "29SQR first, 29RQQ fills gaps",
                           "min_dates_per_pixel_month": MIN_DATES, "min_area_coverage": MIN_AREA,
                           "snow_flag_percent": SNOW_FLAG, "low_scene_count_dates": LOW_DATES, "crop_mask": None,
                           "recompute_tolerance": TOL},
            "reference_period": None,
            "operation_order": ["keep the newest processing baseline per tile and sensing date",
                                "read red, nir (10 m) and scene classification (20 m, repeated 2 x 2) on one EPSG:32629 grid",
                                "scale DN to reflectance by 1/10000 without offset",
                                "keep scene classification classes 4 and 5",
                                "compute NDVI per accepted observation",
                                "merge tiles of the same sensing date",
                                "take the per-pixel monthly median and count the dates",
                                f"accept pixels with at least {MIN_DATES} dates",
                                "summarize the area median and spatial IQR over accepted pixels"]},
        "siterra:attribution": [f"Contains modified Copernicus Sentinel data {yr}",
                                "Catchment derived by Siterra from Copernicus DEM GLO-30 (2021 release)",
                                "Produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved",
                                "The organisations in charge of the Copernicus programme by law or by delegation do not incur any liability for any use of the Copernicus WorldDEM-30"],
        "siterra:limitations": [
            "Reduced QA (scene classification only): snow, snow edges and terrain shadow can survive the mask.",
            "In winter months the accepted pixels favour the valley floor and south-facing slopes, because snow and shade remove the others; the area value then describes those pixels, not the whole catchment.",
            "The spatial IQR is variability across pixels, not a confidence interval.",
            "No cropland or irrigation mask is applied in this version: valley-floor fields and orchards are inside the summary.",
            "Processing baselines differ across the record (mostly 05.00 for 2019 to 2021, 04.00 for 2022, 05.09 to 05.11 later); same-acquisition comparisons differ by about 0.002 to 0.003 reflectance.",
            "Seven years is a short record; nothing here is a trend or a degradation finding.",
            "Cloud and snow shares are counted per tile observation; the 29SQR and 29RQQ overlap counts twice.",
        ] + ([f"{len(pending)} of {len(statuses)} periods were not processed in this revision and are shown as gaps: " + ", ".join(p[7:] for p in pending) + "."] if pending else []) + ([REVISION_NOTE] if REVISION_NOTE else []),
        "siterra:checks": checks,
        "links": [{"rel": "root", "href": "../catalog.json", "type": "application/json"},
                  {"rel": "parent", "href": "../catalog.json", "type": "application/json"},
                  *item_links,
                  {"rel": "derived_from", "href": "https://earth-search.aws.element84.com/v1/collections/sentinel-2-l2a",
                   "type": "application/json", "title": "Earth Search sentinel-2-l2a (legacy collection)"},
                  {"rel": "license", "href": "https://cds.climate.copernicus.eu/licences/ec-sentinel",
                   "title": "Legal notice on the use of Copernicus Sentinel data and service information (SCI-18)"},
                  {"rel": "license", "href": "https://dataspace.copernicus.eu/sites/default/files/media/files/2025-06/copernicus_contributing_mission_data_access_v2_cop_dem_licenses.pdf", "title": "Licence for Copernicus DEM instance COP-DEM-GLO-30-F Global 30m Full, Free & Open (analysis geometry)"},
                  {"rel": "processing-software", "href": "./uv.lock", "type": "application/toml",
                   "title": "Pipeline lockfile (uv)", "file:checksum": "1220" + sha(lock_out)}],
    }
    if STAC_VERSION:
        collection["stac_extensions"].append(VERSION_EXT)
        collection["version"] = STAC_VERSION
    cpath = os.path.join(bdir, "collection.json")
    dump(collection, cpath)
    cat_path = os.path.join(bundles_dir, "catalog.json")
    cat = json.load(open(cat_path)) if os.path.exists(cat_path) else {
        "type": "Catalog", "stac_version": "1.1.0", "id": "siterra-bundles",
        "description": "Siterra observation bundles. Each child is one bundle (a STAC Collection).",
        "stac_extensions": ["https://stac-extensions.github.io/file/v2.1.0/schema.json"],
        "links": [{"rel": "root", "href": "./catalog.json", "type": "application/json"}]}
    cat["links"] = [l for l in cat["links"] if l.get("href") != f"./{BUNDLE_ID}/collection.json"]
    cat["links"].append({"rel": "child", "href": f"./{BUNDLE_ID}/collection.json", "type": "application/json",
                         "file:checksum": "1220" + sha(cpath)})
    # child links sorted by bundle id, so a rebuild changes only what changed
    cat["links"] = [l for l in cat["links"] if l["rel"] != "child"] + sorted((l for l in cat["links"] if l["rel"] == "child"), key=lambda l: l["href"])
    dump(cat, cat_path)
    print(json.dumps({"status": status, "pending": len(pending), "periods": len(summaries), "by_status": {k: sum(1 for v in statuses.values() if v == k) for k in ("available", "insufficient", "missing")}, "guard": guard,
                      "recompute": [a["median"], b["median"], rdiff], "collection_sha256": sha(cpath)}, indent=1))
    for c in checks:
        print(("PASS " if c["passed"] else "FAIL ") + c["name"] + ": " + c["detail"][:160])


_rn = [a for a in sys.argv if a.startswith("--revision-note=")]
REVISION_NOTE = open(_rn[0].split("=", 1)[1]).read().strip() if _rn else None
_sv = [a for a in sys.argv if a.startswith("--stac-version=")]
STAC_VERSION = _sv[0].split("=", 1)[1] if _sv else None
VERSION_EXT = "https://stac-extensions.github.io/version/v1.2.0/schema.json"

if __name__ == "__main__":
    flag = [a for a in sys.argv if a.startswith("--inspected=")]
    INSPECTION = open(flag[0].split("=", 1)[1]).read().strip() if flag else None
    main(bool(flag))
