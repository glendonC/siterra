# Architecture constraints

Conditions the design must accept: the Meta model platform and its access gate, the event rules on Meta tooling, pinned versions, hosting limits, browser requirements, and the project's organizational rules and conventions. `TECH-*` IDs resolve in the [technology source register](../../research/technology/source-register.md).

## Model platform

Verified platform facts (TECH-03 to TECH-10, TECH-30 to TECH-34) and the resulting adapter rules [D]:

| Fact [V] | Adapter rule |
|---|---|
| Base URL `https://api.meta.ai/v1`, team-scoped bearer key; `muse-spark-1.3` is the recommended Standard model (1,048,576-token context); Responses is the recommended API | Use `muse-spark-1.3` on Responses; model ID in configuration; separate keys for deployed worker and local development |
| `store` defaults to `true` | Always send `store: false` with `include: ["reasoning.encrypted_content"]`; replay function call and output pairs exactly within the task loop |
| `text.format` json_schema output is always schema-constrained; strict subset: root plain object, no `oneOf`/`allOf`, `anyOf` only below root, every object closed and fully required, no recursion | Every task's final proposal is a `text.format` structured output generated from Zod; model-facing schemas pass a contract test for the subset |
| `tool_choice` must be `"auto"`; parallel tool calls default on; arguments "not guaranteed to validate" | Function tools are only for reads and deterministic computation; the proposal is the structured final output, not a forced tool call; validate everything |
| Errors: retry 429, 500, 503 with backoff and `Retry-After`; do not retry 400 to 404 or 413; do not blindly retry a non-streaming 504 | Stream every call; first-event and inactivity timeouts (not a total timeout); retry policy per error type in [agent orchestration](../reference/agent-orchestration.md#state-retry-and-recovery) |
| Spark Standard USD 1.25 in, 4.25 out, 0.15 cached per million tokens; web search 2.50 per thousand; 3,000 RPM and 4M TPM per team; no hard spend cap, only an email alert | Application budgets are the only hard stop; set the account alert on day 1 |
| Standard mode is not used for training; Contributor mode is and must not receive personal or confidential data. While free credits are in use, the account's Billing page says content may be used for product improvement (seen 28 Oct 2026) | Standard mode only, never Contributor mode; while the hackathon credits are in use, requests carry no personal or confidential data ([ADR-0047](../decisions/0047-use-the-hackathon-credits-and-send-no-personal-or-confidential-data.md)) |
| `GET /v1/status` is public | Pre-demo health check, not proof of account access |

How the adapter uses these rules is in [cross-cutting concepts](08-cross-cutting-concepts.md#model-boundary).

## Model access gate

Live model work depends on GATE-01 in the [delivery plan](../project/delivery-plan.md#gates): a server-side authenticated call; `muse-spark-1.3` listed for the team; strict structured output; `store: false` with encrypted reasoning replay across one tool round trip; streamed events to completion; refusal and error handling; usage captured. The checks are one script run with the key from the environment; one run makes three billed calls, about USD 0.01 at list prices with an upper bound near USD 0.02 (rejected requests assumed unbilled [U]). A refusal is not provoked on purpose, so refusal handling is tested against a recorded event sequence. Access is unverified until these checks pass [U].

Fallbacks, in order: another Standard Spark revision through the same tests; then Muse Spark Open (Meta's open-weight release) through a documented hosting provider, as a separately labeled model with its own adapter tests and Chat Completions transport (TECH-32); then a labeled replay of recorded outputs. Llama API is not a fallback (TECH-33). No silent substitution, and never another model family.

## Meta capabilities used

The event's official rules weight "Use of Meta AI tooling" at 25% and reward going beyond a basic integration (TECH-29). Every use below must improve the case and carry a deterministic cross-check, or it is not built.

| Capability | Use in Siterra | Cross-check | Priority |
|---|---|---|---|
| Muse Spark reasoning with strict structured output and tools | Planning, extraction, hypothesis comparison, interventions, package and layout proposals | Layered validators, numeric provenance, claim rules | P0 |
| Muse Spark PDF input | Reads source papers in their original language (key agdal literature is in French) and returns located statements with verbatim excerpts; Siterra writes English statements labeled as machine-drafted translations | Each excerpt must match the document's extracted text at the stated page | P0 |
| Muse Spark image understanding | Visual quality review of monthly true-color thumbnails (snow, cloud, shadow) | Compared with Scene Classification fractions; disagreements become visible quality flags, never measurements | P1 |
| Muse Voice Transcribe | Push-to-talk director input: transcript shown, editable, then submitted through the same command contract | User confirms the transcript; typed path always available | P1 stretch |
| Search grounding | Discovers newer sources as leads, including French and Arabic reports for the event record | Lead becomes evidence only after retrieval and excerpt verification against stored text; search snippets never count | P1 |
| Muse Spark reading for the minimum event record ([ADR-0045](../decisions/0045-extend-the-meta-model-map-to-event-records-figures-and-whole-corpus-reading.md)) | Dated drought, subsidy and rainfall statements from the stored text of the English FAO GIEWS Morocco archive (SCI-25), national scope, no search, built at setup into a validated event bundle shown in the drought challenge | Excerpt, date and scope rules in host code; rainfall direction against the catchment record; sampled human review (EV-06) | P0 |
| Muse Spark multilingual reading for the event record extension | French and Arabic reports found through search grounding, added to the same bundle with the same checks | As above | P1 |
| Muse Spark spatial grounding | Points at printed place labels on a published figure so code can place the figure on the valley | Gazetteer fit by code with leave-one-out error and a threshold fixed before the run (EV-07) | P1 |
| Muse Spark long context | The whole corpus text in one request to find conflicting statements | Both excerpts verbatim; a person accepts | P1 |
| Segment Anything on video | Snow masks across monthly composites | Agreement with scene classification against a fixed threshold (EV-08); never a measurement | P1 experiment |
| Segment Anything (hosted on Model API) | Candidate mask of irrigated fields on the valley floor to exclude cropland from rangeland statistics | Agreement with ESA WorldCover 2021 reported; mask is labeled model-derived | P2 |
| Muse Glimmer 30B, open weights, run locally from a pinned artifact | Second reader: flags English statements that say more than their original excerpt | Gold-set metrics against human labels (EV-05); flags are advisory and only route items to a reviewer | P1 |
| Muse Image | Wordless illustrations of field-protocol steps, search and shell off | Spark image checklist; community and livelihood review before community use; labeled as illustration | P1 |
| Muse Wonder | Critique of the decision brief before review | A person accepts or dismisses each note | P2 |

The full model map, with one job and one independent check per model, is [ADR-0041](../decisions/0041-give-each-meta-model-one-job-with-an-independent-check.md). Two platform limits shape the adapter: a PDF contributes text from its first 100 pages and page images from its first 50 only, so long sources are sent in page ranges and token-counted before their first read; and the local Glimmer route did not enforce a JSON schema in one smoke test, so its output goes through the shared parser with one repair turn. The Glimmer route uses the same OpenAI-compatible Chat Completions adapter as the Muse Spark Open fallback; a local model server is never exposed to the internet ([Meta models research](../../research/technology/meta-models.md)).

## Pinned versions

The stack itself is described in the [solution strategy](04-solution-strategy.md#technology-choices); its rationale is [ADR-0016](../decisions/0016-adopt-the-typescript-react-maplibre-postgresql-stack.md). Pins:

| Layer | Pins |
|---|---|
| Runtime | Node 24 LTS (24.22.1 or later) |
| Web | Next.js 16.4.1 (App Router), React 19.3.1, TypeScript 6.0.3 |
| Styling and controls | Tailwind CSS 4.3.3 with `@tailwindcss/postcss`; shadcn/ui components via `npx shadcn@4.21.4`, initialized with Base UI (`--base base`, [ADR-0044](../decisions/0044-build-the-interface-on-shadcn-with-base-ui-and-mit-components.md)); Lucide 1.55.0 |
| Motion | `motion` 14.1.0 (`motion/react`) |
| Map | `maplibre-gl` 6.14.0, `pmtiles` 4.5.0, `maplibre-contour` 0.1.1 (P0) |
| Charts | `@observablehq/plot` 0.6.17 |
| Server state | `@tanstack/react-query` 5.104.2 |
| Contracts | `zod` 4.6.7 |
| Database | PostgreSQL 13+ (managed), `pg` 8.23.1 |
| Jobs | `pg-boss` 12.37.1 |
| Model transport | `openai` 7.32.0 |
| Science | Python 3.12 or 3.13 with `uv`; pipeline package pins in [analysis recipes](../reference/analysis-recipes.md#pipeline-tooling) |
| Tests | `vitest` 5.0.4 (+ `vite` 8.3.4), `@playwright/test` 1.64.0 |
| Fonts | `@fontsource-variable/ibm-plex-sans` 5.3.0, `@fontsource/ibm-plex-sans-condensed` 5.3.0, `@fontsource/ibm-plex-mono` 5.3.0; later `@fontsource/ibm-plex-sans-arabic` and `@fontsource/noto-sans-tifinagh` 5.3.0 |

Constraints behind the pins ([stack versions](../../research/technology/stack-versions.md)):

- Node 24 meets every engine floor in the set; Node 20 does not.
- Next.js 16.4.1 is a security floor: 16.0 to 16.4.0 have critical advisories.
- TypeScript 7 lacks the compiler API that typescript-eslint needs, so the pin stays on 6.
- MapLibre GL JS 6 is ESM-only and needs WebGL2; set the worker URL as in the official Next.js snippet. Versions up to 6.4.0 carry a critical advisory; 6.14.0 is clear.
- Zod has a security floor at 4.6.6. Model-facing schemas are exported with `z.toJSONSchema` using `cycles: "throw"`, inline reuse, `.nullable()` not `.optional()`, and no `oneOf`/`allOf`.
- pg-boss requires PostgreSQL 13 or later.
- The pipeline needs Python 3.12 or later for rasterio, and ruptures lacks Python 3.14 support ([analysis recipes](../reference/analysis-recipes.md#pipeline-tooling)).
- All font packages are OFL-1.1 (verified on npm); the variable Plex Sans package gives the 450 weight.

Pins follow a two-week rule with security overrides. Re-run `npm view` before writing the lockfile; run `npm audit` after the first install.

## Hosting limits

- Railway: HTTP requests, including SSE, run up to 15 minutes while data flows and close after 5 minutes idle, so the 15-second heartbeat and `Last-Event-ID` reconnect are required, not optional (TECH-50).
- An unverified limited Railway trial restricts outbound network, which would block `api.meta.ai`; do not deploy on the trial.
- Render allows responses up to 100 minutes (TECH-51).
- Vercel cannot host the worker (function duration limits, no persistent process; Hobby is non-commercial) (TECH-53). Fly.io managed Postgres pricing ruled it out (TECH-52).
- Behind any proxy, disable response buffering on the SSE route (`X-Accel-Buffering: no`) (TECH-54).

The chosen deployment is in the [deployment view](07-deployment-view.md).

## Product boundaries

These decisions constrain every building block. Each is a decision record in the [decision log](../decisions/README.md).

- The case record is authoritative; every view is a projection bound to exact revisions ([ADR-0012](../decisions/0012-treat-the-case-record-as-authoritative.md)).
- Tools are read-only or deterministic; no outbound email, messaging, payment, publishing or land-management integration exists, and actions end at "prepared" ([ADR-0014](../decisions/0014-run-one-coordinator-with-bounded-task-jobs.md), [ADR-0024](../decisions/0024-require-role-specific-review-with-no-outbound-actions.md)).
- No model-generated executable UI: the model proposes typed layout actions over a fixed catalog ([ADR-0007](../decisions/0007-constrain-ai-composition-to-a-component-catalog.md), [ADR-0020](../decisions/0020-keep-tldraw-and-generated-ui-out-of-the-critical-path.md)).
- No causal diagnosis, biomass, carrying capacity, forecasts, household numbers or consent claims ([ADR-0023](../decisions/0023-prohibit-causal-diagnosis-and-outcome-claims.md)).
- Observations are precomputed offline; planning, reading, comparison and composition run live, and each is labeled ([ADR-0021](../decisions/0021-precompute-observations-and-run-investigation-work-live.md)).
- English typed commands are P0; voice is a P1 stretch through the same command contract ([ADR-0011](../decisions/0011-ship-typed-english-commands-before-voice.md)).

## Organizational constraints

- The build runs as parallel lanes, each owning its directories; shared root files belong to the platform lane ([delivery plan](../project/delivery-plan.md#lanes-and-ownership)).
- Gates, the day plan, priorities and stop rules are in the [delivery plan](../project/delivery-plan.md).
- Spending on any plan or account is the founder's decision. The maintainer chooses the project license and approves publication.
- Public implementation requirements must be complete without private notes; placement rules are in [CONTRIBUTING.md](../../CONTRIBUTING.md).

## Conventions

- Contracts are JSON Schema 2020-12 files in [`schemas/`](../../schemas/), mirrored in Zod ([ADR-0013](../decisions/0013-define-contracts-in-json-schema-mirrored-in-zod.md)); versions follow Semantic Versioning and are recorded in [CHANGELOG.md](../../CHANGELOG.md).
- The HTTP API and event stream are described in OpenAPI 3.2 ([ADR-0031](../decisions/0031-describe-the-http-api-and-event-stream-with-openapi.md)); observation bundles as a STAC 1.1.0 static catalog ([ADR-0028](../decisions/0028-describe-observation-bundles-as-a-stac-catalog.md)); design tokens in the DTCG Format 2025.10 ([ADR-0029](../decisions/0029-store-design-tokens-in-the-dtcg-format.md)); the bibliography in CSL-JSON ([ADR-0030](../decisions/0030-keep-the-bibliography-in-csl-json.md)); licensing with REUSE 3.3 and SPDX identifiers ([ADR-0032](../decisions/0032-declare-licensing-with-reuse-and-spdx.md)).
- Architecture follows arc42; decisions follow MADR 4.0.0; other documentation follows the Diataxis types ([ADR-0026](../decisions/0026-organize-documentation-with-diataxis-arc42-and-madr.md)). File naming and identifiers follow [ADR-0027](../decisions/0027-name-files-and-identifiers-without-temporal-words.md); the rules and commit messages are specified in [CONTRIBUTING.md](../../CONTRIBUTING.md).
