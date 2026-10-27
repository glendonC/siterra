# Analysis recipes

How Siterra uses AI for data-science work without letting the model compute or invent numbers: Muse plans, checks and explains; a catalog of deterministic recipes computes. Decisions: [ADR-0036](../decisions/0036-run-analyses-as-declarative-precomputed-recipes.md) and [ADR-0039](../decisions/0039-forecast-nothing-until-a-backtest-shows-skill.md). Evidence, method-by-method assessment and sources (SCI-45 onward): [data science research](../../research/science/analytics.md).

## Role split

| Activity | Muse | Deterministic host and pipeline | Gate |
|---|---|---|---|
| Choose analyses | Picks recipes for the question from `list_recipes`, which returns applicability already computed from the bundle (record length, coverage, valid years); explains the choice | Computes applicability; recipes that do not apply cannot be selected | Unknown or inapplicable recipe rejects the plan |
| Parameters | Chooses scope only (stratum, period subset, which prespecified window), committed in the plan before any result is read | Method parameters are fixed per recipe version; a fixed sensitivity set is always computed and shown together | A parameter outside its enumeration rejects; a change after results creates a new revision labeled post hoc |
| Compute | Never | Offline Python pipeline precomputes every recipe for every stratum and allowed parameter; live TypeScript only aligns, counts and looks up | Numeric provenance |
| Interpret | Writes within the recipe's allowed wording, links results to hypotheses, names what would change the conclusion | Inserts the recipe's standard limitation sentences verbatim | Per-recipe forbidden phrases; claim-kind rules |
| Methods text | Narrative paraphrase (P1) | Template renders the exact method from registry and manifest (P0) | Every parameter and number must match the run record |
| Refusal | Explains why a forecast, biomass or causal claim cannot be made and proposes the analysis or field requirement that would allow one | Forecast eligibility gate (P2) | Prohibited-claims scan |

Pre-registration is the point: the plan, with its scope and window, is committed before results are read, so the model cannot shop for a lag, window or stratum that looks interesting.

## Typing rule

Descriptive transforms of measurements (counts, departures, flags against fixed thresholds, phenology descriptors) are `observation`. Anything with a fitted model, test statistic, learned partition or break search is `model_estimate` and must carry an uncertainty other than `not_quantified`, unless the recipe declares why it cannot.

## Registry entry

Each recipe is one versioned entry: `recipeId`, `version`, `title`, `question`, `operation`, `implementation` (language, package, version), `inputs` (dataset roles), `parameters` (name, role: scope, method or display, allowed values, default), `sensitivitySet`, `applicability` checks with minimum data, `outputs` (metric, unit, claim kind, uncertainty kind), `assumptions`, `failureModes`, `standardLimitations` (verbatim text), `allowedComponents`, `forbiddenPhrases`, `references` (SCI IDs), `priority`, `formulaPlain` (the formula in plain sentences, for method cards), `registration` (when and how the entry was fixed) and, for a post hoc version, `postHocNote` (the sentence a card must show). The inspector renders a method card from the entry and the bundle manifest ([evaluation harness](evaluation.md#method-and-data-cards)).

Recipes run in the offline pipeline and are stored as derived bundles whose `methodId` is the recipe ID, so staleness propagates through existing provenance and no new record type is needed. Live results are labeled "precomputed analysis".

## Catalog

| Recipe | Question | Method | Output and claim kind | Priority |
|---|---|---|---|---|
| `coverage_summary` | How much usable data per month and stratum? | Valid pixel-month counts and valid fraction; catchment only in version 1.0.0 ([entry](#p0-recipe-entries)) | Counts; observation | P0 |
| `monthly_departure` | Was this month unusual relative to 2019 to 2025? | Pixel-first departure from the same-month reference median, summarized over common-valid area; all-years and leave-one-year-out references both computed | Index units; observation with spatial spread | P0 |
| `season_summary` | Was a wet season below, near or above its 1991 to 2020 range? | Wet-season (November to April) catchment rainfall total against the terciles of the 30 wet seasons that start in 1991 to 2020; departure from their mean ([entry](#season-summary-and-the-near-normal-band)) | Category and mm; observation | P0 |
| `aligned_antecedent` | Do vegetation and rainfall departures move together? | Aligned departures; same-sign counts for 0, 1, 2 and 3 month windows, for the all-years and the leave-one-year-out vegetation reference, all reported together ([entry](#p0-recipe-entries)) | Counts; observation | P0 |
| `window_trend` | Did the peak-window mean change monotonically over seven years? | Theil-Sen slope with 95% interval and exact Kendall S, computed for vegetation and rainfall side by side | Model estimate with interval | P1 |
| `anomaly_flags` | Which months were unusually low or high? | Robust z against leave-one-year-out same-month departures at thresholds 2.0, 2.5 and 3.0 (all shown) | Flags; observation | P1 |
| `phenology_descriptors` | When and how strongly does each place green up? | Month of peak, peak, amplitude and window sum from the 12-month reference profile | Observation at one-month resolution | P1 |
| `phenology_strata` | Which areas should be sampled separately? | k-means on descriptors plus elevation and aspect, cropland masked, k from 4 to 6 by a fixed silhouette rule | Strata; model estimate with stability | P1 |
| `lagged_rank_association` | How strongly do departures co-vary at each prespecified lag? | Spearman rho for lags 0 to 3 together, moving-block bootstrap 90% intervals; never select a best lag | Model estimate with interval | P1 |
| `dry_year_scenario` | What did a dry season look like here? | Lowest-tercile wet-season rainfall against 1991 to 2020, returning those years' vegetation departures | Scenario | P1 |
| `candidate_break` | Is there a candidate structural change worth inspecting? | BFAST Lite or PELT on stratum departures, one break, minimum segment 24 months | Model estimate labeled "candidate break for inspection" | P2 |
| `seasonal_kendall` | Trend using all seasons | Seasonal Kendall with and without correlation correction, seasonal Sen slope | Model estimate | P2 |
| `forecast_eligibility` | Can anything beat climatology and persistence here? | Pre-registered backtest with conformal intervals | Eligibility record | P2 |
| `field_mask_sam` | Where are irrigated fields and orchards? | Segment Anything on Model API with a validation sample | Mask with user's and producer's accuracy | P2 |
| `comparison_matching` | Which strata could serve as comparisons in a field design? | Coarsened exact or Mahalanobis matching on terrain and reference phenology | Candidate comparison strata supporting a field requirement | P2 |

## Season summary and the near-normal band

Registered 2026-10-27, before any event comparison has run and without reading any vegetation data. `compare_events` ([data contracts](data-contracts.md)) uses this entry to decide whether a published statement's rainfall direction agrees with the catchment record; changing the season, the reference or the band after a comparison has run is a new version labeled post hoc.

| Field | Value |
|---|---|
| `recipeId`, `version` | `season_summary`, `1.0.0` |
| Question | Was a wet season's catchment rainfall below, near or above its 1991 to 2020 range? |
| Inputs | The CHIRPS v3.0 monthly catchment totals of the case's validated rainfall bundle, computed with the same cell weights over 1991-01 onward |
| Season | Wet season: November of year *y* to April of year *y* + 1, six months, ID `season_<y>-11_<y+1>-04`, fixed for this version. Reason: in `bundle_chirps_monthly_ait_bouguemez` these six calendar months hold 557.2 mm of the 676.5 mm annual sum of 1991 to 2020 monthly means (82%) |
| Formula | Season total S = sum of the six monthly catchment totals. Reference: the 30 wet seasons that start in November 1991 to November 2020, totals sorted ascending x(1) to x(30). Lower bound L = (x(10) + x(11)) / 2; upper bound U = (x(20) + x(21)) / 2. Category: `below_normal` if S < L, `above_normal` if S > U, otherwise `near_normal`. Departure D = S minus the mean of the 30 reference totals, in mm |
| Why terciles | Three equal groups of the reference seasons, so 10 reference seasons fall in each category (barring ties), and the categories carry the same names as the stated rainfall directions in event records. National services use this split of the 1991 to 2020 record for seasonal products ([SCI-144](../../research/science/source-register.md)) |
| Parameters | None; season, reference and band are fixed per version. Display only: the band is shown as L to U in mm next to S |
| Event mapping (`compare_events`) | An event whose start falls in November or December of year *y* maps to the season starting November *y*; January to October of year *y* maps to the season starting November *y* - 1. The result also states whether the season had ended (1 May) by the event start, because a statement made mid-season is compared with the whole season's total |
| Applicability | All 30 reference seasons and all six months of the season present; otherwise blocked with the missing months listed. A season outside the bundle's months returns `no_matching_period` |
| Outputs | `season_total_mm`, `season_departure_mm`, `season_category`, `near_normal_band_mm` [L, U], `reference_seasons` 30; claim kind `observation`; uncertainty `not_quantified` (no interval is claimed for a tercile class) |
| Agreement | `agrees` when the statement's stated direction equals the category; `does_not_agree` otherwise; `not_applicable` when no direction is stated |
| Assumptions | The catchment-weighted CHIRPS total stands for the catchment's wet-season rainfall; November to April is the season the statement refers to |
| Failure modes | A statement about a different area (national or provincial) can disagree with the catchment and still be true for its own area; snowfall timing and a short rainy spell inside the season are invisible in a six-month total |
| Standard limitations (verbatim) | "The category places this wet season among the 30 seasons of 1991 to 2020 for this catchment's CHIRPS grid cells; it is not a drought index and says nothing about cause." "Agreement compares directions only: a national statement can differ from one valley and still be correct for its own area." "CHIRPS cells are estimates for 5 km squares, not rain gauge readings." |
| Allowed components | Season row in the rainfall panel; agreement chip on an event marker; method card |
| Forbidden phrases | "drought confirmed", "proves", "caused by", "SPI", "probability", "significant" |
| References | [SCI-09](../../research/science/source-register.md) (CHIRPS v3.0), [SCI-144](../../research/science/source-register.md) (tercile categories) |
| Priority | P0 |

The precomputed result is a derived bundle with `methodId` `season_summary` covering every wet season from 2018-11 to 2025-04 that the rainfall data supports, with L, U and the 30 reference totals in its manifest. The same band is the lowest-tercile rule of `dry_year_scenario`.

With seven yearly values, a trend is significant at p < 0.05 only if at least 18 of 21 year-pairs move the same way, and seven years sits near the record length where seasonal trend tests stop being reliable (Hirsch and Slack 1984). Siterra therefore makes no significance claims; "significant trend" is a prohibited phrase.

Out of scope for the build: model-written analysis code in the product (Meta's Model API has no hosted code execution, and agent benchmarks show frequent wrong method choices), TIMESAT (research-only license from 4.2.1), LandTrendr and CCDC (record too short), STL as evidence (needs gap-filling), and pixel-level significance maps.

## P0 recipe entries

Before any data was read, only the catalog rows above existed for `coverage_summary`, `monthly_departure` and `aligned_antecedent`, and there was no entry for `terrain_strata`. Their detailed formulas and parameters below were written together with their first run on 2026-10-27, so they are not pre-registered; only `season_summary` was registered in full before its use. `aligned_antecedent` 1.1.0 is a post hoc revision made the same day after the first results and an audit: it adds the leave-one-year-out reference beside the all-years one and states the zero rule, and neither reference is preferred. 1.1.1, also post hoc and the same day after a second audit, applies the zero rule to the stored values (V at four decimals, R_k at two), so the published rows reproduce the counts; it changes the all-years aligned counts from 46, 46, 46 and 45 to 45, 45, 45 and 44. From now on, any change to a formula, parameter or window after results are read is a new version labeled post hoc. The machine-readable form of these entries is `science/recipes/registry.json`.

| `coverage_summary` 1.0.0 | Value |
|---|---|
| Formula | A pixel is clear on a date when its scene classification is 4 or 5 and red and near-infrared are present; a pixel-month is accepted with at least 3 clear dates; valid fraction = accepted pixels / catchment pixels; a period is available at 70% or more, insufficient below, missing with no clear date |
| Parameters | `min_dates_per_pixel_month` 3; `min_area_coverage` 0.70; scope: the catchment only (no strata in this version) |
| Outputs | Clear dates, valid fraction, cloud and snow shares per period; observation, not quantified |
| Standard limitations | "Reduced QA (scene classification only): snow, snow edges and terrain shadow can survive the mask." "Coverage counts how much data passed the mask; it says nothing about vegetation condition." "This version summarizes the catchment only; per-stratum coverage is not computed yet." "In winter months the accepted pixels favour the valley floor and south-facing slopes, because snow and shade remove the others; the area value then describes those pixels, not the whole catchment." |
| References | [SCI-07](../../research/science/source-register.md) (scene classification classes) |

| `monthly_departure` 1.0.0 | Value |
|---|---|
| Formula | NDVI = (NIR - Red) / (NIR + Red) with reflectance = DN / 10000; N(p, y, m) = per-pixel median over clear dates, used where the pixel-month is accepted; ref(p, m) = median of N over 2019 to 2025 with at least 4 years; ref_loyo(p, y, m) = the same over the other years, at least 4; dep = N - ref and dep_loyo = N - ref_loyo; summary = area median and spatial IQR over common-valid pixels, withheld below 70% of the catchment |
| Parameters | `reference_years` 2019 to 2025; `min_reference_years` 4; `min_area_coverage` 0.70; both references always computed and stored side by side |
| Outputs | `ndvi_departure_area_median` and `ndvi_departure_area_median_leave_one_year_out`, NDVI units, spatial IQR; observation |
| Note | With 4 to 7 years per calendar month, the all-years per-pixel median often equals the month's own value, so the all-years area median sits at or near 0 by construction; the leave-one-year-out value answers "was this year unusual" |
| Standard limitations | "The reference is a short period (2019 to 2025), not a climate normal." "A departure describes how this month differs from other years here; it does not say why." "The spatial IQR is variability across pixels, not a confidence interval." The winter sentence above |
| References | [SCI-07](../../research/science/source-register.md), [SCI-29](../../research/science/source-register.md) |

| `aligned_antecedent` 1.1.1 | Value |
|---|---|
| Formula | V(t) = `monthly_departure` area median for month t, once with the all-years and once with the leave-one-year-out reference; P(t) = catchment rainfall departure from the 1991 to 2020 same-month mean (mm); R_k(t) = P(t) + ... + P(t - k) for k = 0 to 3; values are compared as stored (V at four decimals, R_k at two), and a month whose stored V or R_k is 0 has no sign and is not counted (zero rule); n_k = months with both defined and non-zero, same_k = months with the same sign |
| Parameters | windows 0, 1, 2 and 3 months; both vegetation references; zero rule on stored values as stated (version 1.1.1); scope: the catchment |
| Outputs | Eight pairs (n_k, same_k), all shown together, and the number of months with a stored V of 0 per reference; observation, not quantified |
| Standard limitations | "Counting months that move together shows co-occurrence; it does not estimate how much of a change rainfall explains." "Rainfall comes from 5 km grid cells, not from gauges in the valley." "A short record can hold months that move together by chance." "Values are compared as stored, V at four decimals and R_k at two; a month whose stored V or R_k is 0 has no sign and is left out of both counts." "Counts are given for both vegetation references side by side; with the all-years reference a 7-year median often equals the month's own value, so more months have V exactly 0." |
| References | [SCI-09](../../research/science/source-register.md), [SCI-29](../../research/science/source-register.md), [SCI-31](../../research/science/source-register.md), [SCI-34](../../research/science/source-register.md), [SCI-142](../../research/science/source-register.md) |

| `terrain_strata` 1.0.0 | Value |
|---|---|
| Formula | Copernicus DEM GLO-30 (2021) bilinear onto a 30 m EPSG:32629 grid aligned with the analysis grid; elevation bands at the 1/3 and 2/3 quantiles of catchment elevation (equal area); Horn 3 x 3 slope and aspect on the 30 m grid; aspect classes N (315 to 45 degrees), E, S, W, and level below 5 degrees of slope; WorldCover 2021 classes 40 (cropland) and 50 (built-up) excluded; 30 m classes repeated onto the 10 m grid |
| Parameters | equal-area terciles; `level_slope_deg` 5; aspect quadrants; excluded WorldCover classes 40 and 50 |
| Outputs | Static layers (Collection assets): elevation band, aspect class, excluded flag |
| Standard limitations | "The DEM is a surface model: trees and buildings raise it; radar artefacts are possible in narrow gorges." "WorldCover 2021 is a 2021 context mask: it maps only 1.1% of the catchment as cropland, and much of the green valley floor is mapped as tree cover, which may include orchards." "Strata organize field sampling; they are not vegetation types, pasture units or management boundaries." |
| References | [SCI-13](../../research/science/source-register.md) (WorldCover) |

## Forecasting policy

1. Siterra forecasts nothing in P0 and P1: no vegetation, rainfall, biomass, carrying capacity, livestock numbers, degradation or recovery dates, intervention outcomes or household effects. A forecast request gets a refusal that states what would be needed (record length, field calibration, a backtest) and creates an analysis or field requirement.
2. Allowed instead: observations, departures, aligned comparisons, descriptive short-record trends, and the labeled dry-year scenario ("what a dry season looked like here").
3. P2 only: the `forecast_eligibility` backtest (expanding window, references from training years only, comparison against climatology and persistence, conformal intervals). An outlook could be shown only if skill stays above zero at the lower bound of its interval and interval coverage is within 10 points of nominal; the expected and valid result is "did not beat climatology".
4. Never: pixel-scale forecasts, biomass or carrying capacity forecasts, forecasts beyond a validated horizon, or forecasts drawn on the observed timeline. Third-party seasonal forecasts appear only as attributed published context.
5. The prohibited-claims scan adds "forecast", "projected", "outlook" (outside an eligible outlook record), "significant trend" and future-tense predictions about vegetation, rainfall, biomass or recovery. Future tense about planned work stays allowed.

## Tools

`list_recipes` (read: catalog entries with computed applicability, inapplicable ones shown as blocked with the reason) and `read_recipe_result` (read: a precomputed result by recipe, version, scope and bundle). Both are in the [agent orchestration](agent-orchestration.md) tool table. Muse Code and any code execution stay outside the product runtime.

## Pipeline tooling

Python 3.12 or 3.13 (rasterio needs 3.12 or later; ruptures does not yet support 3.14). Pins follow the two-week rule in the [stack versions](../../research/technology/stack-versions.md): for example MAPIE 1.5.0 and pystac-client 0.9.0; R `bfast` 1.7.2 if `candidate_break` is built (the Python BFAST package is unmaintained).
