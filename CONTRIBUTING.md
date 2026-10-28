# Contributing

How material is placed, named, documented and committed in this repository, and the review to run before anything is committed or pushed. Working standards for coding agents are in [AGENTS.md](AGENTS.md); the documentation index and the ID registry are in [docs/README.md](docs/README.md).

## Public and private placement

**Decision** ([ADR-0025](docs/decisions/0025-publish-by-default-and-keep-private-by-exception.md)): publish what a contributor or reviewer needs to build, run and judge Siterra honestly, including its limits; keep personal, account-specific, tactical and third-party material local. "Public-ready" means suitable for version control.

A document is public because its contents are safe and useful, not because it is polished. A limitation is never private just because it weakens a demo: scientific limits, blocked states and unverified access stay in public documents.

### Placement

| Path | Visibility | Why |
|---|---|---|
| `README.md`, `AGENTS.md`, `CONTRIBUTING.md`, `CHANGELOG.md`, `.editorconfig` | Public | Product status, working standards, contribution rules and version history for any contributor or coding agent |
| `docs/` | Public | Complete implementation requirements must not depend on private files |
| `schemas/` (contracts, examples) | Public | Contracts; examples use fictional `example` IDs and labeled synthetic values |
| `research/` (registers, notes, bibliography) | Public | Makes claims auditable; public sources, links and paraphrase only |
| `research/design/source-register.md` | Public | Link-only reference manifest with inspection notes; no third-party images |
| `design/tokens/` | Public | Original work: the generated design tokens |
| `design/hero/` | Public | Original work: the approved hero's data for the build, such as the dive camera path |
| `design/prototype/`, `design/component-gallery/`, `design/wireframes/`, `design/motion/` | **Private** (ignored) | The first concept prototype, its component gallery, wireframes and motion storyboard, replaced by the approved hero and not published |
| `design/private/` | **Private** (ignored) | Third-party screenshots, video frames and the reference board that displays them: inspected for design, not licensed for redistribution |
| `data/raw/`, `data/interim/` | **Private** (ignored) | Downloaded datasets and candidate geometries before rights and quality review |
| `.internal/`, `.local/`, `.lead/` | **Private** (ignored) | Private planning, identities, account diagnostics, raw notes and recordings: the original directive with founder context, account and event gates, product-challenge tactics, demo narration and judging notes, handoff and verification logs, and the coordination state of parallel lanes |
| `.env*` (except `.env.example`), keys | **Never in files** | Use a secret store; a private folder is not a secret store |

### Placement rules for new material

| Material | Location |
|---|---|
| Purpose, workflow, status, scientific limits, architecture, schemas, methods, acceptance criteria, tokens | Public `docs/`, `schemas/`, `design/` |
| Competitive capabilities from public sources | Public, factual, no disparagement or market claims |
| Build sequencing and reproducible demo behavior | Public ([delivery plan](docs/project/delivery-plan.md), [demo plan](docs/project/demo-plan.md)) |
| Submission pitch, judging tactics, rehearsal notes | `.internal/` |
| Original directive, founder anecdote, trip locations, contact identities | `.internal/` |
| Account status, credits, costs tied to accounts, provider correspondence | `.internal/` |
| Third-party captures (screenshots, frames, videos) | `design/private/` |
| Large rasters, raw downloads, unreviewed derivatives | `data/raw/`, `data/interim/`; publish manifests and checksums instead |
| Case seed, validated bundles, regional map assets | `data/case/`, `data/bundles/`, `data/map/`; bundles are committed only if license-cleared and small (target under 50 MB in total), otherwise served from object storage with the same manifest hashes |
| Stakeholder or household records, consent, identifiable field data | Access-controlled storage later; never the repository |
| Credentials, cookies, real prompts with sensitive data, unredacted traces | Secret store or nowhere; redacted examples may be public |

### Exclusions in `.gitignore`

[`.gitignore`](.gitignore) excludes `/.internal/`, `/.local/`, `/.lead/`, `/data/raw/`, `/data/interim/`, `/design/private/`, `.env` and `.env.*` except `.env.example`, key files (`*.pem`, `*.key`) and local execution products. It deliberately does not exclude `docs/`, research registers, JSON or PDFs in general.

Gitignore only affects untracked files. It does not remove history, encrypt, prevent `git add -f`, protect a shared disk or back anything up. Never force-add an ignored path. Private notes needed by a new machine or another person must be transferred deliberately; public specifications never depend on that transfer.

### Ownership and licensing

The maintainer chooses the project license and approves any publication or change of repository visibility (GATE-05 in the [delivery plan](docs/project/delivery-plan.md#gates)). No project license is asserted until the maintainer chooses one; then the license goes in `LICENSE` and `LICENSES/<SPDX-ID>.txt`. Licensing is declared with REUSE 3.3 and SPDX identifiers ([ADR-0032](docs/decisions/0032-declare-licensing-with-reuse-and-spdx.md)): third-party material is annotated in `REUSE.toml`, and licenses outside the SPDX list use `LicenseRef-` identifiers. External datasets, fonts, libraries and referenced works keep their own terms, recorded separately from project licensing; required attribution strings are in [data sources and reproducible methods](docs/reference/data-sources-and-methods.md#attribution-strings).

## Naming

Names follow [ADR-0027](docs/decisions/0027-name-files-and-identifiers-without-temporal-words.md): they describe content, never its state.

### Files and directories

1. Lowercase ASCII letters, digits and hyphens, with a lowercase extension. No spaces, underscores, accents, uppercase letters or other punctuation.
2. Standard fixed names keep their defined case, for example `README.md`, `AGENTS.md`, `CONTRIBUTING.md`, `CHANGELOG.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, `LICENSE`, `CODEOWNERS`, `CITATION.cff`, `REUSE.toml`, `.editorconfig`, `pnpm-workspace.yaml`, and STAC `catalog.json` and `collection.json`. Exception to rule 1: Python modules that other modules import use snake_case names, because an import name must be a Python identifier (Python language reference; PEP 8 for the style), and Python's fixed names such as `__init__.py`, `__main__.py` and `conftest.py` keep their form; scripts that are only run, never imported, stay hyphenated.
3. Numeric prefixes only where a standard defines the number: arc42 sections (`01-` to `12-`) and decision records (`NNNN-`). Reading order lives in `README.md` files.
4. Never in a path: dates, versions (`v1`, `1.2`, `v0.x`), lifecycle or status words (draft, final, preview, probe, status, handoff, wip, old, new, latest, copy), author names, or session and event words. Exception: data identifiers that name the time the data covers (`period_2022-04`), which describe content, not document state.
5. Explanation and reference files are noun phrases naming the subject (`data-contracts.md`); how-to files start with an imperative verb (`run-the-publication-gate.md`); decision records state the decision (`0018-self-host-the-regional-map-bundle.md`).
6. Double extensions only for recognized conventions: `.schema.json`, `.tokens.json`, `.openapi.json` and REUSE `.license` sidecars.
7. Directories use plural nouns for collections (`decisions`, `schemas`, `screenshots`, `frames`) and are named for their purpose, never for a file format (`png/`) or as a grab-bag (`assets/`).
8. Screenshots are named `subject[-variant]-WIDTHxHEIGHT.png`, ID-bound frames `prefix-nn-slug.png`, schema examples `record-type-scenario.json`.

### Identifiers

- Syntax `PREFIX-NN`: an uppercase ASCII prefix of 2 to 4 characters, a hyphen and a zero-padded number, continuing to three digits past 99. Decision records use `ADR-NNNN`.
- IDs are allocated sequentially, never reused and never renumbered. Rows may be reordered; a withdrawn ID keeps its row, marked `withdrawn` (decision records use their own statuses).
- Each prefix has one owning file. Other files link to the owner and never copy its rows.
- Put the ID first in its heading or first table cell (`## CMP-08 Temporal comparison`) so anchors are predictable.
- Data entity IDs in contracts keep their `type_slug` pattern (`case_`, `geo_`, `bundle_`, `period_YYYY-MM`); they are data, not document IDs.

Registered prefixes: ADR (decision records), GATE (delivery gates), RISK (risks), PC, IU, AF, SV, VC, MQ, PF, SC, AN, EV, I18N, RL, TR, SA, DQ, DF and A11Y (acceptance criteria), PRES (presentation rules), CMP (components), MOT (motions), VT (copy lint rules), SCI, MKT, STD, LANG, TECH, GW, VIS, MM, MS, WRT and UI (research sources, see [research/README.md](research/README.md)), and P0 to P2 (priorities). The [ID registry](docs/reference/identifiers.md) names the owning file of each prefix; register a new prefix there before using it. Lanes are named (platform, agent runtime, science and map data, workspace UI, quality), not numbered.

## Documentation

Documentation is organized by [ADR-0026](docs/decisions/0026-organize-documentation-with-diataxis-arc42-and-madr.md). Every documentation directory has a `README.md` that gives its reading order.

| Topic | Rule |
|---|---|
| Types | Documentation follows the Diataxis types: `docs/explanation/` for why, `docs/reference/` for normative contracts and catalogs, `docs/how-to/` for goal-oriented procedures. Add `docs/tutorials/` only when a tutorial exists. Delivery documents (plan, acceptance criteria, demo plan, risk register) live in `docs/project/`. |
| Architecture | `docs/architecture/` follows arc42 9.1 with one file per section, `01-` to `12-`, without template help text. Long normative specifications stay in `docs/reference/`, and arc42 section 8 summarizes and links them. C4 System Context and Container diagrams are Mermaid `flowchart` diagrams with C4 element labels, not Mermaid's experimental C4 syntax. |
| Decisions | Decision records follow MADR 4.0.0 in `docs/decisions/`: copy [`adr-template.md`](docs/decisions/adr-template.md) to `NNNN-title-with-dashes.md`, cite it as `ADR-NNNN` and add it to the [decision log](docs/decisions/README.md). Front matter holds `status`, `date`, `decision-makers` and optionally `consulted` and `informed`. A decision changes only through a new record; set the old record's status to `superseded by ADR-NNNN` and never rewrite an accepted decision. |
| Front matter | None, except in decision records. Every file starts with an H1 that matches its subject and a one to three sentence scope statement. No `Status:` line, date, version or author field: Git records them. |
| Wording | Sentence case for titles and headings. Timeless wording: no "currently", "now", "new", "latest" or "soon" in explanation and reference text. Claims carry the [evidence labels](docs/README.md#evidence-labels) [V], [D], [H] and [U] where the distinction matters; conceptual designs, simulated runs and illustrative values are labeled as such. |
| Links | Relative links only. Link text is the target's title, never a document number. |
| Versions and history | Versions never appear in file names or titles; contract and token versions live in `$id` or instance fields, [CHANGELOG.md](CHANGELOG.md) and Git tags. Git records document history: delete a dead document rather than keeping an old or `v2` copy. |

## Versions and changelog

Contracts, design tokens and releases follow Semantic Versioning 2.0.0; any incompatible contract change is a MAJOR version. Record every notable change under Unreleased in [CHANGELOG.md](CHANGELOG.md), which follows Keep a Changelog 1.1.0.

## Commit messages

Commit messages follow Conventional Commits 1.0.0 and fit on one line: `type(scope): description`, with the description in the imperative mood.

- `feat` and `fix` are the types the specification defines. Other types are allowed; the specification mentions `build`, `chore`, `ci`, `docs`, `style`, `refactor`, `perf` and `test`, as recommended by `@commitlint/config-conventional`.
- The scope is optional: a noun naming the area changed, such as `schemas`, `docs` or `worker`.
- Mark a breaking change with `!` immediately before the colon, for example `feat(schemas)!: ...` for an incompatible contract change, so no footer is needed.

## Publication gate

Run the six-step review in [run the publication gate](docs/how-to/run-the-publication-gate.md) before the first commit and before any push: review staged paths and contents; confirm no private details or credentials; check scientific statements against their cited scope; confirm redistribution rights and attribution; confirm labels and the license decision; inspect history once commits exist. A secret scan supplements this review; it does not replace it.
