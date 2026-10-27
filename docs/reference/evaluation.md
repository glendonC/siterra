# Evaluation harness

How Siterra measures the quality of its own AI work and shows the result. Decision: [ADR-0038](../decisions/0038-measure-ai-work-with-an-evaluation-harness.md). Acceptance criteria: [acceptance criteria](../project/acceptance-criteria.md).

Every number below comes from running the harness; nothing is estimated in advance. The harness is part of the product's technical depth and of its honesty: a reader can see how often the model's proposals pass the validators, as well as that validators exist.

## What is measured

| Suite | Question | Method | Pass bar for the demo |
|---|---|---|---|
| Extraction fidelity | Do extracted statements quote the source exactly and point to the right page? | Gold set of located statements written by a person for each corpus source; every proposed excerpt must match the source text at its page (whitespace-normalized) | 100% excerpt match (the validator rejects the rest); page locator accuracy reported |
| Claim typing | Does the model label observations, published context, hypotheses and field requirements correctly? | Gold labels on the same set | Accuracy reported with the confusion matrix; target at least 90% before the demo |
| Status behavior | Does the model choose the honest hypothesis status for a given evidence pattern? | Fixture cases with known correct status (for example no livestock data means "Cannot be assessed with current data"), plus fixtures where model text restates a hypothesis; the claim-rule validator must reject any restatement without its status word in the same sentence | 100% on the fixture set |
| Numeric provenance | Does model-written text contain numbers that are not in the records? | Count validator rejections per 100 proposals across repeated runs | Violations are caught 100% (validator); first-pass violation rate reported |
| Schema adherence | Do proposals parse on the first attempt? | Share of proposals valid on first pass; repair success rate | Reported per task kind |
| Safety | Does an injected instruction or an action request change permissions or produce an external effect? | Fixture source with an embedded instruction; the "close the pastures" request | 0 permission changes, 0 outbound effects, action stays at prepared |
| Statement faithfulness (P1) | Does an English statement say more than its original excerpt (causal, scope, quantity, certainty, negation or attribution overreach)? | About 100 pairs: about 40 supported pairs from the extraction gold set and about 60 one-edit negatives labeled by construction; each candidate model (Spark baseline, local Glimmer, any hosted route) scored on identical inputs ([ADR-0041](../decisions/0041-give-each-meta-model-one-job-with-an-independent-check.md)) | Negative recall, false-alarm rate, kappa and parse failures with Wilson 95% intervals; routing thresholds fixed before scoring |
| Event record (P0 minimum bundle) | Are the event rows real, dated and placed correctly? ([ADR-0045](../decisions/0045-extend-the-meta-model-map-to-event-records-figures-and-whole-corpus-reading.md)) | The bundle manifest's counts of rows proposed and accepted by the excerpt, date and scope rules; a person checks a random sample of 20 accepted rows for event type, date and place against the stored source | Excerpt-check pass count reported; sample precision with a Wilson 95% interval; sample drawn by code with a recorded seed |
| Figure placement (P1) | Is a published figure placed on the valley within a known error? | Leave-one-out error of the control-point fit against the gazetteer, in metres | Error and control-point count reported; threshold recorded before the run; layer off above it |
| Snow experiment (P1) | Do Segment Anything snow masks agree with Scene Classification? | Per-month masked snow fraction against the bundle's Scene Classification snow fraction | Months within the tolerance reported; tolerance and threshold recorded before the run; never used as a measurement |
| Cost and time | What does a command cost and how long does it take? | Provider-reported usage and wall-clock time per command | p50 and p95 reported; cost per full investigation reported |

## Gold sets

Built by a person during the build from the case corpus (the cited sources). Each item: source ID, page, verbatim excerpt (short), the statement it supports, the correct claim kind. About 10 items per core source is enough to detect regressions; the set is versioned with the corpus manifest. Gold items never enter model prompts.

A synthetic smoke set is not a gold set. The 16 invented statement pairs used to try the second-reader contract on local Glimmer on 2026-10-27 ([Meta models research](../../research/technology/meta-models.md)) showed that the contract parses on that route; they are never reported in the Quality tab.

## How it runs

- `pnpm eval` runs all suites against the configured model and writes a JSON report and a Markdown summary to `eval-reports/` (ignored by Git; summaries may be published).
- The same validators used in production score the outputs; the harness adds gold comparisons and aggregation.
- Each run records model ID, prompt version, corpus manifest hash and date in the report header.

## Where it shows in the product

The trace inspector shows per-command quality checks from real events: proposals made, accepted on first pass, repaired, rejected and why; numeric provenance and prohibited-claim checks; cost and duration. A "Quality" tab shows the latest harness summary with its date and configuration. Nothing in either place is written by the model.

## Method and data cards

Each analysis recipe carries a method card (purpose, inputs, assumptions, minimum data, outputs, known failure modes, validation) and each observation bundle a data card (sources, coverage, processing, licenses, limitations), following the reporting practice of Model Cards (Mitchell et al. 2019, [doi:10.1145/3287560.3287596](https://doi.org/10.1145/3287560.3287596)) and Datasheets for Datasets (Gebru et al. 2021, [doi:10.1145/3458723](https://doi.org/10.1145/3458723)). Cards are generated from manifests and recipe definitions, never written by the model.
