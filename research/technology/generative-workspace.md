# Generative workspace: interaction architecture research

Status: research and recommendation, checked 2026-10-26. Public research notes with no credentials or account details. Nothing was installed, run, deployed or purchased, and no account was created. Sources were read as public documentation pages and as source files fetched from public GitHub repositories at their default branch on the check date. The recommendation is aligned with [UX architecture](../../docs/reference/ux-architecture.md), [components](../../docs/reference/components.md), [motion](../../docs/reference/motion.md), [Agent orchestration](../../docs/reference/agent-orchestration.md), [Data contracts](../../docs/reference/data-contracts.md) and [case.schema.json](../../schemas/case.schema.json) 1.2.0 as they stood at the end of the check on 2026-10-26; those documents changed while this research was in progress.

Labels: **Verified** means read in the cited source. **Judgment** means an engineering or design assessment. **Not verified** means this work did not establish it. Everything under "Recommended composition model" is a design recommendation, not a tested implementation.

## Findings and recommendations

1. tldraw stays out; ADR-0020 is confirmed. On an unlicensed production host the SDK stops rendering the editor five seconds after load, and the agent kit's core mechanics (model-written coordinates, live application of partial actions, screenshot context, a browser-side agent loop) are the ones Siterra's contracts prohibit. See finding 1.
2. Composition. Keep the five `LayoutAction` verbs already in the schema (`show_component`, `update_component`, `set_comparison`, `focus_entity`, `hide_component`). The model proposes typed actions that name a catalog kind, record IDs, a section, a comparison mode and an optional title. The server validates the whole proposal against the catalog and the case, binds exact entity revisions, and a deterministic reducer writes `CanvasComponent` revisions and `LayoutAction` records. Placement, size, expansion, camera, map layers and animation are never model inputs. A rejected or missing proposal falls back to the default projection by task kind, with no repair round.
3. Updates. Records are replaced by key `(id, revision)`, driven by the gapless event sequence and consistent snapshots. No JSON Patch on the wire. Partial tool arguments never reach the workspace.
4. Connectors. P0: highlight related records and list relations as text. P1: one custom SVG overlay (`pointer-events: none`, `aria-hidden`) fed by an anchor registry, `getBoundingClientRect`, `ResizeObserver` and MapLibre `project`. Not React Flow, not leader-line.
5. Layout motion. Motion `layout` animations inside the investigation column only. The map stays full-bleed and only its camera padding changes. No View Transitions in P0.
6. Schema. `Relationship.fromEntityRevision` and `toEntityRevision`, `CanvasComponent.entityVersions`, 60-character titles and two `ValidationResult` issue codes were proposed here and adopted in schema 1.2.0 during the check; uniqueness and per-verb `if`/`then` conditions remain open. See "Proposed schema changes".

## Sources inspected

| ID | Source | Material inspected | Version or date seen |
|---|---|---|---|
| GW-01 | [tldraw agent template](https://github.com/tldraw/tldraw/tree/main/templates/agent) | README, LICENSE.md, package.json and every `.ts`/`.tsx` file except icons: action schemas and registry, response schema builder, action utils, prompt parts, agent and action managers, worker service, partial JSON parser, stream route, model list | `main`; last template commit 2026-09-30 |
| GW-02 | [tldraw agent starter kit page](https://tldraw.dev/starter-kits/agent) | Page text | 2026-10-26 |
| GW-03 | tldraw SDK license | Root [LICENSE.md](https://github.com/tldraw/tldraw/blob/main/LICENSE.md) (last changed 2025-09-17 in the 4.0 license change); `packages/editor/src/lib/license/LicenseProvider.tsx` and `LicenseManager.ts`; [license key page](https://tldraw.dev/sdk-features/license-key) | latest release v5.5.2 (2026-10-02) |
| GW-04 | tldraw shapes and camera | `ShapeUtil.ts`, `Editor.ts`; [shapes](https://tldraw.dev/docs/shapes) and [camera](https://tldraw.dev/sdk-features/camera) pages | `main` |
| GW-05 | [Magic Patterns docs](https://www.magicpatterns.com/docs/llms.txt) | Index; MagicOS overview, when to use, quickstart, canvas and files, agents and threads; what is a design; API v3 design status, version list, create artifact | 2026-10-26; docs only, product not used |
| GW-06 | [A2UI](https://github.com/a2ui-project/a2ui) (the `google/A2UI` path now resolves here) | README status; `specification/v0_9_1/docs/a2ui_protocol.md`; `specification/v1_0/README.md` | v0.9.1 current, v1.0 release candidate |
| GW-07 | [AG-UI](https://github.com/ag-ui-protocol/ag-ui) | `docs/concepts/events.mdx`, `state.mdx`, `generative-ui-specs.mdx` | release tag `release/2026-10-21` |
| GW-08 | [MCP Apps](https://github.com/modelcontextprotocol/ext-apps); [MCP-UI](https://github.com/MCP-UI-Org/mcp-ui) README | `specification/2026-01-26/apps.mdx` (SEP-1865), README | spec status Stable (2026-01-26); SDK v2.0.3 (2026-09-25) |
| GW-09 | [MCP Apps in ChatGPT](https://developers.openai.com/apps-sdk/mcp-apps-in-chatgpt/) | Page text | 2026-10-26 |
| GW-10 | [Vercel AI SDK](https://github.com/vercel/ai) docs source | `04-ai-sdk-ui/04-generative-user-interfaces.mdx`, `20-streaming-data.mdx`, `03-chatbot-tool-usage.mdx`; `05-ai-sdk-rsc/index.mdx` | `ai@7.0.154` (2026-10-26) |
| GW-11 | [json-render](https://github.com/vercel-labs/json-render) | README; `packages/core/src/types.ts`, `spec-validator.ts` | v0.21.3 (2026-10-24) |
| GW-12 | [MapLibre GL JS](https://github.com/maplibre/maplibre-gl-js) | `src/ui/map.ts` (resize, ResizeObserver, `project`), `src/ui/camera.ts` (padding, reduced motion), `src/ui/events.ts` | latest release v6.16.0 (2026-10-25) |
| GW-13 | [Motion](https://github.com/motiondivision/motion) | `packages/motion-dom/src/node/types.ts` (layout props), `LayoutGroup`, `AnimatePresence` types, `MotionConfigContext`, reduced motion types; [layout animation docs](https://motion.dev/docs/react-layout-animations) | `main` is 14.6.0 (npm latest, published 2026-10-22); every API cited here is also present at tag v14.1.0, the version pinned in [architecture](../../docs/architecture/README.md) |
| GW-14 | View Transitions | [CSS View Transitions Level 1 editor's draft](https://drafts.csswg.org/css-view-transitions-1/) (method steps, rendering suppression, painting order, UA stylesheet); [MDN browser-compat-data](https://github.com/mdn/browser-compat-data) `api/Document.json`, `api/ViewTransition.json`, `api/Element.json`, `css/properties/view-transition-*.json`; [web-features](https://github.com/web-platform-dx/web-features) `view-transitions.yml.dist`; MDN guide | BCD `main` 2026-10-26 |
| GW-15 | React `<ViewTransition>` | [react.dev reference](https://react.dev/reference/react/ViewTransition); React 19.3.0 release notes | 19.3.0 (2026-09-09), 19.3.1 (2026-10-14) |
| GW-16 | [Resize Observer draft](https://drafts.csswg.org/resize-observer/); [CSSOM View draft](https://drafts.csswg.org/cssom-view/) | Transform note; `getClientRects()` algorithm | 2026-10-26 |
| GW-17 | React Flow ([xyflow](https://github.com/xyflow/xyflow)) | [accessibility](https://reactflow.dev/learn/advanced-use/accessibility) and [ViewportPortal](https://reactflow.dev/api-reference/components/viewport-portal) pages; `packages/system/src/types/edges.ts` | `@xyflow/react` 12.12.0 (2026-09-24) |
| GW-18 | [leader-line](https://github.com/anseki/leader-line) | README positioning model; repository metadata | v1.0.8; archived; last commit 2025-04-11 |

## Findings

### 1. tldraw agent starter kit (GW-01 to GW-04)

Verified: how actions are defined and validated. Each action is a Zod object with a `_type` literal and `.meta({title, description})`. Exported schemas register automatically as defaults; `registerActionSchema(type, schema, {forModes})` adds mode-specific variants. A paired `AgentActionUtil` implements `sanitizeAction`, `applyAction`, `getInfo` and `savesToHistory`. A mode lists the prompt parts the agent sees and the actions it may take; actions outside the mode are skipped and unknown `_type` values route to an `unknown` util. `buildResponseSchema` unions the mode's schemas into `{actions: [...]}` and converts it with `z.toJSONSchema`; the system prompt embeds that JSON Schema. The worker calls AI SDK `streamText` without a provider structured-output setting and, where the model allows it, prefills the opening of the actions array. No whole-action schema parse happens at runtime (the only `safeParse` calls in the template check colour and fill values). Correction is per action in `sanitizeAction` through helpers such as `ensureShapeIdExists`, `ensureShapeIdIsUnique` and `ensureValueIsNumber`; arrow coordinates that are not numbers fall back to `0`.

Verified: context sent to the model. The user's message and selection, user and agent viewport bounds, a JPEG screenshot of the shapes inside the agent's bounds (`editor.toImage`, sent as a data URL), "blurry" shapes in view (id, type, text, x, y, w, h), "peripheral" clusters outside the view (bounds and count), focused shapes in full detail, chat history, recent user actions, a todo list, canvas lints and the time. Positions are offset to the chat origin and rounded before sending, then restored on return.

Verified: streaming. The worker re-parses the accumulated text after every chunk by closing unbalanced brackets and quotes (`closeAndParseJson`) and emits each action as `complete: false` until the next action begins or the stream ends. The browser applies incomplete actions too (a streaming `create` makes a locked preview shape), records the store diff, and reverts it before applying the next partial version. Transport is a POST to `/stream` answered with `text/event-stream` `data:` lines through a Cloudflare Durable Object, read with `fetch`; there are no event IDs or resume. The agentic loop (`prompt`, `schedule`, nested `prompt`) runs in the browser, so closing the tab ends the work.

Verified: positions, shapes, camera, providers. The model writes absolute geometry (`create`, `move`, `resize`, `rotate`, `pen` points) or relative placement (`place` beside a reference shape with side, alignment and offsets; `align`, `distribute`, `stack`), and moves its own viewport with `setMyView`. Custom shapes are `ShapeUtil` subclasses implementing `getDefaultProps`, `getGeometry`, `component` and `getIndicatorPath`, with props validated by `T` validators; the agent can create them through a dedicated action or a schema added to its focused-shape list. Camera methods include `setCamera`, `centerOnPoint`, `zoomToBounds`, `zoomToSelection` and `setCameraOptions` with constraints. Providers are AI SDK Anthropic, Google and OpenAI adapters; Meta would be added work.

Verified: license for a public deployment. The SDK license permits development environments only; a web app serving the public is a production environment and needs a trial or commercial license key. In source, a host counts as production when it is HTTPS, not loopback and built with `NODE_ENV=production`; with a missing or invalid key, or a key that does not list the host, the editor logs errors and `LicenseProvider` stops rendering it after 5,000 ms. The license key page describes free 100-day trial keys (one per company or project, by form), annual commercial keys, and hobby keys that keep the watermark and are approved case by case for non-commercial projects. The license allows usage data collection for compliance, and the license manager sends a best-effort request to a tldraw CDN address carrying the page URL for unlicensed-production, evaluation (trial) and watermarked deployments; Siterra URLs carry case, period and focus state (05). The template's own code is MIT, but its README still describes a watermark-only condition that no longer matches the SDK license.

Transferable. One registry pairing each schema with its executor, with title and description metadata generating model-facing documentation from a single source. Per-mode allowlists of context and actions (Siterra: `Task.allowedTools`). Multi-resolution context: detail for what is focused, summaries for what is visible, counts for the rest. Relative placement verbs instead of coordinates. A human-readable history line per action (Siterra: trace items templated from events).

Do not copy. Model-written coordinates, sizes or camera bounds; screenshots as model context; applying partial actions and reverting diffs; a prompt-only schema without a strict parse; silently coercing bad values (a `0` default would break the rule that missing is never zero); a browser-side agent loop.

Judgment: ADR-0020 stands. (1) Any public demo needs a trial key issued for the exact host before deployment, or the canvas blanks; preview hosts not listed in the key blank too. (2) Reusing the kit means replacing its coordinate actions, partial application, screenshot context and loop, which is most of it. (3) A MapLibre map inside a transformed canvas shape would combine two pan and zoom systems with a scaled WebGL canvas (not tested). Reconsider only if the product later needs freeform user sketching, and then as a projection of the case record with a key in hand.

### 2. Magic Patterns: designs and MagicOS (GW-05)

Verified from docs. A design is one chat plus one live interactive preview; every follow-up prompt edits the same design and saves a new version that can be previewed and restored; the design is real front-end code with pages and routes. MagicOS is one infinite canvas on which everything is a file (design, document, image, GitHub repository, text note). A coordinator chat answers quick questions itself and turns real work into threads, each run by an agent; threads run in parallel and appear in a sidebar grouped by status: In progress, Needs you, Done. A reply inside a thread goes to that agent; feedback to the coordinator is routed to the affected thread. Agents appear on the canvas and a file being worked on is marked; new files appear on the canvas as they are built. Selecting files and adding them to the chat sets the agent's context. The v3 API exposes whether generation is in flight and the active artifact, lists artifact versions, and can clone the active artifact into a new timeline entry before edits.

Transferable. Status per unit of work that says what is running and what needs the user (Siterra `Task` status, including `awaiting_input` and `awaiting_review`). Marking the component a running task will update (a loading component bound to its task). Every change as a new version with restore (case revisions and read-only prior revisions). Selection as context (`Context.focusedEntityIds`). "Needs you" as a first-class state.

Do not copy. Generated executable UI code as the artifact, an infinite canvas, and conversational per-thread agents as the user's mental model (ADR-0014 keeps one coordinator with bounded jobs).

Not verified. Actual product behavior, latency and recovery; only documentation was read.

### 3. Catalog-constrained generative UI protocols

A2UI (GW-06), verified. The README calls the project an early-stage public preview: v0.9.1 is the current production release, v1.0 is a release candidate and v0.8 is legacy. The server streams JSON messages, each with exactly one of `createSurface` (surface ID plus `catalogId`), `updateComponents` (a flat list of components keyed by `id`, children referenced by ID, exactly one `root`), `updateDataModel` (replace the value at a JSON Pointer path, or the whole model) and `deleteSurface`. Properties bind to data by `{path}`; the client buffers until `root` exists and renders placeholders for missing children. The catalog is a JSON Schema the client owns, and the agent may only use its components. Version 0.9 puts the schema in the prompt instead of provider structured output, and the spec says this demands stronger validation afterwards; it defines a `VALIDATION_FAILED` error with a JSON Pointer path for self-correction. *Transfer:* catalog identity and versioning, binding by reference, replacement keyed by ID, machine-readable issues with paths. *Do not copy:* model-authored component trees, client-side functions in payloads, theme values from the agent, prompt-only schemas.

AG-UI (GW-07), verified. It describes itself as an agent-to-application interaction protocol rather than a generative UI specification, and lists A2UI, MCP-UI and Open-JSON-UI as specifications it can carry (Open-JSON-UI was not inspected). Events cover run and step lifecycle, text messages, tool calls (start, args, end, result), state, activity, reasoning and subagents. `StateSnapshot` replaces client state; `StateDelta` carries RFC 6902 operations applied in order, and a client that detects inconsistency may request a new snapshot. Activity uses the same snapshot and delta pattern. Base event properties are type, optional timestamp, raw event and metadata: no sequence number or base revision. *Transfer:* snapshots as resynchronization points; explicit run and step lifecycle; structured activity distinct from chat. *Do not copy:* agent-owned UI state mutated by deltas without a base revision; an extra runtime layer to carry domain events Siterra already persists.

MCP Apps, MCP-UI and ChatGPT (GW-08, GW-09), verified. SEP-1865 is Stable as of 2026-01-26 (extension `io.modelcontextprotocol/ui`). Tools reference predeclared `ui://` HTML resources (`text/html;profile=mcp-app`) that the host renders in sandboxed iframes, with CSP built from declared domains, a separate-origin sandbox proxy for web hosts, and JSON-RPC over `postMessage`. The host sends complete tool input once; it may send best-effort partial input while arguments stream, but views must not rely on it for critical operations. Guidance separates `content` (for the model), `structuredContent` (for the UI, not added to model context) and `_meta` (not for the model); app-only tools are hidden from the model. Views request display modes and the host returns the mode actually applied. MCP-UI's packages now implement this standard. ChatGPT implements it and keeps its `window.openai` and `openai/*` names as compatibility aliases, directing new work to the standard fields. *Transfer:* templates declared ahead of time and reviewable (Siterra compiles its catalog into the app); model-facing summaries separate from UI-only data; UI-only actions such as period scrubbing never round-trip through the model; partial arguments are never authoritative; the UI requests, the host decides. *Do not copy:* iframes and server-supplied HTML in a first-party app.

Vercel AI SDK (GW-10), verified. AI SDK UI is the recommended path and AI SDK RSC (`streamUI`) is labelled experimental. Tool calls appear as typed message parts `tool-<name>` with states `input-streaming`, `input-available`, `approval-requested`, `approval-responded`, `output-available`, `output-error` and `output-denied`. Custom `data-*` parts written with the same `id` replace the earlier part; `transient` parts reach `onData` only and are not stored in history. *Transfer:* explicit lifecycle per proposal, keyed replacement, transient progress separate from history. *Do not copy:* rendering components inside a chat transcript as the main surface, or rendering from `input-streaming` arguments.

json-render (GW-11), verified. A Vercel Labs project, Apache-2.0, pre-1.0. `defineCatalog` declares components with Zod props and descriptions; `catalog.prompt()` generates the system prompt; specs are flat (`root` plus an `elements` map); streaming is JSONL of RFC 6902 operations; `validateSpec` returns coded issues such as `missing_root` and `missing_child`. Specs can carry expressions (`$state`, `$cond`, `$template`, `$computed`) and actions such as `setState`; the stream applier sets `replace` targets even when absent, for streaming tolerance. *Transfer:* one Zod source for catalog, model documentation and validator; coded issues. *Do not copy:* expressions, state or actions in model output; lenient patching; progressive rendering of model output.

Synthesis.

| Concern | What the protocols establish (Verified) | Siterra (Judgment) |
|---|---|---|
| Component catalog | Client-owned catalog with identity: A2UI `catalogId`, json-render `defineCatalog`, MCP Apps predeclared resources | Typed catalog in `packages/contracts`; renderers compiled into the app; `componentKind` enum |
| Data binding | By reference: JSON Pointer paths, state paths, `structuredContent` | Entity IDs bound to exact revisions in the case store; components never carry values |
| Incremental updates | Keyed replacement (A2UI components, AI SDK data parts) or RFC 6902 operations (AG-UI, json-render) | Keyed record replacement by `(id, revision)`; no JSON Patch |
| Security | Declarative data rather than code; sandboxed iframes where code is unavoidable | No model code, markup, CSS, URLs or expressions; no iframes |
| Streaming | Partial arguments display-only at most (MCP Apps); lifecycle states (AI SDK) | Partial arguments never shown; status comes from persisted task and tool events |
| Validation feedback | Coded issues with JSON Pointer paths (A2UI, json-render) | `ValidationResult` issues with paths into the proposal; no repair round for layout |

### 4. Semantic connectors between DOM components and map features

Verified building blocks. `getClientRects()`, and therefore `getBoundingClientRect()`, applies the transforms on the element and its ancestors (GW-16). Resize Observer observations are not triggered by CSS transforms (GW-16). MapLibre `project(lngLat)` returns pixels relative to the map container; a location behind the camera returns a point outside the viewport on the side it left (GW-12). MapLibre fires `move` repeatedly during animated transitions and user interaction, and with the default `trackResize: true` it watches its container with a `ResizeObserver` throttled to 50 ms that calls `resize()` and `redraw()` (GW-12). React Flow edges are defined by `source` and `target` node IDs inside its own pan and zoom viewport; `ViewportPortal` renders custom content in that coordinate system; nodes and edges are keyboard focusable, labels come from `ariaLabelConfig`, and an assertive live region announces node movement (GW-17). leader-line's repository is archived; lines reposition automatically only on window resize and need `position()` calls after animation or scrolling (GW-18).

| Criterion | Custom SVG overlay | React Flow | leader-line |
|---|---|---|---|
| Endpoints | Any registered DOM element; map points through `project` | Nodes and handles inside its viewport only | DOM elements or point and area anchors |
| Map endpoints | Direct | Map features would have to become nodes in a second pan and zoom system | Point anchor on the map container, recomputed by hand |
| During layout animation | Re-measure (rects include transforms) or hide until settled | Follows its own nodes only | Manual `position()` |
| During map pan | Recompute on `move` | Not applicable | Manual |
| Accessibility | SVG decorative; the relation list is primary and ours | Editor-oriented focus and assertive announcements | None documented |
| Maintenance and license | Small owned module | MIT, active | MIT, archived |

**Judgment: use the custom SVG overlay** (rendering rules in (e) below). React Flow solves graph editing, not six labeled lines between existing semantic regions and a map. leader-line is unmaintained and imperative.

### 5. Layout: Motion, WebGL and View Transitions

Verified: Motion API (GW-13). Package `motion`, imported from `motion/react`; checked on `main` (14.6.0) and at the pinned tag v14.1.0. `layout` accepts `true`, `"position"`, `"size"`, `"preserve-aspect"`, `"x"` or `"y"`; layout animation is transform-based, scale can distort children, border radius and shadow, and children given `layout` are counter-scaled. `"position"` snaps size and animates position only. `layoutId` animates a newly mounted element from the previous element's box, crossfading if the previous element is still mounted (`layoutCrossfade` turns that off). `LayoutGroup` takes `id` and `inherit` and groups components that re-render separately but affect each other's layout. `AnimatePresence` offers `mode: "sync" | "popLayout" | "wait"`, `initial`, `onExitComplete`, `propagate`, `anchorX` and `root`. Elements also accept `onLayoutAnimationStart`, `onLayoutAnimationComplete`, `layoutDependency`, `layoutScroll` (scrollable containers), `layoutRoot` and `layoutAnchor`. `MotionConfig` `reducedMotion` is `"always" | "never" | "user"` with a context default of `"never"`, and it switches transform animations off; `useReducedMotion` is exported. The docs add that layout changes must come from a React render through style or class, inline elements and SVG components are not supported, layout animation is blocked during horizontal window resizes, and appearing scrollbars can trigger unwanted animations.

**Verified: MapLibre behavior relevant to animated layouts (GW-12).** The canvas backing size follows the container's client size times the pixel ratio; `resize()` fires `movestart`, `move`, `resize` and `moveend`. `setPadding` and camera `padding` options offset the visual center without resizing anything. `easeTo` and `flyTo` skip animation under `prefers-reduced-motion` unless `essential: true`.

Judgment: WebGL pitfalls. Because a Motion layout animation commits the final layout and then animates a transform back from the old box, a map inside a layout-animated element would receive one throttled resize to its final size at the start, then be visibly stretched by the transform until the end. `project()` returns untransformed container pixels, so overlay math under a transformed ancestor needs scale correction. Both disappear if the map is never inside a layout-animated element and its container never changes size during a transition, which is already the rule in [motion](../../docs/reference/motion.md) (rules 6 and 9) and the full-bleed anatomy in [UX architecture](../../docs/reference/ux-architecture.md). Not tested on the demo laptop.

Judgment: implementation notes for the column. Wrap the column in one `LayoutGroup`; put `layoutScroll` on its scroll container; use `layout="position"` on section and chart containers so Observable Plot SVG text is never scaled and charts re-render once at their final width; let new panels (MOT-09) enter with opacity and a short translate while siblings move by position, which keeps to transform and opacity. For MOT-05 chip travel, give a shared `layoutId` (the evidence ID) only to the first ledger cell where an evidence item appears; other appearances fade in place. Several mounted elements sharing one `layoutId` is not documented behavior (not verified). Apply `MotionConfig reducedMotion="user"` and also zero the opacity durations when `useReducedMotion()` is true, because Motion's setting removes transforms only while 09 rule 8 caps opacity changes at 120 ms.

Verified: View Transitions support (GW-14). Same-document `document.startViewTransition`: Chrome and Edge 111, Firefox 144, Safari 18; web-features rates it Baseline "newly available" since 2025-10-14. The options object with `types`: Chrome 125, Firefox 147, Safari 18.2. `view-transition-class`: Chrome 125, Firefox 144, Safari 18.2. `match-element`: Chrome 137, Firefox 144, Safari 18.4. Element-scoped `Element.startViewTransition`: Chrome 147 only, and `ViewTransition.transitionRoot` is marked experimental.

Verified: View Transitions mechanics (GW-14, GW-15). The UA stylesheet names `:root` `root`, so the whole document is captured unless that is overridden. While the update callback runs, rendering is suppressed and all pointer hit testing goes to the document element. While animating, captured elements are not painted in place and do not receive hit testing. Starting a transition while one is active skips the active one with an `AbortError`, and the two update callbacks can then run concurrently. A user agent may skip after an implementation-defined timeout. The old state is a static capture and the new state a live one. React 19.3.0 shipped `<ViewTransition>` and `addTransitionType`; they activate only for updates inside `startTransition`, `useDeferredValue` or Suspense reveals, React batches updates that arrive during a running transition, each boundary animates as one image, and React does not apply reduced motion for you.

Not verified. How each engine captures a live WebGL canvas inside a view transition.

Judgment. Do not use View Transitions in P0. Default root capture and suppressed hit testing would interrupt map gestures, streamed commits would abort transitions in flight, and the one-image-per-boundary model cannot express MOT-05 chip travel. Motion confined to the column covers MOT-02, MOT-03, MOT-05, MOT-08 and MOT-09. Revisit for route-level transitions such as read-only revision views, with `:root { view-transition-name: none; }` and the map excluded.

## Recommended composition model

All of this section is **Judgment**. It fills in mechanics beneath the decisions already made in 05, 08, 09, 13 and 14.

### Who decides what

| Decision | Owner |
|---|---|
| Which catalog components a result needs, which records they bind, comparison mode, title, what to focus when the user's own command completes | Model proposal, effective only after validation |
| Component existence, section, order, expanded or collapsed or hidden, exact entity revisions, `presentationStatus` | Server reducer, deterministic |
| Placement when no valid proposal exists | Server reducer: default projection by `Task.kind`, never a model repair round |
| Shell regions, column width, camera padding, map layer per focus, pitch, strip rows | Fixed shell rules in 05, 08 and 09; neither the model nor the reducer |
| When an accepted change appears (hold or apply), focus movement, scrolling, user expand or collapse overrides | Client, as local view state |

Shell state names for tests and motion triggers are derived, never proposed: `arrival` (before commissioning), `investigating` (column present), `comparing` (an expanded temporal comparison in `aligned` or `two_period` mode) and `reviewing` (decision brief expanded with review panels). No `preset` field is needed; the five fixed sections are the slots.

### (a) Component catalog

Machine-readable entry in `packages/contracts`, one per `componentKind`, the single source for renderer registration, validation and the model-facing tool description:

| Field | Type | Purpose |
|---|---|---|
| `kind` | `componentKind` value | Key |
| `catalogVersion` | integer | Bump when the binding contract changes; contract tests pin it |
| `proposable` | boolean | Whether `show_component` may name it |
| `modelDescription` | host-authored sentence | Copied into the tool schema description; never model text |
| `sections` | list of `section` values | Allowed placement |
| `binds` | list of `{recordType, min, max, allowedStatuses}` | Reference validation and binding |
| `comparisonModes` | list of `single`, `aligned`, `two_period` | Empty for every kind except temporal comparison |
| `maxPerSection` | integer | Dedupe and `update_component` rebinding |
| `titleTemplate` | host template, at most 60 characters | Title when none is proposed or the proposal is rejected |
| `textEquivalent` | `table`, `list` or `text` | Required non-visual representation (16, 08) |
| `anchorRecordTypes` | list of record types | Elements exposed as connector endpoints (`data-entity-id`) |
| `defaultFor` | list of `Task.kind` values | Default projection |
| `motion` | IDs from 09 (for example MOT-03, MOT-05, MOT-09) | Never a model input |

Proposed P0 entries, carried into the "Catalog bindings" section of [components](../../docs/reference/components.md) during the check; the limits remain design proposals, not measured needs:

| Kind (08) | Sections | Binds (min to max) | Modes | Proposable | Anchors | Default for task kind |
|---|---|---|---|---|---|---|
| `geography` (CMP-06 area card) | place | GeoSelection 1 | none | yes | GeoSelection (map label point) | `plan` of a `commission` command |
| `activity` (CMP-07 plan) | place | Task 1 to 8 | none | no | none | `plan` |
| `temporal_comparison` (CMP-08) | observations, explanations | DataBundle 1 to 2 and GeoSelection 1 | single, aligned, two_period | yes | TemporalObservation | `observation_analysis` |
| `evidence` (CMP-09) | observations, explanations | Evidence 1 to 20 | none | yes | Evidence | `source_research` |
| `hypothesis_comparison` (CMP-10) | explanations | Hypothesis 1 to 5 | none | yes | Hypothesis; Evidence chips | `hypothesis_comparison` |
| `livelihood_constraints` (CMP-11) | responses | Evidence 1 to 20 | none | yes | Evidence | `livelihood_governance` |
| `intervention_comparison` (CMP-12) | responses | Intervention 2 to 4 | none | yes | Intervention | `intervention_feasibility` |
| `action_package` (CMP-13) | next_steps | OperationalAction 1 to 3; ResourceRequirement 0 to 12 | none | yes | OperationalAction | `brief_package` |
| `decision_brief` (CMP-14) | next_steps | Brief 1 | none | yes | Evidence chips in items | `brief_package` |
| `trace` (CMP-16) | none | none | none | no | none | none |

`trace` is a user-invoked overlay (08): keep the enum value but create no `CanvasComponent` records for it in P0. A component in `loading` binds the `task_` IDs that will produce its records (rule PRES-02 below), so the pending slot can show the real task label without a new field.

### (b) Layout proposal and action vocabulary

Model context. A workspace summary: each component as `{componentId, kind, section, visibility, entityIds, presentationStatus, comparisonMode}`, the command's context (area, period, focus), how many components are expanded, and the catalog descriptions with allowed sections, bindable record types and limits. No pixels, sizes, screenshots or layout coordinates.

**Tool `propose_layout`** (strict; every property present, nullable by union; generated from Zod as 14 requires; one to four actions; at most one call per task, normally the last call):

```
{ "actions": [ {
    "kind": "show_component | update_component | set_comparison | focus_entity | hide_component",
    "componentKind": "<catalog kind> | null",
    "componentId": "<comp_ id> | null",
    "entityIds": ["<record id>", ...],
    "section": "<section> | null",
    "comparisonMode": "single | aligned | two_period | null",
    "periodIds": ["<period id>", ...],
    "title": "<plain text, at most 60 characters> | null"
} ] }
```

IDs must exist at the task's base revision or have been returned as accepted earlier in the same task. Components created in the same proposal never need to be referenced: comparison mode travels on `show_component`, and `focus_entity` names a record, not a component. There is no free-text `reason` argument; the reducer writes `LayoutAction.reason` from a template or from the planner's validated interpretation.

| Verb | Required | Must be null or empty | Accepted when |
|---|---|---|---|
| `show_component` | `componentKind`, `section`, `entityIds` | `componentId` | Proposable kind; section allowed; record types, statuses and counts within `binds`; `comparisonMode` set if and only if the kind has modes; title valid; a component of the same kind and identical binding is reused rather than duplicated |
| `update_component` | `componentId`, `entityIds` | `componentKind`, `section`, `comparisonMode`, `title` | Component exists and is not hidden; same kind; new binding differs and satisfies `binds` |
| `set_comparison` | `componentId`, `comparisonMode` | `componentKind`, `section`, `title` | Component is a temporal comparison; `single` binds one series; `aligned` binds two series on the same GeoSelection revision with compatible period definitions; `two_period` names exactly two `periodIds` that resolve to observations of that area and bundle |
| `focus_entity` | exactly one `entityIds` item | `componentId`, `componentKind`, `section`, `comparisonMode`, `title` | Origin is `user_command`; the record is bound by a component that is expanded after this commit |
| `hide_component` | `componentId` | all others | Component exists; never the only expanded component in the section receiving this command's result |

**Validation** follows 13's ordered pipeline and adds layout checks. Issue paths are JSON Pointers into the proposal (for example `/actions/1/entityIds/0`).

| Check | `ValidationResult` code |
|---|---|
| Incomplete or refused response; strict parse; forbidden field present; more than four actions | `schema` |
| Unknown entity or component ID; cross-case reference | `unknown_reference`, `ownership` |
| Bound entity `stale` or superseded where the catalog does not allow it | `stale_reference` |
| Section, record type, status, count or comparison mode not allowed by the catalog | `catalog_mismatch` (new) |
| Number in a title that is not in a bound record or period | `numeric_provenance` |
| Title states a verdict or cause (13's phrase scan plus words such as "proves", "caused by", "explains") | `prohibited_claim` |
| Focus from `background` or `default_projection`, or a target that will not be expanded | `focus_not_permitted` (new) |
| Instance limits (`maxPerSection`) | `limit` |

Atomicity and fallback. Any issue rejects the whole proposal; every action is stored as a `LayoutAction` with `status: rejected` (except schema failures, which only produce the `validation.completed` event), and the default projection then places the task's results. Layout is exempt from 13's single repair round: a repair costs a model call to fix presentation, and the default projection is already correct. A rejected layout proposal never fails the task or blocks its domain records.

**Reducer** (after acceptance, inside the commit transaction):

1. Apply actions in order. `show_component` creates a component (revision 1, `order` after the last in its section) or reuses an identical one; `update_component`, `set_comparison` and `hide_component` create a new component revision.
2. Expansion. For a `user_command` commit, the section receiving the result expands and components in other sections collapse, as 05 and 08 CMP-04 require. For `background` commits, new components are created collapsed and nothing the user opened is collapsed.
3. Cap. If more than three components would be expanded, collapse the least recently shown ones outside the receiving section first; never hide or delete.
4. Rebind. Any component whose bound entity received a new accepted revision in this commit gets a new revision bound to it (`origin: default_projection`, kind `update_component`); if an input changed but the entity was not recomputed, set `presentationStatus: stale`.
5. Write `CanvasComponent` revisions with exact `entityVersions`, the accepted `LayoutAction` records and one `layout.accepted` event listing the component IDs.

### (c) Regions, slots and shell states

Regions are fixed by 05 and 08 and cannot be addressed by the model: case bar, geo stage (full-bleed, beneath the overlays), investigation column, temporal strip, director, and overlays (inspector covering the column, trace bottom sheet, history drawer). The **slots are the five sections** in fixed reading order: Place, Observations, Explanations, Responses, Next steps. Within a section, components stack by `order`. Each component is `expanded`, `collapsed` (title and one-line summary in its section) or `hidden` (history only). DOM order always equals visual order, and no grid placement reorders it.

| Shell state | Derived when | Column | Map (camera and layers per 05) |
|---|---|---|---|
| `arrival` | Case not yet commissioned | None; case card | Full-bleed relief, no padding |
| `investigating` | Column present, no comparison expanded | Receiving section expanded | `padding.right` = column width plus gutter, `padding.bottom` = strip height |
| `comparing` | An expanded temporal comparison in `aligned` or `two_period` mode | MOT-09 inside the component | Pitch 0 (MOT-12); rainfall grid outline when aligned |
| `reviewing` | Decision brief expanded with review panels | Next steps expanded | Sampling strata |

The column keeps `clamp(520px, 40vw, 640px)` and stacks below 960 px (05). Composition never changes the map container's size; only the camera padding changes, and `resize()` runs only on real viewport changes (09 rule 6).

### (d) Update semantics

1. Model to server: complete arguments only. Proposals are parsed after the provider stream completes (13 step 1). The director shows "Preparing layout" from task status, never from partial arguments.
2. One commit, one projection. Domain upserts, component revisions, layout actions and events commit in one transaction (14 principle 3).
3. Server to client: keyed replacement. On `case.committed` or `layout.accepted` with a case revision above the client's, fetch the snapshot (P0; the case is small) and replace each record whose revision is higher than the one held. Drop responses older than the held case revision by request token. A sequence gap triggers a snapshot refetch (14). Snapshot plus ordered events gives idempotent replay without JSON Patch's dependence on exact base state; AG-UI deltas carry no base revision and json-render's applier tolerates missing targets, both acceptable for chat widgets and not for an audited case.
4. Atomic display. All records of one commit are applied in one reducer dispatch inside `startTransition`, so map layer, chart and strip switch together.
5. Components render their bound revisions only. A newer store revision for a bound entity without a component update shows the stale treatment from 08 rather than mixing revisions.
6. **Hold and release** (09 rules 2 and 5). Data-only changes (same components, same visibility, new revisions) apply in place: rows append and never reorder under the pointer, changed cells get the reduced-motion-safe highlight. Composition changes (new expanded component, collapse, hide, focus) apply at once only when they complete the user's latest command and the pointer and keyboard focus are outside the affected section. Otherwise they wait behind "New results (n)" with one polite announcement, applied on click or when the pointer leaves. The inspector being open also holds them.
7. One focal transition at a time. A projection arriving mid-animation re-renders to the newest state, and Motion animates from the current visual position. Connectors stay hidden until the animation completes. Reload, reconnect and snapshot reset render the current state without animation.

### (e) Semantic connector rendering

P0 (05, 08 CMP-17): selecting a record highlights related records and lists relations in its details: relation label, target title and claim kind, status (`proposed`, `accepted`, `stale`), revision, the one-sentence explanation, and a Show button that scrolls to and selects the target. This list is the semantic representation in every phase.

P1 drawn lines:

1. Overlay. One `<svg>` fixed over the workspace, `pointer-events: none`, `aria-hidden="true"`, below the inspector, sheets and director, masked out of the map attribution and director rectangles. Drawn only when the column and the visible map sit side by side (at least 960 px); stacked layouts keep the list only.
2. Edges. Relationships touching the selected record, excluding `derived_from` (inspector only) and `compares_with` (expressed by layout). Order: `contradicts`, `requires_authorization`, `requires_verification`, `supports`, `proposes_response`, `depends_on`, then relationship ID. Draw the first six; the list states how many are not drawn. Styles follow 14 (solid, bar end, dotted, arrow, caution with lock glyph); stale edges keep their style and add "(stale)" to the label.
3. Anchors. Components register elements carrying `data-entity-id` in a registry. Map endpoints use a deterministic polygon label point of the record's GeoSelection, projected with `map.project` and offset by the map container's rect. Collapsed components anchor at their section header; records in hidden components, scrolled out of the column, outside the visible map region or behind the camera become edge indicators ("2 related above", MOT-06), never guessed positions.
4. **Recompute** in one `requestAnimationFrame`, reading all rects before writing any path: on selection change, record change, `ResizeObserver` callbacks for the column, scroll container and anchors, passive scroll, map `move` and `resize`, `document.fonts.ready` and window resize. Hide on `onLayoutAnimationStart` and reveal on `onLayoutAnimationComplete`.
5. Accessibility. The SVG adds nothing for assistive technology; the list does. In forced-colors mode, strokes use `CanvasText` and label plates use `Canvas`. Under reduced motion, lines appear without drawing.

The rule in 14 that `contradicts` and `requires_authorization` are never dropped cannot hold if one record has more than six such edges. Recommendation: they are drawn first and any overflow is listed, never silently omitted.

### (f) Failure and interruption behavior

| Situation | Behavior |
|---|---|
| Layout step times out or the provider fails | Default projection; trace shows "Layout step failed; default placement used" |
| Schema-invalid layout arguments | `validation.completed` with issues; default projection; no repair round |
| Semantically invalid proposal | Whole proposal stored as rejected `LayoutAction` records with issue codes; default projection; domain records unaffected |
| Domain result partial or failed | Committed parts render; the rest shows `partial` or `error` with cause and Retry; earlier components unchanged |
| Cancellation | "Cancellation requested" on loading components until acknowledged; then loading placeholders become `hidden`, or `partial` if outputs committed |
| Case advanced by another commit | 14 rebase rules; layout re-validated against current records inside the commit; conflicts reject the layout, not the domain result |
| Older command finishes after a newer one | Its components are created collapsed; no focus; "New results (n)" |
| Pointer or focus inside the affected section | Hold and release, (d) item 6 |
| SSE disconnect | Case bar shows "Reconnecting"; last projection stays read-only; replay after reconnect; gap leads to a snapshot; no animation |
| Snapshot older than held state | Discarded |
| New layout during an animation | Animate from current position to the newest state; connectors hidden until settled |
| Reduced motion | `MotionConfig reducedMotion="user"`, opacity at most 120 ms, camera moves without `essential` so MapLibre jumps |
| WebGL or tile failure | Static relief fallback (08 CMP-02); map endpoints become list items marked "map unavailable" |
| Anchor not measurable | Edge indicator or list only |
| Viewport change during an animation | Motion skips layout animation during horizontal resize; MapLibre's observer resizes the map; connectors recompute |

### (g) What to cut first

Drawn connectors (MOT-06) are already P1. If P0 time runs short, cut in this order:

1. MOT-05 shared-element chip travel: keep the "P0 simple" version.
2. `two_period` comparison mode: keep `single` and `aligned`.
3. Model-proposed titles: catalog templates only, which removes two validation checks.
4. `hide_component` from the model: the reducer collapses instead.
5. Animated composition (MOT-03, MOT-08, MOT-09): immediate state changes, the designated fallback in 05.
6. Model-proposed layout entirely: default projection by task kind only. This changes the claim to "AI-produced results, deterministic placement", and the demo must say so.

Never cut: server validation and revision binding, missing, partial and error states, text equivalents, hold and no focus stealing, reduced motion.

## Proposed schema changes

Status at the end of the check on 2026-10-26: the first four rows were adopted in `case.schema.json` 1.2.0, together with an updated [challenge-commit.json](../../schemas/examples/commit-challenge.json) and rules PRES-01 to PRES-07 in [Data contracts](../../docs/reference/data-contracts.md#presentation-contract). The last two rows are still open. No change is needed to the `LayoutAction.kind`, `origin` or `CanvasComponent.visibility` enums, and no `preset` or issue field is needed on layout records: shell state is derived, and issues live in `Event.validation`.

| Change | Status | Reason |
|---|---|---|
| `Relationship.fromEntityRevision` and `toEntityRevision`: integer, minimum 1, required | Adopted in 1.2.0 | An edge asserts something about two specific revisions. Without them a revised hypothesis silently inherits edges written for its earlier state, and connectors cannot show staleness |
| `CanvasComponent.entityVersions`: array of `EntityVersion`, at least one item, required | Adopted in 1.2.0 | Snapshots carry only current revisions, so a stale binding cannot be detected from `entityIds` and `sourceCaseRevision` alone |
| `CanvasComponent.title` at most 60 characters; `LayoutAction.title` string or null, at most 60 characters, required | Adopted in 1.2.0 | Matches the title rule in 05; the action records what the model proposed |
| `ValidationResult.issues[].code` gains `catalog_mismatch` and `focus_not_permitted` | Adopted in 1.2.0 | Layout failures in (b) that no existing code describes |
| `uniqueItems: true` on `CanvasComponent.entityVersions` and on `periodIds` in both records; PRES-01 adds "each entity ID appears once in `entityVersions`" | Open | `uniqueItems` only rejects identical objects; two revisions of one entity would still pass PRES-01's set equality |
| Per-verb `allOf` conditions below | Open, optional | Moves shape checks from application code into the schema; application validation still runs |

```json
"allOf": [
  { "if": { "properties": { "kind": { "const": "show_component" } } },
    "then": { "properties": { "componentKind": { "type": "string" }, "section": { "type": "string" } } } },
  { "if": { "properties": { "kind": { "enum": ["update_component", "set_comparison", "hide_component"] } } },
    "then": { "properties": { "componentIds": { "minItems": 1, "maxItems": 1 } } } },
  { "if": { "properties": { "kind": { "const": "set_comparison" } } },
    "then": { "properties": { "comparisonMode": { "enum": ["single", "aligned", "two_period"] } } } },
  { "if": { "properties": { "kind": { "enum": ["update_component", "focus_entity", "hide_component"] } } },
    "then": { "properties": { "comparisonMode": { "type": "null" } } } },
  { "if": { "properties": { "kind": { "const": "focus_entity" } } },
    "then": { "properties": { "entityIds": { "minItems": 1, "maxItems": 1 }, "origin": { "const": "user_command" } } } }
]
```

These go on `LayoutAction`. A `show_component` whose `componentKind` is not `temporal_comparison` must also have a null `comparisonMode`; on `CanvasComponent` the same rule is a single condition: if `componentKind` is not `temporal_comparison`, `comparisonMode` is null.

**Cross-record rules** (adopted in 14 as PRES-01 to PRES-07, wording condensed there)

| Rule | Statement |
|---|---|
| PRES-01 | `CanvasComponent.entityIds` equals the set of `entityVersions[].entityId`, and every listed revision exists |
| PRES-02 | `task_` IDs may appear in `entityIds` only when `presentationStatus` is `loading` (task queued, running or awaiting input) or `error` (to show cause and Retry) |
| PRES-03 | At most three components with `visibility: expanded` per case revision |
| PRES-04 | `aligned` binds two series sharing one GeoSelection revision; `two_period` names exactly two `periodIds` observed for that area and bundle; `single` binds one series |
| PRES-05 | `focus_entity` is accepted only with `origin: user_command`, and its record is bound by a component expanded after the commit |
| PRES-06 | A relationship whose endpoint gains a newer revision without a re-asserted relationship becomes `stale` and emits `entity.stale` |
| PRES-07 | Layout proposals are atomic; a rejected proposal never fails its task; the default projection applies |

**Document alignment notes**

- Resolved during the check: 14's `propose_layout` arguments now match (b); 13 exempts layout proposals from the repair round; 08 gained a "Catalog bindings" section carrying the catalog in (a), including both sections for `temporal_comparison`.
- Open: 08's catalog bindings list the `geography` default as `commission`, which is a `Command.intent`, not a `Task.kind`; the default projection keys on task kind, so it should read `plan` (of a commission command), as in (a).
- Open: scene 5 in 04 opens the aligned small multiples in Explanations, while MOT-09 in 09 keeps "the existing chart" in place. Both hold if MOT-09 is stated to apply to `set_comparison` on an already expanded chart, while the challenge flow uses `show_component` of a temporal comparison in Explanations with `comparisonMode: aligned`.
- Open: 14's rule that `contradicts` and `requires_authorization` edges are never dropped needs the overflow wording from (e).

## Not verified and open questions

- Whether the Meta structured output subset accepts arrays of objects with nullable unions as used in (b); TECH-06 documents schema-constrained JSON but not its subset. Fallback: one action per tool call.
- WebGL canvas capture in view transitions per engine; Motion, MapLibre and Plot together on the demo laptop; the PF-03 long-task budget during composition.
- tldraw trial key eligibility for a hackathon deployment (the license key page does not address it); no key was requested.
- Magic Patterns behavior beyond its documentation.
- The proposed catalog limits (binding counts, `maxPerSection`) are design proposals for 08, not measured needs.
