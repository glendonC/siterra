# Valley instrument fixtures: sources, attribution and notices

These files are the data of the valley instrument views until the case record API serves the same data. Each JSON
file names its source by its path in this repository (and its SHA-256 where the source is a bundle file);
`apps/web/lib/instruments/valley/fixtures.test.ts` recomputes the numbers from `data/bundles`.

## Copernicus DEM GLO-30: relief-30m.f32, catchment.json, rivers.json, strata-10m.png

Derived from Copernicus DEM GLO-30 (2021 release, tile `Copernicus_DSM_COG_10_N31_00_W007_00_DEM`): the relief
resampled to 30 m in EPSG:32629, the frozen catchment boundary and the equal-area elevation strata of
`data/bundles/bundle_terrain_strata_ait_bouguemez`, and D8 drainage lines traced on the same DEM. Licence:
"Licence for COP-DEM-GLO-30-F Global 30m Full, Free & Open" (ESA, Copernicus Contributing Mission Data Access,
21/02/2025), https://dataspace.copernicus.eu/sites/default/files/media/files/2025-06/copernicus_contributing_mission_data_access_v2_cop_dem_licenses.pdf

Credit wherever these are shown (Article 6(b)):

"Produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved"

Notice for their public distribution (Article 6(c)):

"The organisations in charge of the Copernicus programme by law or by delegation do not incur any liability for any use of the Copernicus WorldDEM-30"

## ESA WorldCover 2021: landcover-10m.png

Tree cover (class 10) and cropland or built-up (classes 40 and 50) inside the catchment, on the 10 m analysis grid.
"© ESA WorldCover project / Contains modified Copernicus Sentinel data (2021) processed by ESA WorldCover
consortium", ESA WorldCover 2021 v200 (Zanaga et al. 2022), CC BY 4.0.

## MODIS MOD13Q1 v6.1: trend-cells.json, and the trend figures in figures.json

From `data/bundles/bundle_pixel_trend_long_record_ait_bouguemez` and
`data/bundles/bundle_season_trend_long_record_ait_bouguemez`. Didan, K. (2021). MODIS/Terra Vegetation Indices
16-Day L3 Global 250m SIN Grid V061. NASA Land Processes Distributed Active Archive Center.
https://doi.org/10.5067/MODIS/MOD13Q1.061

## CHIRPS v3.0: rain-cells.json, and the rainfall figures in figures.json

From `data/bundles/bundle_chirps_monthly_ait_bouguemez` and
`data/bundles/bundle_restrend_long_record_ait_bouguemez`. CHIRPS v3.0, Climate Hazards Center, UC Santa Barbara,
https://doi.org/10.15780/G2JQ0P

## MODIS MOD10A1 v6.1: snow.json

From `data/bundles/bundle_snow_cover_by_band_ait_bouguemez`. Hall, D. K. and G. A. Riggs. 2021. MODIS/Terra Snow
Cover Daily L3 Global 500m SIN Grid, Version 61. Boulder, Colorado USA. NASA National Snow and Ice Data Center
Distributed Active Archive Center. https://doi.org/10.5067/MODIS/MOD10A1.061

## layout-a.json and terrain-meta.json

The measured layout of the layer stack (camera, plate, sheet heights) and the grids' positions: no observed values.
