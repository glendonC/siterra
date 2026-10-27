# Architecture

Siterra's software architecture described in the twelve sections of the arc42 template. It covers the planned application: a web workspace, a worker that runs bounded agent tasks against the Meta model, a PostgreSQL case record that every view projects, and an offline science pipeline that produces validated observation bundles. The sections are a specification: they state what the implementation must do and link the specifications and decision records that govern it. Time and performance figures are acceptance targets, not measurements.

## Sections

| Section | Contents |
|---|---|
| [1. Introduction and goals](01-introduction-and-goals.md) | Requirements overview, quality goals, stakeholders |
| [2. Architecture constraints](02-architecture-constraints.md) | Model platform facts, model access gate, Meta capabilities, pinned versions, hosting limits, conventions |
| [3. Context and scope](03-context-and-scope.md) | C4 System Context diagram, business and technical context, what is out of scope |
| [4. Solution strategy](04-solution-strategy.md) | The stack in one paragraph, technology choices, the approaches behind the quality goals |
| [5. Building block view](05-building-block-view.md) | C4 Container diagram, repository layout, building blocks and their owners |
| [6. Runtime view](06-runtime-view.md) | Data flow, API and stream, commission, drought challenge, review and reload scenarios |
| [7. Deployment view](07-deployment-view.md) | Hosting, map and observation assets, deployment checks |
| [8. Cross-cutting concepts](08-cross-cutting-concepts.md) | Case record, state ownership, model boundary, trace, failure behavior, and summaries of the long reference specifications |
| [9. Architecture decisions](09-architecture-decisions.md) | Pointer to the decision log |
| [10. Quality requirements](10-quality-requirements.md) | Quality goals with scenarios and acceptance criteria IDs |
| [11. Risks and technical debts](11-risks-and-technical-debts.md) | Technical risks from the risk register, known technical debt and unverified items |
| [12. Glossary](12-glossary.md) | Domain and technical terms used across the documentation |

## Sources

Version and platform facts carry `TECH-*` IDs from the [technology source register](../../research/technology/source-register.md). Companion research notes: [stack versions](../../research/technology/stack-versions.md), [map assets](../../research/technology/map-assets.md), [observability](../../research/technology/observability.md), [map scenes](../../research/technology/map-scenes.md). Shared record types are specified in [data contracts](../reference/data-contracts.md) and [`schemas/`](../../schemas/); jobs and tools in [agent orchestration](../reference/agent-orchestration.md). Evidence labels ([V], [D], [H], [U]) follow the [documentation index](../README.md#evidence-labels).

## About arc42

This description follows arc42, the template for documentation of software and system architecture, template version 9.1-EN (October 2026), created and maintained by Dr. Peter Hruschka, Dr. Gernot Starke and contributors. See [arc42.org](https://arc42.org). Section titles follow the template's English source; file names use them in lowercase with hyphens. No template help text is copied.

The arc42 template is licensed under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). That license covers the template, not this content: the arc42 license states that publishing an architecture document in arc42 structure does not place the author's own content under CC BY-SA. Siterra's own licensing is recorded in [CONTRIBUTING.md](../../CONTRIBUTING.md#ownership-and-licensing).
