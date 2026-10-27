# UI patterns for a cleaner Siterra

Status: research with recommendations, inspected 2026-10-26. Public-safe: links and paraphrase only, no third-party images, at most one short quote per source. The screenshots (`ui-*` files) and a machine-readable list (`ui-manifest.json`, entries UI-01 to UI-56) are kept in the gitignored `design/private/references/` folder and are not redistributable. Earlier references VIS-01 to VIS-29 are in the [design source register](source-register.md).

Nothing here is a decision by itself. The layout recommendations marked [D] were accepted in [ADR-0040](../../docs/decisions/0040-present-the-investigation-as-floating-islands-over-a-full-bleed-map.md) and [ADR-0044](../../docs/decisions/0044-build-the-interface-on-shadcn-with-base-ui-and-mit-components.md); they change [ADR-0006](../../docs/decisions/0006-use-a-guided-adaptive-investigation-workspace.md), [ADR-0009](../../docs/decisions/0009-adopt-the-mineral-relief-visual-direction.md) and the specs in [UX architecture](../../docs/reference/ux-architecture.md), [Design system](../../docs/reference/design-system.md) and [components](../../docs/reference/components.md) only after they are accepted in [decision log](../../docs/decisions/README.md). Labels follow the [planning index](../../docs/README.md): **[V]** observed in, or computed from, the primary source on the inspection date; **[D]** design recommendation; **[H]** hypothesis to test; **[U]** not inspected, blocked or unconfirmed.

How sources were inspected. Headless Chrome at 1440 px width (900 px tall for pages, 1100 to 1300 px for component previews) with a fresh profile and virtual time; the desktop browser pane for interactive states (streaming replay, hover, style toggles), with computed styles read on the rendered public page; page text, GitHub API metadata, license files and npm registry metadata. No account was used, nothing was bought, submitted or installed, cookie prompts were declined or left unanswered, and bot checks were not bypassed. Several looping demos were captured mid-animation or on an empty frame; the manifest says which.

## Summary

1. The prototype reads as "too much" because of density, not palette: in scene 5 about 20 visual groups and about 100 text or control items are visible at once, and the unobstructed map is about 43% of a 1440 × 900 frame (section 1). [V, computed from the screenshot]
2. AffectUI is a three-week-old, one-maker React library. Its free items are MIT and may be installed; its Pro items, including AI Answer, are paid and may not be published in a public repository, so they are study references for Siterra unless the repository stays private (section 2). [V]
3. In every inspected "clean" system, clean means fewer layers, fewer type sizes, thinner edges and detail on demand. AffectUI's Clean style removes the outer bezel, shrinks the type two steps and replaces 1 px borders with a 0.5 px ring; Magic Patterns places one inset work surface, one thread column and one floating composer inside a neutral frame (sections 2 and 3). [V]
4. Recommended direction: **map-first floating islands with two-level progressive disclosure**, built on shadcn/ui AI Elements (MIT) plus three free AffectUI files (MIT), with AffectUI Pro, Magic Patterns and Perplexity used as study references (section 8). [D]
5. Keep the dark theme; keep text panels opaque; if glass is wanted, use it only on small control islands at 90% tint or more (sections 6 and 10). [D]
6. The forgotten pattern name is most likely **progressive disclosure**; the next candidates are **glassmorphism** (Apple's current name for its version: Liquid Glass) and **bento grid** (section 7). [H, confirm with the founder]

## 1. Diagnosis: why the prototype is dense [V, computed]

Counted on the first prototype's scene 5 and scene 1 screenshots at 1440x900 (v1, replaced by the v2 screenshots on 2026-10-27; the v2 counts are measured by the prototype's budget overlay and reported in the [UX architecture](../../docs/reference/ux-architecture.md#visual-budget) checks). Counts are approximate; area shares come from the panel geometry in the screenshots.

| Measure | Scene 5 (Explanations) | Scene 1 (Arrival) |
|---|---|---|
| Separate visual groups (bars, panels, cards, strips, legend) | about 20 | 4 |
| Text or control items outside the map | about 100 | about 25 |
| Controls visible without hover | about 29 | 12 |
| Status or honesty tags | 5 (concept prototype, simulated assessment, two illustrative-values boxes, simulated) | 1 |
| Kinds of chip | 3 (evidence IDs, context, suggestion) | 0 |
| Unobstructed map share of the frame | about 43% | about 77% |

The main contributors are an eight-item case bar, four map buttons, a nine-line legend card over the map, a five-line attribution block, four hypotheses each carrying three labeled chip groups, two charts, a separate "updated" line, a suggestion chip, three context chips and a three-row temporal strip. Nearly every element draws its own border, and two tags use dashed boxes. The honesty labels are required (AGENTS.md, ADR-0024); the fix is to consolidate them, not to remove them.

## 2. AffectUI (UI-01 to UI-16)

URLs: https://www.affectui.com/components/ai-answer, https://www.affectui.com/components, https://www.affectui.com/pricing, https://www.affectui.com/license, https://www.affectui.com/terms, https://www.affectui.com/docs/installation, https://github.com/flohoeller/affectui

### What it is [V]

- Product. A library of components, full screens, blocks, illustrations and motion effects for AI products; site navigation on 2026-10-26 counts 66 components, 15 screens, 11 blocks, 24 illustrations and 8 motion effects. Each item is one self-contained `.tsx` file with its styles inside. It needs React 19, TypeScript and an `@/*` path alias, and needs neither Tailwind nor an animation library. Two visual styles (Classic and Clean), light and dark themes, copy-prompt buttons for AI coding tools and an MCP server.
- Maker. Florian Höller, trading as adfects, Wrocław, Poland (Terms, section 1). Repository `flohoeller/affectui`: created 2026-10-03, last push 2026-10-26, 316 stars, one maintainer.
- Install. shadcn CLI against `https://www.affectui.com/r/<name>.json` or the `@affectui` namespace. Free endpoints answered HTTP 200 (`segmented-control-clean`, `thinking-loader-clean`, `tool-call-card-clean`, `message-actions-clean`); Pro endpoints (`ai-answer`, `cited-answer`) answered 401 because they require a personal bearer token.
- Pricing. Free: 40 items. Individual: USD 199 once (the first 25 licenses sold at 99, the next 25 at 149). Team: USD 499 once for 10 seats. Updates included.
- Quality signals (read, not tested). Every page states when to use and not to use the item, keyboard behavior, accessibility (the Thinking Loader is a polite live status region) and motion. The AI Answer stylesheet removes every animation and transition under reduced motion and enlarges targets to 36 px (follow-up rows to 44 px) under a coarse pointer. The library is very new and single-maintainer: treat it as a reference, not as a dependency, apart from small free files that Siterra copies and owns.

### What Siterra may legally do [V for the terms; D for the advice; not legal advice]

| Item | Terms on 2026-10-26 | Siterra |
|---|---|---|
| Free items: 17 components (each in Classic and Clean variants), 2 blocks, 17 illustrations, 4 motion effects, all in the public repository | MIT (Terms section 4; repository LICENSE); keep the notice | May install, modify and publish, including in a public repository |
| Pro items: AI Answer, Cited Answer, Chat Composer, Thinking State, Agent Plan, Review Center, Command Menu, Agent Ledger, Conflict Radar, screens and others | Paid per-seat license for unlimited personal, commercial and client projects. Not allowed: publishing Pro source on its own (the License page names a public repository, and lists open-source projects as not covered), UI kits or templates, page builders or design tools, sharing a seat | Keep Pro source out of the Siterra repository while ADR-0025 (public by default) and the publication gate stand. Buying is sensible only if the repository stays private and every developer who touches the files holds a seat (two or more people means the Team license) |
| The look seen in previews | The license covers source code; the terms forbid obtaining Pro source without a license and scraping the site; logos in previews are not licensed | Study anatomy and behavior, then build Siterra's own components on MIT bases. Do not transcribe a Pro component's markup or CSS from developer tools |

### AI Answer: observed anatomy [V]

Inspected in the browser pane in the Clean style, dark theme: streaming replayed with the preview's reset control, a citation chip hovered, computed styles read on the public preview, and the Classic style compared.

- Container. One card, 10 px radius, neutral near-black surface (#1C1C1E), no border; a 0.5 px white ring at 10% plus a 1 px drop shadow; inner padding 20, 20 and 16 px. The card's height animates over 360 ms as content arrives.
- Type. Inter. Question 15/24 at weight 500; body 13/20; meta 12/16; chips 11 px at weight 500; section label 10/16 at weight 500, 0.5 px tracking, upper case. Text tiers are white at 100, 90, 62 and 46%: computed contrast on the card is 13.9, 7.2 and 4.6 to 1 for the last three. A 28% tier is used only for index numbers and glyphs (2.5 to 1, decorative).
- Order of parts. The question; a horizontal row of source tiles (168 × 77 px, 8 px radius, favicon, site name, index number, two-line title, 8 px gaps, overflow scrolls); a status line with a small sparkle mark that moves from a count of sources being read, to writing, to answered; the answer (bold lead word, a few bulleted facts with bold labels); a related-questions list of two follow-ups as full-width rows with hairline separators and an arrow; a 44 px footer with copy, regenerate and two feedback icon buttons (28 px, 6 px radius) and the elapsed time. A Stop button shows while streaming; thumbs-down opens a row of reasons.
- Citations. An 18 px chip after the sentence: 5 px radius, white fill at 8%, the first source's name plus a count of the others when several sources back the sentence. Hover or focus opens a 300 px popover (10 px radius, 4 px padding, deeper shadow) listing each cited source, and the cited tiles in the source row light up while the others stay flat. Touch adds an invisible 10 px hit margin.
- Motion. All on cubic-bezier(0.22, 1, 0.36, 1), the curve Siterra already specifies. Tiles rise 4 px and scale up from 0.97 over 460 ms; words fade in from a 3 px blur over 420 ms; chips pop from 0.8 scale over 380 ms; labels fade up 3 px over 320 ms; the popover drops 4 px from 0.98 scale over 200 ms; hover colors change over 160 ms.
- Clean versus Classic. Classic wraps the card in an outer bezel (20 px radius, 4 px padding), uses a 16 px inner radius, a 1 px ring, an 18 px question, a 15 px body and a colored answer avatar. Clean removes the bezel and avatar, shrinks the type two steps and uses the 0.5 px ring. This is the most concrete evidence found of what "clean" means in practice. [H: that this difference is what the founder responded to]

### Other AffectUI items relevant to Siterra

"Observed" means a rendered preview was viewed; "text" means only the page's own description and motion notes were read.

| Item (tier) | What it does | Siterra use |
|---|---|---|
| Cited Answer (Pro), observed | Header with source count and pages read; small numbered markers in the text; pointing at a source chip tints every sentence that cites it and fades the rest; a click unfolds the quoted passage with the matching words marked; footer says how many sentences cite the selected source | Evidence citations: the linking behavior, not the code (section 8) |
| Chat Composer (Pro), observed | One card: placeholder, attach, request approval, model menu, microphone, send (disabled until text); an attached tray for connecting apps | Composer anatomy only; Siterra has no apps, models or approvals to pick |
| Thinking State (Pro), observed | Collapsible thinking header with a live timer, a row of searched-source chips, steps that appear one at a time | Not adopted as a whole (it displays reasoning); the searched-sources row maps to "Retrieved 6 of 7 sources" |
| Thinking Loader (free, MIT), observed | A pill with an eight-ray spinner and a label that rolls through real phases and settles on a check; polite live region | Install for the director's running state |
| Agent Plan (Pro), observed | A plan header with the step count and a title; numbered rings that turn into checks along a connecting line; each step has a detail line, a monospaced tool chip and its duration; the current step shows a spinner and a live timer; a footer with the running step out of the total and the elapsed time; reorder before running; retry from a failed step | Live task progress (study) |
| Agent Steering (Pro), observed mid-animation | A user correction typed during a run appears under the step it affects, marked as picked up or interrupted | The drought challenge sent while work is running |
| Tool Call Card (free, MIT), observed | A tool call on one line with live timer and status; folds open to arguments and result; a group line with the tool count and total time | Install for the trace inspector (C16) |
| Review Center (Pro), observed | Progress (reviewed out of total, age of the oldest item); filter tabs; list of pending items; detail with a reason line and labeled fields; action bar with Approve, Edit, Reject and Skip, each with a one-key shortcut | Decision and review (study) |
| Decision Inbox (free, MIT), text and faint preview | Two quick answers per decision; answered rows confirm and fold away; its own guidance rules it out for decisions that need explanation | Not for Siterra's role reviews |
| Agent Ledger (Pro), observed | Each change as verb, object, a before-to-after line with the old value struck through, time and source; undone rows dimmed; counts of changes and undone | Case history and staleness (C18) |
| Conflict Radar (Pro), observed | A compact matrix (files by branches) with a legend of states and a summary of settled items below | Hypothesis matrix layout (study) |
| Context Map and Context Window (Pro), observed | Treemap and cell grid of context use; empty space hatched | Not applicable; the hatched-empty convention matches Siterra's missing-data hatch |
| Autonomy Dial, Permission Request, Approval Card (Pro), observed | Autonomy levels, risk badges, time-boxed permissions, approve or deny | Not applicable: Siterra has no outbound tools (ADR-0024) |
| Command Menu (Pro), observed | Command-K palette with sections, shortcuts and footer hints | Optional power-user palette; shadcn/ui Command is the MIT equivalent |
| Segmented Control (free, MIT), observed | Three variants: filled segments with a count badge, compact icon-and-label, underline tabs; for two to six views that apply immediately | Install for the map view switcher |
| Progress Tracker and Change Summary (free, MIT), text | Onboarding checklist with an animated bar; one metric per row with a colored trend | Not adopted: no percentages and no trend arrows on scientific values |
| Message Actions (free, MIT), observed | Copy, retry, rate and listen under a message | Only "copy reference" fits; Siterra does not regenerate findings |
| Notification Stack (free, MIT), observed | A dismissible announcement card stack | Optional for background results; one at a time |
| Screens (Agent Run, Assistant Home, Agent Chat) and the AI Workspace block (Pro), observed | Whole layouts: run page with plan, activity and a pane for items awaiting the user; greeting with centered composer and suggestion chips; chat with an artifact side panel | Layout study only |

## 3. Magic Patterns: why it reads as clean (UI-17) [V]

URLs: https://www.magicpatterns.com/, https://www.magicpatterns.com/docs/documentation/magic-os/overview, https://www.magicpatterns.com/docs/documentation/magic-os/agents-and-threads. Inspected: headless captures of the home page and two docs pages (a guessed third docs URL returned 404), the home page scrolled in the browser pane with computed styles read, and the product screenshot embedded in the MagicOS overview page enlarged. The signed-in application was not opened. Proprietary: pattern reference only.

What the product screenshot shows:

- One frame, one inset surface. The whole app sits on a light neutral frame; the work canvas is a single white rounded panel inset from it, with a faint dot grid and mostly empty space.
- Chrome reduced to one row. Logo, document name and plain text menus on the left; an avatar, two icon buttons and one dark share button on the right. No toolbar band.
- A borderless thread column. Threads sit directly on the frame without a card; messages are soft gray bubbles; a narrow icon rail at the far right holds two icons.
- One floating composer. A white rounded card at the bottom of the thread column with a placeholder, an add button, a microphone and a round send button.
- Tools float at the canvas edge instead of docking. A three-button vertical palette sits there; a dark pill tooltip is the only high-contrast element.
- Color only in content. The chrome is monochrome; color appears in the work itself.

Marketing-site tokens (computed): ink is a near-black teal, oklch(0.18 0.031 198.6); borders are that ink at 12% opacity; page background rgb(252, 252, 253); buttons 36 px tall, 8 px radius, Inter 14 px at weight 500, 16 px side padding, primary filled with ink, secondary with ink at 5%, with a 1 px inner top highlight and a 1 px soft drop shadow; cards 16 px radius with a 1 px border; display type Poppins 500 with tight tracking. The feature section is a bento grid (two large and three small cards). Status-grouped threads (Needs you, In progress, Done) are already captured as VIS-01.

The transferable lesson is structural: one neutral frame, one work surface, one conversation column, one composer, and nothing else permanently visible. The neutral ink is close to Siterra's own ground color, so the "clean" feeling does not depend on Magic Patterns being light. [H]

## 4. Open-source AI UI kits (UI-18 to UI-34)

All licenses were checked against repository license files or the GitHub license API on 2026-10-26.

| Kit | Relevant components | License [V] | Install [V] | Verdict for Siterra [D] |
|---|---|---|---|---|
| **shadcn/ui AI Elements** (https://ui.shadcn.com/docs/ai-elements) | Inline Citation, Sources, Plan, Task, Queue, Prompt Input, Suggestion, Confirmation, Tool, Subagent, Message, Chat, Reasoning, Chain of Thought; all built on Trace; Base UI, React Aria and Radix variants | MIT | Patterns are copied, not packaged: `pnpm dlx shadcn@latest add trace` plus each pattern's dependencies (Inline Citation: `pnpm dlx shadcn@latest add hover-card button`), then copy the pattern code | **Primary base.** Siterra already plans owned shadcn components; one-line steps, a "Used 3 sources" disclosure and hostname citation pills are the cleanest anatomy seen |
| **Vercel AI SDK Elements** (https://elements.ai-sdk.dev) | 49 files including Artifact, Canvas, Node, Edge, Inline Citation, Sources, Task, Tool, Plan, Queue | Apache-2.0 | `npx ai-elements@latest add <name>` or the shadcn URL `https://elements.ai-sdk.dev/api/registry/<name>.json` | **Do not start new work on it.** Its README and site banner say it will be deprecated at the end of November 2026 in favor of the shadcn/ui version; Artifact and Canvas have no shadcn replacement and are composed from Card, Button and React Flow instead |
| **assistant-ui** (https://www.assistant-ui.com) | Thread, Composer, action bar, tool UI, generative UI, runtimes for many backends | MIT (npm `@assistant-ui/react`) | `npx assistant-ui@latest create` | Skip: it is a chat runtime and Siterra is not chat-first (ADR-0006) |
| **prompt-kit** (https://www.prompt-kit.com) | Prompt Input, Prompt Suggestion, Source (hover description), Steps, Thinking Bar (with a skip action), Text Shimmer, Tool, Reasoning, Feedback Bar, System Message | MIT | `npx shadcn add "https://prompt-kit.com/c/<name>.json"` | Good alternates: Source, Steps, and System Message for the demo and limits banner |
| **Motion Primitives** (https://motion-primitives.com) | Toolbar Dynamic and Toolbar Expandable (a pill that grows), Morphing Popover, Transition Panel, Animated Background, Image Comparison, Progressive Blur, Text Shimmer | MIT (a separate paid site exists, not inspected) | `npx motion-primitives@latest add <name>`, plus `motion` | Optional: the director's receipt can morph out of the composer; everything else is decoration |
| **Magic UI** (https://magicui.design) | Bento Grid, Blur Fade, Animated List, Number Ticker, Marquee, Globe, Dotted Map and many effects | MIT (Pro templates USD 199) | `pnpm dlx shadcn@latest add @magicui/<name>` | Avoid in the working app: marketing effects, and data never animates (ADR-0010) |
| **coss ui, formerly Origin UI** (https://coss.com/ui) | Base UI primitives (accordion, autocomplete, preview card, toolbar, toggle group, meter, sheet, toast and more) and 529 "particles" | Mixed: `apps/ui` and `apps/origin` MIT, rest of the repository AGPL-3.0 (LICENSING.md) | `pnpm dlx shadcn@latest add @coss/ui` | Usable alternative primitives; confirm each copied file comes from an MIT path |
| **Kibo UI** (https://www.kibo-ui.com) | Glimpse (link preview), Comparison (before and after slider), Status, Pill, Relative Time, Tree, Gantt, Kanban; no AI package in the current repository even though the docs intro still mentions chat primitives | MIT (now `shadcnblocks/kibo`; last push 2026-05-04) | `kibo-ui` CLI from npm, or the shadcn registry | Glimpse for citation previews if shadcn Hover Card is not enough; Comparison only for a P1 two-period view |
| **Animate UI** (https://animate-ui.com) | Animated Radix, Base UI and React Aria primitives (tabs, popover, tooltip, dialog and more) | MIT plus Commons Clause (not an open-source license): usable inside an app, components may not be sold or redistributed as such | `npx @animate-ui/cli@latest animate all` | Read its motion rules (exits faster than entrances, transforms and opacity only, nothing animated on keyboard navigation): they match Siterra's. Installing is allowed inside the app |
| **Aceternity UI** (https://ui.aceternity.com) | Effects: liquid-glass surface, background beams, 3D cards, image loaders | Free-tier terms not found; the Pro license forbids redistributing source files | Copy and paste | Study only; the style conflicts with cartographic restraint |
| **21st.dev** (https://21st.dev) | Community marketplace of shadcn-based components and blocks | Per author; 21st Labs terms restrict redistribution and require a link back | Per component | Study only, unless a component page states an open-source license |

## 5. Answer-engine and agent interfaces (UI-35 to UI-39)

- **Perplexity** (https://www.perplexity.ai, Discover and one public Discover article). Inspected logged out; optional cookies declined; a sign-in prompt was ignored. [V] The article page is a single reading column (about 710 px) with a serif headline (36.8/46) and serif body (16/26); inline citations are tiny monospaced hostname pills (10 px, 6 px radius, 6% fill) at the end of a sentence, with a count for extra sources; a row of four source cards (171 × 68 px, 8 px radius) sits under the lead paragraph; the follow-up composer is pinned to the bottom of the reading column (radius 20 px, filled, no border, no blur). The logged-out home is a centered question composer with two suggestion cards. The citation hover card was not observed. [U]
- ChatGPT canvas. Both https://openai.com/index/introducing-canvas/ and the help article returned a bot-verification page in headless Chrome; not bypassed, nothing observed. [U]
- **Claude artifacts** (https://support.claude.com/en/articles/9487310-what-are-artifacts-and-how-do-i-use-them). Help article only; the product needs sign-in. [V, text] An artifact opens in its own window beside the conversation, keeps versions per edited message and is saved to an Artifacts tab. Siterra already applies the same split: the investigation column is the artifact and the director is the conversation, without a transcript as the main surface (ADR-0006).
- Linear. Covered by VIS-03 (receding chrome, fewer separators) and VIS-29 (triage verbs). The 2026-10-26 home capture showed only a blurred loading hero and adds nothing.
- **Raycast** (https://www.raycast.com, https://www.raycast.com/core-features/ai). Marketing pages only. [V] The AI window mock is a left list of chats and a thread with a thinking indicator; the launcher itself is the canonical command bar (section 7).

## 6. Glass over a map: is it readable? (UI-40 to UI-45)

| Source | What it says [V] |
|---|---|
| Apple HIG, Materials (https://developer.apple.com/design/human-interface-guidelines/materials) | Liquid Glass is a separate functional layer for controls and navigation that floats above content; do not use it in the content layer; use it sparingly; the regular variant (blur plus luminosity adjustment) is for components with significant text; the clear variant is for components over visually rich media, with a dark dimming layer at 35% if the content beneath is bright; thicker materials give better contrast for fine text; people can turn on reduce transparency and increase contrast |
| Apple HIG, visionOS ornaments (VIS-26, re-used) | Controls attach to the edge of the window they control, stay put while content scrolls, are few, and are no wider than the window |
| NN/g, "Glassmorphism: Definition and Best Practices" (Megan Brown, 2024-06-07), https://www.nngroup.com/articles/glassmorphism/ | Translucent panels over busy backgrounds lose contrast; use more blur over busy backgrounds, check contrast against every background the panel can sit on, offer reduced transparency, use the style sparingly |
| NN/g, "Liquid Glass Is Cracked, and Usability Suffers in iOS 26" (Raluca Budiu, 2025-10-10), https://www.nngroup.com/articles/liquid-glass/ | Translucent floating controls lose contrast over busy content; icons in Apple Maps blend into what is behind them |
| W3C, Understanding SC 1.4.3 (https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) | 4.5:1 for normal text and 3:1 for large text against the background in normal use; failure F83 covers text over background images without sufficient contrast |
| MDN, `prefers-reduced-transparency` (https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-transparency) | Experimental, limited availability, not Baseline: the default styling must already be legible |

Computed check [V]: a panel tinted with Siterra's `surface` (#1C292B) over the brightest plausible map color in the current palette (the mineral outline, #B3AA8C) needs a tint of at least 90% before `text-muted` passes 4.5:1 (it reaches 4.52 at 90%; `text-2` reaches 6.0). At 85% over white, `text-2` drops to 4.47 and fails. `border-control` stays below 3:1 at 90% over light map colors, so controls on glass must be identified by fill and label, not by border alone.

Conclusion [D]. A 3D relief with data rasters is exactly the busy, variable background the guidance warns about. Keep text panels opaque (as ADR-0009 already says). If a softer look is wanted, use a near-opaque frost (90% tint or more, with blur) only on the small control islands, and verify contrast over the brightest arrival and data states.

## 7. Pattern names (UI-46 to UI-56)

| Name | One-line definition (paraphrased) | Source |
|---|---|---|
| Progressive disclosure | Show the few most important options first and put advanced ones in a clearly labeled secondary layer; two levels work best | Jakob Nielsen, NN/g, 2006-12-03, https://www.nngroup.com/articles/progressive-disclosure/ |
| Chrome, kept minimal | Chrome is the interface layer around the content; it costs screen space, so keep only what earns it (Nielsen warns of "chrome obesity") | Jakob Nielsen, NN/g, 2012-01-29, https://www.nngroup.com/articles/browser-and-gui-chrome/ |
| Floating functional layer (Liquid Glass) | Controls and navigation float in their own layer above content, never inside it | Apple HIG, Materials |
| Ornament | Controls attached to the edge of the region they control | Apple HIG, Ornaments (VIS-26) |
| Glassmorphism | Frosted, translucent panels that separate foreground from background, with legibility risks | Megan Brown, NN/g, 2024 |
| Bento grid | A grid of rounded compartments of different sizes, named after the Japanese lunch box; size signals priority | David Jaja, freeCodeCamp, 2024-04-04, https://www.freecodecamp.org/news/bento-grids-in-web-design/ (no authoritative primary definition found) |
| Command bar or command palette | A bar summoned by a shortcut (often Command-K) where people type the action instead of finding it in menus | Maggie Appleton, "Command K Bars", https://maggieappleton.com/command-bar |
| Focus mode | Highlight the active item and dim everything else | iA Writer, https://ia.net/writer/support/editor/focus-mode |
| Citations | Link generated output to its sources so people can verify it; hover previews; say when a citation is missing | Emily Campbell, Shape of AI, https://www.shapeof.ai/patterns/citations |
| Action plan | Show the agent's intended steps before it runs, editable and collapsible | Shape of AI, https://www.shapeof.ai/patterns/action-plan |
| Stream of thought | A visible record of plan, tool calls and checks, kept separate from evidence | Shape of AI, https://www.shapeof.ai/patterns/stream-of-thought |
| Suggestions and follow-ups | Wayfinders that offer the next prompt | Shape of AI, https://www.shapeof.ai/ |
| Brushing and linking | Selecting items in one view highlights the same items in every linked view | Becker and Cleveland, 1987, via https://en.wikipedia.org/wiki/Brushing_and_linking |
| Analysis of Competing Hypotheses (ACH) | A matrix of hypotheses against evidence that rates consistency and works to disprove rather than confirm | Richards J. Heuer Jr., *Psychology of Intelligence Analysis*, CIA, 1999, https://www.cia.gov/resources/csi/books-monographs/psychology-of-intelligence-analysis-2/ (chapter 8 per https://en.wikipedia.org/wiki/Analysis_of_competing_hypotheses) |

The name the founder forgot [H]. Most likely **progressive disclosure**: it is the established pattern for "too much on screen". If the founder was picturing a look rather than a behavior, the candidates are **glassmorphism** or Apple's **Liquid Glass** (translucent panels floating over the map), a **bento grid** (Magic Patterns' feature section) or a **command bar** (one input that does everything). One question settles it: is the remembered idea about how much shows at once, how panels look, or where the controls live?

## 8. Recommended cleanest pattern set [D]

### 8.1 Layout: map-first floating islands

At 1440 × 900 the map stays full-bleed and is never resized (ADR-0010). Everything else becomes a small number of islands with 16 px insets:

1. **Case pill**, top left, 40 px tall: mark, case title, status word, the single demo label. Activity, History and revision move into its menu.
2. **Map ornament**, top right: view switcher, 3D toggle and zoom in one pill (zoom keeps 44 px hit areas).
3. **Investigation sheet**, right, 480 px wide, opaque, 12 px radius: the five fixed sections stay (ADR-0006), but only the focused section is expanded and the other four collapse to one line each. Wide content (intervention comparison, full decision brief) opens in the inspector overlay (C15).
4. **Director**, attached to the bottom edge of the sheet as one floating composer card (ornament rule, VIS-26; Perplexity and Magic Patterns place the composer the same way).
5. **Timeline**, bottom of the map region: a 40 px scrubber island that expands to the 96 px three-row strip only when the user focuses it or a command opens Observations or Explanations.
6. **Legend**, bottom left, only while a data layer shows: metric and period, ramp with domain ticks, coverage line, and a details control for method and reference.
7. **Focus mode**: one keyboard shortcut and one button hide the sheet so the map fills the frame, for the arrival and drought-grid moments.

Attribution stays visible as specified. Whether the required notices can be shortened to one line with an expandable full notice is an open licensing question (section 12).

### 8.2 Clean token tier

- Fewer layers. No outer bezels and no borders on non-interactive containers; a container is separated by a surface step (`surface` to `elevated`) and a faint ring. Controls keep the 3:1 `border-control` or a filled background (WCAG 1.4.11).
- Fewer separators. Spacing replaces lines between hypothesis rows, sections and list items.
- **Four type sizes in the working state:** 22 (lead finding), 16 at weight 500 (section title), 14 (body; do not drop to AffectUI's 13 in a dark theme, see section 10) and 12 (labels, IDs and chips, Siterra's minimum). The 28 px case title appears only on arrival.
- **Radii:** sheet and islands 12, cards inside the sheet 10, controls 8, chips 6.
- **Text tiers:** Siterra's `text`, `text-2` and `text-muted` already sit at 12.6, 7.2 and 5.4 to 1 on `surface`, close to AffectUI's tiers. Do not copy AffectUI's 28% tier for anything readable.
- **Motion:** keep Siterra's durations and curve (they match AffectUI's). Adopt two entrance recipes: cards rise 4 px from 0.97 scale; popovers drop 4 px from 0.98 scale over 200 ms. Do not adopt word-by-word streaming; findings appear once validated, with one fade.
- **Labels:** one persistent mode label in the case pill, and at most one honesty tag per graphic, written into its title line ("Vegetation and rainfall by month, illustrative values") instead of a dashed box.

### 8.3 Pattern per surface

| Surface | Pattern | Reference | Install (open source) | Study only |
|---|---|---|---|---|
| **First screen** | Single-action zero state over a full-bleed map; chrome appears after commissioning (progressive disclosure) | Magic Patterns home and app frame; Perplexity and assistant-ui homes (one centered input) | shadcn/ui Card and Button (MIT) | AffectUI Assistant Home screen (Pro) |
| **Prompt or command composer** | Floating composer attached to the sheet's bottom edge; context chips shown on focus and in the receipt; at most two suggestions, written as user questions, shown only when idle and focused; running state as a phase pill with Stop | shadcn Prompt Input and Suggestion; Perplexity follow-up composer; AffectUI Chat Composer; ornament rule | `pnpm dlx shadcn@latest add input-group dropdown-menu button`, then copy the Prompt Input and Suggestion patterns (MIT); `pnpm dlx shadcn@latest add https://www.affectui.com/r/thinking-loader-clean.json` (MIT) fed with real event labels; optional Motion Primitives Morphing Popover for the receipt (MIT) | AffectUI Chat Composer (Pro) |
| **Finding card with sources** | Answer card: section question, a row of evidence tiles (kind glyph, ID, two-line statement), a status line driven by task milestones, the finding with inline evidence chips, at most two next questions, a quiet footer (revision and "Copy reference") | AffectUI AI Answer; Perplexity article | shadcn Sources and Inline Citation (MIT); prompt-kit Source (MIT) as an alternate | AffectUI AI Answer (Pro) |
| **Evidence citations** | Inline citation chip with a hover or focus preview, plus brushing and linking: hovering a chip lights the sentences that cite it, the matching evidence tile and the evidence's spatial scope on the map; a click unfolds a verified excerpt with the matching words marked | AffectUI Cited Answer; brushing and linking | shadcn Inline Citation: `pnpm dlx shadcn@latest add hover-card button`, then copy the pattern (MIT); MapLibre feature state for the map highlight; Kibo Glimpse optional (MIT) | AffectUI Cited Answer (Pro) |
| **Live task progress** | Action plan rendered as one-line trace steps, grouped Needs you, Running and Done; collapsed by default to one line in the sheet ("2 tasks running: reading rainfall records"); real labels and durations, no percentages | shadcn Plan, Task, Queue and Trace; AffectUI Agent Plan; Magic Patterns threads (VIS-01) | `pnpm dlx shadcn@latest add trace`, then copy Plan, Task and Queue (MIT); AffectUI `tool-call-card-clean` (MIT) in the trace inspector | AffectUI Agent Plan and Agent Steering (Pro) |
| **Hypothesis comparison** | ACH matrix behind a one-line-per-explanation summary. Level 1: name, status words and counts written as text ("2 supporting, 0 contradicting, 1 missing"), no chips. Level 2 on expand: evidence rows by explanation columns, each cell a glyph plus word for supports, contradicts, not relevant or missing; hovering a column links to the map | Heuer ACH; AffectUI Conflict Radar; Linear Triage (VIS-29) | shadcn/ui Table, Tooltip and Collapsible (MIT) | AffectUI Conflict Radar (Pro) |
| **Decision and review** | Review queue: role tabs (scientific, community and livelihood, program), the selected item's proposed action, a one-line reason and labeled fields, and a pinned action bar whose verbs name their effects, each with a shortcut; bound to the revision, disabled when stale | AffectUI Review Center; GitHub pull request review (VIS-28); Linear Triage (VIS-29) | shadcn/ui Tabs, Button and Kbd, plus the Confirmation pattern (MIT) | AffectUI Review Center (Pro) |
| **Timeline** | Collapsed time scrubber with a coverage track that expands to departure rows on focus; one committed period drives every view | FireTrace (VIS-09), NASA Worldview (VIS-13), Copernicus Browser (VIS-16) | shadcn/ui Slider (MIT) as the accessible base, Observable Plot (ISC, already in the stack) for the rows | None |
| **Map view switcher** | Segmented control as a map ornament: Relief, Vegetation, Rainfall, Strata, plus a separate 3D toggle; labels in words; no animated highlight on a frequent control (VIS-27) | AffectUI Segmented Control; ornament rule | `pnpm dlx shadcn@latest add https://www.affectui.com/r/segmented-control-clean.json` (MIT) or shadcn/ui Toggle Group (MIT) | None |

Two supporting surfaces: **case history** as a change ledger (before and after, old value struck through, revision and time; study AffectUI Agent Ledger, build on shadcn/ui Table), and **background results** as a single toast at a time (shadcn/ui Sonner, MIT).

A user-facing view switcher conflicts with the rule in the UX architecture that map layers follow the focused component. It needs a decision: for example, a user choice overrides the focus layer until the next user command, and the override is stated in the legend.

### 8.4 What not to adopt

- Word-by-word blur streaming, shimmer as the only running cue, and any display of model reasoning (VIS-08 rules).
- Glass on text panels; text over the map without a backplate.
- AffectUI's 28% text tier, dashed boxes for labels, more than one open popover, chips for things that are not actions.
- Bento grids, gradient frames, agent avatars or mascots inside the working app (a bento grid could suit a landing page or an exported summary, not the investigation).
- Regenerate and thumbs feedback on findings: Siterra re-runs work through explicit commands, and its review semantics are role-bound.

## 9. Visual budget [D]

Definitions: an **island** is a separate container over the map (pill, sheet, strip, legend); a **control** is a focusable element visible without hover; a **text item** is a visible label or line outside the map; **unobstructed map** is the share of the 1440 × 900 frame where the map is not covered. Attribution does not count against the budget.

| State | Islands | Controls | Expanded components | Text items | Map labels | Unobstructed map |
|---|---|---|---|---|---|---|
| Arrival | 3 (case card, case pill, map ornament) | 8 | 1 | 25 | 4 | at least 75% |
| Commissioned, work running | 4 (case pill, sheet, map ornament, timeline) | 12 | 1 | 25 | 5 | at least 60% |
| Reading (Observations, Explanations, drought challenge) | 5 (adds the legend) | 18 | 2 | 40 | 5 | at least 55% |
| Review | 4 plus the inspector overlay | 14 (including at most four decision verbs) | 1 | 40 | 3 | at least 45% |
| Focus mode | 2 (case pill, map ornament) | 8 | 0 | 6 | 5 | at least 90% |

Also at all times: at most one popover, at most one toast, at most one mode label plus one honesty tag per visible graphic, one interactive accent, and at most two caution or danger marks unless more items genuinely need attention. One focal transition at a time (ADR-0010).

Why these numbers: working memory holds about four chunks (Cowan 2001, *Behavioral and Brain Sciences* 24:87 to 114, https://pubmed.ncbi.nlm.nih.gov/11515286/), so four or five islands are the most the eye can treat as separate groups; progressive disclosure works best in two levels (NN/g); Apple asks for floating controls to be few and used sparingly; the UX architecture already caps expanded components at three, and this tightens it to two while reading. With the sizes in 8.1 (a 480 × 868 px sheet, 40 px pills, a 40 px timeline across the map region, a 240 × 104 px legend and a one-line attribution), the layout leaves about 60% of the frame as unobstructed map with the timeline collapsed and about 56% with it expanded, against about 43% in the prototype's scene 5. These are design targets to test, not usability results; the build lane can count islands, controls and covered area automatically in QA.

## 10. Light or dark [D]

**Recommendation: keep dark (ADR-0009) for the build, with the clean adjustments above; keep the exported brief light.**

Evidence:

- Map-first data display favors a dark neutral ground. Esri describes its Dark Gray Canvas basemap as a neutral background with minimal color that makes thematic content stand out and leaves room for bright data colors (service description, https://elevation3d.arcgis.com/arcgis/rest/services/Canvas/World_Dark_Gray_Base/MapServer). [V]
- Siterra's palettes are validated for the dark ground. The NDVI and rainfall scales were built so that low values recede into the dark map and were checked for contrast and color-vision deficiency against it (design system). Switching to light means a light hillshade, new palettes, new halos and a new contrast pass. [V, from the design system]
- Clean does not require light. AffectUI's Clean style ships in dark and is the reference the founder named; Magic Patterns' near-black teal ink is close to Siterra's ground color. [V]
- The cost of dark is reading performance on small text. NN/g (Raluca Budiu, "Dark Mode vs. Light Mode: Which Is Better?", 2020-02-02, https://www.nngroup.com/articles/dark-mode/) reports better acuity and proofreading in light mode for people with normal vision, with the gap growing as text gets smaller, and recommends light as the general default with a dark option. [V] Mitigation: keep body text at 14 px, keep long reading out of the live workspace (the brief exports in light, as already decided), and keep every text token at 4.5:1 or more.

If the founder prefers light after seeing the clean frames, the switch is feasible but not cheap: a light relief (swisstopo-like, VIS-17), re-validated data palettes and contrast, and new map halos. The cheapest way to decide is to show one dark and one light static frame of the same clean layout. [H]

## 11. Licensing summary [V]

| Source | License | Use in Siterra |
|---|---|---|
| shadcn/ui and its AI Elements patterns | MIT | Install and adapt |
| AffectUI free items (Segmented Control, Thinking Loader, Tool Call Card and others) | MIT | Install and adapt; keep the notice |
| AffectUI Pro items and screens | Paid, per seat; no publication of source on its own, including a public repository | Study only while the repository may become public |
| Vercel AI SDK Elements | Apache-2.0 | Avoid for new work: deprecated end of November 2026 |
| prompt-kit, Motion Primitives, Magic UI, Kibo UI, assistant-ui | MIT | Install selectively; Magic UI only outside the workspace |
| coss ui (formerly Origin UI) | MIT for `apps/ui` and `apps/origin`, AGPL-3.0 elsewhere | Install from MIT paths only |
| Animate UI | MIT plus Commons Clause | Usable inside the app; do not redistribute the components |
| Aceternity UI | Free tier terms not found; Pro forbids redistributing source | Study only |
| 21st.dev | Per author; platform terms restrict redistribution | Study only unless the component states an open-source license |
| Magic Patterns, Perplexity, Raycast, Linear, Claude, Apple guidance | Proprietary products and documentation | Pattern reference only; no assets |

## 12. Gaps and open questions

- **Not inspected [U]:** the signed-in Magic Patterns application (only its docs screenshot); ChatGPT canvas (bot verification, not bypassed); the Perplexity citation hover card (did not open in the hidden browser pane); AffectUI Pro source (no purchase); several AffectUI looping demos that were captured mid-animation or empty (Writing Assistant, Decision Inbox, Progress Tracker, Change Summary and others; see the manifest); Aceternity's free-tier terms.
- **For the decisions record:** the island layout (changes the presentation of ADR-0006, not its five sections); the 480 px sheet instead of the 576 px column; the user-facing view switcher against the map-follows-focus rule; whether control islands may use near-opaque frost (ADR-0009 currently forbids any blur over the map); whether attribution may collapse to one line with an expandable full notice (needs a check of each provider's attribution terms).
- **For the founder:** confirm the forgotten pattern name from the shortlist in section 7, and whether the AffectUI look matters enough to buy Pro and keep the repository private.
