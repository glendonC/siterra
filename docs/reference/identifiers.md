# Identifiers

Every document and specification ID prefix used in Siterra, the file that owns it, and the form it takes. Rules for allocating IDs are in [CONTRIBUTING.md](../../CONTRIBUTING.md#identifiers).

| Prefix | Meaning | Owning specification |
|---|---|---|
| PC, IU, AF, SV, VC, MQ, PF, SC, AN, EV, I18N, RL, TR, SA, DF | Quality, scientific validity, traceability, safety, and differentiation criteria | [architecture/10-quality-requirements.md](../architecture/10-quality-requirements.md) |
| A11Y-NN | Accessibility release check | [reference/accessibility-and-language.md](accessibility-and-language.md#release-checks) |
| PRES-NN | Presentation rule | [reference/data-contracts.md](data-contracts.md#presentation-contract) |
| CMP-NN | Component | [reference/components.md](components.md) |
| MOT-NN | Motion | [reference/motion.md](motion.md) |
| VT-NN | Copy lint rule | [reference/voice-and-tone.md](voice-and-tone.md#lint-rules) |
| SCI-NN | Scientific and geospatial sources, datasets, and official statistics | [research/science/source-register.md](../../research/science/source-register.md) |
| TECH-NN | Technology sources | [research/technology/source-register.md](../../research/technology/source-register.md) |
| GW-NN | Generative workspace sources | [research/technology/generative-workspace.md](../../research/technology/generative-workspace.md) |
| MM-NN | Meta model sources | [research/technology/meta-models.md](../../research/technology/meta-models.md) |
| MS-NN | Map scene sources | [research/technology/map-scenes.md](../../research/technology/map-scenes.md) |
| VIS-NN | Visual design references | [research/design/source-register.md](../../research/design/source-register.md) |
| WRT-NN | Writing and voice sources | [research/design/writing.md](../../research/design/writing.md) |

Data identifiers in records keep their `type_slug` form (`case_`, `ev_`, `period_YYYY-MM`); they are data, not document IDs ([data contracts](data-contracts.md#identifiers)).
