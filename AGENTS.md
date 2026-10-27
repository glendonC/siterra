# Working standards

Do not be a yes man. Do not guess. Ground your reasoning.

This repository contains a planning and design handoff, not a production application. Read the [documentation index](docs/README.md), then the [decision log](docs/decisions/README.md) and the [delivery plan](docs/project/delivery-plan.md). Follow [CONTRIBUTING.md](CONTRIBUTING.md) for public and private placement, naming, identifiers and licensing. Implementation follows the lanes, ownership and gates in the delivery plan; acceptance IDs in the [acceptance criteria](docs/project/acceptance-criteria.md) define done.

Distinguish verified source facts, design decisions, hypotheses, and unverified access. Never turn conceptual designs, missing measurements, simulated execution, or suggested stakeholder review into real outcomes. A blocked dataset is a useful blocked state, not a reason to fabricate a result.

The case record is authoritative; UI components reference evidence IDs and revisions. Do not allow model-generated executable UI or arbitrary tool execution. No external outreach, spending, land-management authorization, or publication is implied by a case command.

Public implementation requirements must be complete without `.internal/`. Private local notes are gitignored and are not backed up by Git. Do not force-add them. Keep source-specific licenses and attribution separate from project licensing.

## First steps for the build

1. Start GATE-00 and GATE-01 (founder: event fields, Meta Model API key, spend alert) and GATE-02 (science lane: freeze the catchment, build the first validated bundle) in parallel on day 1 ([gates](docs/project/delivery-plan.md#gates)).
2. Platform lane: scaffold the monorepo in [section 5 of the architecture](docs/architecture/05-building-block-view.md), port [`schemas/`](schemas/) to Zod in `packages/contracts`, and add a contract test over `schemas/examples/`.
3. UI lane: build the island shell against fixtures with the generated [tokens](design/tokens/siterra.css), the [components](docs/reference/components.md) and the [microcopy](docs/reference/microcopy.md); use the [prototype](design/prototype/index.html) as a visual reference, not as code to copy. Add the copy lint (VC-06) and the visual budget checks (VC-04, VC-05) early.
4. Agent lane: the Meta adapter and the plan task first, then one deterministic tool, then source reading with excerpt verification ([agent orchestration](docs/reference/agent-orchestration.md), [ADR-0041](docs/decisions/0041-give-each-meta-model-one-job-with-an-independent-check.md)).
5. Science lane: P0 analysis recipes precomputed into bundles ([analysis recipes](docs/reference/analysis-recipes.md)); write the evaluation gold set while reading the corpus ([evaluation](docs/reference/evaluation.md)).
6. Integrate the vertical slice by the end of day 3 (GATE-03). P1 starts only after it passes.
