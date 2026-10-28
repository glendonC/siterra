# Documentation

Everything needed to understand Siterra and build it: why it exists, what it must do, how it will be built, and the evidence behind each choice. Nothing here is a running service yet.

## Start here

| If you want to | Read, in order |
|---|---|
| Understand the problem and the idea (10 minutes) | [The problem](explanation/problem.md), [product thesis](explanation/product-thesis.md), [competitive position](explanation/competitive-position.md) |
| See the experience | The [hero sequence](reference/scenes.md#the-hero-sequence-design-language-13), then the [experience storyboard](reference/experience-storyboard.md) |
| Build it | [AGENTS.md](../AGENTS.md), [delivery plan](project/delivery-plan.md), [architecture](architecture/README.md), [data contracts](reference/data-contracts.md), [components](reference/components.md), [acceptance criteria](project/acceptance-criteria.md) |
| Review the science | [Scientific basis](explanation/scientific-basis.md), [data sources and methods](reference/data-sources-and-methods.md), [analysis recipes](reference/analysis-recipes.md), [comparable places](explanation/comparable-places.md) |
| Review the design and the words | [Design system](reference/design-system.md), [voice and tone](reference/voice-and-tone.md), [scenes and views](reference/scenes.md), [design references](explanation/design-references.md) |
| Check a decision | The [decision log](decisions/README.md) |

## How the folders work

| Folder | Holds |
|---|---|
| [explanation/](explanation/README.md) | Why: the problem, the thesis, users, science, references |
| [reference/](reference/README.md) | What the build must do: experience, components, design, words, data, agents, review, access |
| [architecture/](architecture/README.md) | How it is built, in the twelve [arc42](https://arc42.org/) sections |
| [decisions/](decisions/README.md) | Each decision with its options and consequences ([MADR](https://adr.github.io/madr/)) |
| [project/](project/README.md) | Delivery plan, acceptance criteria, demo plan, risks |
| [how-to/](how-to/README.md) | Procedures, such as the publication gate |

Outside `docs/`: [schemas/](../schemas/) (contracts and examples), [design/](../design/README.md) (design tokens), [research/](../research/README.md) (sources and research notes), [CONTRIBUTING.md](../CONTRIBUTING.md) and the [changelog](../CHANGELOG.md).

## Evidence labels

Claims carry a label where the difference matters:

| Label | Meaning |
|---|---|
| **[V]** Verified | Checked against a cited primary source on the stated date |
| **[D]** Decision | A choice with its rationale; changed only through a [decision record](decisions/README.md) |
| **[H]** Hypothesis | A belief to test; never presented as a finding |
| **[U]** Unverified | Access, measurement or permission not yet established |

IDs such as ADR-0041, CMP-08 or SCI-25 are listed with their owning files in [identifiers](reference/identifiers.md).
