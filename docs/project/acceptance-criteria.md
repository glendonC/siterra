# Acceptance criteria

None of these tests has been run; there is no application yet. Each criterion has an ID used in pull requests and the [build plan](delivery-plan.md). "Demo laptop" means the machine that records the submission video, Chrome stable, 1440×900 window.

A criterion passes only with recorded evidence: a test name, a screenshot or recording, or a written observation with date and tester. A builder may not be the only evaluator for the product-clarity and usability tests.

## Product clarity

| ID | Criterion | Pass condition |
|---|---|---|
| PC-01 | Arrival is understood in 15 seconds | 3 of 4 people unfamiliar with Siterra, shown the arrival screen for 15 s, correctly state the place, the question, and what the primary button will do. Answers recorded. |
| PC-02 | One primary action | Arrival has exactly one primary action, shown as one key hint (in the hero "↵ Start investigation"); "F Read flat" is a view control, and no control is a filled primary button. |
| PC-03 | No diagnosis at arrival | Automated copy scan of the arrival view finds none of: "degraded", "overgrazed", "overgrazing detected", "damage", "crisis". |
| PC-04 | Boundaries are visible | The scope popover lists what the firm will not do (contact people, spend money, make land decisions) and opens from the mode line on arrival in one interaction. |

## Interaction usability

| ID | Criterion | Pass condition |
|---|---|---|
| IU-01 | Golden path without coaching | A tester completes commission, drought challenge, livelihood question, options, package and one review in 10 minutes or less using only on-screen affordances. Stumbles logged. |
| IU-02 | Evidence in two steps | From any brief line, its source or measurement detail opens in at most two interactions. |
| IU-03 | Context is visible | Before submitting, the director shows the area, period and focused item the command will use; changing the selection updates the chips. |
| IU-04 | Errors keep input | A failed command preserves the typed text and offers a targeted retry. |
| IU-05 | Views without coaching | A tester switches to an oblique view, back to the overview, and plays the time-lapse using only on-screen controls, then states what the oblique view is not for (reading area or pattern). |

## Autonomous functionality

| ID | Criterion | Pass condition |
|---|---|---|
| AF-01 | Real planning | In live mode, one commission yields a model-proposed plan of at least four tasks, recorded with provider request IDs, all reaching a terminal state with no manual step. |
| AF-02 | Real follow-up work | The drought challenge creates new tasks whose model and tool events are timestamped after the command. No canned response path exists in live mode (code review plus trace). |
| AF-03 | Crash recovery | Killing the worker during a task, then restarting, completes the command without duplicate entities (record counts compared before and after). |
| AF-04 | Rejection is clean | Injected malformed model output fails validation; the task fails with issues listed; no entity is written. |
| AF-05 | Deterministic numbers | Every numeric value in measurements comes from a deterministic tool call visible in the trace. |

## Scientific validity

| ID | Criterion | Pass condition |
|---|---|---|
| SV-01 | Reproducible measurement | Every measurement belongs to a validated bundle with manifest and checksum. Re-running the documented preprocessing for one month reproduces its value within the tolerance stated in the manifest. |
| SV-02 | Numeric provenance | Every number in accepted model-written text matches a referenced record value, date or source excerpt (validator log shows zero violations). |
| SV-03 | Prohibited claims | A scan of UI copy and all generated text finds no prohibited claim from [Scientific basis and limits](../explanation/scientific-basis.md#claims-prohibited-in-the-demo) outside the "what this case does not claim" panel. |
| SV-04 | Gaps stay gaps | Months below the coverage policy render as hatched gaps in strip and chart; no line is drawn across them; the map shows "No map observation for this period". |
| SV-05 | Rainfall scale honesty | Rainfall views state the native grid resolution and the map can show the grid cells covering the area. |
| SV-06 | One period everywhere | For a selected month, strip, map legend, chart cursor and evidence detail show the same period ID and value (automated DOM test). |
| SV-07 | Review status is honest | Interpretations are labeled "Not expert-reviewed" unless a real reviewer recorded a review; demo reviews never set `expert_reviewed`. |
| SV-08 | Analogy stays context | A comparable place's numbers appear only inside its own card, and a fixture where only comparable-place evidence supports a hypothesis leaves that hypothesis status unchanged ([comparable places](../explanation/comparable-places.md#rules)). |

## Visual consistency

| ID | Criterion | Pass condition |
|---|---|---|
| VC-01 | Tokens only | Lint finds no raw color values outside the token definitions (data ramps included). |
| VC-02 | Type scale only | Computed font sizes in the app are a subset of the [type scale](../reference/design-system.md#typography), including the hero's sizes (10, 11, 12, 13, 14, 15, 16, 17, 22, 28, 44 and 48 px); nothing below 11 px except the credit line (10 px). Names on the land, drawn into the map canvas or placed over it with the camera's projection, scale with the view and are checked on the frames instead. |
| VC-03 | Composition review | Screenshots at 1440×900, 1280×800 and 1024×768 for scenes 1, 3, 5, 8 and 9 reviewed against [design references](../explanation/design-references.md) with a written checklist. |
| VC-04 | Visual budget | In the hero, per beat, an automated count finds 1 card, at most 1 leader, at most 45 words on the card, at most 5 labels on the land (a land label line at most 6 words; honesty lines, marked in the string catalog, exempt; a two-line block counts as one), 1 action key plus "F Read flat" and 1 mode label ([the hero's budget](../reference/ux-architecture.md#the-heros-budget-design-language-13)). For each workspace state, the DOM count of visible islands, interactive controls, expanded components and text items stays within the [visual budget](../reference/ux-architecture.md#visual-budget). Attribution excluded. |
| VC-05 | Open map | In the hero, per beat at 1440×900 and 1280×800, the share of the viewport not covered by the boxes of the card, the sky statement, the command line, the key hints, the key slot, the instruments and the mode line is at least 80%, and at least 60% in the verdict. For each workspace state at the same sizes, the share of the map viewport not covered by island bounding boxes meets the budget (for example at least 60% while working). Attribution excluded. |
| VC-06 | Copy lint | Every interface string and every model-written field accepted into the case passes the error rules in [voice and tone](../reference/voice-and-tone.md#lint-rules); warnings are reviewed; each exception is allowlisted by string ID with a written reason. |

## Motion quality

| ID | Criterion | Pass condition |
|---|---|---|
| MQ-01 | One focal transition | Instrumented counter never shows two focal transitions running at once. |
| MQ-02 | Interruptible | Any user input during an animation takes effect within 100 ms; camera stops on drag. |
| MQ-03 | Reduced motion | With reduced motion emulated, no camera flight, translation or shared-element travel occurs; state changes remain announced in text. |
| MQ-04 | No movement under the pointer | Revealing content never moves the element under the pointer or the focused element. |

## Performance (demo laptop)

| ID | Criterion | Pass condition |
|---|---|---|
| PF-01 | Shell | Cached case shell interactive within 2 s; first map render within 3 s on the demo network. |
| PF-02 | Period change | Cursor and label update within 100 ms; prefetched raster visible within 300 ms. |
| PF-03 | Composition | No long task over 200 ms during component composition (PerformanceObserver log). |
| PF-04 | Camera | Arrival settle, pitch flatten, orbit and fly-through hold 50 fps or better; otherwise the 3D arrival is disabled and orbit and fly-through ship as stills for the demo. |
| PF-05 | Command acknowledgement | Server acknowledges a command within 1 s; first real progress event within 2 s. |

## Scenes and views

Specification: [scenes and views](../reference/scenes.md).

| ID | Criterion | Pass condition |
|---|---|---|
| SC-01 | Scenes come from records | Every item in the Views menu resolves from current case records; changing the area revision marks dependent scenes stale with the reason. |
| SC-02 | Invalid scenes are rejected | Injected scenes with pitch 85, an unknown recipe, a coordinate outside the display extent, or free caption text are rejected with coded issues; the default scene set stays. |
| SC-03 | Playback is pure | `evaluate(scene, tMs)` returns identical frame states for identical inputs across 200 sampled times (unit test). |
| SC-04 | Measurement views are flat | In the flat reading ("Read flat") and in workspace measurement views, at every sampled time where `period_raster` or `rainfall_grid` is visible, pitch is 0 and terrain is off. In the hero's story views, measured layers are painted on the relief at true cell size, the view carries "Relief ×2", and the flat reading is one key away. |
| SC-05 | Playback yields to the user | A drag, wheel, key or pointer down during a tour pauses it within one frame; Stop restores the camera, layers and period from before the scene. |
| SC-06 | Background work never moves the camera | A commit that arrives during a tour changes neither the scene nor the camera; it waits behind "View new findings (n)". |

## Analysis and forecasting

Specification: [analysis recipes](../reference/analysis-recipes.md).

| ID | Criterion | Pass condition |
|---|---|---|
| AN-01 | Pre-registration | For every analysis plan, the committed scope and windows precede the first `read_recipe_result` call in the trace; a later change creates a new revision labeled post hoc. |
| AN-02 | Inapplicable recipes blocked | `list_recipes` marks recipes that do not apply with the reason; a plan that selects one is rejected before any result is read. |
| AN-03 | Fixed sensitivity sets | Departure results show both references together; the aligned comparison shows the 0 to 3 month windows together; no single window is presented alone. |
| AN-04 | Standard limitations verbatim | Each recipe result shows its registry limitation sentences exactly (string comparison). |
| AN-05 | Estimates carry uncertainty | Every `model_estimate` output carries an uncertainty kind other than `not_quantified`, or the recipe's declared reason (schema test). |
| AN-06 | Forecast requests are refused usefully | "Forecast next spring's vegetation", "When will the pasture recover?" and "How many animals can it carry?" each produce a refusal that names what would be needed and creates an analysis or field requirement; the prohibited-claims scan finds no forecast wording. |

## Evaluation

Specification: [evaluation harness](../reference/evaluation.md). Numbers come only from harness runs.

| ID | Criterion | Pass condition |
|---|---|---|
| EV-01 | Harness runs | `pnpm eval` writes a report whose header records model ID, prompt version, corpus manifest hash and date. |
| EV-02 | Extraction and typing | Accepted excerpts match their source pages 100%; claim-typing accuracy and its confusion matrix are reported, with at least 90% before the demo recording. |
| EV-03 | Honest status | The status-behavior fixture set scores 100%. |
| EV-04 | Quality shown, not written | The trace's quality checks and the Quality tab match the latest report and real events; no model-written text appears in either. |
| EV-05 | Second reader measured (P1) | The faithfulness suite reports negative recall, false-alarm rate, kappa and parse failures with Wilson 95% intervals for each candidate model; routing thresholds were recorded before scoring. |
| EV-06 | Event bundle checked (P0 for the minimum bundle, P1 for French and Arabic reports) | The event bundle manifest records the excerpt-check pass count, and the precision of a person's 20-row sample is reported with a Wilson 95% interval ([ADR-0045](../decisions/0045-extend-the-meta-model-map-to-event-records-figures-and-whole-corpus-reading.md)). |
| EV-07 | Figure placement measured (P1) | Leave-one-out placement error is reported in metres against a threshold recorded before the run; the figure layer is off when the error is above it. |
| EV-08 | Snow experiment measured (P1) | Per-month agreement with the Scene Classification snow fraction is reported against a threshold recorded before the run; below it, nothing reaches the map. |

## Language

Specification: [accessibility and language](../reference/accessibility-and-language.md#the-translation-layer).

| ID | Criterion | Pass condition |
|---|---|---|
| I18N-01 | No hard-coded copy | Lint finds no user-facing string literals outside the message catalogs. |
| I18N-02 | Long strings fit | A pseudo-locale that lengthens every string by 40% shows no clipping or overlap in the islands at 1440×900 and 1280×800. |
| I18N-03 | Right-to-left ready | An Arabic pseudo-locale renders with `dir="rtl"`, logical spacing, and IDs, numbers and place names isolated; map controls stay usable. |
| I18N-04 | Original language kept | Every statement records its language; excerpts render in their original language with a matching `lang` attribute. |
| I18N-05 | Machine drafts are labeled (P1) | A French brief export shows "Machine-drafted translation, needs local review" on every page, the original text alongside, and the model ID and date. |

## Reliability

| ID | Criterion | Pass condition |
|---|---|---|
| RL-01 | Provider failure | Simulated 5xx: two retries with backoff, then a failed task with Retry; case unchanged. |
| RL-02 | Missing dataset | Bundle removed: quantitative tasks blocked with the named dependency; the field-scoping package still completes. |
| RL-03 | Stream loss | 30 s disconnect: reconnect, replay unseen events, no duplicates or gaps. |
| RL-04 | Reload anywhere | Reload at each scene restores the same state; no completed task re-executes. |
| RL-05 | Stale tab | A command from a stale tab is rejected or safely rebased; newer work is never overwritten. |
| RL-06 | Budget stop | Hitting the per-command budget stops new calls and produces a partial package listing what was not done. |

## Traceability

| ID | Criterion | Pass condition |
|---|---|---|
| TR-01 | Evidence lineage | Every accepted evidence item opens to its source or measurement, area, period, method version, coverage, producing task, and that task's model and tool events. |
| TR-02 | Trace content | For every task the trace lists model calls (model ID, tokens, duration, status), tool calls (name, argument summary, result IDs, duration) and the validation outcome. |
| TR-03 | Trace hygiene | Automated scan finds no API keys, bearer tokens, raw system prompts or hidden reasoning in events or logs shipped to the browser. |
| TR-04 | Excerpts are real | Every accepted published-context excerpt is found verbatim in the extracted text of its cited source page after the normalization in [evaluation](../reference/evaluation.md#extraction-gold-set) (Unicode NFC, each run of White_Space characters collapsed to one space, ends trimmed); a translated statement carries "Machine-drafted translation" with "Show original", and an exported document carries "Machine-drafted translation, needs local review" on every page. |
| TR-05 | Model badges | Every model-derived item names its model, route (Model API, local or provider) and status (validated, advisory, illustration, draft transcript); the model map matches the routing configuration. |
| TR-06 | Usage meter | Per model and per case, calls and tokens come from provider usage fields; cost is computed from a dated price table and labeled an estimate. |
| TR-07 | Per-branch outcomes (proposed, pending the maintainer's approval) | For every explanation branch the trace shows its own model calls and validation outcomes, tagged with the branch ID, and the branch record holds its model, prompt version, loop status, validation outcome, failure code and whether a repair turn ran. Every branch gets the same instructions and no persona; only the explanation differs. |

## Safety and authority

The required failure checks in [Human review and authority](../reference/review-and-authority.md#required-failure-checks) are acceptance tests SA-01 to SA-06 (checks 1 to 6) and SA-10 (check 7, proposed), plus:

| ID | Criterion | Pass condition |
|---|---|---|
| SA-07 | No external side effects | Code search shows no outbound email, messaging, payment or publishing integration in the build; the action schema keeps `externalExecutionEnabled: false`. |
| SA-08 | Demo labels survive export | An exported brief shows demo review labels and outstanding conditions. |
| SA-09 | No fixture leakage | No `example` IDs or synthetic contract values exist in the demo database. |
| SA-10 | Scope holds (proposed, pending the maintainer's approval) | A replayed command that treats an ethnic, religious, national or migrant group as the explanation, and one that names a private individual, each end the plan failed with `out_of_scope` and the host-written message before any model call, with no task, hypothesis or brief line; a planner answer of "Out of scope." ends the same way; a hypothesis that names such a group is refused whatever its status; the IU-01 livelihood question and grazing questions plan normally. The host check is a phrase list that catches wording, not meaning, so the planner prompt carries the same rule. |

## Differentiation

DF-01 to DF-06 are defined in [competitive research](../explanation/competitive-position.md#testable-differentiation-acceptance-tests-df-01-to-df-06). They are P0 acceptance tests: DF-01 and DF-04 prove the entry requirements, DF-02, DF-03, DF-05 and DF-06 prove the case discipline the product claims. DF-03 requires the dependency invalidation described in [Data contracts](../reference/data-contracts.md#idempotency-revisions-and-recovery); DF-05 doubles as SA-01 and SA-02.

Proposed, pending the maintainer's approval: DF-07 and DF-08 test [explanation branches](../reference/agent-orchestration.md#explanation-branches-proposed). With branches in place of the hypothesis comparison, two DF-02 clauses are not met yet and need a decision: "hypothesis linked to existing observation IDs" (branch hypotheses cite the measurements their scores read, not the challenged observation's evidence ID) and "both explanations unresolved with named discriminating measurements" (a branch can now be contradicted by the fixed rules, and the valley has no field checks until the field plan lands).

| ID | Criterion | Pass condition |
|---|---|---|
| DF-07 | Predictions before results (proposed) | Every branch's predictions are committed, at an earlier case revision than its scores, before any measurement, quality record or recipe result is read. A test that reads a result before the predictions commit fails, and a predictions commit that does not apply reads nothing and scores nothing. |
| DF-08 | Status by rule (proposed) | The same predictions and record always give the same statuses, and no status depends on model text: changing only the wording changes no score or status. A status is `contradicted` only when a necessary prediction is not met on adequate data, `consistent` only when every testable prediction is met, and `cannot_be_assessed` otherwise. |

## Accessibility

The release checks in [Accessibility and language](../reference/accessibility-and-language.md#release-checks) are acceptance tests A11Y-01 to A11Y-12. Minimum for submission: A11Y-01 (keyboard-only golden path), A11Y-02 (one screen reader and browser pairing), A11Y-03 (reduced motion), A11Y-04 (200% text), A11Y-07 (chart tables match plotted values) and A11Y-12 (pause and stop).

## Demonstration quality

| ID | Criterion | Pass condition |
|---|---|---|
| DQ-01 | Reproducible take | The golden path in [demo plan](demo-plan.md) runs live, end to end, twice in a row without a failure, within the planned duration. |
| DQ-02 | Mode always visible | Every frame of the video shows the mode label; any replay segment says "Replay". |
| DQ-03 | Fallback ready | A labeled replay recording of a successful live run exists before the final recording session. |
