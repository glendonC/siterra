# Map scenes: reusable, AI-composed views and tours

Status: research and recommendation, checked 2026-10-26. Public research note with no credentials or account details. Nothing was installed, run, rendered or deployed, and no account was created. Sources were read as documentation pages, `npm view` metadata, GitHub API metadata, and source files fetched from public repositories at the tags named below. Example template values were computed with a stdlib script from the public catchment bounding box ([Data sources and reproducible methods](../../docs/reference/data-sources-and-methods.md#study-area)), public point coordinates ([study area status](../geospatial/study-area.md)), and summary statistics (centroid, principal axis, extents) of the private preview polygon; they are arithmetic, not rendered or tested views.

Labels: **Verified** means read in the cited source on the check date (not executed). **Judgment** means an engineering or design assessment. **Not verified** means this work did not establish it. Everything under "Recommendation" is judgment.

Related: [UX architecture: AI composition contract](../../docs/reference/ux-architecture.md#ai-composition-contract), [motion](../../docs/reference/motion.md), [generative workspace](generative-workspace.md), [map assets](map-assets.md), [stack versions](stack-versions.md), [VIS-09 FireTrace](../design/source-register.md).

## Findings and recommendations

1. **Build one general system, smaller and stricter than "AI-generated animations".** A typed **Scene** grammar (camera primitives, coded layer recipes, record-bound annotations, a step timeline), a code-owned library of **SceneTemplates** that bind to any case's records by role, a deterministic **resolver** that turns template plus records into fixed camera keyframes, and one **player** with interruption, a reduced-motion step mode and a frozen-clock export path. The model never writes animation code, style JSON, easing functions or coordinates. It picks a template, binds record IDs and sets bounded parameters, the same pattern as `show_component`.
2. Something better: views first, motion second. The valuable unit is the **View** (one camera and layer state from a chosen angle). "Different views from different angles" is mostly four to six stills derived from geometry and joined by MapLibre's own `easeTo`/`flyTo`. Only two sequences earn animation in this build: a finite orbit, and the period time-lapse, which should be the temporal strip's own play control (FireTrace's single playhead driving map, chart cursor and legend), not a separate map animation. Scenes derived deterministically from records need no model; the model adds value by choosing which view explains the result of the user's own command.
3. MapLibre 6.14.0 is enough. It has a free camera (`calculateCameraOptionsFromTo`, `calculateCameraOptionsFromCameraLngLatAltRotation`), center `elevation`, `global-state` expressions that let recipes change without new style JSON, `symbol-height-offset` for labels above terrain, and `setNow`/`restoreNow` for frame-exact export. **deck.gl is not worth adding now**: its layers are not draped over MapLibre terrain, `@deck.gl/mapbox` reads the `map.transform` that MapLibre 6 removed (`@deck.gl/maplibre` is the supported path), and this case has no trajectory data.
4. Conflicts to resolve first (lead decision). [UX architecture](../../docs/reference/ux-architecture.md) says "the model does not choose map layers" and caps Place pitch at 55°; [motion](../../docs/reference/motion.md) rule 1 forbids ambient loops and rule 3 forbids lines drawing on; schema 1.2 has no Scene record. Proposed amendments are in "Decisions this needs".
5. 9-day cut. A small slice that may start on day 5 only if GATE-03 passed, ranked P1 so it never displaces a P0 test: about 1.5 developer-days (judgment) behind a PF-04 stop rule. It contains the template registry in code, client-side derivation from records (no schema change), a Views control with four stills, a finite orbit and strip playback, reduced motion and interruption. Model-proposed scenes, a Scene record, ridge and river fly-throughs, the strata tour and export come after the event.

## Sources inspected

| ID | Source | Material inspected | Version or date seen |
|---|---|---|---|
| MS-01 | [MapLibre GL JS](https://github.com/maplibre/maplibre-gl-js) | `dist/maplibre-gl.d.ts` (via jsDelivr), `src/ui/camera.ts`, `src/ui/map.ts`, `src/util/time_control.ts`, `src/util/browser.ts`, `src/webgl/render_to_texture.ts`, `src/style/style.ts` at tag `v6.14.0`; `CHANGELOG.md` at `v6.16.0`; npm metadata | 6.14.0 (2026-10-11); latest 6.16.0 (2026-10-25) |
| MS-02 | MapLibre examples | Git tree of `test/examples/` at `v6.14.0` (137 HTML files), 30 read in full; each cited page returned HTTP 200 at `maplibre.org/maplibre-gl-js/docs/examples/<slug>/` | 2026-10-26 |
| MS-03 | MapLibre issues and pull requests | [#8549](https://github.com/maplibre/maplibre-gl-js/issues/8549), [#8413](https://github.com/maplibre/maplibre-gl-js/issues/8413) and fix [#8406](https://github.com/maplibre/maplibre-gl-js/pull/8406), [#8368](https://github.com/maplibre/maplibre-gl-js/pull/8368) | 2026-10-26 |
| MS-04 | [MapLibre style spec](https://github.com/maplibre/maplibre-style-spec) | `src/reference/v8.json`, `src/validate_style.min.ts`, `src/validate_style.ts`, `src/validate/validate_layer.ts`, `validate_property.ts`, `src/validate/` listing at tag `v26.4.4`; `dist/index.d.ts` | 26.4.4 (2026-09-15), ISC |
| MS-05 | [deck.gl](https://github.com/visgl/deck.gl) | Docs at `v9.4.0`: `api-reference/maplibre/overview.md`, `developer-guide/base-maps/using-with-maplibre.md`, `geo-layers/trips-layer.md`, `extensions/terrain-extension.md`, `json/overview.md`, `json/conversion-reference.md`, `json/json-configuration.md`. Source: `modules/mapbox/src/deck-utils.ts`, `modules/maplibre/src/compatibility.ts`, `modules/json/src/helpers/parse-expression-string.ts`, `expression-eval/expression-eval.ts`, `json-converter.ts`, `json-configuration.ts`. Issues [#10700](https://github.com/visgl/deck.gl/issues/10700), [#10501](https://github.com/visgl/deck.gl/issues/10501). npm metadata | 9.4.0 (2026-09-05), MIT |
| MS-06 | [kepler.gl](https://github.com/keplergl/kepler.gl) | `master`: `src/schemas/src/vis-state-schema.ts`, `map-state-schema.ts`, `src/utils/src/camera-tour.ts`, `docs/api-reference/advanced-usages/saving-loading-w-schema.md`; PR #3860; npm metadata | master 2026-10-26; npm latest 3.3.0-alpha.16, alpha 3.3.0-alpha.18 (2026-10-19) |
| MS-07 | [Mapbox storytelling](https://github.com/mapbox/storytelling) | README, `config.js`, `index.html` | `main`, pushed 2026-06-29, BSD-3-Clause |
| MS-08 | MapLibre story templates | [opengeos/maplibre-gl-storymaps](https://github.com/opengeos/maplibre-gl-storymaps) README (MIT, pushed 2026-10-12); [digidem/maplibre-storymap](https://github.com/digidem/maplibre-storymap) README (pushed 2024-11-10) | 2026-10-26 |
| MS-09 | ArcGIS | Web Scene Specification [slide](https://developers.arcgis.com/web-scene-specification/objects/slide/), [viewpoint](https://developers.arcgis.com/web-scene-specification/objects/viewpoint/), [camera](https://developers.arcgis.com/web-scene-specification/objects/camera/); StoryMaps help [sidecars](https://doc.arcgis.com/en/arcgis-storymaps/author-and-share/add-sidecars.htm), [maps](https://doc.arcgis.com/en/arcgis-storymaps/author-and-share/add-maps.htm), [map tours](https://doc.arcgis.com/en/arcgis-storymaps/author-and-share/add-map-tours.htm) | 2026-10-26; docs only, product not used |
| MS-10 | [Google Earth Studio docs](https://earth.google.com/studio/docs/) | Quick starts, keyframes, easing, camera target, special attributes, 3D camera export, rendering, best practices | 2026-10-26; docs only |
| MS-11 | [Felt developer docs](https://developers.felt.com/llms.txt) | Styling layers, FSL getting started, map interactions and viewport, AI agents and MCP | 2026-10-26; docs only |
| MS-12 | AI visualization research | arXiv abstracts: [2303.02927](https://arxiv.org/abs/2303.02927) (LIDA), [2407.00981](https://arxiv.org/abs/2407.00981) (VisEval), [2401.11255](https://arxiv.org/abs/2401.11255), [2503.12880](https://arxiv.org/abs/2503.12880) (nvBench 2.0), [2309.10094](https://arxiv.org/abs/2309.10094) and [2408.16119](https://arxiv.org/abs/2408.16119) (Data Formulator 1 and 2), [2402.11453](https://arxiv.org/abs/2402.11453) (MatPlotAgent), [2607.20775](https://arxiv.org/abs/2607.20775) (Flint). READMEs: microsoft/lida, microsoft/VisEval, microsoft/data-formulator, microsoft/flint-chart | Abstracts and READMEs only, not full papers |
| MS-13 | Chart grammars | npm metadata for vega-lite, vega, vega-interpreter, @observablehq/plot, @uwdata/mosaic-spec, flint-chart; GitHub advisory database (`ecosystem=npm`) for vega, vega-functions, vega-expression, vega-selections, vega-lite, vega-embed, @observablehq/plot, @deck.gl/json; Plot `docs/what-is-plot.md`; Vega-Lite JSON schema URL (HTTP 200) | vega-lite 6.5.0 (2026-10-08) |
| MS-14 | Video export | Remotion `LICENSE.md` (`main`) and docs page [gl-options](https://www.remotion.dev/docs/gl-options); MDN content for `HTMLCanvasElement.captureStream`, `CanvasCaptureMediaStreamTrack.requestFrame`, `VideoFrame()`; Mediabunny README and `src/media-source.ts`; npm metadata for remotion, mediabunny, mp4-muxer, webm-muxer, hubble.gl | remotion 4.0.539; mediabunny 1.62.1 |
| MS-15 | W3C WCAG 2.2 Understanding | [2.2.2 Pause, Stop, Hide](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html), [2.3.3 Animation from Interactions](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html) | 2026-10-26 |
| MS-16 | Repository context | docs 00, 04, 05, 08, 09, 11, 12, 14, 16, 17, 18, 19; research map-assets, stack-versions, study-area-status, reference manifest (VIS-09) | 2026-10-26 |

## Findings

### 1. MapLibre GL JS 6.x camera, terrain and animation (MS-01 to MS-03)

All rows Verified in the 6.14.0 typings or source unless marked.

| Capability | Fact | Consequence for scenes |
|---|---|---|
| Camera options | `CameraOptions` = `center`, `zoom`, `bearing`, `pitch`, `roll`, `elevation` (center elevation in meters). `JumpToOptions` adds `padding`. `AnimationOptions`: `duration`, `easing` (a JS function), `offset`, `animate`, `essential`, `freezeElevation`. `EaseToOptions` adds `padding`, `around`, `easeId`, `noMoveStart`, `delayEndEvents`; default duration 500 ms (source). `FlyToOptions`: `curve` (default 1.42), `minZoom`, `speed` (default 1.2), `screenSpeed`, `maxDuration`, `padding` | Easing is a function, so the grammar must use named easing tokens mapped in code |
| Reduced motion | `easeTo` sets duration 0 when `!essential && prefersReducedMotion`; `flyTo` delegates to `easeTo` in the same case (source). The `reduceMotion` map option assigns a module-level override to `browser.prefersReducedMotion`, which both read (source), although its JSDoc only mentions gesture inertia. 6.14.0 fixed `flyTo` dropping `offset` and `around` under reduced motion | Library moves honor reduced motion if `essential` stays unset ([motion](../../docs/reference/motion.md)). Per-frame `jumpTo` loops are not covered; the player must check itself |
| Free camera | `calculateCameraOptionsFromTo(from, altitudeFrom, to, altitudeTo?)` and `calculateCameraOptionsFromCameraLngLatAltRotation(lngLat, alt, bearing, pitch, roll?)` return options for `jumpTo`. No `FreeCameraOptions` type exists in the 6.14.0 typings. `calculateAnchoredCameraOptions` also exists | "Look from A at B" and fly-along cameras are possible without private APIs |
| Pitch and clamping | `maxPitch` 0 to 180, default 60; `setMaxPitch` at runtime. `centerClampedToGround` (default true) must be false to keep the camera above ground beyond 90°. Vertical field of view default 36.87°, settable. `rollEnabled` default false. `transformCameraUpdate` callback can rewrite center, zoom, pitch, bearing, roll and elevation before each move | Scenes above 60° need `setMaxPitch` during playback only; a clearance clamp can live in `transformCameraUpdate` |
| Terrain | Style `terrain` = `source`, `exaggeration` (default 1, no `transition` in the spec). `Map.setTerrain` validates, destroys the current `Terrain` and builds a new `Terrain` and `RenderToTexture` on every call, and warns if hillshade or color-relief share the terrain source (source) | Exaggeration is a per-step constant; tweening it would rebuild terrain each frame (not measured) |
| Draping | With terrain on, `background`, `fill`, `line`, `raster`, `hillshade` and `color-relief` render into per-tile textures draped on the mesh; `circle`, `symbol`, `heatmap`, `fill-extrusion` do not (source). PR #8368 (6.9.0): a drape re-renders when its fingerprint changes (source tiles, data revision, zoom); source data changes re-render immediately | Paths drape automatically (the FireTrace look). Animating a draped layer re-renders drapes; animate `circle`/`symbol` instead where possible (judgment) |
| Sky, fog, globe | `sky-color`, `horizon-color`, `fog-color` ("Requires 3D terrain"), `fog-ground-blend`, `horizon-fog-blend`, `sky-horizon-blend`, `atmosphere-blend`; all transitionable. `projection.type` is a string, transition state or zoom expression; globe examples exist | A haze preset adds depth to oblique views; globe adds nothing at valley scale (judgment) |
| Expressions for runtime state | `["global-state", name]` (since 5.6.0) plus `map.setGlobalStateProperty`; initial `globalState` map option added in 6.14.0; paint, light and sky properties that read global state transition since 6.11.0 (changelog). Official example filters symbols with it | Recipes can be static style layers whose filters or paint read named state; the player sets values, never style JSON |
| Lifted labels | `symbol-height-offset` and `symbol-height-anchor` (6.6.0) float symbols above terrain; example "Elevate symbols above the terrain" | Readable annotations in oblique views |
| GeoJSON updates | `setData(data): Promise<void>` and `updateData(diff)`; `line-gradient` requires `lineMetrics: true` on a GeoJSON source and is not transitionable | Path reveal by data update or gradient step |
| Time control | `now`, `setNow`, `restoreNow`, `isTimeFrozen` exported since 5.10.0 "for deterministic rendering, enabling frame-by-frame video export"; camera easing reads `now()` (source). The pulsing-dot example reads `performance.now()` directly, so it would not freeze | Export can step frames; custom animations must read the scene clock, not `performance.now()` |
| Events | `MapMovementEvent` covers moves from "either user interaction or methods such as `jumpTo`/`flyTo`"; its `originalEvent` is typed as a mouse, touch or wheel event or `undefined`; move methods accept `eventData` | The player tags its own moves with `eventData` and treats an event carrying `originalEvent` as a user gesture (inferred from the types, not tested); it also listens for keys in the map region |
| Known issue in 6.14.0 | #8549: after `jumpTo`/`easeTo`/`flyTo`, the camera can drop to sea level while the DEM under the center loads, then jump; fixed in 6.15.0 (2026-10-18), which passes the 14-day pin rule on 2026-11-01 | Pass explicit `elevation` from resolved keyframes and prefetch; consider 6.15.0 (lead decision) |
| Fit | `cameraForBounds(bounds, {bearing, padding, maxZoom, absolutePadding})` fits a bbox rotated by `bearing`; whether `pitch` changes the fit was not verified | Templates store a fit rule plus a tuned `zoomOffset`, not a zoom number |

Official examples (each exists at tag `v6.14.0` and on maplibre.org):

| Example slug | What it does | Reuse |
|---|---|---|
| `animate-map-camera-around-a-point` | `rotateTo((timestamp / 100) % 360, {duration: 0})` every animation frame, about 10°/s per its comment; infinite | Orbit primitive (made finite and eased) |
| `walk-around-a-map-in-first-person` (2026-07-25) | `jumpTo(calculateCameraOptionsFromTo(eye, 1.6, ahead, 1.6))` per frame; `centerClampedToGround: false`, `maxPitch: 95` | Fly-along and look-from primitives |
| `set-center-point-above-ground` | `centerClampedToGround: false`, `elevation: 541`, `maxPitch: 105` | Elevated targets |
| `fly-to-a-location-based-on-scroll-position` | A chapters object of `flyTo` options (`center`, `zoom`, `bearing`, `pitch`, optional `duration`, `speed`) switched on scroll | Story map baseline; no `essential`, so reduced motion applies |
| `customize-camera-animations` | Easing functions, `duration`, `offset`, `animate`; sets `essential: true` | Shows what not to copy (`essential`) |
| `animate-a-line` | Appends coordinates and calls `setData` each frame | Path reveal (small lines) |
| `animate-a-point-along-a-route` | Turf sampling of 500 steps along a route; moves a point | Marker along a path |
| `add-an-animated-icon-to-the-map` | Pulsing dot via `StyleImageInterface` that calls `triggerRepaint()` every frame | Continuous repaint cost; avoid for ambient use |
| `animate-an-icon-on-the-gpu` (2026-08-03) | `StyleImageWebGLData` draws an animated icon directly into the atlas | Later, if a cue must be cheap |
| `animate-a-series-of-images` | `updateImage({url})` on an image source every 200 ms with `raster-fade-duration: 0` | Time-lapse baseline (MOT-04's two-source crossfade is better) |
| `create-a-time-slider` | `setFilter` by month from a range input | Strip-driven filtering |
| `filter-layer-symbols-using-global-state` | Filters read `["global-state", "type"]`; `setGlobalStateProperty` on input | Recipe parameters without style edits |
| `3d-terrain`, `sky-fog-terrain` | Mapterhorn TileJSON with separate DEM sources for terrain and hillshade "to improve render quality"; `TerrainControl`; sky settings | Relief setup |
| `add-a-color-relief-layer`, `add-a-hillshade-layer`, `add-a-multidirectional-hillshade-layer` | `color-relief` over `["elevation"]`; hillshade methods (`standard`, `basic`, `combined`, `igor`, `multidirectional`) | Base relief |
| `elevate-symbols-above-the-terrain` (2026-06-25) | Data-driven `symbol-height-offset` | Annotations |
| `add-custom-layers-that-follow-the-terrain` (2026-09-30) | Experimental `renderToTerrainTile` and `renderTerrainHeightMap` for custom WebGL layers | Not needed; noted for completeness |
| `add-3d-tiles-3d-objects-and-models-using-threejs` (2026-10-05), `add-a-custom-style-layer` | three.js through `maplibre-gl-three` 3.0.0; raw custom layer | Not needed |
| `offset-the-vanishing-point-using-padding` | `easeTo({padding})` for sidebars | Matches 05's padding rule |
| `sync-movement-of-multiple-maps` | Three maps synchronized with `@mapbox/mapbox-gl-sync-move` | Multiple WebGL contexts; conflicts with "one map instance" (08) |
| `add-contour-lines` | `maplibre-contour@0.0.5` UMD in a 6.14.0 example (file exists; not run) | Partial evidence for the contour plugin on v6 |
| `toggle-deckgl-layer`, `create-deckgl-layer-using-rest-api` | Load `deck.gl@8.9.33` UMD and `deck.MapboxOverlay` | Example files exist on v6.14.0; that they run on v6 was not verified |
| `display-performance-metrics` | FPS from `render` events, `load` and `idle` timings | PF-04 measurement |

### 2. deck.gl with MapLibre 6 (MS-05)

| Topic | Fact | Status |
|---|---|---|
| Versions | `deck.gl`, `@deck.gl/core`, `/mapbox`, `/maplibre`, `/json`, `/geo-layers`, `/extensions` all 9.4.0 (2026-09-05), MIT. `@deck.gl/mapbox` dist-tag `v8-latest` 8.9.36 | Verified (npm) |
| Supported path | `@deck.gl/maplibre` (created 2026-08-28) peers `maplibre-gl ^4.5.1 \|\| ^5.0.0 \|\| ^6.0.0`; docs: "the recommended deck.gl integration for MapLibre GL JS v4.5.1, v5, and v6"; overlaid (default) and interleaved modes; it reads `map.getCenterElevation()` | Verified (docs, source) |
| Compatibility limits | Docs: "Camera target elevation is synchronized. deck.gl layers are not draped over MapLibre terrain." "Non-default vertical field of view and camera roll are not synchronized." "One interleaved overlay may be attached to a map." MapLibre's default `antialias: false` makes interleaved PathLayer edges aliased unless `antialiasing: true` | Verified (docs) |
| Old path | `@deck.gl/mapbox` 9.4.0 `deck-utils.ts` reads `map.transform._nearZ`, `.height` and `.elevation`; MapLibre 6.0.0 removed `map.transform` (changelog; absent from the 6.14.0 `Map` typings) | Verified by reading; failure not reproduced |
| Interleaved bug | deck.gl #10700 (open): basemap labels change size or vanish with interleaved deck layers on MapLibre 6.9.0. Root cause filed as MapLibre #8413, fixed by #8406 in 6.9.1 | Verified (issues, changelog) |
| TripsLayer | `currentTime`, `trailLength` (default 120), `fadeTrail`, `getPath`, `getTimestamps`; timestamps are 32-bit floats, so raw epoch time loses precision | Verified (docs) |
| TerrainExtension | Experimental; needs a deck.gl terrain source (`operation: 'terrain'` or `'terrain+draw'`, for example deck's own `TerrainLayer`) | Verified (docs); implies a second terrain beside MapLibre's (judgment) |
| `@deck.gl/json` | Package since 2018; `JSONConverter` with `@@type` (class from the configured catalog), `@@function` (registered function), `@@#` (constant or enum), `@@=` (accessor expression). `@@=` is parsed by a jsep-based interpreter, not `eval`; `CallExpression` nodes are rejected and member names matching `__proto__`, `prototype` or `constructor` are blocked; `convertFunction` is a replaceable hook | Verified (docs, source) |
| JSON risk left over | A registered class receives whatever props the JSON names (for example a `data` URL or callbacks via `@@function`), so a per-class prop allowlist is still required | Judgment |
| hubble.gl | 1.4.0 (2025-05-20), MIT; peers deck.gl ≥ 8.3; keyframes to MP4, PNG, GIF for deck.gl and kepler.gl | Verified (npm, README); deck-centric |

### 3. Declarative map and story grammars (MS-06 to MS-11)

| Element | Mapbox storytelling and MapLibre ports | kepler.gl | ArcGIS web scene slide and StoryMaps | Google Earth Studio | Felt |
|---|---|---|---|---|---|
| Unit | Chapter | Saved config; `cameraTour` stop | Slide; sidecar slide; map action | Keyframed project; quick start | Layer style (FSL); viewport |
| Camera | `location` {center, zoom, pitch, bearing, speed, curve}; `mapAnimation` flyTo, easeTo or jumpTo | `mapState` {latitude, longitude, zoom, bearing, pitch, dragRotate, isSplit, globe, maxPitch, ...}; stop `camera` {longitude, latitude, zoom, bearing, pitch} | `viewpoint` {camera {position, heading, tilt, fov 1 to 170°}, rotation, scale, targetGeometry} | Position (lat, lon, alt), rotation (pan, tilt, roll), Camera Target with Influence 0 to 100% | `setViewport({center, zoom})`, `fitViewportToBounds` |
| Layers | `onChapterEnter` and `onChapterExit` arrays of {layer, opacity, duration} | `layers`, `filters`, `effects`, `splitMaps`, `layerBlending` | `visibleLayers[]`, `baseMap`, `ground`, `environment` | Overlays and KML | FSL per layer: `version` (2.3.1), `type` (simple, categorical, numeric, heatmap, h3, hillshade), `config`, `paint`, `label`, `popup`, `attributes`, `filters`, `legend` |
| Annotations | Title, image, `description` ("Supports HTML"), markers | `annotations` {kind, anchorPoint, label, armLength, angle, radiusInMeters, ...} | Narrative panel, pop-ups | Track points (exported) | Elements API (markers, notes, ...) |
| Time | None | `animationConfig` {currentTime, speed, timeFormat, timezone} | `timeExtent`; if a slide has none, selecting it removes the view's time filter | Frame timeline with value and speed curves | Not found in the pages read |
| Timing and triggers | Scroll (scrollama); `auto` advance; `rotateAnimation` "Rotates 90 degrees over 24 seconds" | Stops with `holdDurationMs`, `travelDurationMs` | Reader scroll or click; map action buttons (unconfigured action = reset) | Render frame by frame to an image sequence | API and SDK calls |
| Escape hatches | `callback` names a global function run as `window[chapter.callback]()` | None in the schema read | Sidecar content types include code and embed | KML | Not applicable |
| Reuse | Copy `config.js` | "Keep a map config as template, then load it with different datasets" by matching `data.id` | Duplicate slides; data-driven map tours from a feature layer; express maps "cannot be shared between stories" | Quick-start templates | FSL versioned; "Older versions are accepted and migrated automatically" |

Further verified details:

- kepler.gl camera tour. `evaluateCameraTour(tour, elapsedMs)` evaluates "an authored tour at elapsed milliseconds, without clocks or rendering state": holds precede travel, smoothstep easing, shortest longitude and bearing rotation, time clamped, zero-length travel is a cut; `normalizeCameraTour` drops invalid stops. Merged to `master` on 2026-10-21 (PR #3860, "deterministic camera tour model"), after the latest npm alpha (2026-10-19), so not in a release as of this check.
- Earth Studio quick starts. Zoom-To; Point-to-Point "between up to six different points"; Orbit ("A perfectly smooth circular orbit around a point of interest"); Spiral (shrinking, descending orbit); Fly-To and Orbit. The camera-target page warns against animating the camera directly above a target, which "can cause an unwanted 180° 'flip'". Best practices: "Do Not Get Too Close" (texture limits at low altitude). 3D camera export writes an After Effects `.jsx` or JSON file in global ECEF or local ENU coordinates.
- ArcGIS sidecar. "Map choreography" duplicates slides with different extent and visible layers; a map action "Updates a map by changing its location, zoom level, visible layers, feature pop-up, or any combination".
- Felt and agents. Felt runs a remote MCP server so agents can work in a workspace (Business or Enterprise plans); styling is FSL JSON, an intent-level layer grammar rather than raw renderer style.
- MapLibre ports. opengeos/maplibre-gl-storymaps keeps the chapter options including `callback`, adds terrain and exaggeration settings; digidem/maplibre-storymap is "based on Mapbox's storytelling template" for self-hosted MapLibre.

What these grammars share (judgment): a **unit of state** (chapter, slide, stop) that is a camera plus visible layers plus text; **timing** as hold plus travel; **reuse** by rebinding to data identifiers; and, in the more mature ones, **full-state semantics** (an ArcGIS slide without a time extent clears time filtering) rather than deltas, which makes steps randomly accessible and resumable. Their weak points are escape hatches (named global callbacks, HTML descriptions, code embeds) that Siterra's rules prohibit.

### 4. Style-spec validation for generated layers (MS-04)

| Fact | Status |
|---|---|
| `@maplibre/maplibre-gl-style-spec` 26.4.4 is the version `maplibre-gl@6.14.0` depends on (`^26.4.4`) and the npm latest; ISC; ships `gl-style-validate`, `gl-style-format`, `gl-style-migrate` binaries | Verified |
| `validateStyleMin(style, styleSpec?)` returns `ValidationError[]` sorted by line; each error has `message`, `identifier`, `line`, `severity` (`error` or `warning`; warnings "must keep rendering"). Sub-validators: `validateStyleMin.source`, `sprite`, `glyphs`, `fontFaces`, `light`, `sky`, `terrain`, `state`, `layer`, `filter`, `paintProperty`, `layoutProperty` (each takes an options object with the style context). `validateStyle` (Node) also parses strings for line numbers | Verified |
| Catches: unknown properties; wrong value types; enum values; expression parsing and typing (`validate_expression.ts`); duplicate layer IDs; missing `source`; source not found; layer and source type mismatches (raster on vector, hillshade or color-relief needing `raster-dem`); missing `source-layer` on vector sources; ref-layer rules; sky, terrain, projection and glyph URL checks | Verified (source) |
| Does not catch: rendering cost, label collisions, contrast, whether a `["get", field]` names a real field, whether a URL is allowed, total layer count or expression size, semantic correctness | Judgment from what the validators check |
| At runtime `Style.addLayer` validates (map option `validateStyle`, default true) and emits validation errors instead of adding the layer; `setTerrain` validates since 6.0.0 | Verified (source) |

### 5. AI-generated visualization specs (MS-12, MS-13)

| Work | What it generates | Finding (from abstract or README) |
|---|---|---|
| LIDA (Dibia, 2023) | Code in any library; "treats visualizations as code" | README: "To create visualizations, LIDA generates and executes code"; run "in a secure environment". Repository last pushed 2024-08-08 |
| VisEval (Chen et al., 2024) | Code (README: "Whether the generated code can produce the visualization") | 2,524 queries over 146 databases; checks validity, legality and readability; "reveals prevalent challenges" |
| Wang et al., 2024 (2401.11255) | Vega-Lite specifications on nvBench | Six LLMs, eight prompt strategies; "substantial performance disparities across prompt strategies, chart types, and LLMs" |
| nvBench 2.0 (Luo et al., 2025) | Text-to-visualization under ambiguity | 7,878 queries, 24,076 visualizations, 780 tables, 153 domains; step-wise reasoning model |
| Data Formulator 1 and 2 (Wang et al., 2023, 2024) | AI writes data transformations; the author binds concepts to visual channels | "Concept binding" separates intent from transformation; DF2 adds iteration and reuse of earlier designs. The README now says its charts are built on Flint |
| MatPlotAgent (2024) | Code with iterative debugging and visual feedback | Agent loop around code |
| Flint (2607.20775, 2026-07-22; `flint-chart` 1.0.1, MIT) | A "semantics-driven data visualization intermediate language" | Compiles concise specs to Vega-Lite, ECharts and Chart.js (README adds Plotly and Excel); "an effective intermediate language for both humans and AI agents" |

Grammar facts: Vega-Lite 6.5.0 (2026-10-08), BSD-3-Clause, peer `vega ^6.4.0`, publishes a JSON Schema (`build/vega-lite-schema.json`, HTTP 200); `vega-interpreter` 2.3.2 is the CSP-safe expression interpreter. The advisory database returned ten Vega-family advisories from 2020 to 2026 (nine titled cross-site scripting, one "arbitrary code execution when clicking href links"), most through expression functions; three are high severity: GHSA-7f2v-3qq3-vvjf (2025-11-13), GHSA-m9rg-mr6g-75gm and GHSA-829q-m3qg-ph8r (both 2026-01-05). None were returned for vega-lite, vega-embed, @observablehq/plot or @deck.gl/json. Plot 0.6.17 is documented as a JavaScript API (a plot specification is code); no JSON specification format was found in the pages read. Mosaic's `@uwdata/mosaic-spec` 0.34.1 does define JSON or YAML specs for Plot-style marks, but `@uwdata/mosaic-core` depends on DuckDB-WASM.

No inspected source compared declarative-spec generation with code generation head to head under controlled conditions (not found in this check). Judgment on the question asked: when the **model** must author charts that are saved and reused, a JSON grammar beats Plot, because JSON can be schema-checked, stored, diffed and rebound, while Plot specifications are code. Raw Vega-Lite from a model, however, brings an expression surface with a steady advisory history and URL-loading data, so it would need a subset or a semantic layer above it, which is where Flint and Felt's FSL have gone. Under Siterra's current contract the model binds records to coded chart components and never writes a chart spec, so **keep Plot 0.6.17 for this build**; a scene step references a catalog chart component by kind and bindings, never a chart spec. Revisit with a typed Siterra chart recipe (or Flint with expressions disabled) only if model-authored charts become a requirement.

### 6. Video export (MS-01, MS-14)

| Option | Facts | Caveats |
|---|---|---|
| Screen recording of the live app (OS recorder or OBS) | No code. Captures DOM overlays, mode badge and captions | Real-time: dropped frames and tile pop-in are recorded as seen. Satisfies DQ-02 (mode badge in every frame) if the badge is on screen |
| `canvas.captureStream()` plus MediaRecorder | `captureStream(frameRate)`; with `0`, frames are captured only on `requestFrame()`; throws `SecurityError` if the canvas is not origin-clean | Captures the WebGL canvas only, not DOM overlays; MediaRecorder timestamps follow wall-clock time. Self-hosted assets (ADR-0018) keep the canvas origin-clean (judgment) |
| Frame-stepped export in the browser | MapLibre `setNow(ms)`/`restoreNow()`; `redraw()` "Force a synchronous redraw"; `once('idle')` returns a promise without a listener; `canvasContextAttributes.preserveDrawingBuffer` default `false`. Mediabunny 1.62.1 (MPL-2.0) `CanvasSource.add(timestamp, duration)` encodes the canvas with explicit timestamps via WebCodecs; `VideoFrame` accepts a canvas with a microsecond `timestamp`. `mp4-muxer` and `webm-muxer` are deprecated: "superseded by Mediabunny" | Canvas only; read pixels right after `redraw()` or enable `preserveDrawingBuffer` in an export route (judgment). Not run |
| Remotion 4.0.539 | License: free for individuals, for-profit organizations "with up to 3 employees", non-profits and evaluation; others need a Company License; the file says the license "will slightly change" in Remotion 5.0. GL options page: `angle` recommended for WebGL on desktop, `swangle` on machines without a GPU, memory leaks with `angle` on long renders | Renders React frames in headless Chromium; a MapLibre map inside it would need per-frame `setNow` and idle waits (not verified). Eligibility depends on the founder's entity (not established) |
| hubble.gl 1.4.0 | Keyframes to MP4, PNG, GIF for deck.gl and kepler.gl | Not a MapLibre exporter |

## Recommendation (judgment)

### The answer to "or is there something better?"

| Option | Verdict | Why |
|---|---|---|
| Rebuild scenes per case | Reject | The cost the founder wants to avoid; no reuse |
| Model-written code (MapLibre JS, Remotion components) | Reject | Violates the project rule; the code-generating systems inspected execute what they generate (LIDA) and are evaluated for validity failures (VisEval) |
| deck.gl JSON with `@@=` expressions as the scene language | Reject | Catalog-constrained, but any registered layer accepts arbitrary props and expression strings; deck layers do not drape on MapLibre terrain |
| Adopt an existing story format wholesale (Mapbox storytelling, kepler.gl config, ArcGIS slides, Earth Studio) | Borrow ideas only | Each is tied to its own runtime or app state, and the open ones carry escape hatches (`callback`, HTML, embeds) |
| **Siterra Scene grammar plus template library, resolver and player** | **Adopt** | Same contract as layout: catalog, binding by reference, deterministic reducer. Borrows full-state steps (ArcGIS), camera move templates (Earth Studio quick starts), pure time evaluation (kepler.gl `evaluateCameraTour`), rebinding by identifier (kepler.gl), an intent-level grammar compiled by code (Flint, FSL) and MapLibre's free camera and time control |

The improvement over the founder's framing: (a) **views before animation**: stills from computed angles carry most of the value at almost no rendering or motion-sickness cost; (b) **one playhead**: the time-lapse drives the shared period state, so map, strip cursor, chart cursor and legend move together, which is what makes FireTrace feel coherent (VIS-09); (c) **deterministic first, AI second**: the default scene set is derived from records with no model call, and the model's job is to choose and bind, which keeps scenes reproducible, reviewable and exportable.

### Architecture

```
SceneTemplate (code, versioned, reviewed)        Case records (authoritative)
        │                                                 │
        └──────────────┬──────────────────────────────────┘
                       ▼
   instantiate: default set by availability rules  ◄── propose_scene (model, later):
                       │                                 templateId + role bindings
                       ▼                                 + bounded params + title
   validate: schema → bindings → params → resolve → geometry limits
             → compiled style (validateStyleMin) → text rules
                       │ (reject: keep default set, no repair round)
                       ▼
   Scene (resolved keyframes, recipe instances, annotations, captions)
     now: derived on demand, not stored │ later: presentation record, revisioned
                       ▼
   evaluate(scene, tMs) → FrameState (pure: no clock, no map reads)
                       ▼
   drivers: live (rAF) │ step mode (reduced motion) │ export (setNow, later)
                       ▼
   MapLibre (jumpTo, easeTo/flyTo, setGlobalStateProperty, setTerrain per step)
   plus app state (period, focus) in one state update
```

Terms: a **View** is a one-step scene (a still); a **Tour** is a multi-step scene. Both are **Scenes**; templates produce scenes. The UI says "Views".

### Scene grammar: primitives

Camera primitives (angles in degrees, distances in meters; all resolved to numbers before playback):

| Primitive | Parameters and bounds | Resolves to | Reduced motion | MapLibre mapping |
|---|---|---|---|---|
| `fit` | target role (area or feature set); bearing: fixed 0 to 359 or rule (`north`, `across_axis_auto`, `across_axis_a`, `across_axis_b`, `upstream`, `downstream`, `face_aspect`); pitch 0 to 60; framing `area` or `valley_floor`; `zoomOffset` -1 to +2 | center, zoom, bearing, pitch, elevation | Same still | `cameraForBounds` with shell padding, plus offset |
| `look_from` | eye: point role plus clearance 100 to 3,000 m; target role; `maxPitch` ≤ 75 (stills ≤ 80) | Eye raised until pitch ≤ max, then camera options | Same still | `calculateCameraOptionsFromTo`, then `jumpTo`/`easeTo` |
| `orbit` | target role; start bearing rule; sweep ±30 to ±360; 2 to 8°/s; pitch 30 to 60; framing; ease in and out 500 to 1,500 ms | Fixed center, zoom, pitch; bearing(t) | Three stills (start, middle, end) | `jumpTo({bearing})` per frame, as in the official orbit example |
| `fly_along` | path role (LineString record); direction; back 1,000 to 5,000; ahead 1,000 to 6,000; height above path ground 500 to 3,000; 0.5 to 2 km/s; yaw ≤ 8°/s; smoothing window | Eye and target keyframes at 4 Hz with DEM elevations sampled at resolve time | Four to six stills at checkpoints | `calculateCameraOptionsFromTo` per frame |
| `period_sequence` | period role (TemporalObservations); selector `same_month_each_year`, `all_available` or explicit list; hold 800 to 3,000 ms | Ordered period IDs including gaps | Instant swaps, manual Next | App period state, so MOT-04's crossfade applies |
| `hold` | duration | Current camera | Same | None |
| step transition | `cut`, `ease` or `fly`; 300 to 3,000 ms; `curve` 1.0 to 1.42; easing token `standard`, `exit`, `linear` (09 tokens) | Library move | Cut | `easeTo`/`flyTo`, `essential` never set |

Layer recipes (coded functions that emit MapLibre layers over bundle sources; the model never sees style JSON):

| Recipe | Binds | Parameters | Layer types (draped with terrain?) | Motion allowed |
|---|---|---|---|---|
| `area_outline` | GeoSelection | emphasis `default` or `focus` | line (yes) plus label symbol (no) | None |
| `context_dim` | GeoSelection | outside opacity 0.4 to 0.8 | fill mask (yes) | None |
| `period_raster` | TemporalObservation with `mapStatus: available` | opacity 0.6 to 1 | raster image source (yes) | MOT-04 crossfade only; never interpolated |
| `rainfall_grid` | rainfall DataBundle | line width | line (yes) | None |
| `strata` | strata records | highlighted stratum ID | fill plus line (yes) | None |
| `path_line` | context line record | reveal `none` or `follow_camera`; width | GeoJSON line with `lineMetrics` (yes) | Reveal synced to `fly_along`, updates throttled (about 15 Hz, judgment); none in reduced motion |
| `evidence_marker` | Evidence with a spatial scope | cue `static` or `single_pulse` (at most two pulses) | circle plus symbol with `symbol-height-offset` (no) | One finite pulse via `circle-radius` transition; static in reduced motion |
| `terrain_relief` | DEM bundle | exaggeration 1.0 to 1.5 per step; sky preset `none` or `haze` | terrain and sky | Never tweened |

Recipes read named runtime values through `["global-state", ...]` (for example the highlighted IDs), so a binding change is a state update, not a style edit.

Annotations: `label` (record field such as `label` at the bound revision; anchor at the area label point, feature centroid or point record with height offset; symbol layer or DOM marker), `callout` (evidence statement excerpt plus ID chip, DOM, opens the inspector), `caption` (template string with slots filled from records; no free text), and `honesty` notes from a fixed list ("Relief exaggerated 1.2×", "Oblique view: not for reading area or pattern", "Preview boundary").

Timeline: ordered steps, at most 12; each step is a **full state** (camera primitive, active recipes, annotations, period, caption), so anything not listed is off and any step can be entered directly. Tours last at most 45 s; `loop` does not exist; `autoAdvance` is allowed only with Pause and Stop visible (WCAG 2.2.2 applies to automatic movement longer than five seconds).

### Templates for this case

Geometry inputs: public bbox `-6.54125, 31.49403, -6.14236, 31.75625` (37.8 × 29.2 km); preview polygon area centroid about `-6.3565, 31.6603`; principal axis of the preview boundary about 57° (NE to SW), extent about 40.9 km along and 18.3 km across, farthest boundary point 21.5 km from the centroid; outlet `31.637197 N, 6.536500 W`; Tabant `31.65873, -6.42007` (11.3 km from the outlet at bearing 78°); Jbel Azourki `31.74642, -6.26105`, 3,690 m (OpenStreetMap, community-mapped); preview elevations p5 1,877 m, median 2,581 m, max 4,002 m (55 m average). Zooms assume the 1440 × 900 shell (visible map about 840 × 748 px, 24 px margins) and 512 px tiles. All values are arithmetic to be tuned on the real map.

| Template | Kind | Binds | Rule | Example resolution for this case | When |
|---|---|---|---|---|---|
| `overview_2d` | View | area | Fit bbox with shell padding; bearing 0; pitch 0; terrain off | Zoom about 10.45 | Now |
| `valley_oblique` (param `facing`: `across_a`, `across_b`, `upstream`, `downstream`) | View | area (+ outlet for upstream and downstream) | Bearing from the principal axis (across: axis ± 90; along: axis or reverse); pitch 55 (05's Place cap); terrain 1.2 (MOT-01); framing `valley_floor` (zoom about 11.8, MOT-01) or `area` (about 10.3 plus offset); `across_axis_auto` picks the side whose near half has lower mean DEM elevation | Across bearings 146.6° or 326.6°; at 326.6° the outlet sits left and the head right | Now (two or four stills) |
| `orbit_area` | Tour | area | Center = area centroid; framing fixed for the whole sweep (circle fit, zoom about 10.1 plus offset, or valley floor about 11.8); start bearing from `valley_oblique`; sweep 120° at 8°/s with 1 s ease each end | About 17 s. At zoom 11.8 the camera is about 25 km from the center (14.5 km above it at pitch 55) | Now, behind PF-04 |
| `period_timelapse` | Tour (strip play) | TemporalObservations | Camera from `overview_2d`; terrain off (MOT-12); `same_month_each_year`; hold 1.2 s; MOT-04 crossfade; missing periods shown as gap frames with "No map observation for this period" | April 2019 to 2025: seven frames, about 8.4 s | Now (strip transport) |
| `ridge_view` | View | area + viewpoint (point record: DEM highest point in the area, or a named summit) | `look_from` eye above the viewpoint toward the centroid; pitch clamp | From Jbel Azourki: 13.2 km to the centroid at bearing 223°; with the target at the preview median elevation (placeholder), a 400 m clearance gives pitch 83.5°, so the clamp raises the eye to about 4,900 m for pitch 80 or about 6,100 m for pitch 75 | Later (needs a viewpoint record) |
| `river_flythrough` | Tour | area + path (main-stem line record, DEM-derived from the same release as the catchment) | `fly_along` back 2.5 km, ahead 3 km, height 1.5 km above path ground (pitch about 75); yaw ≤ 8°/s; `path_line` reveal synced | An assumed 35 to 40 km main stem (not yet measured) at 1.5 km/s takes 23 to 27 s | Later |
| `hypothesis_focus` | View (two steps) | Hypothesis + its Evidence (+ rainfall bundle) | Fit union of evidence scopes, top-down, terrain off; `period_raster` + `rainfall_grid` + static `evidence_marker`; callouts by evidence ID | Matches 05's Explanations projection plus framing | Later |
| `strata_tour` | Tour | strata records | Per stratum (at most six): bearing = dominant aspect + 180 so the camera faces the slope; pitch 50; fit stratum bbox; hold 3 s; ease 1.5 s | About 27 s for six strata | Later |

Notes: the DEM stops at z12 (about 16 m per pixel) and overzooms beyond ([map assets](map-assets.md)), so close, low fly-throughs reveal coarse relief; keep the camera at least about 1 km above ground and zoom at most about 13 (judgment, consistent with Earth Studio's "Do Not Get Too Close"). Never place a fly-through target directly under the camera (Earth Studio's flip warning).

### Persistence and reuse

- **SceneTemplate**: code, not data. One file per template (TypeScript plus Zod), integer `version`, golden tests against fixture cases, changed by pull request. Never stored per case and never model-written. Reuse across cases comes from roles plus availability rules (a template with an unbound required role shows as "Unavailable" with the reason).
- **Scene, now**: derived on demand by a pure `instantiate(template, snapshot)`; nothing stored; the URL holds `view=<templateId>` and, during a tour, `t=<ms>`. This fits [Data contracts](../../docs/reference/data-contracts.md#presentation-contract)'s rule that presentation is reconstructible from records.
- **Scene record, later** (schema 1.3, platform lane approval): fields as in the draft below, with `origin` `default_projection`, `user_command` or `user_saved`; status `ready`, `stale`, `unavailable`, `rejected`. A newer revision of any bound record makes the scene `stale` (like PRES-06) and triggers deterministic re-resolution. Resolved keyframes are stored so playback, review and export show exactly what was validated, independent of runtime terrain queries. A new **ContextFeature** record (point or line with provenance and attribution, for example a DEM-derived main stem or an OpenStreetMap summit under ODbL) is needed for viewpoint and path roles.
- **User-saved views** (later): the user's own camera and active recipes captured as a `fixed` still; allowed because it is user input, not model output.

### Validation

Run on the server before any Scene is shown or committed; the client re-checks at load.

| Layer | Check | Issue code (proposed) |
|---|---|---|
| Schema | Zod strict; model-facing arguments flat, all properties required, nullable instead of optional, no `oneOf`/`allOf`, no recursion ([stack versions](stack-versions.md)) | `scene.schema_invalid` |
| Template and bindings | Template exists; each role bound to a record of the right type, status (for example `analysis_ready`, `mapStatus: available`) and current revision | `scene.unknown_template`, `scene.binding_type_mismatch`, `scene.binding_stale` |
| Parameters | Inside the template's declared bounds | `scene.param_out_of_range` |
| Geometry after resolving | Camera at least 300 m above the DEM maximum along its path; pitch within the limit; yaw rate ≤ 8°/s; zoom 9 to 13.5; center inside the display extent `-6.61,31.43,-6.08,31.82`; steps with `period_raster` or `rainfall_grid` are top-down with terrain off (MOT-12) | `scene.camera_below_terrain`, `scene.pitch_exceeds_limit`, `scene.motion_too_fast`, `scene.out_of_extent`, `scene.measurement_view_not_top_down` |
| Style | Compile recipes into the bundle style; `validateStyleMin` returns no `error`; every source is a bundle source; no external URLs; at most six recipe layers above the base style | `scene.style_invalid`, `scene.source_not_allowed` |
| Text | Title ≤ 60 characters, numbers only from bound records, no verdict words (05); captions only from template strings | `scene.title_rejected` |
| Limits | ≤ 12 steps; ≤ 45 s; at most one animated recipe at a time; at most two pulses per step | `scene.limit_exceeded` |

A rejected proposal never fails its task: the default scene set stays and no model repair round is spent (PRES-07 in 14).

### Player

- Evaluator. `evaluate(scene, tMs) → FrameState` (camera with elevation and padding, terrain, recipe values, annotations, period, caption). Pure, like kepler.gl's `evaluateCameraTour`; unit-tested at fixed times.
- Live driver. `requestAnimationFrame` loop on a scene clock; applies diffs only: `jumpTo(camera, {source: 'scene'})` with explicit `elevation` and the shell padding; `setGlobalStateProperty` or `setPaintProperty` on change; `setTerrain` only at step boundaries; period through the app's period state in the same update as the map change (05); step transitions through `easeTo`/`flyTo`. `setMaxPitch` raised only for the scene's duration.
- Interruption. Pause within one frame (MQ-02: 100 ms) on any `MapMovementEvent` with `originalEvent`, pointer down, wheel or key down in the map region, or transport input. Paused keeps the camera; Resume eases back to the scene camera at `t` (600 ms); Stop restores the pre-scene camera, layers and period unless the user chose "Keep this period". Commits during playback follow hold and release; a scene never changes because of background work.
- Reduced motion. Step mode: each step's representative still, instant switches, manual Previous and Next, captions announced politely. The in-app reduced-motion setting can also pass `reduceMotion` to MapLibre (a global override, see finding 1). `essential` is never set.
- Readiness. Before Play, wait for `idle` at the first camera; warm the HTTP cache for the DEM pyramid if served as static z/x/y files (128 tiles for z0 to z12 over the current asset extent `-6.71,31.33,-5.98,31.92`; arithmetic, using the method that reproduces the 80 tiles [map assets](map-assets.md) gives for its superseded extent); explicit `elevation` in every `jumpTo` mitigates #8549 on 6.14.0.
- Export (later). `setNow(frameMs)` → evaluate → `jumpTo` → await `idle` → `redraw()` → `CanvasSource.add(t, 1/fps)` → `restoreNow()`. Canvas only, so captions and the mode badge must be composited; label any such render "Rendered from case revision N".

### How the model proposes scenes

- Now: no model. The default set is instantiated from availability rules after commits (area ready: overview and obliques; observations available: time-lapse).
- Later: `propose_scene`. Allowed only in the commit that completes the user's own command when the command asks to show something on the map ("show the valley from the north ridge", "play April across the years"), at most one proposal per command. Context: template catalog descriptions (IDs, roles, parameter bounds, purpose), the workspace summary and available record IDs; never pixels or screenshots (05). Accepted scenes may auto-play once because they complete the user's command; background proposals never auto-play.
- After that: `compose_scene`. The model assembles steps from primitives and recipes under the same validator. Recurring good compositions become templates through review and a pull request; the model never adds primitives or recipes.
- **Never**: style JSON, expressions, easing functions, coordinates (except through record bindings), URLs, CSS, markup or code.

### View switcher

- Placement. A "Views" menu button beside zoom, reset and 2D/3D, top-right of the visible map region (08).
- Content. Two groups: Views (stills) and Tours. Each item: title, one line on what it shows, duration for tours, binding summary ("April 2019 to 2025, 6 of 7 observed"), status (Ready, Unavailable with reason, Stale), and "Proposed for your last command" when model-proposed.
- Behavior. A still eases in (900 ms, MOT-12 token) or flies if far; a tour opens a transport bar at the bottom center of the visible map (Play/Pause, Stop, Previous/Next step, step ticks, caption line with honesty notes) above the strip; the strip cursor moves during time-lapses. Reset returns to the deterministic workspace projection.
- Accessibility. Menu button plus listbox; Escape stops and returns focus; captions in a polite live region; every fact shown remains available in the column (08: the map is supplementary).

### Risks

| Risk | Mitigation |
|---|---|
| WebGL cost: terrain at pitch 55 to 80 loads many tiles; continuous repaint from animated icons; per-frame changes to draped layers re-render drapes; `setTerrain` rebuilds terrain | Camera-only motion; animated elements as `circle`/`symbol`; one animated recipe at a time; exaggeration fixed per step; measure with `render` FPS against PF-04 (50 fps); ship stills if a tour fails |
| Camera glitches over loading DEM (#8549 in 6.14.0) | Explicit `elevation`, readiness wait, DEM prefetch; consider 6.15.0 from 2026-11-01 |
| Label legibility: collisions are recomputed while moving and labels fade (`fadeDuration` default 300 ms) | Show only scene annotations and a few key place labels during tours; halos at 06 contrast; `symbol-height-offset` to keep labels out of terrain |
| Motion sickness (WCAG 2.3.3 notes nausea and migraine for vestibular disorders) | Yaw ≤ 8°/s (the official example uses about 10°/s; Mapbox storytelling's rotation is 90° per 24 s); no roll; no combined fast zoom and rotation; eased starts and stops; no loops; tours ≤ 45 s; Stop always visible; step mode under reduced motion |
| Misreading: exaggerated relief and oblique views distort area and pattern | Honesty notes on every 3D step; measurement recipes only in top-down steps (MOT-12); no extruded strata, because height would read as data |
| Motion rules: orbit, pulse and path reveal touch 09 rules 1 and 3 | Only user-started or user-command scenes; finite; data never interpolated; amendment below |
| Schedule | The day 5 to 7 slice is small and has a stop rule; nothing here displaces a P0 acceptance test |

### deck.gl verdict

Not for this build. MapLibre covers every primitive above; deck layers would not drape over MapLibre terrain (the FireTrace look depends on draped paths); TerrainExtension needs a second terrain; the old `MapboxOverlay` path reads removed internals; there are no trajectories, aggregations or point clouds in this case. Revisit if a later case needs many time-stamped trajectories (TripsLayer), GPU aggregation or point clouds, and then use `@deck.gl/maplibre` 9.4.0, not `@deck.gl/mapbox`.

### Build cut (today is day 1; feature freeze at the end of day 7, delivery plan)

| When | Build | Exit check |
|---|---|---|
| Days 1 to 4 | Nothing beyond P0. Keep camera code behind one map module so scenes can drive it later | GATE-03 passes |
| Day 5 or 6 (only if GATE-03 passed and DF-02 is on track) | Template registry with `overview_2d`, `valley_oblique` (two or four facings), `orbit_area`, `period_timelapse`; pure evaluator with unit tests; client-side instantiation; Views menu; transport bar; strip play, pause and step | Stills switch within PF budgets; evaluator tests pass |
| Day 7 (motion day) | Interruption, step mode, honesty notes, URL state; a playing tour counts as the one focal transition (09 rule 2), so other focal motion queues; PF-04 on the demo laptop | MQ-01, MQ-02, MQ-03 and PF-04 pass for each tour; failing tours are hidden and stills remain |
| Day 8 to 9 | Record the demo by screen capture of live playback (mode badge visible) | DQ-01, DQ-02 |
| After the event | `propose_scene`, Scene and ContextFeature records (schema 1.3), `ridge_view`, `river_flythrough`, `hypothesis_focus`, `strata_tour`, user-saved views, frame-stepped export, `compose_scene`, an elevation-profile chart synced to the fly-through (a DEM-derived Measurement record) | Lead approval of the decisions below |

### Decisions this needs (for the lead; not edited here)

1. **05**: keep "Map layers follow the focused component deterministically" outside scene playback; during a scene, coded recipes chosen by a template are active; the model may only select a template and bind records.
2. **09**: add a scene-playback motion class (for example MOT-13): user-started or user-command scenes only; finite; orbit ≤ 8°/s; one finite pulse per step; path reveal synced to the camera; tours ≤ 45 s; reduced motion is step mode. Clarify that rule 1's "no ambient loops" and rule 3's "lines do not draw on" (data) are unchanged.
3. **05 and 08**: pitch above 55° only in scene stills and tours (up to 75, stills up to 80), never in measurement views.
4. **14 and schema**: Scene and ContextFeature records in schema 1.3 (after the event); no schema change for the day 5 to 7 slice.
5. **17 and 18**: rank Views as P1 that may start on day 5 if GATE-03 passed; add MQ and PF checks for tours.
6. **12**: whether to move to MapLibre 6.15.0 after 2026-11-01 (fixes #8549 and terrain DEM lookups).

### Draft JSON: SceneTemplate

Illustrative. `{"param": ...}` and rule names are data that the resolver interprets in code; there is no expression language.

```json
{
  "templateId": "orbit_area",
  "version": 1,
  "kind": "tour",
  "title": "Orbit the area",
  "description": "A finite, slow orbit around the analysis area for orientation. Not a measurement view.",
  "roles": [
    {"role": "area", "recordType": "GeoSelection", "required": true, "constraints": {"geometryStatus": ["analysis_ready", "context_only"]}}
  ],
  "params": [
    {"name": "framing", "type": "enum", "values": ["area", "valley_floor"], "default": "valley_floor"},
    {"name": "startBearingRule", "type": "enum", "values": ["across_axis_auto", "across_axis_a", "across_axis_b", "north"], "default": "across_axis_auto"},
    {"name": "sweepDeg", "type": "number", "min": -360, "max": 360, "default": 120},
    {"name": "angularSpeedDegPerS", "type": "number", "min": 2, "max": 8, "default": 8},
    {"name": "pitchDeg", "type": "number", "min": 30, "max": 60, "default": 55},
    {"name": "exaggeration", "type": "number", "min": 1, "max": 1.5, "default": 1.2}
  ],
  "steps": [
    {
      "id": "orbit",
      "transitionIn": {"kind": "fly", "durationMs": 1500, "curve": 1.2, "easing": "standard"},
      "camera": {
        "primitive": "orbit",
        "target": {"role": "area", "point": "area_centroid"},
        "framing": {"param": "framing"},
        "startBearing": {"param": "startBearingRule"},
        "sweepDeg": {"param": "sweepDeg"},
        "angularSpeedDegPerS": {"param": "angularSpeedDegPerS"},
        "pitchDeg": {"param": "pitchDeg"},
        "easeInOutMs": 1000
      },
      "terrain": {"enabled": true, "exaggeration": {"param": "exaggeration"}, "sky": "haze"},
      "layers": [
        {"recipe": "area_outline", "bind": "area", "emphasis": "default"},
        {"recipe": "context_dim", "bind": "area", "outsideOpacity": 0.6}
      ],
      "annotations": [
        {"kind": "label", "bind": "area", "field": "label", "anchor": "area_label_point"}
      ],
      "caption": {"key": "scene.orbit_area.caption", "slots": {"areaLabel": {"bind": "area", "field": "label"}}},
      "honesty": ["relief_exaggerated", "oblique_not_for_measurement"]
    }
  ],
  "limits": {"maxDurationMs": 45000, "maxPitchDeg": 60, "maxYawDegPerS": 8, "minClearanceM": 300},
  "reducedMotion": {"mode": "stills", "stills": ["start", "middle", "end"]},
  "availability": {"requiresRoles": ["area"]}
}
```

### Draft JSON: Scene (resolved, proposed record shape)

Illustrative values for this case: the centroid and bearing come from the preview polygon summary; `centerElevationM` is the preview median used as a placeholder for a DEM sample; IDs follow the schema's ID pattern with fictional `example` values.

```json
{
  "recordType": "scene",
  "id": "scene_example-orbit-area",
  "revision": 1,
  "createdAt": "2026-10-30T12:00:00Z",
  "updatedAt": "2026-10-30T12:00:00Z",
  "caseId": "case_example",
  "templateId": "orbit_area",
  "templateVersion": 1,
  "resolverVersion": 1,
  "kind": "tour",
  "title": "Valley relief, slow orbit",
  "origin": "default_projection",
  "status": "ready",
  "sourceCaseRevision": 7,
  "bindings": [{"role": "area", "entityId": "geo_example", "revision": 2}],
  "params": {"framing": "valley_floor", "startBearingRule": "across_axis_auto", "sweepDeg": 120, "angularSpeedDegPerS": 8, "pitchDeg": 55, "exaggeration": 1.2},
  "resolved": {
    "durationMs": 17000,
    "steps": [
      {
        "id": "orbit",
        "t0Ms": 0,
        "t1Ms": 17000,
        "transitionIn": {"kind": "fly", "durationMs": 1500, "curve": 1.2, "easing": "standard"},
        "camera": {
          "kind": "orbit",
          "center": [-6.3565, 31.6603],
          "centerElevationM": 2581,
          "zoom": 11.8,
          "pitchDeg": 55,
          "bearingStartDeg": 326.6,
          "sweepDeg": 120,
          "easeInOutMs": 1000
        },
        "terrain": {"enabled": true, "exaggeration": 1.2, "sky": "haze"},
        "layers": [
          {"recipe": "area_outline", "entityId": "geo_example", "revision": 2, "emphasis": "default"},
          {"recipe": "context_dim", "entityId": "geo_example", "revision": 2, "outsideOpacity": 0.6}
        ],
        "annotations": [
          {"kind": "label", "entityId": "geo_example", "revision": 2, "field": "label", "anchor": [-6.3565, 31.6603]}
        ],
        "caption": {"key": "scene.orbit_area.caption", "values": {"areaLabel": "Valley catchment (hydrological analysis extent)"}},
        "honesty": ["relief_exaggerated", "oblique_not_for_measurement"],
        "reducedMotionStills": [{"bearingDeg": 326.6}, {"bearingDeg": 26.6}, {"bearingDeg": 86.6}]
      }
    ]
  },
  "validation": {"status": "passed", "issues": []}
}
```

### Draft JSON: `propose_scene` arguments (later, model-facing)

Flat for strict structured output: every key present, unused parameters `null`; the validator checks which parameters apply to the template. `ctx_` is the proposed ContextFeature prefix.

```json
{
  "templateId": "ridge_view",
  "bindings": [
    {"role": "area", "entityId": "geo_example"},
    {"role": "viewpoint", "entityId": "ctx_example-azourki"}
  ],
  "params": {
    "framing": null,
    "facing": null,
    "startBearingRule": null,
    "sweepDeg": null,
    "angularSpeedDegPerS": null,
    "pitchDeg": null,
    "exaggeration": 1.2,
    "periodSelector": null,
    "month": null,
    "holdMs": null
  },
  "title": "The valley from the northern divide",
  "reason": "The user asked to see the valley from the north."
}
```

## Not verified and open questions

- Nothing was rendered: frame rates, tile counts at high pitch, drape re-render cost, label behavior during tours and every zoom or distance above are untested.
- Whether `cameraForBounds` accounts for pitch; whether `global-state` works inside `line-gradient` (a color-ramp property); the exact paint-change path for drape invalidation.
- deck.gl `MapboxOverlay` failing on MapLibre 6 (inferred from source, not reproduced); MapLibre's own v6 deck.gl examples running.
- Remotion with a MapLibre canvas (per-frame `setNow` and idle waits); Remotion eligibility for the founder's entity.
- The main-stem river line, the DEM highest point and per-stratum aspects do not exist as records yet; the Azourki example uses community-mapped OpenStreetMap data; the centroid elevation is a placeholder.
- The principal axis is computed from boundary vertices (sensitive to vertex density); the `across_axis_auto` foreground rule is a proposal.
- A controlled comparison of declarative-spec versus code generation by language models was not found; full papers were not read.
- Felt camera animation or tours: none found in the pages read; ArcGIS StoryMaps' internal JSON was not inspected.
