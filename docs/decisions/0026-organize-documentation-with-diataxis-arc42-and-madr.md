---
status: accepted
date: 2026-10-26
decision-makers: maintainer
---

# Organize documentation with Diataxis, arc42 and MADR

## Context and Problem Statement

Siterra's documentation covers product and science rationale, normative contracts, architecture, decisions, delivery plans and research. Numbered flat files (00 to 20) encoded a reading order that breaks when a document is inserted, decisions were edited in place, and the same rationale was copied into several documents. Which structure should the documentation follow?

## Considered Options

* Diataxis types for general documentation, arc42 for architecture and MADR for decisions
* Numbered flat files in one folder
* Diataxis types only, with architecture spread across reference and explanation
* Folders by product feature

## Decision Outcome

Chosen option: "Diataxis types for general documentation, arc42 for architecture and MADR for decisions", because each is a published convention for its kind of content, and together they give every document one home.

* `docs/explanation/` (why) and `docs/reference/` (normative contracts and catalogs) follow the [Diataxis](https://diataxis.fr/) types. `docs/how-to/` starts with its first goal-oriented guide and `docs/tutorials/` only when a tutorial exists, because Diataxis advises against creating empty type folders up front.
* `docs/architecture/` follows the [arc42](https://arc42.org/overview) template 9.1-EN (release 2026.10.19, [source](https://github.com/arc42/arc42-template)): a `README.md` plus one file per section, `01-` to `12-`, in the plain variant without help text. Diagrams follow the [C4 model](https://c4model.com/), with the System Context in section 3 and the Container view in section 5, drawn as Mermaid flowcharts because Mermaid's own C4 syntax is experimental.
* `docs/decisions/` follows MADR 4.0.0 ([ADR-0000](0000-use-markdown-architectural-decision-records.md)), and arc42 section 9 links the decision log instead of copying it.
* `docs/project/` holds the delivery documents: plan, acceptance criteria, demo plan and risk register.
* Every documentation directory has a `README.md` that gives its reading order; file names carry numbers only where arc42 or MADR define them ([ADR-0027](0027-name-files-and-identifiers-without-temporal-words.md)).

### Consequences

* Good, because a reader can tell from the folder whether a document explains, specifies or decides.
* Good, because rationale lives once, in an ADR, and reference documents link to it instead of copying it.
* Bad, because arc42 sections mix explanation and reference; arc42 stays intact, long normative specifications stay in `docs/reference/`, and arc42 section 8 summarizes and links them.
* Bad, because arc42's help text is licensed CC BY-SA 4.0; the plain variant avoids copying it, and the arc42 license states that content written in arc42 structure is not placed under CC BY-SA.

### Confirmation

A Markdown link check and an identifier check (every referenced ID defined exactly once) pass after every documentation change; every documentation directory has a `README.md`; `docs/architecture/` holds only its `README.md` and the twelve arc42 section files.

## Pros and Cons of the Options

### Numbered flat files in one folder

* Good, because the reading order is visible in a directory listing.
* Bad, because the numbers encode an ad hoc order that breaks on insertion, and links by number ("[14]") hide the subject of the target.

### Diataxis types only, with architecture spread across reference and explanation

* Bad, because architecture content would split across type folders and lose arc42's standard sections (constraints, building blocks, runtime, deployment, cross-cutting concepts, quality requirements, risks).

### Folders by product feature

* Bad, because Diataxis criticizes structuring documentation around product features.

## More Information

The working rules for contributors: [CONTRIBUTING.md](../../CONTRIBUTING.md#documentation).
