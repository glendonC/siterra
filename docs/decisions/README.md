# Decision log

This folder records Siterra's decisions as architecture decision records (ADRs): one Markdown file per decision about the product, experience, system, science, safety or repository standards, stating its context, the options considered, the chosen option, its consequences and how compliance is confirmed. Records follow [MADR 4.0.0](https://adr.github.io/madr/), are cited as `ADR-NNNN`, and link to the documents that hold the detail; a decision is a choice with its reasons, not a claim of built capability or measured results. The `status` field in each record's front matter is one of `proposed`, `rejected`, `accepted`, `deprecated` or `superseded by ADR-NNNN`.

## Add a decision

1. Copy [adr-template.md](adr-template.md), the unmodified MADR 4.0.0 template (MIT OR CC0-1.0), to `NNNN-title-with-dashes.md`. `NNNN` is the next unused number, numbers are never reused, and the title states the decision ([ADR-0027](0027-name-files-and-identifiers-without-temporal-words.md)).
2. Fill in the front matter: `status: proposed`, `date` (the YYYY-MM-DD of the last update) and `decision-makers`; add `consulted` and `informed` when they apply.
3. Keep the MADR section headings unchanged and remove the optional sections you do not use (Decision Drivers, Pros and Cons of the Options, More Information). Link the documents that hold the detail with relative links, and name acceptance criteria IDs under Confirmation.
4. Add a row to the log below. When the maintainer accepts the decision, set `status: accepted` in both the file and the row.

## Supersede a decision

A record is never rewritten to change what it decides. To change a decision, add a new record that states the new decision and links the old one; then set the old record's status to `superseded by ADR-NNNN`, update its `date`, and update both rows in the log. A decision that no longer applies and has no replacement becomes `deprecated`, and a proposal that is turned down becomes `rejected`. Corrections that leave the decision unchanged, such as a broken link, may be made in place.

## Log

| ADR | Title | Status |
|---|---|---|
| [ADR-0000](0000-use-markdown-architectural-decision-records.md) | Use Markdown architectural decision records | accepted |
| [ADR-0001](0001-build-one-gated-case-ending-in-a-field-validation-plan.md) | Build one gated case ending in a field-validation plan | accepted |
| [ADR-0002](0002-differentiate-through-case-discipline.md) | Differentiate through case discipline | accepted |
| [ADR-0003](0003-frame-the-first-case-as-a-grazing-pressure-question.md) | Frame the first case as a grazing pressure question | accepted |
| [ADR-0004](0004-use-the-ait-bouguemez-valley-catchment-as-study-area.md) | Use the Aït Bouguemez valley catchment as study area | accepted |
| [ADR-0005](0005-name-siterra-as-the-only-actor-in-product-copy.md) | Name Siterra as the only actor in product copy | accepted |
| [ADR-0006](0006-use-a-guided-adaptive-investigation-workspace.md) | Use a guided adaptive investigation workspace | accepted |
| [ADR-0007](0007-constrain-ai-composition-to-a-component-catalog.md) | Constrain AI composition to a component catalog | accepted |
| [ADR-0008](0008-make-the-drought-challenge-the-signature-interaction.md) | Make the drought challenge the signature interaction | accepted |
| [ADR-0009](0009-adopt-the-mineral-relief-visual-direction.md) | Adopt the mineral relief visual direction | accepted |
| [ADR-0010](0010-limit-motion-to-reported-state-changes.md) | Limit motion to reported state changes | accepted |
| [ADR-0011](0011-ship-typed-english-commands-before-voice.md) | Ship typed English commands before voice | accepted |
| [ADR-0012](0012-treat-the-case-record-as-authoritative.md) | Treat the case record as authoritative | accepted |
| [ADR-0013](0013-define-contracts-in-json-schema-mirrored-in-zod.md) | Define contracts in JSON Schema mirrored in Zod | accepted |
| [ADR-0014](0014-run-one-coordinator-with-bounded-task-jobs.md) | Run one coordinator with bounded task jobs | accepted |
| [ADR-0015](0015-use-a-meta-model-through-the-responses-api.md) | Use a Meta model through the Responses API | accepted |
| [ADR-0016](0016-adopt-the-typescript-react-maplibre-postgresql-stack.md) | Adopt the TypeScript, React, MapLibre and PostgreSQL stack | accepted |
| [ADR-0017](0017-host-on-railway-with-render-as-fallback.md) | Host on Railway with Render as fallback | accepted |
| [ADR-0018](0018-self-host-the-regional-map-bundle.md) | Self-host the regional map bundle | accepted |
| [ADR-0019](0019-use-domain-events-as-the-public-trace.md) | Use domain events as the public trace | accepted |
| [ADR-0020](0020-keep-tldraw-and-generated-ui-out-of-the-critical-path.md) | Keep tldraw and generated UI out of the critical path | accepted |
| [ADR-0021](0021-precompute-observations-and-run-investigation-work-live.md) | Precompute observations and run investigation work live | accepted |
| [ADR-0022](0022-use-sentinel-2-chirps-copernicus-dem-and-worldcover.md) | Use Sentinel-2, CHIRPS, Copernicus DEM and WorldCover | accepted |
| [ADR-0023](0023-prohibit-causal-diagnosis-and-outcome-claims.md) | Prohibit causal diagnosis and outcome claims | accepted |
| [ADR-0024](0024-require-role-specific-review-with-no-outbound-actions.md) | Require role-specific review with no outbound actions | accepted |
| [ADR-0025](0025-publish-by-default-and-keep-private-by-exception.md) | Publish by default and keep private by exception | accepted |
| [ADR-0026](0026-organize-documentation-with-diataxis-arc42-and-madr.md) | Organize documentation with Diataxis, arc42 and MADR | accepted |
| [ADR-0027](0027-name-files-and-identifiers-without-temporal-words.md) | Name files and identifiers without temporal words | accepted |
| [ADR-0028](0028-describe-observation-bundles-as-a-stac-catalog.md) | Describe observation bundles as a STAC catalog | accepted |
| [ADR-0029](0029-store-design-tokens-in-the-dtcg-format.md) | Store design tokens in the DTCG format | accepted |
| [ADR-0030](0030-keep-the-bibliography-in-csl-json.md) | Keep the bibliography in CSL-JSON | accepted |
| [ADR-0031](0031-describe-the-http-api-and-event-stream-with-openapi.md) | Describe the HTTP API and event stream with OpenAPI | accepted |
| [ADR-0032](0032-declare-licensing-with-reuse-and-spdx.md) | Declare licensing with REUSE and SPDX | accepted |
| [ADR-0033](0033-keep-the-autonomous-firm-stance-with-human-authority.md) | Keep the autonomous firm stance with human authority over real-world actions | accepted |
| [ADR-0034](0034-build-translation-ready-and-ship-french-first.md) | Build translation-ready from the start and ship French first | accepted |
| [ADR-0035](0035-compose-map-scenes-from-reusable-templates.md) | Compose map scenes from reusable, case-agnostic templates | accepted |
| [ADR-0036](0036-run-analyses-as-declarative-precomputed-recipes.md) | Run analyses as declarative, precomputed recipes chosen by the model | accepted |
| [ADR-0037](0037-show-comparable-places-as-context-by-analogy.md) | Show comparable places as context by analogy, never as evidence about the case | accepted |
| [ADR-0038](0038-measure-ai-work-with-an-evaluation-harness.md) | Measure AI work with an evaluation harness and show the results | accepted |
| [ADR-0039](0039-forecast-nothing-until-a-backtest-shows-skill.md) | Forecast nothing until a pre-registered backtest shows skill | accepted |
| [ADR-0040](0040-present-the-investigation-as-floating-islands-over-a-full-bleed-map.md) | Present the investigation as floating islands over a full-bleed map | accepted |
| [ADR-0041](0041-give-each-meta-model-one-job-with-an-independent-check.md) | Give each Meta model one job with an independent check | accepted |
| [ADR-0042](0042-compute-the-color-system-for-dark-and-light-themes.md) | Compute the color system for dark and light themes | accepted; its default-theme part superseded by [ADR-0046](0046-use-daylight-as-the-default-theme.md) |
| [ADR-0043](0043-write-in-one-plain-voice-and-lint-product-copy.md) | Write in one plain voice and lint product copy | accepted |
| [ADR-0044](0044-build-the-interface-on-shadcn-with-base-ui-and-mit-components.md) | Build the interface on shadcn with Base UI and adapt only MIT-licensed components | accepted |
| [ADR-0045](0045-extend-the-meta-model-map-to-event-records-figures-and-whole-corpus-reading.md) | Extend the Meta model map to event records, figures and whole-corpus reading | proposed |
| [ADR-0046](0046-use-daylight-as-the-default-theme.md) | Use daylight as the default theme | accepted |
