# Observation preprocessing

Specification version 0.2.

Public method proposal, 2026-10-26; v0.2 adds the default access route found by the [availability probe](../../research/geospatial/data-availability.md) and the [catchment](../../research/geospatial/study-area.md). Not executable production code and not an executed analysis. Dataset definitions and access routes: [inventory](data-sources-and-methods.md). Source register: [bibliography](../../research/science/source-register.md).

## 1. Freeze the area and run manifest

Accept only a versioned geometry with a declared role (`regional_context`, `landscape_sample`, `administrative_unit`, `hydrological_unit` or `validated_management_unit`; P0 default: the valley catchment as `hydrological_unit`). Require valid WGS84 geometry, provenance and permitted use; geometry validity does not validate governance. Save geometry checksum, area in a suitable projected CRS, time intervals (UTC, start inclusive/end exclusive), collections, exact input asset IDs, mask parameters, baseline windows, software version and outputs. Keep tokens/project credentials outside manifests.

For an accepted sample near the cited valley locator, EPSG:32629 (UTM 29N) is the proposed metric analysis CRS; verify the accepted geometry remains in its appropriate zone. Preserve original rasters and record reprojection transforms. Use 10 m optical analysis pixels and native rainfall support; do not manufacture 10 m rainfall cells for analysis.

## 2. Discover and inspect inputs

Request optical scenes for 2019 to 2025 and record complete scene IDs, sensing timestamps, processing baseline and available QA. Deduplicate overlapping tile observations acquired in the same pass/date before counting observations. Inspect a spread of seasons and elevations, including snow and terrain shadows. Define a fixed analysis domain; with WorldCover stratification keep grass/shrub/bare strata separate, identify cropland and forest, and label the static 2021 map as an imperfect context mask. Do not discard naturally sparse areas to improve apparent condition.

### Default route: Earth Search legacy `sentinel-2-l2a`

1. Query month by month for 2019-01 to 2025-12 over the catchment bbox; keep MGRS tiles 29SQR and 29RQQ and drop 30STA duplicates of the same pass. Prefer relative orbit R094, which covers the catchment with two tiles.
2. **Deduplicate**: for each tile and sensing date keep one item, the newest processing baseline, then the highest item sequence (the probe found 1,091 duplicated tile-date groups); skip a duplicate that has no clear pixels (scene classification 4 or 5) over the catchment when a twin has some (`s2-inventory.py --skip-empty`). Record the dropped item IDs. Only the first part of this rule was on this page before any data was read: keep the newest processing baseline. The sequence tiebreak was added on 2026-10-27, to the inventory script at 09:54 EDT and to this page at 12:13 EDT, because the item list held duplicates of one tile and date with the same baseline. The skip clause was added to this page at 12:13 EDT the same day, after an audit found that the rule as written picked items with no clear pixels over the catchment. The previous revision (12, in the first commit, without a version field) documented the clause but kept the newest item. It therefore kept an item with no clear pixels over the catchment on seven tile-dates (29RQQ 2019-04-17, 2019-06-21, 2020-11-12, 2021-06-07, 2021-11-19, 2021-12-22; 29SQR 2020-10-23). Revision 13 applies the clause and recomputes the seven affected months. In five of those cases the twin is an older baseline (02.14, 03.00 or 03.01), so its clear pixels come from an older scene classification. The input set of a bundle is exactly its Items' `derived_from` list: the catalog can gain reprocessed items later (on 2026-10-27 Earth Search listed `_1` twins for two April 2022 dates with no clear pixels over the catchment that the 2026-10-26 inventory did not contain), so a rerun reads those links, not a fresh search.
3. **Harmonize**: on this collection, reflectance = DN / 10000 for every item, whatever the processing baseline. The stored values of baseline 04.00 and later already sit on the pre-04.00 scale, so **do not apply the asset `raster:bands` offset of −0.1** that every 04.00 and later item declares: it would subtract the offset twice. The item property `earthsearch:boa_offset_applied` did not change any stored value in the test below, and no Element 84 documentation for it was found; do not branch on it. Record the rule in the manifest. Never mix harmonized and unharmonized values.

   Evidence (verified 2026-10-27 on red, B04, overview level 3 of 29SQR and 29RQQ, pixel-paired over the same tile and acquisition; a stored −1000 offset would show as a shift near +1000 DN):

   | Same acquisition | Baselines and `boa_offset_applied` | Median paired difference (DN) | Pixels within 1000 ± 50 DN |
   |---|---|---|---|
   | S2A 29SQR 2022-01-13, items `_0` and `_1` | 03.01 false, 05.11 true | −6 | 0.5% |
   | S2B 29SQR 2022-03-19, items `_0` and `_1` | 04.00 true, 05.10 false | +16 | 0.0% |
   | S2C 29RQQ 2024-12-01, items `_2` and `_1` | 05.11 true, 05.11 false | 0 (identical at every percentile) | 0.0% |
   | S2B 29SQR 2020-02-11, items `_0` and `_1` | 02.14 false, 05.00 true | +31 | 0.0% |

   The 05.11 item of 2022-01-13 also has a first-percentile DN of 17, which a stored offset would turn into a reflectance near −0.098. Baselines of one acquisition still differ by about 16 to 31 DN (0.002 to 0.003 reflectance); because deduplication keeps the newest baseline, 2019 to 2021 are mostly 05.00 and 2022 is mostly 04.00, and that mix is a stated limitation of the monthly series. Pipeline guard: where a tile and month hold both a pre-04.00 item and a 04.00 or later item, each with at least 10,000 clear pixels (1 km²) inside the catchment (a minimum added on 2026-10-27 after the first build of the NDVI bundle flagged cloud-covered scenes), fail the bundle if the median red DN of their clear pixels differ by 500 or more. Scenes with fewer clear pixels are left out of the guard: in January 2022 the three 29RQQ scenes after the change kept 85, 6 and 0 clear pixels, and their medians (up to 11,596 DN) were cloud edges, not an offset. With the rule, the NDVI bundle compared 29SQR 1,308 against 1,466 DN and 29RQQ 1,405 against 1,384 DN (for 29RQQ the only usable item from 04.00 on is the 05.11 reprocessing of 13 January).
4. Do not use Collection 1 (`sentinel-2-c1-l2a`) as the sole source: it has no items for this area from February to November 2022.
5. Read only the catchment window from each COG (red, nir at 10 m; scl at 20 m); never download whole tiles when a window suffices.

On the Earth Engine route the harmonized collection replaces steps 2 and 3, and Cloud Score+ is available for step 3 below.

## 3. Mask before computing NDVI

Use scaled B4/B8 reflectance. NDVI = `(B8 − B4) / (B8 + B4)` only where inputs are finite and denominator exceeds a documented numerical tolerance. Preserve valid negative NDVI; do not clip negatives to zero or infer negative biomass.

Proposed conservative mask: reject SCL classes 0, 1, 2, 3, 6, 7, 8, 9, 10, 11 for terrestrial vegetation comparison; keep classes 4/5. Resample categorical SCL by nearest neighbor. Join Cloud Score+ by verified matching scene index and retain `cs_cdf >= 0.60`; reject unmatched QA by default and report its count. This threshold is a starting engineering policy, not site-validated truth. Inspect sensitivity at 0.50 and 0.70. On the default Earth Search route Cloud Score+ is not available, so the SCL-only mask is the P0 policy: version it, review a sample of months manually (winter snow and terrain shadow especially), and carry the visible label "reduced QA (scene classification only)" on every derived product. Never use QA60 alone across its documented historical discontinuity.

Record mask components separately so snow, cloud, water, terrain-darkness and missing-QA exclusions can be inspected. Terrain shadows and snow-edge contamination can survive automated masks; flag suspect imagery rather than declaring all retained pixels clean. Masking dark classes may preferentially remove certain aspects; expose that coverage bias.

Known limitation, found after the bundles were built (post hoc, 2026-10-27): the scene classification can mark cloud as clear. On 2021-11-19 the only kept pixels over the catchment come from the 03.01 baseline item of tile 29RQQ, kept by the skip clause. Its 8 kept pixels have a median red reflectance of about 1.23 and near-infrared of about 1.24, which are cloud values, not surface values. A scan of 128 of the 2,074 items, those with fewer than 10,000 kept pixels, found 25,945 of their 215,505 kept observations above 1.0 in red or near-infrared, in 71 items and 34 months. The other 1,888 items, with 10,000 or more kept pixels, were not scanned and may hold more, so these totals are a lower bound. One of them is known: S2A_29SQR_20210309_1_L2A (March 2021) has 10,971 of its 18,386 kept observations above 1.0 in red. The current bundles keep these observations. A rule that treats a kept observation above 1.0 in red or near-infrared as not valid is proposed, not applied: it was written after seeing these counts, so it would be a post hoc change and needs its own revision. Within the scanned items only, the rule would change no period status and move no stored area median by more than 0.0001. That holds for the scanned items alone, and the stored quartiles were not checked. Before any revision applies the rule, all 2,074 items would be scanned. A second scan read every April item from 2019 to 2025 (165 items), so April is complete: 26,352 of 264,329,672 kept observations are above 1.0, in 118 items. Under the proposed rule, a bound on the stored composites and departure grids shows that no April departure changes sign. April departures could move by at most 0.0002, area median NDVI by at most 0.0006 (April 2021), and the stored quartiles by up to about 0.001. Two changes would be certain: the observation date 2025-04-10 would be lost, and the accepted fractions of April 2019 and April 2020 would fall by 0.0001, with no change in status. These are bounds, not a recompute.

## 4. Composite and compare consistently

For every month: compute NDVI per valid observation, then per-pixel temporal median; retain per-pixel valid counts. Proposed P0 acceptance policy: at least three distinct observation dates for a pixel-month and at least 70% accepted area coverage for a spatial summary. Show “insufficient observations” below the policy threshold, with counts. These values control display completeness, not ecological confidence; adjust only with a versioned documented rationale after inspection.

For baseline and comparison maps use the same seasonal window and comparable mask. Report zonal median and interquartile spatial range over accepted pixels, valid area fraction and observation dates. IQR is spatial variability, not a confidence interval. For before/after differences use common-valid support and report retained area; if support becomes inadequate, withhold the difference. No interpolated line across missing months by default.

Calculate a 2019 to 2025 reference median separately for each calendar month at each pixel, requiring at least four valid reference years under the proposed policy. Compute departure as current NDVI minus the matching reference, then summarize departures over common-valid area. This differs from subtracting two independently sampled zonal medians: choose and preserve the pixel-first operation. In-baseline years contribute to the descriptive reference; use a leave-one-year-out reference if evaluating unusually low years rather than describing departures. Do not call this short period a climate normal or a long-term degradation trend.

Use sequential colors for raw NDVI with a fixed documented range and a diverging zero-centered scale for differences. Missing data must be distinct from low vegetation. Offer a table equivalent and exact period/source inspection.

## 5. Rainfall context

Read CHIRPS v3.0 Final monthly COGs from the official directory by HTTP range for the area window, discovering the real available files first, and freeze the URLs, each file's server validator (ETag or Last-Modified) and size, the checksum of the extracted window and the retrieval dates ([data sources and methods](data-sources-and-methods.md)). Confirm metadata units, no-data values, grid orientation and completeness; do not infer them from filenames. Cross-check one month if computing totals from the Earth Engine daily RNL alternate route. Require every expected daily record for that alternate; missing days are missing monthly totals, not zero.

Use fractional area weights for native CHIRPS cells intersecting the accepted landscape context. If the area occupies only one or a few cells, report the number and show the coarse grid. A clipped pixel does not become a local rain gauge. Compute each calendar month's 1991 to 2020 mean with all 30 valid reference years; mark incomplete reference support explicitly. Report current monthly total, departure in mm and optionally percent of normal only where the reference is positive and meaningful. No SPI label unless a separate distribution-fitting and validation procedure is implemented.

Align rainfall with NDVI periods, show prespecified antecedent 0 to 3 month windows and snow/phenology caveats. Do not select only the lag with the largest correlation. No causal percentage attribution, rainfall-residual grazing index or statistical inference from millions of spatially correlated pixels.

## 6. Terrain and delivery

Derive elevation bins and aspect from the frozen DEM using a metric grid; preserve the DEM's real resolution and metadata. For slope, document reprojection and operator before any mosaic. DEM-derived hillshade is a visualization, not observed pasture health or an erosion rate. Use elevation/aspect strata to reveal confounding and missingness; do not imply terrain correction validates causality.

Export each observation bundle in the format of [Bundle output](#bundle-output): period-keyed aggregate values, display rasters, small Cloud Optimized GeoTIFF value grids where suitable, and source and attribution metadata. Generate display rasters separately with a pinned style and transform. Browser interpolation is visual only. Precompute expensive work, cache by bundle checksum and load periods on demand. Set practical performance budgets after measuring a real export; this package supplies no invented processing-time benchmark.

### Bundle output

Each bundle is a STAC 1.1.0 Collection with one Item per period, published as a static catalog. The profile, the `siterra:` fields and the rules a validator can check are in [`schemas/stac/siterra-extension.schema.json`](../../schemas/stac/siterra-extension.schema.json); a synthetic [Collection](../../schemas/examples/stac-collection-ndvi.json) and [Item](../../schemas/examples/stac-item-ndvi-2022-04.json) show every field. How the application imports a bundle into case records is in [data contracts](data-contracts.md#observation-bundles).

```
data/bundles/
  catalog.json                      root Catalog, one child link per bundle
  <bundle-id>/
    collection.json                 the bundle
    analysis-geometry.geojson       frozen analysis geometry
    uv.lock                         pipeline lockfile
    <period-id>/
      <period-id>.json              one period
      overview.webp                 display raster (or .png)
      value-grid.tif                value grid (Cloud Optimized GeoTIFF, optional)
```

| Recorded fact (sections 1 to 5) | Where it is written |
|---|---|
| Geometry, revision, role, checksum, area and area method | Collection asset `analysis_geometry` (GeoJSON, role `metadata`, with `file:checksum`); `siterra:geo_selection` (ID, revision, boundary role, area in m², area method); Item `geometry` and `bbox` in WGS 84 |
| Dataset, version and access route | `siterra:dataset`; providers with roles `producer`, `licensor` and `host` |
| Exact inputs and retrieval dates | One `derived_from` link per input scene Item or file, with `siterra:retrieved_datetime`, and `file:checksum` when the whole file was retrieved and hashed |
| Method, analysis CRS, parameters, reference window and operation order | `siterra:method` (reference period bounds are Siterra dates, end exclusive) |
| Software version and lockfile | Provider with role `processor`: `processing:lineage` and `processing:software` (pipeline version with the Git commit as SemVer build metadata, Python version); the lockfile linked with rel `processing-software` and its `file:checksum` |
| Time interval of each period | Item `id` `period_YYYY-MM`; `start_datetime`, `end_datetime`, `datetime: null` (see below) |
| Period status, observation dates and quality labels | `siterra:period_status` with `siterra:missing_reason`, `siterra:observation_dates`, `siterra:quality_flags` (every product of the scene-classification-only route carries `reduced_qa_fallback`); a missing period is an Item without assets |
| Zonal median, spatial IQR, valid counts and area coverage | `siterra:measurements` (metric, value, unit, aggregation, status, valid and total pixel counts, spread) and `siterra:area_valid_fraction` |
| Display raster, palette and fixed range | Asset with role `overview` (WebP or PNG in EPSG:3857 with `proj:bbox` and `proj:shape`; the map's corner coordinates are the inverse Web Mercator of `proj:bbox`), `siterra:color_scale` and `siterra:domain` |
| Value grid for inspection | Optional asset with role `data`: analysis CRS (`proj:code`, `proj:shape`, `proj:transform`), one band with `nodata`, `data_type`, `unit` and `statistics`; the analysis pixel size in Item `raster:spatial_resolution` (approximate metres for degree grids, with `siterra:dataset.resolution_note`) |
| Cloud and snow shares, where quantified | `eo:cloud_cover` and `eo:snow_cover`: percent of candidate pixel observations inside the geometry classed as cloud (scene classification 8, 9, 10) or snow (11) during the period |
| Checks and their outcome | `siterra:checks`; `siterra:status: validated` only if every check passed, otherwise `failed`; optionally a `processing-validation` link to a report |
| Attribution and limitations | `siterra:attribution` (exact display strings) and `siterra:limitations`; the Collection `description` repeats limitations for people |
| License | Collection `license`: one SPDX identifier, or `other` with one `license` link per source licence |

Rules that follow from the method:

- Period bounds: Siterra periods are end-exclusive: `period_2022-04` covers 2022-04-01T00:00:00Z up to, but not including, 2022-05-01T00:00:00Z. STAC `start_datetime` and `end_datetime` are inclusive bounds, so `end_datetime` is the last second of the month (`2022-04-30T23:59:59Z`) and `datetime` is null because a monthly composite has no single acquisition time. The period ID stays authoritative: the importer derives start and exclusive end from it and rejects an Item whose STAC bounds disagree.
- Coverage is not `valid_percent`: `siterra:area_valid_fraction` is the accepted share of the analysis geometry's area and is the figure the 70% coverage policy applies to. STAC `statistics.valid_percent` on a raster band is the share of all raster values that are not nodata, including pixels outside the geometry, so it differs whenever the geometry does not fill its bounding rectangle; it never drives the coverage policy or a displayed coverage figure.
- Missing stays missing: A measurement that is not `available` has a null value; a period without accepted observations has no assets and keeps its Item so the gap stays visible.
- **Chart numbers come from `siterra:measurements`**, never from display rasters; the value grid supports inspection only.
- Integrity: Every asset and every Item link carries `file:checksum` (SHA-256 as a multihash, `1220` followed by 64 hexadecimal digits), so the checksum of `collection.json` pins the whole bundle.
- Frozen bundles are not edited: A corrected bundle is a new bundle with a new ID that declares the version extension and links the bundle it replaces with rel `predecessor-version`; the replaced bundle's files stay byte-identical. A bundle computed on a provisional input, such as the preview catchment geometry, sets `experimental: true`.
- One licence per field: STAC 1.1.0 allows an SPDX expression in `license`, but its JSON Schema pattern rejects spaces, so an expression such as `CC-BY-4.0 AND LicenseRef-Copernicus-DEM` fails validation; use `other` with `license` links instead.
- Static layers are Collection assets: Layers that do not change by period (sampling strata, the cropland mask, terrain derivatives) are assets of the Collection with role `data` or `metadata` and their own checksums, never Items with invented period IDs; recipe results that are not per period (for example phenology descriptors over the reference window) follow the same rule.

## 7. Acceptance checks before use

- All values have real input IDs, checksums, units, dates and geometry references; independently recalculate one sample statistic.
- No-data and cloud/snow pixels never become zero; all-empty months remain absent.
- Source scaling, optical harmonization and join coverage are checked on representative scenes.
- Before/after support, quality thresholds, baseline years, resampling and operation order are identical or explicitly explained.
- Map, chart, brief and downloaded table share the same measurement/period revision.
- Rainfall remains at its real support scale, version is constant and records are complete.
- A reviewer can inspect quality masks and reproduce the observation without an LLM doing numerical arithmetic.
- Every interpretation retains context/observation/hypothesis/scenario labels. No unseen field work or unmeasured outcomes.
