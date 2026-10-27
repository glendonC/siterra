---
status: accepted
date: 2026-10-26
decision-makers: maintainer
---

# Keep tldraw and generated UI out of the critical path

## Context and Problem Statement

Several technologies promise visible agent work or broader scope: an infinite canvas with an agent kit (tldraw), managed agent runtimes (Naïve), model-generated interfaces, multi-case workspaces and analysis of any polygon. Each adds cost and risk. Which of them, if any, belong in the build of one case?

## Considered Options

* Keep tldraw, Naïve and other agent runtimes, multi-case features, arbitrary polygons and generated UI code out of P0 and P1
* Build the workspace on the tldraw agent starter kit
* Run tasks on Naïve or another managed agent runtime

## Decision Outcome

Chosen option: "Keep tldraw, Naïve and other agent runtimes, multi-case features, arbitrary polygons and generated UI code out of P0 and P1", because each adds cost and risk without improving the case's results.

An `ExecutionBackend` interface is the extension point: it accepts the same typed task envelope and normalizes events, with PostgreSQL staying authoritative ([Agent orchestration](../reference/agent-orchestration.md)). A canvas is reconsidered only if the product later needs freeform user sketching, and then as a projection of the case record with a license key in hand.

### Consequences

* Good, because the build carries no SDK license-key dependency, no second pan-and-zoom system, and no extra accounts, policies or failure modes.
* Good, because model-generated interface code has no path into the product ([ADR-0007](0007-constrain-ai-composition-to-a-component-catalog.md)).
* Bad, because users cannot sketch, open a second case or analyze a polygon of their own; the analysis area is fixed ([ADR-0004](0004-use-the-ait-bouguemez-valley-catchment-as-study-area.md)).

### Confirmation

Code review finds no tldraw or agent-runtime dependency and no code path that renders model-written code or markup, and the layout validator rejects code, markup, CSS and URLs (AF-04 in [acceptance criteria](../project/acceptance-criteria.md) covers rejected proposals).

## Pros and Cons of the Options

Evidence: [generative workspace research](../../research/technology/generative-workspace.md) (GW-01 to GW-04) and the [technology source register](../../research/technology/source-register.md) (TECH-11 to TECH-13, TECH-24 to TECH-26).

### Build the workspace on the tldraw agent starter kit

* Good, because it has real shape actions, structured context and streamed updates (TECH-11).
* Bad, because on an unlicensed production host the SDK stops rendering the editor five seconds after load, so a public demonstration needs a key issued for the exact host (GW-03).
* Bad, because its core mechanics (model-written coordinates, applied partial actions, screenshot context, a browser-side agent loop) are the ones Siterra's contracts prohibit, and a map inside a canvas shape would combine two pan-and-zoom systems.

### Run tasks on Naïve or another managed agent runtime

* Good, because it documents session persistence, resumable events, budgets and approval states (TECH-25).
* Bad, because Siterra needs a short, bounded, read-only evidence pipeline, not company identities, wallets or unrestricted computers; a runtime adds account, policy and failure surface, and no Meta route was tested (TECH-24 to TECH-26).
