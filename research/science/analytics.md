# Data science, forecasting and analogue evidence: research note and buildable design

Status: research note and design recommendation for Siterra's first case (Ait Bouguemez valley catchment), 2026-10-26. Written by the data-science and ML research lane. **No imagery, rainfall or terrain data were processed for this note.** Arithmetic marked [A] describes properties of statistical tests, never values of the catchment. Nothing here is applied to the repository; section 9 lists proposed edits for the owning lanes.

Labels used throughout: **[V]** verified in an inspected source (SCI ID or URL, inspection level in [new-sources.md](source-register.md)); **[D]** design recommendation (judgment); **[H]** hypothesis; **[U]** not verified; **[A]** arithmetic done for this note. SCI-01 to SCI-44 resolve in `research/science/source-register.md`; SCI-45 to SCI-124 are new and resolve in [new-sources.md](source-register.md).

---

## 0. Answer in brief

1. How Muse can do data science well [D]. Not by computing, and not by writing free-form analysis code. Muse should be the planner, critic and explainer over a fixed, typed catalog of deterministic "analysis recipes": it picks which questions to ask of the data, chooses among recipes whose applicability has already been computed by code, commits its plan before seeing results, interprets results inside per-recipe language rules, writes the narrative around host-rendered methods text, refuses inapplicable requests and turns them into field or analysis requirements. The evidence for this split is strong: on realistic benchmarks, the best data-science agents complete roughly 25 to 42% of tasks [V: SCI-117, SCI-118, SCI-120]; LLMs mostly fail by choosing statistical methods that do not apply [V: SCI-122]; and even expert human analysts given the same ecological data produce effects that cross significance in opposite directions [V: SCI-124]. Constraining choices is the remedy for both.
2. Seven years of monthly Sentinel-2 [D]. Enough for descriptive monthly observations, departures from a short reference, aligned rainfall comparison, anomaly flags, phenology descriptors and sampling strata. Marginal for a per-stratum short-record trend slope with a wide interval, shown next to the same statistic for rainfall. Not enough for significance claims, break detection as evidence, BFAST Monitor, LandTrendr, climate-corrected degradation trends or forecasting. TIMESAT is excluded on licence, not on data [V: SCI-59].
3. Forecasting [D]. No forecast of anything in P0 or P1. The validated vegetation forecasts found are short-lead (weeks to one month), built on 15 or more years of weekly or monthly data, and much of their skill is persistence [V: SCI-63, SCI-64]; a leading published Sentinel-2 NDVI model beats a climatology baseline only modestly, and only when fed observed future weather [V: SCI-66]. A P2 "forecast eligibility" backtest can be built to show, honestly, whether anything beats climatology and persistence; the expected answer with this record is no [H]. The honest substitute for a forecast is a labelled dry-year scenario built from observed years in the record.
4. Analogue sites [D]. Yes, show them, as published context by analogy: each with its study design label, what it measured, how it is similar and different, and mandatory "why this may not apply here". Never transfer their numbers, never let them change a hypothesis status on their own, never present them as observations of Ait Bouguemez. Ten verified candidates are listed in section 4.5.
5. Two new local sources matter more than any method choice [V]. A 2026 engineering thesis sampled 180 plots destructively with multispectral drone imagery in Midelt and **Ait Bouguemez**: the best index explained 42% of herbaceous biomass variance in cross-validation, and bare soil masks biomass below about 800 kg/ha [SCI-106]. A 2026 master's dissertation on the valley reports livestock systems polarizing toward smaller sedentary herds combined with apple growing and tourism [SCI-105]. The first hardens the "no biomass from NDVI" rule with local data; the second makes apple orchards and irrigated fields on the valley floor a first-class confounder for any greening signal.
6. Code execution [V, D]. Meta's Model API documents no hosted code-execution tool; Muse Code is a terminal and CI coding agent with an OS sandbox [V: dev.meta.ai docs, section 5.3]. Keep model-written code out of the product for this build (as `docs/reference/agent-orchestration.md` already requires); use Muse Code, if at all, as a development tool for writing and testing the deterministic recipe library under human review.

---

## 1. Trend and change methods for a 2019 to 2025 monthly record

### 1.1 The record as planned (from project docs)

- Period 2019-01 to 2025-12: at most 84 monthly composites per pixel; pixel-months need at least three valid dates and spatial summaries at least 70% accepted area, so winter months will often be missing (snow and cloud) (`research/geospatial/preprocessing.md`).
- Nationally, 2021 is the only season described as a recovery: drought springs 2019 and 2020, a well-below-average 2022, four of five seasons to 2023 drought-affected, prolonged drought before the 2024 harvest and a below-average 2025 [V: SCI-25, national cereal context, not catchment rainfall]. The 2019 to 2025 "short reference" is therefore largely a dry-period reference, and the direction of any 7-year slope depends on where the locally wetter years fall, which only the CHIRPS series for the catchment can show.
- A radiometric-offset harmonization step around the January 2022 processing-baseline change must be verified on scenes either side of it (preprocessing.md step 3). An error there would create a level shift coinciding with the 2022 drought; level shifts can increase the years needed to detect a trend by 50% or more [V: SCI-50].
- Snow cover varies strongly between years and melt timing drives spring vegetation [V: SCI-26, SCI-27]; elevation bands therefore have different usable months.

### 1.2 Method by method

| Method | Requirements found [V] | Fit with this record | Verdict [D] |
|---|---|---|---|
| Mann-Kendall test and Theil-Sen slope on one value per year (annual or fixed seasonal window) | Distribution-free; exact p available without ties (SciPy `kendalltau(method="exact")`); Theil-Sen interval from SciPy `theilslopes` (SCI-49). Annual aggregates or seasonal-trend models outperform deseasonalized series (SCI-51). Detecting 5%/decade typically needs about 10 to more than 20 years (SCI-50) | [A] 7 values give 21 pairs. A two-sided exact p below 0.05 needs S of at least 15, that is at least 18 of 21 pairs in the same direction (two-sided p 0.030 at S = 15; 0.069 at S = 13). The 95% Theil-Sen interval spans roughly the 4th to the 18th of the 21 ordered pairwise slopes. Autocorrelation cannot be estimated from 7 values | **P1, descriptive only**: slope with interval per stratum, same statistic for CHIRPS over the same years and window, no significance badge |
| Autocorrelation corrections: Hamed-Rao variance correction; prewhitening and trend-free prewhitening | Hamed and Rao (SCI-45, metadata only; implemented in pyMannKendall, SCI-62). Prewhitening removes part of a real trend; remove trend before estimating AR(1) (SCI-46) | Needs a reliable autocorrelation estimate: impossible from 7 annual values; from monthly departures it is estimated from at most 84 gappy values | **P2 sensitivity only**, never a gate to a claim |
| Seasonal Kendall (monthly seasons) with Hirsch-Slack covariance correction | Handles seasonality and missing values (SCI-47). Corrected test is robust to serial correlation except under strong persistence (monthly ARMA(1,1), phi above 0.6) or short records of about 5 years (SCI-48) | 7 years is close to the short-record regime, and vegetation memory makes strong persistence plausible [H]. [A] at most 252 within-season pairs (189 if three winter months are always missing) | **P2 sensitivity**: report corrected and uncorrected together; drop seasons with fewer than 5 valid years |
| STL decomposition | statsmodels 0.15.0: `period` at least 2; no missing-value handling found in the source; the documented example fills gaps first (SCI-60) | Winter gaps would need imputation, which breaks the project rule "missing is a value, never interpolated" (`docs/reference/data-contracts.md`) | **Not evidence.** At most a display-only view with filled months marked, after P2 |
| BFAST (classic) | Demonstrated on 16-day MODIS composites 2000 to 2009 (SCI-53, SCI-54); `bfast()` defaults `h = 0.15`, `season = "dummy"`, examples require a regular series without NA (SCI-56); simulated detection of changes above 0.1 NDVI; phenological change needs seasonal amplitude above noise (SCI-54) | [A] h = 0.15 of 84 steps is about 13 months per segment (fewer once gaps are removed), against 8 parameters per segment with harmonic order 3 or 13 with monthly dummies. Over-detected breaks can flip trend signs (SCI-51) | **Not P0 or P1** |
| BFAST Lite | Handles missing values without interpolation; break count by information criterion (default LWZ); tested on 11-year MODIS (SCI-56) | Same short-record weakness, but no imputation | **P2 exploratory**: stratum aggregates only, minimum segment 24 months, at most one break, labelled "candidate break for inspection", always checked against rainfall, snow and the 2022 harmonization step |
| BFAST Monitor | Needs a stable history; demonstrated with history from 2000 (SCI-55) | A 2019 to 2022 history contains the drought springs of 2019 and 2020 and a well-below-average 2022 (SCI-25): not stable | **Not now.** A future monitoring product once a longer history and field-defined units exist |
| CCDC | Per-observation model; `minObservations` 6 to flag change; `minNumOfYearsScaler` 1.33 (SCI-57) | Needs per-scene processing rather than monthly composites; aimed at abrupt land-cover change | **Out of this build.** Plausible later route for mapping orchard or cropland conversion |
| LandTrendr | One observation per year; `minObservationsNeeded` 6 (SCI-58) | 7 annual values sit at the floor; segmentation is meaningless | **Not defensible** |
| TIMESAT | At least 3 years; returns one season fewer than years supplied; equal number of files per year (SCI-59) | Monthly composites give one-month timing resolution; snow confounds green-up | **Excluded**: research-only licence since 4.2.1 (SCI-59) |
| Simple phenology descriptors (month of peak, peak value, amplitude, fixed-window sum) from the 12-month reference profile | No external package needed | One-month resolution; descriptive only | **P1** for stratification |
| Climate-corrected productivity (RESTREND, RUE, TSS-RESTREND) | Trend detectability needs 30 to 40% simulated degradation under rainfall-driven variability; RESTREND broke down near 20% (SCI-29); RUE can stay correlated with rainfall (SCI-31); TSS-RESTREND adds break handling (SCI-30) | Record too short for residual trends to mean anything [H] | **Stays P2** and stays listed as missing evidence (decision already in docs) |

### 1.3 The defensible package [D]

1. **Descriptive observations (P0, already specified):** monthly values with coverage; departures from the same-month 2019 to 2025 reference median (with a leave-one-year-out reference when judging whether a particular year was unusual); aligned rainfall departures; counts of same-sign months for the prespecified 0 to 3 month antecedent windows.
2. **Short-record window trend (P1):** per stratum, Theil-Sen slope with 95% interval and the exact Kendall S, for NDVI and CHIRPS side by side. When the interval spans zero the card must read: "No monotonic change is distinguishable from year-to-year variation in 7 values. This does not show that no change occurred."
3. **Anomaly flags, phenology descriptors and sampling strata (P1)** (section 3).
4. Candidate breaks and seasonal Kendall sensitivity (P2).

Rules that apply to all of them [D]:
- Analyse stratum aggregates (elevation band by aspect, cropland and built areas masked). Never publish pixel-wise significance; if many strata are tested, control the false discovery rate and report every stratum, not the "significant" ones [V basis: SCI-52].
- Fix windows before computing trends: the window for each stratum is its reference-profile peak month plus or minus one month, derived from the reference profile, not from the trend.
- Always compute the same statistic for rainfall over the same window and years and show both. Trends that track rainfall are context for the rainfall hypothesis, not evidence about grazing [V basis: SCI-29, SCI-47 on driver-sequence artefacts].
- Any change detected near early 2022 is checked against the harmonization rule before it is shown.
- Mask irrigated cropland and orchards. WorldCover 2021 (SCI-13) is a single 2021 snapshot, and apple growing is reported as a main activity combined with livestock keeping in the valley [V: SCI-105]; whether orchards expanded over 2019 to 2025 and whether WorldCover captures them are [H].

### 1.4 Failure modes common to trend and change outputs

Drought years at the start of the window; snow-timing shifts read as vegetation change; harmonization step; terrain shadow removing aspects unevenly (preprocessing.md); valley-floor orchards and fields leaking into rangeland strata; soil background dominating NDVI in sparse cover (SCI-32, SCI-33; locally confirmed at drone scale by SCI-106); greening by unpalatable species (docs/10); statistical confidence manufactured from correlated pixels or months (docs/10, already prohibited).

---

## 2. Forecasting

### 2.1 What has been validated, and why it does not transfer

| Study [V] | Target, scale | Inputs | Lead | Validation | Skill relative to baselines | Why it does not transfer here |
|---|---|---|---|---|---|---|
| Barrett et al. 2020, Kenya (SCI-63) | 3-month VCI, pastoral livelihood zones | Past index values only (AR, Gaussian process); MODIS and Landsat | 2 to 10 weeks (results focus on 2 to 6) | Rolling application along the record; MODIS forecasts assessed from 2004 | Alert hit rate about 89% with about 4% false alarms at 4 weeks; RMSE about half of persistence at 4 weeks; authors attribute much of the R² to the 12-week compositing overlap and call the methods suitable for short leads only; earlier monthly-NDVI AR work reached R² 0 to 0.4 at one month (as cited) | Weekly index data, AR fitted on 200-week training segments; our record is at most 84 gappy monthly values |
| Adede et al. 2019, Kenya (SCI-64) | 3-month VCI, four counties | Lagged rainfall and vegetation indices; ANN | 1 month | Train 2001 to 2015, test 2016 to 2017 | Best R² 0.78 out of sample; 67% accuracy over five deficit classes | 15 training years; arid lowland counties |
| Lees et al. 2022, Kenya (SCI-65) | Vegetation health | LSTM | Not in abstract | Not in abstract | Better than a shallow network and persistence (no numbers in abstract) | Same as above |
| Benson et al. 2024, Europe (SCI-66) | Sentinel-2 NDVI at 20 m | Past imagery, past **and future observed weather**, elevation | 100 days | Held-out years 2021 to 2022 and regions | Climatology R² 0.58, RMSE 0.18; persistence R² 0.00; best model R² 0.62, RMSE 0.14, beating climatology on 66.8% of minicubes; earlier models did not consistently beat climatology | Perfect weather foresight; continental training data; Europe |
| Bouras et al. 2021, Morocco (SCI-67) | Provincial cereal yield | Satellite drought indices, weather, NAO | 2 to 4 months before harvest | Leave-one-out over 270 province-years (2000 to 2017) | R² 0.88 in January | Cereal yields at province scale with 18 years, not rangeland NDVI in a 417 km² catchment with 7 |
| Tuel and Eltahir 2018, Morocco (SCI-68) | Winter and spring precipitation, Oum Er Rbia basin | Lagged ocean surface temperatures (statistical) | 1 month | Not detailed in abstract | About 35 to 40% of interannual variability "robustly predictable" | Basin precipitation, not vegetation; drainage link to the case catchment not verified [U] |
| Giuntoli et al. 2022, Mediterranean (SCI-69) | Winter weather-regime frequencies | Five C3S seasonal systems | Seasonal | Against reanalysis | Moderate skill, higher in strong ENSO years | Regimes, not local rainfall |

No inspected source verifies C3S (SEAS5, SCI-70) or NMME (SCI-71, metadata only) precipitation skill for the Central High Atlas [U].

What the evidence says [D]: (1) the vegetation forecast skill that exists is short-lead and mostly persistence, built on long dense records; (2) NDVI climatology is a hard baseline even for large models with perfect weather; (3) seasonal rainfall predictability in Morocco is partial and basin-scale; (4) many published "forecasts" are hindcasts fed observed future weather and must not be read as operational skill.

### 2.2 Uncertainty quantification

- Split conformal prediction assumes exchangeable data; time series violate it [V: SCI-73]. EnbPI wraps ensemble predictors without exchangeability, with coverage bounds that vanish asymptotically under extra assumptions [V: SCI-74]. Adaptive conformal inference guarantees long-run coverage frequency, not per-step coverage [V: SCI-75]. MAPIE 1.x exposes these as `TimeSeriesRegressor` with `method` "enbpi" or "aci", and `BlockBootstrap` [V: MAPIE API reference].
- The binding constraint here is sample size, not method. [A] With about 50 out-of-sample months, an observed 90% coverage carries a binomial standard error of about 4 percentage points (95% half-width about 8 points), before accounting for autocorrelation, which reduces the effective sample further. Coverage can be checked only roughly.

### 2.3 When a forecast would be defensible in this case [D]

All of the following, or no forecast is shown:
1. Target is a stratum- or catchment-level monthly NDVI departure (never pixel, never biomass), for 1 to 3 months ahead.
2. A pre-registered rolling-origin backtest (below) shows positive skill against **both** climatology and persistence, with the lower bound of a year-block bootstrap interval above zero, at each horizon shown.
3. Empirical interval coverage within 10 percentage points of nominal.
4. Inputs available at forecast time are the ones used in the backtest (CHIRPS preliminary, not final; forecast rainfall, not observed rainfall), or the result is labelled a hindcast.
5. A scientific reviewer approves the eligibility record.

### 2.4 Backtest design [D]

- **Target:** stratum monthly departure, only months meeting coverage thresholds; missing targets stay missing.
- **Leakage controls:** the same-month reference used to define departures is recomputed from training years only at each origin (the 2019 to 2025 short reference contains the test years); CHIRPS preliminary versus final provenance recorded (docs/11 notes they share filenames).
- **Baselines:** climatology (training-window same-month median), persistence (last observed departure), damped persistence (AR(1) on departures).
- **Candidates (small on purpose):** AR on departures; AR with antecedent CHIRPS departures (labelled hindcast if observed rainfall is used for the target period); later, the same with C3S seasonal rainfall (true forecast inputs) if licence and access are confirmed.
- **Origins:** expanding window starting after 24 months of training, monthly origins from 2021-01, horizons 1, 2 and 3 months [V basis: SCI-72]. [A] At most 60 target months per horizon before gaps.
- **Scores:** MAE and CRPS; skill score = 1 minus model score divided by baseline score, against each baseline; interval coverage and width; year-block bootstrap for intervals; results per elevation band.
- **Pre-registration:** horizons, models, metrics and pass criteria committed in the recipe version before the first run; any change creates a new version and the old result stays visible.
- **Outcome record:** an eligibility decision (eligible / not eligible) with the scores is the evidence. "Not eligible: did not beat climatology and persistence over 2021 to 2025" is a legitimate, useful finding.

Expected outcome [H]: with 5 test years, winter gaps and a record in which most seasons were nationally drought-affected (SCI-25), the lower bound of skill against climatology will not clear zero.

### 2.5 Labelling if one ever passes [D]

`claimKind: model_estimate`; title "Experimental outlook (hindcast-validated 2021 to 2025)"; interval always shown with its empirical coverage; visually separate from observations (never on the same line as observed months); expires when the target month is observed; excluded from the decision brief's action rationale. Third-party seasonal forecasts (C3S) may be cited as published context with provider attribution and provider verification, never converted into vegetation predictions in this build.

### 2.6 The honest substitute: dry-year scenario (P1) [D]

A deterministic rule selects record years whose wet-season (prespecified, for example November to April) catchment CHIRPS departure falls in the lowest tercile of the 1991 to 2020 reference; the case shows those years' observed NDVI departures. Statement template: "If the coming season is as dry as {years}, the record shows what a dry season looked like here in those years." Typed `scenario`, shows how many analogue years exist (probably one to three [H]), and states that this is not a forecast.

---

## 3. Defensible ML roles

| Role | Method and tools | Output and claim kind | Validation | Limits | P |
|---|---|---|---|---|---|
| **Phenology-profile clustering to stratify field sampling** | k-means (scikit-learn) on standardized phenology descriptors plus elevation band and aspect (northness, eastness); cropland and built masked; k from {4, 5, 6}, chosen by a fixed rule (mean silhouette), 20 seeds; stability reported as adjusted Rand index across seeds and bootstrap resamples | Strata map and per-stratum summaries; `model_estimate` feeding the field plan's `field_requirement` items | Design-based: a stratified probability sample stays unbiased whatever the strata, provided inclusion probabilities are accounted for; bad strata only cost precision [V: SCI-77]. Efficiency checked after fieldwork | Clusters may track snow, shadow or irrigation rather than vegetation; strata may be inaccessible or socially meaningless; locally agreed management units override them | P1 |
| **Anomaly flags** | Robust z of stratum monthly departures against leave-one-year-out same-month departures (median and 1.4826 x MAD); thresholds {2.0, 2.5, 3.0} all computed | Flagged months for inspection; `observation` (descriptive transform, no fitted model) with method card | Cross-check against SCL snow fraction, rainfall departure and the model imagery review (P1 in docs/13) | Relative to a 7-year reference that itself contains droughts; "unusual" is not "degraded". Operational anomaly indices such as Kenya's VCI rest on multi-year climatologies from MODIS since 2000 and carry per-pixel uncertainty ranges (SCI-76); this record has neither the length nor the smoother | P1 |
| **Segmentation of irrigated fields and orchards** | SAM 3.1 (`sam-3.1`) on the Model API, noun-phrase prompts, one object type per request [V: Meta docs]; concept prompting as described for SAM 3 (SCI-78); true-colour composites | Candidate mask; `model_estimate` until validated | Agreement with WorldCover 2021 reported, plus a stratified random sample of points labelled by a person from imagery the project may use; user's and producer's accuracy with intervals | SAM often transfers to overhead imagery but has systematic failures there and weaker results at lower resolution [V: SCI-79, SCI-80]; 10 m pixels are coarse for small terraces [H] | P2 |
| **Comparison-area matching (spatial analogues inside the region)** | Coarsened exact or Mahalanobis matching on terrain, reference phenology and, if available, distance to settlement [V basis: SCI-81, SCI-82] | Candidate comparison strata for a BACI field design; supports `field_requirement`, never an effect estimate | Balance diagnostics finalized before outcomes are examined (SCI-82) | Unobserved management, soils and access; spillover; very few units | P2 |
| **Temporal analogues (dry-year scenario)** | Deterministic tercile rule (section 2.6) | `scenario` | Rule fixed in recipe version | Few analogue years | P1 |
| **Imagery quality review** | Muse image input on thumbnails (already P1 in docs/13) | QA flags, never measurements | SCL comparison | Model vision errors | P1 |

Not defensible in this build: regression from NDVI to biomass or carrying capacity (locally, even drone indices explained 42% of biomass variance and missed biomass below about 800 kg/ha [V: SCI-106]; in the Oriental region a global model could not estimate production [V: SCI-107]); supervised "degradation" classifiers (no labels exist); causal ML on observational pixels.

---

## 4. Analogue and reference sites

### 4.1 What the methods literature establishes [V]

- **SER standards (SCI-87):** a reference model is built from multiple sources, best from multiple modern analogues or reference sites that are environmentally similar and minimally degraded, combined with local knowledge and stakeholder consultation; it is not a historic snapshot and must not freeze an ecosystem in time; shifting baselines can make degraded references look intact. Comparing a site with its reference model shows progress toward a target but not that treatments caused the change; that needs before-after-control-impact data. Seasonal mountain pastures are named (EU context) among semi-natural ecosystems where traditional management can be part of ecosystem integrity, a direct caution against equating grazing with degradation.
- **Design strength (SCI-90):** in simulations parameterized from 47 ecological datasets, BACI estimated effect direction and magnitude 3.2 to 4.6 times better than control-impact designs and 7.1 to 10.1 times better than after-only designs. Most analogue studies available here are control-impact, before-after or ethnographic.
- **Space-for-time (SCI-91, SCI-92):** substitution was about 72% as accurate as time-for-time prediction in one pollen-based test and performed poorly when temporal variation was small relative to spatial variation.
- **Matching and synthetic control (SCI-81 to SCI-86):** attribution needs an inferred counterfactual from a design that controls confounding (SCI-84); ignoring covariates linked to both treatment and outcome overstated protected-area effects by over 65% in Costa Rica (SCI-83); matching needs a theory of change, covariate choice and balance checks finalized before outcomes (SCI-82); synthetic control needs a sizeable donor pool with similar pre-intervention outcomes (SCI-86).
- **Neighbouring valleys differ for many reasons (SCI-102):** Ait Bou Guemez and the adjacent Ait Bou Oulli valley had very different forest trajectories despite a shared mountain and bioclimatic setting, interpreted through population, market access and institutions. A "control valley" next door is not a counterfactual.

### 4.2 Verdict [D]

Good feature, if framed correctly. It answers a real decision question ("has anything like this been tried in comparable places, and under what conditions?"), it is how restoration practice builds reference models, and it gives the field plan concrete designs to copy (exclosure plots, herd GPS tracking near settlements). It becomes harmful if analogues are read as evidence about Ait Bouguemez's condition or as predicted outcomes.

### 4.3 Presentation rules [D]

1. Claim kind is always `scientific_context` with an `analogy` scope; never `observation`, `model_estimate` or `verified_outcome`.
2. Every card shows: place and scale; what was studied and how (design label from a fixed vocabulary); period; finding paraphrased with a verified excerpt; similarities and differences with the case on named dimensions; **transfer limits (required, non-empty)**; and "what this cannot tell us about Ait Bouguemez" (required).
3. **No numeric transfer:** analogue numbers appear only inside the analogue card, attributed to the source; the numeric-provenance validator rejects any analogue number in a case-level statement, intervention benefit or resource requirement.
4. Analogue evidence may `support` an Intervention (feasibility context) or inform a `field_requirement`; it may **not** move a Hypothesis to `consistent` or `inconsistent` without at least one case observation (new claim rule).
5. Order is fixed and explained (same massif first, then other Moroccan mountains, then syntheses); no similarity scores, no ranking.
6. Locations at publication-locator precision only; no sensitive sites.

### 4.4 Data model [D]

P0: reuse `Source` plus `Evidence` (`scientific_context`) with `scopeNote` starting "Analogy:" and transfer limits in `limitations[]`; no schema change.

P1: add an `AnalogueAssessment` record (prefix `ana_`), model-facing schema inside Meta's strict subset (all fields required, nullable by union):

| Field | Type | Rule |
|---|---|---|
| `sourceIds` | string[] (min 1) | Only `retrieved` sources |
| `siteName`, `region`, `country` | string | As published |
| `locator` | `{lat, lon, precisionNote}` or null | Publication locator; `boundaryRole: regional_context` if drawn |
| `ecosystem` | string | As published (for example "dwarf-shrub sagebrush steppe") |
| `elevationNote`, `climateNote` | string or null | As published, with locator |
| `governance` | enum `customary_agdal`, `state_protected_area`, `state_forest`, `project`, `private`, `mixed`, `unknown` | |
| `practice` | enum `seasonal_closure`, `long_term_exclosure`, `rotation`, `continuous`, `planting`, `none`, `not_applicable` | |
| `studyDesign` | enum `rct`, `baci`, `before_after`, `control_impact`, `after_only`, `space_for_time`, `diachronic_imagery`, `ethnography_or_survey`, `review_or_meta_analysis`, `palaeo` | Rendered as a label |
| `studyPeriod` | string | |
| `outcomesMeasured` | string[] | |
| `finding` | `{statement, locator, excerpt}` | Excerpt verified verbatim (existing rule) |
| `similarities`, `differences` | `{dimension, caseValue, analogueValue, basis}[]` | Dimension enum: elevation, climate, vegetation, livestock, governance, access, scale, period |
| `transferLimits` | string[] (min 1) | Required |
| `cannotShow` | string | Required |
| `usableAs` | enum[] `reference_model_input`, `intervention_context`, `field_design_input`, `livelihood_context` | |
| `numbersTransferable` | const false | |

### 4.5 Verified candidate analogues

All inspected as stated in [new-sources.md](source-register.md). Design labels use the vocabulary above.

| # | Place | What was studied (design) | What was found [V] | Why transfer is limited |
|---|---|---|---|---|
| 1 | **Southern side of the Central High Atlas toward the Ouarzazate basin** (Taoujgalt, Ameskar, Bou Skour; Ait Mgoun, Ait Toumert, Ait Zekri tribes); SCI-93, SCI-94, SCI-95 | Browsed vs unbrowsed permanent plots 2004 to 2009 in sagebrush steppe (control-impact with repeated measures); GPS-collared village goat herds for a year; transhumance tracking and interviews | Browsing reduced biomass change of *Artemisia herba-alba*; biomass rose with and without browsing after a drought, about twice as much without; grazing concentrated within 250 m (most affected within 500 m) of settlements; herd directions constrained by community boundaries | South side of the massif toward the Ouarzazate basin, likely drier than the case valley [H]; one exclosure; dwarf-shrub steppe; 2004 to 2009; the thesis's plot-scale carrying capacities are explicitly not extrapolable and must not be reused |
| 2 | **Yagour agdal, Ait Ikiss (Mesioua), High Atlas of Marrakech**; SCI-96 with SCI-23, SCI-24 | Ethnography and household economics, fieldwork 2003 to 2008 (ethnography_or_survey) | A roughly three-month spring herding ban with equal household access; the Yagour supplies up to 18% of users' annual agropastoral gross income through fodder (author warns accounting is imprecise); religious and social dimensions sustain the rules | Different tribe, institution and period; no ecological measurement in the inspected abstract; income share is site-specific |
| 3 | **Oukaimeden plateau, High Atlas of Marrakech** (Rheraya and Ourika herders); SCI-98, SCI-99, SCI-100, SCI-101 | Aerial-photo history of wet pastures (diachronic_imagery); floristic surveys; ethnoarchaeology of customary access; 1,000-year pollen record (palaeo) | Wet grasslands are small, species-rich (165 taxa, 30.3% endemic across three sites), heavily used and altered by a 1970s dam, tracks and drains; customary summer access rules of religious origin coexist with tourism; long history of grazing impact | Wet pozzine habitat unlike dry slopes; ski and tourism infrastructure; change driven by hydrological works, not grazing management alone |
| 4 | **Ait Bou Oulli, the neighbouring valley**; SCI-102 | Paired-valley comparison of forest dynamics from aerial documents (diachronic_imagery) | Very different forest trajectories in two adjacent valleys with shared setting, linked to population, market access and institutions | Forest, not pasture; shows why a neighbouring valley is not a control |
| 5 | **Ifrane National Park, Middle Atlas** (Aghbalou Laarbi forest); SCI-103 | Area closed to grazing for 10 years vs grazed area, against a defined reference ecosystem (control_impact) | Phytomass 2,070.1 vs 413.3 kg DM/ha; Shannon diversity 3.57 vs 2.11; maturity-indicator species dominate the closed area | One closed and one grazed area, no before data; more humid cedar and holm-oak forest rangeland; full state closure, not seasonal customary rest |
| 6 | **Central High Atlas mountain oases** (Ait Atta, Ait Merghad, Ait Hdidou families); SCI-104 | 128 semi-structured interviews (ethnography_or_survey) | Succession and labour problems, youth out-migration, recurrent drought, blocked transhumance routes, cropland expansion into rangeland, sedentarization | Livelihood context, not ecological outcomes; different tribes and oasis systems |
| 7 | **Ouled Dlim, Marrakech province**; SCI-109 | Atriplex plantations vs adjacent rangeland, SPOT 5 2004/2008/2012 with field biomass (control_impact with imagery) | Plantations averaged 2.21 to 3.61 Mg/ha more dry biomass than surrounding rangeland; early or over-grazing undermined several | Lowland arid plain; planting, not rest; useful as a design example of field-calibrated imagery evaluation |
| 8 | **Holistic Planned Grazing, global**; SCI-110 | Meta-analysis of studies 1972 to 2016 (review_or_meta_analysis) | No difference from continuous grazing in plant basal cover, plant biomass or animal gain; high heterogeneity; positive effects more often at higher precipitation | Global, mostly non-mountain; a caution against promising rotation benefits |
| 9 | **Livestock exclusion and biodiversity, global**; SCI-111 | Meta-analysis of 109 studies (review_or_meta_analysis) | Exclusion increased animal abundance and diversity, most for herbivores and pollinators; detritivores declined; effects depend on years since exclusion and climate | Global; exclusion differs from seasonal rest; biodiversity, not forage or livelihoods |
| 10 | **Ait Bouguemez and Midelt (local calibration study, not an analogue of management)**; SCI-106 | 180 destructively sampled plots with multispectral drone imagery (method study) | Best index explained 42% of biomass variance in cross-validation; detection threshold about 800 kg/ha from soil dilution; within-plot pixel variability raised R² to 0.74 where acquisition quality was controlled | Drone scale, engineering thesis, full text restricted; it constrains what Sentinel-2 can say rather than offering a management analogue |

Context, not management analogues: SCI-105 (valley livelihood change), SCI-107 and SCI-108 (remote-sensing limits in Moroccan rangelands and the High Atlas).

### 4.6 Pointers not verified (do not cite for findings)

- Domínguez and Benessaiah 2017 on the decline of the Mesioui agdals (SCI-97, metadata only).
- Briske et al. 2008 on rotational grazing experiments (SCI-112, metadata only).
- No inspected source on Imilchil or Ait Hdidou agdal ecology; SCI-104 covers Ait Hdidou livelihoods only. A further search for Imilchil pasture studies is open [U].
- Stewart-Oaten et al. 1986, Underwood 1992, Pickett 1989, Abadie et al. 2010 (SCI-88, SCI-89, SCI-91, SCI-85): metadata only, cited only as method pointers.

---

## 5. LLM agents for data science, and the execution decision

### 5.1 Evidence [V]

| Source | What it measures | Result |
|---|---|---|
| DSBench (SCI-117) | 466 analysis and 74 modelling tasks from real competitions | Best agent solved 34.12% of analysis tasks; 34.74% relative performance gap on modelling |
| ScienceAgentBench (SCI-118) | 102 tasks from 44 papers, outputs as self-contained Python programs | Best agent 32.4% (34.3% with expert knowledge; 42.2% with a reasoning model at more than 10 times the cost) |
| DiscoveryBench (SCI-120) | 264 real and 903 synthetic discovery tasks | Best system 25% |
| QRData (SCI-121) | 411 statistical and causal questions with data | Best model 58%; causal reasoning and combining causal knowledge with data are weak |
| StatQA (SCI-122) | 11,623 examples on applicability of statistical methods | Best model 64.83%; LLMs mainly make applicability errors |
| BLADE (SCI-119) | Open-ended analyses against expert alternatives | LMs often limited to basic analyses; data-interacting agents more diverse but non-optimal |
| Kosmos (SCI-116) | Long-running AI scientist; every statement cites code or literature | About 42,000 lines of executed code per run; independent scientists judged 79.4% of statements accurate |
| Data Interpreter (SCI-113) | Graph-structured agent with verified code nodes | InfiAgent-DABench accuracy raised from 75.9% to 94.9% |
| DS-Agent (SCI-114) | Case-based reasoning from expert solutions | 100% development-stage success with GPT-4 on its tasks |
| LIDA (SCI-115) | Visualization pipeline | Generates, executes and filters chart code |
| Many analysts (SCI-123, SCI-124) | Expert human teams, same data and question | Odds ratios 0.89 to 2.93 across 29 teams; in ecology, 174 teams produced widely varying effects, some crossing significance in the opposite direction to the average |

### 5.2 Reading [D]

- Structured, verified pipelines score well on structured benchmarks (Data Interpreter, DS-Agent); open-ended, realistic analysis is where agents fail, mostly through method applicability and shallow choices. Siterra's questions are open-ended and the data are small, gappy and confounded: the failure regime.
- Even the strongest long-running system leaves about one statement in five wrong; that is acceptable only with expert review, not in a live demo.
- Analytic flexibility is a problem for humans too; pre-specification is the known remedy (SCI-82 on finalizing before outcomes; the project's own outlet-freeze rule follows the same logic).
- **Not established [U]:** no inspected study compares, on the same tasks, LLM-written analysis code with LLM-composed declarative specifications. The recommendation for declarative recipes is a design judgment from the evidence above plus the project's existing architecture (no arbitrary code, numeric provenance, typed proposals).

### 5.3 Meta platform check [V] (dev.meta.ai, inspected 2026-10-26)

- Model API built-in capabilities listed: tool calling, tool search, search grounding, image and video understanding, image generation, speech to text, media segmentation (SAM), file handling, reasoning, structured output, prompt caching, token counting. **No hosted code-execution or code-interpreter tool is documented** ([overview](https://dev.meta.ai/docs/overview), [models](https://dev.meta.ai/docs/models)); the only related mention is that Muse Image can run code internally to build layouts before rendering.
- **Muse Code** ([docs](https://dev.meta.ai/docs/muse-code)) is "a coding agent from Meta for the terminal and CI": interactive `muse`, headless `muse exec`, `muse serve` with a JSON-schema session protocol and a TypeScript SDK (`@muse-code/sdk`); default model `muse-spark-1.2`. [Permissions](https://dev.meta.ai/docs/muse-code/permissions): approval modes `on-request` (default), `untrusted`, `never`; OS sandbox (Seatbelt on macOS, bubblewrap on Linux) confining writes to the workspace and a temp directory; network `proxy-only` by default; it refuses shell commands if the sandbox cannot be confirmed. It is a developer tool, not an application runtime.
- **SAM 3.1** (`sam-3.1`) via `POST /v1/responses`: noun-phrase, box or point prompts on images and video, returning boxes and masks as special-token text; one object type per request; image limits and pricing not stated on the page.

### 5.4 If model-written code is ever allowed (future extension) [D]

Only in an offline analyst mode, never in a live case command, and only when no catalog recipe answers the question: isolated container or VM with no network, read-only mounted inputs (bundle files by hash), CPU, memory and time limits, no secrets; code, lockfile, container image digest, input hashes and outputs saved as provenance; outputs enter the case as `provisional` evidence that a named scientific reviewer must accept; anything reused becomes a new versioned recipe implemented and tested by humans. Muse Code's sandbox is a reasonable development-time pattern but its `--yolo`, `--disable-sandbox` and `never` modes show that safety depends on configuration that Siterra would have to own.

---

## 6. Python tooling (PyPI JSON, checked 2026-10-26)

Two-week pinning rule from docs/12 applied.

| Package | Latest (upload date) | Licence | Maintenance signal | Use here | Pin advice |
|---|---|---|---|---|---|
| scipy | 1.18.1 (2026-08-21) | BSD (classifier) | Active | Exact Kendall test, Theil-Sen with interval (P1) | 1.18.1 |
| statsmodels | 0.15.0 (2026-08-27) | BSD-3-Clause | Active | STL (not as evidence), ETS and ARIMA for the P2 backtest | 0.15.0 |
| pymannkendall (SCI-62) | 1.4.3 (2023-01-14) | MIT | Slow (last repo push 2025-03-22, 9 open issues and pull requests); no slope interval; NaN skipped per season | Seasonal and corrected Kendall sensitivity (P2) | Pin and test against SciPy on fixtures |
| ruptures | 1.1.10 (2025-09-10) | BSD-2-Clause | Active; **requires Python below 3.14** | Candidate breaks alternative (P2) | 1.1.10 |
| bfast (Python, diku-dk) | 0.7 (2021-04-22) | GPL-3.0 | **Unmaintained**; implements BFAST Monitor only, OpenCL | None | Do not use |
| bfast (R, CRAN) | 1.7.2 (2026-04-01) | GPL (>= 2) | Active; includes BFAST Lite | Candidate breaks (P2), offline | Review GPL if the pipeline is distributed |
| scikit-learn | 1.9.1 (2026-09-10) | BSD-3-Clause | Active | k-means, silhouette, adjusted Rand index (P1) | 1.9.1 |
| xarray | 2026.9.0 (2026-09-29) | Apache-2.0 | Active | Raster time stacks | 2026.9.0 |
| rioxarray | 0.23.0 (2026-07-27) | Apache-2.0 | Active; Python 3.12+ | CRS-aware I/O | 0.23.0 |
| rasterio | 1.5.2 (2026-09-30) | BSD-3-Clause | Active; Python 3.12+ | Windowed COG reads | 1.5.2 |
| odc-stac | 0.5.3 (2026-07-30) | Apache-2.0 (LICENSE file) | Active | STAC to xarray loading | 0.5.3 |
| stackstac | 0.5.1 (2024-08-10) | MIT | **Stale** (last push 2024-08-10, 60 open issues and pull requests) | Alternative only | Prefer odc-stac |
| pystac-client | 0.9.1 (2026-10-20) | Apache-2.0 | Active | STAC search | **0.9.0** (0.9.1 is under two weeks old) |
| MAPIE | 1.6.0 (2026-10-19) | BSD-3-Clause | Active; `TimeSeriesRegressor` ("enbpi", "aci") | Backtest intervals (P2) | **1.5.0** (1.6.0 is under two weeks old) |
| timesat | 4.4.1 (2026-04-30) | Proprietary, research-only | Active | **Excluded** (licence) | None |
| lcmap-pyccd | 2021.7.19 | Public domain | Unmaintained | None (CCDC out) | None |
| segment-geospatial | 1.4.2 (2026-08-22) | MIT | "Pre-Alpha" classifier | Local SAM experiments only; product uses Meta-hosted SAM 3.1 | Optional |

Python version [D]: rasterio, rioxarray and scipy need 3.12 or later; ruptures needs below 3.14. Pin the science pipeline to **Python 3.12 or 3.13** in `uv`.

---

## 7. Recommendations

### (a) Role split [D]

| Activity | Muse Spark | Deterministic host and tools | Gate |
|---|---|---|---|
| Choose analyses | Picks recipes for the user's question from `list_recipes`, which returns applicability already computed from the bundle (record length, coverage, valid years); explains the choice | Computes applicability; recipes marked not applicable cannot be selected | Unknown or not-applicable recipe rejects the plan |
| Parameters | Chooses **scope** parameters (stratum, period subset, which prespecified window) from enumerations, committed in the plan before results are read | **Method** parameters fixed per recipe version; a fixed sensitivity set is always computed and shown together | Parameter outside enumeration rejects; post-hoc plan changes create a new revision labelled post hoc |
| Compute | Never | Offline Python for recipe outputs (precomputed derived bundles); live TypeScript only for alignment, counts and lookups | Numeric provenance (existing) |
| Interpret | Writes interpretation in the recipe's allowed vocabulary, links results to hypotheses, names what would change the conclusion | Inserts the recipe's standard limitation sentences verbatim | Per-recipe forbidden phrases (for example "significant decline", "degradation", "recovery", "caused by", "forecast"); claim-kind rules |
| Methods text | Narrative paraphrase (P1) | Template renders exact methods from registry and manifest (P0) | Every parameter and number must match the run record |
| Visualization | Chooses among the recipe's allowed components via `propose_layout` | Reducer renders from manifests | Layout rules R1 to R7 (existing) |
| Refusal | Explains why a forecast, biomass or causal claim cannot be made and proposes field or analysis requirements | Forecast eligibility gate (P2) | Prohibited-claims scan (existing, extended) |
| Literature methods | Reads method papers and analogue studies (PDF input), extracts design, period, outcomes, verbatim excerpts | Excerpt verification (existing) | Excerpt match |
| Analogue cards | Drafts similarity, difference and transfer-limit fields | Requires all fields, blocks numbers outside the card | Validator rules in 4.3 |

### (b) Recipe catalog [D]

**Decision: declarative catalog for the whole build; no model-written code in the product.** Sandboxed model-written code is justified only under section 5.4 conditions in a future extension.

Where it runs. docs/12 forbids a live Python service in P0. So: recipes are implemented in the offline `uv` pipeline and precomputed for every stratum and every allowed parameter value (the grids are small), stored as derived `DataBundle`s whose `methodId` is the recipe ID and whose manifest `method.parameters` holds the values. Staleness then propagates through existing provenance with no new record type. The live tool returns the precomputed result, labelled "precomputed analysis". Existing live tools (`summarize_observations`, `compare_series`) become recipes 2 and 3.

Typing rule. Descriptive transforms of measurements (counts, departures, flags against fixed thresholds, phenology descriptors) are `observation`. Anything with a fitted model, test statistic, learned partition or break search is `model_estimate` and must carry `uncertainty.kind` other than `not_quantified` unless the recipe declares why it cannot.

**Registry entry fields:** `recipeId`, `version`, `title`, `question`, `operation` (enum), `implementation` {language, package, version}, `inputs` (dataset roles), `parameters` [{name, role: scope|method|display, allowed values, default}], `sensitivitySet`, `applicability` checks with minimum data, `outputs` [{metric, unit, claimKind, uncertaintyKind}], `assumptions[]`, `failureModes[]`, `standardLimitations[]` (verbatim text), `allowedComponents[]`, `forbiddenPhrases[]`, `references` (SCI IDs), `priority`.

| Recipe | Question | Operation and implementation | Parameters (role) | Minimum data | Output, claim kind, uncertainty | Key assumptions | Failure modes | P |
|---|---|---|---|---|---|---|---|---|
| `coverage_summary@1` | How much usable data per month and stratum? | Valid pixel-month counts, valid fraction (pipeline) | stratum (scope) | Validated bundle | counts; observation; not_quantified | SCL classes are right | Snow and cloud confusion; aspect-biased shadow loss | P0 |
| `monthly_departure@1` | Was this month unusual relative to 2019 to 2025? | Pixel-first departure from same-month reference median, summarized over common-valid area (= `summarize_observations`) | stratum, months (scope); reference all-years and leave-one-year-out (both computed) | 4 valid reference years per pixel-month; 70% area | NDVI index units; observation; spatial_iqr | Short reference is not a normal | Drought years inside the reference | P0 |
| `aligned_antecedent@1` | Do vegetation and rainfall departures move together? | Aligned departures; same-sign counts for 0, 1, 2, 3 month windows reported together (= `compare_series`) | stratum (scope); window set fixed | Shared periods, same geometry revision | counts; observation; not_quantified | CHIRPS 0.05° represents catchment rain coarsely (31 cells) | Snow storage delays response; counts are not significance | P0 |
| `window_trend@1` | Did the window mean change monotonically over 7 years? | Theil-Sen slope with 95% interval (SciPy `theilslopes`), exact Kendall S (SciPy `kendalltau`, exact without ties), NDVI and CHIRPS in parallel | stratum (scope); window = reference peak plus or minus 1 month (method, fixed) | 6 of 7 years with window coverage of at least 70% | NDVI per year; model_estimate; interval 0.95 "Theil-Sen" | Monotonic change; independent years (untestable at n = 7) | Endpoint drought years; 2022 harmonization; snow timing; many strata (FDR) | P1 |
| `anomaly_flags@1` | Which months were unusually low or high? | Robust z vs leave-one-year-out same-month departures | stratum (scope); threshold {2.0, 2.5, 3.0} all computed (display) | 5 valid reference years for that month | flags; observation; not_quantified | Reference distribution meaningful with 7 years | MAD near zero; snow-affected months | P1 |
| `phenology_descriptors@1` | When and how strongly does each place green up? | Month of peak, peak, amplitude, window sum from the 12-month reference profile | none | 8 of 12 reference months valid | raster plus stratum summary; observation; "one-month resolution" | Composite month represents phenology | Missing snow months shift apparent peak | P1 |
| `phenology_strata@1` | Which areas should be sampled separately? | k-means on descriptors plus elevation and aspect; cropland masked (scikit-learn) | k from {4, 5, 6} by fixed silhouette rule (method) | Descriptors for 80% of analysis area | strata; model_estimate; stability (ARI) in method text | Strata are a sampling device, not vegetation types | Artefact clusters; fragmentation; inaccessibility | P1 |
| `lagged_rank_association@1` | How strongly do departures co-vary at each prespecified lag? | Spearman rho for lags 0 to 3 together, moving-block bootstrap (12-month blocks) 90% intervals | stratum (scope) | 36 aligned valid months | rho; model_estimate; interval 0.90 | Departures remove shared seasonality | Autocorrelation; never select a "best" lag; not attribution | P1 |
| `dry_year_scenario@1` | What did a dry season look like here? | Lowest-tercile wet-season CHIRPS rule vs 1991 to 2020; returns those years' NDVI departures | wet-season definition fixed (method) | At least one qualifying year | scenario; not_quantified | Past dry years resemble future ones | Too few analogue years; snow differences | P1 |
| `candidate_break@1` | Is there a candidate structural change worth inspecting? | BFAST Lite (R `bfast` 1.7.2) or ruptures PELT on stratum departures | min segment 24 months, max 1 break (method) | 60 valid months | break month with interval; model_estimate "candidate break for inspection" | One shift dominates | Drought years; harmonization step | P2 |
| `seasonal_kendall@1` | Same as trend, using all seasons | pymannkendall `seasonal_test` and `correlated_seasonal_test`, seasonal Sen slope | seasons with at least 5 valid years | 5 seasons qualifying | slope and both p values; model_estimate | Hirsch-Slack robustness (SCI-48) | Short record, persistence | P2 |
| `forecast_eligibility@1` | Can anything beat climatology and persistence here? | Section 2.4 backtest (statsmodels, MAPIE 1.5.0) | pre-registered set | 24 training months plus test months | eligibility record with scores; model_estimate | Stationarity within record | Leakage; preliminary vs final rainfall | P2 |
| `field_mask_sam@1` | Where are irrigated fields and orchards? | SAM 3.1 via Model API; validation sample | prompt list fixed | Composite imagery | mask; model_estimate; user's and producer's accuracy | Visible boundaries at 10 m | Small terraces; orchards vs scrub | P2 |
| `comparison_matching@1` | Which areas could serve as comparison strata in a field design? | CEM or Mahalanobis matching on terrain and reference phenology | covariate set fixed | Strata and terrain | candidate comparison strata; supports field_requirement | Observed covariates suffice (they do not) | Management, access, spillover | P2 |

Example registry entry (design values, not data):

```yaml
recipeId: window_trend
version: 1
question: Did the stratum's peak-window NDVI change monotonically over 2019 to 2025?
operation: short_record_monotonic_trend
implementation: {language: python, package: scipy, version: "1.18.1"}
inputs: [ndvi_monthly_bundle, chirps_monthly_bundle, strata_bundle]
parameters:
  - {name: stratumId, role: scope, allowed: from_strata_bundle}
  - {name: window, role: method, allowed: [reference_peak_plus_minus_1_month], default: reference_peak_plus_minus_1_month}
sensitivitySet: [{rainfall: same_window_same_years}]
applicability:
  - {check: years_with_window_coverage_ge_0_70, minimum: 6, of: 7}
outputs:
  - {metric: ndvi_window_theil_sen_slope, unit: ndvi_per_year, claimKind: model_estimate, uncertaintyKind: interval, level: 0.95}
  - {metric: ndvi_window_kendall_s, unit: count, claimKind: model_estimate, uncertaintyKind: not_quantified}
assumptions: [monotonic change, year values comparable across the harmonization step]
failureModes: [drought endpoints, harmonization step, snow timing, many-strata testing]
standardLimitations:
  - "Seven yearly values; year-to-year rainfall variation can dominate a record this short."
  - "This is not a degradation or recovery trend and does not identify a cause."
allowedComponents: [annual_dot_trend_with_interval, aligned_rainfall_panel]
forbiddenPhrases: [significant, degradation, recovery, decline caused, forecast]
references: [SCI-49, SCI-50, SCI-51, SCI-29]
priority: P1
```

### (c) Forecasting policy [D]

1. **P0 and P1:** Siterra forecasts nothing: no vegetation, rainfall, biomass, carrying capacity, livestock numbers, degradation or recovery dates, intervention outcomes or household effects. Requests receive a refusal that states what would be needed (record length, field calibration, backtest) and creates an analysis or field requirement.
2. **Allowed instead:** observations, departures, aligned comparisons, short-record descriptive trends, and the labelled dry-year `scenario`.
3. **P2 only:** the `forecast_eligibility@1` backtest. An outlook may be displayed only if all section 2.3 conditions pass, labelled per section 2.5, stratum or catchment scale, 1 to 3 months.
4. **Never:** forecasts at pixel scale, for biomass or carrying capacity, beyond the validated horizon, or presented on the observed timeline. Third-party seasonal forecasts only as attributed published context.
5. **Scanner:** extend the prohibited-claims scan to "forecast", "projected", "outlook" (outside an eligible outlook record), "significant trend", and future-tense predictions about vegetation, rainfall, biomass or recovery (for example "NDVI will", "expected to recover"). Future tense about planned work ("samples would be collected") stays allowed.

### (d) Analogue-sites feature [D]

Build it in two steps: P0 adds 3 or 4 verified analogue sources (suggested: SCI-93 or SCI-94, SCI-96, SCI-103, SCI-102) to the case corpus so `source_research` produces `scientific_context` evidence with "Analogy:" scope notes and transfer limits, with no schema change. P1 adds the `AnalogueAssessment` record and a "Comparable places" component following 4.3 and 4.4. Candidate list: section 4.5.

### (e) P0, P1, P2 for the 9-day build [D]

Effort is a judgment in focused lane-days, in the style of docs/17; not measured.

| Item | Lane | Effort | P | Notes |
|---|---|---|---|---|
| Recipe registry v1 for the three existing operations (coverage, departure, aligned antecedent) with assumptions, minimum data, failure modes, standard limitations; method card in the inspector rendered from registry plus manifest | L2, L3, L4 | 0.75 | **P0** | No contract change: recipe ID in `methodId` |
| `list_recipes` read tool returning computed applicability; not-applicable recipes appear as blocked with reason | L2 | 0.25 | **P0** | Turns limits into visible states |
| Refusal path for forecast, biomass and causal requests, plus 12 to 15 evaluation prompts graded deterministically (expected recipe, refusal or requirement) | L2, L5 | 0.5 | **P0** | Measures Muse's planning accuracy before the demo |
| Analogue sources in the corpus with transfer limits | L3 | 0.25 | **P0** | Reuses source research and excerpt verification |
| `window_trend@1`, `anomaly_flags@1`, `lagged_rank_association@1` precomputed per stratum | L3, L2 | 0.75 | P1 | After all P0 tests pass |
| `phenology_descriptors@1` and `phenology_strata@1` feeding the field plan | L3 | 0.75 | P1 | Field plan already uses elevation and aspect strata |
| `dry_year_scenario@1` | L3, L2 | 0.5 | P1 | Strong honest answer to "what if it is dry?" |
| `AnalogueAssessment` and "Comparable places" component; claim rule blocking analogue-only hypothesis status | L1, L4 | 0.75 | P1 | |
| Muse methods narrative with parameter validation | L2 | 0.25 | P1 | |
| Candidate breaks, seasonal Kendall sensitivity | L3 | 1 | P2 | |
| Forecast eligibility backtest | L3 | 1.5 | P2 | Expected to return "not eligible" |
| SAM 3.1 field and orchard mask with validation sample | L3, L2 | 1.5 | P2 | Same as docs/17 estimate |
| Comparison-area matching for a BACI field design | L3 | 0.75 | P2 | |
| Sandboxed model-written code (offline analyst mode) | n/a | n/a | Out of build | Section 5.4 |
| TIMESAT, LandTrendr, CCDC, STL as evidence, pixel significance maps, any NDVI forecast in P0/P1 | n/a | n/a | Out | Reasons in section 1.2 |

P0 additions total about 1.75 lane-days spread over L2, L3, L4 and L5, inside days 2 to 6. If day 3 (GATE-03) slips, keep only the registry entries and the refusal path.

---

## 8. What would change the current scientific limits

1. Local drone calibration (SCI-106) [V]. Hardens the limit: at 180 plots including Ait Bouguemez, the best index explained 42% of biomass variance and bare soil hid biomass below about 800 kg/ha. Keep "no biomass or carrying capacity from NDVI". It also shows that a field biomass dataset for the valley exists; a calibrated biomass `model_estimate` would require access to those data (none requested; no outreach implied), drone-to-Sentinel-2 upscaling and independent validation. Not in this build.
2. Valley livelihood change (SCI-105) [V]. Apple growing and tourism are reported alongside smaller, more sedentary herds. Supports naming orchards and irrigated fields explicitly in the land-use hypothesis, and raising the priority of checking valley-floor masks during the P1 imagery review [D]. Whether orchards expanded during 2019 to 2025, and whether WorldCover 2021 captures them, are [H].
3. Short-record seasonal tests (SCI-48) [V]. Seven years sits near the record length where the corrected seasonal Kendall test stops being reliable. Keep "no significance claims"; extend the prohibited list with "significant trend".
4. TIMESAT licence (SCI-59) [V]. Excludes TIMESAT; phenology must use transparent in-house descriptors.
5. Forecast evidence (SCI-63 to SCI-69) [V]. Nothing found supports forecasting with this record. Keep the "no forecasts" decision (ADR-0039); the P2 backtest can only confirm it or, unexpectedly, open a narrow, labelled outlook.
6. SER reference models (SCI-87) [V]. Grazing can be part of the reference condition of cultural mountain pastures. Reinforces the existing framing that grazing is not a diagnosis.
7. Neighbouring-valley comparison (SCI-102) [V]. Adjacent valleys differ through several co-varying factors; never present a neighbouring valley as a control.
8. **Remote-sensing limits elsewhere in Morocco (SCI-107, SCI-108) [V].** Production could not be estimated with a global model in the Oriental steppe; High Atlas bare-land share changed by 10% with classification method. Supports multi-method sensitivity labels.

None of these loosens a limit. Two (items 1 and 5) describe the only routes by which a future build could earn a calibrated estimate or an experimental outlook.

---

## 9. Proposed repository edits (for owning lanes; not applied)

- `docs/explanation/scientific-basis.md`: add an "Analogues and reference sites" subsection (rules 4.3); add SCI-105 and SCI-106 to the verified context and the land-use hypothesis row; add "significant trend", "forecast" and "outlook" to prohibited claims.
- `docs/reference/data-sources-and-methods.md`: add the recipe catalog (P0 rows), the typing rule (observation vs model_estimate), the window-fixing rule and the rainfall-in-parallel rule; Python 3.12 or 3.13 for the pipeline.
- `docs/reference/agent-orchestration.md`: add `list_recipes` (read) and `read_recipe_result` (read precomputed); state that Muse Code and any code execution remain outside the runtime.
- `docs/reference/data-contracts.md`: claim rules for `model_estimate` (must reference a measurement from a registered recipe bundle; uncertainty required or declared impossible) and for analogy evidence (cannot set hypothesis status alone; no numeric transfer); P1 `AnalogueAssessment`.
- `docs/architecture/10-quality-requirements.md`: add the P0, P1 and P2 rows from section 7(e).
- `research/science/source-register.md`: append SCI-45 to SCI-124 from [new-sources.md](source-register.md).

---

## 10. Verification log

- **Registries and APIs used:** Crossref works API (metadata and abstracts), OpenAlex (abstracts, search), HAL API (hal-03747648, ird-00384686, dumas-05630816), Europe PMC REST (SCI-124), mEDRA via doi.org RA lookup (SCI-96), Agritrop Dublin Core export (SCI-106), arXiv abstract pages, PyPI JSON (`https://pypi.org/pypi/<name>/json`), GitHub REST API (repository activity), CRAN package page, rdrr.io help pages.
- **Full texts read (text extracted locally from public PDFs, outside the repository):** Barrett et al. arXiv preprint (SCI-63), GreenEarthNet (SCI-66), SER standards full text and summary from USDA Treesearch (SCI-87), Akasbi thesis (SCI-93).
- **Documentation pages read:** SciPy `theilslopes` and `kendalltau` (v1.18.0 manual), statsmodels `STL` (0.15.0) and its source, pyMannKendall README and source, MAPIE API reference, BFAST docs (Python 0.7 and R 1.7.2), Earth Engine CCDC reference, LT-GEE requirements, TIMESAT FAQ and PyPI licence text, Forecasting: Principles and Practice (time series cross-validation section, chapter 5), Brus online chapter on stratified sampling, Meta docs (overview, models, Muse Code, Muse Code permissions, media segmentation).
- **Blocked and not bypassed:** ScienceDirect, Wiley Online Library, OpenBU, University of Arizona repository (HTTP 403); UAB repository (bot protection); Springer article page (sign-in redirect); Agritrop HTML (HTTP 418; the Dublin Core export worked); DUMAS PDF (returned HTML); arXiv and Semantic Scholar APIs (rate limited).
- **Not verified:** C3S or NMME skill for the Central High Atlas; drainage of the case catchment into the Oum Er Rbia basin; findings of SCI-45, SCI-57, SCI-58, SCI-59 (paper), SCI-60, SCI-61, SCI-71, SCI-85, SCI-88, SCI-89, SCI-91, SCI-95, SCI-97, SCI-112 beyond metadata; ecology of Imilchil agdals; whether WorldCover 2021 captures recent orchards.
- **No installs, no sign-ins, no repository edits, no commits.**

---

## 11. Addendum (2026-10-28): Long-record greening vs. forage quality, June to September window, field-check pairs, and `merge@2`

### 11.1 June to September summer grazing window in the literature [V]

The long-record recipes (`pixel_trend_long_record` and `season_trend_long_record`) evaluate four growing windows: `mar_jun` (primary spring green-up), `mar_may` (spring), `apr_jul`, and `jun_sep` (June to September). Corpus inspection of `SCI-01`, `SCI-03`, `SCI-19` and `SCI-96` establishes how June to September maps onto pastoral practice:
- **Spring closure versus summer opening [V]:** In High Atlas pastoral agdals (such as the Yagour of the Aït Ikiss, `SCI-96`), communal rules impose a roughly three-month herding ban mainly in spring to allow vegetation regrowth before opening to equal household access in summer. In Aït Bouguemez, upper slopes and high plateaus (> 2700 m) hold inter-village pastoral agdals (Aguerd Zougarne, shared by 10 villages) and inter-tribal summer pastures (Tamda, shared with Aït Atta and Aït Mohamed; Izoughar, shared with southern Aït Atta tribes) (`SCI-19`, pp. 2 to 5, Table 1; `SCI-01`).
- **Seasonal herd movements in Aït Bouguemez [V]:** Flocks practicing systematic transhumance (`S2`) leave Aït Bouguemez in September or October for winter areas and return in April to use high-altitude communal pastures (Izoughar, Igourdane) through summer (`SCI-03`, pp. 5 to 6, 12). Village forest agdals (20 to 200 ha per village) follow a different calendar, remaining closed through spring and summer and opening in October/November to March/April or only during heavy snowfalls for leaf fodder (`SCI-19`, p. 7, Table 2; `SCI-03`, pp. 6 to 7).
- **Implication for the `jun_sep` window [D, V]:** June to September spans the transition from late-spring pastoral agdal closure (June) into open summer high-pasture grazing (July to September) before autumn departure. Because village and inter-tribal assemblies adjust exact opening dates each year according to snow and forage conditions (`SCI-19`, pp. 3, 9; `SCI-03`, p. 12), no fixed calendar date separates closure from grazing across all years.

### 11.2 Why satellite NDVI trends upward while pastoral forage quality stagnates or declines [V]

Across 2000 to 2025 (`bundle_pixel_trend_long_record_ait_bouguemez` and `bundle_season_trend_long_record_ait_bouguemez`), catchment-wide MODIS NDVI increases in both March to June (+0.0091 NDVI per decade OLS, +0.0094 Theil-Sen; 24.7% of catchment area upward at BH-FDR \(q = 0.05\) vs. 0.09% downward) and June to September (+0.0090 NDVI per decade OLS, +0.0095 Theil-Sen; 22.9% upward at BH-FDR vs. 0.21% downward). Three verified mechanisms explain why satellite greening coexists with reported pastoral forage decline:
1. **Unpalatable xerophytes and species replacement [V]:** Upper rangelands in Aït Bouguemez are dominated by spiny xerophytic vegetation with only reduced areas of short grasslands (*Almu*) (`SCI-19`, p. 2). In Azilal province and Aït Bouguemez, herders report the disappearance of palatable forage species (*Astragalus armatus*, *Thymus satureioides*) and the spread of unpalatable species (*Thymelaea virgata*, *Euphorbia nicaeensis*) (`SCI-03`, pp. 7 to 8). High Atlas spiny cushion xerophytes (*Bupleurum spinosum*, *Alyssum spinosum*, *Erinacea anthyllis*, *Cytisus balansae*) maintain green photosynthetic canopy in summer while reducing accessible forage [H for species-specific cover trends in this valley; requires field transect measurement]. In addition, destructive drone calibration over 180 plots in Midelt and Aït Bouguemez (`SCI-106`) showed that the best vegetation index explained only 42% of herbaceous biomass variance and failed to detect biomass below about 800 kg/ha due to bare-soil dilution.
2. **Expansion of irrigated apple orchards and valley-floor fodder crops [V]:** About 80% of cultivated valley-floor land (1800 to 2200 m) is irrigated by river diversion channels (*seguia*), and apple and walnut orchards promoted since the mid-1990s occupy around 10% of total agricultural area, often underplanted with irrigated alfalfa (`SCI-03`, pp. 5, 7, 9 to 10; `SCI-19`, pp. 2, 9; `SCI-105`). In `season_trend_long_record`, the steepest summer (June to September) NDVI trends are on level ground (+0.0317 per decade), WorldCover cropland/built-up (+0.0494 per decade) and WorldCover tree cover (+0.0268 per decade), whereas upper elevation bands (`elevation_mid` +0.0050, `elevation_high` +0.0038 per decade) have 95% intervals that include zero in summer.
3. **Terra MODIS orbital drift after February 2020 [V]:** Terra's mean local equator crossing time drifted from 10:30 in February 2020 to about 9:06 by December 2025 (`SCI-159`), altering solar zenith angles and shadow fractions on steep mountain slopes in the final six seasons of the record.

### 11.3 Evaluation of the 5 field-check pairs and `merge@2` (`minPeriodsForNecessarySign = 3`)

1. **Field-check pairs (`packages/domain/src/cases/case_aitbouguemez.json`) [D, V]:**
   - `exclosure_pair_cover` / `herd_records`: Participatory herd calendars and stocking records (`herd_records` / `herd_calendar_participatory`) verify whether grazing pressure and timing changed (`SCI-03`, `SCI-19`), separating `grazing` from `land_use` and `data_artefact`. However, separating `grazing` from `rainfall` requires paired browsed versus unbrowsed exclosures (`exclosure_pair_cover`) within the same elevation and aspect stratum so that rainfall and temperature are held constant (`SCI-90`, `SCI-93`).
   - `species_palatability_transect` and `orchard_boundary_ground_truth` / `orchard_history`: Ground-truthing orchard and irrigation expansion (`orchard_boundary_ground_truth`) separates valley-floor crop conversion (`land_use`) from pasture trends, correcting for the static 2021 WorldCover mask (`SCI-13`, `SCI-105`). Botanical transects (`species_palatability_transect`) measuring palatable herbs (*Astragalus armatus*, *Thymus satureioides*) against unpalatable plants (*Thymelaea virgata*, *Euphorbia nicaeensis*, spiny cushion xerophytes) are required to test whether greening pixels reflect forage recovery or unpalatable shrub dominance (`SCI-03`, pp. 7 to 8).
   - `snowmelt_timing_loggers` / `local_rain_records` and `seasonal_calendar`: Elevation-banded temperature/snowmelt loggers and local rain gauges separate snow-persistence and melt-timing shifts (`snow_terrain`) from wet-season precipitation (`rainfall`) and grazing (`SCI-26`, `SCI-27`), while recording village-assembly agdal opening dates (`seasonal_calendar`) separates phenological shifts from early herd entry (`SCI-19`, Table 2).
   - `scene_inspection`: Manual inspection of Sentinel-2 L2A scenes, SCL masks and the January 2022 processing baseline (`SCI-07`) separates `data_artefact` from all four biophysical explanations.
2. **Minimum 3-period rule (`DEFAULT_MIN_SIGN_PERIODS = 3` in `merge@2`) [D, A]:**
   - In `packages/domain/src/branches.ts`, `merge@2` requires at least 3 evaluated periods (`minPeriodsForNecessarySign = 3`) before an unmet necessary `departure_sign` prediction can mark a branch `contradicted`; 1- or 2-period failures return `cannot_be_assessed` (`inadequate_data`).
   - This is a sound heuristic floor `[D]` against single-month satellite noise: monthly Sentinel-2 composites accept pixel-months with as few as 3 clear dates, and residual cloud edges, snow fringes or a single unseasonal storm can flip one or two monthly departure signs against a 7-year median (`SCI-07`, `SCI-26`, `SCI-48`). Under an independent symmetric null (\(p = 0.5\)), \(k = 1\) has a 50% false-contradiction rate and \(k = 2\) has 25%, whereas \(k = 3\) lowers it to \(12.5\%\) and spans a full 3-month seasonal quarter. Because monthly NDVI departures are serially correlated (`SCI-46`, `SCI-48`), `minPeriodsForNecessarySign = 3` is a deterministic decision rule `[D]`, not a formal statistical significance test.
