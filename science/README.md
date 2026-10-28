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
| WorldCover 2021 and DEM strata on the analysis grid | `data/interim/worldcover/`, `data/interim/strata/` | `worldcover-grid.py` (reads the WorldCover tile by range request), `dem-strata.py` from the Copernicus DEM tile [`Copernicus_DSM_COG_10_N31_00_W007_00_DEM.tif`](https://copernicus-dem-30m.s3.amazonaws.com/Copernicus_DSM_COG_10_N31_00_W007_00_DEM/Copernicus_DSM_COG_10_N31_00_W007_00_DEM.tif) (41,088,635 bytes) |

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
python -I pipeline/validate-bundles.py data/bundles schemas/stac/siterra-extension.schema.json <schema_cache_dir>
python -I pipeline/corpus-fetch.py data/case/corpus-manifest.json . --check-closed --write=data/case/corpus-manifest.json
```

`validate-bundles.py` fetches the STAC core and extension schemas over HTTPS on first use and caches each one in `<schema_cache_dir>` under the SHA-256 of its URL; both Siterra extension identifiers (1.0.0 and 1.1.0) are read from the repository file, which accepts either. `--inspected` records that a person looked at rendered samples (`render-cells.py`, `render-ndvi.py`, `render-strata.py`); without it the visual inspection check fails and the bundle status is `failed`. Build a new revision outside `data/bundles/`, validate it there, and copy it in one step.

Options for a new revision of the NDVI and recipe bundles (`ndvi-bundle.py`, `recipes-bundle.py`):

- `--revision-note=<file>` adds the file's text as the last paragraph of each Collection the script writes, in its description and as its last limitation; repeat it to add several notes in order.
- `--stac-version=<n>` sets the STAC `version` field of each Collection the script writes to `<n>` and lists the [version extension](https://github.com/stac-extensions/version) v1.2.0.
- `--catalog-note=<file>` (`recipes-bundle.py` only) sets the catalog description to its fixed first sentence followed by the file's text.
- `--extension=1.1.0` (`recipes-bundle.py` only) declares version 1.1.0 of the [Siterra STAC extension](../schemas/stac/siterra-extension.schema.json) in the documents the script writes; a departure measurement excluded in a period that is itself available then carries `missing_reason`, with the coverage that excluded it. The default is 1.0.0.
- `--departure-only` (`recipes-bundle.py` only) rewrites the departure bundle alone, re-pins the aligned bundle's `derived_from` checksum to it and updates the catalog; the aligned and coverage results are not recomputed.
- The optional fifth argument of `recipes-bundle.py`, a folder such as `data/interim/ndvi-departure`, receives per-pixel departure grids for both references, for inspection and display only; no bundle contains them.

Without these options a Collection carries no `version` and no revision note. Revision 13 was built with both options on the NDVI, departure, coverage and aligned bundles. Revision 14 rebuilt the departure bundle alone with `--departure-only --extension=1.1.0`, both revision notes and `--stac-version=14`; the rainfall, season and strata bundles have no `version` field and are unchanged since the first commit. Every script that writes the catalog keeps its child links sorted by bundle ID. `chirps-bundle.py` is the exception: it writes a new catalog that holds only its own child, so run it first, as in Steps; run on an existing `data/bundles/`, it drops the other children.

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
| `validate-bundles.py` | Validates every document against STAC 1.1.0, its listed extensions and the Siterra extension, and every `file:checksum` |
| `render-cells.py`, `render-ndvi.py`, `render-strata.py` | Render samples for the visual inspection check |

## Known limits

Bundles link this `uv.lock`. The environment that built them held 59 pins: these 15, plus pysheds 0.5 (GPL-3.0-or-later, used only by the separate catchment delineation) and its dependencies (numba, llvmlite, scipy, scikit-image, pandas, networkx, imageio, tifffile, lazy-loader, geojson, looseversion, packaging, python-dateutil, six), plus pystac with pystac-core and 22 pystac-ext packages, and pystac-client with requests, urllib3, idna and charset-normalizer. No script in this package imports any of those 44. To reproduce an existing bundle exactly, use `derived-from-items.py` rather than a fresh search. Display rasters and value grids are not produced yet.
