# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Contracts and design tokens carry their own Semantic Versioning numbers, recorded in the entries below; release headings carry ISO 8601 dates.

## [Unreleased]

### Added

- Case contracts 1.2.0 in `schemas/case.schema.json` (JSON Schema 2020-12): one root schema that validates case snapshots, commands, events and atomic commit proposals, with examples in `schemas/examples/`. Introduced across 1.1.0 and 1.2.0: geometry roles, cautious hypothesis statuses, typed trace payloads, evidence-linked brief items, typed uncertainty, typed proposal tools and fixed sections. Introduced in 1.2.0: revision-pinned relationships and component bindings, and catalog and focus validation codes.
- Siterra STAC extension 1.0.0 and the observation bundle profile in `schemas/stac/siterra-extension.schema.json` (`https://siterra.invalid/schemas/stac/siterra/1.0.0/schema.json`): STAC 1.1.0 Collections per bundle and Items per period with the raster 2.0.0, processing 1.3.0, file 2.1.0, projection 2.1.0, eo 2.0.0, version 1.2.0 and render 2.1.0 extensions; synthetic examples `stac-collection-ndvi.json` and `stac-item-ndvi-2022-04.json`.
- HTTP API and event stream description 1.0.0 in `schemas/openapi.json` (OpenAPI 3.2.0).
- CSL-JSON bibliographies (CSL schema 1.0.2) in `research/bibliography/`, and `schemas/README.md`.
- Design tokens in the DTCG 2025.10 format in `design/tokens/siterra.tokens.json`: base scales plus computed dark and light color themes (12-step OKLCH scales, roles, data palettes and map colors), the generated stylesheet `design/tokens/siterra.css` and the contrast report `design/tokens/contrast-report.json`.
- The problem statement with cited facts, comparable places, scenes and views, analysis recipes, the evaluation harness, voice and tone with a copy lint, and the microcopy set under `docs/`; decision records ADR-0033 to ADR-0044 (autonomous firm stance, translation, scenes, recipes, comparable places, evaluation, forecasting, floating islands, the Meta model map, the color system, voice, and the component base).
- Acceptance criteria for scenes (SC), analysis (AN), evaluation (EV), language (I18N), the visual budget and copy lint (VC-04 to VC-06), model badges and usage (TR-05, TR-06), and accessibility release checks A11Y-01 to A11Y-12.
- Architecture description in the arc42 9.1 sections under `docs/architecture/`, with C4 System Context and Container diagrams.
- Decision records in MADR 4.0.0 format under `docs/decisions/`, with a decision log and the unmodified MADR template.
- `CONTRIBUTING.md` with placement, naming, identifier, documentation and commit rules; the publication gate as a how-to guide in `docs/how-to/`; the research index in `research/README.md`; `.editorconfig`.
- Decision record [ADR-0045](docs/decisions/0045-extend-the-meta-model-map-to-event-records-figures-and-whole-corpus-reading.md) (proposed): four further checked Meta model jobs (a cited drought event record, a published figure placed on the valley, a whole-corpus comparison and a Segment Anything snow experiment), with acceptance criteria EV-06 to EV-08.
- Validated CHIRPS v3.0 monthly rainfall bundle for the frozen valley catchment in `data/bundles/` (84 monthly Items, 2019 to 2025, on 33 native 0.05 degree cells; SV-01 reproduction passed), with its STAC catalog and the Copernicus and CHIRPS notices.
- Analysis recipe `season_summary` 1.0.0 with its near-normal band (terciles of the 30 wet seasons starting 1991 to 2020), registered before any event comparison ran and before any vegetation data was read; `compare_events` uses it.
- Register entries SCI-142 to SCI-144 (Chamberlin 1890, verified; Platt 1964, bibliography only; AEMET tercile categories) and the FAO terms for GIEWS excerpts in SCI-25.
- Validated Sentinel-2 vegetation record for the catchment in `data/bundles/`: monthly NDVI for 2019 to 2025 (68 months available, 16 insufficient in winter, each gap with its reason; SV-01 reproduction passed) and monthly departures against both the all-years and the leave-one-year-out same-month median, with "Contains modified Copernicus Sentinel data 2019-2025".
- Result bundles for the P0 recipes in `data/bundles/`: `season_summary` 1.0.0 for the seven wet seasons 2018/19 to 2024/25, with the six monthly totals behind each; `coverage_summary` 1.0.0 (catchment only); `aligned_antecedent` 1.1.1, marked post hoc in the bundle, the registry and the recipe page, reporting both references; and `terrain_strata` 1.0.0, three equal-area elevation bands and aspect classes with ESA WorldCover 2021 cropland and built-up excluded, for field sampling only.
- Full recipe entries for `coverage_summary`, `monthly_departure`, `aligned_antecedent` and `terrain_strata`, each saying which parts were fixed before any data was read and which were written with the first run.
- Register entry SCI-154, the GeoNames gazetteer extract for Morocco, used for map labels only.
- The science pipeline package in `science/`: 19 scripts that build every bundle from public data by HTTP range request, the machine-readable recipe registry and the pinned lock file; no model computes or edits a number, and the catchment delineation stays outside the package.

### Changed

- README rewritten to lead with the problem in cited research (eleven numbered sources, each with its register ID), the first case's real data, how the method scales, the Meta model jobs and a table of what exists and what does not; the old hero image, a frame with a contradicted rainfall statement, is gone.
- Study area frozen at native 30 m (417.04 km2 geodesic, one ring, SHA-256 published in the study-area note) before any vegetation data was read; Sentinel-2 harmonization on the Earth Search legacy collection uses DN / 10000 and never the asset offset, with pixel-paired evidence.
- Meta models research note: documentation facts checked on 2026-10-27 (spatial and search grounding, prefix caching, stream and error events; MM-27 to MM-31), the ADR-0045 jobs with costs and risks, and local Muse Glimmer smoke tests labeled as such.
- Delivery plan: build days B1 to B5 are counted from the founder's approval of the hero frame; GATE-01 runs once the founder's Meta key and spend alert exist, GATE-02 runs in the science lane from day 2, and GATE-03 closes B2. A minimum event bundle from the FAO GIEWS archive (SCI-25) enters P0; French and Arabic reports stay P1.
- Demo plan rule 3 admits the validated event bundle as input, labeled "Precomputed by Muse Spark" with its build date and pass counts; its comparison with the rainfall record runs live.
- Agent orchestration and data contracts: the event tools `read_event_record` and `compare_events` with strict arguments, the event record row planned for contracts 1.3, and a claim rule that model text restating a hypothesis carries its status word in the same sentence, with matching status-behavior fixtures in the evaluation harness.
- Architecture constraints: the GATE-01 checks run as one script, at about USD 0.01 per run at list prices.
- Case contracts 1.2.0: `$id` is `https://siterra.invalid/schemas/case/1.2.0/case.schema.json` with the title "Siterra case contracts"; version history moved to this changelog; validation unchanged. The earlier bundle manifest schema was replaced by the STAC extension.
- Documentation reorganized by type: explanation, reference and how-to folders following Diataxis, the arc42 architecture, MADR decision records, and delivery documents in `docs/project/`. Numbered upper-case file names became descriptive lowercase names. The technical architecture was split into arc42 sections; the handoff status page was absorbed into the gates and readiness sections of the delivery plan; the documentation visibility policy became `CONTRIBUTING.md` and the publication gate guide.
- Identifiers use the `PREFIX-NN` form: decisions D01 to D25 became [ADR-0001](docs/decisions/0001-build-one-gated-case-ending-in-a-field-validation-plan.md) to [ADR-0025](docs/decisions/0025-publish-by-default-and-keep-private-by-exception.md), risks R01 to R22 became RISK-01 to RISK-22, presentation rules R1 to R7 became PRES-01 to PRES-07, components C01 to C18 became CMP-01 to CMP-18, motions M01 to M12 became MOT-01 to MOT-12, visual references REF-01 to REF-29 became VIS-01 to VIS-29, competitive sources C01 to C20 became MKT-01 to MKT-20 (with STD and LANG for standards and language sources), gates G0 to G3 became GATE-00 to GATE-03, and acceptance criteria IDs are zero-padded (SV-01).
- Interface layout: the docked investigation column became floating islands over a full-bleed map (ADR-0040); the primary action reads "Start investigation".
- Paths: `specs/` became `schemas/`; `research/raw/` and `research/derived/` became the ignored `data/raw/` and `data/interim/`; `design/assets/` became `design/tokens/` and `design/prototype/foundation.css`; `design/high-fidelity/` became `design/prototype/`.
