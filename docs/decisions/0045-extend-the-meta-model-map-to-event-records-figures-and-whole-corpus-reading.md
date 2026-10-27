---
status: proposed
date: 2026-10-27
decision-makers: maintainer
consulted: Meta models lane
---

# Extend the Meta model map to event records, figures and whole-corpus reading

## Context and Problem Statement

[ADR-0041](0041-give-each-meta-model-one-job-with-an-independent-check.md) gives each Meta model one job with a check that does not depend on that model. Its P0 and P1 jobs use Muse Spark as a careful reader of text, which is honest but leaves several documented capabilities unused: search grounding with returned sources, spatial grounding on page images (points and boxes on a 0 to 1000 grid), a 1,048,576-token context with automatic prefix caching, and Segment Anything on video ([Meta models research](../../research/technology/meta-models.md), MM-18, MM-27 to MM-30). Judging weights the use of Meta AI tooling at 25% and rewards going beyond a basic integration (TECH-29 in the [technology register](../../research/technology/source-register.md)). Which further jobs push these capabilities on this case, and how is each one checked without trusting the model that did it?

## Decision Drivers

* Every ADR-0041 driver still holds: an independent check per job, no model-made number, measurement, map or picture that could pass for evidence, use shown in the product, and a P0 path that needs only `muse-spark-1.3`.
* The drought challenge ([ADR-0008](0008-make-the-drought-challenge-the-signature-interaction.md)) is the signature interaction, so a new job should strengthen it rather than sit beside it.
* Event extraction from news is error-prone: Google's Groundsource, built with Gemini from news in 80 languages, reported that 60% of events were accurate in both place and timing in manual review (MM-31). Checks must catch wrong dates, wrong places and invented quotes.
* Spend stays small and bounded: no Meta call before GATE-01 and a founder spending cap.

## Considered Options

* Keep the ADR-0041 map unchanged
* Add four checked jobs: a cited event record, figure georeferencing, whole-corpus comparison and a snow-tracking experiment with Segment Anything
* Add the same jobs, run live during the demo

## Decision Outcome

Chosen option: "Add four checked jobs: a cited event record, figure georeferencing, whole-corpus comparison and a snow-tracking experiment with Segment Anything", because each uses a documented capability that no other job uses, each has a deterministic or human check that does not depend on the model, and the first one puts Muse Spark inside the drought challenge itself.

| Job | Model and route | Independent check | Shown as | Mode | Priority |
|---|---|---|---|---|---|
| Cited event record: dated drought declarations, emergency programs, subsidized feed, transhumance and pasture rules from French, Arabic and English reports | `muse-spark-1.3` with file input on stored reports; `web_search` at corpus setup for leads only (P1 part) | Excerpt found verbatim in the stored text of the fetched source; event date not after publication date; scope tag (national, region, province, valley) matched to a place name in the excerpt, otherwise national; for stated rainfall direction, code compares the sign with the catchment rainfall departure for the same season; a person reviews a random sample of 20 rows | Timeline markers labeled published context with scope on their face, and "agrees", "does not agree" or "no matching period" against the catchment rainfall record | Precomputed event bundle with a manifest; the comparison runs live in the challenge | P0 minimum: the FAO GIEWS Morocco archive (SCI-25), English, national scope. P1: French and Arabic reports |
| Place a published figure on the valley | `muse-spark-1.3` image grounding on the page image: points at printed place labels | Code matches labels to a gazetteer independent of the model, fits the transform and reports leave-one-out error in metres; the layer stays off below 4 matched points or above a threshold fixed before the run; a person can drop any control point | "Published figure, approximately placed", with source, page, control points and fit error; never a boundary, area or rights claim | Precomputed; refit live in code | P1 |
| Find where sources disagree | `muse-spark-1.3` with the extracted text of the whole corpus in one request, corpus first so the prefix is cached | Both excerpts verbatim on their cited pages; a person accepts the contradiction | "Sources disagree" row in the hypothesis ledger with both originals | Live | P1 |
| Track snow through the monthly composites | `sam-3.1`, concept prompt "snow" on a video of monthly true-color composites | Per-month agreement with the Scene Classification snow fraction in the bundle, threshold fixed before the run | Quality tab row; masks never change measurements and never reach the map below the threshold | Precomputed | P1 experiment, alternative to the Spark imagery review |

The minimum event bundle is P0 because the hero frame of the drought challenge shows its markers, and the delivery plan cuts P1 first when the build starts late; a hero that rests on work cut first would promise what the product may not have. The minimum uses one source the case already holds in full text, so it needs no search, and it is built only after GATE-01 and the founder's spending cap. Without model access no bundle is built and the challenge says so.

The figure job does not breach the ADR-0041 driver on maps: the model only locates labels printed on a published page, code computes the placement, and what appears is the published figure with its placement error, cited as published context. The event bundle is a new kind of precomputed, validated input alongside observation bundles ([ADR-0021](0021-precompute-observations-and-run-investigation-work-live.md)); the demo plan's rule on pre-seeded results is amended to name it.

Muse Wonder, Muse Voice Transcribe and the Segment Anything cropland mask keep their ADR-0041 jobs and priorities. Concurrent task threads in the interface are the coordinator's work ([ADR-0014](0014-run-one-coordinator-with-bounded-task-jobs.md)) and are not presented as a Meta capability.

### Consequences

* Good, because Muse Spark's reading of dated reports enters the drought challenge as published context (English in P0), with a check against the catchment record that code computes.
* Good, because spatial grounding, search grounding, long context and video segmentation each have one bounded, measured job instead of a claim.
* Good, because every failure has a visible state: rows that fail the excerpt check never enter the bundle, an unfit figure stays off the map, a snow experiment below threshold is reported as such.
* Bad, because most event rows will be national, not about the valley; the scope tag must carry that on every marker, and a subsidy announcement is not evidence that herders received feed.
* Bad, because search grounding cannot be narrowed by any documented filter (the Responses schema lists a `filters` object without documented fields, what it accepts is unverified; on Messages, `allowed_domains` and `blocked_domains` return 400; no language filter is documented) and Meta says multi-hop research is less dependable, so search results are leads only and the corpus fetch is a setup step a person runs.
* Bad, because the license of the candidate figure (SCI-19) for a public derived layer is unverified; until it is checked the layer appears only in local recordings with attribution.
* Bad, because Segment Anything is not documented for satellite imagery; the snow experiment may fail its threshold and add nothing but a Quality tab row.
* Bad, because the minimum event bundle adds about half a lane-day to P0, and the other jobs add about two lane-days of P1 work that runs only after all P0 tests pass ([delivery plan](../project/delivery-plan.md)).

### Confirmation

EV-06 (event bundle, P0 for the minimum bundle: excerpt-check pass count in the manifest, sample precision with a Wilson 95% interval), EV-07 (figure placement: leave-one-out error reported, threshold recorded before the run), EV-08 (snow experiment: per-month agreement and the threshold recorded before the run) in the [acceptance criteria](../project/acceptance-criteria.md). TR-04, TR-05 and TR-06 apply to every new job.

## Pros and Cons of the Options

### Keep the ADR-0041 map unchanged

* Good, because it is the smallest build.
* Bad, because Muse Spark's spatial and search grounding and its long context stay unused, and no Meta job touches the drought challenge beyond planning.

### Add the same jobs, run live during the demo

* Good, because live work is more convincing than a precomputed bundle.
* Bad, because reading tens of reports and fitting a figure cannot fit a 35-second beat; precomputing with a manifest and labeling it is honest, and the comparison that matters still runs live.

## More Information

Facts, prices, costs and checks: [Meta models research](../../research/technology/meta-models.md). Tools and validation: [agent orchestration](../reference/agent-orchestration.md). Measurement: [evaluation harness](../reference/evaluation.md).
