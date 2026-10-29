# Schemas

Machine-readable contracts shared by the web application, the worker and the offline science pipeline. Semantics that a schema cannot express are specified in [data contracts](../docs/reference/data-contracts.md) and [observation preprocessing](../docs/reference/observation-preprocessing.md#bundle-output). Version history is in [CHANGELOG.md](../CHANGELOG.md).

## Contents

| File | Describes | Format | Identifier and version |
|---|---|---|---|
| [case.schema.json](case.schema.json) | Siterra case contracts: case snapshot, command, event and atomic commit proposal, with every record type in `$defs` | JSON Schema 2020-12 | `https://siterra.invalid/schemas/case/1.12.0/case.schema.json` |
| [stac/siterra-extension.schema.json](stac/siterra-extension.schema.json) | Observation bundles: the `siterra:` STAC extension and the bundle profile (one Collection per bundle, one Item per period) | JSON Schema draft-07, the dialect of the STAC 1.1.0 schemas and the stac-extensions template | `https://siterra.invalid/schemas/stac/siterra/1.1.0/schema.json` |
| [openapi.json](openapi.json) | HTTP API and Server-Sent Events stream | OpenAPI 3.2.0 | `info.version` 1.0.0 |
| [examples/](examples/) | Synthetic instances of the above | JSON | |

Bundle profile, extensions used:

| Extension | Schema URL | Where |
|---|---|---|
| STAC core 1.1.0 | `https://schemas.stacspec.org/v1.1.0/item-spec/json-schema/item.json`, `https://schemas.stacspec.org/v1.1.0/collection-spec/json-schema/collection.json` | Every Item and Collection |
| Siterra 1.1.0 (1.0.0 still accepted) | `https://siterra.invalid/schemas/stac/siterra/1.1.0/schema.json`, or `https://siterra.invalid/schemas/stac/siterra/1.0.0/schema.json` in documents written before 1.1.0 | Every Item and Collection |
| raster 2.0.0 | `https://stac-extensions.github.io/raster/v2.0.0/schema.json` | Every Item (`raster:spatial_resolution`); Collections that summarize raster fields |
| processing 1.3.0 | `https://stac-extensions.github.io/processing/v1.3.0/schema.json` | Every Collection (processor provider, `processing-software` link) |
| file 2.1.0 | `https://stac-extensions.github.io/file/v2.1.0/schema.json` | Every Collection; every Item with assets or checksummed links |
| projection 2.1.0 | `https://stac-extensions.github.io/projection/v2.1.0/schema.json` | Items with raster assets |
| eo 2.0.0 | `https://stac-extensions.github.io/eo/v2.0.0/schema.json` | Optical Items that report `eo:cloud_cover` or `eo:snow_cover` |
| render 2.1.0 | `https://stac-extensions.github.io/render/v2.1.0/schema.json` | Collections that publish value grids |
| version 1.2.0 | `https://stac-extensions.github.io/version/v1.2.0/schema.json` | Collections that replace an earlier bundle (`predecessor-version` link) or set `experimental` |

## Identifiers and versions

- `$id` is `https://siterra.invalid/schemas/<name>/<version>/<name>.schema.json`; the STAC extension keeps the STAC form `https://siterra.invalid/schemas/stac/<prefix>/<version>/schema.json`. The version lives in the `$id` path, in instance fields (`schemaVersion` in case records; the extension URL in a STAC object's `stac_extensions`) and in CHANGELOG.md, never in a file name or a `title`.
- `.invalid` is a reserved top-level domain that never resolves (RFC 2606), so a validator must map each `$id` to the local file. The extension file holds the newest version; a validator maps every earlier identifier of the same MAJOR to it, because a MINOR version only adds optional fields. When a real host exists, the identifiers move to it in a MAJOR release.
- `openapi.json` has no `$self`, so its relative references (`case.schema.json#/$defs/...`, `examples/...`) resolve from its file location.

## Versioning

[Semantic Versioning 2.0.0](https://semver.org/), applied per schema:

- **MAJOR** for any incompatible change: an instance valid under the previous version becomes invalid or changes meaning (a field removed, renamed or newly required, a type, enum or pattern narrowed, a meaning changed), or an identifier moves.
- **MINOR** for compatible additions: a new optional field, a new record type, a new enum value. Producers and consumers in this repository update together; consumers outside it must tolerate the additions.
- **PATCH** for descriptions, comments and examples that change no validation result.

Instances name the exact version they were written against. A MINOR or PATCH release of the case contracts must keep accepting the earlier `schemaVersion` strings of the same MAJOR, or it is incompatible and therefore MAJOR. STAC objects name the extension version in the URL listed in `stac_extensions`, so every published version of the extension schema stays available at its identifier.

## Examples

Names follow `record-type-scenario.json` in lowercase with hyphens: the record type first, so files group by type (`command-commission.json`, `event-case-committed.json`, `commit-challenge.json`). STAC examples use the STAC object type with a `stac-` prefix (`stac-collection-ndvi.json`, `stac-item-ndvi-2022-04.json`).

Every example is synthetic and says so: identifiers use the `example` slug (STAC Item IDs are period keys by profile, so the slug is in their Collection ID), and descriptions state that values are invented. A QA check fails the demo build if an `example` ID or synthetic value reaches the demo database. Relative links inside the STAC examples follow the bundle layout and do not resolve inside this folder, and their scene links name synthetic Items.

## Validation

| Instance | Validated against |
|---|---|
| `examples/case-*`, `command-*`, `commit-*`, `event-*` | `case.schema.json` (root `oneOf`), and the Zod mirrors in `packages/contracts` once they exist |
| `examples/stac-collection-*`, `stac-item-*` | STAC 1.1.0 core, every schema URL listed in the document's `stac_extensions`, and the Siterra extension mapped to its local file |
| `openapi.json` | The OpenAPI 3.2 schema `https://spec.openapis.org/oas/3.2/schema/2025-09-17`; every `$ref` must resolve; examples named in `externalValue` must validate against their response schemas |
| Server-Sent Event `data` | The `Event` definition, checked by the contract test, because OpenAPI tools do not validate `contentSchema` by default |

Use a validator that supports the declared dialect: draft-07 for the STAC documents and the Siterra extension, 2020-12 for the case contracts and the OpenAPI component schemas. Validate date and date-time formats as assertions; several rules (inclusive STAC period bounds, UTC timestamps) depend on them.
