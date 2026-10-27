---
status: accepted
date: 2026-10-26
decision-makers: maintainer
---

# Declare licensing with REUSE and SPDX

## Context and Problem Statement

The repository mixes Siterra's own work with material under other terms: geometry derived from Copernicus DEM, OpenStreetMap derivatives (ODbL), CC BY 4.0 data, self-hosted fonts (SIL OFL 1.1), the MADR template (MIT OR CC0-1.0), and screenshots that may show third-party map tiles. No project license has been chosen yet; the maintainer decides before publication. How should licensing be declared, file by file, in a way tools can check?

## Considered Options

* REUSE 3.3: license texts in `LICENSES/`, `REUSE.toml` annotations, SPDX identifiers, and `LicenseRef-` identifiers for licenses outside the SPDX list
* Attribution in documentation only, with no machine-readable license metadata
* REUSE with a `.reuse/dep5` file instead of `REUSE.toml`

## Decision Outcome

Chosen option: "REUSE 3.3: license texts in `LICENSES/`, `REUSE.toml` annotations, SPDX identifiers, and `LicenseRef-` identifiers for licenses outside the SPDX list", because every file then carries a license statement that a linter can check, and the same SPDX identifiers serve STAC (`license`) and CSL (`custom`) records.

* Once the maintainer chooses a project license: `LICENSE` plus `LICENSES/<SPDX-ID>.txt`. Until then no project license is asserted.
* Third-party material is annotated in `REUSE.toml` (`version = 1`, `[[annotations]]` with `path`, `precedence`, `SPDX-FileCopyrightText` and `SPDX-License-Identifier`).
* Identifiers: Copernicus DEM derivatives `LicenseRef-Copernicus-DEM`, with the verbatim license in `LICENSES/` (the SPDX License List 3.29.0 has no Copernicus license); OpenStreetMap derivatives `ODbL-1.0`; ESA WorldCover `CC-BY-4.0`; CHIRPS `CC-BY-4.0` until its mixed wording is confirmed; IBM Plex `OFL-1.1`; the MADR template `MIT OR CC0-1.0`. Each prototype screenshot is checked for third-party relief tiles or labels before it gets an identifier.
* Source-specific licenses and attribution stay separate from the project license.

Specifications: [REUSE 3.3](https://reuse.software/spec-3.3/) and the [SPDX License List](https://spdx.org/licenses/).

### Consequences

* Good, because licensing becomes checkable with `reuse lint` instead of by reading prose.
* Good, because data licenses flow into STAC Collections as SPDX identifiers, or as `other` with license links where an expression is needed ([ADR-0028](0028-describe-observation-bundles-as-a-stac-catalog.md)), and into bibliography records ([ADR-0030](0030-keep-the-bibliography-in-csl-json.md)).
* Bad, because the Copernicus terms need a custom `LicenseRef-` identifier, and the CHIRPS identifier is provisional until its license wording is confirmed.
* Bad, because every image must be checked for embedded third-party content before it can be annotated.

### Confirmation

`reuse lint` passes before any publication, as part of the [publication gate](../../CONTRIBUTING.md#publication-gate); the license decision itself is GATE-05 in the [delivery plan](../project/delivery-plan.md#gates).

## Pros and Cons of the Options

### Attribution in documentation only, with no machine-readable license metadata

* Good, because it needs no tooling.
* Bad, because files such as the derived catchment geometry carry no license information of their own, and nothing can check completeness.

### REUSE with a `.reuse/dep5` file instead of `REUSE.toml`

* Bad, because DEP5 is deprecated since REUSE 3.2 (supported until at least 2029), and it cannot be combined with `REUSE.toml`.
