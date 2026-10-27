---
status: accepted
date: 2026-10-26
decision-makers: maintainer
---

# Publish by default and keep private by exception

## Context and Problem Statement

The repository holds specifications, methods, scientific limits, original design work and research registers, and the project also has personal, account-specific, tactical and third-party material. Implementers and reviewers must be able to build and judge Siterra from the repository alone, while some material must never be published. Which material is public?

## Considered Options

* Public by default; private only for personal, account, event-tactics, third-party and raw material
* Private by default, with selected documents published
* Everything public, including third-party captures and raw data

## Decision Outcome

Chosen option: "Public by default; private only for personal, account, event-tactics, third-party and raw material", because the implementation must not depend on private files.

Public: specifications, methods, limits, research registers, and original design work labeled conceptual. Private and gitignored: the founder's directive and personal context, account status and event tactics, third-party screenshots and video frames, raw downloads and unreviewed derivatives. A limitation is never private just because it weakens a demonstration. Placement rules: [CONTRIBUTING.md](../../CONTRIBUTING.md#public-and-private-placement).

### Consequences

* Good, because claims stay auditable and blocked states stay visible.
* Good, because third-party references are linked, not redistributed.
* Bad, because private notes are gitignored and not backed up by Git; another machine or person needs a deliberate transfer.
* Bad, because every first commit and every push needs the publication gate, and the repository asserts no project license until the maintainer chooses one.

### Confirmation

The [publication gate](../../CONTRIBUTING.md#publication-gate) runs before the first commit and before any push: staged paths and contents reviewed, no private details or credentials, scientific statements checked against their cited scope, redistribution rights and attribution confirmed, labels and the license decision confirmed, history inspected once commits exist. RISK-20 in the [risk register](../project/risk-register.md) tracks leaks of private details.

## Pros and Cons of the Options

### Private by default, with selected documents published

* Bad, because public implementation requirements would depend on private files, and limits could stay hidden.

### Everything public, including third-party captures and raw data

* Bad, because third-party captures are not licensed for redistribution, and raw data has not passed rights and quality review.

## More Information

Whether and when to make the repository itself public is a separate founder decision; by default it stays private until the publication gate passes. License metadata: [ADR-0032](0032-declare-licensing-with-reuse-and-spdx.md).
