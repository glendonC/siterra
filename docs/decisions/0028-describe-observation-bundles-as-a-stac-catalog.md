---
status: accepted
date: 2026-10-26
decision-makers: maintainer
---

# Describe observation bundles as a STAC catalog

## Context and Problem Statement

Each observation bundle is a frozen set of per-period rasters and values with provenance, method, license and quality information, described at the time by a Siterra-specific manifest schema (since retired). The input catalogs (Earth Search, Planetary Computer) already publish SpatioTemporal Asset Catalog (STAC) metadata, and STAC with its extensions defines common fields for bands, statistics, time ranges, licenses, providers, checksums and processing lineage. How should bundles be described?

## Considered Options

* A STAC 1.1.0 static catalog with standard extensions and a `siterra:` extension for the remaining fields
* The Siterra-specific bundle manifest alone

## Decision Outcome

Chosen option: "A STAC 1.1.0 static catalog with standard extensions and a `siterra:` extension for the remaining fields", because standard fields and tools then cover most of the manifest, and only Siterra's own semantics need a vendor extension.

* One Collection per bundle (`data/bundles/<bundle-id>/collection.json`) and one Item per period (`<bundle-id>/<period-id>/<period-id>.json`), with assets beside each Item.
* The display raster is an asset with role `overview` (WebP or PNG); the value grid is an asset with role `data` (Cloud Optimized GeoTIFF) carrying `bands` with nodata, data type, unit and statistics.
* Extensions: raster 2.0.0, processing 1.3.0, file 2.1.0 (`file:checksum` as a SHA-256 multihash), projection 2.1.0, eo 2.0.0 and version 1.2.0, with render 2.1.0 optional.
* The license is a single SPDX identifier in the Collection `license`, or `other` with `license` links when an expression is needed, because the STAC 1.1.0 schema pattern rejects expressions with spaces ([ADR-0032](0032-declare-licensing-with-reuse-and-spdx.md)); inputs are linked with checksums; a superseded bundle is never edited (its checksum is pinned by `DataBundle.contentHash`): the successor links it with `predecessor-version`.
* Fields with no standard home (failed status, variable, geometry selection, method, period status and missing reason, area valid fraction, measurements, quality flags, attribution wording, limitations) use the `siterra:` prefix, defined in `schemas/stac/siterra-extension.schema.json`. STAC documents use snake_case, converted at import.

Sources: [STAC 1.1.0](https://github.com/radiantearth/stac-spec/tree/v1.1.0) and the [STAC extensions](https://github.com/stac-extensions).

### Consequences

* Good, because bundles validate against published schemas and open in STAC tools, and bundle maturity is expressed with the version extension instead of words such as "preview" or "final" in names.
* Good, because input provenance is a link to the source Items with checksums, not copied text.
* Bad, because STAC `end_datetime` is inclusive while Siterra periods are end-exclusive: `end_datetime` is set to the last second of the period, and `period_YYYY-MM` stays the authoritative key.
* Bad, because STAC `statistics.valid_percent` counts every raster value, including nodata outside the area, so it is not the area coverage; `siterra:area_valid_fraction`, or a data-mask asset with class counts, carries coverage.
* Bad, because several extensions are not yet stable (raster, processing and version are Candidate, file is Proposal), and the importer must map STAC into `DataBundle`, `Measurement` and `TemporalObservation` records.

### Confirmation

Every catalog, Collection and Item validates against the STAC 1.1.0 JSON Schemas, the schema of each extension listed in `stac_extensions`, and the Siterra extension schema. SV-01 in [acceptance criteria](../project/acceptance-criteria.md) still applies to every measurement.

## Pros and Cons of the Options

### The Siterra-specific bundle manifest alone

* Good, because it exists and maps one to one onto the importer.
* Bad, because every field is custom, STAC tools cannot read it, and its lifecycle fields (`status`, `supersedes`) duplicate what the STAC version extension standardizes.

## More Information

This refines [ADR-0013](0013-define-contracts-in-json-schema-mirrored-in-zod.md) for observation bundles; the case contracts are unchanged.

Corrected on 2026-10-27 while writing the extension: the license and supersession details were changed to pass STAC 1.1.0 validation and to keep frozen bundles unedited; the decision is unchanged. Profile: [observation preprocessing](../reference/observation-preprocessing.md#bundle-output); schema: [siterra-extension.schema.json](../../schemas/stac/siterra-extension.schema.json).
