# Gold set labeling rubric

Rubric version 2, 2026-10-27. Drafted by a model; a person reviews each item and signs it before it is called gold. Version 2 states scope in words, as [evaluation](../../../docs/reference/evaluation.md#extraction-gold-set) requires; version 1 used a fixed list.

## Claim kind

The seven values of `Evidence.claimKind` in [`schemas/case.schema.json`](../../../schemas/case.schema.json). The schema wins over any other list.

| Kind | Use when the statement says | Not when |
|---|---|---|
| `observation` | What Siterra's own validated data show for the case area: a bundle value with its period and geometry | A source reports a measurement; that is `scientific_context` |
| `scientific_context` | What a published source reports, finds, defines or recommends, attributed to that source, at the source's own scope | The statement applies a source's finding to the valley without the source saying so |
| `hypothesis` | A candidate explanation that the case keeps open with its status | A source asserts the explanation as its finding; label that `scientific_context` and attribute it |
| `model_estimate` | A number produced by a model or recipe that estimates rather than measures | The number is a stored bundle value (`observation`) |
| `scenario` | What would follow under a stated assumption | Any statement about what did happen |
| `field_requirement` | What must be measured, asked or checked on the ground to decide something | A source's own recommendation; that is `scientific_context` |
| `verified_outcome` | A result confirmed on the ground by a reviewer | Anything not confirmed on the ground; nothing in this corpus qualifies |

An item drawn from a source excerpt is almost always `scientific_context`. The extraction set therefore tests excerpt fidelity and attribution more than claim typing; claim typing needs items from case statements as well, which this version does not contain.

## Scope

The place and period the excerpt itself states, in words, never wider: for example "Morocco ('the country'); November 2021 to February 2022" or "No place or period stated" for a method. Where the excerpt leaves the place or year to its document, name the document in the scope (for example "brief of 21 July 2022"). A national brief about Morocco speaks for Morocco even where the case is a valley.

## Statement

- One English sentence that says no more than the excerpt: no causal upgrade, no wider scope, no changed quantity, no added certainty, no dropped negation, the same actor and period.
- Attribute it: name the source or its author where the excerpt reports a finding, and give the date of a dated brief.
- Keep numbers exactly as printed ("250 000", "54 per cent", "0.05°"). Where a source contradicts itself or another brief, keep each as printed and say so in `note`, never in the statement. A figure the source register says not to use is not an item.
- Carry the attribution a source's terms require (for FAO, "© FAO [year] [title]") in `attribution` on every item that publishes its excerpt.
- A statement drawn from a non-English excerpt is a machine-drafted translation: `translation` is true and the original excerpt is the reference.

## Excerpt and locator

- At most 300 Unicode code points, verbatim from the stored text after normalization (NFC, White_Space runs collapsed, ends trimmed); checked by code at build time.
- A PDF is located by page with the SHA-256 of the page's stored text; an HTML page or an abstract record by the section heading in force and the SHA-256 of the stored text. Character offsets count code points of the text as stored, before normalization.
- The public file holds the excerpt text only where the source's `excerptPolicy` in the corpus manifest is `text`; otherwise it holds offsets and the excerpt's SHA-256.

## Review

A model-drafted item carries labeler "model draft (<model ID>), unreviewed" and `signed_by` and `signed` null. A person checks each item against the stored source and this rubric and signs it; only then is it gold. Gold items never enter model prompts.
