---
status: accepted
date: 2026-10-26
decision-makers: maintainer
---

# Use Sentinel-2, CHIRPS, Copernicus DEM and WorldCover

## Context and Problem Statement

The case compares monthly vegetation and rainfall from 2019 to 2025 over the valley catchment, stratifies field sampling by elevation and aspect, and masks cropland. Each dataset needs a verified access route, complete coverage of the area and period, a version that can be pinned, and license terms that allow the use. A catalog probe checked availability for the catchment ([data availability](../../research/geospatial/data-availability.md)). Which datasets and routes should the pipeline use?

## Considered Options

* Sentinel-2 L2A from Earth Search's legacy collection, CHIRPS v3.0 monthly final, Copernicus DEM GLO-30 (2021 release) and ESA WorldCover 2021
* Earth Search Collection 1 (`sentinel-2-c1-l2a`) for optical data
* Earth Engine `COPERNICUS/S2_SR_HARMONIZED` with Cloud Score+
* Planetary Computer `sentinel-2-l2a`
* CHIRPS v2 for rainfall
* SRTMGL1 v3 for terrain strata

## Decision Outcome

Chosen option: "Sentinel-2 L2A from Earth Search's legacy collection, CHIRPS v3.0 monthly final, Copernicus DEM GLO-30 (2021 release) and ESA WorldCover 2021", because the probe verified versions, licenses and availability, and the legacy collection has public COGs for every month of 2019 to 2025 over the catchment.

* Optical: Earth Search `sentinel-2-l2a`, 3,765 items covering every month; deduplicated to the newest processing baseline per tile and date, and harmonized for the baseline 04.00 radiometric offset.
* Rainfall: CHIRPS v3.0 monthly final, read from the global COGs by HTTP range on the native 0.05° grid, with provenance keyed on the full URL path because preliminary files share file names.
* Terrain: Copernicus DEM GLO-30, one pinned release (2021, AWS) for both the catchment and the elevation and aspect strata.
* Context: ESA WorldCover 2021 v200 as a labeled cropland and built-up mask, never a statement about pasture or rights.

Inventory, routes and attribution strings: [Data sources and reproducible methods](../reference/data-sources-and-methods.md#dataset-inventory).

### Consequences

* Good, because window reads of public COGs cover the catchment without whole-tile downloads or an account.
* Bad, because the legacy collection holds reprocessed duplicates (1,091 tile and date groups) and mixed processing baselines, and the meaning of `earthsearch:boa_offset_applied` must be confirmed before use.
* Bad, because cloud and snow QA on this route is scene classification only, so derived products carry the label "reduced QA (scene classification only)".
* Bad, because CHIRPS cells are about 5 km across (31 touch the catchment, 3 lie fully inside), so rainfall is regional context, never pasture-scale weather; its license wording mixes public domain and CC BY 4.0, so it is attributed in full.
* Bad, because GLO-30 is a surface model that includes vegetation and buildings, and WorldCover is a static 2021 map.
* Neutral, because fallbacks exist: the Earth Engine harmonized route if an eligible project exists, a shorter period or seasonal composites, and SRTMGL1 v3 for strata, recorded if used.

### Confirmation

SV-01 (reproducible measurement), SV-04 (gaps stay gaps) and SV-05 (rainfall scale honesty) in [acceptance criteria](../project/acceptance-criteria.md); GATE-02 in the [delivery plan](../project/delivery-plan.md#gates).

## Pros and Cons of the Options

### Earth Search Collection 1 (`sentinel-2-c1-l2a`) for optical data

* Bad, because it has no items for this area from February to November 2022, a nationally reported drought year.

### Earth Engine `COPERNICUS/S2_SR_HARMONIZED` with Cloud Score+

* Good, because offsets are already harmonized and Cloud Score+ adds per-pixel visibility scores.
* Bad, because it needs an eligible noncommercial or paid commercial project, which is a founder decision, and its coverage of this area was not verified.

### Planetary Computer `sentinel-2-l2a`

* Good, because every month is present for the area.
* Bad, because asset access needs URL signing, offsets must come from product metadata, and the route was not tested.

### CHIRPS v2 for rainfall

* Bad, because its production ends after December 2026, and v2 and v3 must never be spliced.

### SRTMGL1 v3 for terrain strata

* Neutral, because it is the recorded fallback if the pinned GLO-30 release cannot be used for strata.
