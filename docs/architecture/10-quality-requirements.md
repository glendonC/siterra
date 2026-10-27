# Quality requirements

The quality goals from [introduction and goals](01-introduction-and-goals.md#quality-goals) as concrete scenarios, each tied to the acceptance criteria that test it. Criteria and pass conditions are defined only in [acceptance criteria](../project/acceptance-criteria.md); a criterion passes only with recorded evidence. Time figures are acceptance targets, not measurements.

## Quality tree

| Goal | Scenarios | Acceptance | Served by |
|---|---|---|---|
| Traceability | Evidence lineage, trace content, trace hygiene, real excerpts | TR-01 to TR-04, IU-02 | Authoritative case record ([ADR-0012](../decisions/0012-treat-the-case-record-as-authoritative.md)), domain events as the trace ([ADR-0019](../decisions/0019-use-domain-events-as-the-public-trace.md)), excerpt verification ([ADR-0014](../decisions/0014-run-one-coordinator-with-bounded-task-jobs.md)) |
| Scientific validity | Reproducible measurements, numeric provenance, no prohibited claims, visible gaps, honest rainfall scale, one period everywhere, honest review status | SV-01 to SV-07, AF-05 | Precomputed observations ([ADR-0021](../decisions/0021-precompute-observations-and-run-investigation-work-live.md)), analysis recipes ([ADR-0036](../decisions/0036-run-analyses-as-declarative-precomputed-recipes.md)), layered validators ([ADR-0014](../decisions/0014-run-one-coordinator-with-bounded-task-jobs.md)), claim limits ([ADR-0023](../decisions/0023-prohibit-causal-diagnosis-and-outcome-claims.md)), no forecasts ([ADR-0039](../decisions/0039-forecast-nothing-until-a-backtest-shows-skill.md)) |
| Reliability and continuity | Provider failure, missing dataset, stream loss, reload, stale tab, budget stop, crash recovery, clean rejection | RL-01 to RL-06, AF-03, AF-04 | One commit per transaction, outbox, idempotency and result keys ([data contracts](../reference/data-contracts.md#idempotency-revisions-and-recovery)), SSE replay with heartbeat ([ADR-0017](../decisions/0017-host-on-railway-with-render-as-fallback.md)) |
| Authority and safety | Injected instructions, out-of-scope requests, partial reviews, stale reviews, exported demo labels, no external side effects | SA-01 to SA-09, DF-05 | Role-specific review and no outbound tools ([ADR-0024](../decisions/0024-require-role-specific-review-with-no-outbound-actions.md)), human authority over real-world actions ([ADR-0033](../decisions/0033-keep-the-autonomous-firm-stance-with-human-authority.md)) |
| Accessibility | Keyboard-only golden path, screen reader, reduced motion, text zoom, chart tables | A11Y-01 onward, MQ-03 | Typed commands first ([ADR-0011](../decisions/0011-ship-typed-english-commands-before-voice.md)), semantic sections ([ADR-0006](../decisions/0006-use-a-guided-adaptive-investigation-workspace.md)), maintained accessible primitives ([ADR-0044](../decisions/0044-build-the-interface-on-shadcn-with-base-ui-and-mit-components.md)) |
| Performance | Shell, period change, composition, camera, command acknowledgement | PF-01 to PF-05 | One map instance, one data raster at a time, precomputed observations |

ADR numbers resolve in the [decision log](../decisions/README.md).

## Traceability

- A reviewer opens any accepted evidence item and reaches its source or measurement, area, period, method version, coverage, producing task, and that task's model and tool events (TR-01). From any brief line the source or measurement detail opens in at most two interactions (IU-02).
- For every task the trace lists model calls (model ID, tokens, duration, status), tool calls (name, argument summary, result IDs, duration) and the validation outcome (TR-02).
- No API keys, bearer tokens, raw system prompts or hidden reasoning appear in events or logs shipped to the browser (TR-03).
- Every accepted published-context excerpt is found verbatim in the extracted text of its cited page; translated statements carry the "Machine-drafted translation" label and the original excerpt (TR-04).

See [acceptance criteria: traceability](../project/acceptance-criteria.md#traceability).

## Scientific validity

- Every measurement belongs to a validated bundle with manifest and checksum, and re-running the documented preprocessing for one month reproduces its value within the manifest's tolerance (SV-01). Every numeric value in measurements comes from a deterministic tool call visible in the trace (AF-05).
- Every number in accepted model-written text matches a referenced record value, date or source excerpt (SV-02); no prohibited claim appears outside the "what this case does not claim" panel (SV-03).
- Months below the coverage policy render as gaps, never as lines across them (SV-04); rainfall views state the native grid resolution (SV-05); every view shows the same period ID and value for a selected month (SV-06); interpretations stay "Not expert-reviewed" unless a real reviewer recorded a review (SV-07).

See [acceptance criteria: scientific validity](../project/acceptance-criteria.md#scientific-validity).

## Reliability

- A simulated provider 5xx gets two retries with backoff, then a failed task with Retry and an unchanged case (RL-01).
- A removed bundle blocks quantitative tasks with the named dependency while the field-scoping package still completes (RL-02).
- A 30-second disconnect reconnects and replays unseen events with no duplicates or gaps (RL-03); reload at each scene restores the same state and no completed task re-executes (RL-04).
- A command from a stale tab is rejected or safely rebased; newer work is never overwritten (RL-05). Hitting the per-command budget stops new calls and produces a partial package (RL-06).
- Killing the worker mid-task and restarting completes the command without duplicate entities (AF-03); malformed model output fails validation and writes no entity (AF-04).

See [acceptance criteria: reliability](../project/acceptance-criteria.md#reliability).

## Authority and safety

The six required failure checks in [human review and authority](../reference/review-and-authority.md#required-failure-checks) are SA-01 to SA-06: an injected instruction changes no permission and sends nothing; a request to close grazing access yields a bounded proposal and no action; missing local consultation stays visible after a scientific review; a changed source or area stales the affected review; an exported demo brief keeps its labels and conditions; without grazing measurements, grazing attribution cannot be labeled confirmed. SA-07 to SA-09 cover no external integrations, demo labels in exports and no fixture leakage.

See [acceptance criteria: safety and authority](../project/acceptance-criteria.md#safety-and-authority).

## Accessibility

The release checks in [accessibility and language](../reference/accessibility-and-language.md#release-checks) are acceptance tests A11Y-01 onward. Minimum for submission: keyboard-only golden path, screen-reader pass on one browser pairing, reduced motion, 200% text zoom, and chart tables matching plotted values. With reduced motion emulated, no camera flight, translation or shared-element travel occurs (MQ-03).

See [acceptance criteria: accessibility](../project/acceptance-criteria.md#accessibility).

## Performance

Targets on the demo laptop (acceptance, not measurements): cached shell interactive within 2 s; period change visible within 100 ms (prefetched raster within 300 ms); command acknowledged within 1 s and first real progress within 2 s; no main-thread task over 200 ms during composition (PF-01 to PF-05). Arrival settle and pitch flatten hold 50 fps or the 3D arrival is disabled (PF-04).

Means: one map instance, one data raster at a time, camera padding instead of canvas resizes, lazy-loaded trace and charts, scientific arrays kept out of React props.

See [acceptance criteria: performance](../project/acceptance-criteria.md#performance-demo-laptop).

## Other quality criteria

Product clarity (PC), interaction usability (IU), visual consistency (VC), motion quality (MQ), autonomous functionality (AF), differentiation (DF) and demonstration quality (DQ) are also defined in [acceptance criteria](../project/acceptance-criteria.md). The [evaluation harness](../reference/evaluation.md) measures extraction fidelity, claim typing, status behavior, numeric provenance, schema adherence, safety, cost and time for the model's work.
