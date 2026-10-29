# Contributing

How material is placed, named, documented, and committed in this repository. Working standards for contributors and coding agents are in [AGENTS.md](AGENTS.md); the documentation index and the ID registry are in [docs/README.md](docs/README.md).

## Public and private placement

Publish what a contributor or reviewer needs to build, run, and verify Siterra honestly, including its scientific and operational limits; keep personal, account-specific, and unredistributable third-party material local.

### Placement

| Path | Visibility | Why |
|---|---|---|
| `README.md`, `AGENTS.md`, `CONTRIBUTING.md`, `CHANGELOG.md`, `.editorconfig` | Public | Architecture overview, working standards, contribution rules, and version history |
| `docs/` | Public | Technical architecture, normative reference specifications, and scientific basis |
| `schemas/` (contracts, examples) | Public | JSON Schema 2020-12, STAC 1.1.0, and OpenAPI 3.2 contracts; examples use fictional `example` IDs and labeled synthetic values |
| `research/` (registers, notes, bibliography) | Public | Primary source registers (`SCI-*`, `TECH-*`, `VIS-*`), statistical analytics notes, and CSL-JSON bibliographies |
| `design/tokens/`, `design/hero/` | Public | Generated DTCG design tokens and camera keyframe data |
| `data/case/`, `data/bundles/`, `data/map/` | Public | Case seed, checksummed STAC observation bundles, and self-hosted regional map assets |
| `data/raw/`, `data/interim/` | **Private** (ignored) | Raw downloaded rasters and intermediate files outside Git |
| `.internal/`, `.local/`, `.lead/` | **Private** (ignored) | Local scratch scripts, private planning notes, and local database clusters |
| `.env*` (except `.env.example`), keys | **Never in files** | Use a secret store; never commit or log credentials |

### Ownership and licensing

External datasets, fonts, libraries, and referenced works keep their own terms, recorded separately from project licensing; required attribution strings are in [data sources and reproducible methods](docs/reference/data-sources-and-methods.md#attribution-strings).

## Naming

Names describe content, never temporary status:

1. Lowercase ASCII letters, digits, and hyphens with a lowercase extension. Standard fixed names (`README.md`, `AGENTS.md`, `CONTRIBUTING.md`, `CHANGELOG.md`, `collection.json`, `catalog.json`) and imported Python modules (`snake_case.py`) keep their required form.
2. Numeric prefixes are used only where a standard defines the number (arc42 sections `01-` to `12-`).
3. Double extensions are used only for recognized conventions: `.schema.json`, `.tokens.json`, `.openapi.json`, and REUSE `.license` sidecars.

### Identifiers

- Syntax `PREFIX-NN`: an uppercase ASCII prefix of 2 to 4 characters, a hyphen, and a zero-padded number (`SCI-01`, `CMP-08`, `DF-07`, `PRES-01`).
- IDs are allocated sequentially, never reused, and never renumbered.
- Data entity IDs in contracts keep their `type_slug` pattern (`case_`, `geo_`, `bundle_`, `period_YYYY-MM`).
- The [ID registry](docs/reference/identifiers.md) lists each prefix and its owning specification.

## Documentation and Changelog

- `docs/architecture/` follows arc42 9.1 (`01-` to `12-`).
- `docs/reference/` holds normative contracts, recipes, and component catalogs.
- `docs/explanation/` holds the scientific basis, problem statement, and scope boundaries.
- Contracts, design tokens, and releases follow Semantic Versioning 2.0.0, recorded in [CHANGELOG.md](CHANGELOG.md).

## Commit messages

Commit messages follow Conventional Commits 1.0.0 on a single line (`type(scope): description`) in the imperative mood, without trailers.
