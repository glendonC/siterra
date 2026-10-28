# Solution strategy

The fundamental choices that shape Siterra: the stack, the technology for each layer, and the approaches that serve the quality goals. ADR numbers resolve in the [decision log](../decisions/README.md); version pins and the constraints behind them are in [architecture constraints](02-architecture-constraints.md#pinned-versions).

## The stack

A guided React investigation workspace with one persistent MapLibre map, a durable PostgreSQL case record that every view projects, a separate Node worker that runs bounded agent tasks against the Meta model, and offline Python preprocessing for satellite and climate data. The rationale is [ADR-0016](../decisions/0016-adopt-the-typescript-react-maplibre-postgresql-stack.md).

## Technology choices

| Layer | Choice | Role and boundary |
|---|---|---|
| Runtime | Node 24 LTS | Same major version on the host and locally |
| Web | Next.js App Router, React, TypeScript | UI, API routes and SSE in one application |
| Styling and controls | Tailwind CSS; owned shadcn/ui components on Base UI primitives; Lucide icons | Tokens from [`siterra.tokens.json`](../../design/tokens/siterra.tokens.json) mapped into Tailwind `@theme`; which components to install, adapt, study or avoid is [ADR-0044](../decisions/0044-build-the-interface-on-shadcn-with-base-ui-and-mit-components.md) |
| Motion | Motion (`motion/react`) | Layout and shared-element transitions inside the investigation sheet only ([motion](../reference/motion.md)) |
| Map | MapLibre GL JS with PMTiles; `maplibre-contour` (P0) | One map instance |
| Charts | Observable Plot | Explicit scales, facets for aligned panels, gaps, annotations; one renderer only |
| Server state | TanStack Query | Snapshot fetch and cache; the case record stays authoritative |
| Contracts | Zod | Mirrors [`schemas/*.schema.json`](../../schemas/); model-facing schemas are exported from the same source |
| Database | Managed PostgreSQL, `pg`, plain SQL migrations | Case, records, commands, events, spans, outbox, review records |
| Jobs | pg-boss in a persistent worker process | Durable delivery and retries on the same database |
| Model transport | `openai` Node SDK pointed at `https://api.meta.ai/v1` | Transport only; the provider is Meta |
| Science | Python with `uv`, offline | Outputs validated STAC bundles per the [bundle output profile](../reference/observation-preprocessing.md#bundle-output) and precomputed analysis recipe results; no live Python service in P0 |
| Tests | Vitest, Playwright | Unit, contract and end-to-end acceptance |
| Fonts | Self-hosted IBM Plex Sans, Sans Condensed and Mono; later IBM Plex Sans Arabic and Noto Sans Tifinagh | All OFL-1.1 |

Do not add tldraw, an agent framework, Redis, a second queue, a vector database or a live Python service without a demonstrated unmet requirement.

## Approaches

| Approach | Why | Decision |
|---|---|---|
| The case record is authoritative; all views are projections bound to exact revisions | Consistency, replay, staleness | [ADR-0012](../decisions/0012-treat-the-case-record-as-authoritative.md) |
| Contracts in JSON Schema, mirrored in Zod | Parallel lanes need fixed contracts | [ADR-0013](../decisions/0013-define-contracts-in-json-schema-mirrored-in-zod.md) |
| One coordinator plus bounded task jobs; read and deterministic tools only; proposals as structured final outputs; layered validators including numeric provenance and excerpt verification | Real autonomy without fabricated numbers | [ADR-0014](../decisions/0014-run-one-coordinator-with-bounded-task-jobs.md) |
| Meta-first model: `muse-spark-1.3` on the Responses API, `store: false`, strict structured output, with an ordered fallback chain | Platform verified; the event rules weight Meta tooling at 25% | [ADR-0015](../decisions/0015-use-a-meta-model-through-the-responses-api.md) |
| Observations precomputed offline and reproducible; planning, reading, comparison and composition live; precomputed and live labeled | Reliability without fake autonomy | [ADR-0021](../decisions/0021-precompute-observations-and-run-investigation-work-live.md) |
| Analyses as a catalog of deterministic, precomputed recipes that the model selects, scopes and interprets but never computes | Analytical depth with every number reproducible and every method reviewable ([analysis recipes](../reference/analysis-recipes.md)) | [ADR-0036](../decisions/0036-run-analyses-as-declarative-precomputed-recipes.md) |
| Catalog-constrained AI composition: the model proposes typed layout actions over a fixed catalog; a deterministic reducer applies them; the default projection applies if a proposal is rejected | Generative composition without generated code | [ADR-0007](../decisions/0007-constrain-ai-composition-to-a-component-catalog.md) |
| A guided investigation workspace: a full-bleed relief map with floating islands, five fixed sections, a timeline and a director; no infinite canvas and no chat-first surface | Clarity, geography, traceability, accessibility, build risk | [ADR-0006](../decisions/0006-use-a-guided-adaptive-investigation-workspace.md), [ADR-0040](../decisions/0040-present-the-investigation-as-floating-islands-over-a-full-bleed-map.md) |
| Map scenes from reusable, case-agnostic templates; the model chooses and binds a template, never writes code or style JSON | Reuse across cases, safety, reproducibility ([scenes and views](../reference/scenes.md)) | [ADR-0035](../decisions/0035-compose-map-scenes-from-reusable-templates.md) |
| Domain events are the public trace; internal spans follow OpenTelemetry GenAI naming; no OTel SDK or Langfuse in P0 | Honest, inspectable work without extra infrastructure | [ADR-0019](../decisions/0019-use-domain-events-as-the-public-trace.md) |
| Role-specific review; demo mode labeled everywhere; actions end at "prepared"; no outbound tools exist | Authority is outside the application | [ADR-0024](../decisions/0024-require-role-specific-review-with-no-outbound-actions.md) |
| Self-hosted regional map bundle; no third-party tile server at demo time | Licensing and uptime | [ADR-0018](../decisions/0018-self-host-the-regional-map-bundle.md) |
| Railway hosting for web, worker and PostgreSQL, with Render as fallback | A persistent worker and SSE within verified limits | [ADR-0017](../decisions/0017-host-on-railway-with-render-as-fallback.md) |
| An in-repository evaluation harness scores model work with the production validators | Reliability claims need measurement ([evaluation harness](../reference/evaluation.md)) | [ADR-0038](../decisions/0038-measure-ai-work-with-an-evaluation-harness.md) |
| tldraw, Naïve and other agent runtimes, multi-case features, arbitrary polygons and generated UI code stay out of the critical path | Cost and risk without case value | [ADR-0020](../decisions/0020-keep-tldraw-and-generated-ui-out-of-the-critical-path.md) |

How these approaches map to the quality goals is in [quality requirements](10-quality-requirements.md).
