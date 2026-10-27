# Glossary

Domain and technical terms used across Siterra's documentation. Where a term names a record or field, the [data contracts](../reference/data-contracts.md) and [`schemas/case.schema.json`](../../schemas/case.schema.json) are authoritative; the linked owner document wins on any detail.

| Term | Definition |
|---|---|
| Agdal | A customary institution governing access to and use of a resource such as a pasture or forest, with opening dates set locally (for example by village assemblies). Not a boundary Siterra draws or a closure calendar it prescribes ([scientific basis](../explanation/scientific-basis.md)). |
| Analysis recipe | A versioned, deterministic analysis in the recipe catalog (for example `monthly_departure`, `aligned_antecedent`). The model selects, scopes and interprets recipes; the offline pipeline precomputes them as derived bundles; each carries a method card ([analysis recipes](../reference/analysis-recipes.md)). Not to be confused with a layer recipe. |
| Answer card | The block at the top of a section that answers the user's latest request: the question, evidence tiles, the finding with evidence chips and at most two next questions (CMP-21). |
| Arrival | The shell state before commissioning: the full-bleed map, the case card and one primary action, "Commission investigation". |
| Blocked-observation path | What ships when no validated observation bundle exists: published context, missing-data states and the field-scoping package. Values are never fabricated. |
| Boundary role | `boundaryRole` of a geo selection: what the polygon represents (`regional_context`, `landscape_sample`, `administrative_unit`, `hydrological_unit`, `validated_management_unit`). Separate from `geometryStatus`, which says whether it can be analyzed. |
| Brief | The decision brief (`Brief`). Every line is a `BriefItem` with a claim kind and evidence IDs; sections Known, Uncertain, Measure next, Involve, Firm can prepare, Requires authorization, What happens next. |
| Bundle | A frozen, checksummed observation export (`DataBundle`), for example monthly NDVI for one geometry or monthly CHIRPS rainfall. On disk it is a STAC Collection with one Item per period, constrained by the [Siterra STAC extension](../../schemas/stac/siterra-extension.schema.json) and the [bundle output profile](../reference/observation-preprocessing.md#bundle-output) ([ADR-0028](../decisions/0028-describe-observation-bundles-as-a-stac-catalog.md)). `validated` requires manifest URI, content hash, license and attribution; superseding a bundle stales every dependent measurement. |
| Case | The commissioned investigation (`EnvironmentalCase`) that holds every record. Its `mode` (`live`, `replay` or `concept`) is shown on every screen; its `permissionProfile` is `research_and_preparation_only` in P0. |
| Case corpus | The sources retrieved at setup from their official URLs, hashed and stored outside Git, which tasks search and read. |
| Case pill | The small island at the top left with the mark, case title, status word, running count and mode label; its menu opens activity, history and the theme (CMP-01). |
| Case revision | The version of the whole case. Every commit creates a new one; commands and commits carry `expectedCaseRevision`, and every view projects one revision. |
| Catalog | The fixed set of component kinds the model may propose, with one machine-readable entry per kind in `packages/contracts` ([components](../reference/components.md#catalog-bindings)). |
| Claim kind | The type of every evidence statement: observation, published context (`scientific_context`), hypothesis, model estimate, scenario, field requirement, verified outcome (rejected in P0). Shown as glyph plus words. |
| Command | A user request (`Command`): text, context with revisions, `expectedCaseRevision` and an idempotency key. States `accepted → running → succeeded`, `partial`, `failed` or `cancelled`; `rejected_stale` when it cannot be safely rebased. |
| Commit | The atomic unit of change (`Commit`): expected case revision, upserts, events and accepted layout actions, applied in one transaction or not at all. |
| Comparable place | Another place where something similar was studied, shown as published context by analogy with its transfer limits; never a control, a forecast or a reason to change a hypothesis status ([comparable places](../explanation/comparable-places.md)). |
| Component | A typed view over records (`CanvasComponent`) from the catalog, bound to exact entity versions and placed in one section. Presentation state, reconstructible from domain records. |
| Context | The area, period and focus a command uses, each with its revision, shown as director chips. Changing the selection while a command runs does not retarget it. |
| Coordinator | The planner that turns a command and its context snapshot into a validated task graph through the `plan` task. |
| Copy lint | Automated checks on interface strings and model-written text for banned words, typography, number formats and honesty rules, with rule IDs `VT-NN` ([voice and tone](../reference/voice-and-tone.md#lint-rules)). |
| Coverage policy | The display completeness rule: at least three distinct observation dates for a pixel-month and at least 70% accepted area coverage for a spatial summary. Below it a period shows as a gap with counts. An engineering policy, not ecological confidence. |
| Default projection | The reducer's placement for each task kind when no valid layout proposal exists. |
| Departure | The difference from a reference. For NDVI, the current value minus the matching same-month reference median per pixel, summarized over common-valid area; for rainfall, millimetres from the 1991 to 2020 same-month mean. |
| Director | The command composer attached to the investigation sheet: typed requests with visible context chips, a receipt and progress. It turns requests into work inside Siterra and never contacts anyone. |
| Drought challenge | The signature interaction: "Could drought explain this instead?" starts new tasks, a rainfall comparison on the native grid and a hypothesis ledger update. |
| Entity version | `EntityVersion {entityId, revision}`: the exact record version that a derived record, relationship, component or review cites. |
| Evaluation harness | The suites that score extraction fidelity, claim typing, status behavior, numeric provenance, schema adherence, safety, statement faithfulness, cost and time against gold sets ([evaluation](../reference/evaluation.md)). |
| Event | A persisted domain fact (for example `task.queued`, `case.committed`) that is both the public trace and the stream. Sequence numbers are per case, gapless and monotonic; messages come from host templates, never from the model. |
| Evidence | A typed statement with provenance (`Evidence`): claim kind, sources or measurements, scope and limitations. Only retrieved sources may support accepted evidence. |
| Evidence kind | The claim kind of an evidence item; see claim kind. |
| Evidence labels | [V] verified, [D] decision, [H] hypothesis, [U] unverified: the labels documentation uses for claims ([documentation index](../README.md#evidence-labels)). |
| Field-validation plan | The prepared package (`OperationalAction`, component `action_package`): objective, sampling strata, measurements, roles, permissions, resource categories and dependencies. |
| Focus mode | A shell state that hides the investigation sheet and timeline so the map fills the frame. |
| Gate | A delivery checkpoint that can stop or narrow the build, GATE-00 to GATE-05 ([delivery plan](../project/delivery-plan.md#gates)). |
| Geo selection | The analysis or context geometry (`GeoSelection`), with a boundary role and a geometry status. `analysis_ready` requires provenance, CRS, area method and limitations. |
| Gold set | Items written by a person with known correct answers, used only to score model output; never sent to a model. |
| Hold and release | Composition changes apply immediately only when they complete the user's latest command and the pointer and keyboard focus are outside the affected section; otherwise they wait behind "View new findings (n)". |
| Hypothesis | A candidate explanation (`Hypothesis`) with supporting, contradicting and missing evidence and a status word: not yet tested, consistent with available evidence, inconsistent with available evidence, cannot be assessed with current data, needs reassessment. Never a probability or score. |
| Hypothesis ledger | The `hypothesis_comparison` component: hypotheses with Supports, Contradicts and Missing columns. |
| Idempotency key | A UUID the client sends per command; a repeated key returns the existing command. |
| Inspector | The overlay that shows evidence, source and measurement detail; every value opens it. |
| Intervention | A candidate response (`Intervention`) with conditions, assumptions, ecological and livelihood considerations and required review roles. No benefit numbers. |
| Investigation sheet | The opaque panel that holds the five sections, with only the focused section expanded ([UX architecture](../reference/ux-architecture.md#anatomy)). |
| Island | A floating panel over the full-bleed map: case pill, map ornament, investigation sheet with the director, timeline and legend ([UX architecture](../reference/ux-architecture.md)). |
| Lane | A parallel implementation unit with owned directories: platform, agent runtime, science and map data, workspace UI, quality ([delivery plan](../project/delivery-plan.md#lanes-and-ownership)). |
| Layer recipe | A coded function that emits MapLibre layers over bundle sources for map scenes (for example `area_outline`, `period_raster`). Not to be confused with an analysis recipe. |
| Layout action | A typed presentation change proposed by the model (`show_component`, `update_component`, `set_comparison`, `focus_entity`, `hide_component`) and applied by the reducer. |
| Local initiator | A person with a stake in a place but no technical staff, such as a tour operator, who commissions a case to raise a concern with officials or community groups ([users and flows](../explanation/users-and-flows.md#second-role-local-initiator)). |
| Machine-drafted translation | A model translation of a statement or document, bound to the source revision and labeled until a competent local reviewer checks it. |
| Map ornament | The control island at the top right of the map with the Views menu, 3D toggle and zoom (CMP-19). |
| Measurement | One computed value for one area and period (`Measurement`). `value` is null whenever its status is not `available`; the uncertainty kind is explicit, and unknown is `not_quantified`, never zero. |
| Method card, data card | Generated summaries of an analysis recipe (purpose, inputs, assumptions, minimum data, outputs, known failure modes, validation) and of an observation bundle (sources, coverage, processing, licenses, limitations). Never written by the model ([evaluation harness](../reference/evaluation.md#method-and-data-cards)). |
| Mode | `live`, `replay` or `concept` on the case, shown on every screen. Review decisions carry their own mode, `demo` or `real`. |
| Model map | The list of Meta models Siterra uses, each with one job and one independent check, generated from the routing configuration ([ADR-0041](../decisions/0041-give-each-meta-model-one-job-with-an-independent-check.md)). |
| Muse Glimmer | Meta's 30B open-weight model; Siterra runs a pinned copy locally as the second reader. |
| Muse Image | Meta's image model; Siterra uses it only for labeled, wordless illustrations of field-protocol steps. |
| Muse Spark | Meta's model family on the Model API; `muse-spark-1.3` on the Responses API is the P0 model ([architecture constraints](02-architecture-constraints.md#model-platform)). |
| NDVI | Normalized difference vegetation index, computed per valid observation as `(B8 − B4) / (B8 + B4)` from masked, harmonized Sentinel-2 reflectance; dimensionless. A vegetation index cannot diagnose overgrazing on its own. |
| Numeric provenance check | The validator rule that every number in model-written text matches a value in a referenced measurement (within its displayed precision), a date or period, or a number inside a cited excerpt. |
| Operational action | Prepared real-world work (`OperationalAction`) with `externalExecutionEnabled: false`. States `draft → awaiting_review → prepared`, with `blocked`, `cancelled` and `superseded` branches. |
| Outbox | Rows written with each command in the same transaction; the dispatcher enqueues jobs from them with a stable key, so a lost queue message is recovered. |
| P0, P1, P2 | Priorities: P0 is essential for a credible demonstration, P1 is high-value polish only after all P0 tests pass, P2 is optional ([delivery plan](../project/delivery-plan.md#priorities)). |
| Period | A calendar month identified as `period_YYYY-MM` (UTC, start inclusive, end exclusive). An identifier, not a record; every view selects periods by this ID only. |
| Pre-registration | Committing an analysis plan's scope and windows before any result is read, so the model cannot choose a window after seeing the data ([analysis recipes](../reference/analysis-recipes.md)). |
| Prepared | The terminal P0 state for operational actions; there is no `executed` state. |
| Projection | A view derived from one case revision: map, charts, investigation sheet, director, brief or trace. A projection never holds a fact that is not in a record. |
| Proposal | A task's typed structured final output (`propose_plan`, `propose_evidence`, `propose_hypotheses`, `propose_interventions`, `propose_package`, `propose_layout`). Nothing is written until validation and commit. |
| Reducer | The deterministic server code that validates layout actions against the catalog and the case and applies them inside the commit. |
| Relationship | A typed, explained edge between two exact record revisions (`Relationship`), for example `supports`, `contradicts` or `requires_authorization`. |
| Replay | A labeled playback of recorded model outputs, used when live model access fails or for rehearsal; every screen says "Replay". |
| Review decision | A role-scoped decision on exact entity versions (`ReviewDecision`) with `mode` (`demo` or `real`) and `authorityStatus`. Demo decisions never satisfy a real authorization. |
| Revision | The version number every record carries (`revision`). Records are revised, never silently rewritten; see case revision and entity version. |
| Scene (map) | A sequence of full map states (camera, layers, annotations, period, caption) produced from a scene template, never authored as code. A view is a one-step scene; a tour is a multi-step scene ([scenes and views](../reference/scenes.md)). |
| Scene (storyboard) | One of the ten product states in the [experience storyboard](../reference/experience-storyboard.md), from scene 1 (arrival) to scene 10 (continuity), plus the required failure scenes. |
| Scene template | Reviewed, versioned, case-agnostic code that declares the roles a map scene needs, bounded parameters and availability rules. |
| Second reader | A second model that checks whether an English statement says more than its original excerpt; its flags are advisory and route items to a reviewer. |
| Section | One of five fixed parts of the investigation, in reading order: Place, Observations, Explanations, Responses, Next steps. The model cannot reorder them. |
| Shell state | Derived workspace state, never proposed by the model: `arrival`, `investigating`, `comparing`, `reviewing`, `focus`. |
| Short reference period | The same calendar month across 2019 to 2025 per pixel, used for NDVI departures. Not a climate normal. |
| Snapshot | The case, its records and `lastSequence`, read in one transaction; the event stream resumes after it. |
| Source | A document or dataset the firm used (`Source`), with `accessStatus` `discovered`, `retrieved` or `unavailable`. |
| Span | An internal trace row (trace = command; spans for workflow, plan, task, model call, tool call, validation and commit) named after the OpenTelemetry GenAI conventions. Never stores prompts, messages or tool arguments. |
| Stale | The state of a record whose cited input changed. It emits `entity.stale` and needs reassessment; recomputation creates new revisions and history stays readable. |
| Study area | The Aït Bouguemez valley catchment: a hydrological analysis extent (about 417.5 km² preview) derived from Copernicus DEM GLO-30, labeled "not a pasture, agdal or management boundary" ([data sources and reproducible methods](../reference/data-sources-and-methods.md#study-area)). |
| Task | A bounded job (`Task`) with an input snapshot, a tool allowlist, a typed result, a budget, a deadline, dependencies and a trace. Kinds: `plan`, `source_research`, `observation_analysis`, `livelihood_governance`, `hypothesis_comparison`, `intervention_feasibility`, `brief_package`, `validation`. |
| Temporal observation | The per-period record (`TemporalObservation`) that the timeline, map and charts share; it links a period ID to measurements and an optional map asset. |
| Timeline | The scrubber at the bottom of the map that selects the committed period, with coverage; it expands to the strip rows on focus. |
| Tour | A multi-step map scene, such as an orbit or a time-lapse, played with a transport bar. |
| Trace | The inspectable record of work for a command: tasks, model calls, tool calls and validation outcomes, built from events and spans and sanitized before it reaches the browser. |
| View (map) | A one-step map scene: a still from a computed angle, listed in the Views menu. |
| View state | Period, focus, view, open inspector and camera, held in the URL and React state so reload and back restore them. Not part of the case record. |
| Visual budget | Per-state limits on islands, controls, expanded components, text items and covered map area, checked automatically (VC-04, VC-05). |
