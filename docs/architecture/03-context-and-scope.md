# Context and scope

Who and what Siterra exchanges information with, and where its boundary lies. The diagram is a C4 System Context diagram drawn as a Mermaid flowchart; the containers inside Siterra are in the [building block view](05-building-block-view.md).

## System context

```mermaid
flowchart TB
  manager["Program manager<br/>[Person]<br/>Commissions the case, challenges explanations, reads the brief"]
  reviewer["Reviewer roles<br/>[Person]<br/>Scientific, community and livelihood, program. Demo decisions in P0"]
  observer["Observer<br/>[Person]<br/>Read-only inspection of what Siterra did"]

  siterra["Siterra<br/>[Software system]<br/>Holds one case: plans the work, reads sources, loads validated observations, compares explanations, prepares a field-validation plan"]

  meta["Meta Model API<br/>[External system]<br/>Muse Spark on the Responses API"]
  corpus["Publishers and official sites<br/>[External system]<br/>Case corpus sources"]
  earth["Earth Search<br/>[External system]<br/>Sentinel-2 L2A catalog and COGs"]
  chirps["CHIRPS v3.0<br/>[External system]<br/>Monthly rainfall COGs"]
  dem["Copernicus DEM GLO-30<br/>[External system]<br/>Terrain for catchment and strata"]
  worldcover["ESA WorldCover 2021<br/>[External system]<br/>Context strata"]
  mapsrc["Map asset sources<br/>[External system]<br/>Mapterhorn relief, Protomaps labels"]
  host["Hosting platform<br/>[External system]<br/>Railway, with Render as fallback"]

  manager -- "Commands, selections, reviews" --> siterra
  reviewer -- "Role-scoped review decisions" --> siterra
  observer -- "Reads the case and trace" --> siterra
  siterra -- "Task inputs, typed proposals back<br/>HTTPS, streamed" --> meta
  siterra -- "Retrieves sources at setup<br/>HTTPS" --> corpus
  siterra -- "Offline pipeline: STAC queries,<br/>COG window reads" --> earth
  siterra -- "Offline pipeline: COG range reads" --> chirps
  siterra -- "Offline pipeline: DEM tile" --> dem
  siterra -- "Offline pipeline: context mask" --> worldcover
  siterra -- "Offline build: regional extracts" --> mapsrc
  host -- "Runs web, worker and database" --> siterra

  classDef person fill:#08427b,stroke:#052e56,color:#ffffff
  classDef system fill:#1168bd,stroke:#0b4884,color:#ffffff
  classDef external fill:#6b6b6b,stroke:#4d4d4d,color:#ffffff
  class manager,reviewer,observer person
  class siterra system
  class meta,corpus,earth,chirps,dem,worldcover,mapsrc,host external
```

In P0 the Meta Model API is the only external system called while a case runs; P1 adds `fetch_source` for public URLs and search grounding through the model provider. Observation sources and map sources feed offline preprocessing and asset builds; the demo path makes no live catalog query or raster export ([data sources and reproducible methods](../reference/data-sources-and-methods.md#access-and-delivery)).

## Business context

| Partner | Sends to Siterra | Receives from Siterra |
|---|---|---|
| Program manager (primary user) | Commission, typed commands (for example "Could drought explain this instead?"), area and period selections, answers to targeted questions | The case: plan and progress, evidence with provenance, map and charts, hypothesis ledger, livelihood constraints, candidate responses, field-validation plan, decision brief |
| Reviewer roles | Role-specific decisions with conditions and comments on exact entity versions | Review requests stating the proposed work, evidence, uncertainty, effects, required authority and alternatives ([review and authority](../reference/review-and-authority.md#review-requests)) |
| Observer or demo viewer | Nothing | Read-only case, trace and mode labels |
| Meta Model API | Typed proposals as structured final outputs, read and deterministic tool calls, usage | Task inputs: case summaries, retrieved source passages and PDFs, tool results |
| Publishers and official sites | Source documents, retrieved at setup from their official URLs, hashed and stored outside Git | Nothing |
| Earth Search, CHIRPS, Copernicus DEM, ESA WorldCover | Imagery, rainfall, terrain and context data for the offline pipeline | Nothing |
| Map asset sources | Relief and label extracts for the self-hosted regional bundle | Nothing |

People with land, community or program authority are outside the system. Siterra prepares; they decide ([human review and authority](../reference/review-and-authority.md)).

## Technical context

| Interface | Technology | Notes |
|---|---|---|
| Browser to Siterra | HTTPS with JSON; server-sent events for the case event stream; same-origin secure HttpOnly session cookies | Routes and stream behavior in the [runtime view](06-runtime-view.md#api-and-stream) |
| Siterra to Meta Model API | HTTPS to `https://api.meta.ai/v1` through the `openai` Node SDK; Responses API; every call streamed; `store: false`; strict JSON Schema structured output | Platform facts in [architecture constraints](02-architecture-constraints.md#model-platform) |
| Siterra to corpus sources | HTTPS retrieval at setup; P1 adds `fetch_source` through a server proxy that blocks private networks, with size and time limits | [Agent orchestration](../reference/agent-orchestration.md#tools-and-permissions) |
| Pipeline to Earth Search | STAC catalog queries month by month; windowed reads of red, NIR and scene classification COGs | Legacy `sentinel-2-l2a` collection; [observation preprocessing](../reference/observation-preprocessing.md) |
| Pipeline to CHIRPS | HTTP range reads of global monthly COGs for the area window | URLs, checksums and retrieval dates frozen in the manifest |
| Pipeline to Copernicus DEM | One COG tile from the AWS `copernicus-dem-30m` 2021 release; ETag and size verified | Catchment delineation and strata from the same pinned release |
| Asset build to map sources | Mapterhorn `planet.pmtiles` extract to z12; Protomaps daily build extract to z15 | Served from the application origin; no runtime third-party tile server ([deployment view](07-deployment-view.md#map-and-observation-assets)) |

## Out of scope

No interface exists for email or messaging, payments, scheduling, publishing, land-management execution, shell, arbitrary code, SQL or unrestricted browsing ([agent orchestration](../reference/agent-orchestration.md#tools-and-permissions)). No external-action endpoint exists in the API.
