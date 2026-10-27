# Scientific basis and limits

No imagery, rainfall observations, vegetation trends, field sites or intervention outcomes have been processed or validated by Siterra during planning. Sources are indexed in [science bibliography](../../research/science/source-register.md).

## Decision and scope

Proceed with a **pasture assessment and field-validation investigation**, with Aït Bouguemez in Morocco's Central High Atlas as the named geographic context. Do not launch a case titled “overgrazing detected.” The useful deliverable is a sourced comparison of possible explanations, followed by a reviewable monitoring and feasibility package. Satellite work is an observation layer within that investigation.

**Verified context:** published field research establishes communal resource governance and pastoral livelihoods in this area. It does not establish today's condition of a newly selected slope. Romagny, Auclair and Elgueroua describe customary resource institutions and changing institutional relationships in Aït Bouguemez [SCI-01](https://horizon.documentation.ird.fr/exl-doc/pleins_textes/2021-05/010043415.pdf). Agdal is an institution governing access and use; it should not be reduced to an AI-prescribed fence or a universal closure calendar.

A regional study based on interviews with 50 farmers across three Azilal municipalities links changes in pastoral systems to climate, resource availability and mobility. It describes different trajectories at different elevations. This is historical, interview-based regional evidence, not a stocking-rate measurement for the demonstration area [SCI-02](https://doi.org/10.1071/RJ21039).

A 2026 review synthesizes climate and socioeconomic pressures and identifies herd mobility, collective action and crop-livestock integration as relevant adaptation themes. It is a review, with underlying studies of varying scope; its numerical examples must not become current local household estimates [SCI-03](https://doi.org/10.1186/s42055-026-00126-4).

The valley lies in the rural commune of Tabant (Province of Azilal), runs about 40 km east to west with a floor at 1800 to 2200 m below ranges above 3000 m, and holds more than thirty villages; village forest agdals cover roughly 20 to 200 ha each with opening dates set by village assemblies [SCI-19](https://doi.org/10.5751/ES-04429-160424). The 2024 census gives the commune a legal population of 16,401 in 2,910 households; this describes the whole commune, not herding households or the catchment [SCI-35](https://www.hcp.ma/Population-legale-du-Royaume-du-Maroc-repartie-par-regions-provinces-et-prefectures-et-communes-selon-les-resultats-du_a3974.html). Remote-sensing history exists for the valley's **forests**, not its pastures: aerial photographs from 1964 compared with 2002 SPOT imagery, field-validated, show canopy maintained or improved under agdal control and degradation outside it [SCI-20, SCI-21](../../research/science/source-register.md). Treat this as evidence that customary institutions can matter, not as a pasture result. High-pasture agdal studies elsewhere in the High Atlas stress religious, economic and social dimensions alongside ecology [SCI-23, SCI-24](../../research/science/source-register.md); the multi-chapter Agdal volume is a pointer only [SCI-22](../../research/science/source-register.md).

A 2026 participatory field study in three Aït Bouguemez villages documents women's landscape knowledge and vegetation surveys. It supports including people whose knowledge a herder-only consultation would miss. Published village coordinates provide a geographic locator, not pasture boundaries. Confidential discussion transcripts are explicitly unavailable [SCI-04](https://doi.org/10.1002/pan3.70379).

## Evidence language required in the product

| Label | Meaning | Example acceptable before processing |
| --- | --- | --- |
| Observation | Actual measured value, acquisition window, geometry, unit, valid coverage and method | “No observation available yet.” |
| Published context | A finding from another study, with place, date and method | “Regional interviews described changing herd mobility.” |
| Hypothesis | A candidate explanation requiring discriminating evidence | “Rainfall variation could contribute to observed greenness variation.” |
| Model estimate | A named quantitative model, inputs, validation and uncertainty | Not available for biomass or carrying capacity in this MVP. |
| Scenario | Conditional management option; assumptions visible | “A negotiated rest period would require agreed access rules.” |
| Required validation | Evidence needed before a decision | Field vegetation surveys and locally verified management records. |
| Verified outcome | Documented post-action result against a defined baseline | Unavailable; never manufacture an outcome for the demonstration. |

NDVI uses red and near-infrared reflectance as a greenness proxy. Climate, topography, soils and management can affect this signal; spatial association alone does not identify a cause. USGS explains these interpretation limits in a different regional context; it is methodological context, not Atlas evidence [SCI-05](https://www.usgs.gov/centers/eros/science/land-productivity). UNCCD combines land cover, productivity and soil carbon in land-degradation reporting; a short Sentinel series is not an official SDG 15.3.1 assessment [SCI-06](https://www.unccd.int/resources/manuals-and-guides/good-practice-guidance-sdg-indicator-1531-proportion-land-degraded).

## Competing explanations and useful next work

| Hypothesis | What remote data can contribute | What is still required |
| --- | --- | --- |
| Rainfall variability | Same-month vegetation and regional rainfall anomalies; prespecified rainfall lags. National context: drought in spring 2019 and 2020, recovery in 2021, a well-below-average 2022 season (FAO GIEWS, SCI-25; national, not local) | Local precipitation records, snow timing, temperature and field interpretation; a climate-corrected productivity analysis over a longer record |
| Grazing-related pressure | Spatial patterns and persistent changes worth checking | Animal numbers by species, residence time, access routes, pasture area, seasonal movements and management history |
| Phenology, snow or terrain | Observation dates, snow masks, elevation/aspect strata and image inspection. Atlas snow cover varies strongly between years and its melt feeds rivers and recharge (SCI-26, SCI-27); Sentinel-2 snow observations are usable in High Atlas terrain (SCI-28) | Local seasonal calendar, shadow/snow quality checks |
| Land-use or composition change | Context land-cover strata and visible imagery; a 2026 valley study reports apple growing and tourism alongside smaller, more sedentary herds, which makes valley-floor orchards a likely confounder for greening (SCI-105) | Crop, orchard and irrigation history; whether orchards expanded during 2019 to 2025 and whether the 2021 land-cover mask captures them; botanical composition (greening can include unpalatable plants) |
| Observation artefact | Clear-observation counts, coverage, source scenes and mask sensitivity | Independent manual inspection and repeat processing |

These hypotheses can coexist. Do not force a binary drought-versus-grazing answer. Rainfall-adjusted residuals also contain omitted variables; they are not a “grazing impact” estimate. In simulation, 30 to 40% degradation was needed before vegetation-index trends became detectable under rainfall-driven variability, and residual-trend methods broke down under some conditions [SCI-29](../../research/science/source-register.md); rain-use efficiency can stay correlated with rainfall and fail to normalize it [SCI-31](../../research/science/source-register.md). Segmented residual-trend methods exist [SCI-30](../../research/science/source-register.md). In sparse cover, soil background affects NDVI; MSAVI may be computed as an optional sensitivity check only, never as a second headline index [SCI-32, SCI-33](../../research/science/source-register.md).

Standardized climate-corrected productivity methods already exist [D]: Trends.Earth implements RESTREND, rain-use efficiency and water-use efficiency corrections with CHIRPS inputs for SDG 15.3.1 reporting, and its documentation says productivity declines may reflect rainfall ([SCI-34](../../research/science/source-register.md), [MKT-09](../../research/competitive/source-register.md)). Siterra's P0 comparison is deliberately descriptive (aligned monthly departures on shared periods, prespecified 0 to 3 month antecedent windows, counts of same-sign months) and claims nothing beyond that. The hypothesis ledger lists "climate-corrected productivity trend over a longer record" as missing evidence for the rainfall hypothesis, and the field package may recommend running it; implementing it is P2. A remote-sensing reviewer should expect exactly this framing.

Hypothesis status words in data and UI: not yet tested, consistent with available evidence, contradicted by available evidence, cannot be assessed with current data, needs reassessment ([Data contracts](../reference/data-contracts.md#hypothesis-status)). Several hypotheses can be consistent at once; none is ranked by a score.

## Comparable places

Other places where similar institutions or interventions were studied appear as published context by analogy, with transfer limits, and never as evidence about this valley or as controls. Rules and verified candidates: [comparable places](comparable-places.md).

## Analysis and forecasting

The model chooses and interprets deterministic analysis recipes and never computes; Siterra forecasts nothing until a pre-registered backtest shows skill ([analysis recipes](../reference/analysis-recipes.md)).

## Interventions: compare conditions, not invented benefits

The P0 comparison contains three options: (1) participatory monitoring before changing access, (2) community-negotiated seasonal rest/access adjustments where governance and forage needs support them, and (3) mobility/feed-contingency feasibility work where access, cost and distributional effects can be established. These are **design choices informed by context**, not locally endorsed prescriptions or a ranked treatment recommendation.

For each, show ecological rationale, household exposure, authority, evidence gap, reversibility and conditions that would rule it out. National livestock totals exist (2025 count, SCI-44) but no provincial or commune figures were found; never downscale national numbers to the valley. Include who loses access, seasonal feed alternatives, cash and labor burdens, water access and displacement of grazing elsewhere. No unverified currency estimates, household counts, jobs, recovery dates or percentage improvements.

A field package should request locally agreed management units; representative vegetation transects or quadrats covering elevation, aspect and management contrasts; species/palatability and bare-ground observations; repeat fixed photographs with consent; documented livestock-use calendars; and livelihood interviews designed with community representatives. A qualified local team must choose sampling intensity, consent process, languages, governance representation and season. Do not publish household identities, sensitive access disputes or precise sensitive sites by default.

## Claims prohibited in the demo

- “Overgrazing detected,” “pasture degraded by livestock,” or causal attribution from an NDVI decline alone.
- Biomass, livestock carrying capacity, animal units per hectare or biodiversity measured from uncalibrated NDVI. A 2026 drone calibration study with 180 destructively sampled plots in Aït Bouguemez and Midelt found the best index explained 42% of biomass variance and bare soil hid biomass below about 800 kg per hectare (SCI-106).
- "Significant trend" or any significance claim from a seven-year record (SCI-48), and any forecast, projection or outlook ([forecasting policy](../reference/analysis-recipes.md#forecasting-policy)).
- A 5 km rainfall product represented as 10 m rainfall or a pasture-specific weather station.
- “Agdal works everywhere,” locally approved closure dates, or verified rights/consent inferred from literature.
- Restoration success, measured community benefit, real partnerships, or calibrated forecasts that do not exist.
- Statistical confidence manufactured by treating correlated pixels or repeated monthly values as independent samples.

## Release gate

A public finding requires a reproducible input manifest, a verified analysis geometry and status, matching chart/map periods, quality coverage, a human-reviewed interpretation and citations. The P0 analysis extent is the valley catchment (a hydrological unit, [Data sources and reproducible methods](../reference/data-sources-and-methods.md#study-area)); it is never presented as a pasture or management boundary, and the field package asks for locally agreed management units. That is an honest completed investigation task; it is not a pasture diagnosis. See [study-area status](../../research/geospatial/study-area.md) and [methods](../reference/data-sources-and-methods.md).
