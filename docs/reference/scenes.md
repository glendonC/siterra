# Scenes and views

How Siterra shows the same place from different angles, plays time over it, and lets the AI choose and bind reusable map scenes without writing code. Evidence, MapLibre capabilities and the arithmetic behind each template are in the [map scenes research](../../research/technology/map-scenes.md). Decision: [ADR-0035](../decisions/0035-compose-map-scenes-from-reusable-templates.md).

## Terms

| Term | Meaning |
|---|---|
| Scene | A sequence of full map states (camera, layers, annotations, period, caption). Produced from a template, never authored as code. |
| View | A one-step scene: a still from a computed angle. The UI calls these "Views". |
| Tour | A multi-step scene, such as an orbit or a time-lapse. Played with a transport bar. |
| Scene template | Reviewed TypeScript code with an integer version. Declares roles it needs (area, period set, path, viewpoint, evidence), bounded parameters, and availability rules. Case-agnostic. |

Templates bind to any case's records, so a new case gets its own overview, obliques, orbit and time-lapse without anything being rebuilt.

## Pipeline

1. Instantiate: After each commit, a pure function derives the default scene set from the case snapshot and the template availability rules (area ready: overview and obliques; observations available: time-lapse).
2. Validate: Schema, role bindings (type, status, current revision), parameter bounds, geometry limits after resolving, compiled style (MapLibre `validateStyleMin`), text rules, and size limits. A rejected scene never fails its task; the default set stays.
3. Resolve: Geometry turns into fixed numbers: camera keyframes, recipe instances, annotations, captions.
4. Play: `evaluate(scene, tMs)` returns the full frame state as a pure function. A live driver applies diffs to the map and app state in one update; a step driver serves reduced motion.

The model never writes style JSON, expressions, easing functions, coordinates, URLs, markup or code.

## Camera primitives

| Primitive | What it does | Reduced motion |
|---|---|---|
| `fit` | Frames an area or feature set at a bearing rule (north, across the valley axis, upstream, downstream, facing a slope) and pitch 0 to 60 | Same still |
| `look_from` | Camera at a viewpoint above terrain looking at a target, with pitch clamped and the eye raised if needed | Same still |
| `orbit` | Finite rotation around a target (sweep 30 to 360 degrees, 2 to 8 degrees per second, eased ends); never loops | Three stills |
| `fly_along` | Camera follows a line record (for example a river main stem) with smoothing and yaw limits | Four to six stills |
| `period_sequence` | Steps through periods (same month each year, all available, or a list), holding each; gaps shown as gaps | Manual next |
| `hold` | Holds the current state | Same |

Step transitions: cut, ease or fly, 300 to 3,000 ms, easing tokens from the [motion reference](motion.md).

## Layer recipes

Coded functions that emit MapLibre layers over bundle sources: `area_outline`, `context_dim`, `period_raster` (crossfade only, never interpolated), `rainfall_grid`, `strata`, `path_line` (reveal synced to a fly-through), `evidence_marker` (at most one finite pulse), `terrain_relief` (exaggeration 1.0 to 1.5, set per step, never tweened), and `imagery_drape` (P1: a cloud-free Sentinel-2 true-color composite precomputed by the pipeline, draped on the terrain for orientation views only, captioned with its months and "Contains modified Copernicus Sentinel data", never shown together with a data layer). Recipes read runtime values through MapLibre global state, so a binding change is a state update, not a style edit.

## Annotations

Labels from record fields, callouts that quote an evidence statement with its ID chip (open the inspector), captions from template strings with slots filled from records, and fixed honesty notes ("Relief exaggerated 1.2 times", "Oblique view: not for reading area or pattern", "Preview boundary"). No free text from the model.

## Templates

Example resolutions for the Aït Bouguemez catchment are computed in the research note (for example the valley axis at about 57 degrees and an across-valley bearing of 146.6 or 326.6 degrees).

| Template | Kind | Binds | Priority |
|---|---|---|---|
| `overview_2d` | View | Area | P0 |
| `valley_oblique` (facing across or along the valley axis) | View | Area, outlet | P0 (two stills), P1 (four) |
| `orbit_area` | Tour | Area | P0 if it holds 50 fps on the demo laptop (PF-04), otherwise stills |
| `period_timelapse` | Tour, driven by the timeline play button | Temporal observations | P0 |
| `answer_focus` | View | The records a committed answer binds (for example hypotheses, their evidence and the rainfall grid) | P0 as a deterministic default per answer type; P1 when the model chooses it |
| `ridge_view` | View | Area, viewpoint record | P1 |
| `river_flythrough` | Tour | Area, main-stem line record | P1 |
| `strata_tour` | Tour | Strata records | P1 |

Viewpoint and path roles need a context feature record (point or line with provenance and attribution, for example a DEM-derived main stem or an OpenStreetMap summit) in contracts 1.3.

## The model's role

- **P0:** none. Each answer type maps to a default scene, so the camera goes where the evidence is without a model call.
- **P1:** `propose_scene` in the commit that completes the user's own command when it asks to show something ("show the valley from the north ridge", "play April across the years"). The model picks one template, binds record IDs and sets bounded parameters. Accepted scenes may play once; background proposals never auto-play.
- **Later:** the model composes steps from the same primitives and recipes under the same validator; good compositions become templates through review. User-saved views are stored as fixed stills.

## Geometry and readability limits

Camera at least 300 m above the terrain maximum along its path; pitch at most 75 for tours and 80 for stills; yaw at most 8 degrees per second; zoom 9 to 13.5; center inside the display extent; steps that show `period_raster` or `rainfall_grid` are top-down with terrain off ([MOT-12](motion.md#mot-12-camera-mode-change)). Tours: at most 12 steps and 45 seconds, no loops, Pause and Stop always visible (WCAG 2.2.2).

## Player behavior

- Any map gesture, wheel, key or pointer down pauses within one frame; Resume eases back; Stop restores the camera, layers and period from before the scene.
- Background commits never change a playing scene; they wait behind "View new findings (n)".
- Reduced motion turns tours into stills stepped manually; captions are announced politely; `essential` is never set.
- Before playing, wait for the map to be idle at the first camera and warm the terrain tile cache.

## Views menu

A "Views" button next to zoom, reset and 2D/3D. Two groups: Views and Tours. Each item shows its title, one line on what it shows, duration for tours, what it binds ("April 2019 to 2025, 6 of 7 observed"), and status (Ready, Unavailable with the reason, Stale). Tours open a transport bar above the timeline with Play, Pause, Stop, previous and next step, and the caption line. Every fact a scene shows is also available in the case panels; the map is supplementary.

## Export

Screen recording of the live app is the demo method because it keeps the mode badge in every frame. Frame-exact export (MapLibre `setNow` with a video encoder) captures only the map canvas and is a later option.
