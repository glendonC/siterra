# Experience storyboard

The [conceptual prototype](../../design/prototype/index.html) simulates these scenes with labeled illustrative values; it performs no live work. Layout anatomy and the visual budget per state are in [UX architecture](ux-architecture.md), components in [components](components.md), motion IDs (MOT-01 to MOT-13) in [motion](motion.md), map views and tours in [scenes and views](scenes.md), demo timing in the [demo plan](../project/demo-plan.md).

Every scene preserves the same case, area and period context. "Real" means work the implementation must actually perform; values shown in this document are placeholders for layout, not results.

## Scene 1: Arrival

| | |
|---|---|
| Objective | Understand the place, the question and the one action within 15 seconds. |
| Visual state | Full-bleed relief map of the Aït Bouguemez valley: hillshade, sparse place labels, the analysis area outlined in mineral with its role label ("Valley catchment, not a pasture, agdal or management boundary", per [data sources and methods](data-sources-and-methods.md#study-area)). Case card bottom left (440 px): place line ("Central High Atlas, Morocco"), title, the case question, two lines ("Reported concern: grazing pressure on shared pastures. Not established: whether vegetation has changed, or why."), primary button **Start investigation**, text link "What Siterra will and will not do". Case pill top left: mark, case title, mode label (Live, or Replay of live run with its date; the conceptual prototype shows "Concept prototype"). Map ornament top right: Views, 3D, zoom. Budget: arrival state. |
| Interaction | Commission; pan and zoom; pick a view (overview, across the valley, along the valley); open the scope popover (capabilities and limits). |
| Firm behavior | None. Snapshot load only. No model call before commissioning. Views are computed from the area geometry without a model call. |
| New records | None. |
| Motion | MOT-01 arrival settle on first visit only; card reveal after the camera stops. Picking a view: MOT-13. Reduced motion: static final view. |
| Feedback | Map attribution visible. If map assets fail, a static relief image with "Interactive map unavailable. The case still works." and the area listed as text. |
| Uncertainty | The concern is labeled reported, not diagnosed. The outline label states what the polygon is not. Oblique views carry "Oblique view: not for reading area or pattern". |
| Next | Start the investigation, then Scene 2. |

## Scene 2: Commission

| | |
|---|---|
| Objective | Confirm scope and see that real work has started. |
| Visual state | The map stays full-bleed; camera padding moves the area left and flattens it to top-down as the investigation sheet enters from the right with **Place** expanded: objective, area card (role, area, source, limitations) and the plan as it is created. The director attaches to the sheet's bottom edge; on focus it shows context chips: Area, Period "2019 to 2025", Focus "none". Case pill status: "Planning". |
| Interaction | Stop the command; open the trace; inspect the area card. |
| Firm behavior (real) | Persist the command; planner model call with the case context; `propose_plan` validated into a bounded task graph; independent tasks start (source research, observation analysis, livelihood context) with at most two concurrent model calls. |
| New records | Command, Task records, plan component. |
| Motion | MOT-02 commission composition (one focal transition), MOT-12 pitch flatten. Plan rows appear only when `task.queued` events arrive (MOT-03). |
| Feedback | The director receipt shows the user's words, then the planner's one-sentence reading of the request once committed. Case pill: "Investigating" and, as a separate element, "2 tasks running". |
| Uncertainty and errors | Planner failure: "Planning failed: the model did not respond in time. Retry." Prior state intact, input kept. A clarifying question from the planner appears in the director with "Answer" and "Continue without". |
| Next | First evidence commit, then Scene 3. |

## Scene 3: Evidence appears

| | |
|---|---|
| Objective | See what was observed, what published research says, and where it applies. |
| Visual state | **Observations** expands; Place collapses to one line. Components: vegetation over time (area median NDVI by month, same-month reference line, spatial spread band, coverage marks) and evidence tiles (observations and published context, each with kind, statement, scope and source). The map shows the NDVI departure layer for the latest complete period, cropland hatched with its reason in the legend. The timeline appears as a 40 px scrubber and expands to its availability and vegetation departure rows while Observations is open. The legend island appears bottom left. |
| Interaction | Select an evidence item (its scope lights on the map, linked highlighting); open the inspector; hover or focus the chart for exact values. |
| Firm behavior (real) | Source research over the case corpus extracts located statements; observation analysis reads the validated bundle through precomputed recipes (`coverage_summary`, `monthly_departure`); the validator checks claim kinds, sources and numbers; commit. |
| New records | Source, Evidence, Measurement, TemporalObservation; components `temporal_comparison`, `evidence`. |
| Motion | MOT-03 component arrival; timeline rows grow; raster fade-in. The section change is the single focal transition. |
| Feedback | Director milestones from events, for example "Read 6 of 7 sources (1 unavailable)" and "Loaded 84 months; months below the coverage policy are hatched". Counts are real. |
| Uncertainty and errors | Low-coverage months are hatched and not selectable as observations. Missing bundle: Observations shows "No validated observations" with the missing dependency and the field-scoping alternative. An unavailable source keeps its citation and is never summarized. |
| Next | Time exploration, then Scene 4. |

## Scene 4: Historical exploration

| | |
|---|---|
| Objective | Compare periods and read change without false claims. |
| Visual state | One committed period drives the timeline cursor, the map layer, the chart cursor and the legend title ("Vegetation departure from the April median, Apr 2022, 82% of area observed"). Optional comparison: pick a second period to show two small map renderings with one shared scale in the sheet; the main map shows the selected period. |
| Interaction | Drag or click the timeline; arrows by month, Shift with arrows by year, Home and End; Escape cancels a drag. Play runs the time-lapse tour (same month across the years), only when pressed, with Pause and Stop. |
| Firm behavior | None. View state only; neighbor periods prefetched. |
| New records | None (view state in the URL). |
| Motion | MOT-04 period swap: label and cursor at once, raster crossfade only after the new asset is ready. Time-lapse: MOT-13. |
| Feedback | The old raster stays labeled with its own period until the new one is ready. |
| Uncertainty and errors | Disabled months explain why on focus ("Snow or cloud: 31% observed"). A missing map asset shows "No map observation for this period", never the previous image. The time-lapse shows gaps as gaps. |
| Next | The user asks why, then Scene 5. |

## Scene 5: Competing explanations (signature)

| | |
|---|---|
| Objective | Test whether rainfall variability, not grazing, could explain the vegetation pattern. |
| Visual state | The user types "Could drought explain this instead?" with chips Area, Period "Apr 2022", Focus "Vegetation over time". **Explanations** opens with the answer card (the question, evidence tiles, the finding with evidence chips; next questions appear as director suggestions), the hypothesis ledger at level 1 (one line per explanation: rainfall variability, grazing-related pressure, snow and phenology timing, observation artifacts) and the aligned comparison (vegetation departure above, rainfall departure below, shared month axis, separate units and scales). The camera frames what the answer binds (`answer_focus`) and the map adds the native rainfall grid ("Rainfall grid about 5 km; N cells cover this area"). The timeline adds a rainfall departure row. |
| Interaction | Expand the ledger to the evidence matrix; select a hypothesis to light its evidence on the map; open any evidence; ask a follow-up. |
| Firm behavior (real) | The planner adds tasks; recipes return the aligned departures and same-sign counts (`aligned_antecedent`); hypothesis comparison writes typed hypotheses and relationships from records only; numeric provenance check; commit. |
| New records | Rainfall measurements, observation evidence, Hypothesis revisions, Relationships, components `hypothesis_comparison` and an aligned `temporal_comparison`. |
| Motion | MOT-05: evidence moves from Observations into the ledger, then rows settle. MOT-06 connectors only on selection (P1). The rainfall grid fades in after the ledger settles. |
| Feedback | "Updated Explanations: ledger and rainfall comparison." Links focus each component. |
| Uncertainty and errors | Status words, never scores: rainfall may be "Consistent with available evidence" while grazing is "Cannot be assessed with current data" with its missing evidence listed (animal numbers and timing, access calendar, field vegetation surveys). No rainfall bundle: the rainfall hypothesis is "Cannot be assessed with current data", with the dependency. |
| Next | The user raises livelihoods, then Scene 6. |

## Scene 6: Livelihood consequences

| | |
|---|---|
| Objective | Keep the people who depend on the pastures inside the analysis. |
| Visual state | **Responses** opens with livelihood constraints: dependencies (seasonal access, mobility, fodder in drought years), who could bear costs (herding households; holders of local landscape knowledge, including women documented in published fieldwork), and unknowns marked "Not collected" (herd sizes, current access calendar, disputes, income dependence). |
| Interaction | Open sources; mark an unknown as "I can provide this" (P2: structured input). |
| Firm behavior (real) | Livelihood and governance research over the corpus, including comparable places as published context; produces published-context evidence and field requirements. |
| New records | Evidence (`scientific_context`, `field_requirement`), component `livelihood_constraints`. |
| Motion | Quiet reveal (MOT-03). Unknown rows carry a dashed outline. |
| Uncertainty and errors | One line at the top: "No household data was collected. Regional study findings are not local estimates." |
| Next | "What could be done?", then Scene 7. |

## Scene 7: Intervention exploration

| | |
|---|---|
| Objective | Compare defensible responses, their conditions and who decides. |
| Visual state | The intervention comparison opens in the inspector overlay with four columns: participatory monitoring before any access change; negotiated seasonal rest within existing institutions; mobility and feed contingency in drought years; defer until the field check. Rows: what it is, evidence basis, who decides, livelihood exposure, reversibility, field prerequisites, resources, what would rule it out, comparable places (P1). No scores, no forecasts. |
| Interaction | Expand a column; open any evidence; ask for a variant. |
| Firm behavior (real) | Intervention feasibility task from hypotheses, constraints and sources. |
| New records | Intervention, ResourceRequirement, Relationships (`proposes_response`, `requires_authorization`). |
| Motion | Columns reveal in order; nothing reorders under the pointer. |
| Uncertainty and errors | Every option is labeled "Candidate, needs validation". Quantities appear only when sourced; otherwise "Unknown, to be established locally". |
| Next | "Prepare the next steps", then Scene 8. |

## Scene 8: Action preparation

| | |
|---|---|
| Objective | Get a reviewable field-validation package. |
| Visual state | **Next steps** opens: the field-validation plan (objective, sampling strata drawn on the map, measurement table, roles, permissions, resource categories, dependencies, status Draft) and the decision brief (Known, Uncertain, Measure next, Involve, Siterra can prepare, Needs authorization, What happens next). |
| Interaction | Open any brief line's evidence; request changes; go to review. |
| Firm behavior (real) | The package task composes from accepted records; the validator requires evidence IDs on every brief line and blocks "Ready for review" if a critical dependency is missing. |
| New records | OperationalAction (`draft`, then `awaiting_review`), Brief, ReviewDecision requests per role. |
| Motion | MOT-11 brief composition: sections reveal in reading order with their evidence chips. |
| Uncertainty and errors | Missing critical scope blocks readiness and names the missing input. Drafted messages stay drafts; no send control exists. |
| Next | Review, then Scene 9. |

## Scene 9: Human review

| | |
|---|---|
| Objective | Decide what this role can decide, without reading the transcript. |
| Visual state | Review queue with role tabs (Scientific, Community and livelihood, Program). The selected item: proposed action, the reason, supporting evidence, uncertainty, potential ecological and livelihood effects, required authority, alternatives, what each decision means and does not mean, remaining conditions. A pinned action bar: Scientific "Record scientific review (demo)" and "Request changes"; Community and livelihood "Mark consultation required" with the note "Requires a locally mandated process. Not available in this demo."; Program "Mark program review complete (demo)" and "Defer decision". Each verb has a keyboard shortcut. |
| Interaction | Record role decisions with conditions and comments. |
| Firm behavior (real) | Store ReviewDecision for exact entity versions with `mode: demo`; recompute action status; nothing external happens. |
| New records | ReviewDecision. |
| Motion | Inline confirmation; status change (120 ms). |
| Uncertainty and errors | Case changed since the view loaded: decisions disabled with "The case changed. Review revision 10." The action can reach "Prepared (demo)" with "Community consultation outstanding" still listed. |
| Next | Return later, then Scene 10. |

## Scene 10: Continuity

| | |
|---|---|
| Objective | Trust that Siterra keeps the case. |
| Visual state | The case pill menu shows the revision and save time. Case history (P1): a change ledger of revisions with the command that produced each, what changed, and its outputs; opening one shows a read-only banner ("Viewing revision 3. Return to the current case."). One suggestion to continue ("Add field observations when they exist"). |
| Interaction | Reload; open history; continue with a new command. |
| Firm behavior (real) | Snapshot plus event replay from the last sequence; no re-execution and no theatrical replay. |
| New records | A new command creates new revisions; earlier briefs remain linked to their original evidence versions. |
| Motion | None on reload beyond a 120 ms content fade. |
| Uncertainty and errors | Network loss: last saved snapshot, read-only, "Reconnecting"; the stream resumes from the last sequence. |

## Scene 11: Share (P1)

| | |
|---|---|
| Objective | Let the person who commissioned the case bring it to officials or community groups themselves. |
| Visual state | Export dialog: language (English or French), what is included (brief, field plan, evidence list), the translation status ("Machine-drafted translation, needs local review"), demo labels and outstanding conditions; or a read-only link the user creates and can revoke. |
| Interaction | Choose language and contents; export a PDF or create the link. |
| Firm behavior (real) | Muse drafts the French text from the accepted English records; each translated line is bound to its source revision and keeps the original alongside; nothing is sent. |
| New records | TranslationRecord (contracts 1.3), export record. |
| Motion | None beyond the dialog (MOT-07 timing). |
| Uncertainty and errors | A source revision that changes after export marks the export stale. No send, email or messaging control exists. |

## Views and tours (any scene)

The Views menu is available from arrival on. Views computed from the area geometry: overview (top-down), across the valley and along the valley (obliques), and an orbit tour if it holds 50 fps on the demo laptop. Once observations exist, the time-lapse tour plays the same month across the years. A picked view overrides the default map until the user's next command, and the legend says so. Every fact a view shows is also in the sheet.

## Required failure scenes

These are product states, not demo exceptions. Each has an acceptance test in [acceptance criteria](../project/acceptance-criteria.md).

| Failure | Required behavior |
|---|---|
| Source unavailable | Keep citation metadata, mark it unavailable, never summarize unread content. |
| Malformed or refused model output | Reject the whole proposal; failed task with Retry; prior records untouched. |
| Scientific input missing | Quantitative tasks blocked with the named dependency; the field-scoping package is still produced. |
| Conflicting revision | Refresh the snapshot; re-plan only if inputs changed; never overwrite newer work. |
| Stream interruption | "Reconnecting"; replay unseen sequences; a gap triggers a snapshot refetch. |
| Budget or time limit | Stop new calls; assemble a partial package that lists what was not done. |
| Forecast request | Refuse with what would be needed (record length, field calibration, a backtest) and create an analysis or field requirement ([analysis recipes](analysis-recipes.md#forecasting-policy)). |
