# Component libraries: niche craft scan

Inspected 2026-10-26. Public-safe and link-only: this file embeds no third-party images and quotes at most one short phrase per source. Captures used during inspection exist only in the gitignored `design/private/references/` folder (prefix `lib-`, with a machine-readable twin `lib-manifest.json`); nothing below depends on them.

Status. Research register, not a decision record. Recommendations are proposals for the build lead. None of them changes the decision record: ADR-0016 (owned shadcn components, Motion 14.1.0), ADR-0018 (self-hosted map bundle), ADR-0040 (floating islands) and the [motion specification](../../docs/reference/motion.md) stand as written. Evidence labels follow the [planning index](../../docs/README.md#evidence-labels): **[V]** checked against the cited source on the stated date, **[H]** belief to test, **[U]** not established.

Scope. Niche, high-craft React component libraries popular with design engineers, the primitives they build on, and inspiration galleries. Another lane covers AffectUI, Magic Patterns, Vercel AI Elements, assistant-ui, prompt-kit, Motion Primitives, Magic UI, shadcn/ui blocks, Origin UI, Kibo UI, Animate UI, Aceternity UI, 21st.dev and product references (Perplexity, ChatGPT, Claude, Linear, Raycast, Apple materials); see the [UI patterns research](ui-patterns.md). This file complements it and does not repeat it.

## How this was inspected

| Method | Establishes | Applied to |
|---|---|---|
| Site fetch and headless screenshot (1440 x 900), image viewed | The site exists today, what it advertises, first-load visual style | Every library and gallery below |
| Official shadcn registry index (`ui.shadcn.com/r/registries.json`, 498 namespaces) | Namespace, item endpoint, item count, the index's own health rating | Every registry-distributed library |
| Registry item download and static scan: 203 component items from 22 registries | Declared dependencies, primitive library, presence of reduced-motion code, Escape handling, ARIA attributes, length | Components that map to Siterra surfaces |
| GitHub API | License file text, last commit, commits in the last 90 days, creation date | Every library with a public repository |
| `npm view` | Version, publish date, license, peer dependencies | Published packages |
| Documentation pages | Documented keyboard, ARIA and props | Primitives and selected components |

Not done. No package was installed and no component was run. No keyboard or screen-reader test was performed, so every accessibility statement below is either documented behavior or code read statically, never a test result. No account was used, no form was submitted, consent banners were left unanswered, and no paywall or bot check was bypassed. Static marker counts include false positives (one demo dataset mentions `prefers-reduced-motion` as text), so every claim that drives a recommendation was confirmed by reading the relevant lines.

X (Twitter). Searching X needs an account: `x.com/search` answered with a 307 redirect to the login onboarding flow, and web searches restricted to x.com returned no posts. Discovery therefore used the official shadcn registry index, secondary roundups from web search and each library's own site. How often any library is shared on X is **[U]**.

## Shortlist for Siterra

Ranked by fit with the [design system](../../docs/reference/design-system.md), the [motion specification](../../docs/reference/motion.md), the [accessibility requirements](../../docs/reference/accessibility-and-language.md) and the floating-island layout (ADR-0040), then by license safety, compatibility with the ADR-0016 stack and maintenance. "Adapt" means: copy MIT source once, keep its copyright notice, add the source URL and retrieval date, retime it to Siterra tokens, then test with keyboard and a screen reader.

| Rank | Library | Role | Adoption path | License |
|---|---|---|---|---|
| 1 | **Base UI**, through shadcn/ui with `--base base` | Behavior for tabs and indicator, toggle group, slider, dialog, drawer, popover, tooltip, toast | Install: owned shadcn source plus `@base-ui/react` | MIT |
| 2 | **Hairline UI** (components only) | Reference implementation for citation markers, segmented control, task log and plan, sheet, table states | Adapt selected files; port behavior onto Base UI parts where one exists | MIT; templates use a custom license and are out of scope |
| 3 | **Kokonut UI** | Inline citations with one shared preview that lights up the sentence it backs | Adapt `ai-citations` only | MIT |
| 4 | **SmoothUI** | AI citation card, task list, tool call; its primitives already sit on Base UI | Study; adapt `ai-citation` if Hairline's is not chosen | MIT |
| 5 | **Caliper UI** (free parts) | Calm, dependency-free segmented control; complete state coverage | Study `segmented-control`; never touch Pro | MIT for free parts; Pro commercial |
| 6 | **Sonner** | Transient confirmations only | Install only if shadcn Toast (Base UI) is not used | MIT |
| 7 | **React Aria Components** | Accessibility reference and test oracle | Study; do not mix into the Base UI tree | Apache-2.0 |
| 8 | **Fluid Functionalism** | Collapsible task steps; motion used only to make state legible | Study | MIT |
| 9 | **NumberFlow** | Non-data number transitions | Hold: no P0 surface qualifies under rules 1 and 3 of the motion specification | MIT |
| 10 | **mapcn** | Composition of MapLibre controls, popups and tooltips | Study only; its defaults conflict with ADR-0018 | MIT |

Why Base UI first: shadcn/ui made Base UI its default base in July 2026 and keeps Radix and React Aria as options (`shadcn init -b base|radix|aria`) [V]. The CLI pinned in the [technical architecture](../../docs/architecture/README.md) (4.21.4, published 2026-10-07) postdates that change, so pass `--base base` explicitly to make the choice deterministic. Of the three sliders checked (Base UI, Radix, React Aria), only Base UI documents both a configurable large step and a value-text callback, which the timeline needs (CMP-03).

Relation to the UI patterns research. That lane recommends shadcn AI Elements plus AffectUI's free files. This scan agrees on the bases (shadcn Slider, Toggle Group, Tabs, Sonner) and adds three points. (1) An inline citation built on `hover-card` needs a second route: Radix documents HoverCard content as unreachable by keyboard, and Base UI says the same of PreviewCard, so the chip must also open a focusable popover or the inspector. (2) For the map view switcher, Hairline's and Caliper's segmented controls are MIT alternatives to AffectUI's free one; either way, behavior stays on a Base UI part and a frequent control gets no animated highlight, as that research advises. (3) Kokonut UI's `ai-citations` already implements the linked highlighting that ADR-0040 asks for (a chip lights the sentence it backs) under MIT.

## Siterra surfaces: exact components

Each row names what to install, what to adapt or study, and what not to use. Component IDs refer to the [component specifications](../../docs/reference/components.md); motion IDs to the [motion specification](../../docs/reference/motion.md); islands to ADR-0040.

| Surface | Install (behavior) | Adapt or study (craft) | Do not use |
|---|---|---|---|
| **Prompt composer** (CMP-05 director, attached to the investigation sheet) | shadcn `textarea` or `input-group`, `button`, `kbd` on Base UI; Enter sends, Shift+Enter adds a line, "/" focuses | Study Hairline `prompt-composer` (no animation library, reduced motion in CSS). Kokonut `ai-prompt` is a second reference but runs 1,194 lines | Cult UI `prompt-composer` (gradient rim, shader avatar through `@paper-design/shaders-react`); React Bits `PromptBar` (license) |
| **AI answer or finding card** (the answer card in ADR-0040; CMP-09 evidence card, CMP-06 area card) | Own component: claim-kind glyph and words, scope line, provenance chip ([design system](../../docs/reference/design-system.md)) | Study Kokonut `ai-citations` for claim-plus-chips layout; Hairline `streaming-answer` for its state list only, since Siterra never animates partial model output (rule 4 of the motion specification) | Typewriter, text reveal and letter-wave loaders (SmoothUI `typewriter-text`, Kokonut `ai-text-loading`, Spell `shimmer-text`) |
| **Citation chips with hover preview** (CMP-09 provenance chip, CMP-10 ledger chips, CMP-15 inspector) | Chip is a native button that opens the inspector on click or Enter (MOT-07). Preview is a Base UI `Popover` opened on focus or click so its content is reachable; `PreviewCard` only as a pointer enhancement | Adapt Hairline `citation`: focus opens at once, Escape closes, `aria-describedby`, an unavailable source strikes the marker (maps to stale and missing). Adapt Kokonut `ai-citations`: one preview glides between chips and highlights the backed sentence (maps to linked highlighting). Study SmoothUI `ai-citation` | Radix `HoverCard` or Base UI `PreviewCard` as the only route to source details: both docs state the content is not keyboard or screen-reader reachable. Watermelon `preview-link-card` (built on Radix `HoverCard`, so pointer-only; no reduced-motion code found) |
| **Live task steps** (CMP-07 plan and activity, director milestones) | Own list driven by task events, polite live region, batched announcements ([accessibility requirements](../../docs/reference/accessibility-and-language.md)) | Adapt Hairline `task-log` and `plan` (polite live regions, reduced motion, MIT header in each file). Study Fluid `thinking-steps` (collapsible steps with source badges), SmoothUI `ai-task-list` and `ai-tool-call`, Kokonut `ai-agent-lanes` | Reasoning displays (Hairline `thinking-trace` reasoning tab, Fluid chain-of-thought mode): CMP-16 forbids hidden reasoning. Percent bars (CMP-07 forbids). Looping loaders (the design system forbids shimmer; the motion specification forbids ambient loops) |
| **Segmented view switcher** (map ornament view switcher; CMP-08 single, aligned, two-period; 2D or 3D) | Base UI `ToggleGroup` when options change one view's mode (map layer, comparison mode); Base UI `Tabs` with `Tabs.Indicator` only when each option shows its own panel. No animated highlight on the frequent map control; elsewhere at most the 120 ms feedback token on `transform` | Adapt Hairline `segmented-control` (radiogroup, roving focus, Home and End, motion removed under reduced motion; drop its overshoot). Study Caliper `segmented-control` (CSS only, no dependency) and the Ark `SegmentGroup` API | Cult UI `direction-aware-tabs` (no ARIA or keyboard code found); Watermelon `fluid-tabs`, `discrete-tabs`; React Bits `RubberSegment` |
| **Timeline scrubber** (CMP-03; a 40 px scrubber island until focused) | Base UI `Slider`: `step` one month, `largeStep` 12 (Shift+Arrow by year), `getAriaValueText` for "April 2022, 82% of area observed". Month cells drawn by Siterra. None of the primitives checked disables single values, so unavailable months are handled in app logic and explained in the value text | Study Hairline `changelog-scrubber`, `range-ruler`, `time-range-picker` (dense ARIA and key handling) | SmoothUI `scrubber` (spring-physics value scrubber for design tools, not a timeline); Watermelon `scrub-slider`; React Bits `ScrubField`, `ElasticSlider` |
| **Sheet or drawer** (CMP-15 inspector overlay, MOT-07; CMP-16 trace sheet, MOT-10) | Inspector: Base UI `Dialog` (focus to heading, Escape returns focus to the invoking control). Trace: Base UI `Drawer` with `snapPoints` at 0.45 and a deliberate `modal` choice (`false` keeps the map usable; `trap-focus` keeps focus inside). The 480 px investigation sheet itself is a persistent landmark region, not a dialog | Study Hairline `sheet` for reduced-motion handling | Vaul (unmaintained); ui-layouts `motion-drawer`, `directional-drawer`; Kokonut `smooth-drawer` |
| **Toast** (transient confirmations such as "Reference copied"; one at a time) | shadcn `toast` on Base UI (`priority`, F6 landmark, `limit`) or Sonner (polite live region, Alt+T, reduced-motion CSS). Status, failures and findings stay in the case pill, director and components | Study Hairline `toast-stack` | Cult UI `halo-toast`; Watermelon `inline-toast`; Stealth UI `promise-toast` |
| **Command menu** (optional; the director already takes "/") | If added: Base UI `Autocomplete` inside a `Dialog`, or shadcn `command` (cmdk) | Study Hairline and Caliper `command-palette` | Kokonut `action-search-bar` as the director (a search menu, not a command receipt); Watermelon `command-search` |
| **Data table** (chart table views, CMP-12 intervention comparison, CMP-13 measurement table, CMP-16 trace list) | Semantic `table` from shadcn; sticky first column for CMP-12 row labels. Add TanStack Table only if sorting becomes a requirement | Study Hairline `data-table` for empty, loading and error states | tablecn `data-table` (4,350 lines, dnd-kit, virtualization); OpenStatus `data-table-filters` (6,634 lines; pins conflict, see risks) |
| **Tooltip** (icon buttons, legend swatches, map ornament) | Base UI `Tooltip` through shadcn; unfamiliar actions keep a visible label ([design system](../../docs/reference/design-system.md)); nothing essential lives only in a tooltip | None needed | Watermelon `tooltip-animated`; Skiper UI `skiper101` |
| **Number transitions** (non-data UI only) | None in P0: rule 1 of the motion specification forbids counting numbers, rule 3 says values appear final | NumberFlow if a non-data counter is ever approved: `respectMotionPreference` defaults to true and it renders `role="img"` with the value as label | React Bits `CountUp`; Cult UI `rolling-number` (no reduced-motion code found); Skiper UI `skiper37` |
| **Map controls** (CMP-02 geo stage, map ornament; not in the brief's list) | Siterra's own MapLibre setup ([technical architecture](../../docs/architecture/README.md)) | Study mapcn `MapControls`, `MapPopup`, `MarkerTooltip` composition | mapcn defaults: CARTO style URLs and a MapLibre worker from unpkg conflict with ADR-0018 and the self-hosted worker; no reduced-motion code found for its camera calls |

## Design language fit

Siterra's direction is mineral relief, field precision: opaque islands over a full-bleed relief map, one accent, motion that reports a state change, data that never animates, durations of 120 to 360 ms on one curve without overshoot. Fit depends less on how striking a library looks than on three properties.

1. Restraint by default. Hairline UI, Caliper UI and Fluid Functionalism start from product UI: hairline borders, neutral surfaces, one moving element per state change. Most libraries named in the brief start from marketing delight: scroll parallax, shaders, gradient rims, liquid glass, cursor trails, text scrambles and count-ups (Skiper UI, React Bits, Fancy Components, Eldora UI, Animata, ui-layouts, Watermelon UI, Spell UI, Syntax UI, BuouUI, Hover.dev, Tailark). Those effects contradict the design system (no glass or blur over the map, no shimmer, no avatars) and the motion specification (no ambient loops, no counting numbers).
2. State honesty. The strongest pieces model states Siterra already specifies. Hairline's citation strikes the marker of an unavailable source and explains why in the card; its task log announces politely. That maps to the stale, missing and failed states of the design system instead of adding decoration.
3. Behavior from one primitive layer. The WCAG 2.2 AA target is easiest to meet when focus, dismissal and ARIA come from one maintained layer. With Base UI as the shadcn default, styling and timing can come from niche libraries while behavior stays in Base UI.

When adapting anything listed here: replace spring and overshoot curves with `cubic-bezier(0.22, 1, 0.36, 1)` and the 120, 220, 280 and 360 ms tokens; remove hover-only paths; wrap Motion trees in `MotionConfig reducedMotion="user"` and cap opacity fades at 120 ms, because Motion's setting removes transforms only (motion specification); delete any animation bound to a value. **[H]** Hairline UI's interaction quality is the closest match to Siterra's intended feel; this is a visual judgment from screenshots and code, not a user test.

## Risks

### Dependency weight

- Mixed primitive bases. With Base UI as the base, any Radix-built item adds a second primitive library: Caliper's command palette, drawer, toast and tooltip; Dice UI (built on `radix-ui`); Watermelon's data table and preview card; Skiper UI's tooltip; OpenStatus `data-table-filters`. React Aria kits (Intent UI, Untitled UI React, the React Aria registry) would add a third. Reject items built on another base. **[V]** from declared dependencies.
- Duplicate Motion. `motion@14.1.0` depends on `framer-motion` exactly 14.1.0. Skiper UI items declare `framer-motion` without a version, which would install a second copy (14.6.0 today); a `MotionConfig` set through `motion/react` would not reach components importing the other copy, so reduced-motion settings would silently stop applying there **[H]** (follows from React context identity; not run). React Bits items that use Motion declare `motion@^12.23.12`, two majors below the 14.1.0 pin.
- Conflicting pins elsewhere. OpenStatus `data-table-filters` declares `lucide-react@^0.469.0` (the stack pins 1.55.0) and `tailwind-merge@^2.6.0` (current major is 3). tablecn requires TanStack Table 9 plus `@querycn` packages. Cult UI's prompt composer pulls a shader package.
- Size. Single components run long: Kokonut `ai-prompt` 1,194 lines; Fluid `slider` 1,957 lines with eight registry dependencies; tablecn `data-table` 4,350; OpenStatus `data-table-filters` 6,634. Sampled Fluid items each resolve 5 to 15 shared registry files.
- Registry reliability. The shadcn index rates Cult UI degraded (30-day availability 88.7%), Tailark degraded (score 71.5) and Fluid Functionalism degraded. Registry URLs are unversioned, so content can change under the same name.

Mitigation (proposal): vendor once with the pinned CLI (`npx shadcn@4.21.4 add <url>`), review the diff, keep license header, source URL and retrieval date in the file, and never run `shadcn add` against third-party registries in CI.

### Animation excess

Spring physics and overshoot (SmoothUI, Fluid Functionalism, Hairline's segmented thumb), endless text loaders (Kokonut `ai-text-loading`), shaders and liquid glass (Cult UI, Skiper UI, React Bits, ui-layouts), count-ups (React Bits `CountUp`, Cult UI `rolling-number`, Skiper UI `skiper37`), smooth scrolling and GSAP timelines (Skiper UI). Each conflicts with the design system or the motion specification; adapting a component means removing these, not tuning them.

### Accessibility gaps

Static scan of sampled items. "Reduced motion" means code that reads the user preference (Motion hook or config, media query, Tailwind `motion-reduce`). Primitive-based kits get keyboard and ARIA behavior from the primitive, so their low marker counts do not indicate gaps; hand-rolled components carry their own.

| Registry | Items sampled | Reduced-motion code | Built on a primitive | Any ARIA or role |
|---|---|---|---|---|
| Hairline UI | 21 | 21 | 0 | 21 |
| Kokonut UI | 16 | 16 | 0 | 16 |
| SmoothUI | 22 | 18 | 9 | 18 |
| Caliper UI | 12 | 11 | 4 | 10 |
| Stealth UI | 12 | 10 | 8 | 10 |
| React Bits | 7 | 5 | 0 | 7 |
| Fluid Functionalism | 10 | 2 (handled in a shared provider) | 7 | 9 |
| Cult UI | 12 | 2 | 3 | 6 |
| Dice UI | 9 | 1 | 7 | 5 |
| Skiper UI | 5 | 1 | 1 | 3 |
| Watermelon UI | 13 | 0 | 3 | 2 |
| ui-layouts | 9 | 0 | 2 | 3 |
| Spell UI | 7 | 0 | 1 | 4 |
| Eldora UI | 3 | 0 | 0 | 1 |
| mapcn | 1 | 0 | 0 | 1 |
| React Aria registry, Intent UI, basecn, ark-cn | 36 | 1 | 35 | 19 |
| tablecn, OpenStatus data-table-filters, tool-ui | 8 | 3 | 3 | 8 |

Specific gaps that matter for Siterra: hover previews from Radix `HoverCard` and Base UI `PreviewCard` are documented as unreachable by keyboard and screen readers; Motion's `reducedMotion="user"` leaves opacity animating (Kokonut `ai-citations` relies on it); primitive kits animate with CSS classes and carry no reduced-motion rule, so Siterra needs one global `prefers-reduced-motion` rule regardless of source. No item here has been tested with assistive technology **[U]**.

### License traps

- Commons Clause. React Bits (MIT plus Commons Clause v1.0: no selling, sublicensing or redistributing the components themselves) and shadcn/studio (no sale or redistribution of unmodified components, no competing product). Copied files could not be sublicensed or redistributed on their own, which complicates publishing the repository under an open-source license later (a reading of the license text, not legal advice). The UI patterns research flags the same clause in Animate UI.
- No component license. Skiper UI's terms reserve all intellectual property and bar republishing or redistributing site material; no component license was found. ibelick's `background-snippets` and `ui-snippets` have no license file. Treat both as all rights reserved.
- Commercial tiers. Untitled UI PRO (no raw source in any product or open-source repository; the page states a USD 10,000 per breach liability), shadcn/studio Pro (no public repositories), Caliper Pro (no public repositories, no AI training), Hairline templates (no resale, no public template repositories), BuouUI (Standard license requires a free, non-monetized end product; source redistribution prohibited), Hover.dev (no standalone redistribution; footer requires written consent to redistribute). Keep all of these out of the repository.
- MIT still has a condition. The copyright and permission notice must travel with copied code. Sampled Hairline and Kokonut files carry headers; sampled SmoothUI, Caliper and Fluid files do not, so add one when vendoring. Apache-2.0 (React Aria) adds NOTICE handling if code is copied.
- Namespace confusion. Fancy Components self-declares `@fancy` at `fancycomponents.dev`; the official index lists `@fancy-ui`, a different project. Install by full URL, not by namespace guess.
- Project license. Siterra has not chosen a license (decision record); third-party notices stay with their files regardless ([contributing guide](../../CONTRIBUTING.md)).

### Maintenance

- Stalled. Vaul's README declares it unmaintained (last commit 2025-10-03, last release 2024-12-14); cmdk has had no release since 2025-03-14; Fancy Components has had no commits since 2026-03-14; Syntax UI none since 2026-05-18.
- New. Caliper's repository was created 2026-10-15; Hairline UI and Caliper UI were first observed by the shadcn index on 2026-10-16; Watermelon's repository was created 2026-10-09. Newness matters less for vendored source but there is no track record. Hairline names no individual and has no public repository.
- AI-assisted authoring at volume. Kokonut UI's contributor list includes an account named `claude` with 441 commits. Not a defect; it raises the value of reading every file before adopting.

## Library facts

All facts **[V]** on 2026-10-26 unless labeled. "Commits" counts the last 90 days (100+ means the API page limit was reached).

### Craft primitives

Base UI. Unstyled components from the team behind Radix, Floating UI and Material UI; maintained by MUI. MIT. `@base-ui/react` 1.9.0 (2026-10-09); date-fns peers optional. Roughly monthly minor releases in 2026 (1.1.0 on 2026-01-15 to 1.9.0); Drawer stable since 1.3.0 (2026-03-12). Documented: Slider `getAriaValueText`, `step`, `largeStep`; Tabs `Tabs.Indicator` with CSS variables, `activateOnFocus`, `loopFocus`; Toast `priority` (polite by default), F6 to the toast landmark, `limit` 3; Drawer extends Dialog with `snapPoints`, `swipeDirection` and `modal` (`true`, `false`, `trap-focus`); PreviewCard content not keyboard or screen-reader navigable. No built-in animation. Commits 100+. Inspection: homepage screenshot; docs pages for releases, slider, preview card, drawer, toast, tabs; npm; GitHub. Sources: [site](https://base-ui.com/), [repo](https://github.com/mui/base-ui), [slider](https://base-ui.com/react/components/slider), [drawer](https://base-ui.com/react/components/drawer), [toast](https://base-ui.com/react/components/toast), [tabs](https://base-ui.com/react/components/tabs), [preview card](https://base-ui.com/react/components/preview-card).

shadcn/ui base choice. Base UI became the default base in July 2026; React Aria became a first-class base the same month; a Toast built on Base UI primitives shipped in July 2026; the Base UI drawer migrated from Vaul to Base UI. Init flag `-b, --base <base>` with values `base`, `radix`, `aria`. Sources: [changelog: Base UI default](https://ui.shadcn.com/docs/changelog/2026-07-base-ui-default), [React Aria](https://ui.shadcn.com/docs/changelog/2026-07-react-aria), [Toast](https://ui.shadcn.com/docs/changelog/2026-07-toast), [drawer](https://ui.shadcn.com/docs/components/drawer), [CLI](https://ui.shadcn.com/docs/cli).

Radix Primitives. Made by WorkOS. MIT. `radix-ui` 1.8.1 (2026-10-12). Slider keyboard per docs: arrows by step, Shift+Arrow and Page keys by a larger step, Home and End; no documented value-text prop. HoverCard is documented as for sighted users only. Commits 100+. Fit: supported, but no longer the shadcn default; many niche items still import it. Inspection: screenshot; slider and hover-card docs; npm. Sources: [site](https://www.radix-ui.com/primitives), [repo](https://github.com/radix-ui/primitives), [slider](https://www.radix-ui.com/primitives/docs/components/slider), [hover card](https://www.radix-ui.com/primitives/docs/components/hover-card).

Ark UI. Chakra UI team; built on Zag.js state machines; React, Solid, Vue, Svelte. MIT. `@ark-ui/react` 5.39.3 (2026-10-05). Segment Group follows the radio pattern with an Indicator that exposes position and size variables. A shadcn wrapper registry `@ark-cn` exists (76 items). Commits 100+. Fit: study only; a third base. Inspection: screenshot; README; segment group docs; 9 `@ark-cn` items scanned. Sources: [site](https://ark-ui.com/), [repo](https://github.com/chakra-ui/ark), [segment group](https://ark-ui.com/docs/components/segment-group).

React Aria Components. Adobe. Apache-2.0. `react-aria-components` 1.22.1 (2026-10-09). Official registry `@react-aria` (159 items, Tailwind and vanilla CSS). Slider source: value text comes from `formatOptions` number formatting; Page keys, Home and End handled; Shift moves by a page size computed as one tenth of the range, with no prop for it in the source read (CMP-03 needs 12 months, about one seventh of an 84-month record). Commits 100+. Fit: the accessibility reference; kits built on it include Intent UI and Untitled UI React. Inspection: screenshot; slider source on GitHub; 8 registry items scanned. Sources: [site](https://react-aria.adobe.com/), [repo](https://github.com/adobe/react-spectrum).

Sonner. Emil Kowalski. MIT. 2.0.8 (2026-08-09). Source: polite live region, Alt+T moves focus to the toasts, `prefers-reduced-motion` media query in its stylesheet. Commits 3. Fit: install only if chosen over shadcn Toast. Inspection: screenshot; source read. Sources: [site](https://sonner.emilkowal.ski/), [repo](https://github.com/emilkowalski/sonner).

Vaul. Emil Kowalski. MIT. 1.1.2 (2024-12-14). README declares the repository unmaintained; last commit 2025-10-03. Fit: avoid; Base UI Drawer covers MOT-10. Inspection: screenshot; README. Sources: [site](https://vaul.emilkowal.ski/), [repo](https://github.com/emilkowalski/vaul).

cmdk. Paco Coursey; `cmdk.paco.me` now redirects to the repository under the `dip` organization. MIT. 1.1.1 (2025-03-14); last commit 2025-10-29; 52 open issues and 24 open pull requests when viewed. Listbox with `aria-activedescendant`. Fit: only if a command palette is added. Inspection: GitHub page screenshot; source read. Sources: [repo](https://github.com/dip/cmdk).

NumberFlow. Max Barvian. MIT. `@number-flow/react` 0.6.2 (2026-07-18); dependency-free. Source: `respectMotionPreference` defaults to true; renders `role="img"` with the value as accessible label. Commits 1. Fit: hold. Inspection: screenshot; source read. Sources: [site](https://number-flow.barvian.me/), [repo](https://github.com/barvian/number-flow).

### Libraries named in the brief

Skiper UI. Uncommon components for shadcn; maker listed as "gxuri" on the pricing page; no public repository found. No component license found; terms reserve all rights. Premium $129 one-time. Registry `@skiper-ui` (37 items named `skiper3` to `skiper106`: carousels, scroll and parallax effects, theme toggles, progressive blur, animated number, a Radix tooltip). Dependencies include unversioned `framer-motion`, `lenis`, `gsap`, `swiper`. Reduced-motion code in 1 of 5 sampled. Fit: avoid. Inspection: screenshot; pricing and terms pages; 5 items scanned. Sources: [site](https://skiper-ui.com/), [pricing](https://skiper-ui.com/pricing), [terms](https://skiper-ui.com/docs/terms-of-service).

Cult UI. Jordan (nolly-studio). MIT; a paid Pro line of AI SDK agent blocks. Registry `@cult-ui` (307 items; index rating degraded). Relevant items: `prompt-composer` (Base UI plus a shader avatar), `halo-segmented` (Base UI), `direction-aware-tabs`, `side-panel`, `floating-panel`, `popover`, `halo-toast`, `rolling-number`. Reduced-motion code in 2 of 12 sampled. Commits 22. Fit: low; study `halo-segmented`. Inspection: home and prompt composer screenshots; license file; 12 items scanned. Sources: [site](https://www.cult-ui.com/), [repo](https://github.com/nolly-studio/cult-ui).

Kokonut UI. Dorian Baffier. MIT; files carry a JSDoc MIT header; Kokonut UI Pro is paid. Site states backing by Vercel OSS. Registry `@kokonutui` (107 items) with an AI set: `ai-citations`, `ai-prompt`, `ai-input-search`, `ai-loading`, `ai-text-loading`, `ai-tool-approval`, `ai-agent-lanes`, `ai-message-queue`, `ai-context-meter`; also `smooth-tab`, `smooth-drawer`, `action-search-bar`, `toolbar`, `status-island`. Reduced-motion code in 16 of 16 sampled. `ai-citations` opens on focus, hides on Escape, links its `role="tooltip"` preview by `aria-describedby`, and wraps in `MotionConfig reducedMotion="user"`. Commits 100+. Fit: adapt `ai-citations`. Inspection: home and citations screenshots; license file; 16 items scanned; contributors list. Sources: [site](https://kokonutui.com/), [repo](https://github.com/kokonut-labs/kokonutui), [ai-citations](https://kokonutui.com/docs/ai/ai-citations).

SmoothUI. Edu Calvo. MIT. Site shows the Vercel 2026 open source program. Registry `@smoothui` (275 items) plus `smoothui-cli`. Primitive items on Base UI (tabs, toggle group, slider, toast, drawer, tooltip, preview card); command on cmdk. AI set: `ai-citation` (opens on hover and focus, closes on Escape), `ai-sources`, `ai-task-list`, `ai-tool-call`, `ai-reasoning`, `ai-prompt-input`. `scrubber` is a spring-physics value scrubber for design tools. Reduced-motion code in 18 of 22 sampled; sampled files carry no license header. Commits 100+. Fit: study; `ai-citation` is an alternative to Hairline's. Inspection: home, scrubber and citation screenshots; 22 items scanned. Sources: [site](https://smoothui.dev/), [repo](https://github.com/educlopez/smoothui).

Eldora UI. Karthik Mudunuri. MIT. Registry `@eldoraui` (115 items, labeled beta): marketing sections, text effects, device mockups. Reduced-motion code in 0 of 3 sampled. Commits 1. Fit: none. Sources: [site](https://www.eldoraui.site/), [repo](https://github.com/karthikmudunuri/eldoraui).

Spell UI. Maintainer "tom" (xxtomm). MIT per repository and terms page. Registry `@spell` (33 items: text effects, light rays, buttons, `kbd`, `spinner`). Reduced-motion code in 0 of 7 sampled (most are static). Commits 4. Fit: none needed. Sources: [site](https://spell.sh/), [repo](https://github.com/xxtomm/spell-ui), [terms](https://spell.sh/terms).

Fancy Components. Daniel Petho. MIT. Self-declared registry `@fancy` at `fancycomponents.dev/r/{name}.json`, absent from the official index. Text, cursor and physics effects. Last commit 2026-03-14. Fit: none. Inspection: screenshot; registry list; installation page. Sources: [site](https://www.fancycomponents.dev/), [repo](https://github.com/danielpetho/fancy).

React Bits. David Haz. MIT plus Commons Clause v1.0. Registry `@react-bits` (1,274 items across JS, TS, CSS and Tailwind variants) and a Pro tier. Items that use Motion declare `motion@^12.23.12`. WebGL backgrounds, cursor effects, a sound library. Reduced-motion code in 5 of 7 sampled. Commits 100+. Fit: avoid (license, Motion major, aesthetic). Inspection: home captured mid-intro and a component page screenshot; license file; 7 items scanned. Sources: [site](https://reactbits.dev/), [repo](https://github.com/DavidHDev/react-bits).

Animata. Codse, Pokhara, Nepal. MIT. Copy-paste only; no registry endpoint found. Animated marketing components. Commits 8. Fit: none. Sources: [site](https://animata.design/), [repo](https://github.com/codse/animata).

ui-layouts. Naymur Rahman. MIT; a paid Pro site. Registry `@ui-layouts` (327 items). Reduced-motion code in 0 of 9 sampled; its Motion drawer has no ARIA attributes and its directional drawer depends on Vaul. Commits 13; last 2026-08-22. Fit: avoid. Sources: [site](https://www.ui-layouts.com/), [repo](https://github.com/ui-layouts/uilayouts).

Hover.dev. Hover Dev, LLC. Custom license: free components allowed in commercial and open-source projects without attribution; no standalone redistribution or competing compilation; the footer requires written consent to redistribute. Pro paid. No public repository. Fit: none; public-repository use is ambiguous. Sources: [site](https://www.hover.dev/), [license](https://www.hover.dev/license).

Syntax UI. Ansub. MIT; Pro paid. Copy-paste. No commits since 2026-05-18. Fit: none. Sources: [site](https://syntaxui.com/), [repo](https://github.com/SyntaxUI/syntaxui).

BuouUI. Buou Technology Co. Ltd. Custom license (Standard and Extended, described in risks). No public component repository. Fit: avoid. Sources: [site](https://buouui.com/), [license](https://buouui.com/license).

Watermelon UI. Watermelon Corp. MIT. Registry `@watermelon` (1,178 items). Repository created 2026-10-09; commits 100+. Reduced-motion code in 0 of 13 sampled; ARIA or role in 2 of 13. Fit: avoid. Sources: [site](https://ui.watermelon.sh/), [repo](https://github.com/WatermelonCorp/watermelon-platform).

AlignUI. AlignUI Design System. Base Components described as open source, license not named on the page; CLI and starters MIT; Pro and Figma library commercial. `@alignui/cli` overwrites CSS and Tailwind config per its README. The Next.js starter (last pushed 2025-02-16) combines Radix, React Aria Components, cmdk and Sonner. A WCAG claim on the site was not audited. Fit: study only. Sources: [site](https://www.alignui.com/), [CLI](https://github.com/alignui/cli).

Untitled UI React. Untitled UI (Sisyphus Ventures Pty Ltd). MIT for the open-source repository; PRO under a separate license. Built on React Aria Components and Tailwind CSS 4.3 with React 19.3. CLI `npx untitledui@latest init --nextjs`, then `add`. Commits 15. Fit: study as a React Aria plus Tailwind v4 reference. Sources: [site](https://www.untitledui.com/react), [repo](https://github.com/untitleduico/react), [license](https://www.untitledui.com/license), [installation](https://www.untitledui.com/react/docs/installation).

shadcn/studio. ShadcnStudio. MIT plus Commons Clause; Pro restrictions. Registry `@shadcn-studio` (1,004 items). Commits 1. Fit: avoid (license). Sources: [site](https://shadcnstudio.com/), [repo](https://github.com/shadcnstudio/shadcn-studio), [license](https://shadcnstudio.com/license).

Tailark. Méschac Irung. MIT for free blocks; Pro one-time $249 to $499. Registry `@tailark` (476 items, index rating degraded). Marketing website blocks only. Commits 1. Fit: none. Sources: [site](https://tailark.com/), [repo](https://github.com/tailark/blocks), [pricing](https://tailark.com/pricing).

ibelick (Julien Thibeaut). Design engineer; Motion Primitives and prompt-kit belong to the other lane. `ui-skills` (MIT; commits 100+): agent skills such as `baseline-ui`, `fixing-accessibility`, `fixing-motion-performance` and `improve-ui`, with a CLI and an MCP endpoint. `mesurer` asserts no license on GitHub; `background-snippets` and `ui-snippets` have no license file; `zola` is Apache-2.0. Fit: `ui-skills` as review checklists for the coding agents. Sources: [site](https://ibelick.com/), [ui-skills](https://github.com/ibelick/ui-skills), [catalog](https://www.ui-skills.com/).

### Other libraries found in the registry index

Hairline UI. Company "Hairline UI"; no individual named and no public repository found. Components MIT with a header in every file; templates under a custom license. Registry `@hairline` (179 items); install by URL, for example `npx shadcn@latest add https://hairlineui.com/r/citation.json`. No animation library; React 19, Tailwind v4 and shadcn theme variables. Each component page has an accessibility and motion section. `citation`: focus opens the card at once, Escape closes it, the marker is a labeled link, the card is linked by `aria-describedby`, reduced motion skips the rise animation. `segmented-control`: `radiogroup`, roving focus, Home and End, wrap-around arrows, thumb transition removed under reduced motion. Reduced-motion code in 21 of 21 sampled. First observed by the shadcn index 2026-10-16. Fit: adapt. Inspection: home, citation and thinking-trace screenshots; citation and segmented-control pages; license page; 21 items scanned. Sources: [site](https://hairlineui.com/ui), [citation](https://hairlineui.com/ui/citation), [segmented control](https://hairlineui.com/ui/segmented-control), [license](https://hairlineui.com/license).

Caliper UI. Ashish Sharma. License v4 (2026-10-21): free parts MIT with the notice kept; Pro paid. Registry `@caliper` (93 items). The site claims keyboard and screen-reader states for its 92 free parts **[U]**. `segmented-control` is CSS only with a 180 ms glide and a reduced-motion media query; overlays use Radix. Reduced-motion code in 11 of 12 sampled. Repository created 2026-10-15. Fit: study. Sources: [site](https://caliperui.site), [segmented control](https://caliperui.site/docs/components/segmented-control), [license](https://caliperui.site/license), [repo](https://github.com/sarmaasis/caliperui).

Fluid Functionalism. Micka.design. MIT. Registry `@fluid` (84 items, index rating degraded) in Radix and Base UI flavors (`base/` prefix). Reduced motion is centralized in an optional provider that sets `MotionConfig reducedMotion="user"`. Proximity hover, springs, font-weight transitions. Components of interest: `thinking-steps`, `tabs-subtle`, `command-menu`. Commits 100+. Fit: study. Sources: [site](https://www.fluidfunctionalism.com), [repo](https://github.com/mickadesign/fluid-functionalism).

Dice UI and tablecn. Sadman Sakib. MIT. Dice UI registry `@diceui` (262 items) built on `radix-ui`: `timeline`, `stepper`, `status`, `relative-time-card`, `action-bar`. The `www` host returned HTTP 526 during this check while the apex domain worked. tablecn is a TanStack Table 9 data table. Fit: study only (Radix base, size). Sources: [Dice UI](https://diceui.com/), [repo](https://github.com/sadmann7/diceui), [tablecn](https://www.tablecn.com/), [repo](https://github.com/sadmann7/tablecn).

mapcn. Anmoldeep Singh. MIT. Registry `@mapcn` (9 items); `maplibre-gl@^6`. Exports Map, MapControls, MapPopup, MarkerTooltip, MapGeoJSON, MapClusterLayer and route helpers. Defaults described in the surface table. Commits 29. Fit: study only. Sources: [site](https://www.mapcn.dev/), [repo](https://github.com/AnmolSaini16/mapcn).

Intent UI. Irsyad A. Panjaitan. MIT. React Aria Components plus Tailwind; registry `@intentui` (582 items). Commits 100+. Fit: study. Sources: [site](https://intentui.com), [repo](https://github.com/irsyadadl/intentui).

Seen in the index and not evaluated beyond it: **Stealth UI** (`@stealth`, Base UI plus Motion, citations, task steps, segmented control; no license statement found, so not adoptable until one is), **tool-ui** (AI tool output widgets; overlaps the other lane), **basecn** (shadcn on Base UI), **OpenStatus data-table-filters**, **terrae** (Mapbox and MapLibre components), **sureui** (confirmation components on Base UI).

### Inspiration galleries (patterns only)

| Gallery | What it is | Access observed | Inspection |
|---|---|---|---|
| [Mobbin](https://mobbin.com/) | Reference library of shipped app and site screens, with an MCP | Free tier after sign-up with limits (apps and sites limited, flows not included, up to 3 collections, limited copy and download); Pro $10 per month billed yearly; Team $16 per member per month billed yearly | Landing screenshot (cookie banner left unanswered); pricing page HTML |
| [Refero](https://refero.design/) | Product screens, flows and styles for web and iOS, a research mode and an MCP | Pricing renders client-side and was not retrieved; sign-in requirements **[U]** | Landing screenshot |
| [Godly](https://godly.website/) | Redirected to Recent (recent.design), a feed of web, interface, motion and launch-video inspiration | Browsable without sign-in at first load; log-in and sign-up offered; relationship to Godly not stated **[U]** | Screenshot after redirect |
| [Land-book](https://land-book.com/) | Landing pages and sections | Basic free with limited access; Pro from $6 per month (page HTML) | Headless capture met a Cloudflare security check; not bypassed |

Gallery use is pattern study only. Captures of third-party products stay in `design/private/` per the [contributing guide](../../CONTRIBUTING.md); their MCP integrations need accounts and are out of scope.

## Sources not listed above

- [shadcn registry index](https://ui.shadcn.com/r/registries.json) and [registry directory](https://ui.shadcn.com/docs/directory)
- npm registry entries for `@base-ui/react`, `radix-ui`, `@ark-ui/react`, `react-aria-components`, `sonner`, `vaul`, `cmdk`, `@number-flow/react`, `motion`, `untitledui`, `@alignui/cli` (queried with `npm view`)
- Secondary roundups found by web search, used only for discovery: [WrapPixel](https://www.wrappixel.com/shadcn-ui-libraries/), [AdminLTE](https://adminlte.io/blog/shadcn-ui-block-libraries/), [DesignRevision](https://designrevision.com/alternatives/shadcn.md)
