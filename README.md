<h1 align="center">Siterra</h1>

<p align="center"><strong>Environmental Analysis and Hypothesis Verification Engine</strong></p>

<p align="center">
  <a href="docs/explanation/problem.md">Scientific Problem</a> ·
  <a href="#system-architecture">System Architecture</a> ·
  <a href="#stac-observation-bundles-and-recipes">Observation Bundles & Recipes</a> ·
  <a href="#pre-registered-hypothesis-testing">Hypothesis Verification</a> ·
  <a href="docs/README.md">Technical Documentation</a>
</p>

Siterra is an environmental analysis and hypothesis verification workspace for site-level land, water, and rangeland investigations. Given a defined hydrological or management boundary and a reported environmental concern, Siterra loads reproducible satellite and climate records, searches primary scientific literature in its original language, evaluates competing biophysical and land-use explanations against pre-registered predictions, and produces a reviewable field-verification plan. Every numeric value comes from deterministic code over checksummed data bundles, every published claim links to its verbatim source excerpt, and every operational action stops at `prepared` for human review.

## Scientific Problem

Rangelands cover 80 million km², over 54 per cent of Earth's terrestrial surface, and support the livelihoods of approximately 2 billion people [1]. FAO estimates that roughly half of rangelands may be degraded [2], while the UNCCD reports negative trends across roughly 20 per cent in recent assessments and notes that losses may be underestimated [1]. The United Nations declared 2026 the International Year of Rangelands and Pastoralists [3].

Although Sentinel-2 [4], Landsat [5], MODIS, and CHIRPS datasets are open, global assessments find that Earth observation data and decision-support tools are rarely integrated into local land decisions and typically report biophysical state without social or institutional context [6]. Crucially, a remote-sensing greenness series shows change rather than cause: in dryland simulations, 30 to 40 per cent vegetation degradation was required before a vegetation-index trend became statistically detectable against rainfall variability [7]. Misattributing rangeland change has documented consequences in Morocco, where colonial-era forest decrees criminalized customary pastoral transhumance on the basis of deforestation estimates later contradicted by fossil pollen records [9], and where dryland degradation has been attributed to pastoral grazing despite evidence pointing to marginal cropping and irrigation [10].

Siterra separates observation from attribution: competing explanations remain open until measurements discriminate between them, and unresolved questions are translated into a minimum-cover field-measurement plan.

## System Architecture

Siterra is structured as a TypeScript, React, MapLibre GL, and PostgreSQL monorepo paired with an offline Python scientific preprocessing pipeline:

- **`packages/contracts` & `schemas/`**: JSON Schema 2020-12 and STAC 1.1.0 specifications mirrored in Zod 4 (`case.schema.json`, `siterra-extension.schema.json`, `openapi.json`), enforcing strict typed records (`EnvironmentalCase`, `DataBundle`, `Measurement`, `TemporalObservation`, `Evidence`, `ExplanationBranch`, `BranchMerge`, `Hypothesis`, `Intervention`, `OperationalAction`, `Brief`, `ReviewDecision`).
- **`packages/domain`**: Deterministic prediction scoring (`scorePrediction`), fixed branch-merge rules (`merge@2`), exact minimum test cover search for field-verification plans (`minimumTestCover`), staleness propagation across entity revision graphs, and numeric/claim/excerpt validators.
- **`packages/db`**: Append-only PostgreSQL case store with revision-checked atomic commits, outbox job dispatch (`pg-boss`), Server-Sent Events (SSE) replay with `Last-Event-ID`, OpenTelemetry GenAI trace spans, and STAC bundle import with multihash verification.
- **`packages/agent` & `apps/worker`**: Bounded task coordinator and executors (`plan`, `observation_analysis`, `source_research`, `livelihood_governance`, `explanation_branches`, `intervention_feasibility`, `brief_package`) running against `muse-spark-1.3` via the Meta Responses API (`store: false`, strict JSON Schema structured outputs, encrypted reasoning replay, per-command spend and round caps).
- **`apps/web`**: Next.js 16 App Router workspace projecting the authoritative case record onto a 3D Copernicus DEM relief stage (MapLibre GL JS 6, PMTiles, `maplibre-contour`), synchronized temporal scrubbers, explanation branch ledgers, inline source/measurement inspectors, and flat-reading accessibility views.
- **`science/` & `data/bundles/`**: Offline reproducible Python pipeline (`uv.lock` pinned) producing checksummed STAC 1.1.0 observation and recipe bundles from public cloud-native archives via HTTP range requests.

## STAC Observation Bundles and Recipes

The reference study area is the Aït Bouguemez valley catchment in Morocco's Central High Atlas (`geo_ait_bouguemez_catchment`, 417.04 km² geodesic, delineated at native 30 m from Copernicus DEM GLO-30 upstream of Assif n Bou Guemez). All 11 validated bundles in [`data/bundles/catalog.json`](data/bundles/catalog.json) carry SHA-256 multihash asset pins, pipeline lockfiles, and automated reproduction checks:

| Bundle / Recipe | Sensor & Inputs | Resolution & Window | Method & Output |
|---|---|---|---|
| `bundle_s2_ndvi_monthly_ait_bouguemez` | Sentinel-2 L2A ( Red B04, NIR B08, SCL) | 10 m, 2019-01 to 2025-12 (84 months) | Harmonized reflectance (`DN / 10000`), SCL classes 4 and 5, per-pixel monthly median, >= 3 clear dates per pixel-month, >= 70% catchment coverage (`68` available, `16` winter gaps recorded) |
| `bundle_ndvi_departure_ait_bouguemez` (`monthly_departure` 1.0.0) | Sentinel-2 L2A monthly NDVI | 10 m analysis grid, 2019 to 2025 | Pixel-first departure against both all-years and leave-one-year-out same-month medians (minimum 4 reference years), summarized by area median and spatial IQR, with WebP display overviews |
| `bundle_chirps_monthly_ait_bouguemez` | CHIRPS v3.0 monthly global COGs | 0.05° (~5 km, 33 intersecting cells), 2019 to 2025 | Area-weighted catchment monthly precipitation totals (mm) and departures from 1991 to 2020 monthly normals |
| `bundle_season_summary_ait_bouguemez` (`season_summary` 1.0.0) | CHIRPS v3.0 monthly totals (1991 to 2025) | Catchment, Nov-Apr wet seasons 2018/19 to 2024/25 | Wet-season total placed against 1991 to 2020 terciles (`below_normal`, `near_normal`, `above_normal`) and mean departure |
| `bundle_aligned_antecedent_ait_bouguemez` (`aligned_antecedent` 1.1.1) | Sentinel-2 departures + CHIRPS departures | Catchment, 0, 1, 2, and 3 month antecedent windows | Co-movement counts of shared non-zero sign across both vegetation references and all four antecedent windows |
| `bundle_terrain_strata_ait_bouguemez` (`terrain_strata` 1.0.0) | Copernicus DEM GLO-30 + ESA WorldCover 2021 | 10 m grid | Equal-area elevation terciles (`< 2317 m`, `2317-2815 m`, `>= 2815 m`), Horn slope/aspect quadrants (`N`, `E`, `S`, `W`, `level < 5°`), and cropland/built-up exclusion mask |
| `bundle_restrend_long_record_ait_bouguemez` (`restrend_long_record` 1.0.0) | Terra MODIS MOD13Q1 v6.1 (250 m) + CHIRPS v3.0 | 26 seasons (2000 to 2025), 9 strata, 3 growing x 2 rain windows | OLS regression of growing-season NDVI on antecedent rainfall (`b` with 95% interval); residual trend by OLS, Santer et al. (2000) autocorrelation-adjusted interval, and Theil-Sen slope; enforces `precondition_not_met` when the rainfall slope 95% interval includes zero |
| `bundle_pixel_trend_long_record_ait_bouguemez` (`pixel_trend_long_record` 1.0.0) | Terra MODIS MOD13Q1 v6.1 + WorldCover 2021 | 250 m pixels (8,094 touching catchment), 2000 to 2025 | Per-pixel Theil-Sen slope, Sen 95% interval, and tie-corrected Mann-Kendall *p* with Benjamini-Hochberg FDR control (*q* = 0.05); 8-connected cluster detection and 16 geographic reveal frames |
| `bundle_season_trend_long_record_ait_bouguemez` (`season_trend_long_record` 1.0.0) | Terra MODIS MOD13Q1 v6.1 + WorldCover 2021 | 16 strata & land-cover groups, `mar_jun`, `mar_may`, `apr_jul`, `jun_sep` | Stratum trends across spring closure (`mar_may`) and summer high-pasture grazing (`jun_sep`), plus spring-minus-summer contrast slopes and 26-season ordinal ranks |
| `bundle_snow_cover_by_band_ait_bouguemez` (`snow_cover_by_band` 1.0.0) | Terra MODIS MOD10A1 v6.1 daily NDSI (500 m) + DEM | 300 months (2001-01 to 2025-12), fixed 500 m & tercile bands | Monthly snow-covered fraction of clear pixel-days side by side at `NDSI >= 0.20` (Atlas-calibrated) and `NDSI >= 0.40` (global default), withheld when clear share `< 0.30` |
| `bundle_coverage_summary_ait_bouguemez` (`coverage_summary` 1.0.0) | Sentinel-2 L2A | Catchment, 84 months | Per-month clear observation date counts, valid area fractions, and cloud/snow mask shares |

## Pre-Registered Hypothesis Testing

When evaluating competing explanations (`rainfall`, `grazing`, `land_use`, `snow_terrain`, `data_artefact`), Siterra enforces a strict separation between prediction and measurement ([agent orchestration](docs/reference/agent-orchestration.md#explanation-branches)):

1. **Predictions before data reads (`DF-07`)**: For each candidate explanation in `CaseAnalysisConfig`, the model receives only catalog metadata (pair IDs, period ranges, season IDs, stratum IDs, quality flags, and field-check IDs) with zero tools and zero measurement values. It proposes 2 to 4 predictions in a closed test grammar (`departure_sign`, `co_movement`, `season_category`, `quality_flag`, `availability`, `trend_direction`, `field_check`), which are validated and committed at an earlier case revision (`ExplanationBranch` revision 1) before any measurement or recipe result is read.
2. **Deterministic scoring and merge (`DF-08`, `merge@2`)**: Host code reads the referenced bundles and scores each prediction as `met`, `not_met`, or `not_testable` without reading model prose. Under `merge@2`, a necessary prediction that is `not_met` on adequate data marks the branch `contradicted` (requiring at least 3 evaluated periods for `departure_sign`), while `trend_direction` tests over `restrend_long_record` score `residual` trends as `not_testable` (`precondition_not_met`) whenever the rainfall slope 95% confidence interval includes zero.
3. **Minimum field-verification cover (`DF-09`)**: Over all explanation pairs left open by the satellite record, Siterra runs an exact set-cover search over the configured field checks (`local_rain_records`, `herd_records`, `orchard_history`, `seasonal_calendar`, `scene_inspection`) to select the smallest set of field measurements that separates every open pair, proving that removing any chosen check leaves a named pair unseparated.

## Verification

Run lint, format check, strict TypeScript typecheck across all 6 workspace packages, and the full Vitest suite:

```bash
pnpm check
pnpm test
```

## Sources

1. Herrera, P.M. (2024). *Global Land Outlook Thematic Report on Rangelands and Pastoralists*. UNCCD, Bonn. [PDF](https://digitallibrary.un.org/record/4058928/files/1413651-EN.pdf) (SCI-127)
2. FAO (2025). *FAO launches the International Year of Rangelands and Pastoralists 2026*, 2 December 2025. [FAO](https://www.fao.org/newsroom/detail/fao-launches-the-international-year-of-rangelands-and-pastoralists-2026-to-strengthen-these-ecosystems-and-support-the-people-who-sustain-them/en) (SCI-126)
3. United Nations General Assembly (2022). *International Year of Rangelands and Pastoralists, 2026*. Resolution A/RES/76/253. [PDF](https://digitallibrary.un.org/record/3965711/files/A_RES_76_253-EN.pdf) (SCI-125)
4. European Commission. *Legal notice on use of Copernicus Sentinel data*. [Licence](https://cds.climate.copernicus.eu/licences/ec-sentinel) (SCI-18)
5. NASA Science (2019). *Landsat science team members support the free and open Landsat data policy*. [NASA Science](https://science.nasa.gov/missions/landsat/landsat-science-team-members-support-the-free-and-open-landsat-data-policy) (SCI-134)
6. IPBES (2018). *Summary for policymakers of the assessment report on land degradation and restoration*. [doi:10.5281/zenodo.3237411](https://doi.org/10.5281/zenodo.3237411) (SCI-129)
7. Wessels, K.J., van den Bergh, F., Scholes, R.J. (2012). Limits to detectability of land degradation by trend analysis of vegetation index data. *Remote Sensing of Environment* 125: 10-22. [doi:10.1016/j.rse.2012.06.022](https://doi.org/10.1016/j.rse.2012.06.022) (SCI-29)
8. FAO GIEWS. *Country Brief: Morocco*, archive 2010 to 2026. [FAO GIEWS](https://www.fao.org/giews/countrybrief/country.jsp?code=MAR) (SCI-25)
9. Davis, D.K. (2005). Potential Forests: Degradation Narratives, Science, and Environmental Policy in Protectorate Morocco, 1912-1956. *Environmental History* 10(2): 211-238. [doi:10.1093/envhis/10.2.211](https://doi.org/10.1093/envhis/10.2.211) (SCI-145)
10. Davis, D.K. (2006). Neoliberalism, environmentalism, and agricultural restructuring in Morocco. *The Geographical Journal* 172(2): 88-105. [doi:10.1111/j.1475-4959.2006.00204.x](https://doi.org/10.1111/j.1475-4959.2006.00204.x) (SCI-148)
11. Behnke, R.H., Scoones, I. (1992). *Rethinking Range Ecology: Implications for Rangeland Management in Africa*. Drylands Issues Paper 33, IIED and ODI. [IIED](https://www.iied.org/7282iied) (SCI-149)

All primary sources and inspection notes are indexed in the [science source register](research/science/source-register.md).

## Documentation

See the [technical documentation index](docs/README.md) for the system architecture, data contracts, agent orchestration, statistical analysis recipes, and scientific basis.
