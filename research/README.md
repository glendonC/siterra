# Research

Primary source registers, geospatial and statistical research notes, and CSL-JSON bibliographic records.

## Registers and ID Prefixes

Each source has one permanent ID owned by its register. ID rules are in [CONTRIBUTING.md](../CONTRIBUTING.md#identifiers), and the full registry of prefixes is in [identifiers](../docs/reference/identifiers.md).

| Prefix | Sources | Owning register |
|---|---|---|
| SCI | Scientific and geospatial literature, datasets and official statistics | [science/source-register.md](science/source-register.md) |
| TECH | Technology feasibility sources: platforms, hosting, libraries, map assets, observability | [technology/source-register.md](technology/source-register.md) |
| GW | Generative-workspace sources | [technology/generative-workspace.md](technology/generative-workspace.md) |
| VIS | Visual design references | [design/source-register.md](design/source-register.md) |
| WRT | Writing, plain-language and uncertainty-communication sources behind the voice guide | [design/writing.md](design/writing.md) |

Two notes also number their own sources: [technology/meta-models.md](technology/meta-models.md) (MM) and [technology/map-scenes.md](technology/map-scenes.md) (MS).

## Research Notes

| Note | Subject |
|---|---|
| [geospatial/study-area.md](geospatial/study-area.md) | Frozen catchment delineation at native 30 m from Copernicus DEM GLO-30 and outlet verification |
| [geospatial/data-availability.md](geospatial/data-availability.md) | Archive availability of Sentinel-2 L2A, MODIS MOD13Q1/MOD10A1, Landsat C2 L2, CHIRPS v3.0, and DEM |
| [science/analytics.md](science/analytics.md) | Statistical recipes, 25-year MODIS trend methods, Benjamini-Hochberg FDR control, field-check pairs, and `merge@2` |
| [technology/meta-models.md](technology/meta-models.md) | Meta Model API capabilities, strict structured outputs, and model verification jobs |
| [technology/map-assets.md](technology/map-assets.md) | Self-hosted regional map bundle and terrain tile pipeline |
| [technology/map-scenes.md](technology/map-scenes.md) | Reusable camera and layer scene templates |
| [technology/observability.md](technology/observability.md) | OpenTelemetry GenAI trace and span conventions |
| [technology/stack-versions.md](technology/stack-versions.md) | Pinned runtime and library versions |
| [design/color-system.md](design/color-system.md) | Computed OKLCH color system, contrast targets, data palettes, and cartography |
| [design/ui-patterns.md](design/ui-patterns.md) | Spatial workspace and floating-island interface patterns |
| [design/component-libraries.md](design/component-libraries.md) | Component primitives, licenses, and accessibility |
| [design/writing.md](design/writing.md) | Sources for plain-language scientific and uncertainty communication |

## Bibliography

Bibliographic records are stored in CSL-JSON (`research/bibliography/science.json`, `technology.json`, and `design.json`), validated against the CSL schema 1.0.2 (`csl-data.json`). Each record's `id` matches its register ID (for example `SCI-02`).
