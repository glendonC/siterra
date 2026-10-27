# Research

The evidence behind Siterra's decisions: source registers that identify every cited source, research notes that interpret them, and the bibliographic records. A research note records what was inspected and what it supports; its recommendations bind only once a [decision record](../docs/decisions/README.md) accepts them.

## Registers and ID prefixes

Each source has one permanent ID, owned by one register. Other documents cite the ID and link the register; they never copy its rows. ID rules are in [CONTRIBUTING.md](../CONTRIBUTING.md#identifiers), and the full registry of prefixes is in [identifiers](../docs/reference/identifiers.md).

| Prefix | Sources | Owning register |
|---|---|---|
| SCI | Scientific and geospatial literature, datasets and official statistics | [science/source-register.md](science/source-register.md) |
| MKT | Competitive and market sources | [competitive/source-register.md](competitive/source-register.md) |
| STD | Standards and guidance (accessibility) | [competitive/source-register.md](competitive/source-register.md) |
| LANG | Language and local-use sources | [competitive/source-register.md](competitive/source-register.md) |
| TECH | Technology feasibility sources: platforms, hosting, libraries, map assets, observability | [technology/source-register.md](technology/source-register.md) |
| GW | Generative-workspace sources | [technology/generative-workspace.md](technology/generative-workspace.md) |
| VIS | Visual design references | [design/source-register.md](design/source-register.md) |
| WRT | Writing, plain-language and uncertainty-communication sources behind the voice guide | [design/writing.md](design/writing.md) |

Three notes also number their own sources: [technology/meta-models.md](technology/meta-models.md) (MM), [technology/map-scenes.md](technology/map-scenes.md) (MS) and [design/ui-patterns.md](design/ui-patterns.md) (UI, listed in a private manifest of captures).

## Research notes

| Note | Subject |
|---|---|
| [competitive/landscape.md](competitive/landscape.md) | Why a program manager would use Siterra rather than a general agent or an existing geospatial or restoration platform |
| [design/color-system.md](design/color-system.md) | Computed color system for light and dark themes |
| [design/ui-patterns.md](design/ui-patterns.md) | UI patterns for a cleaner workspace |
| [design/component-libraries.md](design/component-libraries.md) | Component libraries: licenses, primitives, accessibility and motion handling |
| [design/color-system.md](design/color-system.md) | The computed color system: scales, roles, contrast, data palettes and cartography for both themes |
| [design/writing.md](design/writing.md) | Sources for the voice and tone guide and the microcopy |
| [geospatial/study-area.md](geospatial/study-area.md) | The recommended analysis geometry and how it was derived |
| [geospatial/data-availability.md](geospatial/data-availability.md) | Catalog-level availability of imagery, rainfall and terrain for the study area |
| [science/analytics.md](science/analytics.md) | Data science, forecasting and analogue evidence |
| [technology/meta-models.md](technology/meta-models.md) | Meta model capabilities and the model map |
| [technology/map-assets.md](technology/map-assets.md) | The self-hosted regional map bundle |
| [technology/map-scenes.md](technology/map-scenes.md) | Reusable, AI-composed map views and tours |
| [technology/observability.md](technology/observability.md) | Trace and span naming |
| [technology/stack-versions.md](technology/stack-versions.md) | Stack versions and pins |

Raw downloads and unreviewed derivatives produced during research stay in the ignored `data/raw/` and `data/interim/` folders; registers and notes carry only public sources, links and paraphrase.

## Inspection methods

Every register row states how its source was inspected. The terms below are defined by the registers that use them; read any other phrasing in an inspection column literally.

| Term | Meaning | Used in |
|---|---|---|
| Full text | The full text was retrieved and the relevant sections were read | SCI |
| Abstract | Only the abstract was read, through the route named | SCI |
| Metadata only | The bibliographic record (Crossref or a repository API) was checked and no content was read; the row must not be cited for specific findings | SCI |
| Full page text read | The page's extracted text was read in full ("read" means extracted page text unless a row says otherwise) | MKT, STD, LANG |
| Full page text read in a browser | The rendered page text was read in full in a browser | MKT |
| Extracted (targeted) | The page was fetched and an automated extraction step answered targeted questions about it; not a full manual read | MKT |
| Verbatim confirmation | The load-bearing sentences were returned word for word and checked | MKT |
| Page text | Extracted text or the source Markdown of a page | VIS |
| Headless screenshot | A page captured in local headless Chrome at 1440 px width and the image viewed | VIS |
| Scripted session | Headless Chrome driven over the DevTools protocol to close a welcome dialog, scroll a story or click a demo item, then captured and viewed | VIS |
| Live view | Viewed in a desktop browser pane, not saved | VIS |
| Video frames | A public video fetched to a scratch folder, frames extracted with ffmpeg and viewed; the video itself is not kept | VIS |
| Post metadata | Read from the public X syndication endpoint | VIS |
| Documentation inspection | Vendor documentation read; establishes advertised capability, not successful integration, account eligibility, measured latency or guaranteed service behavior | TECH, MM |
| `npm view` | Version, publish date, license and peer dependencies from the public npm registry | TECH, component libraries |
| GitHub API, source files | License text, commits and repository metadata, and source files read at a named branch or tag | GW, MS, component libraries |
| Registry item download and static scan | Declared dependencies, primitive library, reduced-motion code, Escape handling and ARIA attributes, read statically without running anything | Component libraries |

Inspection is not replication, field validation or measured performance, and vendor statements establish advertised scope only. A source that could not be reached is recorded as an access failure, not bypassed. Third-party images are never embedded in public files; captures used during inspection stay in the ignored `design/private/` folder.

## Bibliography

Bibliographic records are CSL-JSON, validated against the CSL schema 1.0.2 (`csl-data.json`), with one file per register in `research/bibliography/`: `science.json`, `competitive.json`, `technology.json` and `design.json` ([ADR-0030](../docs/decisions/0030-keep-the-bibliography-in-csl-json.md)). Each record's `id` is the register ID (for example `SCI-02`), `accessed` holds the inspection date, and `custom` may carry the source's SPDX reuse terms. The Markdown register keeps the ID, a short label and the inspection note: what the source supports, its limits and its reuse terms.
