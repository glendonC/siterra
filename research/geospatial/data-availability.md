# Data availability probe

Public. Run 2026-10-26 (UTC 2026-10-27T01:05Z–01:36Z) with stdlib Python, catalog JSON queries, HTTP HEAD and small HTTP range reads. No credentials, no installs, no imagery or rainfall rasters downloaded. Counts describe catalog metadata, not usable clear observations: tile-level cloud percentages are not AOI cloud cover and say nothing about snow or terrain shadow. AOI = recommended valley catchment preview ([study area](study-area.md)). Item lists and summaries are kept locally in `data/interim/probe/` (gitignored).

## Sentinel-2 L2A

Queries: POST `/search`, envelope bbox `[-6.60, 31.50, -6.10, 31.80]`, one request series per calendar month 2019-01 to 2025-12, `limit 100` with `next` pagination, fields extension to drop assets. Coverage of the AOI by each item footprint was estimated on a 0.004° point grid.

| Route | Result for the AOI |
| --- | --- |
| Earth Search `sentinel-2-c1-l2a` (exists; "Collection 1") | 2,255 items intersect. **Gaps: 2019-01 and 2019-02 absent; 2022-02 through 2022-11 absent** (2022 has 35 items in January, March and December only). Processing baseline 05.00 for 2019–2021 and 05.09–05.11 for 2022–2025. Asset keys `red` (B04), `nir` (B08), `scl`; red/nir `raster:bands` scale 0.0001, offset −0.1, nodata 0, uint16; SCL 20 m. |
| Earth Search `sentinel-2-l2a` (legacy) | 3,765 items intersect; every month 2019–2025 present. Mixed baselines 02.11–05.11; 1,091 tile+date groups hold more than one item (reprocessed duplicates). Item property `earthsearch:boa_offset_applied` varies (true/false). Tested 2026-10-27 by pixel-paired comparison of same-acquisition duplicates: the flag changed no stored value, and baseline 04.00 and later values are already on the pre-04.00 scale (rule and evidence in [preprocessing](../../docs/reference/observation-preprocessing.md#default-route-earth-search-legacy-sentinel-2-l2a)). Asset keys `red`, `nir`, `scl`. |
| Earth Search `sentinel-2-pre-c1-l2a` | 0 items for this AOI. |
| Planetary Computer `sentinel-2-l2a` (fallback) | 3,006 items intersect; every month present; fewer full-coverage dates in 2021-10 (2) and 2024-09 (4). Mixed baselines 02.12–05.11 with duplicates (444 tile+date groups). Asset keys `B04`, `B08`, `SCL`; no scale/offset metadata on assets (offset must come from product metadata). Asset access needs PC URL signing (not tested). |

Tiles and orbits: MGRS **29SQR** and **29RQQ** (UTM 29N), plus 30STA touching about 2% of the AOI (same passes, different zone; ignore or deduplicate). Relative orbit **R094** covers the AOI with 29SQR (about 98%) plus 29RQQ for the southern edge; **R137** covers about 87% (swath edge crosses the east of the AOI). Platforms Sentinel-2A, 2B and, from 2025, 2C.

Distinct acquisition dates with union footprint covering at least 99% of the AOI, per year:

| Year | C1 (Earth Search) | Legacy (Earth Search) | Planetary Computer |
| --- | --- | --- | --- |
| 2019 | 55 (from March) | 73 | 71 |
| 2020 | 72 | 72 | 70 |
| 2021 | 73 | 73 | 68 |
| 2022 | 7 | 73 | 71 |
| 2023 | 72 | 73 | 73 |
| 2024 | 73 | 73 | 71 |
| 2025 | 88 | 88 | 88 |

Typical month: about 12 distinct dates with any AOI overlap and about 6 full-coverage dates (7–9 in 2025). Tile-level `eo:cloud_cover` (C1, n = 2,255): median 4.0%, quartiles 0.05% / 25.4%, share below 20% = 0.72 (legacy 0.71, PC 0.70). Share below 20% by calendar month, all years: lowest March (0.57) and April (0.61), highest July (0.84).

Consequences: a C1-only Earth Search series cannot represent most of 2022, a nationally reported drought year (SCI-25). The legacy and PC routes are complete but require deduplication and baseline 04.00 offset harmonization; that is a separate normalization path from Earth Engine `S2_SR_HARMONIZED` (SCI-07), which was not probed (needs an account). Earth Engine coverage for this AOI is **not verified**.

## CHIRPS v3.0 monthly

| Item | Finding |
| --- | --- |
| Directory | `https://data.chc.ucsb.edu/products/CHIRPS/v3.0/monthly/` has `africa/` (bils, pngs, tifs), `global/` (bils, cogs, netcdf, tifs) and `latam/`. Preliminary products are in a separate tree, `.../v3.0/prelim/monthly/global/tifs/`, with **identical filenames** (for example `chirps-v3.0.2026.09.tif`); key provenance on the full URL path, never the filename. |
| Naming | Monthly GeoTIFF `chirps-v3.0.YYYY.MM.tif`; global COG `chirps-v3.0.YYYY.MM.cog`; BIL archives `v3p0chirpsYYYYMM.tar.gz`; one global NetCDF `chirps-v3.0.monthly.nc` (8.3 GiB, avoid). |
| Latest final month | **2026-09** in `monthly/` (Africa tif posted 2026-10-15 16:47 GMT). Archive starts 1981-01 (549 files). README: final data typically complete in the third week of the following month. Latest preliminary month: 2026-09 (posted 2026-10-02). |
| Africa subset | Exists. `africa/tifs/chirps-v3.0.2026.09.tif`: 5,885,852 bytes; 1500 × 1600 px; float32; LZW; strip-organized (RowsPerStrip 1), IFD at end of file, so **not a COG**; EPSG:4326; origin −20° E, 40° N; pixel 0.05° (stored as 0.05000000074505806). No GDAL nodata tag found: determine no-data handling from values and documentation, not from the filename. Typical size 4.7–5.6 MiB. |
| Global COG | `global/cogs/chirps-v3.0.2026.09.cog`: 31,101,623 bytes; 7200 × 2400 px; 512 px tiles; LZW; 4 overviews; GDAL COG layout; origin −180° E, 60° N. Supports range reads of the AOI window. |
| AOI support | Recommended catchment touches 31 cells (3 fully inside; effective 15.8 cells of about 26.4 km2). Commune polygon: 33 cells (effective 19.4). |

## Terrain

Copernicus DEM GLO-30 on AWS (`copernicus-dem-30m`, eu-central-1, 2021 release, COGs with DEFLATE, floating-point predictor, average-downsampled overviews per the bucket readme): **`Copernicus_DSM_COG_10_N31_00_W007_00_DEM/…_DEM.tif` covers the whole AOI** (HEAD 200, 41,088,635 bytes, ETag `7260ba223188db19ee7390f60c998048`). The eastern neighbour `…_N31_00_W006_00_DEM.tif` exists (40,634,565 bytes) and is not needed unless the AOI extends east of 6° W. Earth Search also lists the tile as STAC item `Copernicus_DSM_COG_10_N31_00_W007_00_DEM` (collection `cop-dem-glo-30`). About 6.8 MB of overview tiles were read by HTTP range request to build the catchment preview; the full-resolution tile was not downloaded.

## Landsat Collection 2 Level-2 (`landsat-c2-l2`)

**[V] Verified 2026-10-28:** Anonymous STAC discovery (`POST https://planetarycomputer.microsoft.com/api/stac/v1/search`, collection `landsat-c2-l2`) and anonymous SAS-signed COG window reads (`GET https://planetarycomputer.microsoft.com/api/sas/v1/token/landsateuwest/landsat-c2`) work without credentials over the frozen Aït Bouguemez catchment bounding box `[-6.54125, 31.49431, -6.14208, 31.75653]`:

| Item | Finding [V] |
| --- | --- |
| WRS-2 coverage | Path `201`, row `038` covers the entire catchment in a single scene (`EPSG:32629`, 30 m grid; catchment bounding-box window is `1000 × 1239` pixels). |
| Test scene verified | `LC09_L2SP_201038_20250827_02_T1` (Landsat 9 OLI/TIRS, 2025-08-27, `eo:cloud_cover` 0.0%). Assets `red` (`SR_B4`), `nir08` (`SR_B5`) and `qa_pixel` are Cloud-Optimized GeoTIFFs in container `landsateuwest/landsat-c2`. |
| Scaling and QA metadata | `raster:bands` declares `uint16`, `nodata: 0`, `scale: 0.0000275` (`2.75e-05`), `offset: -0.2`, `spatial_resolution: 30`. `qa_pixel` carries `classification:bitfields` (`fill`, `dilated_cloud`, `cirrus`, `cloud`, `cloud_shadow`, `snow`, `clear`, `water` and confidence bits). In the test window, 1,238,541 of 1,239,000 pixels were flagged clear (`qa_pixel = 21824`), with a window median NDVI of `0.1681`. |

## Not completed

Earth Engine collection counts; Element 84 documentation for `earthsearch:boa_offset_applied` (not found; its effect was tested instead, see above). CHIRPS pixel values were inspected on 2026-10-27: no-data is −9999 over the ocean, no land cell over the catchment is missing in any month from 1991 to 2025, and the unit is declared as mm/month in the official monthly NetCDF.
