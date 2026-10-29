# Technical Documentation Index

Architecture, normative data and agent specifications, statistical recipes, and scientific documentation for Siterra.

## Architecture (`docs/architecture/`)

System design following the arc42 structure ([overview](architecture/README.md)):

| Section | Contents |
|---|---|
| [01. Introduction and goals](architecture/01-introduction-and-goals.md) | System requirements, quality goals, and stakeholder boundaries |
| [02. Architecture constraints](architecture/02-architecture-constraints.md) | Model platform rules, pinned stack versions, hosting constraints, and conventions |
| [03. Context and scope](architecture/03-context-and-scope.md) | C4 System Context diagram, external data sources, and technical boundaries |
| [04. Solution strategy](architecture/04-solution-strategy.md) | Stack architecture and core engineering approaches |
| [05. Building block view](architecture/05-building-block-view.md) | C4 Container diagram, monorepo package layout, and worker internals |
| [06. Runtime view](architecture/06-runtime-view.md) | Command execution, pre-registered hypothesis branches, review, and SSE replay flows |
| [07. Deployment view](architecture/07-deployment-view.md) | Service topology and self-hosted map/STAC asset delivery |
| [08. Cross-cutting concepts](architecture/08-cross-cutting-concepts.md) | Authoritative case revisions, model boundary, deterministic tools, trace spans, and authority limits |
| [09. Architecture decisions](architecture/09-architecture-decisions.md) | Summary of core technical and scientific invariants |
| [10. Quality requirements](architecture/10-quality-requirements.md) | Traceability, scientific validity, reliability, safety, accessibility, and performance scenarios |
| [12. Glossary](architecture/12-glossary.md) | Domain and technical terminology |

## Technical Reference (`docs/reference/`)

Normative specifications for records, agent execution, statistical pipelines, and the workspace interface ([overview](reference/README.md)):

| Document | Specification |
|---|---|
| [Data contracts](reference/data-contracts.md) | Case record types, `ExplanationBranch`, `BranchMerge`, `CaseAnalysisConfig`, STAC extension 1.1.0, and OpenAPI 3.2 routes |
| [Agent orchestration](reference/agent-orchestration.md) | Bounded task coordinator, `muse-spark-1.3` structured outputs, pre-registered predictions (`DF-07` to `DF-09`), and layered validators |
| [Analysis recipes](reference/analysis-recipes.md) | Deterministic statistical recipes (`restrend_long_record`, `pixel_trend_long_record`, `season_trend_long_record`, `snow_cover_by_band`, `monthly_departure`, `season_summary`, `aligned_antecedent`, `terrain_strata`, `coverage_summary`) |
| [Data sources and methods](reference/data-sources-and-methods.md) | Study area delineation, MODIS MOD13Q1/MOD10A1, Sentinel-2 L2A, CHIRPS v3.0, Copernicus DEM GLO-30, and ESA WorldCover 2021 |
| [Observation preprocessing](reference/observation-preprocessing.md) | Reflectance harmonization, scene classification masking, coverage rules, and STAC bundle output profile |
| [Evaluation harness](reference/evaluation.md) | Verbatim excerpt verification, claim-kind typing, and numeric provenance evaluation |
| [Review and authority](reference/review-and-authority.md) | Role-scoped human review, revision invalidation, and prohibition of external side effects |
| [UX architecture](reference/ux-architecture.md) | Map stage, floating islands, visual budgets, and catalog-constrained composition |
| [Components](reference/components.md) | Component catalog (`CMP-01` to `CMP-23`), bindings, and states |
| [Scenes and views](reference/scenes.md) | Camera templates, flat reading mode, and layer bindings |
| [Motion](reference/motion.md) | Camera and state-transition timing specifications (`MOT-01` to `MOT-13`) |
| [Design system](reference/design-system.md) | Typography, OKLCH color scales, data palettes, and contrast rules |
| [Voice and tone](reference/voice-and-tone.md) & [Microcopy](reference/microcopy.md) | Copy rules, banned causal/diagnostic terms, and string catalog |
| [Accessibility and language](reference/accessibility-and-language.md) | Keyboard navigation, reduced motion, flat text equivalents, and multilingual source handling |
| [Identifiers](reference/identifiers.md) | Identifier prefixes across schemas, source registers, and components |

## Scientific Basis (`docs/explanation/`)

Domain context, ecological mechanisms, and methodological limits ([overview](explanation/README.md)):

| Document | Contents |
|---|---|
| [Scientific basis and limits](explanation/scientific-basis.md) | Competing hypotheses in Aït Bouguemez, 25-year MODIS greening vs. pastoral forage mechanisms, field-check separability review, and prohibited claims |
| [The problem](explanation/problem.md) | Cited global and Moroccan rangeland facts and excluded misquotations |
| [Product thesis](explanation/product-thesis.md) | Investigation scope, user roles, and analytical discipline |
| [Comparable places](explanation/comparable-places.md) | High Atlas and Middle Atlas reference studies and rules against numeric transfer |
| [Users and flows](explanation/users-and-flows.md) | Program manager, local initiator, and reviewer workflows |

## Schemas, Pipeline, and Research Registers

- [`schemas/`](../schemas/README.md): JSON Schema 2020-12 contracts (`case.schema.json`), STAC extension (`stac/siterra-extension.schema.json`), OpenAPI (`openapi.json`), and validated examples.
- [`science/`](../science/README.md): Offline Python pipeline scripts, place configuration (`science/places/ait-bouguemez.json`), and recipe registry (`science/recipes/registry.json`).
- [`research/`](../research/README.md): Primary source registers (`SCI-*`, `TECH-*`, `VIS-*`), statistical analytics notes (`research/science/analytics.md`), and CSL-JSON bibliographies.

## Evidence Labels

| Label | Meaning |
|---|---|
| **[V]** Verified | Checked against a cited primary source on the stated date |
| **[D]** Decision | An engineering or methodological design rule enforced in the repository |
| **[H]** Hypothesis | A candidate explanation or assumption requiring empirical test |
| **[U]** Unverified | Access, measurement, or local permission not yet established |
