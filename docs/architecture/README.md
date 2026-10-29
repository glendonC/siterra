# Architecture

Siterra's software architecture described in the arc42 structure. It covers the web workspace (`apps/web`), the worker that runs bounded agent tasks against the Meta Responses API (`apps/worker`, `packages/agent`), the PostgreSQL case database (`packages/db`), the domain and contract packages (`packages/contracts`, `packages/domain`), and the offline Python science pipeline (`science/`) that produces validated STAC observation bundles (`data/bundles/`).

## Sections

| Section | Contents |
|---|---|
| [1. Introduction and goals](01-introduction-and-goals.md) | Requirements overview, quality goals, stakeholders |
| [2. Architecture constraints](02-architecture-constraints.md) | Model platform facts, Meta capabilities, pinned versions, hosting limits, conventions |
| [3. Context and scope](03-context-and-scope.md) | C4 System Context diagram, business and technical context, out-of-scope boundaries |
| [4. Solution strategy](04-solution-strategy.md) | Stack architecture, technology choices, and engineering approaches |
| [5. Building block view](05-building-block-view.md) | C4 Container diagram, repository layout, building blocks and their responsibilities |
| [6. Runtime view](06-runtime-view.md) | Data flow, API and stream, commission, drought challenge, review, and reload scenarios |
| [7. Deployment view](07-deployment-view.md) | Hosting, map and observation assets, deployment checks |
| [8. Cross-cutting concepts](08-cross-cutting-concepts.md) | Case record, state ownership, model boundary, trace, failure behavior, and authority limits |
| [9. Architecture decisions](09-architecture-decisions.md) | Core technical and scientific invariants |
| [10. Quality requirements](10-quality-requirements.md) | Quality goals with scenarios and verification criteria |
| [12. Glossary](12-glossary.md) | Domain and technical terms used across the documentation |

## Sources

Version and platform facts carry `TECH-*` IDs from the [technology source register](../../research/technology/source-register.md). Companion research notes: [stack versions](../../research/technology/stack-versions.md), [map assets](../../research/technology/map-assets.md), [observability](../../research/technology/observability.md), [map scenes](../../research/technology/map-scenes.md). Shared record types are specified in [data contracts](../reference/data-contracts.md) and [`schemas/`](../../schemas/); jobs and tools in [agent orchestration](../reference/agent-orchestration.md). Evidence labels ([V], [D], [H], [U]) follow the [documentation index](../README.md#evidence-labels).

## About arc42

This description follows arc42, the template for documentation of software and system architecture, template version 9.1-EN, created and maintained by Dr. Peter Hruschka, Dr. Gernot Starke and contributors ([arc42.org](https://arc42.org)). The arc42 template is licensed under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/); that license covers the template structure, while Siterra's own licensing is recorded in [CONTRIBUTING.md](../../CONTRIBUTING.md#ownership-and-licensing).
