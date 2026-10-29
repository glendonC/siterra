# Working standards

Do not be a yes man. Do not guess. Ground your reasoning.

Read the [technical documentation index](docs/README.md), [architecture](docs/architecture/README.md), [data contracts](docs/reference/data-contracts.md), and [agent orchestration](docs/reference/agent-orchestration.md). Follow [CONTRIBUTING.md](CONTRIBUTING.md) for public and private placement, naming, identifiers, and licensing.

Distinguish verified source facts, design decisions, hypotheses, and unverified access. Never turn conceptual designs, missing measurements, simulated execution, or suggested stakeholder review into real outcomes. A blocked dataset is a useful blocked state, not a reason to fabricate a result.

The case record is authoritative; UI components reference evidence IDs and revisions. Do not allow model-generated executable UI or arbitrary tool execution. No external outreach, spending, land-management authorization, or publication is implied by a case command.

Public implementation requirements must be complete without `.internal/`. Private local notes are gitignored and are not backed up by Git. Do not force-add them. Keep source-specific licenses and attribution separate from project licensing.

## Architecture and package boundaries

1. **Platform & Contracts (`packages/contracts`, `packages/db`, `packages/domain`, `schemas/`)**: JSON Schema 2020-12 and STAC 1.1.0 contracts mirrored in Zod (`packages/contracts`), append-only PostgreSQL revisions (`packages/db`), deterministic branch scoring (`merge@2`) and minimum field-plan test covers (`packages/domain`).
2. **Agent & Worker (`packages/agent`, `apps/worker`)**: Bounded task coordinator and executors (`plan`, `observation_analysis`, `source_research`, `livelihood_governance`, `explanation_branches`, `intervention_feasibility`, `brief_package`) over the Meta Responses API with strict JSON Schema structured outputs, pre-registered predictions committed before data reads (`DF-07` to `DF-09`), and verbatim excerpt and numeric provenance checks ([agent orchestration](docs/reference/agent-orchestration.md)).
3. **Science Pipeline (`science/`, `data/bundles/`)**: Offline reproducible Python pipeline producing checksummed STAC 1.1.0 observation bundles and pre-registered statistical recipes ([analysis recipes](docs/reference/analysis-recipes.md)) plus the evaluation gold sets ([evaluation](docs/reference/evaluation.md)).
4. **Workspace UI (`apps/web`)**: MapLibre GL 3D relief stage, floating islands, synchronized temporal scrubbers, explanation branch ledger (`CMP-23`), inline source/measurement inspector, and copy/visual-budget checks (`VC-01` to `VC-06`) ([components](docs/reference/components.md), [microcopy](docs/reference/microcopy.md), [scenes](docs/reference/scenes.md)).
