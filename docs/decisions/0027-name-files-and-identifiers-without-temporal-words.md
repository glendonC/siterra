---
status: accepted
date: 2026-10-26
decision-makers: maintainer
---

# Name files and identifiers without temporal words

## Context and Problem Statement

Document names and status lines carried dates, versions and lifecycle words ("preview", "probe", "handoff", "v0.x") that go stale once work moves on. Identifier families collided (C for components and competitive sources, R for risks and presentation rules, D for decisions and differentiation moments, L for language sources and lanes) and used mixed formats (D01, DF-1, SV-1, M01, R1, G0). How should files, identifiers, status and history be named and recorded?

## Considered Options

* Timeless names: lowercase hyphenated paths without dates, versions or status words, `PREFIX-NN` identifiers from one registry, and dates only in standard fields
* Dated or versioned file names
* The existing names and identifier formats

## Decision Outcome

Chosen option: "Timeless names: lowercase hyphenated paths without dates, versions or status words, `PREFIX-NN` identifiers from one registry, and dates only in standard fields", because these are living documents versioned by Git, and a name should describe the content, not its state.

Files and directories:

* Lowercase ASCII letters, digits and hyphens; no spaces, underscores, accents or filler words ([Google file name guidance](https://developers.google.com/style/filenames), [Microsoft .NET contributor guide](https://learn.microsoft.com/en-us/contribute/content/dotnet/dotnet-style-guide)). Standard names keep their defined case, such as `README.md`, `AGENTS.md`, `CONTRIBUTING.md`, `CHANGELOG.md`, `LICENSE`, `REUSE.toml`, and STAC `catalog.json` and `collection.json`.
* No dates, versions, lifecycle or status words (draft, final, preview, probe, status, handoff, wip, old, new, latest), author names or session words in a path. Data identifiers that name the period the data covers, such as `period_2022-04`, describe content and are allowed.
* Numeric prefixes only where a standard defines them: arc42 sections and MADR records.
* Explanation and reference files are noun phrases, how-to files start with an imperative verb, and ADR files state the decision.

Identifiers:

* `PREFIX-NN`: an uppercase prefix of 2 to 4 characters, a hyphen and a zero-padded number; decision records use `ADR-NNNN`, the MADR reference form.
* Allocated in sequence and never reused or renumbered; one owning file per prefix, which other files link to instead of copying rows; the identifier comes first in its heading or table row.
* The registry of prefixes lives in [identifiers](../reference/identifiers.md).

Status and history: decision lifecycle in the MADR `status`; claim status in the evidence labels; delivery progress in the gates and readiness checklist of the delivery plan; contract and token versions in Semantic Versioning `$id` paths, instance fields and `CHANGELOG.md`; bundle lifecycle in the STAC version extension; document history in Git. Dates appear only in standard fields: MADR `date`, CSL `accessed` and `issued`, STAC `datetime`, `created` and `updated`, and changelog release headings. Explanation and reference text avoids "currently", "now", "new", "latest" and "soon" ([Google timeless documentation](https://developers.google.com/style/timeless-documentation)).

### Consequences

* Good, because names and links stay valid as work progresses, and every identifier resolves to one owner.
* Good, because it agrees with MADR's own decision against date-based file names, which says the creation time of an ADR "is of historical interest only" ([MADR ADR-0005](https://github.com/adr/madr/blob/4.0.0/docs/decisions/0005-use-dashes-in-filenames.md)).
* Bad, because no recognized standard prescribes a syntax for requirement identifiers; the `PREFIX-NN` rule generalizes MADR's `ADR-0001` form.
* Bad, because renaming colliding identifiers needs review file by file; a global find-and-replace would mix families.

### Confirmation

A file-name check rejects paths outside the character rule and paths that contain the listed status words; the identifier check confirms that every referenced identifier is defined exactly once in its owning file; a text check finds no `Status:` lines in Markdown documents.

## Pros and Cons of the Options

### Dated or versioned file names

* Good, because the W3C note on [cool URIs](https://www.w3.org/Provider/Style/URI) recommends a creation date in the address of a dated document.
* Bad, because Git already records the history of living documents, and a date or version in the name goes stale or forces renames.

### The existing names and identifier formats

* Bad, because colliding prefixes and mixed formats make references ambiguous, and dated status lines go stale.

## More Information

The working rules for contributors, including the registered prefixes: [CONTRIBUTING.md](../../CONTRIBUTING.md#naming).
