# Visual reference manifest

Inspected 2026-10-26. This file is public-safe: it embeds no third-party images and quotes at most one short phrase per source. Screenshots and video frames used during inspection exist only in the gitignored `design/private/references/` folder, together with a machine-readable twin of this list (`manifest.json`). They are not redistributable.

How to read an entry. *Observed* records what was actually seen or read in a primary source on the inspection date. *Fit* and *Do not copy* are design judgments for Siterra, not findings. Vendor pages establish advertised behavior, not measured performance. No account was used, nothing was purchased or submitted, and consent prompts were declined or left unanswered.

Inspection methods. Headless screenshot: local headless Chrome at 1440 px width, image viewed. Scripted session: headless Chrome driven over the DevTools protocol to close a welcome dialog, scroll a story or click a demo item, then screenshot and view. Live view: desktop browser pane, viewed but not saved. Page text: extracted text or the source markdown of the page. Video frames: public MP4 fetched to a scratch folder, frames extracted with ffmpeg and viewed (the video itself is not kept). Post metadata: the public X syndication endpoint.

Schema alignment. Enum names in *Fit* lines refer to [`schemas/case.schema.json`](../../schemas/case.schema.json).

## Index

| ID | Reference | Category | Main Siterra mapping |
|---|---|---|---|
| VIS-01 | Magic Patterns MagicOS | Agent-operated workspace (seed) | firm activity, director command bar |
| VIS-02 | tldraw agent starter kit | Agent-operated workspace (seed) | director command bar, layout composition transition |
| VIS-03 | Linear design refresh | Precise professional UI (seed) | evidence seam, shell hierarchy |
| VIS-04 | MapLibre GL JS examples | Geo engine (seed) | geo stage, camera fly-in |
| VIS-05 | Mapbox docs | Geo engine (seed) | geo stage, camera fly-in |
| VIS-06 | Observable and Observable Plot | Scientific charting (seed) | comparison chart, temporal strip |
| VIS-07 | Motion layout animations | Motion craft (seed) | layout composition and focus transitions |
| VIS-08 | shadcn/ui Trace | Agent UI components (seed) | firm activity, trace inspector |
| VIS-09 | FireTrace wildfire prototype (Claude post) | Map and time synchronization (seed) | temporal strip, geo stage, comparison chart |
| VIS-10 | Astra user-flow review (Mona Biasia post) | Agent output review (seed) | semantic connectors, review |
| VIS-11 | Destiny 2 Director | Game UI (seed, limited) | geo stage |
| VIS-12 | Star Citizen mobiGlas and ARK Starmap | Game UI (seed, minimal) | geo stage |
| VIS-13 | NASA Worldview | Map and time synchronization | temporal strip, evidence seam |
| VIS-14 | Windy | Map and time synchronization | temporal strip |
| VIS-15 | Global Nature Watch map | Map and time synchronization | evidence seam, temporal strip |
| VIS-16 | Copernicus Browser timelapse | Map and time synchronization | temporal strip |
| VIS-17 | swisstopo map viewer | Relief cartography | geo stage, temporal strip |
| VIS-18 | Eduard | Relief cartography | geo stage |
| VIS-19 | Natural Earth cross-blended hypsometric tints | Relief cartography | geo stage |
| VIS-20 | Reuters: Europe's emptying countryside and wildfire | Editorial map storytelling | geo stage, comparison, evidence seam |
| VIS-21 | Reuters: Colorado River toward crisis | Editorial chart storytelling | livelihood constraints, comparison chart |
| VIS-22 | Langfuse tracing | Agent observability | trace inspector |
| VIS-23 | Arize Phoenix tracing | Agent observability | trace inspector, review |
| VIS-24 | OpenAI Agents SDK tracing | Agent observability | trace inspector, firm activity |
| VIS-25 | Vercel Geist materials | Precise professional UI | evidence card surfaces |
| VIS-26 | visionOS ornaments | Spatial OS | director command bar, temporal strip |
| VIS-27 | Rauno Freiberg: interaction details | Motion craft | focus and composition transitions |
| VIS-28 | GitHub pull request review | Decision and review | decision brief / review, operational action |
| VIS-29 | Linear Triage | Decision and review | hypothesis ledger, review |
| VIS-30 | Avatar (2009) Ops Center holotable | Film map hologram | geo stage, evidence markers, arrival |
| VIS-31 | Top Gun: Maverick (2022) Tactical Auditorium maps | Film briefing map | geo stage line work, arrival |
| VIS-32 | Death Stranding (2019) map table and wrist projection | Game map hologram | evidence markers, geo stage |
| VIS-33 | Alan Wake 2 (2023) case board | Game investigation board | case board, hypothesis ledger |
| VIS-34 | Black Panther (2018) vibranium sand, Perception | Film interface concept | governing design concept |

## Seed references

### VIS-01 Magic Patterns MagicOS: coordinator, threads and statuses

- **URL:** https://www.magicpatterns.com/ ; docs https://www.magicpatterns.com/docs/documentation/magic-os/overview and https://www.magicpatterns.com/docs/documentation/magic-os/agents-and-threads
- **Category:** AI-composed / agent-operated workspace.
- **Inspection:** headless screenshots of the home page and both docs pages; page text of the overview. Embedded YouTube walkthroughs not watched. 2026-10-26.
- **Observed:** One coordinator chat answers quick questions itself and turns real work into threads, one agent per piece of work, running in parallel. The threads list groups work under three statuses with counts: *Needs you* (the agent has a question or finished something to review), *In progress*, *Done*. Each row shows an icon, a title, a one-line result summary, an unread dot and a relative age. Feedback typed to the coordinator is passed to the thread that did the work. Spoken input is transcribed live into the composer so the user sees what was heard before it becomes work. A file an agent is working on is marked on the canvas while it works.
- **Fit:** Firm activity becomes one compact list bucketed by `Task.status`: `awaiting_input` and `awaiting_review` first (the human is Siterra's bottleneck), then `running`, then `succeeded`, each row with a one-line outcome that links artifact IDs. The live-transcript rule matches the planned voice path (a reviewable transcript feeding the same submit contract). Marking the target artifact while a job runs maps to a quiet `presentationStatus` change without moving focus.
- **Siterra mapping:** firm activity; director command bar; decision brief / review.
- **Do not copy:** the infinite canvas and free placement (rejected as option B in the UX architecture); colorful per-thread icons (no decorative agent avatars); many parallel agents for a single bounded case.
- **Licensing / implementation:** proprietary product; pattern reference only. Build from Siterra's own components and task states.

### VIS-02 tldraw agent starter kit

- **URL:** https://tldraw.dev/starter-kits/agent
- **Category:** AI-composed / agent-operated workspace.
- **Inspection:** headless screenshot (embedded demo in its idle state: canvas, right-hand chat panel with an "Add Context" chip and model picker); page text. 2026-10-26.
- **Observed:** The user can add specific shapes, or a position or area of the canvas, as context. The agent receives the message, the selection, a screenshot of its viewport, simplified data for shapes in view and grouped counts of shapes outside it. Actions stream in and each one changes the canvas only once that action has finished streaming. Chat history lists the agent's actions, each with an icon, a description and an optional collapsible summary. Modes can restrict capabilities; the agent keeps a todo list and can schedule follow-up work.
- **Fit:** Two behaviors transfer directly. First, an explicit, visible context set: chips for selected geography, committed period and focused component, so the user knows what the director will act on (the submit contract already carries these). Second, per-action atomic application, which matches the rule that streaming tool arguments never update the workspace. The icon + description + collapsible summary entry suits the firm activity log.
- **Siterra mapping:** director command bar; firm activity; layout composition transition.
- **Do not copy:** free-form shape creation and coordinates (`LayoutAction` forbids coordinates and CSS); agent "thinking" written into the user-facing chat; the canvas itself.
- **Licensing / implementation:** tldraw SDK under the tldraw license, a custom license with separate commercial terms (repository LICENSE checked; production key requirement recorded in [feasibility TECH-13](../technology/source-register.md)). Documented providers differ from Siterra's (TECH-11). Pattern only.

### VIS-03 Linear: "A calmer interface for a product in motion"

- **URL:** https://linear.app/now/behind-the-latest-design-refresh (Charlie Aufmann and Maxime Heckel, 2026-03-12)
- **Category:** Precise professional UI.
- **Inspection:** headless screenshot of the article; page text. 2026-10-26.
- **Observed:** The navigation sidebar was dimmed a few notches so the content area takes precedence once the user has arrived. The header system separates a location bar and a view bar so actions such as share, copy link and open PR sit in predictable places. Dividing lines were reduced and separators softened; icons were made smaller and fewer, and colored team icon backgrounds removed. The default palette moved from a cool blue-gray toward a warmer, less saturated gray, with a warning that too warm reads muddy. An internal LCH tool tuned tokens; changes shipped behind flags with side-by-side comparison. One stated principle: "Don't compete for attention you haven't earned."
- **Fit:** Siterra's header and case bar should recede after arrival, leaving contrast for the question, finding and next action, as the design system already requires. Fixed slots for case-level actions in the case bar. Fewer separators lets the evidence seam be the one structural line. Siterra's palette is cool green-gray; any hue drift should be tuned in LCH and tested on terrain.
- **Siterra mapping:** evidence card / evidence seam; layout composition transition (shell hierarchy).
- **Do not copy:** near-black chrome wholesale; hiding structure so far that control borders drop below the required 3:1.
- **Licensing / implementation:** proprietary article and imagery; principles only.

### VIS-04 MapLibre GL JS examples: terrain, hillshade, fog, color relief

- **URL:** https://maplibre.org/maplibre-gl-js/docs/examples/ ; examples `3d-terrain`, `add-a-multidirectional-hillshade-layer`, `add-a-color-relief-layer`, `sky-fog-terrain`, `create-a-time-slider`
- **Category:** Geo engine.
- **Inspection:** headless screenshots of the index, 3D terrain, sky/fog and time slider pages; live view of the multidirectional hillshade and color relief standalone pages (they rendered blank headless); example source markdown; `AnimationOptions` API page. 2026-10-26.
- **Observed:** The 3D terrain example uses separate raster-dem sources for terrain and hillshade to improve render quality, exaggeration 1, a warm brown hillshade shadow (`#473B24`), sky enabled and a terrain toggle control; tiles come from Mapterhorn. Multidirectional hillshade takes arrays of illumination directions (270, 315, 0, 45), altitudes and per-direction highlight and shadow colors (the example's colors are saturated). The `color-relief` layer maps elevation to a color ramp (example ramp is rainbow over a small demo tile). Sky, horizon and fog colors and blends are adjustable. The time slider example filters the layer on every `input` event and updates a text label; it shows no data density or gaps. `essential: true` exempts a camera animation from prefers-reduced-motion; the default is not essential.
- **Fit:** The BSD-licensed engine covers the calm mineral geo stage: multidirectional hillshade with muted, near-neutral highlight and shadow pairs, a restrained mineral color-relief ramp (no green), modest exaggeration to test for High Atlas legibility, and fog to push distant ridges back. Camera fly-ins stay non-essential so reduced motion skips them. The time slider is a counter-example: Siterra's strip shows availability and gaps and commits on release.
- **Siterra mapping:** geo stage; camera fly-in; temporal strip (counter-example).
- **Do not copy:** example color ramps; the OSM raster basemap and demo tile endpoints in a public build; constant 3D (the 2D fallback is planned).
- **Licensing / implementation:** MapLibre GL JS is BSD-3-Clause (LICENSE checked). Mapterhorn tiles (terrarium encoding, 512 px) require attribution; Mapterhorn's attribution list names Copernicus GLO-30 under the Copernicus free and open license as its global source. The demo DEM credits AW3D30 (JAXA). OSM tile usage terms not re-checked. Prefer a precomputed valley relief from a licensed DEM (see [data sources](../../docs/reference/data-sources-and-methods.md)).

### VIS-05 Mapbox docs: Standard configuration, terrain, flyTo

- **URL:** https://docs.mapbox.com/map-styles/standard/guides/ ; https://docs.mapbox.com/mapbox-gl-js/example/add-terrain/ ; https://docs.mapbox.com/mapbox-gl-js/example/flyto-options/
- **Category:** Geo engine.
- **Inspection:** headless screenshots of all three (live maps rendered); page text of the Standard guide and flyTo example. 2026-10-26.
- **Observed:** Mapbox Standard exposes light presets (dawn, day, dusk, night), themes (default, faded, monochrome, or custom through a lookup table), slots (top, middle, bottom) for inserting custom layers into the stack, and toggles for place, POI, road and transit labels and 3D objects. The terrain example drapes satellite imagery over raster-dem with exaggeration. The "slowly fly" example runs `flyTo` for 12 s with `essential: true`, commented as essential with respect to prefers-reduced-motion. Examples load GL JS v3.33.0.
- **Fit:** Two ideas transfer without the SDK: named layer slots (data under labels and above relief, never ad hoc z-order) and a monochrome or faded basemap posture so data carries the color. The `essential` flag semantics are identical in MapLibre.
- **Siterra mapping:** geo stage; camera fly-in.
- **Do not copy:** POI-rich city styling; satellite as the default ground (it competes with vegetation encodings); 12 s flights; globe-scale theatrics.
- **Licensing / implementation:** Mapbox GL JS v2 and later is licensed under the Mapbox Terms of Service and needs an active account and token (LICENSE checked); pricing not verified. Recommendation: implement the ideas in MapLibre (VIS-04).

### VIS-06 Observable and Observable Plot: gaps, crosshair, chart beside table

- **URL:** https://observablehq.com/ ; https://observablehq.com/@observablehq/plot-gallery ; https://observablehq.com/@observablehq/plot-line-chart-with-gaps ; docs source https://github.com/observablehq/plot
- **Category:** Scientific charting.
- **Inspection:** headless screenshots of the home page, gallery and gaps notebook; Plot docs source (`docs/marks/line.md`, `docs/interactions/crosshair.md`) read on GitHub because the docs site rate-limited text fetching. 2026-10-26.
- **Observed:** In Plot, undefined, null or NaN values break a line into segments; the docs warn: "Supplying undefined values is not the same as filtering the data". Filtering interpolates, and the notebook overlays the faint filtered line on the gapped one to show the false straight segments. The crosshair mark labels the x and y of the nearest point on the frame edges; `crosshairX` with `pointerX` suits time-dominant charts. The Observable home page shows an analysis card with chart, SQL query and result table together.
- **Fit:** Encode missing composites as NaN so gaps render, never filter-and-connect. Bind the chart cursor to the committed period. Keep each chart next to its table alternative and method line.
- **Siterra mapping:** comparison chart; temporal strip; evidence card / evidence seam.
- **Do not copy:** notebook UI (code cells shown to reviewers); default categorical colors; dual axes.
- **Licensing / implementation:** Observable Plot is ISC (LICENSE checked). Notebook content licenses vary.

### VIS-07 Motion: layout and shared-element transitions

- **URL:** https://motion.dev/examples ; https://motion.dev/examples/react-modal-shared-layout ; https://motion.dev/examples/react-shared-layout-animation ; docs https://motion.dev/docs/react-layout-animations and https://motion.dev/docs/react-accessibility
- **Category:** Motion craft.
- **Inspection:** headless screenshots of the examples index and two examples; scripted session clicking a card in the modal example, capturing mid-transition and end state; page text of both docs pages. 2026-10-26.
- **Observed:** `layout` animates layout changes from a React render with transforms rather than width and height. `layoutId` links two elements so the new one animates out from the old (crossfading if both are mounted). `LayoutGroup` coordinates components that do not re-render together; `layout="position"` suits aspect changes; `layoutScroll` and `layoutRoot` handle scrolling and fixed containers; border-radius and box-shadow distortion is corrected when set through style. The captured transition shows the clicked card growing from its own grid position. With `MotionConfig reducedMotion="user"`, transform and layout animations are disabled but opacity and color animations are kept.
- **Fit:** Preset changes (arrival, investigate, compare, review) can animate slot containers with `layout`; `layoutId` ties a selected evidence item to its inspector so the inspector visibly comes from it. Siterra's reduced-motion rule also removes crossfades, so add `useReducedMotion` handling that zeroes opacity transitions.
- **Siterra mapping:** layout composition transition; focus transition.
- **Do not copy:** gallery flourish and spring overshoot on analytical panels; many simultaneous moving cards; animating borders (forces layout).
- **Licensing / implementation:** Motion is MIT (license API checked). The modal example is tagged Motion+ (paid); use the open API, not premium example source.

### VIS-08 shadcn/ui Trace and AI Elements

- **URL:** https://ui.shadcn.com/docs/components/base/trace ; https://ui.shadcn.com/docs/changelog
- **Category:** Agent UI components.
- **Inspection:** headless screenshots of the home page and the Trace page (live example visible); page text of the changelog. 2026-10-26.
- **Observed:** The October 2026 changelog adds Trace, Code Block and AI Elements. Trace is a list of lines; each line has an icon, a title, an optional description and status (running, error, pending, with a shimmer while running), and can expand, link, or open a dialog or sheet. Lines nest, so a summary expands into steps. The example shows a timed thought, two commands (one expanded to show output), a failed command in an error color, a sources line, the answer and a Replay button. Plan, Queue, Sources, Stack Trace and Subagent patterns are built from it. Keyboard and screen reader support is stated.
- **Fit:** One line grammar for firm activity and the trace summary: icon, plain title, text status, evidence IDs; nested steps on demand; failures inline with a reason. As copy-in source it can adopt Siterra tokens.
- **Siterra mapping:** firm activity; trace inspector.
- **Do not copy:** the reasoning line and streamed reasoning (Siterra shows actions and validated outputs); shimmer as the only running cue; Replay implying tool re-execution.
- **Licensing / implementation:** MIT (license API checked). New component: pin the version and test its accessibility claims.

### VIS-09 FireTrace wildfire analysis prototype (Claude post)

- **URL:** https://x.com/claudeai/status/2111177834127601902 (2026-10-16); original creator post https://x.com/DilumSanjaya/status/2108241054298415258 (Dilum Sanjaya, 2026-10-08)
- **Category:** Map and time synchronization.
- **Inspection:** post text and media metadata from the public syndication endpoint (the oEmbed endpoint returned an empty redirect); public 1250×720 MP4 (115 s), ten frames between 2 s and 112 s plus a contact sheet viewed. 2026-10-26.
- **Observed:** The app is titled "FireTrace, Wildfire Forensic Analysis". A bottom timeline has play, pause, step and speed controls, a track spanning several days with typed event markers, and a playhead label riding above the track. Charts beneath (fire area, rate of spread) share the time cursor, and a third (elevation along a selected path) shows a position cursor that moves with playback. Values after the cursor are drawn lighter or dotted rather than hidden. A Key Events list sits beside the charts with timestamps; the current event is highlighted and events carry "(est.)" or "(prob.)". The right panel has Layers, Analysis, Evidence and Notes tabs; layers have opacity sliders and one is labeled "Fire Spread (Modeled)". The incident overview shows a preliminary cause "Under Investigation" and an analysis status "In Progress". Weather values change with the playhead. Switching from 3D to 2D keeps the timeline, layers and charts. Other modes show drone feeds, a thermal view, aircraft resources and a ground-level view.
- **Fit:** The closest single analog to Siterra's map, temporal strip and charts: one playhead drives everything; post-playhead data is ghosted; events are typed and listed; uncertainty labels sit in place, which corresponds to `Evidence.claimKind` `observation` versus `model_estimate`; and the 2D mode demonstrates the planned fallback.
- **Siterra mapping:** temporal strip; geo stage; comparison chart; evidence card / evidence seam.
- **Do not copy:** drones, thermal, resource dispatch and other operational-command views (Siterra implies no real-world authority); the saturated alarm palette; photoreal tree-strewn 3D; ten-layer density; sub-hourly playback (Siterra uses composite periods).
- **Licensing / implementation:** third-party video, rights with the creator; frames kept private. No source code located or checked.

### VIS-10 Astra user-flow review (Mona Biasia post)

- **URL:** https://x.com/mona_biasia/status/2114498844608385404 (2026-10-25)
- **Category:** Agent output review.
- **Inspection:** post metadata from the syndication endpoint; public 1592×1080 MP4 (20.75 s), ten frames plus a contact sheet viewed. 2026-10-26.
- **Observed:** The post proposes having the agent present what it built as a user flow for human review. The video shows a flow titled "New user registration" with the subtitle "iOS · Simulated scenarios" and a light/dark toggle. Decision nodes are phrased as questions; screen nodes carry a title and a one-line state. Edges carry text labels on the line ("Edit and retry", "Submission failed"); failure paths are tinted red, normal paths gray. Clicking a screen opens a full-size preview with a close control. A zoom control shows a percentage and "Fit to screen".
- **Fit:** Supports semantic connectors with the relation written on the line (`Relationship.kind`), and a review step that shows the investigation path including failed or blocked branches. The "Simulated scenarios" header is a model for honest mode labeling (`EnvironmentalCase.mode` replay or concept).
- **Siterra mapping:** semantic connectors; decision brief / review.
- **Do not copy:** a large free pan-and-zoom flow canvas (Siterra shows at most six connections for the selected finding); red as the only failure cue; phone thumbnails.
- **Licensing / implementation:** third-party video; frames private. The product was not otherwise examined.

### VIS-11 Destiny 2 Director (Bungie)

- **URL:** https://www.bungie.net/7/en/News/Article/dev_insights_return_of_the_director (2026-05-28)
- **Category:** Game UI.
- **Inspection:** headless screenshot of the article, including Bungie's Director image; page text. No trailer or gameplay video inspected. 2026-10-26.
- **Observed:** Bungie puts the Director back at the center of play: the Sol system appears as an overview of labeled destinations. The standalone Portal tab (a list-style activity browser) is removed, and a row of icons along the bottom of the Director opens Portal-style sub-screens. The stated motivation includes player feedback and less planning before play. The article does not describe focus or zoom when a destination is selected.
- **Fit (limited):** One structural lesson. After a separate list-first activity screen, the publisher folded those categories back into the spatial hub as sub-screens launched from a fixed rail. That supports keeping geography as Siterra's home, with analyses as subordinate regions rather than a separate dashboard. The hoped-for zoom and focus behavior is unverified, so no camera rule is drawn from it.
- **Siterra mapping:** geo stage; layout composition transition.
- **Do not copy:** cosmic art direction, glowing planet buttons, spatial layouts that are decorative rather than geographic, reward gamification, hover-dependent discovery.
- **Licensing / implementation:** imagery © Bungie; not reusable.

### VIS-12 Star Citizen mobiGlas and ARK Starmap (Roberts Space Industries)

- **URL:** https://robertsspaceindustries.com/en/comm-link/engineering/14466-Design-Notes-MobiGlas (2015-01-31) ; https://robertsspaceindustries.com/starmap
- **Category:** Game UI.
- **Inspection:** page text of the design notes; headless screenshot of the starmap landing; a scripted session reached an "Acknowledge & Continue" screen, which was not clicked, so the starmap itself was not inspected. 2026-10-26.
- **Observed:** The design notes describe AR overlays in the world plus a forearm-projected holo-screen that fills about 95% of the display. Aiming selects an object and sustained attention expands its label; range zones make objects hidden, idle or selectable. The skyLine starmap is a planner that syncs dynamic data from other apps. The web starmap landing recommends full-screen mode.
- **Fit (minimal):** Only the label state model transfers: geo-stage annotations should have explicit states by zoom (hidden, quiet label, selectable with detail on focus), which web maps already support with zoom ranges. Everything else conflicts: a 95% overlay would hide the persistent map, and holographic styling opposes opaque, calm panels.
- **Siterra mapping:** geo stage.
- **Do not copy:** holographic glow, translucent panels over imagery, sci-fi display type, full-screen takeovers, dwell-only interaction.
- **Licensing / implementation:** imagery © Cloud Imperium; not reusable.

## Additional references

### VIS-13 NASA Worldview: layer coverage on the timeline

- **URL:** https://worldview.earthdata.nasa.gov/
- **Category:** Map and time synchronization.
- **Inspection:** headless screenshot (welcome dialog); scripted session closed the dialog and opened the timeline's layer coverage panel; viewed. 2026-10-26.
- **Observed:** The bottom timeline has a date readout whose year, month and day each step, an explicit step interval ("1 DAY"), previous, next and jump-to-latest controls, an animation entry point and a zoomable time axis. The layer coverage panel lists each active layer with its coverage drawn as a bar aligned to the time axis (Terra MODIS reflectance from February 2000 to present), with an option to include hidden layers. The daily mosaic shows black, unfilled swaths between satellite orbits. Each layer in the list carries its sources in small text under its name; "Start Comparison" and "Start Charting" sit beneath the list.
- **Fit:** Draw per-source coverage aligned to the period axis so availability is visible before scrubbing, and show no-data as no-data (`TemporalObservation.mapStatus` `missing`). Attribution under each layer name meets the persistent attribution requirement.
- **Siterra mapping:** temporal strip; geo stage; evidence card / evidence seam.
- **Do not copy:** dense multi-panel chrome; small gray italic attribution (contrast); global mosaic as ground.
- **Licensing / implementation:** Worldview code under the NASA Open Source Agreement 1.3 (LICENSE checked). Imagery through NASA GIBS; NASA citation guidance not re-verified.

### VIS-14 Windy: time bar and unit legend

- **URL:** https://www.windy.com/
- **Category:** Map and time synchronization.
- **Inspection:** headless screenshot of the default view; no interaction tested. 2026-10-26.
- **Observed:** A bottom time bar segmented by day with weekday labels, a play button at its left and a highlighted playhead tag above the track showing the selected hour. Directly below, a continuous color legend with its unit spans the width. A compact multi-day forecast for the selected place sits at the top.
- **Fit:** Placement grammar for the strip: playhead label above the track, plain-language period segments, and the measurement legend (unit and domain) in the same band so the encoding stays visible while scrubbing.
- **Siterra mapping:** temporal strip.
- **Do not copy:** the rainbow scale; full-bleed color fields; continuous animation of forecast fields (Siterra's observations are discrete composites); upsell strips.
- **Licensing / implementation:** proprietary. The private capture shows location-based content and stays private.

### VIS-15 Global Nature Watch map (formerly Global Forest Watch)

- **URL:** https://www.globalforestwatch.org/map/ (the page banner announces the new Global Nature Watch name)
- **Category:** Map and time synchronization.
- **Inspection:** headless screenshot (welcome dialog); scripted session clicked close controls, which dismissed the dialog and banner and also removed one legend layer and opened the imagery picker in that local session; viewed. 2026-10-26.
- **Observed:** Each legend card has its own time control (tree cover gain with a baseline-year slider; tree cover loss 2001–2025 with play), an info button, visibility and removal. The legend states the threshold in use (loss shown above 30% canopy density). The imagery picker gives each source a one-line freshness or resolution note (for example imagery 1–3 years old) and keeps an unavailable source listed with a plain explanation and a feedback request.
- **Fit:** Parameters that change meaning (thresholds, baselines) belong in the legend beside the encoding. Unavailable sources stay visible with a reason, matching `Source.accessStatus` `unavailable` as a useful blocked state. Per-layer time controls are a caution: Siterra has one committed period, so legend cards display time rather than control it.
- **Siterra mapping:** evidence card / evidence seam; temporal strip; geo stage.
- **Do not copy:** independent per-layer sliders; the saturated pink and blue loss/gain palette; stacked onboarding dialogs.
- **Licensing / implementation:** platform proprietary; datasets carry their own licenses (not verified here).

### VIS-16 Copernicus Browser: timelapse frame curation

- **URL:** https://browser.dataspace.copernicus.eu/ ; https://documentation.dataspace.copernicus.eu/Applications/Browser.html
- **Category:** Map and time synchronization.
- **Inspection:** headless screenshot of the app landing, where a dialog offers sign-in or anonymous use that consents to reCAPTCHA cookies; neither was chosen, so the app was not used. Page text and a scripted capture of the official documentation's timelapse section (analytics prompt left unanswered); the documentation figure was viewed. 2026-10-26.
- **Observed:** Visualize preselects a maximum cloud coverage of 30%. The timelapse takes a date range and one image per orbit, day, week, month or year, or selected months; it has minimum tile coverage and maximum cloud coverage sliders; it lists candidate acquisitions, each with date, coverage and cloud cover, individually selectable. The walkthrough tells users to deselect a slightly cloudy and a blurry date. Playback has speed and transition settings and a frame counter, and the date is stamped on the frame; export is GIF or MP4. Compare offers split and opacity modes. The documentation says the Browser currently requires a free account.
- **Fit:** The model for NDVI composites in the strip: each period shows its quality metadata; excluded frames stay listed as excluded with a reason (`TemporalObservation.mapStatus` `excluded`); the visible frame always carries its date. Split and opacity correspond to `comparisonMode` `two_period`.
- **Siterra mapping:** temporal strip; geo stage; evidence card / evidence seam.
- **Do not copy:** an animated GIF as the deliverable; unrecorded manual exclusions (Siterra logs why as provenance); the dense form panel.
- **Licensing / implementation:** Sentinel data fall under the Copernicus free and open data policy (exact attribution wording to confirm). The Browser is a service, not a reusable component.

### VIS-17 swisstopo map viewer: relief and Journey through time

- **URL:** https://map.geo.admin.ch/ (layer `ch.swisstopo.zeitreihen`, "Journey through time - Maps")
- **Category:** Relief cartography; time selection.
- **Inspection:** headless screenshot of the default map; scripted session loading the Journey through time layer by URL and opening its year selector; viewed. 2026-10-26.
- **Observed:** The default map renders soft gray relief under blue hydrography and restrained linework, with flat valley floors kept light. The Journey through time layer shows a dated historical edition (1864); its year badge opens a "Select a year" grid listing only edition years rather than a continuous slider.
- **Fit:** Neutral relief under sparse color is the calm mineral ground Siterra wants, inverted for a dark theme. A discrete picker of periods that exist is the honest alternative to a continuous slider when observations are sparse.
- **Siterra mapping:** geo stage; temporal strip.
- **Do not copy:** Swiss symbology and dense labels; the light theme as is.
- **Licensing / implementation:** Swiss coverage only; technique reference. Data © swisstopo as displayed.

### VIS-18 Eduard: Swiss-style relief controls

- **URL:** https://eduard.earth/
- **Category:** Relief cartography.
- **Inspection:** headless screenshot of the product page, including its app screenshot; viewed. 2026-10-26.
- **Observed:** The page presents a relief shading app for Swiss-style shaded relief. Its screenshot shows controls for illumination direction, generalization (macro and micro), terrain type (flat to mountainous) and flat-area detail (amount and size), with layers named aerial perspective and manual shading. A macOS app with a demo that lacks import and export.
- **Fit:** Names the knobs that make relief calm: generalize micro-relief, quiet the flat valley floors where pasture parcels and annotations sit, and use aerial perspective so ridges carry more contrast than valley bottoms. Use as an offline preprocessing tool or as the target look when tuning MapLibre hillshade.
- **Siterra mapping:** geo stage.
- **Do not copy:** the light paper look directly; claiming a Swiss style without a cartographer's review.
- **Licensing / implementation:** commercial macOS app; check its license before publishing exported relief. DEM input licenses apply separately.

### VIS-19 Natural Earth cross-blended hypsometric tints (Tom Patterson)

- **URL:** https://www.naturalearthdata.com/downloads/10m-raster-data/10m-cross-blend-hypso/ ; terms https://www.naturalearthdata.com/about/terms-of-use/
- **Category:** Relief cartography.
- **Inspection:** headless screenshot of the product page; page text of the terms. Tom Patterson's shadedrelief.com was not inspected (see access log); Natural Earth, which he co-authors with Nathaniel Vaughn Kelso, was used instead. 2026-10-26.
- **Observed:** The page explains that conventional elevation tints (green lowlands, yellow and red highlands) are often misread as vegetation or climate; cross-blended tints use region-appropriate colors, such as dusty brown for deserts, blending across regions and from lowland to highland. Thumbnails show Iberia and the Maghreb in muted tan and gray-green. The terms place all Natural Earth data in the public domain.
- **Fit:** A direct warning for Siterra: vegetation indices carry green semantics, so the terrain base must not use green elevation tints a reader could take for vegetation. Keep the High Atlas ground mineral and reserve green for measured vegetation encodings.
- **Siterra mapping:** geo stage.
- **Do not copy:** 1:10m rasters at valley scale (too coarse); bright water blues.
- **Licensing / implementation:** public domain (terms checked); usable for regional context if resolution suffices.

### VIS-20 Reuters: "How Europe's emptying countryside is fuelling a new wildfire crisis"

- **URL:** https://www.reuters.com/graphics/EUROPE-WEATHER/WILDFIRE-LAND/lgpdbgknrpo/ (Kate Abnett, Pietro Lombardi and Mariano Zafra; byline date Oct. 22, 2026)
- **Category:** Editorial linked map and chart storytelling.
- **Inspection:** scripted session capturing viewport screenshots while scrolling (a first tall capture did not trigger the scroll steps and was discarded); seven kept and viewed. 2026-10-26.
- **Observed:** Illustrated landscape scenes carry two to four sparse labels per step, with a text card anchored over the scene. A then/now aerial split prints the years at the seam (2026 over 1956–57) with feature labels. A dark hillshade map shows data only inside the fire perimeter (existing versus new forest) with one on-map statistic, a locator inset and a scale bar. Under the map, a note defines the classes, names the dataset and its vintage (CORINE Land Cover 1990 and 2018, the latest available) and the source. An inline fire timeline control appears within the text.
- **Fit:** The geo-stage language Siterra wants: dark relief, analysis clipped to the study geometry with context dimmed, a two-class legend, and a definitional note directly under the graphic. The year-at-the-seam split models `two_period` comparison. The theme (land abandonment, declining grazing, vegetation change) is a close neighbor.
- **Siterra mapping:** geo stage; comparison chart; evidence card / evidence seam.
- **Do not copy:** illustrated vignettes (depicting conditions that were not observed); narrative causal certainty (`supports` is not proof); scrollytelling as primary navigation.
- **Licensing / implementation:** © Reuters; principles only.

### VIS-21 Reuters: "How drought and demand pushed the Colorado River toward crisis"

- **URL:** https://www.reuters.com/graphics/USA-ENVIRONMENT/COLORADO-RIVER/znpngebyxvl/ (published 2026-09-11)
- **Category:** Editorial linked map and chart storytelling.
- **Inspection:** scripted session capturing scrolled viewport screenshots; six kept and viewed. 2026-10-26.
- **Observed:** Allocation flows split a river total into labeled state shares. A bar chart headed as an over-promise compares the allocation basis (16.4 million acre-feet, from wet-year measurements in 1905–1922) with later averages (14.6 and 12.4), drawing each shortfall as a hatched region up to a dotted reference line labeled −11% and −24%. A basin map with an inset locates the reservoirs. Another chart marks deficit water years with an annotation, and small multiples show reservoir levels by year. Notes and sources sit beneath.
- **Fit:** A concrete encoding for livelihood constraints: the requirement or allocation as a reference line, the observed or available amount as the mark, the gap hatched and labeled, and the basis of the reference stated in the dek. Small multiples by unit avoid dual axes.
- **Siterra mapping:** livelihood constraints; comparison chart; intervention comparison.
- **Do not copy:** decorative wave illustrations; deficits without uncertainty (carry `ResourceRequirement.estimateStatus`); certainty about allocation numbers Siterra does not have.
- **Licensing / implementation:** © Reuters; principles only.

### VIS-22 Langfuse trace view

- **URL:** https://langfuse.com/docs/observability/overview
- **Category:** Agent observability.
- **Inspection:** headless screenshot of the docs page with its embedded trace UI image (cookie banner left unanswered); image region cropped and viewed. 2026-10-26.
- **Observed:** A trace list with filters and a histogram of trace counts over time. A trace detail panel shows a nested span tree with a duration per span; the selected span header lists latency, session, user, environment and release; tabs for preview, scores and log view; input and output panels; actions to add to a dataset, annotate and comment.
- **Fit:** Trace inspector layout: span tree with durations on the left, selected step detail on the right, header metadata, and annotation of a step, which maps to reviewer notes tied to a span.
- **Siterra mapping:** trace inspector.
- **Do not copy:** raw JSON as primary content; user and session identifiers in view; cost and token metrics as headline.
- **Licensing / implementation:** MIT (Expat) except enterprise directories (LICENSE checked). Siterra can emit its own spans without adopting the product.

### VIS-23 Arize Phoenix trace view

- **URL:** https://arize.com/docs/phoenix/tracing/llm-traces
- **Category:** Agent observability.
- **Inspection:** headless screenshot of the docs page with its embedded trace screenshot (cookie dialog left unanswered); cropped and viewed. 2026-10-26.
- **Observed:** Trace Details opens with a header summary: trace status, latency and evaluation labels (a hallucination check marked factual, a QA correctness check marked correct). On the left, an indented span tree with kinds and durations; on the right, the selected span with info, feedback, attributes and events tabs and a metadata rail (status, start, end, latency, total tokens); system and user messages render as cards.
- **Fit:** Evaluation outcomes at the trace header is the pattern for showing `Provenance.verificationStatus` and `ReviewDecision.status` on the trace summary instead of burying them in spans.
- **Siterra mapping:** trace inspector; decision brief / review.
- **Do not copy:** system prompts and raw messages shown to reviewers; color-only span kinds; token counts.
- **Licensing / implementation:** Elastic License 2.0 (LICENSE checked), not an OSI open-source license; review its terms before embedding.

### VIS-24 OpenAI Agents SDK tracing

- **URL:** https://openai.github.io/openai-agents-python/tracing/
- **Category:** Agent observability.
- **Inspection:** headless screenshot; page text. The hosted Traces dashboard requires sign-in and was not inspected. 2026-10-26.
- **Observed:** A trace (workflow name, trace ID, optional group ID linking a conversation, metadata) contains spans with start and end times, a parent ID and span data. Default span types include agent, generation, function (tool), guardrail and handoff, plus task, turn and custom spans. Setting `trace_include_sensitive_data` to false omits model and tool inputs and outputs. The docs state tracing is unavailable to organizations under Zero Data Retention.
- **Fit:** A span taxonomy for the trace inspector: label nodes by kind (plan, source research, tool call, validation, handoff), default to redacted inputs and outputs in shared views, and use the case ID as the group key.
- **Siterra mapping:** trace inspector; firm activity.
- **Do not copy:** reliance on a hosted dashboard (Siterra keeps its own checkpoints); SDK names inside Siterra's schema.
- **Licensing / implementation:** SDK under MIT (license API checked). Siterra's provider differs; adopt the taxonomy, not the exporter.

### VIS-25 Vercel Geist: materials

- **URL:** https://vercel.com/geist/introduction ; https://vercel.com/geist/materials
- **Category:** Precise professional UI.
- **Inspection:** headless screenshots of both pages; viewed. 2026-10-26.
- **Observed:** Materials are named presets for radii, fills, strokes and shadows in two groups. Surface sits on the page: base and small at 6 px radius, medium and large at 12 px. Floating sits above it: the tooltip has the lightest shadow and is the only floating element with a stem; the menu lifts from the page at 12 px. Further levels below the fold were not inspected.
- **Fit:** Siterra already fixes radii (12, 8, 4) and limits shadows to overlays. Codify these as a closed set of named materials (surface, raised, overlay, tooltip) so neither implementers nor generated layouts invent elevation.
- **Siterra mapping:** evidence card / evidence seam; director command bar.
- **Do not copy:** Geist typefaces (Siterra plans IBM Plex); Vercel's black-and-white brand extremes.
- **Licensing / implementation:** Geist font OFL-1.1 (license API checked); documentation proprietary.

### VIS-26 visionOS ornaments (Apple Human Interface Guidelines)

- **URL:** https://developer.apple.com/design/human-interface-guidelines/ornaments
- **Category:** Spatial OS.
- **Inspection:** headless screenshot; viewed. 2026-10-26.
- **Observed:** An ornament presents controls or information related to a window without crowding its contents. It sits in a plane parallel to and slightly in front of the window, moves with the window and does not scroll with its content. Guidance: use it for frequently needed controls in a consistent location, generally keep it visible, limit the number, keep it no wider than its window.
- **Fit:** Placement rules for the director and the temporal strip: attach each to the edge of the region it controls, keep it fixed while content scrolls, never wider than that region, and allow only these two persistent attachments.
- **Siterra mapping:** director command bar; temporal strip.
- **Do not copy:** glass backgrounds (Siterra panels are opaque); gaze hover effects; spatial depth.
- **Licensing / implementation:** Apple guidance; no assets used.

### VIS-27 Rauno Freiberg: "Invisible Details of Interaction Design"

- **URL:** https://rauno.me/craft/interaction-design (July 2023)
- **Category:** Motion craft.
- **Inspection:** headless screenshot of the opening; page text of selected sections. 2026-10-26.
- **Observed:** Sections cover spatial consistency (things open from and return to where they came from), fluid morphing, kinetic physics (momentum carried through a gesture) and frequency and novelty: frequently used actions such as command menus feel better without animation, and removing animation from a frequently used tool made it feel faster.
- **Fit:** A rule for when not to animate. Opening the director, stepping the period and toggling the inspector are frequent and should be instant beyond the 120 ms feedback; motion is reserved for rare composition changes and the single arrival fly-in; the inspector opens from the selected item.
- **Siterra mapping:** director command bar; focus transition; layout composition transition.
- **Do not copy:** gesture physics and mobile swipe metaphors in a desktop analytical tool.
- **Licensing / implementation:** © the author; principles only.

### VIS-28 GitHub pull request review

- **URL:** https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/reviewing-changes-in-pull-requests/reviewing-proposed-changes-in-a-pull-request
- **Category:** Decision and review interface.
- **Inspection:** headless screenshot; page text. 2026-10-26.
- **Observed:** Comments attach to a line, a range or a whole file and stay pending, visible only to the reviewer, until the review is submitted. A review ends as Comment, Approve or Request changes; Request changes blocks merging only if a rule requires it. Marking a file Viewed collapses it and advances a progress bar; the mark clears if the file changes later. Suggested changes can be committed by the author.
- **Fit:** Role-specific review for Siterra: comments anchor to evidence IDs and revisions; per-item reviewed marks clear when the evidence revision changes (`Evidence.status` `stale`); a review is submitted once with an explicit `ReviewDecision.status`; required-role enforcement lives on the server, not in the button.
- **Siterra mapping:** decision brief / review; evidence card / evidence seam; operational action.
- **Do not copy:** code-diff density; merge language that implies execution.
- **Licensing / implementation:** documentation; pattern only.

### VIS-29 Linear Triage

- **URL:** https://linear.app/docs/triage
- **Category:** Decision and review interface.
- **Inspection:** headless screenshot; page text. 2026-10-26.
- **Observed:** A team inbox for items created by integrations or outsiders, reviewed before entering the workflow. Actions with single-key shortcuts: accept (optional comment), decline (optional explanatory comment, moves to canceled), mark as duplicate (merges attachments into the chosen item), snooze (hidden until a chosen time or until new activity). Triage Intelligence suggests properties and likely duplicates.
- **Fit:** Agent proposals (hypotheses, interventions, layout suggestions) land in a review queue with four verbs: accept, decline with a reason, merge as duplicate, defer until new evidence. These map to `Hypothesis.status`, `Intervention.status` and `ReviewDecision.status` `deferred`.
- **Siterra mapping:** hypothesis ledger; decision brief / review; intervention comparison.
- **Do not copy:** auto-applied suggestions; shortcut-only discoverability (show labeled buttons with key hints).
- **Licensing / implementation:** proprietary; pattern only.

## Cinematic and game map references (second pass, inspected 2026-10-27)

Added after the founder rejected the restraint-first v2 visuals and asked for the language of holographic annotated map scenes from films and games. Inspection method for all five: live view in a desktop browser pane (frames viewed, not saved), plus the production sources named.

### VIS-30 Avatar (2009) Ops Center holotable

- **URL:** https://www.hudsandguis.com/home/2011/01/16/the-design-of-avatar ; production notes https://www.postmagazine.com/Press-Center/Daily-News/2009/PRIME-FOCUS-CONTRIBUTES-TO-AVATAR.aspx and https://www.cgw.com/Press-Center/Web-Exclusives/2009/Prime-Focus-Adds-Graphic-Dimension-to-Avatar.aspx
- **Category:** Film map hologram.
- **Observed:** A terrain model projected over a physical table, viewed obliquely by people standing around it; hexagonal outlines float above terrain points; thin angular leader lines run from features to floating label plates. Prime Focus describes the projections as particle-based to mimic LIDAR mapping, with up to eight composited layers per display.
- **Fit:** The valley as a model seen from above at an angle, with annotations standing in space rather than in a side panel; the particle and layering approach suggests drawing the terrain as line work or points instead of a photographic basemap.
- **Siterra mapping:** geo stage; evidence markers on stems; arrival.
- **Do not copy:** the saturated green and yellow palette, military mining context, glass-screen clutter.
- **Licensing / implementation:** film frames, rights with the studio; nothing kept.

### VIS-31 Top Gun: Maverick (2022) Tactical Auditorium maps

- **URL:** https://gmunk.com/Top-Gun-Maverick
- **Category:** Film briefing map.
- **Observed:** Maps and schematics in white and grey line work on black, coastlines as fine glowing lines, range rings around a target, one warm accent line for the route, and terrain rendered as glowing points along ridges; text is sparse and small. The studio notes the maps were revised into a 3D schematic for the film.
- **Fit:** Monochrome line work with a single accent reads as precise and cinematic at once; points along ridges show relief without a basemap.
- **Siterra mapping:** geo stage line work; contours; arrival.
- **Do not copy:** lens flares and bloom at the strength shown, weapons and targeting language.
- **Licensing / implementation:** studio case-study images; nothing kept.

### VIS-32 Death Stranding (2019) map table and wrist projection

- **URL:** https://interfaceingame.com/screenshots/death-stranding-world-map/ and https://interfaceingame.com/screenshots/death-stranding-map/
- **Category:** Game map hologram.
- **Observed:** The world map is a hologram table that characters stand around; status markers are rings standing on vertical stems above their locations, and each state pairs a ring style and color with a short word (white for connect, red for refused); the coastline is a bright edge. In the field, a route-finder map is projected from the character's wrist device.
- **Fit:** Evidence markers that stand on the land with state shown by ring style, color and a word, which keeps state readable without color alone; the map as an object people gather around.
- **Siterra mapping:** evidence markers; geo stage; review of where evidence applies.
- **Do not copy:** the green hologram cast, game iconography, red as the only problem color.
- **Licensing / implementation:** game screenshots hosted by a UI gallery; nothing kept.

### VIS-33 Alan Wake 2 (2023) case board

- **URL:** https://interfaceingame.com/screenshots/alan-wake-ii-case-board/ ; design interview https://www.gamedeveloper.com/design/true-detective-meets-hearthstone-the-unlikely-inspirations-behind-alan-wake-ii-s-metaphyiscal-mind-place
- **Category:** Game investigation board.
- **Observed:** A board under a spotlight; each question is a note card at the head of a row (for example victim, murder method) with its evidence photos pinned beside it; strings link question and evidence; a case folder sits to the left; chrome is reduced to two key hints. The developers describe the board as the visible form of the detective's reasoning.
- **Fit:** The hypothesis ledger as a board: one row per explanation, evidence pinned as supporting, contradicting or missing, the same evidence serving several rows, and empty frames for evidence nobody has collected. A pannable board is the honest form of the infinite canvas for Siterra.
- **Siterra mapping:** case board view; hypothesis ledger; drought challenge.
- **Do not copy:** handwriting, red string, horror styling, polaroid skeuomorphism.
- **Licensing / implementation:** game screenshot hosted by a UI gallery; nothing kept.

### VIS-34 Black Panther (2018) vibranium sand, Perception

- **URL:** https://hudsandguis.com/home/2019/black-panther ; studio work https://www.experienceperception.com/work/black-panther-wakanda-forever-technology/
- **Category:** Film interface concept.
- **Observed:** Perception built the interfaces of Wakanda from one material, vibranium sand inspired by acoustic levitation research, so the navigation table, holograms and displays share one behavior; the article credits that overarching concept with the cohesion of the whole set.
- **Fit:** Siterra needs one governing concept that every interface derives from; for a mountain valley under investigation the material is the field survey (contours, stakes, transects, scanning light).
- **Siterra mapping:** design direction as a whole.
- **Do not copy:** the sand material itself, Wakandan visual culture.
- **Licensing / implementation:** article and studio pages; nothing kept.

## Seed reference verdicts

| Seed | Verdict | What transfers | What does not |
|---|---|---|---|
| Magic Patterns (VIS-01) | Transfers in part | status-grouped threads, routed feedback, live transcript | infinite canvas |
| tldraw agent kit (VIS-02) | Transfers in part | explicit context, atomic per-action application | canvas, license burden |
| Linear refresh (VIS-03) | Transfers | receding chrome, fewer separators, fixed header slots | near-black chrome |
| MapLibre (VIS-04) | Transfers; core engine | terrain, hillshade, fog, color relief, reduced-motion flag | demo tiles, example ramps |
| Mapbox (VIS-05) | Concepts only | layer slots, monochrome posture | proprietary SDK and token |
| Observable (VIS-06) | Transfers | gap semantics, time crosshair, chart with table | notebook UI |
| Motion (VIS-07) | Transfers | layout and shared-element transitions | flourish |
| shadcn/ui (VIS-08) | Transfers | one line grammar for agent steps | reasoning display |
| Claude wildfire post (VIS-09) | Transfers; strongest analog | one playhead for map, charts and events | operational views, alarm palette |
| Mona Biasia post (VIS-10) | Transfers in part | labeled edges, failure paths, simulated label | flow canvas |
| Destiny 2 (VIS-11) | Weak | spatial hub with sub-screens from a rail | art direction; zoom behavior unverified |
| Star Citizen (VIS-12) | Minimal | label states by distance or zoom | holographic overlays, full-screen takeover |

Revised on 2026-10-27: the founder reinstated holographic map language as the direction; VIS-30 to VIS-34 record what transfers from film and game map scenes, and the verdicts above on holographic overlays no longer stand.

## Access log

- **shadedrelief.com:** Cloudflare human verification in both headless and live browser; not completed by policy; not inspected. VIS-19 substitutes.
- **Bloomberg, "What's Really Warming the World"** (https://www.bloomberg.com/graphics/2015-whats-warming-the-world/): served a bot-check page; not inspected. It was sought as a hypothesis-versus-observation chart reference.
- **Copernicus Browser app:** sign-in or cookie-consenting anonymous use required; neither chosen. Documentation used (VIS-16).
- **RSI ARK Starmap:** acknowledgment screen not clicked; starmap not inspected (VIS-12).
- **OpenAI Traces dashboard:** sign-in required; not inspected (VIS-24).
- **X oEmbed endpoint:** empty redirect; syndication metadata and public MP4 variants used (VIS-09, VIS-10).
- **Observable Plot docs site:** text fetch rate-limited (HTTP 429); docs source read on GitHub (VIS-06).
- **MapLibre multidirectional hillshade and color relief:** blank in headless rendering; inspected live, no capture saved (VIS-04).
- **Kepler.gl demo:** opens a data-loading dialog; not pursued and not included.
- **Bungie weekly update of 2025-07-24:** text not extractable; not used. No official Destiny 2 trailer inspected.

## Coverage gaps

- No inspected reference shows an intervention comparison that holds effect, uncertainty and livelihood trade-offs together; VIS-21 and VIS-29 are partial.
- No reference shows a role-specific decision brief; VIS-28, VIS-23 and VIS-10 are partial.
- Camera fly-in: only API semantics were verified (VIS-04, VIS-05), not a reference choreography.

## Synthesis

Design rules supported by the references above. They are judgments drawn from inspected behavior, not user-tested results.

1. Show where observations exist before anyone scrubs. The temporal strip draws per-source coverage aligned to the period axis, makes only observed periods selectable, shows quality metadata per period (coverage, cloud), and renders missing or excluded periods as visible gaps with a reason. Never connect a line across a gap. (VIS-13, VIS-16, VIS-17, VIS-06, VIS-09)
2. One committed period drives every view. Map layer, chart cursor, legend and key events read the same period. In time series, data after the playhead is ghosted rather than hidden. The playhead label rides above the track and the unit legend shares the strip. (VIS-09, VIS-14, VIS-06, VIS-13)
3. Mineral ground, measured color. The relief base is neutral and generalized (multidirectional light with muted highlight and shadow, quiet valley floors, fog for depth) and never green-tinted. The basemap stays monochrome so only measured encodings carry hue, and analysis appears only inside the study geometry with context dimmed. (VIS-19, VIS-17, VIS-18, VIS-04, VIS-05, VIS-20)
4. Every graphic carries its method line. Directly under each map or chart: class definitions, dataset and vintage, thresholds and source. Modeled or estimated values are labeled in place, and unavailable sources stay listed with a reason. (VIS-20, VIS-21, VIS-15, VIS-09, VIS-13)
5. Compare against a stated reference on shared axes. Shortfalls are hatched gaps to a dotted reference whose basis is stated. Two-period comparisons print both dates at the seam. Use small multiples, not dual axes. (VIS-21, VIS-20, VIS-16, VIS-06)
6. One line grammar for agent work, grouped by who must act. Firm activity groups tasks as needs-you, running and done, with counts. Each line has an icon, a plain title, a text status, a one-line outcome and evidence IDs. Expanding reveals nested spans with kinds and durations, and failures show inline with a reason. Inputs and outputs are redacted by default, and model reasoning is never shown. (VIS-01, VIS-08, VIS-22, VIS-23, VIS-24, VIS-02)
7. Apply agent output atomically, with visible context. A layout or evidence change applies only when the whole action is complete and validated. Before submitting, the user sees exactly which geography, period and focused component the director will use. Follow-up feedback routes to the task that produced the artifact. (VIS-02, VIS-01)
8. Animate rarely and from the source. Frequent actions (director, period step, inspector toggle) are instant. Composition changes use transform-based layout transitions, and the inspector grows from the selected item. Camera fly-ins are non-essential so reduced motion skips them. Under reduced motion, also remove the crossfades the motion library keeps by default. (VIS-27, VIS-07, VIS-04, VIS-05, VIS-03)
9. Chrome recedes; controls attach to what they control. Navigation dims once the user is oriented, and separators are few. The director and the temporal strip attach to the edge of their region, stay fixed while content scrolls and are never wider than that region. Surfaces and overlays come from a closed set of named materials. (VIS-03, VIS-26, VIS-25, VIS-11)
10. Review is explicit, batched and revision-aware. Comments anchor to evidence IDs and revisions and stay pending until submitted, and reviewed marks clear when a revision changes. Outcomes use a few explicit verbs: approve, request changes, decline with a reason, merge a duplicate, defer until new evidence. The investigation path appears as a bounded flow with labeled edges, failed branches included, under an honest mode label. (VIS-28, VIS-29, VIS-10, VIS-23)
