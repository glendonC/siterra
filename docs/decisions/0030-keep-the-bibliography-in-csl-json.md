---
status: accepted
date: 2026-10-26
decision-makers: maintainer
---

# Keep the bibliography in CSL-JSON

## Context and Problem Statement

Siterra's evidence rests on source registers: science (SCI), competitive and market (MKT, with STD and LANG), technology (TECH), generative workspace (GW) and visual design (VIS). The registers are Markdown tables that mix bibliographic fields with inspection notes, so nothing can validate them or render citations from them. Which format should hold the bibliographic data?

## Considered Options

* CSL-JSON, validated against the CSL schema 1.0.2
* BibLaTeX or BibTeX
* Markdown tables only

## Decision Outcome

Chosen option: "CSL-JSON, validated against the CSL schema 1.0.2", because it is JSON with an official JSON Schema (`csl-data.json`), so it is validated with the same tooling as `schemas/`, and it is the native input of citeproc processors and is read directly by pandoc.

* One file per register under `research/bibliography/` (`science.json`, `competitive.json`, `technology.json`, `design.json`).
* `id` holds the register identifier (`SCI-02`), which is also a valid pandoc citation key; `accessed` holds the inspection date of each item; `custom` can carry the SPDX reuse terms of a source.
* Item types cover the corpus: article-journal, report, dataset, software, webpage, standard, post and motion_picture.
* The Markdown register keeps only the identifier, a short label and the inspection note: what the source supports, its limits and its reuse terms.

Schema: [citation-style-language/schema](https://github.com/citation-style-language/schema).

### Consequences

* Good, because bibliographic records can be validated in CI, and pandoc converts them to BibLaTeX when a paper needs it.
* Good, because the access date of each source sits in a standard field instead of prose.
* Bad, because each source lives in two places, a CSL record and a Markdown note, joined by the identifier.
* Bad, because license terms in `custom` are a project convention, not a CSL field with defined meaning.

### Confirmation

CI validates every file in `research/bibliography/` against `csl-data.json` from CSL schema release v1.0.2, and an identifier check confirms that each register identifier has exactly one CSL record and one Markdown entry.

## Pros and Cons of the Options

### BibLaTeX or BibTeX

* Good, because BibLaTeX is maintained and richer for LaTeX output.
* Bad, because validating it needs a TeX toolchain, and it is not the repository's data language.

### Markdown tables only

* Good, because there is one place per source.
* Bad, because tables cannot be validated or rendered as citations, and access dates live in prose.

## More Information

Citing Siterra itself is a separate concern: a root `CITATION.cff` in the Citation File Format at publication.
