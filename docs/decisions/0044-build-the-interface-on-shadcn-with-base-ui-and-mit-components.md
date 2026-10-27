---
status: accepted
date: 2026-10-26
decision-makers: maintainer
---

# Build the interface on shadcn with Base UI and adapt only MIT-licensed components

## Context and Problem Statement

The founder wants the sleekest available components, including niche libraries shared on X and AffectUI. Component libraries differ in license (MIT, Commons Clause, commercial, none), accessibility and motion discipline, and the repository is public by default ([ADR-0025](0025-publish-by-default-and-keep-private-by-exception.md)). Which building blocks are safe to install, adapt or only study? Evidence: [UI patterns research](../../research/design/ui-patterns.md) and [component libraries research](../../research/design/component-libraries.md).

## Considered Options

* Buy a commercial AI component kit (for example AffectUI Pro)
* Assemble many niche libraries as dependencies
* shadcn components on Base UI primitives as the base, adapting a few MIT components and studying the rest as patterns

## Decision Outcome

Chosen option: "shadcn on Base UI, adapt MIT, study the rest", because it gives accessible primitives and owned source, keeps the repository publishable, and still borrows the best patterns.

* Install: shadcn components initialized with Base UI (pass `--base base` explicitly), shadcn AI patterns (prompt input, suggestion, sources, inline citation, plan, task, queue, trace), shadcn Toast or Sonner.
* Adapt with the MIT notice kept: Hairline UI components (citation, task log, plan, segmented control), Kokonut UI `ai-citations`, AffectUI free MIT items (`thinking-loader-clean`, `tool-call-card-clean`, `segmented-control-clean`).
* Study only: AffectUI Pro (AI Answer, Cited Answer, Chat Composer, Agent Plan, Review Center), commercial kits, and React Aria as the accessibility reference.
* Avoid: React Bits and shadcn/studio (Commons Clause), Skiper UI (no license found), Vaul (unmaintained), libraries without reduced-motion or ARIA handling, marketing-effect libraries.

Hover cards are not reachable by keyboard or screen readers, so every citation also opens a focusable popover or the inspector.

### Consequences

* Good, because licenses are clean for a public repository and accessibility rests on maintained primitives.
* Bad, because the best-looking Pro patterns must be rebuilt rather than installed.

### Confirmation

A license check in the publication gate; keyboard and screen-reader acceptance tests for citations, timeline and review.
