# Science pipeline

The offline pipeline that builds Siterra's observation bundles in [`data/bundles/`](../data/bundles/catalog.json) as a STAC static catalog ([observation preprocessing](../docs/reference/observation-preprocessing.md#bundle-output), [`schemas/stac/`](../schemas/stac/siterra-extension.schema.json)). It reads public data by HTTP range request, computes everything deterministically, and records its inputs, method, checks and attribution in each bundle's manifest. No model computes or edits a number here.

Python 3.12 or 3.13 with the pins in [`uv.lock`](uv.lock), resolved with `exclude-newer = 2026-10-14` (the two-week rule in [stack versions](../research/technology/stack-versions.md)). Every script imports only permissively licensed packages, apart from two unmodified components that come with them: `certifi` (MPL-2.0) and the GEOS library inside the `shapely` wheel (LGPL-2.1). `corpus-fetch.py` also needs poppler's `pdftotext` and `pdfinfo` on the PATH; the stored corpus text was extracted with poppler 26.09.0. Run each script with `python -I` from a directory that holds no downloaded files. Recipe definitions, with formulas, parameters, references and standard limitations, are in [`recipes/registry.json`](recipes/registry.json); the [analysis recipes](../docs/reference/analysis-recipes.md#p0-recipe-entries) page explains them and says which parts were fixed before any data was read.

## Inputs that are not in Git

Raw downloads and working files stay in the ignored `data/raw/` and `data/interim/` folders ([contributing](../CONTRIBUTING.md)).

| Input | Where the pipeline expects it | How it was made |
|---|---|---|
| CHIRPS v3.0 monthly windows, 1991-01 onward | `data/raw/chirps-v3.0/monthly-global-cogs/` | `chirps_fetch.py` |
| Frozen catchment `geo_ait_bouguemez_catchment` revision 1 | each bundle's `analysis-geometry.geojson` (byte-identical copies) | Native 30 m delineation from Copernicus DEM GLO-30 (2021 release) with a separate script that is not part of this package; method and acceptance checks in [data sources and methods](../docs/reference/data-sources-and-methods.md#study-area) |
| Sentinel-2 item list | `kept.jsonl` | Either from a catalog search (`s2-search.py`, then `s2-inventory.py`: Earth Search legacy `sentinel-2-l2a` items for tiles 29SQR and 29RQQ, deduplicated) or, to reproduce an existing bundle exactly, from its Items' `derived_from` links (`derived-from-items.py`). The catalog changes over time, so a rerun of a bundle uses the second route |
| Sentinel-2 monthly composites | `data/interim/s2-monthly/<YYYY-MM>/` | `s2_ndvi.py` |
| MODIS Terra windows (MOD13Q1 and MOD10A1 v6.1) | `data/raw/modis/modis-13Q1-061/`, `data/raw/modis/modis-10A1-061/` | `modis-fetch.py`; the search record `search-<first>-<last>.json` lists the kept item IDs |
| WorldCover 2021 and DEM strata on the analysis grid | `data/interim/worldcover/`, `data/interim/strata/` | `worldcover-grid.py` (reads the WorldCover tile by range request), `dem-strata.py` from the Copernicus DEM tile [`Copernicus_DSM_COG_10_N31_00_W007_00_DEM.tif`](https://copernicus-dem-30m.s3.amazonaws.com/Copernicus_DSM_COG_10_N31_00_W007_00_DEM/Copernicus_DSM_COG_10_N31_00_W007_00_DEM.tif) (41,088,635 bytes) |
| Conditioned flow direction and depression fill depth of the catchment freeze | `data/bundles/bundle_drainage_network_ait_bouguemez/` (its own copies), or `data/interim/drainage/` for the first build | A private step that uses pysheds 0.5 (GPL-3.0-or-later, so the step is not in this package) on the pinned DEM tile and window, cropped to the catchment's bounding box plus 8 cells; `d8-flow-direction.tif`, `depression-fill-depth.tif` and `conditioning-report.json` are pinned by checksum in the place configuration |

## Steps

```
uv sync --frozen
python -I pipeline/chirps_fetch.py data/raw/chirps-v3.0/monthly-global-cogs 1991-01 2025-12
python -I pipeline/chirps-crosscheck.py data/raw/chirps-v3.0/monthly-global-cogs/chirps-v3.0.2022.01.cog.window.json 2022 1
python -I pipeline/chirps-bundle.py data/raw/chirps-v3.0/monthly-global-cogs <geometry.geojson> uv.lock data/bundles 2019-01 2025-12 --inspected
python -I pipeline/s2-search.py -6.60,31.50,-6.10,31.80 2019-01 2025-12 <items.jsonl>
python -I pipeline/s2-inventory.py <items.jsonl> <inventory_dir> --skip-empty <geometry.geojson> <item_cache_dir>
python -I pipeline/derived-from-items.py data/bundles/bundle_s2_ndvi_monthly_ait_bouguemez <inventory_dir>/kept.jsonl   (instead of the two lines above, to reproduce the bundle's exact inputs)
python -I pipeline/s2_ndvi.py <inventory_dir>/kept.jsonl <geometry.geojson> data/interim/s2-monthly 2019-01 2025-12 8
python -I pipeline/ndvi-bundle.py data/interim/s2-monthly <inventory_dir>/kept.jsonl <geometry.geojson> uv.lock data/bundles 2019-01 2025-12 --inspected=<note.txt> [--revision-note=<file>] [--stac-version=<n>]
python -I pipeline/season-bundle.py data/bundles/bundle_chirps_monthly_ait_bouguemez data/raw/chirps-v3.0/monthly-global-cogs recipes/registry.json uv.lock data/bundles
python -I pipeline/recipes-bundle.py data/interim/s2-monthly data/bundles recipes/registry.json uv.lock [data/interim/ndvi-departure] [--revision-note=<file> ...] [--stac-version=<n>] [--catalog-note=<file>] [--extension=<version>] [--departure-only]
python -I pipeline/worldcover-grid.py <geometry.geojson> data/interim/worldcover
python -I pipeline/dem-strata.py <Copernicus_DSM_COG_10_N31_00_W007_00_DEM.tif> <geometry.geojson> data/interim/worldcover/worldcover-2021.tif data/interim/strata
python -I pipeline/strata-bundle.py data/interim/strata data/interim/worldcover <geometry.geojson> uv.lock data/bundles --inspected=<note.txt>
python -I pipeline/departure-overviews.py data/bundles data/interim/ndvi-departure data/interim/s2-monthly ../design/tokens/siterra.tokens.json <new_bundles_dir> --revision-note=<file> --stac-version=<n> [--pixel-m=30] [--steps=16]
python -I pipeline/validate-bundles.py data/bundles schemas/stac/siterra-extension.schema.json <schema_cache_dir>
python -I pipeline/corpus-fetch.py data/case/corpus-manifest.json . --check-closed --write=data/case/corpus-manifest.json
python -I pipeline/modis-fetch.py places/ait-bouguemez.json .. mod13q1 data/raw/modis 2000-02-01 2025-12-31
python -I pipeline/modis-fetch.py places/ait-bouguemez.json .. mod10a1 data/raw/modis 2000-02-24 2025-12-31
python -I pipeline/modis-archive-gaps.py places/ait-bouguemez.json .. mod13q1 data/raw/modis
python -I pipeline/modis-archive-gaps.py places/ait-bouguemez.json .. mod10a1 data/raw/modis
python -I pipeline/restrend-bundle.py places/ait-bouguemez.json .. data/raw/modis/modis-13Q1-061 data/raw/chirps-v3.0/monthly-global-cogs recipes/registry.json uv.lock <new_bundles_dir>
python -I pipeline/snow-bundle.py places/ait-bouguemez.json .. data/raw/modis/modis-10A1-061 <Copernicus_DSM_COG_10_N31_00_W007_00_DEM.tif> recipes/registry.json uv.lock <new_bundles_dir>
python -I pipeline/pixel_trend_long_record.py places/ait-bouguemez.json .. data/raw/modis/modis-13Q1-061 <Copernicus_DSM_COG_10_N31_00_W007_00_DEM.tif> ../design/tokens/siterra.tokens.json recipes/registry.json uv.lock <new_bundles_dir>
python -I pipeline/season_trend_long_record.py places/ait-bouguemez.json .. data/raw/modis/modis-13Q1-061 data/raw/chirps-v3.0/monthly-global-cogs <Copernicus_DSM_COG_10_N31_00_W007_00_DEM.tif> recipes/registry.json uv.lock <new_bundles_dir>
python -I pipeline/drainage-network-bundle.py places/ait-bouguemez.json .. <Copernicus_DSM_COG_10_N31_00_W007_00_DEM.tif> recipes/registry.json uv.lock <new_bundles_dir> [--conditioning=<dir>] [--inspected=<note.txt>] [--computed=<YYYY-MM-DDTHH:MM:SSZ>]
python -I pipeline/render-drainage.py <new_bundles_dir>/bundle_drainage_network_ait_bouguemez <out.png> [--width=1600]
python -I pipeline/drainage_network.py   (the tests of the drainage module)
python -I pipeline/transects-bundle.py places/ait-bouguemez.json .. <Copernicus_DSM_COG_10_N31_00_W007_00_DEM.tif> recipes/registry.json uv.lock <new_bundles_dir> [--inspected=<note.txt>] [--computed=<YYYY-MM-DDTHH:MM:SSZ>]
python -I pipeline/render-transects.py <new_bundles_dir>/bundle_transects_ait_bouguemez <out.png> [--width=1500]
python -I pipeline/terrain_transects.py   (the tests of the transect module)
python -I pipeline/place_config.py   (the tests of the place configuration; set SITERRA_DEM to the DEM tile to run the two that read it)
```

The long-record scripts (`modis-fetch.py`, `restrend-bundle.py`, `snow-bundle.py`, `pixel_trend_long_record.py`, `season_trend_long_record.py`) hold no place-specific value: the geometry, strata, windows, seasons and band sets come from the place configuration, so another place needs only a new file in `places/` and its own frozen geometry and strata bundle. `<new_bundles_dir>` is a copy of `data/bundles/` that also holds the place's rainfall and strata bundles; the scripts write their bundle there and leave the catalog unchanged. `bundle_restrend_long_record_ait_bouguemez`, `bundle_snow_cover_by_band_ait_bouguemez`, `bundle_pixel_trend_long_record_ait_bouguemez` and `bundle_season_trend_long_record_ait_bouguemez` are committed in `data/bundles/`.

`drainage-network-bundle.py` builds `bundle_drainage_network_ait_bouguemez` from the two conditioned rasters of the catchment freeze (see the inputs table); it reads them from `--conditioning=<dir>` (default: the bundle's own folder in `data/bundles/`), stops unless their checksums match the place configuration, and refuses to write into a bundle folder that exists. It delineates the catchment from the outlet over the rasters and compares it with the frozen polygon, accumulates area, draws and numbers the segments, and re-reads the stored lines to check them. Without `--inspected` the visual inspection check fails and the status is `failed`; `render-drainage.py` draws the network for that inspection. To rebuild a committed bundle exactly, run it into a new folder with `--conditioning=data/bundles/bundle_drainage_network_ait_bouguemez`, the collection's `created` time as `--computed` and the same `--inspected` note (its text is the detail of the collection's visual inspection check), then compare the files.

`transects-bundle.py` builds `bundle_transects_ait_bouguemez`: profiles every 30 m along the lines named in the place configuration (the meridian through Tabant, and the longest flow path of the drainage network from the outlet). `<new_bundles_dir>` must hold the strata bundle and the drainage network bundle (the axis is read from its `drainage-lines.geojson`), the WorldCover grid must be in `data/interim/worldcover/`, and the bundle folder must not exist. Heights come from the strata recipe's 30 m grid, the check recomputes them from the native DEM tile (the `<dem.tif>` argument), and `--inspected` and `--computed` work as for the drainage bundle; `render-transects.py` draws the profiles for the inspection.

`validate-bundles.py` fetches the STAC core and extension schemas over HTTPS on first use and caches each one in `<schema_cache_dir>` under the SHA-256 of its URL; both Siterra extension identifiers (1.0.0 and 1.1.0) are read from the repository file, which accepts either. `--inspected` records that a person looked at rendered samples (`render-cells.py`, `render-ndvi.py`, `render-strata.py`); without it the visual inspection check fails and the bundle status is `failed`. Build a new revision outside `data/bundles/`, validate it there, and copy it in one step.

Options for a new revision of the NDVI and recipe bundles (`ndvi-bundle.py`, `recipes-bundle.py`):

- `--revision-note=<file>` adds the file's text as the last paragraph of each Collection the script writes, in its description and as its last limitation; repeat it to add several notes in order.
- `--stac-version=<n>` sets the STAC `version` field of each Collection the script writes to `<n>` and lists the [version extension](https://github.com/stac-extensions/version) v1.2.0.
- `--catalog-note=<file>` (`recipes-bundle.py` only) sets the catalog description to its fixed first sentence followed by the file's text.
- `--extension=1.1.0` (`recipes-bundle.py` only) declares version 1.1.0 of the [Siterra STAC extension](../schemas/stac/siterra-extension.schema.json) in the documents the script writes; a departure measurement excluded in a period that is itself available then carries `missing_reason`, with the coverage that excluded it. The default is 1.0.0.
- `--departure-only` (`recipes-bundle.py` only) rewrites the departure bundle alone, re-pins the aligned bundle's `derived_from` checksum to it and updates the catalog; the aligned and coverage results are not recomputed.
- The optional fifth argument of `recipes-bundle.py`, a folder such as `data/interim/ndvi-departure`, receives per-pixel departure grids for both references, for inspection and display only; no bundle contains them.

Without these options a Collection carries no `version` and no revision note. Revision 13 was built with both options on the NDVI, departure, coverage and aligned bundles. Revision 14 rebuilt the departure bundle alone with `--departure-only --extension=1.1.0`, both revision notes and `--stac-version=14`; the rainfall, season and strata bundles have no `version` field and are unchanged since the first commit. Revision 15 added the map's display rasters and the cropland and buildings polygons to the departure bundle with `departure-overviews.py`, one revision note and `--stac-version=15`; it writes into a new folder that must not exist, so validate there and copy the departure bundle, the aligned bundle's `collection.json` and `catalog.json` in one step. Every script that writes the catalog keeps its child links sorted by bundle ID. `chirps-bundle.py` is the exception: it writes a new catalog that holds only its own child, so run it first, as in Steps; run on an existing `data/bundles/`, it drops the other children.

## Scripts

Modules that other scripts import keep snake_case names (`chirps_fetch.py`, `s2_ndvi.py`); scripts that are only run are hyphenated (CONTRIBUTING rule 2).

| Script | Does |
|---|---|
| `chirps_fetch.py` | Range-reads one 512 px tile per monthly CHIRPS v3.0 final global COG; keeps the tile bytes and a sidecar with URL, ETag, byte range, SHA-256 and window values. Stdlib only, resumable |
| `chirps-crosscheck.py` | Compares a stored window with the separate CHIRPS Africa GeoTIFF of the same month, cell by cell |
| `chirps-bundle.py` | Exact cell fractions in EPSG:32629, catchment totals, 1991 to 2020 same-month means, departures; rainfall bundle with its checks, including a recompute of one month from the Africa GeoTIFF through GDAL |
| `s2-search.py` | Searches Earth Search month by month for an envelope bounding box and writes the item list (stdlib; the exact STAC query is in its docstring) |
| `s2-inventory.py` | Keeps tiles 29SQR and 29RQQ, deduplicates per tile and date (with `--skip-empty`, skips a duplicate with no clear pixels over the catchment when a twin has some), records dropped item IDs and monthly date counts |
| `derived-from-items.py` | Rebuilds the item list from a bundle's `derived_from` links, so a rerun uses exactly the bundle's inputs |
| `s2-dn-scale-check.py`, `s2-pair-diff.py` | Read overview levels of Sentinel-2 COGs and compare same-acquisition duplicates pixel by pixel: the evidence for the offset rule |
| `s2_ndvi.py` | Monthly per-pixel NDVI medians and date counts at 10 m on one EPSG:32629 grid, scene classification mask, DN / 10000 without offset; retries a scene on read failures |
| `ndvi-bundle.py` | Coverage policy, NDVI bundle and its checks, including a fresh re-run of one month and the offset guard |
| `season-bundle.py`, `recipes-bundle.py` | Precomputed P0 recipes: `season_summary`, `monthly_departure`, `aligned_antecedent`, `coverage_summary` |
| `worldcover-grid.py`, `dem-strata.py`, `strata-bundle.py` | WorldCover 2021 context mask and terrain strata on the analysis grid, and the strata bundle |
| `corpus-fetch.py` | Fetches the open sources of the case corpus listed in [`data/case/corpus-manifest.json`](../data/case/corpus-manifest.json), stores each file with its provenance and extracts its text by page or section (stdlib plus poppler's `pdftotext`) |
| `gold-extraction.py`, `gold-numeric.py` | Build the evaluation gold sets in `data/case/gold/`: excerpt items checked by code against the stored corpus text, and numeric items generated from every bundle measurement |
| `globe-relief.py`, `globe-rangeland.py` | Global relief grid and hillshade from Copernicus DEM GLO-90 overviews; rangeland biomes on a 0.25 degree grid from RESOLVE Ecoregions 2017 (Rangelands Atlas method) |
| `map-globe.py`, `map-terrain.py`, `map-manifest.py` | The public map assets in [`data/map/`](../data/map/README.md): globe relief, dot grid and rangeland biomes; the valley terrain tiles read from the Mapterhorn archive by range request (stdlib PMTiles reader, checked against the tile server); the manifest of sizes and checksums |
| `s2-truecolour.py`, `map-imagery.py` | A Sentinel-2 true-colour display composite (per-pixel median of clear summer dates, fixed stretch) and its Web Mercator WebP drape with corner coordinates, for display only |
| `departure-overviews.py` | The departure bundle's display rasters: each available leave-one-year-out grid averaged into one fixed Web Mercator grid and painted with the light-theme `data.ndvi-departure` ramp of the design tokens, lossless WebP; the strata bundle's excluded band as polygons for the map's hatch. Before writing, it checks every grid against its Item's measurements and recomputes the latest period's grids from the composites |
| `place_config.py` | Reads a place configuration in [`places/`](places/ait-bouguemez.json): the frozen geometry and strata with their checksums, the analysis grid, stratum masks and labels, DEM elevation on the analysis grid, and the count of 10 m analysis cells inside each cell of another grid (the area weights of the long-record recipes) |
| `modis-fetch.py` | Searches Planetary Computer for Terra MOD13Q1 or MOD10A1 v6.1 items over a place, deduplicates per tile and date, and range-reads each asset's window over the geometry with an anonymous SAS token; keeps each window with a sidecar (URL without token, HTTP validators, window, transform, SHA-256 of the values). Resumable; prints counts only |
| `modis-archive-gaps.py`, `modis_record.py` | Lists the expected acquisition dates absent from the kept Planetary Computer items and looks each up in NASA CMR (public granule search, no login); writes `archive-gaps-<first>-<last>.json` next to the search record. The bundle builders state CMR status only from this record, and otherwise say the gaps were not checked |
| `restrend-bundle.py`, `restrend_rerun.py`, `trend_stats.py` | `restrend_long_record` for a place: growing-season NDVI per stratum, window rainfall from the CHIRPS windows, least squares fits with t intervals (incomplete beta, no SciPy), the autocorrelation-adjusted interval and Theil-Sen; the bundle with a compact summary and full tables, and an independent rerun of the last season (fresh reads, nearest-neighbour resampling) |
| `snow-bundle.py` | `snow_cover_by_band` for a place: monthly snow-covered share of clear pixel-days per elevation band at NDSI 0.2 and 0.4, with the clear share, and an independent rerun of one month |
| `pixel_trend_long_record.py` | `pixel_trend_long_record` for a place: per-pixel 250 m growing-season NDVI Theil-Sen slopes and Mann-Kendall tests across all catchment pixels, Benjamini-Hochberg false discovery rate area shares, 8-connected pixel clusters, native 4-band slope GeoTIFFs, static EPSG:3857 slope overviews and 16 outlet-ordered geographic reveal frames (slope direction and magnitude only, never pixel-wise significance maps, per SCI-52) |
| `season_trend_long_record.py` | `season_trend_long_record` for a place: growing-season NDVI trends across spring and June to September summer windows over the catchment, terrain strata, fixed 500 m elevation bands and WorldCover 2021 land cover groups, spring-minus-summer contrast trends, antecedent rainfall R-squared, and a post-hoc 26-season stratum baseline summary (`preregistered: false`) |
| `extract-pin-chips.py` | Coordinate-pinned 320 x 200 PNG satellite and terrain inspection chips and `pin-chips.json` manifest for five valley locations (valley-floor orchards, upper snow band, mid-slope rangeland, wet-versus-dry season departure comparison, and catchment outlet hydrology) from Sentinel-2 L2A, MODIS MOD13Q1/MOD10A1, CHIRPS v3.0 and Copernicus DEM GLO-30 |
| `drainage_network.py` | The geometry of `drainage_network`: downstream cell of every D8 cell, pointer-doubling to the outlet with loop detection, area-weighted accumulation, Strahler order, segments from heads and confluences, Chaikin smoothing, Douglas-Peucker simplification, densifying, bilinear heights, rise statistics. Numpy and pyproj only; runs its own tests |
| `drainage-network-bundle.py` | `drainage_network` for a place: the catchment delineated from the outlet over the conditioned D8 raster and compared with the frozen polygon, area-weighted accumulation, stream cells at 1.0 km2, Strahler order, 3D segments (EPSG:4326, height from the 30 m surface of the terrain strata), segments that do not descend flagged with their depression fill depth, threshold sensitivity, checks re-run on the stored lines, summary and Collection. Reads no pysheds output other than the two rasters and the report |
| `render-drainage.py` | Draws a drainage bundle's lines over the catchment outline for the visual inspection check |
| `terrain_transects.py` | The functions of `terrain_transects`: the meridian's ends from the polygon, geodesic samples along a meridian and along a polyline, bands, band crossings and kilometres in band from the piecewise linear profile, land cover runs, the valley floor segment, the longest flow path of a segment graph. Numpy, pyproj and shapely only; runs its own tests |
| `transects-bundle.py` | `terrain_transects` for a place: samples every 30 m with height, band, WorldCover class and inside flag, crossings, runs and the valley floor segment per line, the summary, the samples as columns, 3D lines and the Collection; the checks are re-run on the stored samples and against the native DEM tile |
| `render-transects.py` | Draws a transects bundle's profiles with the band limits, the valley floor and the land cover strip for the visual inspection check |
| `bundle_common.py` | Checksums, JSON writing and asset objects shared by the newer bundle builders |
| `validate-bundles.py` | Validates every document against STAC 1.1.0, its listed extensions and the Siterra extension, and every `file:checksum` |
| `render-cells.py`, `render-ndvi.py`, `render-strata.py` | Render samples for the visual inspection check |

## Known limits

Bundles link this `uv.lock`. The environment that built them held 59 pins: these 15, plus pysheds 0.5 (GPL-3.0-or-later, used only by the separate catchment delineation and the separate conditioning step of `drainage_network`) and its dependencies (numba, llvmlite, scipy, scikit-image, pandas, networkx, imageio, tifffile, lazy-loader, geojson, looseversion, packaging, python-dateutil, six), plus pystac with pystac-core and 22 pystac-ext packages, and pystac-client with requests, urllib3, idna and charset-normalizer. No script in this package imports any of those 44. To reproduce an existing bundle exactly, use `derived-from-items.py` rather than a fresh search. Value grids stay in `data/interim/` and no bundle carries them. The departure display rasters are 30 m Web Mercator cells, about 25.5 m on the ground at the catchment, so they are coarser than the 10 m analysis grid; no number is read from them. The cropland and buildings polygons carry coordinates at 5 decimals (about 1 m).
