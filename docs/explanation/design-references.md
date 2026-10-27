# Design references

Per-reference detail (what was observed, fit, what not to copy, licensing, inspection method): [reference manifest](../../research/design/source-register.md), VIS-01 to VIS-29. Screenshots and video frames used for inspection are kept privately in `design/private/references/` with a local reference board; they are not redistributable, so this repository links to sources instead ([policy](../../CONTRIBUTING.md)).

Every reference below was actually inspected (screenshot, extracted video frames, live view or page text, as recorded in the manifest). Access failures are listed there, not papered over.

## Founder-supplied references: verdicts

| Reference | Verdict | Take | Leave |
|---|---|---|---|
| Claude wildfire post: FireTrace prototype (VIS-09) | Strongest analog | One playhead drives the map, the charts beneath it and the event list; peaks labeled with elevation; small synchronized charts under a time bar | Dense operational dashboard (layers panel, incident card, weather tiles and charts all at once), modeled-probability layers presented as fact, alarm palette, decorative 3D aircraft |
| Mona Biasia post: Astra user-flow review (VIS-10) | Transfers in part | Labeled edges ("Yes", "Failed", "Edit and retry"), failure paths drawn as first-class, the focused artifact opened over a dimmed graph, an honest "simulated scenarios" label | The free flow canvas as the main surface |
| Magic Patterns MagicOS (VIS-01) | In part | Work grouped by status (in progress, needs you, done); feedback routed to the task that produced the artifact | Infinite canvas |
| tldraw agent starter kit (VIS-02) | In part | Explicit, visible context; one registry pairing each action with its executor | The canvas, model-written coordinates, partial application, the production license key burden |
| Linear design refresh (VIS-03) | Transfers | Receding chrome, fewer separators, fixed header slots | Near-black monochrome chrome as identity |
| MapLibre examples (VIS-04) | Core engine | Terrain, multidirectional hillshade, fog, color relief, reduced-motion flag on camera moves | Demo tiles, example color ramps |
| Mapbox docs (VIS-05) | Concepts only | Layer slots and a monochrome basemap posture so only data carries hue | Proprietary SDK and token |
| Observable and Plot (VIS-06) | Transfers | Gaps that stay gaps, time crosshair, chart beside its table | Notebook UI |
| Motion (VIS-07) | Transfers | Layout and shared-element transitions for composition | Flourish for its own sake |
| shadcn/ui Trace (VIS-08) | Transfers | One line grammar for agent steps (icon, title, status, outcome) | Displaying model reasoning |
| Destiny 2 Director (VIS-11) | Weak | A spatial hub with sub-screens reached from a rail | Art direction; its zoom behavior was not verified |
| Star Citizen mobiGlas and ARK Starmap (VIS-12) | Minimal | Label density that changes with zoom | Holographic overlays, full-screen takeovers |

The game references were inspected from official sources and judged on interaction value only. They contribute little; they are not favored because they were suggested.

## References by component and transition

| Siterra element | References | Concrete behavior to implement |
|---|---|---|
| Geo stage (CMP-02) | VIS-04, VIS-17, VIS-18, VIS-19, VIS-20, VIS-05 | Neutral, generalized relief with multidirectional light and quiet valley floors; monochrome basemap; analysis color only inside the study geometry, context dimmed |
| Camera fly-in (MOT-01) | VIS-04, VIS-05 | API semantics only (`flyTo`, `essential: false`); no reference choreography was inspected, so MOT-01 stays P1 and short |
| Timeline (CMP-03, MOT-04) | VIS-09, VIS-13, VIS-14, VIS-16, VIS-17, VIS-06 | Coverage drawn per period before anyone scrubs; only observed periods selectable; playhead label above the track; unit legend on the strip; gaps visible with reasons |
| Comparison chart (CMP-08, MOT-09) | VIS-06, VIS-21, VIS-20, VIS-09 | Small multiples on shared time axes; hatched shortfall against a stated reference; two-period comparisons print both dates |
| Evidence card and method line (CMP-09, CMP-02, CMP-08) | VIS-20, VIS-21, VIS-15, VIS-13, VIS-25 | A method line under every map and chart: dataset, vintage, thresholds, source; modeled values labeled in place; unavailable sources listed with a reason |
| Hypothesis ledger (CMP-10, MOT-05) | VIS-29, VIS-10 | Explicit triage verbs and states; labeled relations; failed branches visible |
| Firm activity and plan (CMP-07) | VIS-01, VIS-08, VIS-24 | Tasks grouped as needs you, running, done, with counts; one line per task with icon, plain title, status words, one-line outcome, evidence IDs |
| Trace inspector (CMP-16, MOT-10) | VIS-22, VIS-23, VIS-24, VIS-08 | Tree of spans with kinds and durations; failures inline with reasons; inputs and outputs redacted by default; no reasoning display |
| Director (CMP-05) | VIS-01, VIS-02, VIS-26 | Visible context before submit; attached to the edge of its region and never wider than it |
| Decision brief and review (CMP-14) | VIS-28, VIS-29, VIS-23, VIS-10 | Review bound to a revision; marks clear when the revision changes; few explicit verbs; pending comments until submitted |
| Livelihood constraints (CMP-11) | VIS-21 | Human consequences shown next to the physical record, with sources stated |
| Composition and focus (MOT-02, MOT-03, MOT-05, MOT-08) | VIS-07, VIS-27, VIS-03 | Transform-based layout transitions; frequent actions instant; the inspector grows from the selected item |

## Rules the references support

From the manifest's synthesis; each is reflected in the specs it names.

1. Show where observations exist before anyone scrubs; gaps are never bridged ([Component specifications: CMP-03](../reference/components.md#cmp-03-timeline)).
2. One committed period drives every view ([UX architecture](../reference/ux-architecture.md#temporal-selection)).
3. Mineral ground, measured color: the base is neutral so only measurements carry hue ([Design system](../reference/design-system.md#cartography)).
4. Every graphic carries its method line ([components](../reference/components.md#shared-behavior)).
5. Compare against a stated reference on shared axes, never dual axes ([Design system](../reference/design-system.md#data-palettes)).
6. One line grammar for agent work, grouped by who must act ([Component specifications: CMP-07](../reference/components.md#cmp-07-plan-and-activity-activity)).
7. Apply agent output atomically, with visible context ([UX architecture](../reference/ux-architecture.md#ai-composition-contract)).
8. Animate rarely and from the source; reduced motion removes crossfades too ([motion](../reference/motion.md)).
9. Chrome recedes; controls attach to what they control ([Design system](../reference/design-system.md)).
10. Review is explicit, batched and revision-aware ([Human review and authority](../reference/review-and-authority.md)).

## Gaps where Siterra's design is original

No inspected reference shows an intervention comparison holding effects, uncertainty and livelihood trade-offs together, or a role-specific decision brief. CMP-12 and CMP-14 are therefore original designs; evaluate them with users rather than by resemblance.
