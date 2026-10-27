---
status: accepted
date: 2026-10-26
decision-makers: maintainer
---

# Use the Aït Bouguemez valley catchment as study area

## Context and Problem Statement

Every observation needs one analysis geometry, fixed before any vegetation data is inspected so that the area cannot be tuned to a trend. No official open boundary exists for the Tabant commune, and no agdal or pasture boundaries exist as reusable digital data ([study area](../../research/geospatial/study-area.md)). Which geometry should define the analysis extent?

## Considered Options

* A catchment derived from Copernicus DEM GLO-30 upstream of a stated outlet
* An official commune boundary
* The GADM 4.1 commune polygon
* The OpenStreetMap commune polygon (Tabant, relation 2887314)
* HydroBASINS level 12 basins
* A landscape sample around the Ait Ouchi locator

## Decision Outcome

Chosen option: "A catchment derived from Copernicus DEM GLO-30 upstream of a stated outlet", because it matches the published description of the valley (about 40 km east to west, floor 1800 to 2200 m; SCI-19), follows ridgelines rather than straight administrative lines, keeps vegetation, snowmelt and rainfall context within one drainage, and uses openly licensed inputs.

The analysis extent is all land draining to the Assif n'Aït Bouguemez just upstream of its confluence with the Oued Lakhdar, about 417.5 km² in the preview computed from the DEM's 55 m overview. It carries `boundaryRole: hydrological_unit` and the label "Valley catchment (hydrological analysis extent), not a pasture, agdal or management boundary". The OpenStreetMap commune polygon is shown as `regional_context` and carries official statistics such as the 2024 census figures, which never attach to the catchment. Freeze procedure: [Data sources and reproducible methods](../reference/data-sources-and-methods.md#study-area).

### Consequences

* Good, because the outlet is fixed before any NDVI is inspected, and the freeze procedure forbids moving it afterwards.
* Good, because one DEM release serves both the delineation and the sampling strata ([ADR-0022](0022-use-sentinel-2-chirps-copernicus-dem-and-worldcover.md)).
* Bad, because a hydrological unit is not a management unit: pasture area, stocking density, household exposure and inside-or-outside-agdal comparisons are never computed for it.
* Bad, because the preview came from a probe script on a 55 m overview, not validated hydrology software; the science lane must recompute it at 30 m and freeze it.
* Bad, because boundary datasets disagree at this scale (the southern lobe lies outside the geoBoundaries Azilal province polygon). Fallbacks, in order: the frozen preview polygon labeled as a preview boundary; the OpenStreetMap commune polygon labeled as an administrative extent that spans two drainages; a labeled landscape sample around the Ait Ouchi locator.

### Confirmation

The freeze acceptance checks: area within ±5% of 417.5 km², contains Tabant and the Ait Ouchi locator, excludes the upper Assif M'Goun valley, with vertex count and SHA-256 recorded. GATE-02 in the [delivery plan](../project/delivery-plan.md#gates) then requires a validated bundle (SV-01) for the frozen geometry.

## Pros and Cons of the Options

### An official commune boundary

* Bad, because OCHA HDX and geoBoundaries stop at province level; no open official commune polygon was found.

### The GADM 4.1 commune polygon

* Bad, because its license is non-commercial and forbids redistribution without permission.

### The OpenStreetMap commune polygon (Tabant, relation 2887314)

* Good, because it is the best administrative option and links to official census statistics by code.
* Bad, because it is coarse and unofficial, and it spans the Bouguemez drainage and the upper Assif M'Goun valley, which drains to the other side.

### HydroBASINS level 12 basins

* Bad, because basins average about 130.6 km², too coarse for a valley of about 400 km².

### A landscape sample around the Ait Ouchi locator

* Bad, because it is arbitrary and the locator sits in a side branch; it is the last-resort fallback.
