# Delivery plan

Execution plan from an empty application to submission: plan rules, gates, lanes, the day plan, priorities, stop rules, readiness and the definition of done. Deadline per the official event page: 4 November 2026, 9 PM ET [V] (recheck in the participant portal). Plan to submit by noon ET on 4 November. Acceptance IDs refer to [acceptance criteria](acceptance-criteria.md). Versions are in [architecture constraints](../architecture/02-architecture-constraints.md#pinned-versions), hosting in the [deployment view](../architecture/07-deployment-view.md) and the repository layout in the [building block view](../architecture/05-building-block-view.md#repository-layout).

## Plan rules

Three rules shape the sequence [D]:

1. Prove the two external dependencies in parallel on day 1: Meta model access (with structured tool calls) and one real observation bundle. Either one failing changes the demo; finding out on day 3 is too late.
2. Contracts come before code in every lane. The schemas in `schemas/` become Zod in `packages/contracts` before any lane writes records, so UI work proceeds against fixtures while the backend is built.
3. The vertical slice includes reload. Persistence is the proof of case ownership; it is in the slice, not polish.

## Gates

A gate can stop or narrow the build; none permits an invented result. GATE-01 to GATE-03 are placed in the [day plan](#day-plan); their failure rules are in [stop and narrow rules](#stop-and-narrow-rules).

| Gate | Proves | Owner and evidence | First action | Default if it fails |
|---|---|---|---|---|
| GATE-00 Event | Event acceptance, track and submission form fields are known | Founder: acceptance, track, submission form fields recorded privately, credits claimed | Founder signs in, records the form fields privately, claims model credits | Continue as a prototype; no eligibility claims |
| GATE-01 Meta access (when the founder's key exists) | The team's Meta Model API access works with strict structured output and tool calls | Founder creates the key; integration checks in [architecture constraints](../architecture/02-architecture-constraints.md#model-access-gate) | Create a Standard key, set the spend alert, run the GATE-01 checks | Fallback order in [ADR-0015](../decisions/0015-use-a-meta-model-through-the-responses-api.md); no live-autonomy claim until passed |
| GATE-02 Observation bundle (science lane, from day 2) | A real, validated observation bundle exists for the selected geometry | Science lane: a validated bundle passing SV-01 for the selected geometry | Recompute and freeze the catchment, then build the first validated bundle from the legacy Earth Search collection (Collection 1 lacks most of 2022 for this area) with deduplication and offset harmonization per [data sources and reproducible methods](../reference/data-sources-and-methods.md) and [observation preprocessing](../reference/observation-preprocessing.md) | Shorter period or seasonal composites; then the blocked-observation path |
| GATE-03 Vertical slice (B2) | The slice runs live end to end | All lanes: commission to reload, live, twice | Integrate commission, model plan, observation tasks, validated commit, Observations section and map layer, and reload. Narrowed by the founder's decision on 28 Oct 2026: until the NDVI departure data layer is on the map, the line from the Observations card onto the catchment counts as the map layer, and a run that passes is reported as "GATE-03 (narrowed: no data layer on the map)", not as GATE-03 passed. The data layer moves to B3; the full GATE-03 runs again once it lands | Cut all P1; keep challenge, plan, review, reload |
| GATE-04 Hosting | The deployment keeps the worker and the stream alive and serves map assets with Range requests | Platform lane: worker survives browser close; SSE reconnect across the 15-minute cap; Range 206 for map assets ([deployment checks](../architecture/07-deployment-view.md#deployment-checks)) | Railway Hobby before deploying the worker (the trial blocks outbound calls) | Render, then local deployment with disclosure |
| GATE-05 License | A project license is chosen before publication | Maintainer | Maintainer decides before publishing | No license asserted |

### Open questions with defaults

| Question | Default | Who decides |
|---|---|---|
| Track (indie or startup) | Not decided here | Founder |
| Whether to publish the repository during the event | Keep private until the publication gate passes ([ADR-0025](../decisions/0025-publish-by-default-and-keep-private-by-exception.md)) | Founder |
| Whether to align the drought comparison with Trends.Earth methods | P2; list as missing evidence in P0 | Science lane after P0 |
| Accent hue | 215, computed farthest from every data color; the earlier 189 sits close to the vegetation palette ([ADR-0042](../decisions/0042-compute-the-color-system-for-dark-and-light-themes.md)) | Founder |
| Strata count | Three colored strata plus a patterned neutral; four equal strata need patterns as the main channel | Science and UI lanes |
| Primary button label | "Start investigation", tested by PC-01; fallback "Commission the investigation" ([voice and tone](../reference/voice-and-tone.md)) | Founder after the 15-second test |

Light or dark: both themes are computed ([ADR-0042](../decisions/0042-compute-the-color-system-for-dark-and-light-themes.md)); dark is the default for the map workspace, light is provided, and the exported brief is light. The founder may switch the default after seeing both. No open question permits an invented result.

## Lanes and ownership

Each lane is a separate coding agent working in its own branch or worktree. A lane edits only its directories. Shared root files (`package.json`, `pnpm-workspace.yaml`, base `tsconfig`, CI) belong to the platform lane; other lanes request changes.

| Lane | Owns | Delivers | Depends on |
|---|---|---|---|
| Platform | `packages/contracts`, `packages/db`, `packages/domain`, `apps/web/app/api`, root config | Case and bundle contracts in Zod, migrations, commit transaction, event log, SSE with replay, snapshot API, seed loader, fixtures | `schemas/` |
| Agent runtime | `packages/agent`, `apps/worker` | Meta adapter, tool registry, task executors, validators wired in, budgets, trace events, retries, cancellation | Platform lane contracts and commit API |
| Science and map data | `science/`, `data/` | AOI geometry, monthly NDVI bundle, CHIRPS bundle, DEM strata, crop mask, regional map assets, corpus manifest and fetch script | Study area decision in [Data sources and reproducible methods](../reference/data-sources-and-methods.md#study-area) |
| Workspace UI | `apps/web` except `app/api` | Shell, geo stage, strip, column, all components, director, inspector, trace, review, motion | Platform lane fixtures first, live projection later; `design/` |
| Quality (from day 4) | `tests/`, `e2e/` | Acceptance suites, prohibited-claims and numeric scans, accessibility checks, performance traces, demo rehearsal | All |

Integration contracts that must not change without the owning lane's approval: `schemas/case.schema.json`, `schemas/stac/siterra-extension.schema.json`, `schemas/openapi.json`, API routes in the [runtime view](../architecture/06-runtime-view.md#api-and-stream) and event kinds in [data contracts](../reference/data-contracts.md#events), the component catalog in [components](../reference/components.md#catalog-bindings).

## Day plan

The plan has two parts. The first days run on dates that have happened or are fixed by the founder's actions; the application build then runs in build days counted from the day it starts (B1 to B5); the last days keep their dates because the deadline is fixed. Three dependencies set the first part: GATE-01 runs once the founder's Standard key and spend alert exist; the science lane runs GATE-02 from day 2; and the application lanes (platform, agent runtime, workspace UI) start only after the founder approves the hero frame, so GATE-03 moves with them. The founder approved the hero frame on Tue 27 Oct 2026, so B1 is that day.

| Day | Date | Goals | Gate at end of day |
|---|---|---|---|
| 1 | Mon 26 Oct (evening) | Event rules checked; planning handoff completed; GATE-01 checks specified, not run. | GATE-01 not run |
| 2 | Tue 27 Oct | Once the founder's Standard key and spend alert exist, the scripted GATE-01 checks run (authenticated call, strict structured output, one tool round trip with streamed arguments, error and refusal handling, usage captured; about USD 0.01 per run at list prices). Science lane: freeze the catchment, build the first NDVI and CHIRPS bundles, map assets. Design lane: hero frame for the founder's approval. | **GATE-01** once the key and alert exist (passed, or the replay path chosen and labeled); **GATE-02** in progress |
| B1 | Tue 27 Oct (the founder's hero-frame approval) | Repo scaffold; platform lane contracts, database, commit, events, SSE, snapshot. Agent runtime lane adapter, plan task, first deterministic tool (against the replay path if GATE-01 has not passed). Workspace UI lane shell, map, strip, column with fixtures. | **GATE-02** One validated bundle passes SV-01, or the blocked-observation path is chosen |
| B2 | Wed 28 Oct (B1 + 1) | Vertical slice: commission → model plan → observation tasks → validated commit → Observations section and map layer → reload restores (RL-04). Founder's decision, 28 Oct 2026: the line from the Observations card onto the catchment stands in for the map layer, and the NDVI departure data layer on the map moves to B3. Workspace UI lane, after the slice: the Sentinel-2 true-color drape on the relief and the contours, on the science lane's map assets in `data/map/`. | **GATE-03 (narrowed: no data layer on the map)** Slice runs live end to end twice; the full GATE-03 runs again after the data layer lands on B3 |
| B3 | Thu 29 Oct (B1 + 2) | The NDVI departure data layer on the map with its legend (moved from B2 by the founder on 28 Oct 2026), then the full GATE-03 run again. Source research over the case corpus; inspector; director receipts and milestones; trace list. Drought challenge backend: rainfall load, `compare_series`, hypothesis task, numeric provenance check. Minimum event bundle from SCI-25 (29 briefs, one Spark call each; needs GATE-01 and the founder's spend cap; about USD 0.15 to 0.30 at list prices [H], at most about USD 0.60 at the output limit; the run stops at USD 1.00 unless the founder sets a lower cap); `read_event_record`, `compare_events`. Workspace UI lane: the 3D arrival settle (MOT-01) on the same assets. | Full **GATE-03**; AF-01, AF-02, TR-01 pass; EV-06 for the minimum bundle |
| B4 | Fri 30 Oct (B1 + 3) | Hypothesis ledger with MOT-05; aligned comparison (MOT-09); rainfall grid on map; livelihood task and component. | DF-02 passes |
| B5 | Sat 31 Oct (B1 + 4) | Interventions; field-validation plan with strata; decision brief; review records; staleness propagation. | DF-03, DF-05, DF-06, SA-01 to SA-06 pass |
| 7 | Sun 1 Nov | Motion (MOT-02, MOT-05 travel, MOT-11; MOT-01 only tuned, built on B3), failure states, accessibility pass, P1 items only if all P0 tests pass. **Feature freeze at end of day.** | All P0 acceptance tests pass locally |
| 8 | Mon 2 Nov | Deploy; run acceptance on the deployment; performance on the demo laptop; record a labeled replay of a live run as fallback. | DQ-03 |
| 9 | Tue 3 Nov | Rehearse and record the demo; README; submission text. | DQ-01, DQ-02 |
| 10 | Wed 4 Nov | Buffer; submit by noon ET. | Submitted |

B1 is Tue 27 Oct, a partial day that began with the founder's approval at 19:20 EDT, so B5 is Sat 31 Oct, the day before the freeze, with no spare day. The three hero-frame items add 1.5 lane-days (0.75, 0.25 and 0.5) to the workspace UI lane on B2 and B3, on top of that lane's slice work, so a slip there lands on Sun 1 Nov. Each build day lost moves work onto Sun 1 Nov and removes the P1 and polish window first. The freeze, deploy, recording and submission dates do not move. When B5 would fall on or after Sun 1 Nov, the stop rules apply: P1 is cut before any P0 item, and B3 to B5 work is narrowed rather than the freeze moved.

Build status on B2 (Wed 28 Oct): the platform lane's core (the monorepo, case contracts, the case database, commits, the event stream and the bundle importer) is on main from commit e47f480, and the agent runtime (the Meta adapter with replay, the task loop, validators, tasks and the coordinator) from commit f14614d. GATE-01 passed on 28 Oct 2026: with the founder's key, `muse-spark-1.3` answered with strict structured output, streamed to completion, made one tool round trip with encrypted reasoning replay, returned the expected errors and reported usage, for about USD 0.0042 from the hackathon credits; the refusal parser was checked on a fixture only. Live model calls run for GATE-03 and the work the founder names, inside the founder's spend limits. GATE-03 (narrowed: no data layer on the map) passed live end to end, reload included, in two consecutive runs on 28 Oct 2026, after earlier live runs that failed it. Both passing runs used commit a6c79c7 on the `cursor/build` branch, which is not yet reviewed by a different model or merged. The full GATE-03 runs again once the NDVI departure data layer is on the map (B3).

## Feature ranking

Judgments on a three-step scale (H high, M medium, L low). For complexity and the two risk columns, H means harder or riskier. Effort is in focused lane-days. Ordered by priority, then by workflow importance.

| Feature | User value | Science integrity | Demo impact | Differentiation | Complexity | Integration risk | Dependency risk | Effort | Workflow importance | Priority |
|---|---|---|---|---|---|---|---|---|---|---|
| Commission with live model planning | H | M | H | M | M | H | H (model access) | 1.5 | H | P0 |
| Validated NDVI and rainfall bundles | H | H | H | M | H | M | H (data access) | 2 | H | P0 |
| Persistence, reload, SSE replay | H | M | M | M | M | M | L | 1.5 | H | P0 |
| Evidence list, claim kinds, inspector | H | H | M | M | M | L | L | 1 | H | P0 |
| Drought challenge and hypothesis ledger | H | H | H | H | M | M | M | 1.5 | H | P0 |
| Minimum event bundle: dated events from the FAO GIEWS Morocco archive (SCI-25, English, national scope) read by Muse Spark after GATE-01, checked by code, shown as markers in the drought challenge with the live comparison against the rainfall record ([ADR-0045](../decisions/0045-extend-the-meta-model-map-to-event-records-figures-and-whole-corpus-reading.md)) | M | H | H | H | M | M | M (model access) | 0.5 | M | P0 |
| Numeric provenance and claim validators | M | H | L | H | M | L | L | 1 | H | P0 |
| Staleness propagation | M | H | M | H | M | M | L | 1 | H | P0 |
| Field-validation plan with strata | H | H | H | H | M | L | M (DEM) | 1 | H | P0 |
| Role-specific review | H | H | H | H | M | L | L | 1 | H | P0 |
| Decision brief | H | H | H | M | M | L | L | 1 | H | P0 |
| Geo stage with relief, area, one raster | H | M | H | L | M | M | M (assets) | 1 | H | P0 |
| Timeline synced with map and chart | H | H | H | L | M | M | L | 1 | H | P0 |
| Livelihood constraints | H | H | M | H | L | L | L | 0.5 | H | P0 |
| Source research: original-language PDFs read by the model, excerpts verified | H | H | M | M | M | M | M (rights) | 1 | H | P0 |
| Intervention comparison (simple table) | M | M | M | M | L | L | L | 0.5 | M | P0 |
| Trace list view | M | M | M | L | L | L | L | 0.5 | M | P0 |
| Rainfall grid outline on map | M | H | M | M | L | L | L | 0.25 | M | P0 |
| Island layout with visual budget checks (VC-04, VC-05) | H | L | H | M | M | M | L | 1 | H | P0 |
| Views menu: overview, two obliques, time-lapse ([scenes](../reference/scenes.md)) | H | M | H | M | M | M | L | 1 | M | P0 |
| Precomputed analysis recipes with pre-registration (P0 recipes) | H | H | M | H | M | M | M (pipeline) | 1 | H | P0 |
| Evaluation harness with gold sets and Quality tab | M | H | M | H | M | L | L | 1 | M | P0 |
| Copy lint for interface strings and model text (VC-06) | M | H | L | M | L | L | L | 0.25 | M | P0 |
| Translation-ready strings, locale formatting, RTL smoke test (I18N-01 to I18N-04) | M | L | L | L | L | L | L | 0.5 | M | P0 |
| Model badges and usage meter (TR-05, TR-06) | M | M | M | M | L | L | L | 0.25 | M | P0 |
| Sentinel-2 true-color drape on the relief (approved hero frame) | M | M | H | M | M | M | M (pipeline) | 0.75 | L | P0 |
| Contours in the dive (approved hero frame) | L | L | M | L | L | M (plugin on v6) | M | 0.25 | L | P0 |
| 3D arrival settle (MOT-01, approved hero frame) | L | L | H | L | L | M | L | 0.5 | L | P0 |
| Evidence chip travel into the ledger (MOT-05 full) | M | L | H | M | M | M | L | 0.5 | L | P1 |
| Drawn semantic connectors (MOT-06) | M | M | M | M | M | M | L | 1 | L | P1 |
| Trace waterfall | M | M | M | L | M | L | L | 0.75 | L | P1 |
| Two-period map comparison | M | M | M | L | M | L | L | 0.75 | L | P1 |
| Read-only revision view | M | M | L | M | M | L | L | 0.75 | M | P1 |
| Brief export | M | M | L | L | L | L | L | 0.5 | M | P1 |
| Search grounding for source leads, verified before use | M | M | L | L | M | M | M | 0.75 | L | P1 |
| Imagery quality review with model image input, cross-checked | M | H | M | M | M | M | L | 0.75 | M | P1 |
| Second reader on local Muse Glimmer, scored on a gold set (EV-05) | M | H | M | H | M | M | M (local runtime) | 0.5 | M | P1 |
| Orbit tour, if it holds 50 fps on the demo laptop | L | L | H | M | M | M | L | 0.5 | L | P0 if PF-04 passes, else P1 stills |
| Model-proposed scenes (`propose_scene`) | M | L | H | M | M | M | L | 1 | L | P1 |
| French interface and machine-drafted French briefs with the original alongside | H | M | M | H | M | L | M (quality unmeasured) | 1 | M | P1 |
| Field-protocol illustrations with Muse Image | M | L | M | M | M | L | M | 1 | L | P1 |
| Comparable places view and AnalogueAssessment records | M | H | M | H | M | L | L | 1 | L | P1 |
| Timeline context markers for case commits and reviews (dated drought events come from the P0 event bundle) | M | M | M | L | L | L | L | 0.5 | L | P1 |
| French and Arabic reports added to the event bundle, found with search grounding at setup ([ADR-0045](../decisions/0045-extend-the-meta-model-map-to-event-records-figures-and-whole-corpus-reading.md)) | M | H | M | H | M | L | M (model access, sources) | 0.5 | L | P1 |
| Published figure placed on the valley with its fit error | M | M | H | H | M | L | M (figure license) | 0.5 | L | P1 |
| Sources disagree, whole-corpus request | M | H | M | M | L | L | M (model access) | 0.5 | M | P1 |
| Snow tracked with Segment Anything, checked against scene classification | L | M | M | M | M | L | M (untested on satellite) | 0.5 | L | P1 experiment |
| Muse Wonder brief critique | L | M | L | M | L | L | M (preview) | 0.5 | L | P2 |
| Segment Anything cropland mask vs WorldCover | M | M | M | M | H | H | M | 1.5 | L | P2 |
| Climate-corrected productivity (Trends.Earth-style) | M | H | L | L | H | M | M | 2 | L | P2 |
| Push-to-talk voice (Muse Voice Transcribe), editable transcript | L | L | M | M | M | M | M | 1 | L | P1 stretch |
| Arabic and Tifinagh map labels | M | M | L | L | M | M | M | 0.75 | L | P2 |
| Second case | M | M | L | L | H | M | H | 3 | L | Out |
| Infinite canvas (tldraw) | L | L | M | L | H | H | M (license key) | 3 | L | Out |

## Priorities

**P0, essential for a credible demonstration:** one case; the island layout within its visual budget; arrival with one action; the Views menu (overview, two obliques, time-lapse); commission with live model planning; validated NDVI and rainfall bundles; geo stage with relief, area and one data raster; the Sentinel-2 true-color drape on the relief, the contours of the dive and the 3D arrival settle (MOT-01), all three in the approved hero frame; temporal strip synced with chart and map; evidence list with claim kinds and inspector; drought challenge producing a hypothesis ledger; a minimum event bundle from the FAO GIEWS archive (SCI-25) with its markers and rainfall comparison in the challenge ([ADR-0045](../decisions/0045-extend-the-meta-model-map-to-event-records-figures-and-whole-corpus-reading.md)); livelihood constraints; intervention comparison (simple table); field-validation plan; decision brief; role-specific demo review; trace list view with model badges and the usage meter; precomputed P0 analysis recipes with pre-registration; the evaluation harness and Quality tab; copy lint; translation-ready strings; persistence, reload and SSE replay; staleness on input change; honest failure states; keyboard path; reduced motion; mode label.

P0 source research includes reading source PDFs in their original language with Muse Spark and verifying every excerpt (TR-04); it is both scientific integrity and the strongest non-trivial use of the Meta model ([Meta capabilities used](../architecture/02-architecture-constraints.md#meta-capabilities-used)).

**P1, high-value polish, only after all P0 tests pass:** the second reader on local Muse Glimmer; French interface and machine-drafted French briefs; field-protocol illustrations with Muse Image; comparable places view; model-proposed scenes; timeline context markers; French and Arabic reports added to the event bundle; a published figure placed on the valley; the sources-disagree comparison; imagery quality review with the model's image input cross-checked against scene classification, or the Segment Anything snow experiment in its place; push-to-talk voice input through Muse Voice Transcribe (stretch, same command contract, editable transcript); search grounding for new source leads; shared-element evidence travel (MOT-05, MOT-11); drawn semantic connectors (MOT-06); trace waterfall; two-period map comparison; case history read-only revision view; brief export; hover values on map rasters; layout undo.

**P2, optional:** Muse Wonder critique of the brief; Segment Anything cropland mask compared with WorldCover; the forecast eligibility backtest ([ADR-0039](../decisions/0039-forecast-nothing-until-a-backtest-shows-skill.md)); climate-corrected productivity analysis aligned with Trends.Earth methods; a second case; additional languages after evaluation.

**Out of scope:** diagnosing overgrazing, biomass or carrying capacity; forecasts; household numbers; real outreach, payments or land decisions; tldraw or any infinite canvas; Naïve or another agent runtime; multi-tenant administration; arbitrary polygon analysis; model-generated UI code.

## Stop and narrow rules

| Trigger | Action |
|---|---|
| GATE-01 fails (the checks run and do not pass), or GATE-01 has not run by B1 | Build against the adapter with a labeled replay of model outputs (synthetic until GATE-01 records real ones); keep trying access daily; no "live" claims until fixed. Escalate to the founder immediately. No event bundle is built without access: the challenge shows "Event record not built: model access not confirmed" in place of markers, and no replayed or hand-written rows stand in for it. |
| GATE-02 fails | Narrow to 2021 to 2025 or seasonal composites; if still failing at the end of B2, ship the blocked-observation path (published context, missing-data states, field-scoping package) and keep the pipeline in progress. Never fabricate values. |
| GATE-03 fails | Cut all P1, reduce interventions to a static comparison generated by one task, keep challenge, plan, review and reload. |
| Any day ends with failing P0 tests | Next morning fixes failures before new features. |
| After day 7 | Only fixes, copy and content changes. No new dependencies. |

## Readiness

The checklist separates specification readiness (can a team build from these documents without asking?) from empirical readiness (has it been shown to work?). It records what is decided and what has to be proven; nothing in it says the product works. An empirical entry changes only with recorded evidence, as for [acceptance criteria](acceptance-criteria.md).

| Item | Specification | Empirical | Where |
|---|---|---|---|
| Positioning and primary user | Ready | Persona untested | [Product thesis and challenge](../explanation/product-thesis.md), [users and flows](../explanation/users-and-flows.md) |
| End-to-end experience | Ready (11 scenes plus failure scenes) | Hero approved by the founder (27 Oct 2026); not user-tested | [Experience storyboard](../reference/experience-storyboard.md), [hero sequence](../reference/scenes.md) |
| AI-composed workspace model | Ready (catalog, actions, reducer, rules PRES-01 to PRES-07) | Not built | [UX architecture](../reference/ux-architecture.md), [data contracts](../reference/data-contracts.md) |
| Visual reference manifest | Ready (29 inspected references) | n/a | [Design references](../explanation/design-references.md) |
| Hero design (design language 1.3) | Approved by the founder, 27 Oct 2026 | Not user-tested | [Design system](../reference/design-system.md) |
| Motion specifications | Ready (MOT-01 to MOT-13) | Hero timeline approved (27 Oct 2026); MOT catalog not built | [Motion](../reference/motion.md) |
| Map views and tours | Ready (templates, primitives, limits, player) | Prototyped with illustrative layers | [Scenes and views](../reference/scenes.md) |
| Analysis recipes and forecasting policy | Ready (14 recipes, P0 to P2) | Not computed | [Analysis recipes](../reference/analysis-recipes.md) |
| Evaluation harness | Ready (suites, gold-set format) | Extraction gold set drafted by a model (32 items, none signed by a person, so none count as gold); numeric gold set of 350 values generated by code from the bundles | [Evaluation](../reference/evaluation.md) |
| Meta model map | Ready (one job and one check per model; four further jobs proposed in [ADR-0045](../decisions/0045-extend-the-meta-model-map-to-event-records-figures-and-whole-corpus-reading.md)) | Glimmer smoke-tested locally on synthetic text (2026-10-26 and 2026-10-27); GATE-01 passed (2026-10-28); `muse-spark-1.3` runs the case tasks live through the Meta adapter, and GATE-03 (narrowed: no data layer on the map) passed twice in a row on a branch not yet merged; the jobs of the other Meta models are not integrated | [ADR-0041](../decisions/0041-give-each-meta-model-one-job-with-an-independent-check.md), [Meta models research](../../research/technology/meta-models.md) |
| Voice, microcopy and copy lint | Ready (guide, string set, tested lint patterns) | Lint not in CI yet | [Voice and tone](../reference/voice-and-tone.md), [microcopy](../reference/microcopy.md) |
| Translation layer | Ready (P0 readiness, P1 French) | Not built; French quality unmeasured | [Accessibility and language](../reference/accessibility-and-language.md#the-translation-layer) |
| Problem statement | Ready (cited facts, figures to avoid) | n/a | [The problem](../explanation/problem.md) |
| Typography, palette, tokens | Ready (dark and light computed, DTCG tokens, contrast and CVD checks) | Not checked over real Sentinel-2 imagery of the valley | [Design system](../reference/design-system.md) |
| Scientific claims and data sources | Ready | No raster processed | [Scientific basis and limits](../explanation/scientific-basis.md), [data sources and reproducible methods](../reference/data-sources-and-methods.md) |
| Study area | Decided: valley catchment, about 417 km² preview from Copernicus GLO-30, with acceptance checks | Native 30 m recompute and freeze by the science lane on day 1 | [Data sources and reproducible methods](../reference/data-sources-and-methods.md#study-area) |
| Shared state model (chat, map, charts, agent) | Ready | Not built | [UX architecture](../reference/ux-architecture.md), [state ownership](../architecture/08-cross-cutting-concepts.md#state-ownership) |
| Trace instrumentation | Ready (events, spans, naming) | Not built | [Agent orchestration](../reference/agent-orchestration.md), [trace](../architecture/08-cross-cutting-concepts.md#trace) |
| Agent jobs, tools, authority | Ready | Not built | [Agent orchestration](../reference/agent-orchestration.md), [human review and authority](../reference/review-and-authority.md) |
| Schemas and state transitions | Ready (case contracts 1.5.0) | Contracts 1.5.0 in `packages/contracts` on main, with a contract test over `schemas/examples/` | [Data contracts](../reference/data-contracts.md), [schemas/](../../schemas/) |
| Architecture recommendation | Ready (one stack, one host) | Not installed | [Solution strategy](../architecture/04-solution-strategy.md), [deployment view](../architecture/07-deployment-view.md) |
| Stack verified against vendor documentation | Ready (versions, security floors) | Not installed together | [Stack versions](../../research/technology/stack-versions.md) |
| Dependency and access fallbacks | Ready | Not exercised | [Risk register](risk-register.md) |
| Priorities and stop rules | Ready | n/a | [Priorities](#priorities), [stop and narrow rules](#stop-and-narrow-rules) |
| Parallel implementation plan | Ready (five lanes with ownership) | n/a | [Lanes and ownership](#lanes-and-ownership) |
| Acceptance tests | Ready (IDs and pass conditions) | None run | [Acceptance criteria](acceptance-criteria.md) |
| Demo storyboard | Ready | Not rehearsed | [Demo plan](demo-plan.md) |
| Conceptual material labeled | Ready (every illustrative value tagged) | n/a | [design/](../../design/) |

## Definition of done for submission

All P0 acceptance tests in [acceptance criteria](acceptance-criteria.md) pass on the deployment, including DF-01 to DF-06, SA-01 to SA-09, SV-01 to SV-07 and DQ-01 to DQ-03; the README states exactly what is live, precomputed, simulated or out of scope; the [publication gate](../how-to/run-the-publication-gate.md) has been run.
