# Data contracts

Status: implementation contract v1.5, 2026-10-27. Machine-readable source of truth: [schemas/case.schema.json](../../schemas/case.schema.json) (JSON Schema 2020-12). Examples: [schemas/examples/](../../schemas/examples/). This document owns cross-record semantics that a JSON Schema cannot express. [Orchestration](agent-orchestration.md) owns jobs and tools; [review](review-and-authority.md) owns authority.

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
| `erow_` | EventRecordRow | | |

**Periods** are identifiers, not records: `period_YYYY-MM` for a calendar month (UTC, start inclusive, end exclusive). Chart, map, strip and brief select periods by this ID only. Server-generated IDs use a ULID suffix; fixtures may use readable slugs. IDs never contain the product name.

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
| OperationalAction | Prepared real-world work | `externalExecutionEnabled: false` (constant in P0). Terminal P0 state is `prepared`. |
| ReviewDecision | A role-scoped decision on exact versions | `mode: demo \| real`; `authorityStatus: not_established \| verified_for_scope`. Demo decisions can never satisfy a real authorization. |
| Brief | The decision brief | Every line is a `BriefItem` with claim kind and evidence IDs. |
| EventRecordRow | One dated event in a validated event bundle ([ADR-0045](../decisions/0045-extend-the-meta-model-map-to-event-records-figures-and-whole-corpus-reading.md)), added in contracts 1.3 | Not evidence. Rules in [event record rows](#event-record-rows). |
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
| `task.queued`, `task.started`, `task.progress`, `task.awaiting_input`, `task.succeeded`, `task.partial`, `task.failed`, `task.cancelled` | Task lifecycle | `task.progress` only for real milestones (counts of loaded records, sources retrieved) |
| `model.started`, `model.completed` | Each model request | `usage`: model, input/output/cached tokens, cost estimate, provider request ID, status `succeeded \| refused \| incomplete \| failed`, duration |
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

- `CanvasComponent.componentKind` is one of the catalog entries in [component specifications](components.md#catalog-bindings). It binds exact `entityVersions` and lives in a `section: place | observations | explanations | responses | next_steps`; `visibility: expanded | collapsed | hidden`.
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

## Records planned for later contracts

Not in [case.schema.json](../../schemas/case.schema.json) yet. Each is added in one minor version with Zod mirrors, examples and contract tests before any feature uses it. None is evidence unless stated; all reference exact entity versions.

| Record | Prefix | Purpose | Key rules |
|---|---|---|---|
| Scene | `scene_` | A map view or tour instantiated from a template ([scenes and views](scenes.md)) | `templateId`, `templateVersion`, role bindings to entity versions, bounded parameters, resolved keyframes, `status: ready \| unavailable \| stale`, `origin: default \| user_saved \| model_proposed`. Presentation state, reconstructible from records |
| ContextFeature | `ctx_` | A point or line that scenes need (viewpoint, river main stem, summit, settlement) | Geometry, role, dataset, method, attribution and license; never evidence |
| TranslationRecord | `tr_` | A translation of one statement or brief line ([accessibility and language](accessibility-and-language.md#the-translation-layer)) | Source entity version, source and target language (BCP 47), text, `method: machine_draft \| human_reviewed`, model and request ID for drafts, reviewer role and scope for reviews; stale when the source revision changes |
| AnalogueAssessment | `ana_` | A comparable place ([comparable places](../explanation/comparable-places.md)) | Place and scale, design label from a fixed vocabulary, period, the `scientific_context` evidence it rests on, similarities and differences by named dimension, transfer limits and what it cannot show (both required); no numeric fields outside quoted excerpts |
| ReadingCheck | `chk_` | The second reader's verdict on one evidence statement ([ADR-0041](../decisions/0041-give-each-meta-model-one-job-with-an-independent-check.md)) | Evidence version, model, route, `verdict`, `overreach`, reason (240 characters at most); advisory only, never accepts, rejects or edits evidence |
| Illustration | `ill_` | A wordless field-protocol illustration ([ADR-0041](../decisions/0041-give-each-meta-model-one-job-with-an-independent-check.md)) | Field-plan step version, model, image hash, checklist result, `reviewStatus: draft \| usable_in_community_material`; badge text fixed; never evidence |

## Tool argument contracts

Model tool calls carry typed proposals, never free-form database writes. Each argument schema is strict and generated from Zod.

| Tool | Arguments (summary) | Server result |
|---|---|---|
| `propose_plan` | `interpretation` (one sentence), `tasks[] {key, kind, question, dependsOn[], inputRefs[]}`, `clarifyingQuestion` or null | Validated task graph or rejection issues |
| `propose_evidence` | `items[] {statement, claimKind, sourceId or measurementIds, locator, excerpt (at most 300 Unicode code points) or null, scopeNote, limitations[]}` | Accepted/provisional evidence IDs |
| `propose_hypotheses` | `items[] {hypothesisId or null, statement, status, supportingEvidenceIds[], contradictingEvidenceIds[], missingEvidence[], assessment}` | Hypothesis revisions + relationships |
| `propose_interventions` | `items[] {title, description, assumptions[], ecologicalConsiderations[], livelihoodConsiderations[], fieldValidationNeeded[], requiredReviewRoles[], evidenceIds[], hypothesisIds[]}` | Intervention IDs |
| `propose_package` | `action {kind, title, description, measurements[], strata[], roles[], permissions[], resources[]}`, `brief {items by section}` | Action and brief IDs (`draft`) |
| `propose_layout` | One to four `actions[] {kind, componentKind, componentId, entityIds[], section, comparisonMode, periodIds[], title}`, every field present and nullable; at most one call per task | Accepted layout action IDs, or rejection with issue paths and the default projection |

Deterministic tools (`read_case`, `search_sources`, `fetch_source`, `read_dataset_manifest`, `summarize_observations`, `compare_series`, `read_event_record`, `compare_events`) return record IDs and values computed by code. They are specified in [Agent orchestration](agent-orchestration.md#tools-and-permissions).

The two event tools ([ADR-0045](../decisions/0045-extend-the-meta-model-map-to-event-records-figures-and-whole-corpus-reading.md)) take model-written arguments that are validated like any other; their results are written by code only.

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
| `DataBundle.manifestUri` | URI of `collection.json` |
| `DataBundle.contentHash` | SHA-256 multihash of `collection.json`, which pins every Item and asset through their `file:checksum` |
| `DataBundle.license`, `attribution` | Collection `license` (with the `license` link titles when it is `other`); `siterra:attribution` |
| `TemporalObservation.periodId`, `startDate`, `endDateExclusive` | Item `id`; both dates derive from the period ID and must agree with the inclusive STAC `start_datetime` and `end_datetime` (last second of the month) |
| `TemporalObservation.mapAssetUri`, `mapAssetHash`, `mapStatus` | The `overview` asset href and `file:checksum`; `mapStatus: missing` when the Item has no `overview` asset |
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
