# Design

Original, conceptual design work for Siterra. Nothing here is production code or measured data: every vegetation value is illustrative and tagged as such, and every agent run is simulated. The relief, the catchment outline, the rainfall grid and place labels are real. Published-context statements cite real sources from the [science source register](../research/science/source-register.md). Specifications win over pictures: when a design file disagrees with the [UX architecture](../docs/reference/ux-architecture.md), [components](../docs/reference/components.md), [design system](../docs/reference/design-system.md), [voice and tone](../docs/reference/voice-and-tone.md) or [motion](../docs/reference/motion.md), follow the document.

| Folder | Contents | Use it for |
|---|---|---|
| [tokens/](tokens/) | `siterra.tokens.json` (DTCG 2025.10: base scales plus the computed dark and light themes), `siterra.css` (generated from the tokens; do not edit by hand), `contrast-report.json` (WCAG and APCA for every role) | Generating the Tailwind theme and checking contrast |
| [prototype/](prototype/index.html) | Interactive concept prototype: floating islands over the real relief, scenes 1 to 11, views and tours, light and dark themes, a visual budget overlay; screenshots in `prototype/screenshots/` | Visual direction, density, behavior and copy |
| [wireframes/](wireframes/index.html) | Annotated grayscale frames for the island layout with budget counts per frame; PNG exports in `wireframes/frames/` | Layout, regions, component placement |
| [component-gallery/](component-gallery/index.html) | Components CMP-01 to CMP-22 with their states in both themes, rendered by the prototype's own renderers; screenshot in `component-gallery/screenshots/` | Component states and details |
| [motion/](motion/index.html) | Keyframes and timing for MOT-01 to MOT-13; PNG exports in `motion/frames/` | Implementing the motion specifications |
| `private/` (ignored) | Third-party captures and the private reference board | Local reference only; never commit or publish |

## Run the prototype

Serve the repository root over local HTTP, for example `python3 -m http.server 8000`, and open `http://localhost:8000/design/prototype/` in a current desktop browser with WebGL2 and internet access. Opening from disk is untested.

| Parameter (query or hash) | Effect |
|---|---|
| `scene=1` to `scene=11` | Opens a scene of the [experience storyboard](../docs/reference/experience-storyboard.md) |
| `view=overview`, `across`, `along`, `orbit` | Opens a computed view or tour ([scenes and views](../docs/reference/scenes.md)) |
| `theme=light` or `theme=dark` | Selects the theme; the case pill menu also switches it |
| `budget=1` | Shows the visual budget overlay; `window.__siterraBudget()` returns the counts |
| `period=2022-04`, `inspect=<evidence id>`, `trace=open`, `focus=1`, `matrix=1` | Opens a period, the inspector, the trace, focus mode or the evidence matrix |
| `rm=1` | Simulates reduced motion |
| `shot=1` | Disables animation for screenshots and sets `window.__siterraIdle` when the map is idle |

## Third-party material

The prototype loads MapLibre GL JS 6.14.0 (BSD-3-Clause) from unpkg, Observable Plot 0.6.17 (ISC) and d3 7.9.0 (ISC) from jsDelivr, IBM Plex fonts (SIL OFL 1.1) from Google Fonts, and terrain tiles from Mapterhorn (Copernicus WorldDEM-30 and GLO-30 attribution shown on the map). Place labels come from OpenStreetMap (ODbL attribution shown on the map). The light-theme NDVI ramp uses the published cmocean "speed" colormap (MIT license). The production app self-hosts its map assets and fonts ([map assets](../research/technology/map-assets.md)). AffectUI Pro components were studied for patterns only; no Pro code is in this repository ([ADR-0044](../docs/decisions/0044-build-the-interface-on-shadcn-with-base-ui-and-mit-components.md)).
