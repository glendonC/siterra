# Map assets

The public map assets the interface loads from its own origin ([ADR-0018](../../docs/decisions/0018-self-host-the-regional-map-bundle.md), [deployment view](../../docs/architecture/07-deployment-view.md)): the daylight globe's relief and dot grid, the rangeland biomes layer, the valley terrain for the contours and the arrival, and the summer true-colour drape. Every file is listed with its size and SHA-256 in [`manifest.json`](manifest.json). All of them are display assets: no number on a screen or in a chart is read from them.

| Layer | Files | Size (bytes) | Status | Credit on screen |
|---|---|---|---|---|
| Globe relief | `globe/relief-hillshade-8192x4096.png` (7,025,180), `globe/relief-hillshade-4096x2048.png` (1,881,174) | 8,906,354 | Display only | Relief: produced using Copernicus WorldDEM™-90 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved |
| Dot grid (dot size by elevation) | `globe/dots-elevation-0p08-4500x2250.int16le.bin.gz` (4,936,155), `globe/dots-land-0p08-4500x2250.uint8.bin.gz` (121,051) | 5,057,206 | Display only | The same relief credit |
| Rangeland biomes, potential extent (Rangelands Atlas method) | `globe/rangeland-fraction-0p25.png` (69,779), `globe/rangeland-biome-0p25.png` (20,412) | 90,191 | Preliminary | Ecoregions 2017 (c) Resolve, CC BY 4.0 |
| Valley terrain | `terrain/{z}/{x}/{y}.webp`, 165 tiles z0 to z12 (19,787,368), and `terrain/tiles.json` (25,163) | 19,812,531 | Display only | © Mapterhorn (linked to https://mapterhorn.com/attribution/); Produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved |

| Summer true colour (Sentinel-2, July and August 2025) | `imagery/truecolour-summer-2025-3857.webp` (492,344) and its corners, `imagery/truecolour-summer-2025-3857.webp.json` (604) | 492,948 | Display only | Contains modified Copernicus Sentinel data 2025 |

The layer files total 34,359,230 bytes (`layers_total_bytes` in the manifest); the licence notices add 5,020 bytes (`licences_total_bytes`). The full licence notices, including the Article 6(c) liability sentence each Copernicus licence requires in a public legal notice, are in [`licences/`](licences/).

## Globe relief and dot grid

Source: Copernicus DEM GLO-90 (the AWS Open Data bucket `copernicus-dem-90m`, all 26,475 land tiles of its tile list). For each tile the coarsest overview (about 300 x 300 px per degree) was read by HTTP range request and averaged onto a 0.04 degree grid; ocean and areas without a tile are 0 m. Averaging lowers peaks.

- Hillshade: azimuth 315, altitude 45 degrees, vertical exaggeration 10 so relief shows at globe scale; greyscale, equirectangular, rows north to south.
- Dot grid: the 0.04 degree grid averaged over 2 x 2 cells to 0.08 degree (4,500 x 2,250 cells, rows north to south, column 0 at 180 W). `dots-elevation` holds int16 little-endian metres (floor of the mean); `dots-land` holds the share of the four cells that are land, 0 to 255. Each file is a gzip stream without file name or time. A globe sizes each dot by its cell's elevation and draws only cells with land.

## Rangeland biomes layer

Label on screen, exactly: "Rangeland biomes, potential extent (Rangelands Atlas method)". It shows where rangeland ecosystems occur, not where livestock graze: it includes cropland inside these biomes and leaves out grazed forest.

Method: the Rangelands Atlas definition used by the UNCCD thematic report on rangelands (SCI-127), seven of the fourteen WWF biomes (7 to 13), applied to RESOLVE Ecoregions 2017 and leaving out the ecoregion "Rock and Ice". The polygons are rasterized at 0.01 degree by pixel centre and averaged to 0.25 degree (1,440 x 720, equirectangular, rows north to south). `rangeland-fraction` holds each cell's share in those biomes (0 black to 100% white); `rangeland-biome` holds the dominant rangeland biome per cell as its WWF number (7 to 13; 0 none). The layer totals about 76 million km² in the 2017 ecoregions.

## Valley terrain

Mapterhorn's planet archive (`https://download.mapterhorn.com/planet.pmtiles`, version 0.0.13, md5 `4bf586b043f7619d9a9442b43c163f36`), which at this place and these zooms comes only from Copernicus DEM GLO-30. Terrarium-encoded 512 px WebP tiles (elevation in metres = R x 256 + G + B / 256 - 32768), copied unchanged for every tile of zooms 0 to 12 that touches the asset extent `-6.71,31.33,-5.98,31.92`, which pads the display extent `-6.61,31.43,-6.08,31.82` around the catchment, and for zooms 0 to 11 in one more ring of z11 tiles around it, so the arrival relief reaches the far ridges. The z12 tiles cover 6.768 W to 5.977 W and 31.279 N to 31.952 N; the z11 tiles cover 7.031 W to 5.801 W and 31.053 N to 32.101 N, at least 51 km from the catchment's centre in every direction. MapLibre overzooms above the highest zoom present; in the ring there is no z12, so a source there stops at z11 (for example a second `raster-dem` source over the ring with `maxzoom: 11`). Serve them as a `raster-dem` source with `encoding: "terrarium"` and `tileSize: 512`.

The tiles were read with HTTP range requests and the PMTiles version 3 format, without the `pmtiles` CLI. Every tile was also fetched from Mapterhorn's tile server (`https://tiles.mapterhorn.com/{z}/{x}/{y}.webp`) and is byte-identical to it. At the catchment outlet (31.6378 N, 6.5372 W) the z12 tile decodes to 1,465 m; the catchment's lowest point on the analysis DEM (Copernicus GLO-30, 2021 release) is 1,464.6 m. Both are Copernicus GLO-30, a surface model that includes buildings and trees; the release of Mapterhorn's copy is not stated beyond its 2025 access year.

## Summer true colour

One Web Mercator (EPSG:3857) WebP image, 2,322 x 2,204 px, about 30 m on the ground at the centre (35 m in Mercator units), covering the asset extent `-6.71,31.33,-5.98,31.92`. The `.json` beside it gives the four corners in the order a MapLibre `image` source takes them (top left, top right, bottom right, bottom left), the grid and the image's SHA-256. It is made from Copernicus Sentinel-2 L2A on five summer dates (2025-07-26, 07-28, 07-31, 08-20, 08-30; relative orbit R094, tile cloud cover 0.0 to 0.3%): scene classification masks cloud, cirrus, cloud shadow and no data, the per-pixel median of B04, B03 and B02 is taken at 30 m, a fixed stretch makes it 8-bit (255 x clip(reflectance / 0.35, 0, 1) ^ (1 / 1.4)), and GDAL encodes it as lossy WebP at quality 80. Display only: the colours are a stretch, not calibrated reflectance, and summer shows the valley at its driest, not a typical view of the year. The terrain ring beyond the asset extent has no drape.

## Reproduce

```
python -I science/pipeline/globe-relief.py <tileList.txt> <cache_dir> <globe_dir>
python -I science/pipeline/globe-rangeland.py data/raw/resolve-ecoregions-2017/Ecoregions2017.zip <globe_dir>
python -I science/pipeline/map-globe.py <globe_dir> data/map/globe
python -I science/pipeline/map-terrain.py https://download.mapterhorn.com/planet.pmtiles -6.71,31.33,-5.98,31.92 12 data/map/terrain --also=-7.031249,31.052935,-5.800782,32.101189:11 --check=https://tiles.mapterhorn.com/{z}/{x}/{y}.webp
python -I science/pipeline/s2-truecolour.py <items.jsonl> <item_cache_dir> <out_dir> truecolour-outer-30m -6.806,31.269,-5.878,31.982 30 build 2025-07-26 2025-07-28 2025-07-31 2025-08-20 2025-08-30
python -I science/pipeline/map-imagery.py <out_dir>/truecolour-outer-30m.tif -6.71,31.33,-5.98,31.92 35 80 data/map/imagery/truecolour-summer-2025-3857.webp
python -I science/pipeline/map-manifest.py data/map
```

`globe-relief.py` reads about 4.2 GB by range request. `map-globe.py` checks the hillshade PNGs against the checksums its input recorded. A rebuild of the dot grid is byte-identical.
