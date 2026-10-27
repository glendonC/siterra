# Risks and technical debts

The technical risks the architecture must absorb and the known gaps in what has been verified. Risks are owned by the [risk register](../project/risk-register.md), which holds likelihood, impact, signals, mitigations and fallbacks; this section lists only the technical subset and where the architecture answers each.

## Technical risks

| Risk | Subject | Where the architecture answers it |
|---|---|---|
| RISK-01 | Meta model access, billing, region or model availability | [Model access gate and fallbacks](02-architecture-constraints.md#model-access-gate) |
| RISK-02 | Unreliable structured output or tool calling | [Agent work](08-cross-cutting-concepts.md#agent-work): strict schemas, one repair, deterministic tools, validators |
| RISK-03 | Observation pipeline slower or harder than planned | [Observations and provenance](08-cross-cutting-concepts.md#observations-and-provenance); blocked-observation path |
| RISK-04 | Snow, cloud and terrain shadow leave winter months unusable | Coverage policy and visible gaps ([scientific validity](10-quality-requirements.md#scientific-validity)) |
| RISK-06 | Map tile licensing or third-party server failure | [Self-hosted map bundle](07-deployment-view.md#map-and-observation-assets) and static relief fallback |
| RISK-08 | Hosting cannot keep a worker alive or breaks SSE | [Hosting and deployment checks](07-deployment-view.md#deployment-checks) |
| RISK-10 | Scientific overclaiming in copy or model text | Claim kinds, numeric provenance and prohibited-claims checks ([agent work](08-cross-cutting-concepts.md#agent-work)) |
| RISK-11 | Prompt injection through retrieved sources | [Security and privacy](08-cross-cutting-concepts.md#security-and-privacy); no outbound tools |
| RISK-12 | Cost overrun | Host-enforced budgets ([agent work](08-cross-cutting-concepts.md#agent-work)) |
| RISK-13 | Parallel coding agents collide | Lane ownership and [integration contracts](05-building-block-view.md#integration-contracts) |
| RISK-14 | Accessibility gaps found late | [Accessibility](10-quality-requirements.md#accessibility) checks |
| RISK-21 | No hard spending cap on the model account | Application budgets as the only hard stop ([model platform](02-architecture-constraints.md#model-platform)) |
| RISK-22 | SSE requests close after 15 minutes; a limited trial blocks outbound calls | [Hosting limits](02-architecture-constraints.md#hosting-limits): heartbeat, `Last-Event-ID` reconnect, paid plan |

The remaining risks in the register concern inconclusive evidence, schedule, event rules, corpus rights, communities, language, recording, competitor descriptions and private details.

## Technical debts and unverified items

Each item is a known gap, not a defect found in running code.

| Item | Consequence | Handling |
|---|---|---|
| The pinned stack has not been installed or built together; `maplibre-contour` 0.1.1 with `maplibre-gl` 6.14.0 and the `pmtiles` protocol with a `raster-dem` source on MapLibre 6 are unverified ([stack versions](../../research/technology/stack-versions.md#not-verified)) | Pins are candidates from registry metadata | Re-run `npm view` before writing the lockfile; `npm audit` after the first install |
| Model access, the model list for the account, native search with `store: false`, the configured maximum output tokens and SDK compatibility are unverified ([technology register](../../research/technology/source-register.md#access-and-verification-gaps)) | No live-autonomy claim until proven | GATE-01 smoke test |
| No imagery or rainfall raster has been processed; the catchment is a preview computed from the DEM's 55 m overview with a stdlib script, not validated hydrology software ([data sources and reproducible methods](../reference/data-sources-and-methods.md#study-area)) | No measurement exists | Native-resolution freeze procedure, then GATE-02 |
| The meaning of `earthsearch:boa_offset_applied` is unconfirmed ([observation preprocessing](../reference/observation-preprocessing.md#default-route-earth-search-legacy-sentinel-2-l2a)) | The harmonization rule stays unconfirmed; harmonized and unharmonized values must never mix | Element 84 documentation and two scenes either side of January 2022 |
| Cloud Score+ is not available on the default Earth Search route | Masks use scene classification only and carry "reduced QA (scene classification only)" | Manual review of sample months; Earth Engine route only if an eligible project exists |
| Map asset sizes are unknown; only tile counts are arithmetic ([map assets](../../research/technology/map-assets.md)) | Hosting layout and the 50 MB commit target are unchecked | Dry-run extracts before choosing the hosting layout |
| The OpenTelemetry GenAI conventions have Development status ([observability](../../research/technology/observability.md)) | Span names may change upstream | Convention revision pinned and mapped in one module |
