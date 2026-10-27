---
status: accepted
date: 2026-10-26
decision-makers: maintainer
---

# Use Markdown architectural decision records

## Context and Problem Statement

Siterra makes decisions about its product, experience, system, science, safety and repository standards. Implementers need to see what was decided, which options were weighed and what each choice costs, and a reader must be able to tell when a decision was replaced rather than edited. Which format and structure should these records follow?

## Considered Options

* [MADR](https://adr.github.io/madr/) 4.0.0, the Markdown Architectural Decision Records
* [Michael Nygard's template](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions), the first use of the term "ADR"
* [Sustainable Architectural Decisions](https://www.infoq.com/articles/sustainable-architectural-design-decisions/), the Y-statements
* Other templates listed at <https://github.com/architecture-decision-record/architecture-decision-record>
* Formless: one table of decisions edited in place, with no conventions for file format and structure

## Decision Outcome

Chosen option: "MADR 4.0.0", because

* implicit assumptions should be made explicit, so that people can understand a decision later (see ["A rational design process: How and why to fake it"](https://doi.org/10.1109/TSE.1986.6312940));
* MADR captures any decision in a fixed set of sections: context, considered options, outcome, consequences and confirmation;
* its front matter (`status`, `date`, `decision-makers`, `consulted`, `informed`) records the lifecycle, including `superseded by ADR-NNNN`;
* its file pattern `NNNN-title-with-dashes.md` gives each decision a permanent number, cited as `ADR-NNNN`, in the `docs/decisions` folder that the MADR template itself uses.

### Consequences

* Good, because each decision has its own file, so a change becomes a new record that supersedes the old one, and the reasoning behind both stays readable.
* Good, because acceptance criteria, risks, architecture sections and reference documents can link a decision by number.
* Bad, because decisions spread over many files, and the [decision log](README.md) must list every one of them.

### Confirmation

Every decision file in `docs/decisions` matches `NNNN-title-with-dashes.md`, opens with MADR front matter, keeps the section headings of [adr-template.md](adr-template.md), and has one row with the same status in the [decision log](README.md).

## Pros and Cons of the Options

### Formless: one table of decisions edited in place, with no conventions for file format and structure

* Good, because all decisions fit on one page.
* Bad, because editing a row in place erases the previous decision and its reasons, and a table cell has no room for considered options or consequences.

## More Information

[adr-template.md](adr-template.md) is the MADR 4.0.0 template without changes (MIT OR CC0-1.0). How decision records sit beside the other documentation types: [ADR-0026](0026-organize-documentation-with-diataxis-arc42-and-madr.md). File and identifier naming: [ADR-0027](0027-name-files-and-identifiers-without-temporal-words.md).
