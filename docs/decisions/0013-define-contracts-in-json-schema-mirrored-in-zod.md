---
status: accepted
date: 2026-10-26
decision-makers: maintainer
---

# Define contracts in JSON Schema mirrored in Zod

## Context and Problem Statement

Several lanes build in parallel: platform, agent runtime, science pipeline and workspace UI. They exchange case records, commands, events, commits and observation bundles, and the Python science pipeline produces bundles that the TypeScript application imports. Model-facing output schemas must also fit Meta's strict structured-output subset (TECH-06). Where are these contracts defined, and in what language?

## Considered Options

* JSON Schema 2020-12 files in `schemas/` as the shared contract, mirrored in Zod
* Zod in TypeScript as the only source
* No fixed contracts, with types emerging in each lane's code

## Decision Outcome

Chosen option: "JSON Schema 2020-12 files in `schemas/` as the shared contract, mirrored in Zod", because parallel lanes in two languages need fixed contracts before code.

[case.schema.json](../../schemas/case.schema.json) holds the case contracts (snapshots, commands, events and commit proposals, version 1.2.0), observation bundles are STAC Collections and Items constrained by the Siterra STAC extension ([siterra-extension.schema.json](../../schemas/stac/siterra-extension.schema.json), version 1.0.0, [ADR-0028](0028-describe-observation-bundles-as-a-stac-catalog.md)), and [openapi.json](../../schemas/openapi.json) describes the HTTP API and event stream ([ADR-0031](0031-describe-the-http-api-and-event-stream-with-openapi.md)). Zod schemas in `packages/contracts` mirror the case contracts and the bundle fields the application reads, and model-facing output and tool schemas are generated from the same Zod source. Versions live in the schema `$id` (for STAC, in the extension URL listed in `stac_extensions`) and in the instance field `schemaVersion`, never in titles or file names ([ADR-0027](0027-name-files-and-identifiers-without-temporal-words.md)). Cross-record semantics that a schema cannot express: [Data contracts](../reference/data-contracts.md).

### Consequences

* Good, because UI work proceeds against fixtures while the backend is built, and the science pipeline validates its output against the same file the application reads.
* Good, because one Zod source drives storage validation, model-facing schemas and tests.
* Bad, because two representations must stay in sync, which needs a contract test.
* Bad, because model-facing schemas must stay inside Meta's strict subset (a plain object root, no `oneOf` or `allOf`, every object closed with every property required, no recursion, depth at most 10); the storage and wire schema may use `oneOf` at its root because it is never sent to the model.

### Confirmation

A contract test validates every file in [schemas/examples/](../../schemas/examples/) with both the JSON Schema and Zod, and rejects any model-facing schema outside Meta's strict subset. SA-09 in [acceptance criteria](../project/acceptance-criteria.md) keeps example IDs and synthetic values out of the demo database.

## Pros and Cons of the Options

### Zod in TypeScript as the only source

* Good, because there is one representation to maintain.
* Bad, because the Python science pipeline also writes and checks bundles, so the contract must be language-neutral.

### No fixed contracts, with types emerging in each lane's code

* Bad, because parallel coding agents collide on shared types (RISK-13 in the [risk register](../project/risk-register.md)), and the delivery plan requires contracts before code in every lane.

## More Information

Observation bundles are described as a STAC catalog by [ADR-0028](0028-describe-observation-bundles-as-a-stac-catalog.md); the HTTP API and event stream are described in OpenAPI by [ADR-0031](0031-describe-the-http-api-and-event-stream-with-openapi.md).
