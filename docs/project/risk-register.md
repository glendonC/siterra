# Risk register

Review daily during the build. Likelihood and impact are judgments (H, M, L), not measurements. Gates GATE-00 to GATE-05 are in the [delivery plan](delivery-plan.md#gates). Account-specific access status is tracked privately.

| ID | Risk | L | I | Early signal | Mitigation | Fallback |
|---|---|---|---|---|---|---|
| RISK-01 | Meta model access, billing, region or model availability blocks live calls | M | H | Smoke test fails on day 1 | Test first; provider adapter; keep Meta-first | Labeled replay of recorded model outputs; no live-autonomy claim; daily retry |
| RISK-02 | Structured output or tool calling is unreliable for the task schemas | M | H | Validation failure rate above 1 in 5 in the slice | Small task scopes; strict schemas; one repair attempt; deterministic tools for every number; examples in prompts | Narrow the model's role to planning, extraction and composition; keep validators strict |
| RISK-03 | Observation pipeline is slower or harder than planned (masking, scene volume) | M | H | No validated bundle by end of day 2 | Precompute a small AOI; cloud-optimized reads; start day 1 | Shorter period or seasonal composites; then the blocked-observation path |
| RISK-04 | Snow, cloud and terrain shadow leave many winter months unusable | H | M | Coverage policy fails for most winter months | Coverage policy, hatching, seasonal summaries | Present it honestly; it supports the field plan |
| RISK-05 | The evidence is inconclusive | H | L | Ledger statuses are mostly "cannot be assessed" | Designed for: the field plan is the deliverable | None needed |
| RISK-06 | Map assets: tile licensing or third-party server failure during the demo | M | M | Missing tiles, CORS errors, unclear license | Self-hosted regional bundle with recorded attribution | Static attributed relief image plus area as text |
| RISK-07 | Visual polish consumes the schedule | H | M | Motion work before GATE-03 | P1 only after P0 tests pass; feature freeze day 7 | Fixed sections with immediate changes |
| RISK-08 | Hosting cannot keep a worker alive or breaks SSE | M | H | Disconnects, killed processes in staging | Long-lived worker service; heartbeat; replay | Run the demo from a local deployment with a persistent database, labeled |
| RISK-09 | Event rules conflict with the plan | L | H | Submission form fields (video length, repository visibility, demo URL, judge access) differ from assumptions; the rules found so far require building with Meta AI products and weight Meta tooling at 25% (TECH-29) | Open the submission form on day 1 and record its fields privately | Adjust cuts in the demo storyboard |
| RISK-21 | No hard spending cap on the model account; hackathon credits have conflicting validity wording | M | M | Spend alert email; credit balance | Application budgets per command and task; account spend alert on day 1; claim credits before the deadline | Pause live calls; labeled replay for rehearsals |
| RISK-22 | Hosting limits: SSE requests close after 15 minutes; a limited trial blocks outbound calls | M | M | Disconnects every 15 minutes; outbound errors to the model API | Heartbeat, reconnect with `Last-Event-ID`; paid hobby plan before deploying the worker (TECH-50) | Render fallback (TECH-51) |
| RISK-10 | Scientific overclaiming slips into copy or model text | M | H | Prohibited-claims scan hits; reviewer flags wording | Claim kinds, numeric provenance check, prohibited-claims scan, cautious status words | Remove the statement; keep the gap |
| RISK-11 | Prompt injection through retrieved sources | L | H | Source text addressing the agent | Sources are data; tool allowlist; no outbound tools exist | Quarantine the source; flag it in the trace |
| RISK-12 | Cost overrun | L | M | Ledger above the per-command cap | Budgets per command and task; cached input | Stop new calls; partial package |
| RISK-13 | Parallel coding agents collide | M | M | Merge conflicts on shared files | Ownership map, contracts first, small units | Platform lane serializes shared-file changes |
| RISK-14 | Accessibility gaps found late | M | M | Keyboard path breaks | Semantic DOM first; keyboard tests from day 4 | Simplify the affected component |
| RISK-15 | Literature corpus rights | M | M | Unclear license for full texts | Store retrieved texts locally (ignored), quote at most short excerpts, link originals | Use abstracts and official pages only |
| RISK-16 | Implying problems or decisions for a real community without its involvement | M | H | Copy naming a village as degraded or a community as agreeing | Question framing; administrative or landscape units, not villages; no household data; demo labels | Remove place-specific framing; keep regional context |
| RISK-17 | Language: English-only interface read as suitable for local participants | M | M | Requests for local-language output | Language limits in [Accessibility and language](../reference/accessibility-and-language.md); no translation claims | Translation stays a labeled draft for local review |
| RISK-18 | Network failure during recording | M | M | Slow or failed calls in rehearsal | Rehearse twice; record early (day 9) | Labeled replay of a prior live run |
| RISK-19 | Competitor descriptions change before submission | H | L | Changelogs update | Recheck volatile facts before publishing comparisons | Drop comparative claims |
| RISK-20 | Founder's visited location or private details leak into public material | L | M | Personal details in public files | Documentation policy and publication gate | Remove before commit; review history |
| RISK-23 | Camera tours or 3D terrain stutter on the demo laptop | M | M | Orbit or fly-through below 50 fps in rehearsal (PF-04) | Views before tours; warm tile cache; terrain off for data views | Tours ship as stepped stills |
| RISK-24 | French machine drafts read as reviewed translations | M | H | Exports or screens without the machine-draft label | Label on every translated statement and export page (I18N-05, TR-04); original kept alongside | French export held back; English only |
| RISK-25 | The local open-weight route is unreachable from the hosted deployment or does not enforce schemas | H | M | Second reader works locally but not in the deployed app; parse failures | Shared parser with one repair turn; precomputed evaluation shown with "local mode only" | Second reader stays a local, labeled evaluation |
| RISK-26 | Model-written copy drifts into generic or overclaiming wording | M | M | Copy lint warnings rise in the trace | Copy lint on model fields before commit (VC-06); prohibited-claims scan | Reject the item and retry with the issue listed |
| RISK-27 | Bonus prize categories or their terms differ from what was relayed | M | L | Portal or announcement wording differs | No eligibility claims until confirmed | Drop the claim; the product does not change |

## Standing fallbacks

| Dependency | Default | Fallback | What the UI says |
|---|---|---|---|
| Model provider | Meta Model API, live | Recorded outputs replayed | "Replay of live run, [date]" badge on every screen |
| Observations | Validated precomputed bundles | Blocked observation tasks | "No validated observations: [missing input]" |
| Map rendering | Self-hosted relief and data rasters | Static relief image | "Interactive map unavailable. The case still works." |
| Hosting | Deployed web, worker and database | Local deployment | Nothing different, but the submission text says so |
| Motion | Full motion set | Immediate state changes | Same text announcements |
