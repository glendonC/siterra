# Accessibility and language

Target **WCAG 2.2 AA**, with reduced-motion support beyond the minimum where relevant. This is a target, not a conformance claim. Use the [W3C standard](https://www.w3.org/TR/WCAG22/) as the criterion authority and [WAI complex-image guidance](https://www.w3.org/WAI/tutorials/images/complex/) for meaningful map and chart alternatives. Translation decision: [ADR-0034](../decisions/0034-build-translation-ready-and-ship-french-first.md).

## Core interaction

English typed interaction is P0. The complete commission, inspect, challenge, compare, prepare, review and return flow must work with a keyboard and without voice, drag gestures or terrain rendering. A geographic overview is useful, but neither a moving camera nor a WebGL surface can be the only way to locate or understand evidence.

| Surface | Required equivalent and behavior | Verification |
|---|---|---|
| Investigation sheet | Semantic headings and landmarks; ordered evidence and decision outline alongside the visual layout | Heading navigation exposes a coherent case without spatial inference |
| Geography | Named study-area selection, readable boundary summary, period and layer labels; buttons for zoom and reset; accessible evidence list | A user can select the configured area and inspect its findings without drawing a polygon |
| Views and tours | Every fact a view shows is also in the sheet; tours show Pause and Stop; reduced motion turns tours into stills stepped with buttons | A user who never opens the Views menu loses no finding |
| Timeline | Labeled slider; keyboard period selection; explicit selected period and missing-data states | Arrow or button operation changes map, chart and text consistently |
| Scientific charts | Short purpose description, visible summary of the supported pattern, units and date scope, and a data table with missingness | Essential values and caveats are available without hover or color |
| Relationships | Supports, contradicts and depends-on language in evidence details | A user can follow the same relation without seeing a connecting line |
| Director | Persistent visible label, clear context, editable text and recoverable errors | A user can submit and correct a request without a pointer |
| Review and inspector | Focus enters a titled dialog or panel and returns to its trigger; Escape dismisses where safe | No keyboard trap or content hidden behind floating islands |
| Agent progress | Concise, batched, polite announcements; errors identified separately | Streamed tokens and trace events do not repeatedly interrupt reading |

Keep DOM reading order stable as the visual workspace rearranges. Do not steal focus when results arrive. Offer an explicit "View new findings" control and announce the result once. Focus stays visible and unobscured by islands (2.4.7, 2.4.11). Avoid a blanket application role; use native buttons, lists, form controls and dialogs.

## Visual and motion requirements

Use at least 4.5:1 contrast for normal text, 3:1 for qualifying large text and 3:1 for meaningful UI boundaries and graphics. Encode hypotheses and status with text or shapes as well as color. Missing data, zero and negative values must be distinguishable. Legends use explicit units; uncertainty must not rely only on opacity. Check final colors against real terrain, not only a blank background.

Targets meet WCAG's 24 by 24 CSS pixel minimum or its spacing exceptions; frequent controls use 44 by 44 as a design preference. Provide click or button alternatives to drag-only controls (2.5.7). At 200% text scaling and narrow or zoomed layouts, the director, evidence and review sequence remain usable. Maps and complex charts may need two-dimensional layouts, but surrounding information and equivalent tables reflow. Do not make a broad exception for the entire page (1.4.10).

Respect `prefers-reduced-motion`: remove camera flights, parallax and large spatial rearrangement; use immediate updates or a brief opacity change. Provide Pause and Stop for any movement that lasts more than five seconds (2.2.2). One major transition at a time; allow interruption. Never make animation essential to understanding which period or finding is selected.

## Language and local use

### Who needs another language

Two kinds of reader need more than English: people who commission or read a case and work in French or Arabic (program staff, officials, researchers), and local initiators. A local initiator is someone with a stake in the place but no technical staff, for example a tour operator in the High Atlas who wants to raise a pasture concern with officials and community groups. Siterra prepares their brief and field plan in a language those groups can read; the initiator decides whether and how to share it. Siterra never contacts anyone ([ADR-0033](../decisions/0033-keep-the-autonomous-firm-stance-with-human-authority.md)).

### What the sources support

English is a demonstration interface choice, not evidence that intended Moroccan participants prefer English. Morocco's government documents the implementation of Amazigh official status; IRCAM publications distinguish several Amazigh varieties; historical Peace Corps material separately names Darija, Tamazight and Tashelhit in training ([LANG-01 to LANG-03](../../research/competitive/source-register.md)). These sources support the need for local language discovery; they do not establish the language, script preference, literacy or consent process of a particular High Atlas community, and model marketing lists do not establish translation reliability.

Before community-facing use, ask participants which language variety, script, oral or written form and interpreter support are appropriate. Do not treat Modern Standard Arabic as tested Darija, or a generic Amazigh locale as tested local Tamazight or Tashelhit support.

### The translation layer

Three layers, each with its own rules:

| Layer | What it covers | Rule |
|---|---|---|
| Interface | Labels, status words, errors, help | Externalized messages with ICU MessageFormat plurals; reviewed per locale before release; no machine-translated interface strings in a shipped locale |
| Case content | Evidence statements, findings, brief lines, field plans | Every statement records its original language as a BCP 47 tag. Source excerpts always stay in the original language. A translation is a separate record bound to the exact statement revision, never an overwrite |
| Exports and shared views | Decision brief, field plan, read-only shared brief link | The export states its language, translation status and the original language; a machine draft carries "Machine-drafted translation, needs local review" on every page. A single translated statement in the product carries "Machine-drafted translation" with "Show original" |

Translation record fields (P1, planned for a later contracts version and not part of contracts 1.3.0; [data contracts](data-contracts.md)): source entity and revision, source language, target language, text, method (`machine_draft` or `human_reviewed`), model ID and request ID for drafts, reviewer role and scope for reviews, created time. A source revision change marks its translations stale.

Language tags in scope: `en`, `fr`, `ar`; candidates for evaluation only: `ary` (Moroccan Arabic, Darija), `zgh` (Standard Moroccan Tamazight), `tzm` (Central Atlas Tamazight), `shi` (Tashelhit), with script subtags `Arab`, `Latn` and `Tfng` where needed. The variety used in a given community is confirmed with its members, not inferred from a map.

Preserved, never translated: place names in their established spellings with alternates recorded, record IDs, source titles, quoted excerpts, dataset names, units and numbers. A small reviewed term list keeps key terms consistent (for example agdal, azib, transhumance, "vegetation greenness" for NDVI) and records which terms stay in the original.

### Phasing

| Priority | Scope |
|---|---|
| P0 | Externalized strings, locale-aware dates and numbers through `Intl`, logical CSS properties and `dir` support, bidirectional isolation for IDs, numbers and place names inside text, fonts with Arabic and Tifinagh coverage, the original language recorded on every statement, `lang` marked on the page and on any part in another language (3.1.1, 3.1.2) |
| P1 | French interface; Muse-drafted French briefs and field plans with the original alongside and the machine-draft label; a read-only shared brief link created by the user |
| P2 | Arabic, Darija and Amazigh after testing with consenting native speakers on representative tasks; spoken briefings where literacy or script preference calls for them |

Community-facing plans, consent materials and consequential instructions require competent local review for language and meaning. An English back-translation alone does not establish that review. Do not auto-send translated material. If review is unavailable, the work stays a clearly labeled draft.

## Voice decision

Voice is a P1 stretch and never on the critical path. Meta hosts a speech-to-text model (Muse Voice Transcribe) on the same platform, which makes an English push-to-talk path cheap to add once every P0 test passes; it is not a dependency and the typed path stays primary. The flow is push-to-talk, transcription, an editable visible transcript, then an explicit submit into the same typed-command pipeline. Require microphone permission, visible recording state, cancel and delete controls, a text alternative, clear handling of failed or partial transcription and a disclosed retention policy. Never send a transcribed consequential instruction straight into actions. Darija and Amazigh speech reliability must be evaluated with consenting speakers and representative tasks before any language-support claim.

## Release checks

Acceptance tests for the [acceptance criteria](../project/acceptance-criteria.md#accessibility). Record device, browser, failures and fixes for each. A prototype screenshot or an automated score alone cannot establish accessibility; automated checks supplement manual ones.

| ID | Check | Pass condition | Submission minimum |
|---|---|---|---|
| A11Y-01 | Keyboard-only golden path | The full flow completes with a keyboard alone; focus order follows reading order | Yes |
| A11Y-02 | Screen reader pass | The golden path completes with VoiceOver and Safari or NVDA and Firefox; heading order, landmarks and focus restoration are correct | Yes, one pairing |
| A11Y-03 | Reduced motion | With reduced motion emulated, no camera flight, translation or shared-element travel occurs; tours step as stills; state changes stay announced | Yes |
| A11Y-04 | Text resize | At 200% text size nothing is clipped or overlapped in the sheet, director, review or brief | Yes |
| A11Y-05 | Reflow | At 400% zoom (320 CSS px wide) the sheet content reflows; the map and charts keep table equivalents | No |
| A11Y-06 | Contrast | Text and UI boundaries meet the ratios above in both themes, from the computed token report and on real terrain screenshots | No |
| A11Y-07 | Chart tables | Each chart's table view matches the plotted values (automated) | Yes |
| A11Y-08 | Missing data | Gaps are announced in the timeline and chart text; no gap reads as zero | No |
| A11Y-09 | Target size | Every target meets 24 by 24 or a spacing exception; frequent controls are 44 by 44 | No |
| A11Y-10 | Forced colors | In Windows High Contrast or forced-colors emulation, focus, status words and selection remain visible | No |
| A11Y-11 | Language marking | The page `lang` matches the interface locale; excerpts and translated parts carry their own `lang` | No |
| A11Y-12 | Pause and stop | Every tour and any motion longer than five seconds has visible Pause and Stop; nothing auto-plays from background work | Yes |
