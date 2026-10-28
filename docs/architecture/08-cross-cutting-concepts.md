# Cross-cutting concepts

Rules that hold across every building block. The long normative specifications live in [`docs/reference/`](../reference/); this section states their core and links the owning document, which wins on any detail.

## Case record and revisions

Owner: [data contracts](../reference/data-contracts.md), with [`schemas/case.schema.json`](../../schemas/case.schema.json) as the machine-readable source.

- The case record is authoritative. Map, charts, director, brief and trace are projections of one case revision. A component never holds a fact that is not in a record.
- Records are revised, never silently rewritten. Every entity has `id` and `revision`; derived records cite exact `EntityVersion {entityId, revision}` inputs. A changed input makes dependents `stale`; recomputation creates new revisions.
- One commit, one transaction. A task result becomes a `Commit` (expected case revision, upserts, events, accepted layout actions) applied atomically or not at all. A revision mismatch rebases only if the commit's inputs are unchanged; otherwise the result is marked stale and re-planned. Never last-writer-wins.
- Every claim is typed. `Evidence.claimKind` is one of `observation`, `scientific_context`, `hypothesis`, `model_estimate`, `scenario`, `field_requirement`, `verified_outcome`, and the UI renders the kind on every statement.
- **Numbers come from records**, and **missing is a value** (`missing`, `excluded` or `invalid` with a reason; never zero, never interpolated).
- Estimates carry uncertainty. A `model_estimate` carries an uncertainty kind other than `not_quantified` unless its analysis recipe declares why it cannot. Comparable places are `scientific_context` with an analogy scope note and never change a hypothesis status on their own.
- **Periods are identifiers:** `period_YYYY-MM` for a calendar month (UTC, start inclusive, end exclusive). Chart, map, timeline and brief select periods by this ID only.

Model-facing schemas are generated from the same Zod source and must fit Meta's strict subset; a contract test rejects any that do not. Contract versions are recorded in [CHANGELOG.md](../../CHANGELOG.md).

## State ownership

| State | Where | Notes |
|---|---|---|
| Domain records | PostgreSQL | Case, sources, geometry, bundles, measurements, evidence, hypotheses, relationships, interventions, resources, actions, reviews, briefs, tasks, commands, events |
| Presentation projection | PostgreSQL (components, layout actions) | Reconstructible from domain records |
| View state | URL plus React state | Period, focus, open inspector, camera; shareable and restorable |
| Provider state | Worker checkpoints only | Opaque continuation data expires after the task; never the case database |
| Map and observation assets | Static files under a versioned path on the app origin | Hash-addressed per manifest |

## Model boundary

The adapter normalizes provider streams into `ModelDelta`, `ToolProposal`, `Usage`, `Completed`, `Refused`, `Incomplete` and `Failed`; provider event shapes never leave the adapter. Requests use the Responses API with strict JSON Schema tool arguments; complete arguments are read before parsing; validation is layered as in [agent orchestration](../reference/agent-orchestration.md#validation). Schema-constrained decoding does not replace validation. The platform facts behind these rules, the model access gate and the fallback order are in [architecture constraints](02-architecture-constraints.md#model-platform). Each Meta model has one job and one independent check, every call records model, route, request ID and provider usage, and the model map shown in the product is generated from the routing configuration ([ADR-0041](../decisions/0041-give-each-meta-model-one-job-with-an-independent-check.md)).

## Agent work

Owner: [agent orchestration](../reference/agent-orchestration.md).

- One coordinator plans; bounded task jobs do the work. A task has an input snapshot, a tool allowlist, a typed result, a budget, a deadline, dependencies and a trace; it is not a persona or a conversation.
- Tools are reads, deterministic computations and typed proposals only. Shell, arbitrary code, SQL, filesystem writes, unrestricted browsing, generic HTTP mutation, email or messaging, payments, scheduling, publishing and land-management execution are never exposed.
- Every proposal passes completion, schema, reference, claim-rule, numeric-provenance, prohibited-claim, authority and transition checks before one commit. A rejected domain proposal gets one repair turn; a rejected layout proposal falls back to the default projection without a repair.
- The model never computes numbers. Measurements come from validated bundles; analyses come from a catalog of deterministic recipes precomputed offline, which the model selects, scopes and interprets ([analysis recipes](../reference/analysis-recipes.md)). Every excerpt must match the cited page's extracted text.
- Budgets (rounds per task, tasks per command, concurrent calls, wall clock, spend) are host-enforced; only a human can raise them. Retries cover transient failures only.
- When a measurement, bundle, geometry or summary parameter changes, every record whose provenance cites the old version becomes `stale`, including hypotheses, brief items and review decisions.

## Presentation and AI composition

Owners: [UX architecture](../reference/ux-architecture.md#ai-composition-contract), [data contracts](../reference/data-contracts.md#presentation-contract), [components](../reference/components.md).

The model proposes typed layout actions over a fixed component catalog; the server validates the whole proposal and a deterministic reducer applies it inside the commit. The model chooses which components a result needs, which records they bind, the comparison mode, the title and the focus when the user's own command completes; it never supplies coordinates, sizes, CSS, markup, code or URLs. Cross-record rules PRES-01 to PRES-07 are enforced by the commit validator. Layout state is reconstructible from records, so deleting presentation records loses nothing scientific. Composition changes apply immediately only when they complete the user's latest command and the pointer and keyboard focus are outside the affected section; otherwise they wait behind "View new findings (n)" (hold and release).

Map scenes follow the same pattern: reviewed, case-agnostic templates that the model may only select and bind, validated before they play ([scenes and views](../reference/scenes.md)).

## Trace

Domain events ([data contracts](../reference/data-contracts.md#events)) are the public trace and stream contract. The worker also writes internal span rows (trace = command; spans for workflow, plan, task, model call, tool call, validation and commit) named after the OpenTelemetry GenAI conventions so a later exporter needs no renaming, for example `chat <model>`, `execute_tool compare_series`, `invoke_agent source_research`. Pin the convention revision in one module because the conventions have Development status. No OTel SDK or collector in P0; content attributes (prompts, messages, tool arguments) are never stored in spans. Naming detail: [observability](../../research/technology/observability.md).

Event messages are rendered by host templates, never by the model. The [evaluation harness](../reference/evaluation.md) scores model work with the production validators, and the trace shows per-command quality checks from real events.

## Failure behavior

Provider outage keeps the last valid case and offers retry; missing datasets produce blocked tasks with the named dependency; revision conflicts trigger re-plan, never overwrite; a lost queue message is recovered from the outbox; a changed input stales dependents ([agent orchestration](../reference/agent-orchestration.md#state-retry-and-recovery)); stream gaps trigger a snapshot refetch.

## Human review and authority

Owner: [human review and authority](../reference/review-and-authority.md).

Autonomy is scoped to investigation and preparation, and tool permissions enforce the boundary; wording in a prompt is insufficient. Reviews are separate per role (scientific, community and livelihood, program), bound to a case revision and exact entity versions, and stored apart from generated artifacts. In the demonstration every decision carries `mode: demo` and cannot satisfy a real authorization. Operational actions end at `prepared`, with `externalExecutionEnabled: false`. A material change marks dependent approvals stale. The six required failure checks are acceptance tests SA-01 to SA-06.

## Security and privacy

- Same-origin secure HttpOnly session cookies; ownership checked on every request, including the stream and static case assets.
- Credentials live in a secret store, never in files; the deployed worker and local development use separate model keys.
- Retrieved text is untrusted evidence: it can never change tools, permissions or instructions. The P1 `fetch_source` proxy blocks private networks and redirects to them.
- No API keys, bearer tokens, raw system prompts or hidden reasoning reach events or logs shipped to the browser (TR-03).
- Public fixtures and Git history carry no household locations, names, phone numbers, field notes, disputed boundaries, consent records or access-sensitive site details. Example IDs use the `example` slug, and a QA check keeps them out of the demo database (SA-09).
- Only Standard model mode is used, never Contributor mode. While the hackathon credits are in use, Meta may use what Siterra sends for product improvement ([ADR-0047](../decisions/0047-use-the-hackathon-credits-and-send-no-personal-or-confidential-data.md)), so model requests carry no personal or confidential data.

## Observations and provenance

Owners: [observation preprocessing](../reference/observation-preprocessing.md), [data sources and reproducible methods](../reference/data-sources-and-methods.md), [`schemas/stac/siterra-extension.schema.json`](../../schemas/stac/siterra-extension.schema.json) with the [bundle output profile](../reference/observation-preprocessing.md#bundle-output).

Observations are precomputed offline from a frozen, versioned geometry (the valley catchment as `hydrological_unit`) and published as frozen, checksummed bundles, described as a STAC 1.1.0 static catalog with a `siterra:` extension for fields without a standard home ([ADR-0028](../decisions/0028-describe-observation-bundles-as-a-stac-catalog.md)). The method deduplicates and harmonizes Sentinel-2 inputs, masks before computing NDVI, keeps per-pixel valid counts, applies a coverage policy whose failures render as gaps, compares against a short same-month reference period, and keeps rainfall at its native CHIRPS grid. Each measurement carries geometry, dataset, scene or file IDs, method and parameters, units, valid counts, reference period, uncertainty kind, software hashes, checks and attribution; attribution strings travel into map legends and exports. Map display rasters and numeric manifests are separate products.

## Design system

Owner: [design system](../reference/design-system.md), with tokens in [`design/tokens/siterra.tokens.json`](../../design/tokens/siterra.tokens.json).

The direction is mineral relief, field precision: the relief map is always present, panels are opaque, one accent serves interaction, data palettes are reserved for data, and status uses an icon plus words. Every statement shows its claim kind as glyph plus words; missing data is drawn (hatching, dashed outlines, plain sentences), never hidden. Type is IBM Plex (Sans, Condensed, Mono for identifiers). Colors are computed for a dark default and a full light theme from contrast targets ([ADR-0042](../decisions/0042-compute-the-color-system-for-dark-and-light-themes.md)); the stylesheet is generated from the tokens, and raw color values outside the token definitions fail lint (VC-01). Copy follows the [voice and tone](../reference/voice-and-tone.md) guide, and a copy lint runs on interface strings in CI and on model-written fields before commit (VC-06, [ADR-0043](../decisions/0043-write-in-one-plain-voice-and-lint-product-copy.md)).

## Accessibility and language

Owner: [accessibility and language](../reference/accessibility-and-language.md).

The target is WCAG 2.2 AA, a target and not a conformance claim. The complete commission, inspect, challenge, compare, prepare, review and return flow must work with a keyboard and without voice, drag gestures or terrain rendering; neither a moving camera nor a WebGL surface may be the only way to locate or understand evidence. Charts carry text summaries and tables; reduced motion removes camera flights and large spatial animation. The interface is English with typed commands in P0, built translation-ready (externalized strings, locale-aware formats, recorded source language, right-to-left capable layout); machine-drafted translations are labeled and need local review ([ADR-0034](../decisions/0034-build-translation-ready-and-ship-french-first.md)). Voice is a P1 stretch through the same command contract.
