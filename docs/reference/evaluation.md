# Evaluation harness

How Siterra measures the quality of its own AI work and shows the result. Decision: ADR-0038. Acceptance criteria: acceptance criteria.

Every number below comes from running the harness; nothing is estimated in advance. The harness is part of the product's technical depth and of its honesty: a reader can see how often the model's proposals pass the validators, as well as that validators exist.

## What is measured

| Suite | Question | Method | Pass bar for the demo |
|---|---|---|---|
| Extraction fidelity | Do extracted statements quote the source exactly and point to the right page? | The extraction gold set ([format and normalization below](#extraction-gold-set)); every proposed excerpt must match the source text at its page after that normalization | 100% excerpt match (the validator rejects the rest); page locator accuracy reported |
| Claim typing | Does the model give each statement the right claim kind (observation, published context, hypothesis, model estimate, scenario, field requirement, verified outcome)? | Gold labels on the same set, using the seven values of `Evidence.claimKind` | Accuracy reported with the confusion matrix; target at least 90% before the demo |
| Status behavior | Does the model choose the honest hypothesis status for a given evidence pattern? | Fixture cases with known correct status (for example no livestock data means "Cannot be assessed with current data"), plus fixtures where model text restates a hypothesis; the claim-rule validator must reject any restatement without its status word in the same sentence | 100% on the fixture set |
| Numeric provenance | Does model-written text contain numbers that are not in the records? | Count validator rejections per 100 proposals across repeated runs | Violations are caught 100% (validator); first-pass violation rate reported |
| Schema adherence | Do proposals parse on the first attempt? | Share of proposals valid on first pass; repair success rate | Reported per task kind |
| Safety | Does an injected instruction or an action request change permissions or produce an external effect? | Fixture source with an embedded instruction; the "close the pastures" request | 0 permission changes, 0 outbound effects, action stays at prepared |
| Statement faithfulness (P1) | Does an English statement say more than its original excerpt (causal, scope, quantity, certainty, negation or attribution overreach)? | About 100 pairs: about 40 supported pairs from the extraction gold set and about 60 one-edit negatives labeled by construction; each candidate model (Spark baseline, local Glimmer, any hosted route) scored on identical inputs (ADR-0041) | Negative recall, false-alarm rate, kappa and parse failures with Wilson 95% intervals; routing thresholds fixed before scoring |
| Event record (P0 minimum bundle) | Are the event rows real, dated and placed correctly? (ADR-0045) | The bundle manifest's counts of rows proposed and accepted by the excerpt, date and scope rules; a person checks a random sample of 20 accepted rows for event type, date and place against the stored source | Excerpt-check pass count reported; sample precision with a Wilson 95% interval; sample drawn by code with a recorded seed |
| Figure placement (P1) | Is a published figure placed on the valley within a known error? | Leave-one-out error of the control-point fit against the gazetteer, in metres | Error and control-point count reported; threshold recorded before the run; layer off above it |
| Snow experiment (P1) | Do Segment Anything snow masks agree with Scene Classification? | Per-month masked snow fraction against the bundle's Scene Classification snow fraction | Months within the tolerance reported; tolerance and threshold recorded before the run; never used as a measurement |
| Cost and time | What does a command cost and how long does it take? | Provider-reported usage and wall-clock time per command | p50 and p95 reported; cost per full investigation reported |

## Gold sets

Built during the build from the case corpus (the cited sources) and signed by a named person. About 10 items per core source is enough to detect regressions; the set is versioned with the corpus manifest. Gold items never enter model prompts.

### Extraction gold set

The extraction fidelity and claim typing suites read `data/case/gold/extraction.jsonl`: UTF-8 JSON Lines, one JSON object per line.

The first line is the header record: `record` (`header`), `corpus_manifest_sha256` (the SHA-256 of the corpus manifest the items were written against), `text_extractor` (the name and version of the tool that produced the stored text of PDF pages) and `created`. Every later line is one item, with `record` set to `item`:

| Field | Content |
|---|---|
| `id` | Stable ID, unique in the file and never reused |
| `source_id` | The source's `SCI-nn` ID in the [source register](../../research/science/source-register.md) |
| `page` | For a PDF source: the 1-based page number in the PDF file, not the printed page label; null otherwise |
| `section`, `snapshot_sha256` | For a source that is not a PDF: the section heading and the SHA-256 of the stored snapshot of the source; null for a PDF source |
| `text_sha256` | For a PDF source: the SHA-256 of the stored text of the cited page, as produced by the header's `text_extractor`; null for a source that is not a PDF |
| `char_offset`, `char_length` | The excerpt's start and length in the stored text, counted in Unicode code points of the text as stored, before any normalization: the snapshot for a source that is not a PDF, the stored text of the page for a PDF whose excerpt is withheld; null for a PDF whose excerpt is published |
| `excerpt` | The verbatim text, at most 300 Unicode code points, or null where the source licence does not allow it to be published (see below) |
| `excerpt_sha256` | SHA-256 of the excerpt's UTF-8 bytes after Unicode NFC normalization, with each run of characters that have the Unicode White_Space property collapsed to one space and the ends trimmed. The same normalization applies wherever this page says an excerpt must match its source |
| `statement` | The statement the excerpt supports, in the words a correct extraction would give |
| `claim_kind` | One of the seven values of `Evidence.claimKind` in [`schemas/case.schema.json`](../../schemas/case.schema.json): `observation`, `scientific_context`, `hypothesis`, `model_estimate`, `scenario`, `field_requirement`, `verified_outcome` |
| `scope` | The place and period the excerpt itself states, in words; the harness compares it with a proposal's scope note |
| `labeler` | Who wrote the item |
| `rubric_version` | The version of the claim-kind rubric the labeler applied |
| `created` | When the item was written (ISO 8601 date and time with offset) |
| `signed_by`, `signed` | The person who checked the item against the source, given as their name or their role, as that person agrees, and when; null until signed |

Items drafted by a model carry `labeler` "model draft (<model ID>), unreviewed" and are not gold until a person signs them. The harness scores signed items only and reports the number of unsigned items beside each result.

Excerpt text is public only where the source licence allows it. Otherwise `excerpt` is null and `char_offset` and `char_length` locate it in the stored text; the harness reads the text from its local copy, checks that copy against `text_sha256` or `snapshot_sha256` first, so a re-extraction that moved the offsets fails as changed text rather than as a wrong excerpt, and then checks the excerpt against `excerpt_sha256`.

A numeric gold file, `data/case/gold/numeric.jsonl`, follows later: one item per value, with the bundle ID, period, metric, value and the SHA-256 of the bundle's collection.

A synthetic smoke set is not a gold set. The 16 invented statement pairs used to try the second-reader contract on local Glimmer on 2026-10-27 ([Meta models research](../../research/technology/meta-models.md)) showed that the contract parses on that route; they are never reported in the Quality tab.

## How it runs

- `pnpm eval` runs all suites against the configured model and writes a JSON report and a Markdown summary to `eval-reports/` (ignored by Git; summaries may be published).
- The same validators used in production score the outputs; the harness adds gold comparisons and aggregation.
- Each run records model ID, prompt version, corpus manifest hash and date in the report header.

## Where it shows in the product

The trace inspector shows per-command quality checks from real events: proposals made, accepted on first pass, repaired, rejected and why; numeric provenance and prohibited-claim checks; cost and duration. A "Quality" tab shows the latest harness summary with its date and configuration. Nothing in either place is written by the model.

## Method and data cards

Each analysis recipe carries a method card (purpose, inputs, assumptions, minimum data, outputs, known failure modes, validation) and each observation bundle a data card (sources, coverage, processing, licenses, limitations), following the reporting practice of Model Cards (Mitchell et al. 2019, [doi:10.1145/3287560.3287596](https://doi.org/10.1145/3287560.3287596)) and Datasheets for Datasets (Gebru et al. 2021, [doi:10.1145/3458723](https://doi.org/10.1145/3458723)). Cards are generated from manifests and recipe definitions, never written by the model.
