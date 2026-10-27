# Demo plan

What the submission video must show and how it is recorded. The demo shows real behavior in live mode; timings are targets to be replaced by measured durations during rehearsal. Narration, judging notes and rehearsal logs are kept privately; this file defines what the recording must show. Scenes: [experience storyboard](../reference/experience-storyboard.md). Problem facts: [the problem](../explanation/problem.md).

Neither the official rules nor the event pages state a video length, and the submission form needs sign-in; plan for a hard cap of 3:00 (the common norm at comparable hackathons) and confirm it in the form.

## Rules for the recording

1. Live mode end to end. The mode label is visible in every frame of product footage.
2. Waiting time may be shortened only with an on-screen "Sped up 2x" (or similar) label, and only the video is sped up, never the narration. Never cut in a way that hides a failure or implies faster work than happened.
3. No pre-seeded results in live mode: the case starts at revision 1 with only its configured area, corpus, validated observation bundles and, once built, the validated event bundle ([ADR-0045](../decisions/0045-extend-the-meta-model-map-to-event-records-figures-and-whole-corpus-reading.md)). A bundle is input, not a result: the event bundle is labeled "Precomputed by Muse Spark" with its build date and pass counts, and its comparison with the rainfall record runs live during the take.
4. Every number inside the product comes from the case record. Illustrative prototype values never appear in the recording.
5. Cited facts from outside the case (the opening and the potential beat) appear only as title overlays outside the product chrome, each with a visible source tag, worded exactly as in [the problem](../explanation/problem.md). They never appear inside product UI.
6. Name each Meta model only where the recorded run used it, with one visible proof (a trace entry, a badge or an output). No capability is claimed that the take does not show.
7. No stock footage of herders, villagers or officials: it would imply consent or partnership that does not exist. The maintainer's own footage from the region may appear, outside the product chrome, only under all of these conditions: every identifiable person gave recorded consent before the video is public, and anyone without it is blurred; the footage is labeled as the maintainer's own travel and conversations, never as evidence in the case, an endorsement of Siterra or a partnership; no names or exact places of residence appear in picture, sound or captions; and what people say on camera is not presented as a finding and does not enter the case record. Personal trip details stay in private notes.
8. If the video must be shorter, cut in the order under "Cuts".

## Golden path (target 2:57, hard cap 3:00)

| Time | Beat | On screen | User input | What must be visibly real |
|---|---|---|---|---|
| 0:00 | The problem (15 s) | Live arrival scene: the real relief of the valley settles; three title overlays with source tags (rangelands cover over half of Earth's land; about two billion livelihoods; 2026 is the UN International Year of Rangelands and Pastoralists) | None | Real terrain and the analysis area with its role label |
| 0:15 | The case (10 s) | Case card: reported concern, "Not established", one primary action; one title overlay with the national drought context (SCI-25) | None | Case at revision 1 |
| 0:25 | Commission (20 s) | The sheet enters; plan rows appear as tasks are queued; trace entry names `muse-spark-1.3` with its request ID | Click **Start investigation** | Model-proposed plan; task states driven by events |
| 0:45 | Read and observe (20 s) | A French source page with the matched sentence beside its evidence tile (English statement labeled machine-drafted, French excerpt, page, excerpt check passed); then vegetation over time with hatched snow months and the departure layer | None | Excerpt matched on the page; counts from the record |
| 1:05 | Drought challenge (35 s) | The camera frames the evidence; the native rainfall grid appears over the terrain; aligned vegetation and rainfall panels; evidence moves into the hypothesis ledger; grazing reads "Cannot be assessed with current data" | Type "Could drought explain this instead?" | New tasks after the command; statuses in words, no scores |
| 1:40 | People and authority (12 s) | Livelihood constraints with "Not collected" unknowns; who decides | Type "What about the households that rely on these pastures?" | Published-context labels; no household numbers |
| 1:52 | Plan and review (25 s) | Response options with who decides; field plan strata on the terrain; brief composing with evidence chips; scientific review recorded (demo), community consultation outstanding, "Prepared (demo)" | Type "Prepare the next steps for review." then click **Record scientific review (demo)** | Every brief line opens to evidence; review bound to exact versions |
| 2:17 | Trust (15 s) | Trace with model and tool calls, validation outcomes and the per-command quality and usage block; one view change (oblique across the valley); reload restores the same revision | Open trace; pick a view; reload | Provider request IDs and durations; no re-execution on reload |
| 2:32 | Potential (20 s) | The camera pulls back from the valley; up to four title overlays labeled "Potential, not built", each with its cited need ([product thesis](../explanation/product-thesis.md#other-places-the-same-method-could-help)) | None | Labeled as potential |
| 2:52 | End card (5 s) | Name, "built on Meta Muse Spark", recorded live with the date | None | Mode and date |

P1 features appear only if they pass their acceptance tests before recording: the second reader flag on a real statement (EV-05, shown as "read by Muse Spark, checked by Muse Glimmer"), one field-protocol illustration with its badge, the French brief export with its machine-draft label, the time-lapse tour.

Meta moments from [ADR-0045](../decisions/0045-extend-the-meta-model-map-to-event-records-figures-and-whole-corpus-reading.md), under the same rule:

| Beat | Moment | Shown only if | What the take must show |
|---|---|---|---|
| Drought challenge | Dated event markers on the timeline axis beside the rainfall panel; one opens to its excerpt, scope, "Excerpt check passed" and the code's "agrees", "does not agree" or "no matching period" against the catchment rainfall record. The P0 minimum bundle holds English excerpts from the FAO GIEWS archive (SCI-25); French or Arabic excerpts appear only if the P1 reports are built | EV-06 passes | The bundle label with build date and pass counts; the scope on each marker's face (all national in the P0 minimum); a marker never sits on the terrain or the rainfall grid. Without model access the challenge shows "Event record not built: model access not confirmed" and no markers |
| Drought challenge | "Sources disagree" row in the ledger with both originals | A person accepted the contradiction in this case | Both excerpts with source and page |
| Read and observe | A published figure settling onto the valley with its control points and fit error | EV-07 passes and the figure's license allows a public derived layer | Source, page, control-point count and leave-one-out error, "Published figure, approximately placed" |
| Read and observe | Snow-month hatching with "Segment Anything snow masks agree with scene classification in N of M months" | EV-08 passes | The count from the report; the hatching itself still comes from scene classification |
| Drought challenge or trust | Second reader run on the laptop with the network off | EV-05 passes | Host, model digest and timing in the trace |

## Cuts, in order, if the video must be shorter

A 2:30 version: problem 15, case 10, commission 15, read and observe 15 (keep the excerpt match), challenge 35, people with plan and review in one 28 s beat, trust 10 (trace only), potential 15, end card 7.

1. History and view changes (keep one period change inside the challenge).
2. Options table detail (show the field plan and brief only).
3. Reload (keep the trace).
4. Potential cards (keep the one closing sentence).

Never cut the challenge, the honest "cannot be assessed" outcome, or the review boundary. They are the product.

## Failure handling during recording

| Situation | Action |
|---|---|
| Model call fails or is slow beyond the budget | Stop, fix or wait, record again. Do not splice another run's output into a live take. |
| Repeated provider outage near the deadline | Submit the labeled replay of an earlier successful live run, with the mode label reading "Replay of live run" and its date, and say so in the submission text. |
| A real scientific limitation appears (for example low coverage) | Keep it. It demonstrates the product's honesty. |
| The data shows something other than the draft narration expects | Say what the data shows. Narration lines that depend on data are rewritten after the run. |

## Pre-recording checklist

- DQ-01 to DQ-03 in [acceptance criteria](acceptance-criteria.md#demonstration-quality) pass.
- Fresh case created from the seed; no fixture IDs in the database.
- Browser at 1440×900, zoom 100%, notifications off, bookmarks bar hidden.
- Network checked; map assets served from the deployment, not third-party demo servers.
- Reduced motion off for the recording; a separate short clip with reduced motion on is optional for accessibility judging.
- Submission text maps each Meta model to its job, its check and the timestamp where it appears.
- If the event bundle appears: its manifest (model ID, build date, rows proposed and accepted) matches the take, and the label reads "Precomputed by Muse Spark".
