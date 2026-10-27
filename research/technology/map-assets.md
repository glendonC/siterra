# Map assets: self-hosted regional bundle

Checked 2026-10-26. Public research note. Register IDs: TECH-39 to TECH-46 in [feasibility](source-register.md). No tiles were downloaded, no CLI was installed and nothing was rendered; tile counts below are arithmetic, not measured file sizes.

Scope. The bundle extent is a display extent around the published village locator (31.70 N, 6.34 W; see [study-area status](../geospatial/study-area.md)). It is not an analysis boundary, a pasture unit or a site of concern. Analysis geometry remains governed by [methods](../../docs/reference/data-sources-and-methods.md).

Goal. During the demo the browser loads every tile, glyph, sprite and raster from Siterra's own origin. No runtime request to a third-party tile server.

## Source and licence matrix

| Source | Verified terms (source inspected) | Regional self-hosted copy allowed? | Decision |
| --- | --- | --- | --- |
| **Mapterhorn** terrain ([data access](https://mapterhorn.com/data-access/), [attribution.json](https://download.mapterhorn.com/attribution.json), [TileJSON](https://tiles.mapterhorn.com/tilejson.json)) | Terrarium-encoded 512 px WebP tiles in PMTiles archives; code BSD-3; data from listed open sources. `planet.pmtiles` covers z0 to z12 globally; z13+ files exist only where higher-resolution sources exist. In `download_urls.json` (version 0.0.13) only `planet.pmtiles` covers 31.70 N, 6.34 W. The only global source with resolution of 25 m or coarser is `glo30` (Copernicus GLO-30, "COPERNICUS full, free and open license"). TileJSON attribution: "© Mapterhorn" linked to mapterhorn.com/attribution. | Yes. The data-access page documents `pmtiles extract --bbox` from `planet.pmtiles` and a `--dry-run` size check. | **P0 relief source** (hillshade, color relief, contours, optional terrain). |
| **Copernicus DEM GLO-30** ([AWS registry](https://registry.opendata.aws/copernicus-dem/), [CDSE COP-DEM](https://dataspace.copernicus.eu/explore-data/data-collections/copernicus-contributing-missions/collections-description/COP-DEM)) | Digital Surface Model (includes buildings, infrastructure, vegetation); AWS copy is COG from the 2021 release, "available on a free basis for the general public". CDSE user obligations give two required notices (distribution and adapted/modified), quoted below. | Yes, with the notice. | Notice applies to Mapterhorn-derived relief here. Optional P1: build display tiles from the same DEM used for analysis. |
| **AWS Terrain Tiles** (Tilezen/Mapzen) ([registry](https://registry.opendata.aws/terrain-tiles/), [attribution.md](https://github.com/tilezen/joerd/blob/master/docs/attribution.md), [data-sources.md](https://github.com/tilezen/joerd/blob/master/docs/data-sources.md)) | Licence field points to attribution.md, which gives a required attribution block and says "you are responsible for researching each project to follow their license terms". Global land sources include SRTM ("30 meters (90 meters nominal quality)"), GMTED and ETOPO1; an `X-Imagery-Sources` header names contributing files per tile. S3 access without an AWS account. | Yes, with attribution. | Fallback DEM only. |
| **Protomaps basemap** ([downloads](https://docs.protomaps.com/basemaps/downloads), [CLI](https://docs.protomaps.com/pmtiles/cli), [MapLibre guide](https://docs.protomaps.com/basemaps/maplibre), [builds.json](https://build-metadata.protomaps.dev/builds.json)) | OSM and Natural Earth vector basemap "distributed as an Open Database License Produced Work (OpenStreetMap attribution required)". Daily builds; the docs discourage hotlinking and say to copy to your own storage; `pmtiles extract` supports `--bbox` and `--maxzoom`. Retention: all builds for the past week plus the latest build of each patch version. Latest build today: `20261026.pmtiles`, basemap version 4.15.2, 139,188,276,062 bytes, b3sum `04c16708f8e3723538fce26ca6b11e9c473c0a78966e796dd6290a59c62f103a`. Fonts (Noto Sans glyph PBFs, SIL OFL) and sprites (derived from MIT-licensed tangrams/icons) are in `protomaps/basemaps-assets`, downloadable as a ZIP. | Yes. | **P0 labels, water and roads.** |
| **OpenFreeMap** ([home](https://openfreemap.org/), [ToS](https://openfreemap.org/tos/), updated 2026-10-14) | Free public instance, no keys; MIT project licence; attribution "OpenFreeMap © OpenMapTiles Data from OpenStreetMap". Automated collection is prohibited except offline downloads of at most 3,000 tiles or 50 MB, at most 4 parallel requests, unique User-Agent; larger requires contacting them. Weekly full-planet Btrfs and MBTiles downloads exist for self-hosting. | Only through the offline-download allowance or a full-planet download. | Not chosen. Protomaps documents regional extraction directly. |
| **MapTiler Cloud** ([Cloud terms](https://www.maptiler.com/terms/cloud/)) | Must always be used with your own API key; Free plan limited to non-commercial use and R&D; server-side caching or redistribution of map content prohibited; export and bulk download prohibited unless agreed in writing. | No. | Excluded. |
| **EOxCloudless** (formerly Sentinel-2 cloudless; s2maps.eu now redirects to [cloudless.eox.at](https://cloudless.eox.at/)) ([licence summary](https://cloudless.eox.at/documentation/license), [non-commercial](https://cloudless.eox.at/license-non-commercial)) | 2016 layer: CC BY 4.0. 2018 to 2025 layers: CC BY-NC-SA 4.0 (non-commercial). Commercial use needs the EOX Commercial Attribution-RestrictedUse 1.2 licence. Year-specific attribution, e.g. "EOxCloudless https://cloudless.eox.at by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2025)". WM(T)S request size capped at 4096 px. | 2016 only, with attribution; later years only if use is clearly non-commercial. | Excluded from P0 (judgment: a startup-track entry may not be non-commercial, and Siterra has its own Sentinel-2 products). |
| **Esri World Imagery** ([item licence info](https://www.arcgis.com/sharing/rest/content/items/10df2279f9684e4a9f6a7f08febac2a9?f=json)) | Esri Master License Agreement. "This layer is not intended to be used to export tiles for offline." Offline export only in ArcGIS apps via "World Imagery (for Export)". Credits: "Esri, Vantor, Earthstar Geographics, and the GIS User Community". | No. | Excluded. |
| **OpenStreetMap attribution** ([copyright](https://www.openstreetmap.org/copyright), [OSMF guideline](https://osmfoundation.org/wiki/Licence/Attribution_Guidelines)) | Attribution must be to "OpenStreetMap" and make ODbL clear, e.g. by linking "OpenStreetMap" to openstreetmap.org/copyright; interactive maps typically credit in a map corner; video productions may credit in end credits or description with the URL. | n/a | Applies to the Protomaps layer and to the demo video. |

Natural Earth terms (used inside the Protomaps basemap at low zooms) were not inspected in this pass.

## MapLibre GL JS capabilities (verified in the style spec and docs)

| Capability | Verified fact | Since (GL JS) |
| --- | --- | --- |
| `raster-dem` `encoding: "terrarium"` | Enum `terrarium`, `mapbox` (default), `custom`; `tileSize` default 512 | terrarium 0.43.0; custom 3.4.0 |
| Hillshade methods | `hillshade-method`: `standard` (default, legacy), `basic`, `combined`, `igor`, `multidirectional`. Multidirectional accepts arrays for `hillshade-illumination-direction`, `hillshade-illumination-altitude`, `hillshade-highlight-color`, `hillshade-shadow-color`. `hillshade-exaggeration` 0 to 1, default 0.5. `resampling` linear or nearest | methods 5.5.0; `resampling` 5.20.0 |
| `color-relief` layer | `color-relief-color` is an expression over `["elevation"]`; `color-relief-opacity`; data-driven styling "Not supported yet" | 5.6.0 |
| 3D terrain | Root `terrain: {source, exaggeration}` plus `TerrainControl`. The official example (now on 6.16.0) uses Mapterhorn TileJSON with separate `raster-dem` sources for terrain and hillshade "to improve render quality" | long-standing |
| `pmtiles://` | `pmtiles` JS `Protocol` registered once with `addProtocol("pmtiles", protocol.tile)`; derives min/max zoom; needs HTTP Range requests and CORS if cross-origin ([PMTiles concepts](https://docs.protomaps.com/pmtiles/), [cloud storage](https://docs.protomaps.com/pmtiles/cloud-storage)) | addProtocol-based |
| maplibre-contour | BSD-3-Clause. `new mlcontour.DemSource({url, encoding: "terrarium", maxzoom, worker: true})`, `demSource.setupMaplibre(maplibregl)`, vector source from `demSource.contourProtocolUrl({thresholds, multiplier, contourLayer, elevationKey, levelKey})`, line and symbol layers, `sharedDemProtocolUrl` to share cached DEM tiles with a `raster-dem` source. The README's worker-based variant says its DEM URL pattern "can also support other protocols such as pmtiles://". v0.1.1 notes include "Upgrades and mapterhorn" and "Add protocol worker" | plugin 0.1.1 |
| v6 breaking changes | ESM only (`import * as maplibregl` or named imports); WebGL2 required, `Map` throws `GPUInitializationError` otherwise; bundlers call `setWorkerUrl` (Next.js/Turbopack snippet in the official install docs, Next 15+); `styleimagemissing` is notify-only, use `setMissingStyleImageResolver`; `map.transform` removed | 6.0.0 (2026-07-22) |

Not verified: maplibre-contour on MapLibre 6; `pmtiles://` on a `raster-dem` source (expected to work through the same protocol); Arabic and Tifinagh label rendering with the Protomaps Noto Sans glyph sets.

## Recipe (engineering judgment, exact values)

### Extents

**Superseded 2026-10-26 by the lead:** the analysis catchment chosen later extends south and west of the box below. Use display extent `-6.61,31.43,-6.08,31.82` and asset extent `-6.71,31.33,-5.98,31.92` (see docs/12 and docs/11). The arithmetic below is kept for method.

Computed with WGS84 degree lengths at 31.70 N (1 degree latitude 110.88 km, 1 degree longitude 94.80 km); arithmetic, not a survey.

| Extent | bbox `min_lon,min_lat,max_lon,max_lat` | Size | Purpose |
| --- | --- | --- | --- |
| Display | `-6.50,31.56,-6.18,31.84` | about 30 x 31 km | `maxBounds` and default camera |
| Asset (padded about 0.1 degree) | `-6.60,31.46,-6.08,31.94` | about 49 x 53 km | Extract area, so hillshade and contours have neighbour tiles at the display edge |

Web Mercator tile counts for the asset extent (arithmetic): z0 to z12 = 80 tiles (49 at z12); z0 to z15 = 3,433 tiles. At this latitude a 512 px tile at z12 is about 16 m per pixel, already finer than the 30 m source, so the DEM stops at z12 and MapLibre overzooms.

### Build steps (run offline, record every version and checksum)

1. Tool. Use a pinned release of the `pmtiles` CLI from `protomaps/go-pmtiles`; record its version in the bundle manifest.
2. Relief DEM.
   ```
   pmtiles extract https://download.mapterhorn.com/planet.pmtiles dem-terrarium.pmtiles --bbox=-6.60,31.46,-6.08,31.94 --maxzoom=12 --dry-run
   pmtiles extract https://download.mapterhorn.com/planet.pmtiles dem-terrarium.pmtiles --bbox=-6.60,31.46,-6.08,31.94 --maxzoom=12
   pmtiles verify dem-terrarium.pmtiles
   pmtiles show dem-terrarium.pmtiles
   ```
   Record `download_urls.json` version and the planet md5sum it lists (`4bf586b043f7619d9a9442b43c163f36` today).
3. Basemap. Take the newest build at extraction time (today `20261026.pmtiles`) and record key, version and b3sum from `builds.json`; older daily builds are deleted after a week.
   ```
   pmtiles extract https://build.protomaps.com/20261026.pmtiles basemap.pmtiles --bbox=-6.60,31.46,-6.08,31.94 --maxzoom=15 --dry-run
   pmtiles extract https://build.protomaps.com/20261026.pmtiles basemap.pmtiles --bbox=-6.60,31.46,-6.08,31.94 --maxzoom=15
   pmtiles verify basemap.pmtiles
   ```
4. Glyphs. From the `basemaps-assets` ZIP copy only the font stacks the style uses (for example `Noto Sans Regular`, `Noto Sans Medium`) to `public/map/<bundle>/fonts/{fontstack}/{range}.pbf`, plus `fonts/OFL.txt`. Skip sprites by not rendering POI icons or shields.
5. Siterra Sentinel-2 overlays. From the preprocessing outputs, per period: warp the display product to EPSG:3857 over the asset extent, apply the pinned colour ramp, write 8-bit RGBA WebP or PNG and load it as a MapLibre `image` source with four corner coordinates (simplest for a handful of periods). Use a raster PMTiles pyramid only if size forces it. Chart numbers come from the numeric manifest, never from display pixels ([methods](../../docs/reference/data-sources-and-methods.md)).
6. Manifest. Write `map-bundle.json`: source URLs, build IDs, upstream checksums, output sha256, CLI version, extents, zoom ranges, licence and attribution strings. Large outputs stay out of Git per the [documentation policy](../../CONTRIBUTING.md).
7. **Serve from the app origin** under a versioned path (for example `/map/v1/`). Same origin removes CORS and lets CSP stay `worker-src 'self'` (MapLibre v6 docs).

### Style layer order (bottom to top)

Background; `color-relief` (low opacity elevation ramp, optional); `hillshade` (compare `multidirectional` with two lights against `igor`, which the spec describes as minimising effects on features beneath); one Siterra raster overlay at a time; contours from maplibre-contour (thin, labels P1 per component spec); Protomaps `water`; analysis-area outline (GeoJSON with role label); Protomaps `places` labels in Latin script (`name`, or `name:fr`/`name:en`); optional minor `roads`. Protomaps splits multi-script OSM names into `name`, `name2`, `name3` with `script*` tags (its docs use Casablanca with Tifinagh and Arabic segments), so P0 can filter to the Latin segment. Arabic and Tifinagh labels are P1 pending glyph coverage and RTL plugin checks.

### Serving gate

PMTiles needs `206 Partial Content` for Range requests. On the deployed host run:

```
curl -s -o /dev/null -w "%{http_code}\n" -H "Range: bytes=0-16383" https://<host>/map/v1/basemap.pmtiles
```

If it is not `206`, serve tiles as z/x/y instead: either a small route handler that reads the archive with the `pmtiles` library, or unpack to static files with the documented `pmtiles tile INPUT.pmtiles Z X Y` command (writes one tile to stdout; 80 calls for the DEM extent). There is no bulk unpack command in the CLI docs, and `pmtiles serve` exposes z/x/y but does not serve the raw archive. maplibre-contour's `DemSource` fetches a URL template itself, so static z/x/y DEM files are the least fragile option for contours; judgment: unpack the DEM regardless and keep PMTiles for the basemap.

## Attribution strings

Put these in each source's `attribution` field so the MapLibre attribution control shows them in a map corner, and repeat them in exports and the video description.

| Layer | String |
| --- | --- |
| Relief (Mapterhorn, GLO-30) | `<a href="https://mapterhorn.com/attribution">© Mapterhorn</a>` and the CDSE adapted-data notice, verbatim: "produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved" |
| Basemap (Protomaps, OSM) | `<a href="https://protomaps.com">Protomaps</a> © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>` (the Protomaps example links openstreetmap.org; the OSMF guideline asks for the /copyright link) |
| Siterra Sentinel-2 overlays | "Contains modified Copernicus Sentinel data [actual year(s)]" (required notice, [methods](../../docs/reference/data-sources-and-methods.md)) |
| Fallback DEM (AWS Terrain Tiles) | The required block from Tilezen attribution.md; at minimum its SRTM/GMTED "courtesy of the U.S. Geological Survey" and ETOPO1 NOAA lines (conservative choice: copy the whole block) |
| Glyph fonts | SIL OFL text shipped with the files (licence page, not the map) |

## Open issues for the lead

- Display DEM differs from analysis DEM. Methods pin SRTM (`USGS/SRTMGL1_003`) for analytical terrain; this recipe renders relief from Copernicus GLO-30 (a DSM). Contours or elevation bands drawn from different DEMs can disagree by tens of metres. Options: label relief as visual context only; switch analysis to GLO-30 (already listed in methods as the alternate); or render display tiles from the frozen analysis DEM (extra tooling). Science-lead decision.
- WebGL2. MapLibre 6 has no WebGL1 path. The static attributed fallback map in [architecture](../../docs/architecture/README.md) must be produced from the same sources and carry the same credits.
- Sizes. Only tile counts are known; run the `--dry-run` commands to get bytes before committing to a hosting layout.
