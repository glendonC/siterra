---
status: accepted
date: 2026-10-26
decision-makers: maintainer
---

# Adopt the TypeScript, React, MapLibre and PostgreSQL stack

## Context and Problem Statement

Siterra needs a web workspace with one persistent map and scientific charts, a durable case record, a worker that runs bounded agent tasks and keeps running when the browser closes, a streaming channel for events, and offline scientific preprocessing. Versions must be recent enough to carry security fixes and old enough to be stable. Which stack should the build use?

## Considered Options

* One TypeScript stack with PostgreSQL, MapLibre and offline Python preprocessing
* The same stack with Recharts or Apache ECharts as the chart renderer
* Additional infrastructure: Redis or a second queue, a vector database, an agent framework or a live Python service

## Decision Outcome

Chosen option: "One TypeScript stack with PostgreSQL, MapLibre and offline Python preprocessing", because each part meets a stated requirement with verified versions and security floors, and one PostgreSQL database holds the records, the events and the job queue.

Version pins: Node 24 LTS (24.22.1 or later), Next.js 16.4.1 (App Router), React 19.3.1, TypeScript 6.0.3, Tailwind CSS 4.3.3, shadcn/ui components owned in the repository, Motion 14.1.0, MapLibre GL JS 6.14.0, Observable Plot 0.6.17, TanStack Query 5.104.2, Zod 4.6.7, PostgreSQL 13 or later with pg-boss 12.37.1, and Server-Sent Events for the stream. Pins follow a two-week rule with security overrides; the maintained list is in [Architecture constraints](../architecture/02-architecture-constraints.md#pinned-versions), the evidence in [stack versions](../../research/technology/stack-versions.md), and the lockfile becomes the source of truth once it exists. Roles of each layer: [Solution strategy](../architecture/04-solution-strategy.md#technology-choices).

### Consequences

* Good, because security floors are explicit: Next.js 16.0 to 16.4.0 carry critical advisories fixed in 16.4.1 (TECH-36), Zod has a floor at 4.6.6 and MapLibre at 6.4.1.
* Good, because one chart renderer and one datastore keep the system small.
* Bad, because TypeScript 7 cannot be used yet: it ships no compiler API, which typescript-eslint needs (TECH-37).
* Bad, because MapLibre 6 requires WebGL2; without it the map falls back to a static attributed relief image.
* Bad, because the pins come from registry metadata, not an installed build, so they are re-checked before the lockfile is written.

### Confirmation

Re-run the `npm view` queries before writing the lockfile and `npm audit` after the first install; PF-01 to PF-05 in [acceptance criteria](../project/acceptance-criteria.md) on the demo laptop.

## Pros and Cons of the Options

### The same stack with Recharts or Apache ECharts as the chart renderer

* Neutral, because Recharts would be a reasonable conventional React chart choice and ECharts a configurable engine, but neither has a demonstrated unmet requirement; Plot gives explicit marks, scales, facets and annotations for a small scientific chart set (TECH-17, TECH-27, TECH-28).

### Additional infrastructure: Redis or a second queue, a vector database, an agent framework or a live Python service

* Bad, because none has a demonstrated unmet requirement, and each would add a service to run and a way to fail.

## More Information

Which UI component libraries may be installed, adapted or only studied: [ADR-0044](0044-build-the-interface-on-shadcn-with-base-ui-and-mit-components.md). Why no agent runtime: [ADR-0020](0020-keep-tldraw-and-generated-ui-out-of-the-critical-path.md).
