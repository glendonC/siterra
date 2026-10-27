# Study area: recommended analysis geometry

Public. Probed 2026-10-26 (UTC 2026-10-27). Status: **frozen 2026-10-27 at native 30 m** (`geo_ait_bouguemez_catchment` revision 1); the preview below is kept for comparison. A geometry here is an analytical selection. It is never a claim of degradation, grazing rights, agdal limits, consent or management authority. Source IDs refer to the [science bibliography](../science/source-register.md). The files themselves stay in the ignored `data/interim/aoi/`; their checksums are in [frozen geometry and checksums](#frozen-geometry-and-checksums).

## Verified geography

| Item | Verified fact | Source |
| --- | --- | --- |
| Valley | Aït Bouguemez valley, central High Atlas, in the rural district (commune) of Tabant, Province of Azilal; about 40 km long, oriented east–west; valley floor 1800–2200 m with surrounding ranges above 3000 m; more than thirty villages. | SCI-19 (full text) |
| Administrative chain | Commune de Tabant, HCP geographic code 50810309, in Cercle d'Azilal (508103), Province d'Azilal (5081), Région de Béni Mellal-Khénifra (5). | SCI-35 (HCP RGPH 2024 legal population file) |
| Population (official) | Commune de Tabant: 16,401 legal population, 2,910 households, reference date 1 September 2024. Whole commune, not the valley or herding households. | SCI-35 |
| Published locator | Ait Ouchi village, 31.703611 N, 6.338611 W (converted from SCI-04 Table 1). Inside both the commune polygon and the recommended catchment. | SCI-04 |
| Summits and high ground | No peer-reviewed coordinates found. OpenStreetMap (community-mapped, ODbL, not a survey) gives: Jebel M'Goun 4071 m at 31.50909, -6.44415 (node 431222292); Jbel Azourki 3690 m at 31.74642, -6.26105 (node 3278736615); Lac Izoughar at about 31.70638, -6.25799 (way 37078947); Refuge de Tarkeddite at about 31.53153, -6.51574 (way 264538412). Label these "OSM context locations". | SCI-36 |
| Published agdal or pasture boundaries | None found as reusable digital data. SCI-19 contains a figure of forest-agdal locations without a described mapping method; agdal units are 20–200 ha per village (SCI-19). The Agdal volume (SCI-22) was not inspected. | SCI-19, SCI-22 |

## Candidate geometries evaluated

| Candidate | What exists | License | Assessment |
| --- | --- | --- | --- |
| (1a) Official commune boundary | OCHA HDX COD-AB Morocco has Admin 1 (10) and Admin 2 (69) only, source HCP, CC BY 3.0 IGO. geoBoundaries gbOpen (OSM, ODbL) and gbHumanitarian (CC BY 3.0 IGO) also stop at ADM2. No open official commune polygon found. | n/a | Commune level unavailable from official/humanitarian sources. |
| (1b) GADM 4.1 | Levels 0–4 exist for MAR (HEAD-verified files, 2022-07-20). | Non-commercial only; no redistribution without permission. | Rejected for a possibly commercial demo. Contents not downloaded. |
| (1c) OSM commune | Relation 2887314 "Tabant", admin_level 8, version 18, 66 vertices, 510.3 km2, no source tag, some straight-line edges. | ODbL 1.0 (share-alike for derived databases; attribution) | Best administrative option. Links to HCP statistics by code. Coarse, unofficial geometry; spans the Bouguemez drainage and the upper Assif M'Goun valley (draining south-east to the Drâa side). Use as context. |
| (2) HydroBASINS | Level 12 basins average about 130.6 km2, from 15 arc-second HydroSHEDS; Africa delivered as continental zip files. Scripted HEAD to the download returned HTTP 403; not downloaded. | Product page: free for scientific, educational and commercial use under the HydroSHEDS licence (agreement text not read) | Too coarse for a 400 km2 valley; not pursued. Optional cross-check only. |
| (3) DEM catchment upstream of a stated outlet | Preview computed (below). | Copernicus DEM licence (free; attribution) | **Recommended default.** |
| (4) Landscape sample around Ait Ouchi | Trivial to define. | Own geometry from a published point | Arbitrary; locator sits in a side branch. Last-resort fallback only. |

Boundary datasets disagree at this scale: the recommended catchment's southern lobe (about 31.49–31.55 N, 6.44–6.51 W) lies up to about 5.8 km outside the gbHumanitarian Azilal polygon, and OSM places that ground in Imi N'Oulaoune commune, Province d'Ouarzazate. The OSM commune shares vertices with the province polygon.

## Recommendation

**Default analysis extent: the Aït Bouguemez valley catchment**, defined as all land draining to the Assif n'Aït Bouguemez at an outlet just upstream of its confluence with the Oued Lakhdar. Schema use (contracts 1.2): `boundaryRole = hydrological_unit`; `geometryStatus = analysis_ready` only after the native-resolution recompute and review below; label in the product "Valley catchment (hydrological analysis extent); not a pasture, agdal or management boundary".

Rationale: it matches the published description of the valley (east–west extent about 38 km versus "about 40 km" in SCI-19; 5th-percentile elevation about 1880 m versus the published 1800–2200 m floor); boundaries follow ridgelines, so slopes and high ground that drain to the valley are included and the area is not cut by straight administrative lines; vegetation, snowmelt and rainfall context refer to one drainage; inputs are openly licensed and the outlet is fixed before any NDVI is inspected, so the area cannot be tuned to manufacture a trend.

| Property | Value |
| --- | --- |
| DEM | Copernicus DEM GLO-30, AWS bucket `copernicus-dem-30m` (2021 release), tile `Copernicus_DSM_COG_10_N31_00_W007_00_DEM.tif`, 41,088,635 bytes, ETag `7260ba223188db19ee7390f60c998048`, Last-Modified 2022-05-09. One tile covers the AOI. Tiepoint is PixelIsPoint: pixel corners are offset by half a pixel from integer degrees. |
| Outlet | Input 31.637197 N, 6.536500 W: vertex on the mapped river about 268 m upstream of the OSM confluence node (31.6389612, -6.5376975; OSM way 326552769, Assif n Bou Guemez, meeting Oued Lakhdar). Snap to maximum flow accumulation within 120 m. |
| Preview result (55 m overview) | 417.48 km2; bbox [-6.54125, 31.49403, -6.14236, 31.75625]; single ring, no holes. The 110 m overview gave 417.26–417.37 km2 with the same outlet rule. |
| Preview elevations (55 m, average-downsampled, so peaks are underestimated) | min 1465, p5 1877, median 2581, p95 3344, max 4002 m. Commune polygon for comparison: 1596–3746 m. |
| Contains / excludes | Contains Ait Ouchi, Tabant, Lac Izoughar, Jbel Azourki summit (on the divide). Excludes Tizi n'Aït Imi and Tizi n'Tirghist passes (on the divide), Tarkeddit refuge, Jebel M'Goun summit and the upper Assif M'Goun valley. 83% of the catchment lies in the OSM commune; 68% of the commune lies in the catchment. |
| Rainfall support | Touches 31 CHIRPS 0.05° cells; 3 fully inside; effective 15.8 cells of about 26.4 km2. |
| Optical support | Sentinel-2 tiles 29SQR (covers about 98% on orbit R094) plus 29RQQ for the southern edge; see the [probe](data-availability.md). |
| Analysis CRS | EPSG:32629 (UTM 29N): the whole catchment lies west of 6° W. |
| License and attribution | Geometry derived by this project from the Copernicus DEM; carry the Copernicus DEM notice from its licence. The outlet uses one OSM coordinate (insubstantial extract); cite OSM as hydrography context. |

### Reproduction (build window)

1. Download the single DEM tile above; verify ETag/size; record SHA-256.
2. Keep native EPSG:4326 grid for routing (or reproject once to EPSG:32629, documented). Hydrologically condition with a standard tool (WhiteboxTools `BreachDepressionsLeastCost` or pysheds fill), D8 flow direction, accumulation.
3. Snap the outlet above within 120 m to maximum accumulation; delineate; polygonize; dissolve to one Polygon; record vertex count and SHA-256.
4. Acceptance: area within ±5% of 417.5 km2; contains Tabant (31.65873, -6.42007) and the SCI-04 locator; excludes the upper Assif M'Goun valley; inspect the lower gorge near 31.627, -6.528, where the 55 m preview needed up to about 45 m of depression filling, and the southern lobe. Record any deviation; do not adjust the outlet after looking at NDVI.

The preview script (stdlib Python: Priority-Flood with epsilon, D8, snap, polygonization) is a probe tool, not validated hydrology software.

### Frozen geometry and checksums

The native 30 m recompute followed the reproduction steps above with pysheds 0.5 (fill pits, fill depressions, resolve flats, D8, accumulation) on the full DEM tile, before any vegetation index was computed. Every acceptance check passed; the run record is in [data sources and methods](../../docs/reference/data-sources-and-methods.md#study-area).

| Property | Value |
| --- | --- |
| Area | 417.04 km2 geodesic, 417.36 km2 planar in EPSG:32629 (−0.11% vs the preview) |
| Bounding box | [-6.54125, 31.49431, -6.14208, 31.75653] |
| Shape | One ring, 3,057 vertices, no holes; intersection over union with the preview 0.994 |
| Outlet | Snapped 94 m to maximum accumulation at 31.637778 N, 6.537222 W |
| Elevation inside (30 m DEM) | min 1465, p5 1876, median 2581, p95 3344, max 4007 m |
| Lower gorge | Depression filling up to 58 m about 1.5 km upstream of the outlet; routes flow through the gorge, divide unaffected |
| Southern lobe | 22.19 km2 south of 31.55 N (preview 22.72 km2); largest difference from the preview 0.52 km2 at the south-west divide near 31.542 N, 6.512 W |
| Review | Not expert-reviewed |

| File (in `data/interim/aoi/`, ignored) | Role | SHA-256 |
| --- | --- | --- |
| `ait-bouguemez-catchment-cdem2021-30m.geojson` | Frozen analysis geometry; byte-identical to each bundle's `analysis-geometry.geojson` | `ac506ece626b6844d759b56aa60a10248c8c0ea5e206f9a28eb436a892a4d47f` |
| `ait-bouguemez-catchment-preview-cdem2021-55m.geojson` | Preview, 55 m overview | `eafc5bc42d72f01b0b7fd2cd522c092a89d63ceafd148fabbd9bbdfe1a2d87c2` |
| `tabant-commune-osm-r2887314-v18.geojson` | Commune context, OpenStreetMap relation 2887314 version 18 (ODbL) | `19d4026f6309439acf026c1b5e872af03b6711401a8f186e6bc64c846a13ccf8` |
| `azilal-province-geoboundaries-gbhumanitarian.geojson` | Province context, geoBoundaries gbHumanitarian (CC BY 3.0 IGO) | `cc19110638d849334982b9dddfa35948097eb983e458c2c2685be0a231f544b6` |
| Copernicus DEM tile `Copernicus_DSM_COG_10_N31_00_W007_00_DEM.tif` (in `data/raw/`) | Delineation input | `024f00066f44b6c04c26ab5c22ef8d355f6dc77052206d96c9a9c04f66b9c61e` |

### Context layer and statistics

Show the OSM Tabant commune polygon as `regional_context` with ODbL attribution, and attach official HCP figures to it, never to the catchment. Do not report pasture area, stocking density or household exposure for either polygon.

### Fallback

1. If the 30 m recompute cannot be completed or fails acceptance: use the frozen preview polygon (55 m, SHA-256 in the local README) labeled "valley catchment, preview boundary (about 55 m)".
2. If reviewers reject derived hydrology: use the OSM commune polygon as analysis extent, labeled "administrative extent (OSM); not an official boundary", and state that it mixes two drainages.
3. Last resort: a labeled landscape sample box around the SCI-04 locator, persisted with author, rationale and bounds before processing.

## Terrain dataset for strata

Agree with using Copernicus GLO-30 for elevation/aspect strata, with SRTMGL1 v3 as fallback, provided one release is pinned for both delineation and strata. The AWS bucket holds the 2021 release; Earth Engine's current asset is `COPERNICUS/DEM/GLO30_2024_1` (SCI-12). Do not mix releases between catchment and strata without recording it. GLO-30 is a surface model (includes vegetation and buildings); radar artefacts in narrow gorges are plausible and should be checked. Display relief from a third-party tile service (Mapterhorn) is a visualization product; its source release and terms need their own attribution entry and are not analysis inputs.

## Stop conditions (unchanged)

No pasture-area totals, stocking densities, household exposure counts, land-rights claims, inside/outside-agdal comparison or intervention eligibility from any of these polygons. A locally confirmed management unit, with source, authority, permitted use and governance relevance, remains the only basis for `validated_management_unit`.

## Not completed

An independent check of the southern lobe and lower gorge hydrology by a hydrologist (the 30 m recompute and its own inspection are done); comparison with the current HDX COD-AB Admin 2 file (geoBoundaries copy is from 2023 with different upstream source metadata); peer-reviewed coordinates for summits and high pastures.
