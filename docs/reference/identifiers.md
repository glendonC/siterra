# Identifiers

Every document ID used in Siterra, the file that owns it, and the form it takes. Rules for allocating IDs are in [CONTRIBUTING.md](../../CONTRIBUTING.md#identifiers).

Each prefix has one owning file; other files cite the ID and link the owner.

| Prefix | Meaning | Owning file |
|---|---|---|
| ADR-NNNN | Decision record | [decisions/](../decisions/README.md) |
| GATE-NN | Delivery gate | [project/delivery-plan.md](../project/delivery-plan.md#gates) |
| RISK-NN | Risk | [project/risk-register.md](../project/risk-register.md) |
| PC, IU, AF, SV, VC, MQ, PF, SC, AN, EV, I18N, RL, TR, SA, DQ | Acceptance criteria | [project/acceptance-criteria.md](../project/acceptance-criteria.md) |
| DF-NN | Differentiation acceptance test | [explanation/competitive-position.md](../explanation/competitive-position.md#testable-differentiation-acceptance-tests-df-01-to-df-06) |
| A11Y-NN | Accessibility release check | [reference/accessibility-and-language.md](accessibility-and-language.md#release-checks) |
| PRES-NN | Presentation rule | [reference/data-contracts.md](data-contracts.md#presentation-contract) |
| CMP-NN | Component | [reference/components.md](components.md) |
| MOT-NN | Motion | [reference/motion.md](motion.md) |
| VT-NN | Copy lint rule | [reference/voice-and-tone.md](voice-and-tone.md#lint-rules) |
| SCI-NN | Scientific and geospatial sources, datasets and official statistics | [research/science/source-register.md](../../research/science/source-register.md) |
| MKT-NN, STD-NN, LANG-NN | Competitive, standards and language sources | [research/competitive/source-register.md](../../research/competitive/source-register.md) |
| TECH-NN | Technology sources | [research/technology/source-register.md](../../research/technology/source-register.md) |
| GW-NN | Generative workspace sources | [research/technology/generative-workspace.md](../../research/technology/generative-workspace.md) |
| MM-NN | Meta model sources | [research/technology/meta-models.md](../../research/technology/meta-models.md) |
| MS-NN | Map scene sources | [research/technology/map-scenes.md](../../research/technology/map-scenes.md) |
| VIS-NN | Visual design references | [research/design/source-register.md](../../research/design/source-register.md) |
| WRT-NN | Writing and voice sources | [research/design/writing.md](../../research/design/writing.md) |
| UI-NN | Private interface captures (not redistributable) | `design/private/references/ui-manifest.json` (ignored) |
| P0, P1, P2 | Priority | [project/delivery-plan.md](../project/delivery-plan.md#priorities) |

Data identifiers in records keep their `type_slug` form (`case_`, `ev_`, `period_YYYY-MM`); they are data, not document IDs ([data contracts](data-contracts.md#identifiers)).
