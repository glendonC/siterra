---
status: accepted
date: 2026-10-26
decision-makers: maintainer
---

# Constrain AI composition to a component catalog

## Context and Problem Statement

The workspace composes itself as results arrive, and the model should decide which views a result needs and which records they show. The project does not allow model-generated executable UI, a layout must never carry a fact that is not in a record, and a bad layout proposal must not break the task that produced it. How much of the layout may the model decide, and in what form?

## Considered Options

* Typed layout actions over a fixed component catalog, applied by a deterministic reducer
* Model-written coordinates and partial actions on a canvas, as in the tldraw agent kit
* Model-generated UI code, markup or component trees
* Default projection only, with no model composition

## Decision Outcome

Chosen option: "Typed layout actions over a fixed component catalog, applied by a deterministic reducer", because it follows the established catalog-constrained pattern (a client-owned catalog, binding by reference, keyed replacement and coded validation issues, as in A2UI, MCP Apps and json-render) without generated code.

The model proposes `show_component`, `update_component`, `set_comparison`, `focus_entity` and `hide_component` actions through `propose_layout`. The server validates the whole proposal against the catalog and the case, binds exact entity revisions, and a deterministic reducer applies it inside the commit. The model decides which components a result needs, which records they bind, the comparison mode, the title, and the focus when the user's own command completes. It never decides coordinates, sizes, CSS, markup, code, URLs or section order. Contract: [UX architecture](../reference/ux-architecture.md#ai-composition-contract).

### Consequences

* Good, because layout records are presentation state that can be rebuilt from case records; deleting them loses nothing scientific.
* Good, because a rejected or missing proposal never fails its task: the reducer applies the default projection for the task kind and spends no repair round on layout (PRES-07).
* Bad, because the catalog, its validation rules and a default projection per task kind must be built and maintained.
* Bad, because the last item in the cut order is model-proposed layout itself; if it is cut, the demo must say that results are AI-produced but placement is deterministic.

### Confirmation

The commit validator enforces PRES-01 to PRES-07 ([Data contracts](../reference/data-contracts.md#presentation-contract)). AF-04 (malformed model output writes nothing) and PF-03 (no long task during composition) in [acceptance criteria](../project/acceptance-criteria.md).

## Pros and Cons of the Options

Evidence: [generative workspace research](../../research/technology/generative-workspace.md), sources GW-01 to GW-18.

### Model-written coordinates and partial actions on a canvas, as in the tldraw agent kit

* Good, because one registry pairs each action schema with its executor, and context is sent at several levels of detail.
* Bad, because the kit sends screenshots as context, applies partial actions and reverts their diffs, and silently coerces bad values, which would break the rule that missing is never zero.

### Model-generated UI code, markup or component trees

* Bad, because the project does not allow model-generated executable UI; protocols that carry code need sandboxed iframes, and expressions or state in model output reintroduce code (GW-06, GW-08, GW-11).

### Default projection only, with no model composition

* Good, because placement is fully deterministic.
* Bad, because the model no longer decides what a result needs; it remains the fallback at the end of the cut order.
