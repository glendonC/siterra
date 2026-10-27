# Microcopy

Status: adopted string set for the build, 2026-10-27 ([ADR-0043](../decisions/0043-write-in-one-plain-voice-and-lint-product-copy.md)). The build moves these strings into message catalogs (I18N-01); the catalog then becomes the source of truth.

How to read this file:

- **Current** strings come from the first conceptual prototype (v1) in `design/prototype/` (`index.html`, `app.js`, `components.js`, `fixture.js`) or, where the prototype has none, from the specs in `docs/reference/`. "(spec)" marks a string that exists only in a spec; "none" means nothing exists yet.
- **Proposed** strings follow the [voice and tone guide](voice-and-tone.md). "Keep" means the current string already meets the guide.
- Numbers in examples are the prototype's illustrative values. Live strings fill counts from events and records.
- Placeholders use ICU syntax: `{count}`, `{date}`, `{n}`. Buttons are in [brackets].
- "Why" cites voice principles as V1 to V5 and lint rules as VT-xx.

## 1. Demo opening

The recording should have no title card: the demo plan requires the mode badge in every frame, so the first words a viewer reads are the arrival screen's own. These are the 4 lines a viewer reads in the first 12 seconds, plus the button.

| Line | Current | Proposed | Why |
|---|---|---|---|
| 1. Location | Aït Bouguemez valley, Central High Atlas, Morocco | Central High Atlas, Morocco | The title now names the valley, so the location line does not repeat it. Replaces the storyboard's "Case · ..." eyebrow (VT-04). |
| 2. Title | Pasture resilience in the Aït Bouguemez valley | Grazing and livelihoods in the Aït Bouguemez valley | Names both halves of the case (ADR-0003) without an abstract term or a finding. |
| 3. Question | How can communities assess grazing-related pressure on shared pastures and evaluate practical responses without undermining pastoral livelihoods? | Is grazing putting pressure on the valley's shared pastures, and what should be checked before anyone changes how they are used? | Concrete verbs in place of three abstract noun phrases. It no longer implies that communities run the assessment, and it names the decision the field-validation plan serves (V2). [H] Test in PC-01. |
| 4. Status | Reported: Concern about grazing pressure on shared pastures. Not established: Whether vegetation has changed, or why | Keep, as two labeled fields | The most honest lines on the screen: reported, not diagnosed (V1, V3). |
| Button | [Commission investigation] | [Start investigation] | On a button, "Commission investigation" can read as a noun phrase (an investigation by a commission), and "commission" also means a fee. "Start" cannot be misread. [H] If the firm metaphor must stay on the button, use [Commission the investigation]: the article forces the verb reading. Test both in PC-01, then update the demo plan's click instruction. |
| Link | What Siterra will and will not do | Keep | Clear; the future tense fits before work starts. |
| Mode badge | LIVE or REPLAY (spec); Concept prototype (prototype) | Live | Sentence case (VT-08); see section 18. |

What the viewer reads, in order:

1. Central High Atlas, Morocco
2. Grazing and livelihoods in the Aït Bouguemez valley
3. Is grazing putting pressure on the valley's shared pastures, and what should be checked before anyone changes how they are used?
4. Reported: concern about grazing pressure on shared pastures. Not established: whether vegetation has changed, or why.

## 2. Scope popover

| Element | Current | Proposed | Why |
|---|---|---|---|
| Heading | Siterra will | Keep | |
| Item | Plan the investigation and retrieve published research | Keep | |
| Item | Load satellite and rainfall observations for the analysis area | Keep | |
| Item | Compare explanations and keep unresolved ones open | Keep | |
| Item | Prepare a field-validation plan and the reviews it needs | Keep | |
| Heading | Siterra will not | Keep | |
| Item | Contact anyone, spend money or publish anything | Contact anyone, spend money, or publish anything | Serial comma |
| Item | Make or authorize land-management decisions | Keep | |
| Item | Claim consent, partnerships or outcomes | Claim consent, partnerships, or outcomes | Serial comma |
| Footer | none | Observations are precomputed from public satellite and rainfall data. Planning, reading, and comparison run live. | Says what "Live" covers (ADR-0021) before anyone asks. |

## 3. Case pill

| Element | Current | Proposed | Why |
|---|---|---|---|
| Case name | Pasture resilience, Aït Bouguemez | Grazing and livelihoods, Aït Bouguemez | Matches the title |
| Status before the first request | Draft | Not started | Nothing has run; the case is not a draft. |
| Status words | Planning; Investigating; Needs your input; Ready for review; Prepared (demo); Paused; Failed command (spec) | Keep all except "Failed command", which becomes "Request failed" | "Command" is internal language. |
| Running count | 2 tasks running | Keep, as `{count, plural, one {# task running} other {# tasks running}}` | Plural through ICU |
| Revision | Revision 9 | Keep | |
| Save time | Saved just now; Saved 2 min ago | Keep, with the absolute time on focus: "Saved at 10:21" | |
| Buttons | [Activity] [History] | Keep | |
| Panel titles | Activity and trace; Case history | Activity; History | A button and the panel it opens share one name (WRT-16). |

## 4. Buttons and controls

| Where | Current | Proposed | Why |
|---|---|---|---|
| Arrival | [Commission investigation] | [Start investigation] | Section 1 |
| Director | [Send] (aria-label "Send") | Keep; aria-label "Send request" | Names the object |
| Director, while running | (spec) cancel available | [Cancel request] | Verb plus object |
| Director, needs input | (spec) [Answer] [Proceed without] | [Answer] [Continue without an answer] | "Proceed without" leaves out what is skipped. |
| Any failure | Retry | [Retry] | Keep |
| Component with changed inputs | (spec) Inputs changed; re-run | Inputs changed. [Run again] | Plain verb, no hyphenated coinage |
| Area card | Show on map | Keep | |
| Plan row | View in trace | View activity | Matches the case pill menu item |
| Chart | Table / Hide table | [Show table] / [Hide table] | Verb-first pair |
| Director history | Expand / Collapse | [Show earlier requests] / [Hide earlier requests] | Says what expands |
| Receipt | Hide steps | [Hide steps] / [Show steps] | Pair |
| Brief | Open review | Keep | |
| Inspector | Open source | Open {short title}, for example "Open Romagny et al. 2008" | "Open source" reads as open-source software; a link names its destination (WRT-16, VT-42). |
| Panels | Back; Close | Keep | |
| Read-only revision | (spec) Return to current | [Return to current revision] | Names the destination |
| New results | (spec) View new findings | View new findings ({n}) | Accessibility doc; the count says how many are held |
| Unknown row (P2) | (spec) I can provide this | Keep | User voice |
| Map | aria-label "Toggle 3D relief" | aria-label "3D relief", with aria-pressed | A toggle keeps one label; its state carries on/off. |
| Map | Zoom in; Zoom out; Reset view to the analysis area | Keep | |
| Review | [Record scientific review (demo)] [Request changes] [Mark consultation required] [Mark program review complete (demo)] [Defer] | Keep all except [Defer decision] | VT-40; section 14 |

## 5. Director

| Element | Current | Proposed | Why |
|---|---|---|---|
| Visible label | none (hidden label "Ask Siterra or give an instruction") | Ask Siterra | The accessibility doc requires a persistent visible label (WRT-09). |
| Hint under the label | none | Siterra uses the area, period, and focus shown above. | Explains the chips (IU-03). |
| Placeholder | Ask Siterra or give an instruction | none | Placeholders vanish, are not always announced, and often fail contrast (WRT-09). |
| Chip group label | Context sent with your request (aria only) | Sent with your request (visible) | |
| Chips | Area Valley catchment; Period 2019 to 2025; Focus None | Area: Valley catchment; Period: 2019 to 2025; Focus: nothing selected | "None" can read as "no focus possible". |
| Suggestion | Could drought explain this instead? | Keep | The signature question (ADR-0008). It is the user's word; Siterra's reply translates "drought" into what is measured. |
| Suggestion | What about households that rely on these pastures? | Keep | |
| Suggestion | What could be done, and what should be checked first? | Keep | |
| Suggestion | Prepare the next steps for review. | Prepare the next steps for review | No period on a single fragment (WRT-17) |
| Shortcut tooltip | (spec) "/" focuses the input | Press / to ask Siterra | |
| Interpretation: start | Assess evidence of grazing-related pressure in the valley catchment, compare explanations, and prepare a field-validation plan. | Siterra will check whether vegetation in the catchment has changed since 2019, compare possible explanations, including grazing, and prepare a field-validation plan. | Siterra as the actor (V4). Neutral: it does not set out to find grazing evidence. |
| Interpretation: drought | Compare vegetation departures with rainfall departures for 2019 to 2025 on the same months, then reassess every explanation. | Siterra will compare monthly vegetation with rainfall for 2019 to 2025, then reassess every explanation. | Plainer; names what is measured instead of "drought" |
| Interpretation: households | Find documented livelihood and governance constraints and list what must be collected locally. | Siterra will list published livelihood and governance constraints and what must be collected locally. | |
| Interpretation: options | Screen candidate responses against the evidence, livelihood exposure and authority, without ranking them. | Siterra will compare possible responses by evidence, effects on livelihoods, and who decides. It will not rank them. | Two short sentences |
| Interpretation: prepare | Build a field-validation plan from the open gaps and compose a decision brief. | Siterra will turn the open questions into a field-validation plan and write a decision brief. | |
| Sending | none | Sending | |
| Accepted | Command accepted | Request received | "Command" is internal. |
| Needs input | (spec) a question with Answer and Proceed without | Siterra needs an answer to continue: {question} [Answer] [Continue without an answer] | |
| Succeeded | Updated Observations: vegetation over time, 5 evidence items | Keep the pattern: Updated {section}: {visible component names} | |
| Partial | (spec) what was not done | Finished with gaps. Not done: {tasks}. [Run remaining tasks] | V3 |
| Failed | (spec) cause, Retry, input preserved | Request failed: {cause}. Your text is kept. [Retry] | V5 |
| Rejected as stale | (spec) The case changed; resend against the current version | The case changed while you were writing, so nothing was run. Your text is kept. [Send on revision {n}] | Says what did and did not happen |
| Concept mode reply | This prototype only simulates the storyboard commands, in order. | Keep (concept mode only) | |

## 6. Plan, tasks, and milestones

### Plan component

| Element | Current | Proposed | Why |
|---|---|---|---|
| Heading | Investigation plan | Keep | |
| Interpretation | Siterra will gather published evidence and satellite observations for the catchment, compare explanations for any vegetation change, and prepare a field-validation plan. It will not contact anyone or make land decisions. | Siterra will gather published evidence and satellite observations for the catchment, compare explanations for any vegetation change, and prepare a field-validation plan. It will not contact anyone or make land-management decisions. | Same phrase as the scope popover |
| Group headings | (spec) Needs you; Running; Done | Needs your input ({count}); Running ({count}); Done ({count}) | |

### Task rows (kind, then the question it answers)

| Kind (current) | Question (current) | Proposed | Why |
|---|---|---|---|
| Plan | Define the objective, area and available data | Define the objective, area, and available data | Serial comma |
| Source research | What does published research say about pastures and their governance here? | Keep | |
| Observation analysis | How has vegetation changed in the catchment since 2019, and how complete is the record? | Has vegetation in the catchment changed since 2019, and how complete is the record? | "How has it changed" presumes a change that the case card says is not established. |
| Livelihood and governance research | Who depends on these pastures and under what rules? | Keep | |
| Hypothesis comparison | Which explanations fit the observations? | Kind: Explanation comparison. Question: keep. | "Explanation" in headings (terminology) |
| Field-validation package | What should be measured next, by whom, with what permissions? | Kind: Field-validation plan. Question: keep. | One name for the deliverable |

### Task status words

| State | Current | Proposed | Why |
|---|---|---|---|
| `queued` | Waiting on inputs | Queued; when another task must finish first: Waiting for {task} | GOV.UK gives dependency-blocked tasks their own status (WRT-06). |
| `running` | Running | Keep | |
| `awaiting_input` | none | Needs your input | |
| `succeeded` | Done | Keep | |
| `partial` | none | Partly done | |
| `failed` | Failed | Failed: {cause} [Retry] | Cause inline (components spec) |
| `cancelled` | none | Canceled; when replaced: Canceled: replaced by a newer request | Vercel shows why a build was canceled, for example a newer commit (WRT-33). US spelling (VT-37). |
| `awaiting_review` | none | Awaiting review | |

### Milestones

| Current | Proposed | Why |
|---|---|---|
| Command accepted | Request received | "Command" is internal. |
| Planned 6 tasks | Keep | |
| Retrieving published sources | Keep | |
| Loading monthly observations | Keep | |
| Retrieved 5 of 6 sources (1 unavailable) | Retrieved 5 of 6 sources (1 unavailable, not used) | States the consequence |
| Loaded 84 monthly observations; 23 below the coverage policy | Loaded 84 monthly observations, 23 of them below the 70% coverage threshold | A number people can check |
| Livelihood and governance research (shown as a running milestone) | Reading sources on livelihoods and governance | A milestone is an action. |
| Updated Observations: vegetation over time, 5 evidence items | Keep | |
| Loaded rainfall for 84 months (CHIRPS grid, 31 cells) | Loaded 84 months of rainfall (CHIRPS grid, 31 cells) | Count right after the verb |
| Aligned vegetation and rainfall by month | Keep | |
| Compared 4 explanations | Keep | |
| Updated Explanations: ledger and aligned comparison | Updated Explanations: competing explanations, vegetation and rainfall by month | Visible names, not internal ones ("ledger") |
| Read 3 sources on livelihoods and governance | Keep | |
| Listed 5 unknowns that need local information | Keep | |
| Updated Responses: livelihood constraints | Keep | |
| Prepared 4 candidate responses | Keep | |
| Linked each to its evidence and decision-makers | Linked each response to its evidence and to who decides | |
| Updated Responses: possible responses | Keep | |
| Derived strata from the terrain model | Drew sampling strata from the terrain model (elevation and slope direction) | Plain words for the method |
| Mapped each measurement to an open gap | Linked each measurement to an open question | |
| Composed the decision brief; every line linked | Wrote the decision brief. Every line links to its evidence. | Two sentences, no semicolon |
| Updated Next steps: field-validation plan and brief | Updated Next steps: field-validation plan, decision brief | Visible names |

## 7. Sections

Section names stay: Place, Observations, Explanations, Responses, Next steps.

| Section | Current summary | Proposed summary | Why |
|---|---|---|---|
| Place, running | {role label}, {area} km² | Valley catchment, {area} km². Not a pasture or management boundary. | Two facts, two sentences; area to one decimal |
| Place, done | {role label}, 6 tasks planned | 6 tasks planned | The role label is on the map and the area card. |
| Observations | Vegetation 2019 to 2025, 23 months below coverage policy | Vegetation 2019 to 2025, with 23 months below the 70% coverage threshold | |
| Observations, later | Vegetation over time and 5 evidence items | Keep | |
| Explanations | 4 explanations, none scored; grazing cannot be assessed yet | 4 explanations. Grazing cannot be assessed with current data. | The exact status words; "none scored" is design commentary. |
| Responses, constraints | Livelihood constraints, 5 unknowns | 5 local unknowns not collected | |
| Responses, options | Livelihood constraints and 4 candidate responses | 5 unknowns not collected. 4 possible responses, not ranked. | |
| Next steps | Field-validation plan and decision brief | Keep | |
| Before work | Not started | Keep | |

Section status chips today mix states and counts ("Planning", "Done", "Ready", "2 open", "Not collected: 5", "Candidates", "Ready for review"). Proposed: one fixed set of states, with counts moved to the summary line: Not started, Running, Needs your input, Done, Ready for review, Inputs changed (WRT-05, WRT-06).

## 8. Evidence cards and inspector

### Claim kind labels

Keep the labels (Observation, Published context, Hypothesis, Model estimate, Scenario, Field requirement, Verified outcome) and add the one-line meanings from [voice and tone](voice-and-tone.md) to the inspector and the legend.

### Evidence examples

| Item | Current | Proposed | Why |
|---|---|---|---|
| E1 value | -0.03 NDVI median departure | −0.03: NDVI difference from the same-month median | Minus sign (VT-36); says what the number is |
| E2 statement | Winter months often fall below the coverage policy because snow and cloud are masked; 23 of 84 months are below it. | In 23 of 84 months, less than 70% of the area was observed, mostly in winter, when snow and cloud are masked. | The count leads; a threshold, not a policy |
| E3 value | -48% of the seasonal mean | 48% below the 1991 to 2020 mean | "−48% of the mean" can be read as "48% of the mean". |
| C2 statement | Interviews with 50 farmers in three Azilal municipalities link changes in pastoral systems to climate, resource availability and mobility, with different trajectories at different elevations. | Interviews with 50 farmers in 3 Azilal municipalities link changes in pastoral systems to climate, resource availability, and mobility, with different trajectories at different elevations. | Numerals (VT-34); serial comma |
| C4 scope | Three villages in the valley, 2026 publication | 3 villages in the valley, published 2026 | Numerals |
| SCI-07 venue | Copernicus via Earth Engine catalog | Copernicus, through the Earth Engine catalog | VT-18 |
| Illustrative tag | Illustrative values, not measurements | Keep | |

### Inspector rows

| Row | Current | Proposed | Why |
|---|---|---|---|
| Data bundle | bundle_ndvi_monthly (illustrative) | Label "Dataset"; value "Sentinel-2 monthly NDVI", ID in mono | "Bundle" is internal. |
| Access | Full text retrieved in planning; Publisher text and abstract inspected | Full text retrieved; Abstract and publisher page read | Plain verbs |
| Informs | Whether grazing pressure can be assessed at all | Label "Decision it informs"; value keep | |
| Produced by | Observation analysis [View in trace] | Observation analysis [View activity] | |
| Wording (new) | none | Drafted by the model; numbers checked against the record | Carbon for AI marks AI-generated content and links it to an explanation (WRT-26); HAX guideline 11 (WRT-52). |
| Relations, empty | None recorded yet | Keep | |
| Review | Not expert-reviewed | Keep | Exactly right |
| Kind, Scope, Value, Method, Coverage, Source, Limits, Record | (labels) | Keep | |

## 9. Explanations (hypothesis ledger)

| Element | Current | Proposed | Why |
|---|---|---|---|
| Title | Competing explanations | Keep | |
| Caption | aria-label: "Competing explanations. Several can hold at once; statuses are words, never scores." | Visible caption: "Several explanations can fit at once. Siterra does not rank them." aria-label: "Competing explanations" | Talks to the reader, not about the design |
| Columns | Supports; Contradicts; Missing | Supports; Contradicts; Missing evidence | Spec wording |
| More indicator | +2 | +2 more | |
| Empty cell | None | Keep | |

### Status words

| Status | Current label | Proposed label | Description (detail panel and tooltip) | Does not mean |
|---|---|---|---|---|
| `untested` | Not yet tested | Keep | No evidence has been compared with it yet. | That it was dismissed |
| `consistent` | Consistent with available evidence | Keep | Fits the evidence so far. Other explanations can fit too. | Proof, or the only explanation |
| `inconsistent` | Inconsistent with available evidence | Contradicted by available evidence | At least one accepted observation conflicts with it as stated. | Disproof of every version of it |
| `inconclusive` | Cannot be assessed with current data | Keep | The data that would decide it are missing. Missing: {list}. | That it has been ruled out |
| `stale` | Needs re-assessment | Needs reassessment | An input changed after it was assessed. | That the earlier result was wrong |

Why change "Inconsistent": it differs from "Consistent" by two letters and shares the same long tail, so a skimming reader or a screen-reader user can miss the negation [J]. "Contradicted" matches the ledger's "Contradicts" column and the `contradicts` relation, so one word carries one meaning. "Cannot be assessed with current data" stays exactly as written: it is the demo's signature result and already in the data contract, the storyboard, and the evaluation fixtures.

### Explanation titles and assessments

| Item | Current | Proposed | Why |
|---|---|---|---|
| Title | Rainfall variability | Keep | |
| Title | Grazing-related pressure | Keep | |
| Title | Snow and growing-season timing | Keep | |
| Title | Observation artifacts | Artifacts in the satellite data | Plainer |
| Rainfall assessment | Lower spring greenness coincides with a dry wet season. Coincidence is not attribution. | Lower spring greenness came after a wet season with below-average rainfall. Timing alone does not show cause. | "Dry wet season" reads as a contradiction; "attribution" is jargon. |
| Grazing assessment | No livestock or field data exist in the case, so this explanation cannot be assessed yet. | The case has no livestock or field data, so Siterra cannot assess this explanation yet. | Siterra as the actor |
| Snow assessment | Winter observations are sparse, so timing effects cannot be separated from rainfall. | Keep | |
| Artifact assessment | Spring months meet the coverage policy, so masking alone does not explain the spring departure. | Spring months meet the 70% coverage threshold, so masking alone does not explain the lower spring values. | |
| Relations line | Relations: E3 supports; E1 supports; needs verification: local gauge records. | E3 and E1 support this explanation. Needs verification: local gauge records, and a climate-corrected productivity trend over a longer record. | Reads as a sentence |

## 10. Livelihood constraints

| Element | Current | Proposed | Why |
|---|---|---|---|
| Title | Livelihood constraints | Keep | |
| Notice | No household data was collected. Findings from regional studies are not local estimates. | Keep | A model "does not mean" line |
| Group | Dependencies | Keep | |
| Group | Who could bear costs | Keep | |
| Group | Unknown locally | Not known locally | Reads as a heading |
| Row status | Not collected | Keep | |

## 11. Possible responses

| Element | Current | Proposed | Why |
|---|---|---|---|
| Title | Possible responses | Keep | |
| Option subtitle | Candidate, needs validation | Keep | |
| Option | Participatory monitoring first | Keep | |
| Option | Negotiated seasonal rest | Keep | |
| Option | Dry-year mobility and feed plan | Keep | |
| Option | Defer pending field validation | Wait for field validation | Plainer |
| Row | Livelihood exposure | Effect on livelihoods | Plainer |
| Rows | What it is; Evidence; Who decides; Reversibility; Needs first; Ruled out if; Resources | Keep | |
| Note | No option is ranked or scored. Effects are not forecast. | Keep | Allowlisted for VT-21 |

## 12. Field-validation plan

| Element | Current | Proposed | Why |
|---|---|---|---|
| Title | Field-validation plan | Keep | |
| Status | Draft; Awaiting review; Prepared (spec) | Draft; Awaiting review; Prepared (demo) | Demo label wherever review is demo |
| Label | Informs | Decision it informs | |
| Label | Strata | Sampling strata | |
| Strata text | Elevation band by slope aspect, from the terrain model. Band thresholds are illustrative; the local team chooses sites. | Elevation band by slope direction, from the terrain model. Thresholds are illustrative. The local team chooses sites. | Plain term for "aspect"; no semicolon |
| Group | Resources (estimate status) | Resources and estimates | |
| Group | Permissions and consultation | Keep | |
| Table headers | Measure; How; When; Who | Keep | |

## 13. Decision brief

| Element | Current | Proposed | Why |
|---|---|---|---|
| Sections | Known; Uncertain; Measure next; Involve; Siterra can prepare; Needs authorization; What happens next | "Needs authorization" matches the components and motion specs | Clear and complete |
| Status | Draft; Ready for review | Keep | |
| Known line 2 | The 2021 to 2022 wet season was dry on the rainfall grid (illustrative). | Rainfall in the 2021 to 2022 wet season was below average on the rainfall grid (illustrative). | Says what was measured |
| Uncertain line 1 | Whether grazing pressure contributes: no livestock or field data exist. | Keep | |
| Prepared state (new line) | none | Prepared (demo) does not mean approved to act. Nothing has been sent or scheduled. | V3, V4 |

## 14. Review

| Element | Current | Proposed | Why |
|---|---|---|---|
| Panel title | Review the field-validation plan | Keep | |
| Tag | Demo review | Demo review: grants no real authority | |
| Proposed action | Proposed action: field-validation plan, revision 9 | Keep | |
| Field labels | Why; Uncertain; Possible effects; Authority needed; Alternatives; Status; Remaining conditions | Keep | |
| Authority text | Field visits and contact with community members require locally established consent and permissions. This app grants none. | Field visits and contact with community members need locally established consent and permissions. Siterra grants none. | One actor name |

### Role panels: what each decision means and does not mean

| Role | Part | Current | Proposed |
|---|---|---|---|
| Scientific review | Means | Method, data sufficiency and interpretation limits were reviewed at revision 9. | You reviewed the method, data sufficiency, and limits of interpretation at revision 9. |
| | Does not mean | Permission to act, or proof of what causes vegetation change. | Keep |
| | Buttons | [Record scientific review (demo)] [Request changes] | Keep |
| | Status | Requested; Review recorded (demo) | Keep |
| Community and livelihood review | Requires | A locally mandated process with documented participants. It cannot be completed inside this demo. | A locally mandated process with documented participants. It cannot be completed in this demo. |
| | Does not mean | Agreement, consent or representation of everyone who uses the pastures. | Agreement, consent, or representation of everyone who uses the pastures. |
| | Button | [Mark consultation required] | Keep |
| | Status | Not available in this demo; Consultation required | Keep |
| Program review | Means | Scope, roles and resource categories fit the program mandate. | You confirmed that the scope, roles, and resource categories fit the program mandate. |
| | Does not mean | Permission for land-use changes or third-party commitments. | Permission for land-use changes, or commitments by anyone else. |
| | Buttons | [Mark program review complete (demo)] [Defer] | [Mark program review complete (demo)] [Defer decision] |
| | Status | Requested; Marked complete (demo) | Keep |

"Means" now names the person who is accountable ("You reviewed"), which is the point of a role-scoped review.

### Confirmations, stale reviews, and the authority boundary

| Situation | Current | Proposed |
|---|---|---|
| Scientific review recorded | Scientific review recorded in demo mode. | Keep |
| Consultation marked | Community consultation marked as required. | Keep |
| Program review recorded | Program review marked complete in demo mode. Community consultation is still outstanding. | Keep |
| Case changed after the review opened | (spec) Case changed; review the current version | The case changed after this review opened. You are reviewing revision 9; the case is now at revision 10. [Review revision 10] |
| User asks Siterra to act, for example "close grazing access" | (spec) bounded proposal, authority not established, no action | Siterra cannot close or change access to pastures. Authority over access is not established in this case. Siterra prepared a discussion and validation proposal for the people who decide. |

## 15. Empty states

| Where | Current | Proposed |
|---|---|---|
| Observations, before work | Not started | Not started. Siterra loads satellite observations after the investigation starts. |
| Explanations, before work | Not started | Not started. Ask about the observations, for example: Could drought explain this instead? |
| Responses, before work | Not started | Not started. Siterra screens possible responses after it compares explanations. |
| Next steps, before work | Not started | Not started. Siterra builds the field-validation plan from the open questions. |
| Evidence list | none | No evidence in this section yet. |
| Ledger cell | None | Keep |
| Inspector relations | None recorded yet | Keep |
| History | none | No earlier revisions. |
| Activity | none | No activity yet. Each model call, tool call, check, and save appears here as it happens. |
| Map, no asset for the period | No map observation for this period | Keep |
| No validated observation bundle | (spec) No validated observations | No validated satellite observations. The data for this area did not pass checks, so Siterra cannot measure vegetation change. The field-validation plan still lists what to measure on the ground. |
| No rainfall bundle | (spec) rainfall hypothesis "Cannot be assessed", with the dependency | Cannot be assessed with current data. Missing: validated rainfall observations. |
| Continue after the brief | Add field observations when available | Keep |

## 16. Errors with fixes

Every error follows one structure: what happened. What it affects, or what is kept. [One action]. No apology, no blame, no raw error text (WRT-04, WRT-15, WRT-19).

| Situation | Current | Proposed |
|---|---|---|
| Planner failure | (spec) Planning failed (model timeout). Retry. | Planning stopped: the model did not respond within {seconds} s. Your request is saved. [Retry] |
| Model output rejected | (spec) failed task with retry | Siterra rejected the model's proposal: it failed {count} checks. Nothing in the case changed. [Retry] [View activity] |
| Source unavailable | (spec) citation kept, marked unavailable | Source unavailable: {short title} could not be retrieved. Siterra did not use it. [Try again] |
| Quote not found in source | (spec) `excerpt_mismatch` | Statement not added: its quote was not found in {short title}, page {page}. |
| Number not found in records | (trace) rejected 1 (number not found in referenced records) | Statement not added: a number in it was not found in the referenced records. |
| Scientific input missing | (spec) quantitative tasks blocked | Cannot measure vegetation change: no validated satellite observations for this area. Siterra still prepared the field-validation plan. |
| Conflicting revision | (spec) never overwrite newer work | The case changed while you were writing, so nothing was run. Your text is kept. [Send on revision {n}] |
| Stream interrupted | (spec) Reconnecting | Connection lost. Showing revision {n}, saved {time}. Reconnecting |
| Stream restored | none | Reconnected and loaded {count} updates. |
| Budget or time limit | (spec) partial package listing what was not done | Stopped at the {limit} limit. Siterra prepared a partial package. Not done: {tasks}. [Run remaining tasks] |
| Map failed to load | Interactive map unavailable ({error message}). The case still works; the analysis area is listed in the investigation sheet. | The interactive map could not load. Everything shown on the map is also listed in the column. |
| Save failed | none | Could not save. Your changes are kept in this tab. [Retry] |
| Model service down | none | The model service is not responding. Work already done is saved. [Retry] |
| Request too long | none (maxlength 400) | Shorten your request to 400 characters or fewer. |
| Empty request | none | Enter a question or request. |

## 17. Translation labels

These are English source strings. French strings must be written or reviewed by a fluent French speaker before they ship (ADR-0034); this file proposes none.

| Situation | Current | Proposed | Why |
|---|---|---|---|
| A statement drawn from a non-English source | (spec, TR-04) Machine-drafted translation | Machine-drafted translation from French [Show original] / [Hide original] | Names the language; the original is one action away |
| Inspector row | none | Original language: French | Accessibility doc: record the original language |
| Translated brief or field plan (P1) | (spec, ADR-0034) Machine-drafted translation, needs local review | Keep. Second line: The English original is kept alongside. [Show original] | |
| After a human review | (spec) reviewer scope and revision recorded | Translation reviewed by {role} for {scope}, revision {n} | Says who, for what, and when |
| Export of a translated document | none | This document contains machine-drafted translation. It needs local review before it is shared. | Travels with the file |
| Language menu | none | Language: English; Français | Each language named in itself [J] |
| Languages not offered yet | none | Arabic, Darija, and Amazigh are not available yet. They need testing with native speakers first. | ADR-0034 |

## 18. Mode and demo labels

| Element | Current | Proposed | Why |
|---|---|---|---|
| Live badge | (spec) LIVE | Live | VT-08 |
| Live tooltip | none | Model and tool calls run now. Observations are precomputed. | Honest about ADR-0021 |
| Replay badge | (spec) REPLAY; "Replay of live run, [date]" | Replay of live run, 24 Oct 2026 | Date format from the guide |
| Replay tooltip | none | Recorded outputs from a live run. Nothing is computed now. | |
| Concept badge | Concept prototype | Keep | |
| Concept tooltip | Concept prototype: simulated work and illustrative values | Simulated work and illustrative values. Nothing here is a result. | |
| Illustrative tag | Illustrative values, not measurements | Keep | |
| Simulation tags | Simulated in this prototype; Simulated; Simulated assessment; Simulated history; Simulated trace: illustrative timings | Keep (concept mode only) | |
| Demo review tag | Demo review | Demo review: grants no real authority | |
| Review decisions | "(demo)" suffix | Keep on every button, status, and export | VT-41 |
| Video speed label | (demo plan) Sped up 2× | Keep | |

## 19. Legends, method lines, charts, strip, and area card

### Map legends

| Element | Current | Proposed | Why |
|---|---|---|---|
| Vegetation title | Vegetation departure, Apr 2022 | NDVI departure, Apr 2022 | Names the measured index |
| Vegetation subtitle | NDVI difference from the 2019 to 2025 April median, inside the catchment | Difference from the 2019 to 2025 April median, inside the catchment | |
| Ramp ticks | -0.06; 0; +0.06 | −0.06; 0; +0.06 | Minus sign (VT-36) |
| Missing swatch | No valid observation | Keep | |
| Rainfall grid row | Rainfall grid: 31 cells of about 5 km touch the catchment, 3 fully inside | Rainfall grid: 31 cells of about 5 km touch the catchment, 3 of them fully inside | |
| Coverage | 82% of area observed | Keep | |
| Coverage below threshold | No valid observation for this period (45% observed, below the 70% policy) | No valid observation: 45% of area observed, below the 70% threshold | |
| Method line (new; required by the components spec) | none | Sentinel-2 L2A, monthly median NDVI, cloud and snow masked. Method ndvi-monthly 0.1. | Dataset and version, reference, method |
| Strata title | Sampling strata | Keep | |
| Strata subtitle | Elevation band by slope aspect, from the terrain model. Thresholds illustrative. | Elevation band by slope direction, from the terrain model (Copernicus GLO-30). Thresholds are illustrative. | Full sentence; names the source |
| Strata classes | Below 2,200 m; 2,200 to 2,700 m; Above 2,700 m; South-facing (hatched) | Keep | |
| Place legend | Place labels from OpenStreetMap | Place labels: OpenStreetMap | |

### Chart notes and text alternatives

| Element | Current | Proposed |
|---|---|---|
| Vegetation over time | Area median NDVI with same-month reference (gray) and spatial spread (band, not uncertainty). Hatched months are below the coverage policy. | Line: catchment median NDVI by month. Gray line: median for the same month, 2019 to 2025. Band: spread across the catchment, not uncertainty. Hatched: below 70% of area observed. |
| Vegetation and rainfall by month | Departures from same-month references: NDVI index units (2019 to 2025 median) and rainfall mm (1991 to 2020 mean, CHIRPS grid). Separate scales; no dual axis. | Top: NDVI difference from the 2019 to 2025 median for the same month. Bottom: rainfall difference in mm from the 1991 to 2020 mean (CHIRPS, about 5 km grid). Each panel has its own scale. |
| Text alternative | Two aligned panels by month, 2019 to 2025: vegetation departure in NDVI index units above, rainfall departure in millimetres per month below. Illustrative values. | Two panels by month, 2019 to 2025. Top: NDVI difference from the same-month median. Bottom: rainfall difference in millimeters per month. Illustrative values. |
| Selected value | Apr 2022: 0.215 | Apr 2022: 0.22 |
| Table headers | Month; NDVI; Departure; Rain dep. (mm); Observed | Month; NDVI; Difference from median; Rainfall difference (mm); Area observed |
| Table caption | Showing 2021 and 2022. Illustrative values, not measurements. | Keep |

The chart and table show NDVI to three decimals; the design system says two (section "Conflicts" in the guide).

### Timeline

| Element | Current | Proposed | Why |
|---|---|---|---|
| Row labels | Observed; Vegetation; Rainfall | Coverage; Vegetation; Rainfall | "Observed" can be read as observed vegetation. |
| Slider label | Selected month | Keep | |
| Value text | April 2022, 82% of area observed | Keep | |
| Value text, below threshold | January 2021, below the coverage policy (45% observed) | January 2021, 45% of area observed, below the 70% threshold | |
| Cell tooltip | Apr 2022: 82% observed | Apr 2022: 82% of area observed | |
| Disabled month on focus | (spec) Snow or cloud: 31% observed | 31% of area observed (cloud, shadow, or snow masked). Below the 70% threshold. | Names the masks without claiming which one applied |

### Area card

| Element | Current | Proposed | Why |
|---|---|---|---|
| What it is | Valley catchment (hydrological analysis extent), not a pasture, agdal or management boundary; preview boundary about 55 m | Valley catchment (hydrological analysis extent). Not a pasture, agdal, or management boundary. Preview boundary at about 55 m resolution. | Three facts, three sentences |
| Map outline label | Valley catchment, not a pasture or management boundary (prototype); Valley catchment, not a pasture, agdal or management boundary (spec) | Valley catchment, not a pasture, agdal, or management boundary | One label everywhere; the prototype drops "agdal". |
| First-use gloss | none | agdal: a customary institution that governs access and use | Definition from the scientific basis document |
| Not claimed | Pasture or agdal boundaries, rights, degradation or a visited site | Pasture or agdal boundaries, rights, degradation, or a site visit | Allowlisted for VT-20 |
| Commune context | Tabant commune: legal population 16,401 (HCP, 2024 general census (legal population)). Whole commune, not herding households and not the catchment. | Tabant commune: legal population 16,401 (HCP, 2024 census). This counts the whole commune, not herding households or the catchment. | No nested parentheses |
| Elevation, loading | Computing from the terrain model | Keep | |

## 20. Activity (trace)

| Element | Current | Proposed | Why |
|---|---|---|---|
| Panel title | Activity and trace | Activity | Matches the button |
| Subtitle | none | Every model call, tool call, check, and save for this case, in order. | |
| Concept tag | Simulated trace: illustrative timings | Keep | |
| Request row | Commission investigation | Start investigation (the request as sent) | |
| Task rows | Plan the investigation; Source research; Observation analysis; Rainfall comparison; Hypothesis comparison | Keep all except "Explanation comparison" | |
| Span | Model call: planner | Model call: plan the investigation | Says what the call did |
| Span | Validate plan (6 tasks) | Check plan: 6 tasks accepted | Names the outcome as well as the step |
| Span | Commit revision 2 | Saved revision 2 | Same word as the case pill menu |
| Span | search_sources (case corpus) | Keep (tool names stay in mono) | |
| Span | read_source x 5 | read_source × 5 | |
| Span | Model call: extract statements | Keep | |
| Span | Validate 6 statements, 1 rejected | Check statements: 5 accepted, 1 rejected | |
| Span | Numeric provenance check | Check numbers against records | |
| Span | Validate 4 hypotheses | Check explanations: 4 accepted | |
| Detail labels | Model; Provider request; Tokens; Tool arguments; Validation; Not shown | Keep; add "Estimated cost" (spec) | |
| Model value | Meta model through the provider adapter (identifier recorded per call) | {model ID}, recorded for each call | |
| Validation value | Accepted 5 statements; rejected 1 (number not found in referenced records) | 5 statements accepted. 1 rejected: a number was not found in the referenced records. | |
| Not shown | Prompts, keys and model reasoning are never sent to the browser | Prompts, API keys, and hidden model reasoning. They never reach the browser. | |
| Durations | 6.1 s | Keep | Space before the unit |

## 21. Screen-reader announcements

Progress is announced politely and in batches; errors are announced separately (accessibility doc).

| Event | Current | Proposed |
|---|---|---|
| Investigation started | Investigation commissioned. Siterra planned 6 tasks. Simulated in this prototype. | Investigation started. Siterra planned 6 tasks. (Concept mode adds: Simulated in this prototype.) |
| Observations ready | Observations updated: vegetation over time and 5 evidence items. | Keep |
| Explanations ready | Explanations updated: 4 explanations compared. Grazing-related pressure cannot be assessed with current data. | Keep |
| Review recorded | Scientific review recorded in demo mode. | Keep |
| Error | none | Request failed: {cause}. Your text is kept. |

## 22. History

| Element | Current | Proposed | Why |
|---|---|---|---|
| Panel title | Case history | History | Matches the button |
| Intro | Each revision records the command that produced it and what changed. Earlier revisions open read-only; completed work is never re-run on reload. | Each revision shows the request that produced it and what changed. Earlier revisions open read-only. Reloading never reruns finished work. | |
| Row label | Rev 3 | Revision 3 | No abbreviation |
| Row text | Source research completed | Source research done | Same word as the task status |
| Read-only banner | (spec) Viewing revision 3; return to current | You are viewing revision 3 (read-only). [Return to current revision] | |

## 23. Brand lines (outside the demo path)

| Element | Current | Proposed | Why |
|---|---|---|---|
| Product promise | Give an environmental problem to an AI team. Get an evidence-backed plan for what to do next. | Give Siterra an environmental question. Get an evidence-backed plan for what to check next. | "AI team" implies personas (ADR-0005); "what to check next" is the actual deliverable. |
| Tagline | Environmental intelligence, put to work. | Keep as a working line, or: "Evidence first. People decide." | "Intelligence" is vague; the alternative states the two product rules. |
| Mission phrase | autonomous environmental services firm | Keep, in pitch and about text only | ADR-0005 |

## 24. Island layout and later features

Strings for components specified after the first prototype: the map ornament and Views menu (CMP-19), legend override (CMP-20), answer card (CMP-21), comparable places (CMP-22), trace quality and usage, Meta model badges ([ADR-0041](../decisions/0041-give-each-meta-model-one-job-with-an-independent-check.md)), forecast refusal ([ADR-0039](../decisions/0039-forecast-nothing-until-a-backtest-shows-skill.md)) and export ([ADR-0034](../decisions/0034-build-translation-ready-and-ship-french-first.md)). Written to this guide; review them with the checklist before release.

### Views and tours

| Element | Proposed | Note |
|---|---|---|
| Ornament button | [Views] | Opens the menu |
| Group titles | Views; Tours | |
| Overview | Overview. The whole catchment from above. | |
| Across the valley | Across the valley. Looking at the slopes on the far side. | Bearing computed from the valley axis |
| Along the valley | Along the valley. Looking up the valley from its outlet. | |
| Orbit | Orbit. A slow turn around the catchment, {seconds} s. | Tour |
| Time-lapse | Time-lapse. {month} from {firstYear} to {lastYear}, {observed} of {total} years observed. | Tour; also the timeline's [Play] |
| Status | Ready; Unavailable: {reason}; Needs update: {input} changed | |
| 3D toggle | [3D relief] | Tooltip: Shows relief in 3D. Data views stay flat. |
| Honesty captions | Oblique view: not for reading area or pattern. Relief exaggerated 1.2 times. Preview boundary. | Fixed strings, never model text |
| Legend override | Showing your chosen view until your next request. | |
| Transport bar | [Play] [Pause] [Stop] [Previous step] [Next step] | Step label: Step {n} of {total} |
| Reduced motion | Motion is reduced. Use Next step to move through the tour. | |
| Focus mode | [Show only the map]; [Show panels] | |
| True-color drape caption | True color, Sentinel-2, {months} composite. Contains modified Copernicus Sentinel data {year}. | P1 |
| Timeline markers | National drought year (FAO GIEWS); Question asked; Findings added | P1 |
| Theme | Theme: Dark; Light; Match system | Case pill menu |

### Answer card

| Element | Proposed | Note |
|---|---|---|
| Question line | The request as the user typed it | Never rephrased |
| Working | {n} tasks running: {current step} | From events |
| Done | Answered from {n} evidence items. | |
| Next questions | Next questions | Shown as director suggestions, at most two, written as the user would ask them |
| Footer | Revision {n}. [Copy reference] | |

### Quality, models and usage

| Element | Proposed | Note |
|---|---|---|
| Trace sections | Quality checks; Models and usage | |
| Proposals | Accepted on first try: {accepted} of {total}. Repaired: {repaired}. Rejected: {rejected}. | Each rejection lists its reason |
| Numeric provenance | Numbers traced to records: {traced} of {total} | |
| Prohibited claims | Prohibited claims found: {count} | |
| Cost and time | Cost estimate: US${cost}, from provider usage and prices dated {date}. Time: {seconds} s. | Local runs: API cost US$0 |
| Models sheet title | Models in this case | Columns: Job; Model; Checked by; Status |
| Model badge | {model}, {route} | For example: Muse Spark, Model API; Muse Glimmer, local |
| Badge status | Validated; Advisory; Illustration; Draft transcript | |
| Quality tab | Latest evaluation: {date}. Model {model}, prompt version {version}. | Numbers only from the harness report |

### Second reader and illustrations

| Element | Proposed | Note |
|---|---|---|
| Flag | Second reader: check wording | Inspector and review queue only |
| Flag detail | Muse Glimmer compared this statement with its source excerpt and flagged: {overreach}. {reason} A reviewer decides. | |
| Overreach labels | States a cause the source does not; Wider scope than the source; Different quantity; More certain than the source; Changes a negation; Wrong source, actor or period | |
| No issue | Second reader: no wording issue found. | Inspector only |
| Illustration badge | Illustration by Muse Image. Not a photograph, not evidence. | Fixed |
| Illustration status | Draft illustration; Approved for community material | Only the community and livelihood reviewer approves |

### Comparable places

| Element | Proposed | Note |
|---|---|---|
| Section title | Comparable places | |
| Card fields | Studied; Found; Similar; Different; Why it may not apply here; What it cannot tell us about Aït Bouguemez | The last two are required |
| Scope note | Published context by analogy. Numbers here describe that place, not this valley. | |

### Forecast requests

| Element | Proposed | Note |
|---|---|---|
| Refusal | Siterra does not forecast vegetation here. Seven years of satellite records are too short to test a forecast against simple baselines. What would make one possible: {needs}. Added to next steps: {item}. | Names the gap, then the next step |
| Scenario label | Scenario: what a dry season looked like here ({years}) | Never on the observed timeline |

### Export and sharing (P1)

| Element | Proposed | Note |
|---|---|---|
| Dialog title | Export brief | |
| Language | Language: English; French (machine-drafted) | |
| Contents | Include: Brief; Field plan; Evidence list | |
| Note | Exports keep demo labels and outstanding conditions. | |
| Buttons | [Export PDF] [Create read-only link] [Revoke link] | |
| Link created | Read-only link created for revision {n}. Anyone with the link can view it. | |
| Stale export | This export is out of date: revision {n} changed after it was made. | |
