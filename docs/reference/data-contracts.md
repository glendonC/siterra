# Data contracts

Status: implementation contract v1.12, 2026-10-29. Machine-readable source of truth: [schemas/case.schema.json](../../schemas/case.schema.json) (JSON Schema 2020-12). Examples: [schemas/examples/](../../schemas/examples/). This document owns cross-record semantics that a JSON Schema cannot express. [Orchestration](agent-orchestration.md) owns jobs and tools; [review](review-and-authority.md) owns authority.

## Principles

1. The case record is authoritative. Map, charts, director, brief and trace are projections of one case revision. A component never holds a fact that is not in a record.
2. Records are revised, never silently rewritten. Every entity has `id` and `revision`. Derived records cite exact `EntityVersion {entityId, revision}` inputs. A changed input makes dependents `stale`; recomputation creates new revisions.
3. One commit, one transaction. A task result becomes a `Commit`: expected case revision, upserts, events and accepted layout actions, applied atomically or not at all.
4. Every claim is typed. `Evidence.claimKind` is one of `observation | scientific_context | hypothesis | model_estimate | scenario | field_requirement | verified_outcome`. The UI renders the kind on every statement.
5. Numbers come from records. Model-written text may only contain numbers that exist in referenced measurements, source excerpts or dates (numeric provenance check, [Agent orchestration](agent-orchestration.md#validation)).
6. Missing is a value. `status: missing | excluded | invalid` with a reason. Never zero, never interpolated.
7. Estimates carry uncertainty. A `model_estimate` carries an uncertainty kind other than `not_quantified`, unless its analysis recipe declares why it cannot ([analysis recipes](analysis-recipes.md#typing-rule)). Comparable places are `scientific_context` with an analogy scope note and never change a hypothesis status on their own ([comparable places](../explanation/comparable-places.md#rules)).

Implementation: author Zod schemas in `packages/contracts` that mirror the JSON Schema; a contract test validates every case example in `schemas/examples/` with both (the STAC examples validate against the STAC schemas and the [Siterra extension](../../schemas/stac/siterra-extension.schema.json)). Model-facing output and tool schemas are generated from the same Zod source and must fit Meta's strict subset (TECH-06): root is a plain object, no `oneOf` or `allOf` anywhere, `anyOf` only below the root, every object closed with every property required (nullable by type union), no recursion, depth at most 10. A contract test rejects any model-facing schema outside that subset. The storage and wire schema in `schemas/` may use `oneOf` at its root because it is never sent to the model.

## Identifiers

Pattern `^[a-z][a-z0-9_]*_[A-Za-z0-9][A-Za-z0-9_-]{1,79}$`. Prefix by type:

| Prefix | Record | Prefix | Record |
|---|---|---|---|
| `case_` | EnvironmentalCase | `hyp_` | Hypothesis |
| `src_` | Source | `rel_` | Relationship |
| `geo_` | GeoSelection | `comp_` | CanvasComponent |
| `bundle_` | DataBundle | `layout_` | LayoutAction |
| `task_` | Task | `int_` | Intervention |
| `ev_` | Evidence | `res_` | ResourceRequirement |
| `meas_` | Measurement | `rev_` | ReviewDecision |
| `obs_` | TemporalObservation | `act_` | OperationalAction |
| `cmd_` | Command | `brief_` | Brief |
| `evt_` | Event | `commit_` | Commit |
| `erow_` | EventRecordRow | `ctx_` | ContextFeature |
| `inst_` | InstrumentSpec | | |

**Periods** are identifiers, not records: `period_YYYY-MM` for a calendar month (UTC, start inclusive, end exclusive). A window repeated each year is `period_<firstYear>-<lastYear>_<mon>_<mon>` (for example `period_2000-2025_mar_jun`, March to June of every year from 2000 to 2025), one season of that window `period_<year>_<mon>_<mon>`, and a window that crosses the new year is named by the bundle's own season-year label (September to May of season 2001 is `period_2001_sep_may`). A number about the land surface that does not vary with time (a drainage length, a transect height, a land cover share) is named by the year its dataset was released, `period_2021` for the 2021 Copernicus DEM and WorldCover releases, and `source.period` gives that year as both start and end with no window. A period ID is an opaque name: no code parses it, and a Measurement states its period in the fields of `source.period`. Chart, map, strip and brief select periods by this ID only. Server-generated IDs use a ULID suffix; fixtures may use readable slugs. IDs never contain the product name.

## Entity summary

Field-level types live in the schema. This table states purpose and the rules that matter.

| Record | Purpose | Key rules |
|---|---|---|
| EnvironmentalCase | The commissioned case | `mode: live \| replay \| concept` is shown on every screen. `permissionProfile` is the constant `research_and_preparation_only` in P0. |
| Source | A document or dataset the firm used | `accessStatus: discovered \| retrieved \| unavailable`. Only `retrieved` sources may support accepted evidence. `redistributionStatus` governs export. `publicationDate` is the date as the source states it (year, year and month, or full date; 1.4), never padded, so a comparison with it uses the stated precision. Optional `language` (BCP 47, 1.5) names the language of the source text; an English statement drafted from a source in another language is labeled a machine-drafted translation. |
| GeoSelection | The analysis or context geometry | `boundaryRole` states what the polygon *is* (see below). `geometryStatus: analysis_ready` requires provenance, CRS, area method and limitations. |
| DataBundle | A frozen, checksummed observation export | `status: validated` requires manifest URI, content hash, license and attribution. Superseding a bundle (a new revision with status `superseded`) is a material change: every record whose provenance cites that bundle revision becomes `stale`, and so does what rests on it. Measurements have no stale state and stay as recorded. |
| Measurement | One computed value for one area and period | `value: null` whenever `status != available`. Coverage fields required when known. `uncertainty.kind` is explicit; unknown is `not_quantified`, never zero. |
| TemporalObservation | The per-period unit the timeline, map and chart share | Links a `periodId` to measurements and an optional map asset. `mapStatus: missing` renders "No map observation for this period". |
| Evidence | A typed statement with provenance | `observation` must reference at least one measurement; `scientific_context` must reference a retrieved source locator; `field_requirement` needs no measurement but must state what decision it informs. |
| Hypothesis | A candidate explanation | Status vocabulary below. Holds supporting, contradicting and missing evidence. Never a probability. |
| Relationship | A typed, explained edge between two exact revisions | Allowed pairs below. `fromEntityRevision` and `toEntityRevision` pin what the edge asserts; drawn only on selection. |
| Intervention | A candidate response | Conditions, assumptions, livelihood and ecological considerations, required review roles. No benefit numbers. |
| ResourceRequirement | What a response or plan would need | `estimateStatus: unknown \| scenario_assumption \| source_supported \| confirmed`. Quantities only when sourced. |
| OperationalAction | Prepared real-world work | `externalExecutionEnabled: false` (constant in P0). Terminal P0 state is `prepared`, reached only through completed reviews: a task commit that writes `prepared` is refused (`action_status_not_permitted`). A `field_validation_plan` carries `fieldPlan` (1.8): objective, the decision it informs, strata (kinds of place, never sampling points), measurements (what, method, season, strata, field role, the gaps and hypotheses each resolves), deferred gaps with reasons, permissions and consultation steps. A gap is accepted `field_requirement` Evidence. When drafted or sent for review, every measurement names a gap or hypothesis and every open gap of the case is measured or deferred, never both; otherwise the commit is refused (`field_plan_invalid`, DF-06). |
| ReviewDecision | A role-scoped decision on exact versions | `mode: demo \| real`; `authorityStatus: not_established \| verified_for_scope`. Demo decisions can never satisfy a real authorization. |
| Brief | The decision brief | Every line is a `BriefItem` with claim kind and evidence IDs. `provenance.inputVersions` cites every ID in `evidenceIds`, `hypothesisIds` and `interventionIds`, so a changed input stales the brief; a commit with a brief that does not is refused (`brief_inputs_not_cited`). |
| EventRecordRow | One dated event in a validated event bundle (ADR-0045), added in contracts 1.3 | Not evidence. Rules in [event record rows](#event-record-rows). |
| ContextFeature | A located feature a view needs (outlet, settlement, viewpoint, summit), added in contracts 1.6; drainage, transect and proposed-route lines added in 1.12 | A point, a line or a set of lines in EPSG:4326 with the method, dataset, source IDs, attribution, licence and limitations of its position. Never evidence: no statement, measurement or hypothesis rests on it. Rules in [context features](#context-features). |
| ExplanationBranch | One candidate explanation tested by committed predictions, added in contracts 1.9 | Revision 1 holds the predictions and status `predicted`; revision 2 holds host scores, `predictionsCaseRevision` and a status set by fixed rules. Rules in [explanation branches](#explanation-branches). |
| BranchMerge | The fixed-rule merge of one task's branches, added in contracts 1.9 | `rulesVersion` (`merge@1` or `merge@2`), each branch's exact revision and status, and the flagged conflicts. Never a ranking. |
| InstrumentSpec | What one instrument of the workspace shows, added in contracts 1.11 | References only (bundle assets, GeoSelection, ContextFeature, Evidence, BranchMerge and OperationalAction records), never a value, camera, scale, colour, coordinate or URL; a caption with an ink sentence, a grey sentence and citations. Rules in [instruments](#instruments). |
| CanvasComponent / LayoutAction | Presentation projection | References entity IDs only. See [layout contract](#presentation-contract). |
| Command / Task / Event / Commit | Execution and audit | See state machines and events below. |

### Geometry roles

`boundaryRole` (what the polygon represents) and `geometryStatus` (whether it can be analyzed) are separate.

| boundaryRole | Meaning | UI label |
|---|---|---|
| `regional_context` | Locator or region for orientation only | "Regional context" |
| `landscape_sample` | Analyst-defined extent with stated rationale | "Landscape sample, not a management boundary" |
| `administrative_unit` | Official administrative polygon (e.g. a commune) | "Administrative unit, not a pasture boundary" |
| `hydrological_unit` | Catchment from a hydrological dataset or DEM (P0 default: the valley catchment) | "Valley catchment, not a pasture, agdal or management boundary" |
| `validated_management_unit` | Locally confirmed management unit with documented authority | Not available in P0 |

The P0 default geometry is decided in [Data sources and reproducible methods: -DATA-SOURCES-AND-METHODS](data-sources-and-methods.md#study-area).

### Hypothesis status

Use cautious words in data and UI so developers cannot accidentally overclaim.

| Status | UI label | Meaning |
|---|---|---|
| `untested` | Not yet tested | Stated; no discriminating evidence assessed |
| `consistent` | Consistent with available evidence | Evidence fits; not proof, not exclusive |
| `inconsistent` | Contradicted by available evidence | At least one accepted observation contradicts it as stated |
| `inconclusive` | Cannot be assessed with current data | Discriminating data missing; `missingEvidence` must be non-empty |
| `stale` | Needs reassessment | An input changed |

Several hypotheses may be `consistent` at once. The ledger never ranks them by a score.

## Semantic relationships

Relationships carry meaning, not decoration. Each has a one-sentence `explanation` written from records (no new facts).

| kind | Allowed from → to | Means | Never means | Rendering |
|---|---|---|---|---|
| `supports` | Evidence → Hypothesis; Evidence → Intervention | The evidence is relevant and consistent with the target | Proof or causation | Solid line, label "supports" |
| `contradicts` | Evidence → Hypothesis | The evidence is inconsistent with the target as stated | Disproof of all variants | Solid line with bar end, label "contradicts" |
| `derived_from` | Measurement or Evidence → DataBundle or Source | Provenance | Endorsement | Inspector only, not drawn |
| `compares_with` | Measurement ↔ Measurement; Hypothesis ↔ Hypothesis | Aligned comparison exists | Correlation or equivalence | Shown by layout (small multiples), not a line |
| `depends_on` | OperationalAction → OperationalAction, ResourceRequirement or ReviewDecision; Intervention → ResourceRequirement | Cannot proceed without target | Ordering preference | Thin line with arrow |
| `requires_verification` | Hypothesis, Evidence or Intervention → Evidence(`field_requirement`) or OperationalAction | Field or expert verification needed before relying on it | That verification has happened | Dotted line, label "needs verification" |
| `proposes_response` | Hypothesis → Intervention | If the explanation holds, this response is a candidate | Recommendation | Thin line, label "candidate response" |
| `requires_authorization` | Intervention or OperationalAction → ReviewDecision | A named role must decide before real action | That authority exists | Caution-colored line with lock glyph |

Visibility rules: connectors render only for the selected record; at most six at once; `contradicts` and `requires_authorization` are drawn first, and any edge beyond the cap is listed in the selected record's details, never silently omitted; every visible connector has a text label and a list equivalent. Lines connect record IDs, never pixel positions stored in data.

## State machines

| Record | Transitions |
|---|---|
| Command | `accepted → running → succeeded \| partial \| failed \| cancelled`; `accepted → rejected_stale` when `expectedCaseRevision` is behind and the intent cannot be safely rebased |
| Task | `queued → running → succeeded \| partial \| failed \| cancelled`; `running ↔ awaiting_input`; `running → awaiting_review` |
| DataBundle | `missing → processing → validated \| failed`; `validated → superseded` |
| Evidence | `provisional → accepted \| rejected`; `accepted → stale \| superseded` |
| Hypothesis | `untested → consistent \| inconsistent \| inconclusive`; any → `stale` |
| Intervention | `candidate → needs_validation → reviewed \| rejected`; any → `stale` |
| OperationalAction | `draft → awaiting_review → prepared`; branches `blocked`, `cancelled`, `superseded` |
| ReviewDecision | `not_requested → requested → changes_requested \| approved \| rejected \| deferred`; `stale: true` when reviewed versions change |
| Brief | `draft → ready_for_review → prepared`; `stale`, `superseded` |

A transition not listed is rejected by the commit validator. `prepared` is terminal for actions in P0; there is no `executed` state.

## Events

Events are the trace and the stream. Host code writes event messages from templates; the model never authors event text.

| kind | When | Payload notes |
|---|---|---|
| `command.accepted`, `command.completed` | Command lifecycle | `resultStatus` on completion |
| `task.queued`, `task.started`, `task.progress`, `task.awaiting_input`, `task.succeeded`, `task.partial`, `task.failed`, `task.cancelled` | Task lifecycle | `task.progress` only for real milestones (counts of loaded records, sources retrieved, and the explanations whose predictions are recorded, with the branch IDs as entity IDs) |
| `model.started`, `model.completed` | Each model request | `usage`: provider (`replay` or the Model API), model, input/output/cached tokens, cost estimate, provider request ID, status `succeeded \| refused \| incomplete \| failed`, duration; on the replay route `replayOrigin` (`synthetic` or `recorded`, added in 1.7). A record's `provenance.generatedByTaskId` leads to these events, so a replayed record reads as replayed wherever it is read |
| `tool.started`, `tool.completed` | Each tool execution | `tool`: name, sanitized argument summary, result entity IDs, status, duration, error code, attempt |
| `validation.completed` | After each proposal check | outcome `accepted \| partial \| rejected`, machine-readable issues |
| `case.committed` | Commit applied | new case revision, entity IDs |
| `layout.accepted` | Layout action applied | component IDs |
| `review.recorded` | Review decision stored | role, mode, status |
| `entity.stale` | Dependency invalidation | affected entity IDs and the changed input |

Sequence numbers are per case, gapless and monotonic. `dedupeKey` makes re-delivery harmless. Heartbeats are SSE comments, not events.

## Idempotency, revisions and recovery

| Concern | Rule |
|---|---|
| Duplicate submit | Client sends a UUID `idempotencyKey` per command; the server returns the existing command for a repeated key. |
| Duplicate task execution | Logical result key `(caseId, commandId, task kind, inputHash)`. A retry finds the committed result and returns it. |
| Duplicate events | Client ignores sequences at or below its cursor; a gap triggers snapshot refetch. |
| Concurrent change | Commit requires `expectedCaseRevision`. Mismatch: rebase only if the commit's inputs are unchanged; otherwise mark the task result stale and re-plan. Never last-writer-wins. |
| Failed operation | A failed or rejected proposal commits nothing except events. Partial results commit only the entities that validated. |
| Reload | `GET` snapshot returns case, records and `lastSequence` from one transaction; the stream resumes after it. View state (period, focus, open inspector) restores from the URL. |
| Undo | Domain records are not undone; a new decision or revision supersedes. View state and the last layout change can be undone (P1). |
| Source attribution | Every accepted evidence and measurement resolves to `Source` or `DataBundle` records with license and attribution, carried into map legends and exports. |

## Presentation contract

Components are typed views over records. The model may propose layout actions; a deterministic reducer applies them. Full rationale and the evaluated alternatives are in [UX architecture](ux-architecture.md#ai-composition-contract).

- `CanvasComponent.componentKind` is one of the catalog entries in [component specifications](components.md#catalog-bindings). It binds exact `entityVersions` and lives in a `section: place | observations | explanations | responses | next_steps`; `visibility: expanded | collapsed | hidden`. The five instrument kinds (contracts 1.11) are placed by host code and never proposed by the model ([instruments](#instruments)).
- `LayoutAction.kind` vocabulary, preconditions and limits are listed in [UX architecture](ux-architecture.md#ai-composition-contract). The reducer rejects: unknown component kinds, catalog mismatches, references to missing or stale entity versions, more expanded components than the [visual budget](ux-architecture.md#visual-budget) allows (at most two), focus changes not caused by the user's own command, and any coordinates, CSS, markup, code or URLs.
- Layout state is reconstructible from records. Deleting presentation records loses nothing scientific.

Cross-record rules the commit validator enforces (from the [generative workspace research](../../research/technology/generative-workspace.md#proposed-schema-changes)):

| Rule | Statement |
|---|---|
| PRES-01 | `CanvasComponent.entityIds` equals the set of `entityVersions[].entityId`, each entity appears once, and every listed revision exists |
| PRES-02 | `task_` IDs may be bound only while `presentationStatus` is `loading` or `error` (the pending slot shows the real task label) |
| PRES-03 | At most two components with `visibility: expanded` per case revision (the reading-state budget); the shell may show fewer in other states |
| PRES-04 | `aligned` binds two series sharing one GeoSelection revision; `two_period` names exactly two observed `periodIds`; `single` binds one series |
| PRES-05 | `focus_entity` only with `origin: user_command`, and its record is bound by a component expanded after the commit |
| PRES-06 | A relationship whose endpoint gains a newer revision without a re-asserted relationship becomes `stale` and emits `entity.stale` |
| PRES-07 | Layout proposals are atomic; a rejected proposal never fails its task; the default projection applies and no repair round is spent on layout |

## Event record rows

Added in contracts 1.3 (`EventRecordRow` in [case.schema.json](../../schemas/case.schema.json), snapshot list `eventRecordRowRecords`, example [commit-event-record.json](../../schemas/examples/commit-event-record.json)). The bundle is a DataBundle (`datasetId` `event_record`, `methodId` `event_extraction` with version, `sourceIds`, `manifestUri`, `contentHash`). Each source is a Source with `publicationDate` and `contentHash`; the P0 minimum uses only the FAO GIEWS briefs (SCI-25) with `sourceKind: institutional`, and a `news_report` kind stays a P1 proposal for press reports. Row fields: `dataBundleId` and `dataBundleRevision`, `eventType` (`drought_declaration`, `emergency_program`, `feed_subsidy`, `transhumance_change`, `pasture_rule`, `rainfall_statement`), `eventStart` and `eventEnd` (ISO date, year-month or year as stated), `scope` (`national`, `region`, `province`, `valley`), `placeNamed` or null, `sourceLocator` with the verbatim excerpt (at most 300 Unicode code points), `sourceLanguage` (BCP 47, for example `en`, `fr`, `ar`), `statementEn` (model-drafted; labeled "Machine-drafted translation" only when `sourceLanguage` is not English, so no P0 row carries that label), `rainfallDirection` (`below_normal`, `near_normal`, `above_normal`, `not_stated`), `extractionModel` and `extractionRequestId`. Host rules before a row is accepted: excerpt found verbatim in the stored text of the cited page; `eventStart` not after the source's `publicationDate`; a scope other than `national` needs a listed place name inside the excerpt. A row is not evidence; a task that uses it proposes `scientific_context` evidence citing the same locator, which passes the excerpt check again.

## Case analysis configuration

`CaseAnalysisConfig` (configuration version 1, in `packages/contracts`) holds what used to be written into code for one valley, so a new place is configuration: `caseId`; `areaLabel`; `seriesPairs[]` (an ID, sides `a` and `b` each with a label, the metrics, the bundle `methodId` and optional stored decimals, the antecedent `windowsMonths` and `minAlignedMonths`), the only pairs `compare_series` aligns; `rainfallSeason` (ID, label, start and end month, and the `season_summary` recipe ID and version); `explanations[]` (at most 5, each an ID, label and statement); `fieldChecks[]` (ID, label, `method`, `basis` and `separates`, the explanation pairs its result tells apart; each pair names two different configured explanations, once); optional `whenOptionalNotMet` (`"cannot_be_assessed"` or `"consistent"`, the branch status under `merge@2` when every necessary prediction is met and an optional testable one is not); and optional `trendSummary` (`recipe` and `strata[]` for long-record `trend_direction` tests). The Aït Bouguemez configuration is the first: vegetation departure (`monthly_departure`) against CHIRPS rainfall departure (`chirps_monthly_catchment_total`) at 0 to 3 months with 12 aligned months at least (the `aligned_antecedent` applicability minimum), the November to April wet season, five explanations, five field checks (Local Rain Records, Herd Records, Orchard History, Seasonal Calendar, Scene Inspection), `whenOptionalNotMet: "consistent"`, and `restrend_long_record` 1.0.0 over the nine catchment and terrain strata. Which pairs a check separates is a configured judgment, not a result: each valley check is reviewed in [Scientific basis](../explanation/scientific-basis.md) and `research/science/analytics.md`.

## Explanation branches

Added in contracts 1.9.0 (`ExplanationBranch` and `BranchMerge` in [case.schema.json](../../schemas/case.schema.json), snapshot lists `explanationBranchRecords` and `branchMergeRecords`, task kind `explanation_branches`, example [commit-explanation-branches.json](../../schemas/examples/commit-explanation-branches.json)); 1.2.0 to 1.8.0 stay valid. Contracts 1.10.0 adds the field plan, optional `Hypothesis.measurementIds`, `trend_direction` and the component kind below; 1.2.0 to 1.9.0 stay valid.

- **Prediction:** `key` (`p1` to `p4`), `necessary`, `test` and `wording` (at most 300 characters, written by the model; it never decides an outcome). `test` always carries every field, null or `[]` when the kind does not use it: `kind`, `pairId`, `side`, `periodIds` (at most 24), `windowMonths`, `seasonId`, `flag`, `fieldCheckId`, `stratumId`, `trendSeries`, `expected`.

| `kind` | Targets | `expected` |
|---|---|---|
| `departure_sign` | pair, side, periods | `negative` or `positive`: every stored value of the side's metrics in those periods has that sign |
| `co_movement` | pair, window | `same_sign_majority` or `no_same_sign_majority`, under every metric of side `a` |
| `season_category` | season | `below_normal`, `near_normal` or `above_normal` from the configured season recipe |
| `quality_flag` | pair, side, periods, flag | `present` (in any period) or `absent` (in none) |
| `availability` | pair, side, periods | `all_available` or `some_unavailable` |
| `trend_direction` | `stratumId`, `trendSeries` (`unadjusted` or `residual`) | `increasing` (95% interval entirely above zero), `decreasing` (entirely below zero) or `flat` (interval includes zero) from `restrend_long_record` |
| `field_check` | field check | null; only fieldwork can test it |

- **PredictionScore:** `predictionKey`, `outcome` (`met`, `not_met`, `not_testable`), `dataAdequate`, `reasonCode`, `observed` (host text, at most 400 characters), and the `measurementIds` and `dataBundleIds` read. Inadequate data: `value_not_available`, `no_quality_record`, `too_few_aligned_months`, `precondition_not_met`. Not testable: `unknown_target`, `no_series_bundle`, `period_not_in_record`, `area_mismatch`, `no_season_summary`, `season_not_in_summary`, `no_trend_record`, `stratum_not_in_record`, `field_measurement_needed`.
- **ExplanationBranch:** `caseId`, `commandId`, `taskId`, `explanationId`, `label`, `statement`, `status` (`predicted`, `contradicted`, `consistent`, `cannot_be_assessed`), `statusReason`, `predictions` (up to 4), `predictedAt`, `predictionsCaseRevision` (null at revision 1), `scores`, `scoredAt`, `model` (model, prompt version, loop status, validation outcome, failure code, whether a repair turn ran) and `hypothesisId`. IDs are fixed by the task and the explanation, so a resumed task finds its own records.
- **BranchMerge:** `rulesVersion`, `predictionsCaseRevision`, `branches[]` (branch ID and revision, explanation ID, status, reason; 1 to 5) and `conflicts[]` (`separates_nothing`, `not_testable`, `inadequate_data`, each with the test key, the predictions it names and host text).
- **Rules (`merge@1` and `merge@2`):** `contradicted` when a necessary prediction is not met on adequate data, except under `merge@2` a necessary `departure_sign` prediction requires at least 3 evaluated periods (heuristic floor `[D]` reviewed in [Scientific basis](../explanation/scientific-basis.md) and `research/science/analytics.md`) before it can contradict; `consistent` when every testable prediction is met (or under `merge@2` with `whenOptionalNotMet: "consistent"` when all necessary predictions are met and an optional one is not, with the failed optional prediction named in the reason); `cannot_be_assessed` otherwise. Each branch writes one Hypothesis with the matching status (`consistent`, `inconsistent`, `inconclusive`), `supportingEvidenceIds` / `contradictingEvidenceIds` holding only `ev_` evidence IDs (such as the challenged observation), `measurementIds` holding the `meas_` measurement IDs its scores read, and the untestable predictions and field checks as missing evidence.
- **Field plan (contracts 1.10.0, DF-09):** `BranchMerge.fieldPlan`, optional so earlier merges stay valid. Pairs of explanations are open when neither is `contradicted`, or when only one branch stands it is paired with each contradicted branch so a single unresolved branch still receives a field check. `measurements[]` is the smallest set of configured field checks that separates every open pair any check separates, found by exact search, ties to the set earliest in configuration order; each names its `fieldCheckId`, `label`, the open pairs it `separates` and the pairs it `onlySeparates` (never empty, so removing any one leaves a named pair unseparated). `unseparated[]` lists open pairs no configured check separates. Pairs (`ExplanationPair`) are two explanation IDs in code point order. Each unresolved branch's Hypothesis adds one missing-evidence line per chosen check ("Herd Records (herd_records) separates Grazing from Rainfall.") and one for its unseparated pairs.
- **Component kind (contracts 1.10.0):** `explanation_branches` for `CanvasComponent` and `LayoutAction`, binding one command's ExplanationBranch records and their BranchMerge at exact revisions ([component specifications](components.md#cmp-23-explanation-branches-explanation_branches)).

## Context features

Points since contracts 1.6, lines since 1.12 (loaded from the drainage and transect bundles since 1.14) (`ContextFeature` and `ContextGeometry` in [case.schema.json](../../schemas/case.schema.json), example [commit-context-lines.json](../../schemas/examples/commit-context-lines.json)); 1.2.0 to 1.11.0 stay valid. A context feature is something a view draws or a person finds on the land. It is located, never measured, and no statement rests on it.

- **Geometry** (`geometry.type`): `Point` as before (two numbers, no elevation), `LineString` (two or more positions) or `MultiLineString` (one or more lines of two or more positions). A position is `[longitude, latitude]` or `[longitude, latitude, elevation]` in EPSG:4326, GeoJSON order, longitude -180 to 180 and latitude -90 to 90. Elevation is in metres, from -500 to 9000, so a nodata value such as -9999 is refused. A feature has an elevation on every position or on none; a half-elevated line is refused (CF-02).
- **Roles:** `outlet`, `settlement`, `settlement_locator`, `viewpoint` and `summit` are points. `transect` is one `LineString`. `drainage` and `route_proposed` are a `LineString` or a `MultiLineString`. A role with another geometry is refused (CF-01). A `route_proposed` feature is labeled as a proposal with access unconfirmed in its limitations.
- **`streamOrder`** (optional, drainage only, 1 to 12): the Strahler order of every line in the feature. The seed loader writes one drainage feature per order from the asset `drainage_lines` of the drainage bundle (a `MultiLineString` of that order's segments in the asset's order, ids `ctx_drainage_order_<n>`), so a view sets the width and colour of a line by order from the feature alone. Per-segment details stay in the bundle asset `dataBundle` names (CF-03).
- **`dataBundle`** (optional): the `{bundleId, assetKey}` of the bundle asset a line was read from. The seed loader writes it for every line it reads from a bundle, so the asset and the feature can be compared. Since 1.14.0 it may also carry `member`, the asset's own id for the line when the asset holds several lines of one role (a transect id such as `tabant_meridian` or `valley_axis` in `transect_lines`), never the display name; the loader writes one transect feature (`ctx_transect_<id>`) per line of the asset. A feature without one (the points already in a case) was placed by hand or taken from a gazetteer, and says how in `method`.

| Rule | Statement | Enforced |
|---|---|---|
| CF-01 | A role fits its geometry type as listed above | The Zod mirror (`contextFeatureShape`) and the schema's `allOf`, kept equal by a contract test |
| CF-02 | Elevation is on every position of a feature or on none | The Zod mirror (`contextFeatureShape`) |
| CF-03 | Only a drainage feature has a `streamOrder` | The Zod mirror (`contextFeatureShape`) and the schema's `allOf` |

## Instruments

Added in contracts 1.11.0 (`InstrumentSpec` in [case.schema.json](../../schemas/case.schema.json), snapshot list `instrumentSpecRecords`, example [commit-instruments.json](../../schemas/examples/commit-instruments.json)); 1.2.0 to 1.10.0 stay valid. An instrument is one of the workspace's measured views of the valley. An `InstrumentSpec` says what it shows as references to records of the case, so the interface draws only what the record says and holds no fact of its own.

- **Component kinds:** `layer_stack`, `cross_section`, `pixel_anatomy`, `rainfall_scatter` and `field_plan`, for `CanvasComponent` and `LayoutAction`. A component of one of these kinds binds exactly one InstrumentSpec at an exact revision (`entityIds` and `entityVersions` of length 1) and carries the usual section, order, visibility and title. Host code places them; the model proposes none (INST-06).
- **Record:** `id` (prefix `inst_`), `status` (`ready`, or `stale` once a cited record has a newer revision), `parameters`, `caption` and `provenance`. `provenance.inputVersions` pins the exact revision of every bundle, GeoSelection, ContextFeature, Evidence, Measurement, BranchMerge and OperationalAction the spec names, so a changed input makes the spec `stale` in the commit that writes it (DF-03), and the component that binds it with it.
- **References and nothing else.** `parameters` is one closed object per kind, chosen by its `kind` field. A `BundleAssetRef` is `{bundleId, assetKey}`: a bundle and the key of one of its assets (the bundle revision is pinned in `provenance.inputVersions`; the file's checksum is the one the bundle's collection lists). Every other field is the ID of a record, a word from a fixed list, or a list of those. No parameters object has a field for a value, a camera, a scale, a colour, a coordinate, a URL, markup, code, free text or a number, and a contract test reads the schema to prove it. What the viewer changes while looking (the playhead, a month, the sheet in hand, the mixing control) is view state in the URL, not a record.
- **Caption.** `ink` (one sentence, at most 200 characters) states the claim, `grey` (one sentence, at most 240) its limit or scope, `claimKind` is the claim kind of the ink sentence and the interface shows it, and `citationIds` (1 to 8) are the Evidence or Measurement records the numbered chips open, in chip order. A later unit lets the model draft `ink` and `grey` through the numeric provenance and prohibited-claim checks; host code fills the parameters and decides which records may be cited.

Every kind also carries `geoSelectionId`, the area the instrument is about. The other parameters:

| Kind | Shows | Parameters |
|---|---|---|
| `layer_stack` | Data layers as sheets over the relief of the catchment, with the drainage on the land | `relief`; `layers`, 1 to 5 of `{layer, data}` with `layer` one of `vegetation_trend`, `rainfall`, `snow_cover`, `land_cover`, `elevation_bands`, listed top sheet first and numbered in that order; `drainageFeatureIds` (at most 16) and `placeFeatureIds` (at most 32), ContextFeature records; `selectedLayer` or null |
| `cross_section` | The catchment cut along one line, the cut face with the elevation bands, their trends and their snow | `transectFeatureId`, a ContextFeature line; `relief`, `profile`, `bands`, `bandTrends`, `snow`; `drainageFeatureIds`; `placeFeatureIds`; `statements`, 0 to 4 of `{evidenceId, placement}` with `placement` one of `valley_floor`, `upper_slope` |
| `pixel_anatomy` | One coarse satellite pixel opened into the finer cells inside it, their class spectra and the pixel's season series | `locator` (the trend grid), `anatomy` (the asset that names the pixel and holds its cells, spectra and series), `bandSeries`; `contextEvidenceIds` (at most 4), scientific context shown as cited text |
| `rainfall_scatter` | Each season as one point, rain against greenness, with the fit and its gate | `seasons`, `fit` (the bundle's own primary windows are plotted) |
| `field_plan` | The field checks that would tell the open explanations apart, drawn as a proposal | `branchMergeId`; `actionId` or null; `routeFeatureIds` (at most 8), proposed routes as ContextFeature lines |

The ContextFeature lines these kinds name (drainage, a transect, a proposed route) are the line features of [context features](#context-features), added in contracts 1.12.

| Rule | Statement | Enforced |
|---|---|---|
| INST-01 | Every ID in `parameters` and in `caption.citationIds` appears in `provenance.inputVersions` | The commit is refused with `instrument_inputs_not_cited` (`uncitedInstrumentInputs` in `@siterra/domain`) |
| INST-02 | A component of an instrument kind binds exactly one InstrumentSpec, of the same kind, at that spec's current revision | The commit is refused with `instrument_invalid` (`instrumentComponentIssues`) |
| INST-03 | The layers of a `layer_stack` are distinct, and `selectedLayer`, when set, is one of them | The commit is refused with `instrument_invalid` (`instrumentSpecIssues`) |
| INST-04 | Each `assetKey` is listed by the collection of the bundle revision the spec pins, the bundle is in the case and validated, and the file matches the checksum the collection lists | At read time: the instrument listing gives every asset a status, and the key route serves only a verified file |
| INST-05 | `ink` and `grey` are one sentence each, every number in them is in a cited record (numeric provenance), and neither makes a prohibited claim | Planned with the composer |
| INST-06 | The model-facing `propose_layout` offers no instrument kind; a contract test rejects a model-facing schema that does | Planned with the composer |
| INST-07 | Each ID in the parameters is a record of the type its field expects (a ContextFeature for a feature field, an Evidence for a statement) | Planned with the composer |

## Recipe results as Measurements

Added in contracts 1.13.0 (`Measurement.source` and `MeasurementSource` in [case.schema.json](../../schemas/case.schema.json)). An instrument or caption shows a number only by citing a Measurement, so the numbers of a recipe result (a trend, an interval, a share of the area) are Measurements too, each saying where in the bundle it was read.

- **`source`** (optional, so earlier Measurements stay valid): `assetKey` (the key under which the bundle's collection lists the asset), `jsonPointer` (an RFC 6901 pointer to the number in that asset; array positions are part of the pointer), `stratum` (the part of the place, as the bundle names it), `claimKind` (the Evidence claim kinds), `period` (`start` and `end` as `YYYY` or `YYYY-MM`, and `window`, the bundle's own label for a window repeated each year or null) and `lowerJsonPointer` and `upperJsonPointer` (the ends of the interval in `uncertainty`, both present or both null).
- **The loader reads the value.** `data/case/measurement-rows.json` holds one row per number: bundle, asset key, pointer, optional interval pointers, a pointer to the claim kind in the same asset, metric, unit, aggregation, stratum, period, `periodId`, the uncertainty kind and the places the figure is used. A row holds no value. The seed loader opens the asset through the same checksum verification as the read API (the collection must hash to the content hash the case holds and the file to the checksum the collection lists), follows each pointer, and refuses a row whose pointer does not name a finite number or whose claim kind differs from the one the asset states. A refused row is reported and skipped.
- **Not every number has a row.** A number in an asset that states no claim kind has no row, because an unlabelled number does not become a Measurement.
- **Checks.** A test compares each loaded value with the figure the project printed for it (the verified facts and the specimens' provenance), rounded once, half away from zero, to the printed precision, each figure naming its source, so a wrong pointer fails.

| Rule | Statement | Enforced |
|---|---|---|
| MS-01 | `lowerJsonPointer` and `upperJsonPointer` are both present or both null | The Zod mirror (`measurementSourceShape`) and the schema's `allOf`, kept equal by a contract test |
| MS-02 | The value and interval of a Measurement with a `source` are the numbers at its pointers in the asset the bundle lists under `assetKey` | The seed loader (`readMeasurementRows`); a test re-reads every loaded Measurement from the asset |

## Composing instruments

No change to the case contracts. The case analysis configuration gains an optional `instruments[]` ([Case analysis configuration](#case-analysis-configuration), `packages/contracts/src/analysis-config.ts`): rules that say which instruments the case may open and with which records. The composer (`composeInstruments`, `packages/domain/src/instruments-compose.ts`) is deterministic host code; no model writes a spec.

- **Parameter rule** (`from: "parameters"`): `id`, `whenExplanationIds` (the rule opens when the case tests at least one of these explanations, and the configuration must hold each), `parameters` (an `InstrumentParameters` object: IDs, asset keys and fixed words, as in an `InstrumentSpec`) and `caption`: `ink` and `grey` with `{name}` slots, `claimKind`, `citationIds` and `numbers`, a map from each slot to `{measurementId, part (value, lower, upper), decimals}`. No digit is typed in a caption; every number is a slot, written from the cited Measurement rounded once, half away from zero. A slot reads the Measurement's `value`, `lower` or `upper`, its interval `level`, or the first or last year of its `source.period`, or the `sumOf` several Measurements (a documented computation over stored fields), and is written `plain`, `signed` (a plus sign on a positive number), `percent` (a fraction shown as a percent, rounded on its own digits: 0.285 is 29%) or `grouped` (2,317). `holds` lists claims the words make (a part of a Measurement above a bound, such as the lower end of every band's interval above zero): the rule opens only when each holds, so a sentence is never shown beside a record that contradicts it. Every slot has a number, every number and every held Measurement is used and cited.
- **Field plan rule** (`from: "branch_merge"`): `id`, `whenExplanationIds` and an `ink` and `grey` without digits. It opens the field plan of the latest branch merge that has one, and cites the accepted `field_requirement` Evidence of the case.
- **What the composer checks** before it returns a spec: each record the parameters name exists with the right type (area, validated bundle, Evidence, context feature of the right role, branch merge), each asset key is listed by its bundle's manifest and the file matches its checksum, each cited record exists, each slot's Measurement is available, both sentences fit their limits (200 and 240 characters), neither holds a prohibited phrase or a banned word, and the finished spec follows INST-01 and INST-03. A rule that fails is returned as blocked with every reason, and no spec is written for it.
- **In the seed.** The seed loader composes the instruments of the case configuration (`packages/domain/src/cases/case_aitbouguemez.json`) from the records it has just built, so the snapshot carries the specs that are ready (`instrumentSpecRecords`) and `readCaseSeed` returns the blocked rules and their reasons. The valley's captions follow the approved specimens: the layer stack (vegetation trend selected) shows the catchment trend and the share of the area that rises after a false discovery rate check, the cross section the lowest band's trend below its band limit, the pixel anatomy the pixel's own trend and its tree cover and cropland share, and the rainfall scatter the rainfall fit. The valley maps the rainfall explanation to `rainfall_scatter` and `layer_stack`, land use to `pixel_anatomy`, snow or terrain to `cross_section`, and any explanation to a `field_plan` once a branch merge exists.

## Statements of published sources as Evidence

No contract change. `data/case/evidence-statements.json` lists statements of the retrieved sources the instruments cite (SCI-03 and SCI-19 today), and the seed loader writes one `Evidence` record for each: `claimKind` `scientific_context`, `status` `provisional` (no person has reviewed it), `provenance.verificationStatus` `source_checked`, `provenance.sourceLocators` holding each source ID, the locator (`<stored file>, page N`, the 1-based page of the file) and a verbatim excerpt of at most 300 characters, and `provenance.inputVersions` pinning each cited Source revision. A statement says what the source says, never that it holds for the valley today, and its `uncertainty` says so. The loader refuses a statement that cites a source the seed does not hold or did not retrieve.

The excerpts are checked against the stored page text with the same normalisation as the extraction check (Unicode NFC, white space runs collapsed, nothing else folded). That text is a private corpus under restrictive licences and is not in the repository, so `verifyEvidenceExcerpts` runs where the text exists (the contract test reads it from `SITERRA_CORPUS_TEXT_DIR` and is skipped, not passed, elsewhere); a source whose text is missing is reported as unavailable.

## Records planned for later contracts

Not in [case.schema.json](../../schemas/case.schema.json) yet. Each is added in one minor version with Zod mirrors, examples and contract tests before any feature uses it. None is evidence unless stated; all reference exact entity versions.

| Record | Prefix | Purpose | Key rules |
|---|---|---|---|
| Scene | `scene_` | A map view or tour instantiated from a template ([scenes and views](scenes.md)) | `templateId`, `templateVersion`, role bindings to entity versions, bounded parameters, resolved keyframes, `status: ready \| unavailable \| stale`, `origin: default \| user_saved \| model_proposed`. Presentation state, reconstructible from records |
| TranslationRecord | `tr_` | A translation of one statement or brief line ([accessibility and language](accessibility-and-language.md#the-translation-layer)) | Source entity version, source and target language (BCP 47), text, `method: machine_draft \| human_reviewed`, model and request ID for drafts, reviewer role and scope for reviews; stale when the source revision changes |
| AnalogueAssessment | `ana_` | A comparable place ([comparable places](../explanation/comparable-places.md)) | Place and scale, design label from a fixed vocabulary, period, the `scientific_context` evidence it rests on, similarities and differences by named dimension, transfer limits and what it cannot show (both required); no numeric fields outside quoted excerpts |
| ReadingCheck | `chk_` | The second reader's verdict on one evidence statement (ADR-0041) | Evidence version, model, route, `verdict`, `overreach`, reason (240 characters at most); advisory only, never accepts, rejects or edits evidence |
| Illustration | `ill_` | A wordless field-protocol illustration (ADR-0041) | Field-plan step version, model, image hash, checklist result, `reviewStatus: draft \| usable_in_community_material`; badge text fixed; never evidence |

## Tool argument contracts

Model tool calls carry typed proposals, never free-form database writes. Each argument schema is strict and generated from Zod.

| Tool | Arguments (summary) | Server result |
|---|---|---|
| `propose_plan` | `interpretation` (one sentence), `tasks[] {key, kind, question, dependsOn[], inputRefs[]}`, `clarifyingQuestion` or null | Validated task graph or rejection issues |
| `propose_evidence` | `items[] {statement, claimKind, sourceId or measurementIds, locator, excerpt (at most 300 Unicode code points) or null, scopeNote, limitations[]}` | Accepted/provisional evidence IDs |
| `propose_hypotheses` | `items[] {hypothesisId or null, statement, status, supportingEvidenceIds[], contradictingEvidenceIds[], missingEvidence[], assessment}` | Hypothesis revisions + relationships |
| `propose_predictions` | `predictions[] {necessary, test {kind, pairId, side, periodIds[], windowMonths, seasonId, flag, fieldCheckId, stratumId, trendSeries, expected}, wording}`, 2 to 4 per explanation, every field present and nullable | Branch revision 1, committed before any result is read |
| `propose_interventions` | `items[] {title, description, assumptions[], ecologicalConsiderations[], livelihoodConsiderations[], fieldValidationNeeded[], requiredReviewRoles[], evidenceIds[], hypothesisIds[]}` | Intervention IDs |
| `propose_package` | `action {kind, title, description, measurements[], strata[], roles[], permissions[], resources[]}`, `brief {items by section}` | Action and brief IDs (`draft`) |
| `propose_layout` | One to four `actions[] {kind, componentKind, componentId, entityIds[], section, comparisonMode, periodIds[], title}`, every field present and nullable; at most one call per task | Accepted layout action IDs, or rejection with issue paths and the default projection |

Deterministic tools (`read_case`, `search_sources`, `fetch_source`, `read_dataset_manifest`, `summarize_observations`, `compare_series`, `read_event_record`, `compare_events`) return record IDs and values computed by code. They are specified in [Agent orchestration](agent-orchestration.md#tools-and-permissions).

The two event tools (ADR-0045) take model-written arguments that are validated like any other; their results are written by code only.

| Tool | Arguments (strict, every field present and nullable where stated) | Server result |
|---|---|---|
| `read_event_record` | `bundleId` and `bundleRevision` of a validated event bundle registered for this case; `periodIds[]` (one to 24 case period IDs); `eventTypes[]` from the fixed vocabulary (`drought_declaration`, `emergency_program`, `feed_subsidy`, `transhumance_change`, `pasture_rule`, `rainfall_statement`) or null for all | Accepted rows whose event start falls in the periods: row ID, event type, event start and end, scope (`national`, `region`, `province`, `valley`), source ID, locator, verbatim excerpt, source language, model-drafted English statement (a machine-drafted translation only when the source language is not English), stated rainfall direction (`below_normal`, `near_normal`, `above_normal`, `not_stated`); the bundle's manifest counts. Unknown or unvalidated bundle: rejected with `bundle_not_validated` |
| `compare_events` | `eventRowIds[]` (one to 50, returned by `read_event_record` in the same task); `rainfallBundleId` and its revision; `geoSelectionId` and its revision | Per row: `agrees`, `does_not_agree`, `no_matching_period` or `not_applicable` (no stated direction), with the season ID and departure value used, the season recipe ID and version and its near-normal band. Rows and bundles at other revisions are rejected as stale. The model never supplies a departure, a season or a result |

## Observation bundles

An observation bundle is a STAC 1.1.0 static catalog entry: one Collection per bundle (`DataBundle`) and one Item per period (`TemporalObservation` and its `Measurement` records). The bundle manifest is that Collection together with its Items. The format, the `siterra:` fields and the pipeline rules are in [observation preprocessing](observation-preprocessing.md#bundle-output) and [`schemas/stac/siterra-extension.schema.json`](../../schemas/stac/siterra-extension.schema.json); synthetic examples are [stac-collection-ndvi.json](../../schemas/examples/stac-collection-ndvi.json) and [stac-item-ndvi-2022-04.json](../../schemas/examples/stac-item-ndvi-2022-04.json). STAC documents use snake_case; the importer converts to the camelCase records.

The importer accepts a bundle only if every document validates against the STAC 1.1.0 schemas, each extension schema listed in its `stac_extensions` and the Siterra extension schema; every `file:checksum` matches; and the geometry and revisions it names exist in the case. It never computes values.

| Record field | Source in the bundle |
|---|---|
| `DataBundle.id`, `label` | Collection `id`, `title` |
| `DataBundle.status` | `siterra:status` (`validated` or `failed`). `superseded` is set when an imported bundle links this one with rel `predecessor-version`; `missing` and `processing` exist only before a bundle is imported |
| `DataBundle.datasetId`, `datasetVersion` | `siterra:dataset.id`, `siterra:dataset.version` |
| `DataBundle.sourceIds` | `Source` records whose `url` equals the href of a Collection `derived_from` or `license` link |
| `DataBundle.geoSelectionId`, `geoRevision` | `siterra:geo_selection.id`, `.revision`; the GeoSelection geometry must equal the `analysis_geometry` asset |
| `DataBundle.periodIds` | Item IDs |
| `DataBundle.methodId`, `methodVersion` | `siterra:method.id`, `.version` |
| `DataBundle.manifestUri` | Path of `collection.json` on the application origin, `/api/case-assets/<bundle ID>/<content hash>/collection.json` (a URI reference) |
| `DataBundle.contentHash` | SHA-256 multihash of `collection.json`, which pins every Item and asset through their `file:checksum` |
| `DataBundle.license`, `attribution` | Collection `license` (with the `license` link titles when it is `other`); `siterra:attribution` |
| `TemporalObservation.periodId`, `startDate`, `endDateExclusive` | Item `id`; both dates derive from the period ID and must agree with the inclusive STAC `start_datetime` and `end_datetime` (last second of the month) |
| `TemporalObservation.mapAssetUri`, `mapAssetHash`, `mapStatus` | The `overview` asset href resolved under the same origin path, and its `file:checksum`; `mapStatus: missing` when the Item has no `overview` asset |
| `TemporalObservation.qualityFlags` | `siterra:quality_flags` |
| `Measurement.metric`, `value`, `unit`, `aggregation`, `status`, `validPixelCount`, `totalPixelCount` | The matching `siterra:measurements` entry |
| `Measurement.missingReason` | When the measurement is not `available`: the entry's own `missing_reason` (extension 1.1.0), else the Item's `siterra:missing_reason`; with neither, the bundle is refused |
| `Measurement.validFraction` | `siterra:area_valid_fraction`, never `statistics.valid_percent`, which counts every raster value including nodata outside the geometry |
| `Measurement.spatialResolutionM` | Item `raster:spatial_resolution` |
| `Measurement.uncertainty` | `spread` of kind `spatial_iqr` gives kind `spatial_iqr` with its bounds; a null spread gives `not_quantified` |
| `Provenance.dataBundleIds`, `methodId`, `methodVersion` | The Collection `id` and `siterra:method` |

The importer assigns the fields not listed (record IDs, revisions, timestamps, `caseId`, links between the new records) and sets `TemporalObservation.seasonDefinition` to the calendar month that a `period_YYYY-MM` ID denotes. Contract tests validate the STAC examples against the STAC and extension schemas, not against `case.schema.json`.

## HTTP API and event stream

[`schemas/openapi.json`](../../schemas/openapi.json) (OpenAPI 3.2) describes the routes of the [runtime view](../architecture/06-runtime-view.md#api-and-stream): request bodies, responses, the event stream and errors. Response bodies are the records of `case.schema.json`; the description adds only the command and review request bodies, the stream messages, the trace response and problem details.

- Session: One same-origin session cookie (`__Host-session`: Secure, HttpOnly, SameSite=Lax). Ownership is checked on every request; a resource of another session answers 404, exactly like a missing one.
- Commands: `POST /api/cases/{caseId}/commands` returns 202 with the `Command` record. A repeated `idempotencyKey` returns the existing command with 200; the same key with a different body is 422. A behind `expectedCaseRevision` is not an HTTP error: the command ends in `rejected_stale`, reported on the stream.
- Stream: Each persisted event is one Server-Sent Event without an `event` field: `id` is the sequence and `data` is the `Event` record as one line of JSON. `after` sets the cursor; `Last-Event-ID` takes precedence because EventSource reconnects with the original URL. Heartbeats are comment lines about every 15 seconds. When events after the cursor cannot be replayed, the server sends one `event: reset` message without an `id` and closes the stream; the client refetches the snapshot and reconnects after its `lastSequence`. OpenAPI tools do not validate `contentSchema` by default, so contract tests validate every `data` payload against `Event`.
- Cancellation: `POST /api/commands/{commandId}/cancel` returns 202 while the command can still stop and 409 once it is terminal.
- Reviews: `POST /api/cases/{caseId}/reviews` returns 201 with the `ReviewDecision`, 200 for a repeated key, 409 when a reviewed version or the reviewed case revision is no longer current, and 422 when the role cannot record that decision in that mode.
- Trace: `GET /api/cases/{caseId}/trace?commandId=` returns the command's spans (OpenTelemetry GenAI names, allowlisted attributes only) and its events.
- Instruments: `GET /api/cases/{caseId}/instruments` returns the case's InstrumentSpec records as of its current revision, or of `?revision=N` (a whole number from 1 up to the current revision; one the case has not reached is 404), each with the components that bind it and every bundle asset it names resolved against the bundle revision the spec pins. An asset is `available` with its immutable URL, type, checksum and size, or its status says why not: `bundle_not_in_case`, `bundle_not_validated`, `asset_key_unknown` or `file_unavailable` (the collection does not match the bundle's content hash, the file is missing or does not match its checksum, or the server has no bundles folder). Read only and never cached (INST-04).
- Bundle assets by key: `GET /api/cases/{caseId}/bundles/{bundleId}/assets/{assetKey}` serves the file the bundle's collection lists under that key, for the revision of the bundle the case holds, only when the bundle is validated, the collection hashes to its content hash and the file matches the checksum the collection lists. Because the key names the revision the case holds now, the answer is revalidated (`Cache-Control: private, no-cache`); the hash-addressed case-assets route stays the immutable one. HTTP Range is answered as there.
- Errors: Problem details (RFC 9457, `application/problem+json`) with a machine-readable `code` and, for invalid requests, stale versions and refused decisions, the `issues` list of `ValidationResult`.

## Example payloads

| File | Shows |
|---|---|
| [case-snapshot.json](../../schemas/examples/case-snapshot.json) | Snapshot of a case before any measurement exists (missing bundle, null values) |
| [command-commission.json](../../schemas/examples/command-commission.json) | A commission command with explicit context |
| [commit-plan.json](../../schemas/examples/commit-plan.json) | An atomic commit recording a plan task and an evidence gap |
| [event-case-committed.json](../../schemas/examples/event-case-committed.json) | A `case.committed` event |
| [commit-challenge.json](../../schemas/examples/commit-challenge.json) | Drought challenge: hypothesis revisions, relationships and layout actions (synthetic values, clearly labeled) |
| [commit-event-record.json](../../schemas/examples/commit-event-record.json) | An event record bundle with one event record row (contracts 1.3, fictional source) |

Example IDs use the `example` slug. A QA check fails the demo build if any `example` ID or synthetic value reaches the demo database.
