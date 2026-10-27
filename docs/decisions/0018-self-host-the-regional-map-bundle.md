---
status: accepted
date: 2026-10-26
decision-makers: maintainer
---

# Self-host the regional map bundle

## Context and Problem Statement

The workspace shows a relief map of the valley with labels and Siterra's own observation rasters. Third-party tile services can fail during a demonstration, many forbid caching, export or commercial use, and a map SDK license grants no basemap, imagery, elevation, glyph or tile-hosting rights (TECH-16). Where should map assets come from at demonstration time?

## Considered Options

* A self-hosted regional bundle of Mapterhorn relief, Protomaps labels and Siterra rasters, served from Siterra's origin
* Runtime third-party tile services (MapTiler Cloud, the OpenFreeMap public instance)
* Third-party imagery basemaps (EOxCloudless, Esri World Imagery)

## Decision Outcome

Chosen option: "A self-hosted regional bundle of Mapterhorn relief, Protomaps labels and Siterra rasters, served from Siterra's origin", because the chosen sources permit a regional self-hosted copy, and no request goes to a third-party tile server at demonstration time.

Relief comes from a Mapterhorn `planet.pmtiles` extract derived from Copernicus GLO-30; labels, water and roads from a Protomaps extract of OpenStreetMap (ODbL); observation rasters from Siterra bundles. Every source carries its attribution in the map corner, in exports and in the video description. Recipe, licenses and attribution strings: [map assets](../../research/technology/map-assets.md); extents and serving: [Deployment view](../architecture/07-deployment-view.md#map-and-observation-assets).

### Consequences

* Good, because the map works without third-party uptime, and its licensing is recorded per source.
* Good, because chart values come from manifests, never from display pixels.
* Bad, because PMTiles needs HTTP Range requests that return 206; otherwise tiles are served as z/x/y files.
* Bad, because display relief is a visualization product, not an analysis input, and extract sizes are not yet measured.
* Bad, because tiles or WebGL rendering can still fail (RISK-06 in the [risk register](../project/risk-register.md)); the fallback is a static attributed relief image built from the same sources, with the area listed as text.

### Confirmation

The serving check in GATE-04 of the [delivery plan](../project/delivery-plan.md#gates) (a Range request returns 206), PF-01 (first map render within 3 s) in [acceptance criteria](../project/acceptance-criteria.md), and attribution visible on the map at all times.

## Pros and Cons of the Options

License findings: TECH-42 to TECH-46 in the [technology source register](../../research/technology/source-register.md).

### Runtime third-party tile services (MapTiler Cloud, the OpenFreeMap public instance)

* Bad, because MapTiler forbids server-side caching, export and bulk download, OpenFreeMap limits automated downloads, and both leave the demonstration's uptime with a third party (TECH-45).

### Third-party imagery basemaps (EOxCloudless, Esri World Imagery)

* Bad, because EOxCloudless layers from 2018 to 2025 are CC BY-NC-SA 4.0, and Esri World Imagery is not intended for offline tile export (TECH-45).
