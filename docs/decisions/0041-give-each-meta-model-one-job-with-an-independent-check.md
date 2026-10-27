---
status: accepted
date: 2026-10-26
decision-makers: maintainer
---

# Give each Meta model one job with an independent check

## Context and Problem Statement

[ADR-0015](0015-use-a-meta-model-through-the-responses-api.md) makes `muse-spark-1.3` the workhorse. Meta also offers open-weight models (Muse Glimmer, Muse Spark Open), an image model (Muse Image), a speech-to-text model (Muse Voice Transcribe), a preview reasoning model (Muse Wonder) and Segment Anything on the same platform ([Meta models research](../../research/technology/meta-models.md), MM-01 onward). Judging weights the use of Meta AI tooling at 25%, and creative use beyond a basic integration counts. Adding models is easy; adding them so that each one does useful, checkable work is not. Which Meta models should Siterra use, for what, and how does a reader know each one did its job?

## Decision Drivers

* Every model output must pass a check that does not depend on that same model.
* No model may produce a number, a measurement, a map or a picture that could pass for evidence.
* Use must be visible and measured in the product, not asserted in a pitch.
* The P0 path must not depend on any model beyond `muse-spark-1.3`.

## Considered Options

* `muse-spark-1.3` for everything
* A model map: one job per model, each with an independent cross-check, a visible badge and measured results
* Route existing Spark work to hosted Muse Spark Open to use an open-weight model
* Use Muse Image for scenic or map imagery of the valley

## Decision Outcome

Chosen option: "a model map", because it gives each model a job it is suited to and a check it cannot pass by itself, and it shows the reader exactly which model did what.

| Job | Model | Independent check | Shown as | Priority |
|---|---|---|---|---|
| Plan, read sources, compare explanations, compose packages and layout | `muse-spark-1.3` | Schema, reference, numeric provenance and claim validators | Validated records | P0 |
| Read French and English source PDFs in page ranges of at most 50 pages | `muse-spark-1.3` with file input | Verbatim excerpt matched on the cited page | Published-context evidence with the original excerpt | P0 |
| Second reader: does the English statement say more than its excerpt? | Muse Glimmer 30B, pinned open weights, run locally; a hosted route only after scoring on the same gold set | Gold-set metrics against human labels in the [evaluation harness](../reference/evaluation.md) | Advisory flag that routes the item to a reviewer | P1 |
| Imagery quality review of monthly thumbnails | `muse-spark-1.3` image input | Scene classification fractions from the bundle | Quality flag, never a measurement | P1 |
| French drafts of briefs and field plans ([ADR-0034](0034-build-translation-ready-and-ship-french-first.md)) | `muse-spark-1.3` | Numeric provenance and prohibited-claim checks on the draft; local review before use | "Machine-drafted translation, needs local review" | P1 |
| Wordless illustrations of field-protocol steps | Muse Image with web search, image search and shell off | Spark checklist (no text, faces, maps, charts or valley-like scenery), community and livelihood review | "Illustration by Muse Image. Not a photograph, not evidence." | P1 |
| Push-to-talk commands | Muse Voice Transcribe through the server | The person edits and submits the transcript | Draft transcript | P1 stretch |
| Critique of the decision brief before review | Muse Wonder | A person accepts or dismisses each note | Review note | P2 |
| Candidate cropland mask | Segment Anything | Agreement with ESA WorldCover against a threshold fixed before the run | Model-derived candidate layer | P2 |

The model map shown in the product and README is generated from the worker's routing configuration, so it cannot drift from what runs. A usage meter reads provider usage fields per model and per case; cost is computed by code from a dated price table and labeled an estimate. If any Muse Spark Open route is enabled, the product shows "Built with Muse Spark Open", as its license requires.

### Consequences

* Good, because each model's contribution can be inspected (badge, trace entry, quality numbers) instead of claimed.
* Good, because the open-weight job is one only pinned public weights can do well: an audit any reviewer can re-run on a 24 GB GPU or an Apple silicon Mac.
* Good, because Muse Image is used where an illustration helps and cannot be mistaken for the place or the data.
* Bad, because Glimmer was trained from Spark outputs, so its errors may correlate with Spark's; it is never called independent, and the gold set measures how much it adds.
* Bad, because the local Glimmer route did not enforce a JSON schema in one smoke test, so its output needs the shared parser with one repair turn and counted failures.
* Bad, because a hosted deployment cannot reach a local model; the public demo either shows the precomputed evaluation with "local mode only" or uses a hosted route scored first.
* Bad, because bonus categories and their terms are not confirmed on any public page; no eligibility is claimed until they are.

### Confirmation

EV-05 (second-reader suite with intervals), TR-05 (model badges) and TR-06 (usage meter) in the [acceptance criteria](../project/acceptance-criteria.md); SV-03 covers prohibited claims in drafts.

## Pros and Cons of the Options

### `muse-spark-1.3` for everything

* Good, because it is one adapter and one failure mode.
* Bad, because it leaves the faithfulness check to the same model that wrote the statement.

### Route Spark work to hosted Muse Spark Open

* Good, because it uses an open-weight model with no new job design.
* Bad, because it is priced like Spark at the documented hosts, adds no capability, and would be running a model only to qualify for a prize.

### Muse Image for scenic or map imagery

* Good, because it would be visually striking.
* Bad, because a generated view of the valley could be read as the place itself or as data, which the product's honesty rules forbid.

## More Information

Facts, prices, limits and the gold-set design: [Meta models research](../../research/technology/meta-models.md). Tools and validation: [agent orchestration](../reference/agent-orchestration.md).
