# Microcopy

Status: adopted string set for the build, 2026-10-27 (ADR-0043); sections 1 and 1a updated the same day with the hero the founder approved (design language 1.3). The build moves these strings into message catalogs (I18N-01); the catalog then becomes the source of truth.

How to read this file:

- **Approved** strings (sections 1 and 1a) are the hero the founder approved on 27 Oct 2026: the opening page, the globe, the dive and the valley sequence. Use them verbatim with their string IDs. Where a later section proposes a different string for the same place, the approved string wins.
- **Current** strings come from the first conceptual prototype (v1, not published) or, where the prototype has none, from the specs in `docs/reference/`. "(spec)" marks a string that exists only in a spec; "none" means nothing exists yet.
- **Proposed** strings follow the [voice and tone guide](voice-and-tone.md). "Keep" means the current string already meets the guide.
- Numbers in examples are the prototype's illustrative values. Live strings fill counts from events and records.
- Placeholders use ICU syntax: `{count}`, `{date}`, `{n}`. Buttons are in [brackets].
- "Why" cites voice principles as V1 to V5 and lint rules as VT-xx.

## 1. Demo opening

Approved. The opening page sits outside the product chrome: one beat at a time, each a two-tone paragraph (the claim in ink, its qualifier in grey) with its source tag beneath, then one action into the globe and the valley. Facts are quoted exactly as worded in [problem.md](../explanation/problem.md); beat 3 uses the short form in its fact table. The source of each tag resolves in the [science source register](../../research/science/source-register.md). The beats are split into their two tones at sentence boundaries; no word changes. Lint handling for beats 1 to 3 is in the [voice and tone guide](voice-and-tone.md#where-they-run-d).

| String ID | Ink (the claim) | Grey (the qualifier) | Source tag |
|---|---|---|---|
| `opening.beat1` | Rangelands cover more than half of Earth's land and support the livelihoods of about two billion people. | none | UN General Assembly, 2022; UNCCD, 2024 (SCI-125, SCI-127) |
| `opening.beat2` | Greenness follows rainfall closely. | In simulations, a vegetation-index trend only became statistically detectable once 30 to 40 per cent of the vegetation had been degraded. | Wessels et al., 2012 (SCI-29) |
| `opening.beat3` | In protectorate Morocco, a 1917 forest decree banned grazing for six years in burned or harvested forests, and officials treated forest grazing as the main cause of deforestation. | Fossil pollen evidence contradicts the large deforestation estimates. | Davis, 2005 (SCI-145) |
| `opening.beat4` | The first: is grazing changing the shared pastures of the Aït Bouguemez valley? | Siterra investigates one place at a time. (shown first, in grey) | none (the case) |
| `opening.action` | [↵ Open the investigation] | | |

"Changing" in beat 4 was approved by the founder in place of "damaging" (VT-20, ADR-0003).

The globe and the dive (approved):

| String ID | String | Where |
|---|---|---|
| `globe.range` | Atlas Mountains, Morocco | Set along the range on the globe, north of the case |
| `globe.one-case` | One case so far: Aït Bouguemez | Top left while the globe shows |
| `globe.legend` | Rangeland biomes, potential extent (Rangelands Atlas method) | Legend for the lit layer, from beat 1 to the dive |
| `globe.action` | [↵ Open the investigation] | Key hint while the globe shows |
| `globe.turn` | [drag Turn] | Key hint while the globe shows |
| `dive.range` | Atlas Mountains, Morocco | The dive's first 0.5 s |
| `dive.high-atlas` | High Atlas Mountains | Along the range, about 0.6 to 2.4 s into the dive |
| `dive.valley` | Aït Bouguemez valley | Beside the case, about 2.4 to 4.0 s into the dive |
| `credit.globe` | Globe relief: produced using Copernicus WorldDEM™-90 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved | Credit line while the globe shows; quoted as the licensor requires |
| `credit.dive` | Dive relief over Morocco: © Mapterhorn (Copernicus GLO-30) | Added to `credit.globe` while the Mapterhorn relief shows in the dive |
| `credit.valley` | © Mapterhorn. Copernicus WorldDEM-30. CHIRPS v3.0, accessed 27 Oct 2026. Contains modified Copernicus Sentinel data 2019-2025. © OpenStreetMap contributors. | The one valley credit line, from the moment the valley's imagery appears through the whole valley sequence (owned by the valley sequence; section 1a) |
| `notices.open` | Sources and notices | Link at the end of every credit line; opens the full attributions and the Copernicus liability sentences |

The case record's copy, kept with the same words in the case seed (`data/case/case.json`):

| String ID | String | Note |
|---|---|---|
| `case.title` | Grazing and livelihoods in the Aït Bouguemez valley | Names both halves of the case (ADR-0003) |
| `case.location` | Central High Atlas, Morocco | The location line; the land's region line in the hero is `valley.region` |
| `case.objective` | Is grazing changing the shared pastures of the Aït Bouguemez valley? | The case question, approved by the founder; the hero shows the same words as `valley.question` |
| `case.description` | Reported: concern about grazing pressure on shared pastures. Not established: whether vegetation has changed, or why. | Two labeled fields: reported, not diagnosed |
| `case.unresolved.1` | Whether vegetation has changed, or why. | The first unresolved question |

The dialog's items while the globe or the dive shows (notices, never linted; the valley's items are in section 1a):

| String ID | String |
|---|---|
| `notices.globe-relief` | Globe relief and dot elevation: produced using Copernicus WorldDEM™-90 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved. The organisations in charge of the Copernicus programme by law or by delegation do not incur any liability for any use of the Copernicus WorldDEM™-90. |
| `notices.biomes` | Rangeland biomes, potential extent (Rangelands Atlas method): Ecoregions 2017 © Resolve, CC BY 4.0 (Dinerstein et al. 2017, BioScience 67(6): 534-545); method of the Rangelands Atlas (ILRI et al. 2021, CC BY 4.0); preliminary layer prepared for Siterra, 27 Oct 2026. |
| `notices.dive-relief` | Dive relief over Morocco and the valley terrain: © Mapterhorn, tiles at zooms 6, 8 and 11; tiles produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved. The organisations in charge of the Copernicus programme by law or by delegation do not incur any liability for any use of the Copernicus WorldDEM-30. Accessed 27 Oct 2026. ("© Mapterhorn" links to mapterhorn.com/attribution) |
| `notices.dive-catchment` | Catchment derived from Copernicus DEM GLO-30 (2021 release). |
| `notices.dive-imagery` | Imagery: contains modified Copernicus Sentinel data 2025. Sentinel-2, July and August 2025, display only: a summer view, not a measurement. |

## 1a. Valley sequence

Approved. Six beats on one clock in the valley: arrival, work, evidence, dry-year challenge, verdict and field plan ([scenes](scenes.md#valley-sequence), times in [motion](motion.md#valley)). Times below are seconds on the valley clock, which starts at the join with the dive. Values inside strings come from stored records and bundles at their method's precision; a slot in braces shows which, and the approved frame's value follows it.

The **Kind** column is the catalog mark the budget and lint checks read:

- `land`: one line of a label on the land. A land line has at most 6 words (words are separated by spaces). The land holds at most 5 labels at a time; a two-line block (a place name with its region line, or a measured label with its honesty line) counts as one label.
- `honesty`: a line that states a limit. It is never cut for a budget, and on the land it is exempt from the 6-word cap. When a budget is tight it moves to focus or to the next beat, never to smaller type.
- `card`, `sky`: text on the one card, or the verdict statement written in the paper sky above the land. The card holds at most 45 words.
- `key`: a key hint (glyph and label), linted with the `button` scope. Each beat has one action key; "F Read flat" shows in every beat.
- `key slot`: the key for the measured layer on show, at the bottom left. Its focus note opens on hover or keyboard focus.
- `focus note`: a short note that opens on hover or keyboard focus of its line or key.
- `label`, `mode`, `instrument`, `screen reader`: a control's name or a heading (lint scope `label`); the mode line; the notes beside the north mark; text for assistive technology only.
- `viewer`: the viewer's own words, shown as typed. Never linted, and the only place "drought" may appear.
- `notice`: attribution and licence notices, quoted as the licensor requires. Never linted.

Credits, key hints and focus notes do not count toward word budgets.

Throughout the sequence:

| String ID | String | Kind | Where and when |
|---|---|---|---|
| `valley.mode` | Concept prototype: simulated run | mode, honesty | Top centre, mono 11, from 0.2 s; opens the scope popover (section 2) |
| `valley.mode.scope` | What Siterra will and will not do | screen reader | Added to the mode line's accessible name |
| `valley.description` | The Aït Bouguemez valley in the High Atlas Mountains, Morocco, in low warm light, with the valley catchment drawn from its outlet. | screen reader | Text alternative for the canvas |
| `valley.cmd.name` | Ask Siterra | label | The command line's placeholder and accessible name; the "/" glyph is the visible mark |
| `valley.key.flat` | [F Read flat] | key | Every beat, beside the beat's action |
| `valley.north` | N | instrument | Beside the north mark, bottom right, from 3.6 s |
| `valley.relief` | Relief ×2 | instrument, honesty | Beside the north mark |
| `valley.imagery` | Imagery: Sentinel-2, summer 2025, display only | instrument, honesty | Under the north mark |
| `credit.valley` | (section 1) | notice | Bottom right on every frame from 0 s; ends with `notices.open` |
| `credit.valley.plan` | `credit.valley` followed by "© ESA WorldCover project." | notice | From 42.5 s, while mapped cropland and buildings show |
| `notices.title` | Sources and notices | label | Dialog heading |
| `notices.relief` | Relief: © Mapterhorn; produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved. | notice | Dialog item; "© Mapterhorn" links to mapterhorn.com/attribution |
| `notices.catchment` | Catchment and elevation bands: produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved. Catchment derived by Siterra from Copernicus DEM GLO-30 (2021 release). The organisations in charge of the Copernicus programme by law or by delegation do not incur any liability for any use of the Copernicus WorldDEM-30. | notice | Dialog item |
| `notices.imagery` | Vegetation index and imagery: contains modified Copernicus Sentinel data 2019-2025. The imagery is a Sentinel-2 summer 2025 view, display only. | notice | Dialog item |
| `notices.rainfall` | Rainfall: CHIRPS v3.0, Climate Hazards Center, UC Santa Barbara, doi.org/10.15780/G2JQ0P, accessed 27 Oct 2026; Funk et al. (2026), Scientific Data 13: 718, doi.org/10.1038/s41597-026-07096-4. | notice | Dialog item; both DOIs are links |
| `notices.worldcover` | Mapped cropland and buildings: © ESA WorldCover project / Contains modified Copernicus Sentinel data (2021) processed by ESA WorldCover consortium; ESA WorldCover 2021 v200 (Zanaga et al. 2022), CC BY 4.0. | notice | Dialog item |
| `notices.osm` | Place points and the outlet input: © OpenStreetMap contributors. | notice | Dialog item; links to openstreetmap.org/copyright |
| `notices.close` | [Esc Close] | key | Closes the dialog |

Arrival (0 to 6.0 s):

| String ID | String | Kind | Where and when |
|---|---|---|---|
| `valley.name` | Aït Bouguemez valley | land | On the ground along the valley, 0.8 s; first line of a two-line block |
| `valley.region` | High Atlas Mountains, Morocco | land | Beneath `valley.name`, the block's region line |
| `valley.outlet` | Outlet: the whole catchment drains here | land | Beside the outlet beam, 1.8 s |
| `valley.village.tabant` | Tabant | land | On its stem, 2.6 s |
| `valley.village.ouchi` | Aït Ouchi | land | On its stem, 2.6 s |
| `valley.catchment` | Valley catchment: {area} km² (417.0) | land | On the ground along the long northern edge of the line, 3.0 s; the area from the catchment record, to one decimal |
| `valley.catchment.limit` | Not a pasture, agdal, or management boundary. | land, honesty | Beneath `valley.catchment`, the block's honesty line |
| `valley.question` | Is grazing changing the shared pastures of the Aït Bouguemez valley? | card | In the command line from 3.3 s; the card's first line from 6.2 s |
| `valley.key.start` | [↵ Start investigation] | key | The one action, from 3.3 s |

Work (6.0 to 18.0 s). Each step shows one of three forms, in place: waiting, running (present tense), done (past tense with its count and period).

| String ID | String | Kind | Where and when |
|---|---|---|---|
| `valley.work.status` | Planning: 4 steps to answer this question | card | Under the question, 6.2 s |
| `valley.work.rain.waiting` | Rainfall: 84 months | card | Step 1 line, 6.6 s |
| `valley.work.rain.running` | Rainfall: loading 84 months | card | 9.0 s |
| `valley.work.rain.done` | Rainfall: 84 months, 2019 to 2025 | card | 11.6 s |
| `valley.work.vegetation.waiting` | Vegetation: 84 months | card | Step 2 line, 6.85 s |
| `valley.work.vegetation.running` | Vegetation: loading 84 months | card | 11.8 s |
| `valley.work.vegetation.done` | Vegetation: {compared} of 84 months compared, 2019 to 2025 (58) | card | 14.6 s; the count from the vegetation bundle |
| `valley.work.reports.waiting` | National reports: 5 | card | Step 3 line, 7.1 s |
| `valley.work.reports.running` | Placing 5 national reports (hand-extracted) | card | 14.8 s |
| `valley.work.reports.done` | 5 national reports placed (hand-extracted) | card | 15.9 s |
| `valley.work.explanations.waiting` | Explanations: 5 | card | Step 4 line, 7.35 s |
| `valley.work.explanations.running` | Comparing 5 explanations | card | 16.1 s |
| `valley.work.explanations.done` | 5 explanations, none ranked | card | 16.9 s |
| `valley.sheet.rain` | 01 Was the season unusually dry? | land | The rainfall sheet's label, "01" in mono, while the sheet shows (7.6 to 10.2 s) |
| `valley.sheet.vegetation` | 02 Did greenness change? | land | The vegetation sheet's label (8.3 to 13.0 s) |
| `valley.key.ndvi` | NDVI departure, Apr {year}, compared with other Aprils (Apr 2023), with the ends "−0.10" and "+0.10" | key slot | 12.7 to 27.0 s |
| `valley.key.ndvi.note` | No cropland mask is applied: valley-floor fields and orchards are included. | focus note, honesty | On focus of `valley.key.ndvi` |
| `valley.key.stop` | [Esc Stop] | key | The one action while steps run, 6.0 to 17.2 s |
| `valley.key.ask` | [/ Ask or challenge] | key | The one action after the work, 17.2 to 24.5 s |

Evidence (18.0 to 24.5 s):

| String ID | String | Kind | Where and when |
|---|---|---|---|
| `valley.evidence.claim` | A published study gives coordinates for villages in this valley. | card | The statement's ink half, 19.0 s |
| `valley.evidence.limit` | The stem marks one, Aït Ouchi, not a pasture boundary. | card, honesty | The statement's grey half |
| `valley.evidence.source` | Aakairi et al. 2026, People and Nature (SCI-04) | card | Source line |
| `valley.evidence.meaning` | Meaning: a location, not a finding about grazing. | card, honesty | Meaning line |
| `valley.evidence.reports` | 5 national reports for Morocco | card | With an open ring: reported, not placed on the valley |
| `valley.evidence.stem` | Aït Ouchi | land | At the top of the selected stem, 20.0 s |
| `valley.gap` | No usable April view: left out | land | With the gap hatch, written where the gap is, 20.9 s |

Dry-year challenge (24.5 to 35.0 s):

| String ID | String | Kind | Where and when |
|---|---|---|---|
| `valley.challenge.question` | Could drought explain this instead? | viewer | Typed into the command line at 24.5 s and sent at 25.3 s; then on the card as an open question branching from `valley.question` |
| `valley.challenge.status` | Simulated answer. | card, honesty | 25.3 s |
| `valley.challenge.statement.first` | In 2021/22, rainfall was in the upper third, {total} mm (650). | card | 25.3 to 30.8 s |
| `valley.challenge.statement` | Rainfall fell from the upper third, {total} mm (650), to the lower third, {total} mm (349). | card | From 30.8 s; the totals and thirds from `season_summary` |
| `valley.challenge.source` | CHIRPS v3.0, 1991 to 2020 | card | Source line |
| `valley.challenge.meaning` | Meaning: a dry season. Not evidence about grazing. | card, honesty | Meaning line |
| `valley.key.rain` | Rain per cell, {season} (2021/22, then 2022/23 from 30.2 s), with the classes "under 400", "400 to 550" and "550 mm and over" | key slot | 27.6 to 35.0 s |
| `valley.key.rain.note` | Display classes only, not the 1991 to 2020 thirds. | focus note, honesty | On focus of `valley.key.rain` |
| `valley.stems.band` | Near normal: {low} to {high} mm (509 to 603) | land | Beside the slab, 27.3 s |
| `valley.stems.mean` | Mean {mean} mm (562) | land | Beside the plane, 27.5 s |
| `valley.stems.caption` | Wet seasons 1991/92 to 2022/23 | land | Under the stems, 27.8 s |
| `valley.stems.previous` | 2021/22: {total} mm (650) | land | At the season before, 28.6 s |
| `valley.stems.on-show` | 2022/23: {total} mm (349) | land | At the season on show, in the accent, 30.5 s |
| `valley.key.next` | [↵ Show the answer] | key | The one action, 24.5 to 35.0 s. The approved frames show "Next: vegetation", a step the sequence does not show; this label names the next beat |

Verdict (35.0 to 42.5 s):

| String ID | String | Kind | Where and when |
|---|---|---|---|
| `valley.verdict.status` | Simulated answer. | sky, honesty | In the paper sky, 36.6 s |
| `valley.verdict.claim` | Grazing: cannot be assessed with current data. | sky | The statement's ink half, 36.9 s |
| `valley.verdict.limit` | April NDVI in 2022 and 2023 stayed within about {difference} of other Aprils (0.01). | sky | The statement's grey half, 37.7 s; the difference from the vegetation departure bundle, to two decimals |
| `valley.verdict.figure-label` | Wet season 2022/23 | card | 37.8 s |
| `valley.verdict.figure` | {total} mm (349) | card | The one figure |
| `valley.verdict.figure-context` | Lower third of 1991 to 2020 | card | Under the figure |
| `valley.verdict.source` | CHIRPS v3.0, {cells} cells (33) | card | Source line |
| `valley.verdict.method` | season_summary 1.0.0 | card | Method line, an identifier |
| `valley.verdict.meaning` | Meaning: a dry season. Not evidence about grazing. | card, honesty | Meaning line |
| `valley.verdict.flags` | April views: snow suspected; cloud screening reduced. | card, honesty | Focusable |
| `valley.verdict.flags.note` | Cloud screening used the scene classification only. | focus note, honesty | On focus of `valley.verdict.flags` |
| `valley.verdict.why` | "Why" (a chip, no colon), then: year-to-year rainfall can hide a real decline in the vegetation record (SCI-29) | card | Last line; the chip opens the source |
| `valley.key.plan` | [↵ Show the field plan] | key | The one action, 35.0 to 42.5 s |

Field plan (42.5 to 50.0 s):

| String ID | String | Kind | Where and when |
|---|---|---|---|
| `valley.plan.claim` | Proposed: measure plant cover on the ground in each of the three elevation bands. | card | The statement's ink half, 44.1 s; focusable |
| `valley.plan.limit` | They are not pasture units or boundaries. | card, honesty | The statement's grey half |
| `valley.plan.limit.note` | Each band holds a third of the study area. | focus note | On focus of the statement |
| `valley.plan.measure` | To measure: animal numbers and timing, the current access calendar, field vegetation surveys | card | "To measure:" in grey |
| `valley.plan.proposal-only` | Proposal only. Nothing has been arranged with the villages. | card, honesty | Last line |
| `valley.band.lower` | Lower band: below {limit} m (2,317) | land | Inside the band, 44.5 s; the limits from the strata bundle |
| `valley.band.middle` | Middle band: {lower} to {upper} m (2,317 to 2,815) | land | 45.1 s |
| `valley.band.upper` | Upper band: {limit} m and above (2,815) | land | 45.7 s |
| `valley.excluded` | Mapped cropland and buildings: not sampled | land | On the valley floor, 47.0 s |
| `valley.key.print` | [↵ Print the field plan] | key | The one action, from 42.5 s |

Land labels per beat in the approved frames: arrival 5 (two of them two-line blocks), work at most 2 (the sheet labels, while the sheets show), evidence 2, challenge 5, verdict 0, field plan 4. The card's longest faces hold 45 words (challenge and verdict).

"F Read flat" is in every approved frame but its view is not: what it shows is specified in [scenes](scenes.md#valley-sequence).

## 2. Scope popover

| Element | Current | Proposed | Why |
|---|---|---|---|
| Heading | Siterra will | Keep | |
| Item | Plan the investigation and retrieve published research | Keep | |
| Item | Load satellite and rainfall observations for the analysis area | Keep | |
| Item | Compare explanations and keep unresolved ones open | Keep | |
| Item | Prepare a field-validation plan and the reviews it needs | Keep | |
| Heading | Siterra will not | Keep | |
| Item | Contact anyone, spend money or publish anything | Contact anyone, spend money, or publish anything | Serial comma |
| Item | Make or authorize land-management decisions | Keep | |
| Item | Claim consent, partnerships or outcomes | Claim consent, partnerships, or outcomes | Serial comma |
| Footer | none | Observations are precomputed from public satellite and rainfall data. Planning, reading, and comparison run live. | Says what "Live" covers (ADR-0021) before anyone asks. |

## 3. Case pill

| Element | Current | Proposed | Why |
|---|---|---|---|
| Case name | Pasture resilience, Aït Bouguemez | Grazing and livelihoods, Aït Bouguemez | Matches the title |
| Status before the first request | Draft | Not started | Nothing has run; the case is not a draft. |
| Status words | Planning; Investigating; Needs your input; Ready for review; Prepared (demo); Paused; Failed command (spec) | Keep all except "Failed command", which becomes "Request failed" | "Command" is internal language. |
| Running count | 2 tasks running | Keep, as `{count, plural, one {# task running} other {# tasks running}}` | Plural through ICU |
| Revision | Revision 9 | Keep | |
| Save time | Saved just now; Saved 2 min ago | Keep, with the absolute time on focus: "Saved at 10:21" | |
| Buttons | [Activity] [History] | Keep | |
| Panel titles | Activity and trace; Case history | Activity; History | A button and the panel it opens share one name (WRT-16). |

## 4. Buttons and controls

| Where | Current | Proposed | Why |
|---|---|---|---|
| Arrival | [Commission investigation] | [Start investigation] | Approved (section 1a, `valley.key.start`), shown as the key hint ↵ |
| Director | [Send] (aria-label "Send") | Keep; aria-label "Send request" | Names the object |
| Director, while running | (spec) cancel available | [Cancel request] | Verb plus object |
| Director, needs input | (spec) [Answer] [Proceed without] | [Answer] [Continue without an answer] | "Proceed without" leaves out what is skipped. |
| Any failure | Retry | [Retry] | Keep |
| Component with changed inputs | (spec) Inputs changed; re-run | Inputs changed. [Run again] | Plain verb, no hyphenated coinage |
| Area card | Show on map | Keep | |
| Plan row | View in trace | View activity | Matches the case pill menu item |
| Chart | Table / Hide table | [Show table] / [Hide table] | Verb-first pair |
| Director history | Expand / Collapse | [Show earlier requests] / [Hide earlier requests] | Says what expands |
| Receipt | Hide steps | [Hide steps] / [Show steps] | Pair |
| Brief | Open review | Keep | |
| Inspector | Open source | Open {short title}, for example "Open Romagny et al. 2008" | "Open source" reads as open-source software; a link names its destination (WRT-16, VT-42). |
| Panels | Back; Close | Keep | |
| Read-only revision | (spec) Return to current | [Return to current revision] | Names the destination |
| New results | (spec) View new findings | View new findings ({n}) | Accessibility doc; the count says how many are held |
| Unknown row (P2) | (spec) I can provide this | Keep | User voice |
| Map | aria-label "Toggle 3D relief" | aria-label "3D relief", with aria-pressed | A toggle keeps one label; its state carries on/off. |
| Map | Zoom in; Zoom out; Reset view to the analysis area | Keep | |
| Review | [Record scientific review (demo)] [Request changes] [Mark consultation required] [Mark program review complete (demo)] [Defer] | Keep all except [Defer decision] | VT-40; section 14 |

## 5. Director

| Element | Current | Proposed | Why |
|---|---|---|---|
| Visible label | none (hidden label "Ask Siterra or give an instruction") | none: the "/" glyph marks the command line | Approved hero (section 1a, `valley.cmd.name`). "Ask Siterra" is the accessible name, which stays when the placeholder goes (WRT-09) |
| Hint under the label | none | Siterra uses the area, period, and focus shown above. | Explains the chips (IU-03). |
| Placeholder | Ask Siterra or give an instruction | Ask Siterra | Approved hero. A placeholder vanishes and is not always announced (WRT-09), so the same words are the accessible name; it is drawn in `text.secondary` |
| Chip group label | Context sent with your request (aria only) | Sent with your request (visible) | |
| Chips | Area Valley catchment; Period 2019 to 2025; Focus None | Area: Valley catchment; Period: 2019 to 2025; Focus: nothing selected | "None" can read as "no focus possible". |
| Suggestion | Could drought explain this instead? | Could a dry year explain this instead? | Siterra's own text never says "drought" (VT-26, design language 1.3). A person may still type the signature question (ADR-0008), and it shows as typed (section 1a, `valley.challenge.question`) |
| Suggestion | What about households that rely on these pastures? | Keep | |
| Suggestion | What could be done, and what should be checked first? | Keep | |
| Suggestion | Prepare the next steps for review. | Prepare the next steps for review | No period on a single fragment (WRT-17) |
| Shortcut tooltip | (spec) "/" focuses the input | Press / to ask Siterra | |
| Interpretation: start | Assess evidence of grazing-related pressure in the valley catchment, compare explanations, and prepare a field-validation plan. | Siterra will check whether vegetation in the catchment has changed since 2019, compare possible explanations, including grazing, and prepare a field-validation plan. | Siterra as the actor (V4). Neutral: it does not set out to find grazing evidence. |
| Interpretation: drought | Compare vegetation departures with rainfall departures for 2019 to 2025 on the same months, then reassess every explanation. | Siterra will compare monthly vegetation with rainfall for 2019 to 2025, then reassess every explanation. | Plainer; names what is measured instead of "drought" |
| Interpretation: households | Find documented livelihood and governance constraints and list what must be collected locally. | Siterra will list published livelihood and governance constraints and what must be collected locally. | |
| Interpretation: options | Screen candidate responses against the evidence, livelihood exposure and authority, without ranking them. | Siterra will compare possible responses by evidence, effects on livelihoods, and who decides. It will not rank them. | Two short sentences |
| Interpretation: prepare | Build a field-validation plan from the open gaps and compose a decision brief. | Siterra will turn the open questions into a field-validation plan and write a decision brief. | |
| Sending | none | Sending | |
| Accepted | Command accepted | Request received | "Command" is internal. |
| Needs input | (spec) a question with Answer and Proceed without | Siterra needs an answer to continue: {question} [Answer] [Continue without an answer] | |
| Succeeded | Updated Observations: vegetation over time, 5 evidence items | Keep the pattern: Updated {section}: {visible component names} | |
| Partial | (spec) what was not done | Finished with gaps. Not done: {tasks}. [Run remaining tasks] | V3 |
| Failed | (spec) cause, Retry, input preserved | Request failed: {cause}. Your text is kept. [Retry] | V5 |
| Case card heading for a request's results | none | Observations (precomputed) | The section name first, then the label that ADR-0021 and agent orchestration require: "Precomputed observations are labeled precomputed". Lists only what the request's own tasks produced |
| Case card: request finished | none | Request complete | Only when the request's completion event says it succeeded |
| Case card: request failed | none | Request failed: {cause}. Your question is kept. | V5. Same words as the card's other kept-question lines. The card has no retry command yet, so it shows no [Retry] |
| Case card: failure causes ({cause}) | none | stopped at the model round limit; Siterra rejected the model's proposal; the model service is not responding; no step finished | From the first failed task's code: round limit, rejected proposal (section 16), model service error (section 16). "No step finished" when no task names a cause. Lowercase after the colon |
| Case card: finished with gaps | none | Finished with gaps. Not done: {tasks}. | V3. {tasks} lists the unfinished task kinds (section 6) in lowercase. No [Run remaining tasks] until that command exists |
| Case card: request canceled | none | Request canceled | US spelling (VT-37); a status, so no period |
| Rejected as stale | (spec) The case changed; resend against the current version | The case changed while you were writing, so nothing was run. Your text is kept. [Send on revision {n}] | Says what did and did not happen |
| Concept mode reply | This prototype only simulates the storyboard commands, in order. | Keep (concept mode only) | |

## 6. Plan, tasks, and milestones

The build's strings for this section follow [section 25](#25-the-precise-standard-in-the-build-accepted) (accepted) where they differ from the rows below.

### Plan component

| Element | Current | Proposed | Why |
|---|---|---|---|
| Heading | Investigation plan | Keep | |
| Interpretation | Siterra will gather published evidence and satellite observations for the catchment, compare explanations for any vegetation change, and prepare a field-validation plan. It will not contact anyone or make land decisions. | Siterra will gather published evidence and satellite observations for the catchment, compare explanations for any vegetation change, and prepare a field-validation plan. It will not contact anyone or make land-management decisions. | Same phrase as the scope popover |
| Group headings | (spec) Needs you; Running; Done | Needs your input ({count}); Running ({count}); Done ({count}) | |

### Task rows (kind, then the question it answers)

| Kind (current) | Question (current) | Proposed | Why |
|---|---|---|---|
| Plan | Define the objective, area and available data | Define the objective, area, and available data | Serial comma |
| Source research | What does published research say about pastures and their governance here? | Keep | |
| Observation analysis | How has vegetation changed in the catchment since 2019, and how complete is the record? | Has vegetation in the catchment changed since 2019, and how complete is the record? | "How has it changed" presumes a change that the case card says is not established. |
| Livelihood and governance research | Who depends on these pastures and under what rules? | Keep | |
| Hypothesis comparison | Which explanations fit the observations? | Kind: Explanation comparison. Question: keep. | "Explanation" in headings (terminology) |
| Field-validation package | What should be measured next, by whom, with what permissions? | Kind: Field-validation plan. Question: keep. | One name for the deliverable |
| none (`intervention_feasibility`) | none | Kind: Possible responses | Terminology: "possible response", not "intervention" |
| none (`validation`) | none | Kind: Automated checks | Deterministic host checks, not a model (agent orchestration); "checked (automated)", not "verified" |

### Task status words

| State | Current | Proposed | Why |
|---|---|---|---|
| `queued` | Waiting on inputs | Queued; when another task must finish first: Waiting for {task} | GOV.UK gives dependency-blocked tasks their own status (WRT-06). |
| `running` | Running | Keep | |
| `awaiting_input` | none | Needs your input | |
| `succeeded` | Done | Keep | |
| `partial` | none | Partly done | |
| `failed` | Failed | Failed: {cause} [Retry] | Cause inline (components spec) |
| `cancelled` | none | Canceled; when replaced: Canceled: replaced by a newer request | Vercel shows why a build was canceled, for example a newer commit (WRT-33). US spelling (VT-37). |
| `awaiting_review` | none | Awaiting review | |

### Milestones

| Current | Proposed | Why |
|---|---|---|
| Command accepted | Request received | "Command" is internal. |
| Planned 6 tasks | Keep | |
| Retrieving published sources | Keep | |
| Loading monthly observations | Keep | |
| Retrieved 5 of 6 sources (1 unavailable) | Retrieved 5 of 6 sources (1 unavailable, not used) | States the consequence |
| Loaded 84 monthly observations; 23 below the coverage policy | Loaded 84 monthly observations, 23 of them below the 70% coverage threshold | A number people can check |
| Livelihood and governance research (shown as a running milestone) | Reading sources on livelihoods and governance | A milestone is an action. |
| Updated Observations: vegetation over time, 5 evidence items | Keep | |
| Loaded rainfall for 84 months (CHIRPS grid, 31 cells) | Loaded 84 months of rainfall (CHIRPS grid, 33 cells) | Count right after the verb; 33 cells touch the frozen catchment |
| Aligned vegetation and rainfall by month | Keep | |
| Compared 4 explanations | Keep | |
| Updated Explanations: ledger and aligned comparison | Updated Explanations: competing explanations, vegetation and rainfall by month | Visible names, not internal ones ("ledger") |
| Read 3 sources on livelihoods and governance | Keep | |
| Listed 5 unknowns that need local information | Keep | |
| Updated Responses: livelihood constraints | Keep | |
| Prepared 4 candidate responses | Keep | |
| Linked each to its evidence and decision-makers | Linked each response to its evidence and to who decides | |
| Updated Responses: possible responses | Keep | |
| Derived strata from the terrain model | Drew sampling strata from the terrain model (elevation and slope direction) | Plain words for the method |
| Mapped each measurement to an open gap | Linked each measurement to an open question | |
| Composed the decision brief; every line linked | Wrote the decision brief. Every line links to its evidence. | Two sentences, no semicolon |
| Updated Next steps: field-validation plan and brief | Updated Next steps: field-validation plan, decision brief | Visible names |

## 7. Sections

Section names stay: Place, Observations, Explanations, Responses, Next steps.

| Section | Current summary | Proposed summary | Why |
|---|---|---|---|
| Place, running | {role label}, {area} km² | Valley catchment: {area} km². Not a pasture, agdal, or management boundary. | Approved form (section 1a, `valley.catchment`); area to one decimal |
| Place, done | {role label}, 6 tasks planned | 6 tasks planned | The role label is on the map and the area card. |
| Observations | Vegetation 2019 to 2025, 23 months below coverage policy | Vegetation 2019 to 2025, with 23 months below the 70% coverage threshold | |
| Observations, later | Vegetation over time and 5 evidence items | Keep | |
| Explanations | 4 explanations, none scored; grazing cannot be assessed yet | 4 explanations. Grazing cannot be assessed with current data. | The exact status words; "none scored" is design commentary. |
| Responses, constraints | Livelihood constraints, 5 unknowns | 5 local unknowns not collected | |
| Responses, options | Livelihood constraints and 4 candidate responses | 5 unknowns not collected. 4 possible responses, not ranked. | |
| Next steps | Field-validation plan and decision brief | Keep | |
| Before work | Not started | Keep | |

Section status chips today mix states and counts ("Planning", "Done", "Ready", "2 open", "Not collected: 5", "Candidates", "Ready for review"). Proposed: one fixed set of states, with counts moved to the summary line: Not started, Running, Needs your input, Done, Ready for review, Inputs changed (WRT-05, WRT-06).

## 8. Evidence cards and inspector

### Claim kind labels

Keep the labels (Observation, Published context, Hypothesis, Model estimate, Scenario, Field requirement, Verified outcome) and add the one-line meanings from [voice and tone](voice-and-tone.md) to the inspector and the legend.

### Evidence examples

| Item | Current | Proposed | Why |
|---|---|---|---|
| E1 value | -0.03 NDVI median departure | −0.03: NDVI difference from the same-month median | Minus sign (VT-36); says what the number is |
| E2 statement | Winter months often fall below the coverage policy because snow and cloud are masked; 23 of 84 months are below it. | In 23 of 84 months, less than 70% of the area was observed, mostly in winter, when snow and cloud are masked. | The count leads; a threshold, not a policy |
| E3 value | -48% of the seasonal mean | 48% below the 1991 to 2020 mean | "−48% of the mean" can be read as "48% of the mean". |
| C2 statement | Interviews with 50 farmers in three Azilal municipalities link changes in pastoral systems to climate, resource availability and mobility, with different trajectories at different elevations. | Interviews with 50 farmers in 3 Azilal municipalities link changes in pastoral systems to climate, resource availability, and mobility, with different trajectories at different elevations. | Numerals (VT-34); serial comma |
| C4 scope | Three villages in the valley, 2026 publication | 3 villages in the valley, published 2026 | Numerals |
| SCI-07 venue | Copernicus via Earth Engine catalog | Copernicus, through the Earth Engine catalog | VT-18 |
| Illustrative tag | Illustrative values, not measurements | Keep | |

### Inspector rows

| Row | Current | Proposed | Why |
|---|---|---|---|
| Data bundle | bundle_ndvi_monthly (illustrative) | Label "Dataset"; value "Sentinel-2 monthly NDVI", ID in mono | "Bundle" is internal. |
| Access | Full text retrieved in planning; Publisher text and abstract inspected | Full text retrieved; Abstract and publisher page read | Plain verbs |
| Informs | Whether grazing pressure can be assessed at all | Label "Decision it informs"; value keep | |
| Produced by | Observation analysis [View in trace] | Observation analysis [View activity] | |
| Wording (new) | none | Drafted by the model; numbers checked against the record | Carbon for AI marks AI-generated content and links it to an explanation (WRT-26); HAX guideline 11 (WRT-52). |
| Relations, empty | None recorded yet | Keep | |
| Review | Not expert-reviewed | Keep | Exactly right |
| Kind, Scope, Value, Method, Coverage, Source, Limits, Record | (labels) | Keep | |

## 9. Explanations (hypothesis ledger)

| Element | Current | Proposed | Why |
|---|---|---|---|
| Title | Competing explanations | Keep | |
| Caption | aria-label: "Competing explanations. Several can hold at once; statuses are words, never scores." | Visible caption: "Several explanations can fit at once. Siterra does not rank them." aria-label: "Competing explanations" | Talks to the reader, not about the design |
| Columns | Supports; Contradicts; Missing | Supports; Contradicts; Missing evidence | Spec wording |
| More indicator | +2 | +2 more | |
| Empty cell | None | Keep | |

### Status words

| Status | Current label | Proposed label | Description (detail panel and tooltip) | Does not mean |
|---|---|---|---|---|
| `untested` | Not yet tested | Keep | No evidence has been compared with it yet. | That it was dismissed |
| `consistent` | Consistent with available evidence | Keep | Fits the evidence so far. Other explanations can fit too. | Proof, or the only explanation |
| `inconsistent` | Inconsistent with available evidence | Contradicted by available evidence | At least one accepted observation conflicts with it as stated. | Disproof of every version of it |
| `inconclusive` | Cannot be assessed with current data | Keep | The data that would decide it are missing. Missing: {list}. | That it has been ruled out |
| `stale` | Needs re-assessment | Needs reassessment | An input changed after it was assessed. | That the earlier result was wrong |

Why change "Inconsistent": it differs from "Consistent" by two letters and shares the same long tail, so a skimming reader or a screen-reader user can miss the negation [J]. "Contradicted" matches the ledger's "Contradicts" column and the `contradicts` relation, so one word carries one meaning. "Cannot be assessed with current data" stays exactly as written: it is the demo's signature result and already in the data contract, the storyboard, and the evaluation fixtures.

### Explanation titles and assessments

| Item | Current | Proposed | Why |
|---|---|---|---|
| Title | Rainfall variability | Keep | |
| Title | Grazing-related pressure | Keep | |
| Title | Snow and growing-season timing | Keep | |
| Title | Observation artifacts | Artifacts in the satellite data | Plainer |
| Rainfall assessment | Lower spring greenness coincides with a dry wet season. Coincidence is not attribution. | Lower spring greenness came after a wet season with below-average rainfall. Timing alone does not show cause. | "Dry wet season" reads as a contradiction; "attribution" is jargon. |
| Grazing assessment | No livestock or field data exist in the case, so this explanation cannot be assessed yet. | The case has no livestock or field data, so Siterra cannot assess this explanation yet. | Siterra as the actor |
| Snow assessment | Winter observations are sparse, so timing effects cannot be separated from rainfall. | Keep | |
| Artifact assessment | Spring months meet the coverage policy, so masking alone does not explain the spring departure. | Spring months meet the 70% coverage threshold, so masking alone does not explain the lower spring values. | |
| Relations line | Relations: E3 supports; E1 supports; needs verification: local gauge records. | E3 and E1 support this explanation. Needs verification: local gauge records, and a climate-corrected productivity trend over a longer record. | Reads as a sentence |

## 10. Livelihood constraints

| Element | Current | Proposed | Why |
|---|---|---|---|
| Title | Livelihood constraints | Keep | |
| Notice | No household data was collected. Findings from regional studies are not local estimates. | Keep | A model "does not mean" line |
| Group | Dependencies | Keep | |
| Group | Who could bear costs | Keep | |
| Group | Unknown locally | Not known locally | Reads as a heading |
| Row status | Not collected | Keep | |

## 11. Possible responses

| Element | Current | Proposed | Why |
|---|---|---|---|
| Title | Possible responses | Keep | |
| Option subtitle | Candidate, needs validation | Keep | |
| Option | Participatory monitoring first | Keep | |
| Option | Negotiated seasonal rest | Keep | |
| Option | Dry-year mobility and feed plan | Keep | |
| Option | Defer pending field validation | Wait for field validation | Plainer |
| Row | Livelihood exposure | Effect on livelihoods | Plainer |
| Rows | What it is; Evidence; Who decides; Reversibility; Needs first; Ruled out if; Resources | Keep | |
| Note | No option is ranked or scored. Effects are not forecast. | Keep | Allowlisted for VT-21 |

## 12. Field-validation plan

| Element | Current | Proposed | Why |
|---|---|---|---|
| Title | Field-validation plan | Keep | |
| Status | Draft; Awaiting review; Prepared (spec) | Draft; Awaiting review; Prepared (demo) | Demo label wherever review is demo |
| Label | Informs | Decision it informs | |
| Label | Strata | Sampling strata | |
| Strata text | Elevation band by slope aspect, from the terrain model. Band thresholds are illustrative; the local team chooses sites. | Elevation band by slope direction, from the terrain model. Thresholds are illustrative. The local team chooses sites. | Plain term for "aspect"; no semicolon |
| Group | Resources (estimate status) | Resources and estimates | |
| Group | Permissions and consultation | Keep | |
| Table headers | Measure; How; When; Who | Keep | |

## 13. Decision brief

| Element | Current | Proposed | Why |
|---|---|---|---|
| Sections | Known; Uncertain; Measure next; Involve; Siterra can prepare; Needs authorization; What happens next | "Needs authorization" matches the components and motion specs | Clear and complete |
| Status | Draft; Ready for review | Keep | |
| Known line 2 | The 2021 to 2022 wet season was dry on the rainfall grid (illustrative). | Rainfall in the 2021 to 2022 wet season was below average on the rainfall grid (illustrative). | Says what was measured |
| Uncertain line 1 | Whether grazing pressure contributes: no livestock or field data exist. | Keep | |
| Prepared state (new line) | none | Prepared (demo) does not mean approved to act. Nothing has been sent or scheduled. | V3, V4 |

## 14. Review

| Element | Current | Proposed | Why |
|---|---|---|---|
| Panel title | Review the field-validation plan | Keep | |
| Tag | Demo review | Demo review: grants no real authority | |
| Proposed action | Proposed action: field-validation plan, revision 9 | Keep | |
| Field labels | Why; Uncertain; Possible effects; Authority needed; Alternatives; Status; Remaining conditions | Keep | |
| Authority text | Field visits and contact with community members require locally established consent and permissions. This app grants none. | Field visits and contact with community members need locally established consent and permissions. Siterra grants none. | One actor name |

### Role panels: what each decision means and does not mean

| Role | Part | Current | Proposed |
|---|---|---|---|
| Scientific review | Means | Method, data sufficiency and interpretation limits were reviewed at revision 9. | You reviewed the method, data sufficiency, and limits of interpretation at revision 9. |
| | Does not mean | Permission to act, or proof of what causes vegetation change. | Keep |
| | Buttons | [Record scientific review (demo)] [Request changes] | Keep |
| | Status | Requested; Review recorded (demo) | Keep |
| Community and livelihood review | Requires | A locally mandated process with documented participants. It cannot be completed inside this demo. | A locally mandated process with documented participants. It cannot be completed in this demo. |
| | Does not mean | Agreement, consent or representation of everyone who uses the pastures. | Agreement, consent, or representation of everyone who uses the pastures. |
| | Button | [Mark consultation required] | Keep |
| | Status | Not available in this demo; Consultation required | Keep |
| Program review | Means | Scope, roles and resource categories fit the program mandate. | You confirmed that the scope, roles, and resource categories fit the program mandate. |
| | Does not mean | Permission for land-use changes or third-party commitments. | Permission for land-use changes, or commitments by anyone else. |
| | Buttons | [Mark program review complete (demo)] [Defer] | [Mark program review complete (demo)] [Defer decision] |
| | Status | Requested; Marked complete (demo) | Keep |

"Means" now names the person who is accountable ("You reviewed"), which is the point of a role-scoped review.

### Confirmations, stale reviews, and the authority boundary

| Situation | Current | Proposed |
|---|---|---|
| Scientific review recorded | Scientific review recorded in demo mode. | Keep |
| Consultation marked | Community consultation marked as required. | Keep |
| Program review recorded | Program review marked complete in demo mode. Community consultation is still outstanding. | Keep |
| Case changed after the review opened | (spec) Case changed; review the current version | The case changed after this review opened. You are reviewing revision 9; the case is now at revision 10. [Review revision 10] |
| User asks Siterra to act, for example "close grazing access" | (spec) bounded proposal, authority not established, no action | Siterra cannot close or change access to pastures. Authority over access is not established in this case. Siterra prepared a discussion and validation proposal for the people who decide. |

## 15. Empty states

| Where | Current | Proposed |
|---|---|---|
| Observations, before work | Not started | Not started. Siterra loads satellite observations after the investigation starts. |
| Explanations, before work | Not started | Not started. Ask about the observations, for example: Could a dry year explain this instead? |
| Responses, before work | Not started | Not started. Siterra screens possible responses after it compares explanations. |
| Next steps, before work | Not started | Not started. Siterra builds the field-validation plan from the open questions. |
| Evidence list | none | No evidence in this section yet. |
| Ledger cell | None | Keep |
| Inspector relations | None recorded yet | Keep |
| History | none | No earlier revisions. |
| Activity | none | No activity yet. Each model call, tool call, check, and save appears here as it happens. |
| Map, no asset for the period | No map observation for this period | Keep |
| No validated observation bundle | (spec) No validated observations | No validated satellite observations. The data for this area did not pass checks, so Siterra cannot measure vegetation change. The field-validation plan still lists what to measure on the ground. |
| No rainfall bundle | (spec) rainfall hypothesis "Cannot be assessed", with the dependency | Cannot be assessed with current data. Missing: validated rainfall observations. |
| Continue after the brief | Add field observations when available | Keep |

## 16. Errors with fixes

Every error follows one structure: what happened. What it affects, or what is kept. [One action]. No apology, no blame, no raw error text (WRT-04, WRT-15, WRT-19).

| Situation | Current | Proposed |
|---|---|---|
| Planner failure | (spec) Planning failed (model timeout). Retry. | Planning stopped: the model did not respond within {seconds} s. Your request is saved. [Retry] |
| Model output rejected | (spec) failed task with retry | Siterra rejected the model's proposal: it failed {count} checks. Nothing in the case changed. [Retry] [View activity] |
| Source unavailable | (spec) citation kept, marked unavailable | Source unavailable: {short title} could not be retrieved. Siterra did not use it. [Try again] |
| Quote not found in source | (spec) `excerpt_mismatch` | Statement not added: its quote was not found in {short title}, page {page}. |
| Number not found in records | (trace) rejected 1 (number not found in referenced records) | Statement not added: a number in it was not found in the referenced records. |
| Scientific input missing | (spec) quantitative tasks blocked | Cannot measure vegetation change: no validated satellite observations for this area. Siterra still prepared the field-validation plan. |
| Conflicting revision | (spec) never overwrite newer work | The case changed while you were writing, so nothing was run. Your text is kept. [Send on revision {n}] |
| Stream interrupted | (spec) Reconnecting | Connection lost. Showing revision {n}, saved {time}. Reconnecting |
| Stream restored | none | Reconnected and loaded {count} updates. |
| Budget or time limit | (spec) partial package listing what was not done | Stopped at the {limit} limit. Siterra prepared a partial package. Not done: {tasks}. [Run remaining tasks] |
| Map failed to load | Interactive map unavailable ({error message}). The case still works; the analysis area is listed in the investigation sheet. | The interactive map could not load. Everything shown on the map is also listed in the column. |
| Save failed | none | Could not save. Your changes are kept in this tab. [Retry] |
| Model service down | none | The model service is not responding. Work already done is saved. [Retry] |
| Request too long | none (maxlength 400) | Shorten your request to 400 characters or fewer. |
| Empty request | none | Enter a question or request. |

## 17. Translation labels

These are English source strings. French strings must be written or reviewed by a fluent French speaker before they ship (ADR-0034); this file proposes none.

| Situation | Current | Proposed | Why |
|---|---|---|---|
| A statement drawn from a non-English source | (spec, TR-04) Machine-drafted translation | Machine-drafted translation from French [Show original] / [Hide original] | Names the language; the original is one action away |
| Inspector row | none | Original language: French | Accessibility doc: record the original language |
| Translated brief or field plan (P1) | (spec, ADR-0034) Machine-drafted translation, needs local review | Keep. Second line: The English original is kept alongside. [Show original] | |
| After a human review | (spec) reviewer scope and revision recorded | Translation reviewed by {role} for {scope}, revision {n} | Says who, for what, and when |
| Export of a translated document | none | This document contains machine-drafted translation. It needs local review before it is shared. | Travels with the file |
| Language menu | none | Language: English; Français | Each language named in itself [J] |
| Languages not offered yet | none | Arabic, Darija, and Amazigh are not available yet. They need testing with native speakers first. | ADR-0034 |

## 18. Mode and demo labels

The build's strings for this section follow [section 25](#25-the-precise-standard-in-the-build-accepted) (accepted) where they differ from the rows below.

| Element | Current | Proposed | Why |
|---|---|---|---|
| Live badge | (spec) LIVE | Live | VT-08 |
| Live tooltip | none | Model and tool calls run now. Observations are precomputed. | Honest about ADR-0021 |
| Replay badge | (spec) REPLAY; "Replay of live run, [date]" | Replay of live run, 24 Oct 2026 | Date format from the guide |
| Replay tooltip | none | Recorded outputs from a live run. Nothing is computed now. | |
| Concept badge | Concept prototype | Keep | |
| Concept mode line | none | Concept prototype: simulated run | Approved hero (section 1a, `valley.mode`), top centre; live and replay keep their badges |
| Concept tooltip | Concept prototype: simulated work and illustrative values | Simulated work and illustrative values. Nothing here is a result. | |
| Illustrative tag | Illustrative values, not measurements | Keep | |
| Simulation tags | Simulated in this prototype; Simulated; Simulated assessment; Simulated history; Simulated trace: illustrative timings | Keep (concept mode only) | |
| Demo review tag | Demo review | Demo review: grants no real authority | |
| Review decisions | "(demo)" suffix | Keep on every button, status, and export | VT-41 |
| Video speed label | (demo plan) Sped up 2× | Keep | |

## 19. Legends, method lines, charts, strip, and area card

### Map legends

| Element | Current | Proposed | Why |
|---|---|---|---|
| Vegetation title | Vegetation departure, Apr 2022 | NDVI departure, Apr {year}, compared with other Aprils | Approved form (section 1a, `valley.key.ndvi`): names the index and the reference |
| Vegetation subtitle | NDVI difference from the 2019 to 2025 April median, inside the catchment | Difference from the median of the other Aprils, 2019 to 2025, inside the catchment | Matches "compared with other Aprils" in the approved key: the hero paints the leave-one-year-out departure |
| Ramp ticks | -0.06; 0; +0.06 | −0.10; +0.10 | The fixed scale's ends, as in the approved key; minus sign (VT-36) |
| Missing swatch | No valid observation | Keep | |
| Rainfall grid row | Rainfall grid: 31 cells of about 5 km touch the catchment, 3 fully inside | Rainfall grid: {touching} cells of about 5 km touch the catchment, {inside} of them fully inside (33 and 2) | The counts of the frozen catchment ([data sources and methods](data-sources-and-methods.md)); 31 and 3 came from the preview |
| Coverage | 82% of area observed | Keep | |
| Coverage below threshold | No valid observation for this period (45% observed, below the 70% policy) | No valid observation: 45% of area observed, below the 70% threshold | |
| Vegetation title, any month | none | NDVI departure, {month} {year}, compared with other {months}; for example: NDVI departure, Nov 2025, compared with other Novembers | The approved form for whichever period the layer shows; one plural month name per month, so translation never builds it from fragments |
| Vegetation subtitle, any month | none | Difference from the median of the other {months}, 2019 to 2025, inside the catchment | As the Aprils subtitle above |
| Departure coverage | none | Coverage: {percent}% of area, observed in at least {years} {months} including {period}. For example: Coverage: 93% of area, observed in at least 4 Novembers including Nov 2025. Without a stated minimum: Coverage: {percent}% of area | The figure the 70% threshold applies to: the Item's `siterra:area_valid_fraction` (the record's `validFraction`), which for the departure bundle is the all-years reference's common-valid area ([analysis recipes](analysis-recipes.md), `monthly_departure`). `{years}` is the manifest's `min_reference_years`. Whole percent. Honesty line |
| Departure colored area | none | Colored: {percent}% of area, observed in {period} and at least {years} other {months}. For example: Colored: 90% of area, observed in Nov 2025 and at least 4 other Novembers. Without a stated minimum: Colored: {percent}% of area | The cells the picture paints: the leave-one-year-out measurement's `validPixelCount` over `totalPixelCount`, the same cells its area median uses. Sits under the coverage line so the two numbers are never read as one; "other" is the difference between them. Honesty line |
| Period quality flags | none | {period} views: {flags}. For example: Nov 2025 views: snow suspected; cloud screening reduced. | The approved verdict line's form (section 1a, `valley.verdict.flags`), from the period's `qualityFlags` record (the bundle's `siterra:quality_flags`). Words per flag: snow suspected; terrain shadow suspected; few satellite dates; part of the month only; scene classification incomplete; cloud screening reduced. A flag without words shows by its name, never dropped. Honesty line |
| Reduced cloud screening note | none | Cloud screening used the scene classification only. | `valley.verdict.flags.note` (section 1a), shown under the flags when `reduced_qa_fallback` is set |
| Excluded swatch | none | Hatched: cropland and buildings mapped by ESA WorldCover in 2021, left out of the field-sampling strata. Their departure is still drawn. | `data.excluded-hatch`: the legend states the reason. The second sentence says what the hatch does not mean, beside `valley.key.ndvi.note` (no cropland mask is applied to the values) |
| No-mask note | none | No cropland mask is applied: valley-floor fields and orchards are included. | `valley.key.ndvi.note` (section 1a), shown in the departure key |
| Display cell size | none | Drawn in cells of about {display} m, averaged from the {analysis} m analysis grid. The measurements use the {analysis} m cells. When the analysis grid is not recorded: Drawn in cells of about {display} m. | SC-04 asks for measured layers at true cell size; the display raster is coarser than the analysis grid (about 25.5 m over 10 m), so the key says so. Honesty line |
| Read flat legend heading | none | Map legend | The legend's lines in the flat reading |
| Collapsed legend (below 1100 px) | none | [Map legend] | The UX architecture's viewport table: the legend collapses to a button, collapsed by default. One label; `aria-expanded` carries the state (voice and tone: a toggle keeps one label). Esc closes it |
| Method line (new; required by the components spec) | none | Sentinel-2 L2A, monthly median NDVI, cloud and snow masked. Method ndvi-monthly 0.1. | Dataset and version, reference, method |
| Strata title | Sampling strata | Elevation bands | The hero's name (section 1a); the subtitle says what they are |
| Strata subtitle | Elevation band by slope aspect, from the terrain model. Thresholds illustrative. | Three sampling strata of equal area by height, from the terrain model (Copernicus GLO-30). Not pasture units or boundaries. | Full sentences; names the source and what the bands are not |
| Strata classes | Below 2,200 m; 2,200 to 2,700 m; Above 2,700 m; South-facing (hatched) | Lower band: below 2,317 m; Middle band: 2,317 to 2,815 m; Upper band: 2,815 m and above | Approved (section 1a, `valley.band.*`); the limits come from the strata bundle and no aspect class is drawn |
| Place legend | Place labels from OpenStreetMap | Place labels: OpenStreetMap | |

### Chart notes and text alternatives

| Element | Current | Proposed |
|---|---|---|
| Vegetation over time | Area median NDVI with same-month reference (gray) and spatial spread (band, not uncertainty). Hatched months are below the coverage policy. | Line: catchment median NDVI by month. Gray line: median for the same month, 2019 to 2025. Band: spread across the catchment, not uncertainty. Hatched: below 70% of area observed. |
| Vegetation and rainfall by month | Departures from same-month references: NDVI index units (2019 to 2025 median) and rainfall mm (1991 to 2020 mean, CHIRPS grid). Separate scales; no dual axis. | Top: NDVI difference from the 2019 to 2025 median for the same month. Bottom: rainfall difference in mm from the 1991 to 2020 mean (CHIRPS, about 5 km grid). Each panel has its own scale. |
| Text alternative | Two aligned panels by month, 2019 to 2025: vegetation departure in NDVI index units above, rainfall departure in millimetres per month below. Illustrative values. | Two panels by month, 2019 to 2025. Top: NDVI difference from the same-month median. Bottom: rainfall difference in millimeters per month. Illustrative values. |
| Selected value | Apr 2022: 0.215 | Apr 2022: 0.22 |
| Table headers | Month; NDVI; Departure; Rain dep. (mm); Observed | Month; NDVI; Difference from median; Rainfall difference (mm); Area observed |
| Table caption | Showing 2021 and 2022. Illustrative values, not measurements. | Keep |

The chart and table show NDVI to three decimals; the design system says two (section "Conflicts" in the guide).

### Timeline

| Element | Current | Proposed | Why |
|---|---|---|---|
| Row labels | Observed; Vegetation; Rainfall | Coverage; Vegetation; Rainfall | "Observed" can be read as observed vegetation. |
| Slider label | Selected month | Keep | |
| Value text | April 2022, 82% of area observed | Keep | |
| Value text, below threshold | January 2021, below the coverage policy (45% observed) | January 2021, 45% of area observed, below the 70% threshold | |
| Cell tooltip | Apr 2022: 82% observed | Apr 2022: 82% of area observed | |
| Disabled month on focus | (spec) Snow or cloud: 31% observed | 31% of area observed (cloud, shadow, or snow masked). Below the 70% threshold. | Names the masks without claiming which one applied |

### Area card

| Element | Current | Proposed | Why |
|---|---|---|---|
| What it is | Valley catchment (hydrological analysis extent), not a pasture, agdal or management boundary; preview boundary about 55 m | Valley catchment (hydrological analysis extent). Not a pasture, agdal, or management boundary. Preview boundary at about 55 m resolution. | Three facts, three sentences |
| Map outline label | Valley catchment, not a pasture or management boundary (prototype); Valley catchment, not a pasture, agdal or management boundary (spec) | Valley catchment: 417.0 km², with the honesty line "Not a pasture, agdal, or management boundary." beneath | Approved form (section 1a, `valley.catchment`); one label everywhere |
| First-use gloss | none | agdal: a customary institution that governs access and use | Definition from the scientific basis document |
| Not claimed | Pasture or agdal boundaries, rights, degradation or a visited site | Pasture or agdal boundaries, rights, degradation, or a site visit | Allowlisted for VT-20 |
| Commune context | Tabant commune: legal population 16,401 (HCP, 2024 general census (legal population)). Whole commune, not herding households and not the catchment. | Tabant commune: legal population 16,401 (HCP, 2024 census). This counts the whole commune, not herding households or the catchment. | No nested parentheses |
| Elevation, loading | Computing from the terrain model | Keep | |

## 20. Activity (trace)

The build's strings for this section follow [section 25](#25-the-precise-standard-in-the-build-accepted) (accepted) where they differ from the rows below.

| Element | Current | Proposed | Why |
|---|---|---|---|
| Panel title | Activity and trace | Activity | Matches the button |
| Subtitle | none | Every model call, tool call, check, and save for this case, in order. | |
| Concept tag | Simulated trace: illustrative timings | Keep | |
| Request row | Commission investigation | Start investigation (the request as sent) | |
| Task rows | Plan the investigation; Source research; Observation analysis; Rainfall comparison; Hypothesis comparison | Keep all except "Explanation comparison" | |
| Span | Model call: planner | Model call: plan the investigation | Says what the call did |
| Span | Validate plan (6 tasks) | Check plan: 6 tasks accepted | Names the outcome as well as the step |
| Span | Commit revision 2 | Saved revision 2 | Same word as the case pill menu |
| Span | search_sources (case corpus) | Keep (tool names stay in mono) | |
| Span | read_source x 5 | read_source × 5 | |
| Span | Model call: extract statements | Keep | |
| Span | Validate 6 statements, 1 rejected | Check statements: 5 accepted, 1 rejected | |
| Span | Numeric provenance check | Check numbers against records | |
| Span | Validate 4 hypotheses | Check explanations: 4 accepted | |
| Detail labels | Model; Provider request; Tokens; Tool arguments; Validation; Not shown | Keep; add "Estimated cost" (spec) | |
| Model value | Meta model through the provider adapter (identifier recorded per call) | {model ID}, recorded for each call | |
| Validation value | Accepted 5 statements; rejected 1 (number not found in referenced records) | 5 statements accepted. 1 rejected: a number was not found in the referenced records. | |
| Not shown | Prompts, keys and model reasoning are never sent to the browser | Prompts, API keys, and hidden model reasoning. They never reach the browser. | |
| Durations | 6.1 s | Keep | Space before the unit |

## 21. Screen-reader announcements

Progress is announced politely and in batches; errors are announced separately (accessibility doc).

| Event | Current | Proposed |
|---|---|---|
| Investigation started | Investigation commissioned. Siterra planned 6 tasks. Simulated in this prototype. | Investigation started. Siterra planned 6 tasks. (Concept mode adds: Simulated in this prototype.) |
| Observations ready | Observations updated: vegetation over time and 5 evidence items. | Keep |
| Explanations ready | Explanations updated: 4 explanations compared. Grazing-related pressure cannot be assessed with current data. | Keep |
| Review recorded | Scientific review recorded in demo mode. | Keep |
| Error | none | Request failed: {cause}. Your text is kept. |

## 22. History

| Element | Current | Proposed | Why |
|---|---|---|---|
| Panel title | Case history | History | Matches the button |
| Intro | Each revision records the command that produced it and what changed. Earlier revisions open read-only; completed work is never re-run on reload. | Each revision shows the request that produced it and what changed. Earlier revisions open read-only. Reloading never reruns finished work. | |
| Row label | Rev 3 | Revision 3 | No abbreviation |
| Row text | Source research completed | Source research done | Same word as the task status |
| Read-only banner | (spec) Viewing revision 3; return to current | You are viewing revision 3 (read-only). [Return to current revision] | |

## 23. Brand lines (outside the demo path)

| Element | Current | Proposed | Why |
|---|---|---|---|
| Product promise | Give an environmental problem to an AI team. Get an evidence-backed plan for what to do next. | Give Siterra an environmental question. Get an evidence-backed plan for what to check next. | "AI team" implies personas (ADR-0005); "what to check next" is the actual deliverable. |
| Tagline | Environmental intelligence, put to work. | Keep as a working line, or: "Evidence first. People decide." | "Intelligence" is vague; the alternative states the two product rules. |
| Mission phrase | autonomous environmental services firm | Keep, in pitch and about text only | ADR-0005 |

## 24. Island layout and later features

Strings for components specified after the first prototype: the map ornament and Views menu (CMP-19), legend override (CMP-20), answer card (CMP-21), comparable places (CMP-22), trace quality and usage, Meta model badges (ADR-0041), forecast refusal (ADR-0039) and export (ADR-0034). Written to this guide; review them with the checklist before release.

### Views and tours

| Element | Proposed | Note |
|---|---|---|
| Ornament button | [Views] | Opens the menu |
| Group titles | Views; Tours | |
| Overview | Overview. The whole catchment from above. | |
| Across the valley | Across the valley. Looking at the slopes on the far side. | Bearing computed from the valley axis |
| Along the valley | Along the valley. Looking up the valley from its outlet. | |
| Orbit | Orbit. A slow turn around the catchment, {seconds} s. | Tour |
| Time-lapse | Time-lapse. {month} from {firstYear} to {lastYear}, {observed} of {total} years observed. | Tour; also the timeline's [Play] |
| Status | Ready; Unavailable: {reason}; Needs update: {input} changed | |
| 3D toggle | [3D relief] | Tooltip: Shows relief in 3D. In the hero, measured layers are painted on the relief and [F Read flat] gives the flat reading (section 1a). |
| Honesty captions | Oblique view: not for reading area or pattern. Relief ×2. Preview boundary. | Fixed strings, never model text; "Relief ×2" is the approved form (section 1a, `valley.relief`) |
| Legend override | Showing your chosen view until your next request. | |
| Transport bar | [Play] [Pause] [Stop] [Previous step] [Next step] | Step label: Step {n} of {total} |
| Reduced motion | Motion is reduced. Use Next step to move through the tour. | |
| Focus mode | [Show only the map]; [Show panels] | |
| Imagery caption | Imagery: Sentinel-2, summer 2025, display only | P0 with the hero (section 1a, `valley.imagery`); the Copernicus notice is in the credit line |
| Timeline markers | Dry year in national reports (FAO GIEWS); Question asked; Findings added | P1. Siterra's own text says "dry year", not "drought" (VT-26) |
| Theme | Theme: Light; Dark; Match system | Not in P0: light is the default and the only theme the hero uses (ADR-0046); offering dark is a separate decision |

### Answer card

| Element | Proposed | Note |
|---|---|---|
| Question line | The request as the user typed it | Never rephrased |
| Working | {n} tasks running: {current step} | From events |
| Done | Answered from {n} evidence items. | |
| Next questions | Next questions | Shown as director suggestions, at most two, written as the user would ask them |
| Footer | Revision {n}. [Copy reference] | |

### Quality, models and usage

| Element | Proposed | Note |
|---|---|---|
| Trace sections | Quality checks; Models and usage | |
| Proposals | Accepted on first try: {accepted} of {total}. Repaired: {repaired}. Rejected: {rejected}. | Each rejection lists its reason |
| Numeric provenance | Numbers traced to records: {traced} of {total} | |
| Prohibited claims | Prohibited claims found: {count} | |
| Cost and time | Cost estimate: US${cost}, from provider usage and prices dated {date}. Time: {seconds} s. | Local runs: API cost US$0 |
| Models sheet title | Models in this case | Columns: Job; Model; Checked by; Status |
| Model badge | {model}, {route} | For example: Muse Spark, Model API; Muse Glimmer, local |
| Badge status | Validated; Advisory; Illustration; Draft transcript | |
| Quality tab | Latest evaluation: {date}. Model {model}, prompt version {version}. | Numbers only from the harness report |

### Second reader and illustrations

| Element | Proposed | Note |
|---|---|---|
| Flag | Second reader: check wording | Inspector and review queue only |
| Flag detail | Muse Glimmer compared this statement with its source excerpt and flagged: {overreach}. {reason} A reviewer decides. | |
| Overreach labels | States a cause the source does not; Wider scope than the source; Different quantity; More certain than the source; Changes a negation; Wrong source, actor or period | |
| No issue | Second reader: no wording issue found. | Inspector only |
| Illustration badge | Illustration by Muse Image. Not a photograph, not evidence. | Fixed |
| Illustration status | Draft illustration; Approved for community material | Only the community and livelihood reviewer approves |

### Comparable places

| Element | Proposed | Note |
|---|---|---|
| Section title | Comparable places | |
| Card fields | Studied; Found; Similar; Different; Why it may not apply here; What it cannot tell us about Aït Bouguemez | The last two are required |
| Scope note | Published context by analogy. Numbers here describe that place, not this valley. | |

### Forecast requests

| Element | Proposed | Note |
|---|---|---|
| Refusal | Siterra does not forecast vegetation here. Seven years of satellite records are too short to test a forecast against simple baselines. What would make one possible: {needs}. Added to next steps: {item}. | Names the gap, then the next step |
| Scenario label | Scenario: what a dry season looked like here ({years}) | Never on the observed timeline |

### Export and sharing (P1)

| Element | Proposed | Note |
|---|---|---|
| Dialog title | Export brief | |
| Language | Language: English; French (machine-drafted) | |
| Contents | Include: Brief; Field plan; Evidence list | |
| Note | Exports keep demo labels and outstanding conditions. | |
| Buttons | [Export PDF] [Create read-only link] [Revoke link] | |
| Link created | Read-only link created for revision {n}. Anyone with the link can view it. | |
| Stale export | This export is out of date: revision {n} changed after it was made. | |

## 25. The precise standard in the build (accepted)

Status: accepted with ADR-0043, amendment 1 and the [precise standard](voice-and-tone.md#the-precise-standard-accepted-amendment-28-oct-2026). This table is every catalog string in `apps/web/lib/copy/en.ts` that the copy pass of 28 Oct 2026 changed, added or removed, as the build shows it. Where it differs from a row in sections 1 to 24, the build follows this table; sections 6, 18 and 20 are the main ones it supersedes. Kinds: `ui` is a detail line, `label` a map or data label, `heading` a header, tab, badge, status word or stage name.

| String ID | Current | Replacement | Kind | Where shown (apps/web) | Reason |
|---|---|---|---|---|---|
| `opening.what` | Siterra assesses environmental questions for communities and organisations that have no specialist to ask. | An environmental analysis engine for communities and organizations with no specialist to ask. | ui to ui | components/opening/Opening.tsx | Detail line names Siterra an analysis engine (general product framing); US spelling |
| `opening.how` | Its agents plan the work and read published research with Meta's Muse Spark model, and code checks every quote against its source. Code computes every number. A person reviews the results; Siterra contacts no one and decides nothing. | Meta Muse Spark plans the tasks and reads published sources. Code computes every number, checks every quote against its source and marks what it could not check. Siterra sends, spends and decides nothing. | ui to ui | components/opening/Opening.tsx | Declarative; names the model and what code does; 'sends, spends and decides' states the authority boundary. Corrected 30 Oct 2026: the earlier 'A person reviews every result.' was false, since only the brief task waits for a person and a visitor's results are never reviewed by one |
| `opening.case` | This case: {question} | (removed) | ui to  | components/opening/Opening.tsx | Removed: 'This case:' replaced by a Question label over the record's own question |
| `opening.action` | Open the case | Open Region Pack | button to button | components/opening/Opening.tsx | Verb plus the object the product now names (Region Pack) |
| `opening.skip` | Skip to the map | Skip to Map | link to link | components/opening/Opening.tsx | 1 to 3 words |
| `globe.oneCase` | One case so far: Aït Bouguemez | (removed) | ui to  | components/journey | Removed: chatty ('so far') and a hard-coded place name; replaced by globe.pack from the case record |
| `globe.turn` | Turn | Turn | label to heading | components/journey | Title Case |
| `globe.dragKey` | drag | Drag | label to heading | components/journey | Title Case |
| `arrival.start` | Start investigation | Run Assessment | button to button | components/stage, components/shell | Founder item 6: 'Run assessment', in Title Case |
| `arrival.readFlat` | Read flat | Flat Map View | button to button | components/stage, components/shell | Founder item 6: 'Flat map view', in Title Case; names what F does |
| `flat.title` | Everything on screen, as text | Text View | label to heading | components/flat/FlatListing.tsx | Header, 1 to 3 words; 'Everything on screen, as text' was meta-commentary |
| `flat.skip` | Skip to everything on screen, as text | Text View | link to link | components/flat/FlatListing.tsx | 1 to 3 words; 'Skip to Text View' is 4 |
| `flat.place` | Place | Place | label to heading | components/flat/FlatListing.tsx | Title Case |
| `flat.question` | Question | Question | label to heading | components/flat/FlatListing.tsx | Title Case |
| `flat.notes` | View notes | Notes | label to heading | components/flat/FlatListing.tsx | 1 word header |
| `flat.sources` | Sources | Sources | label to heading | components/flat/FlatListing.tsx | Title Case |
| `task.queued` | Queued | Queued | label to heading | lib/card/work.ts, lib/activity/activity.ts | Title Case |
| `task.running` | Running | Running | label to heading | lib/card/work.ts, lib/activity/activity.ts | Title Case |
| `task.needs_input` | Needs your input | Input Required | label to heading | lib/card/work.ts, lib/activity/activity.ts | No 'your'; names the state |
| `task.done` | Done | Done | label to heading | lib/card/work.ts, lib/activity/activity.ts | Title Case |
| `task.partial` | Partly done | Partial | label to heading | lib/card/work.ts, lib/activity/activity.ts | 1 word status |
| `task.failed` | Failed | Failed | label to heading | lib/card/work.ts, lib/activity/activity.ts | Title Case |
| `task.cancelled` | Canceled | Canceled | label to heading | lib/card/work.ts, lib/activity/activity.ts | Title Case |
| `task.awaiting_review` | Awaiting review | Awaiting Review | label to heading | lib/card/work.ts, lib/activity/activity.ts | Title Case status |
| `work.planning` | Planning: {n} steps to answer this question | Planned tasks: {n}. | ui to ui | lib/card/work.ts, lib/activity/activity.ts | Exact count, no chat ('to answer this question') |
| `work.received` | Request received | Request received. | ui to ui | lib/card/work.ts, lib/activity/activity.ts | Full stop: a detail line |
| `work.complete` | Request complete | Complete. Findings: {n}. | ui to ui | lib/card/work.ts, lib/activity/activity.ts | States completion and the accepted-finding count; 3 words keep the card within 45 (VC-04) |
| `work.failed` | Request failed: {cause}. Your question is kept. | Assessment failed: {cause}. Question text kept. | ui to ui | lib/card/work.ts, lib/activity/activity.ts | No 'your'; 'Assessment' names the run; cause inline |
| `work.partial` | Finished with gaps. Not done: {tasks}. | Assessment partial. Not completed: {tasks}. | ui to ui | lib/card/work.ts, lib/activity/activity.ts | Declarative; task names in Title Case |
| `work.cancelled` | Request canceled | Assessment canceled. | ui to ui | lib/card/work.ts, lib/activity/activity.ts | Names the run; full stop |
| `work.cause.roundLimit` | stopped at the model round limit | model round limit reached | ui to ui | lib/card/work.ts, lib/activity/activity.ts | Fragment states the cause |
| `work.cause.rejected` | Siterra rejected the model's proposal | model proposal rejected by checks | ui to ui | lib/card/work.ts, lib/activity/activity.ts | Names who rejected: the checks |
| `work.cause.modelDown` | the model service is not responding | model service not responding | ui to ui | lib/card/work.ts, lib/activity/activity.ts | Fragment states the cause |
| `work.cause.other` | no step finished | no task completed | ui to ui | lib/card/work.ts, lib/activity/activity.ts | Task, the engine's unit, not 'step' |
| `task.kind.plan` | Plan | Plan | label to heading | lib/card/work.ts, lib/activity/activity.ts | Title Case |
| `task.kind.source_research` | Source research | Source Research | label to heading | lib/card/work.ts, lib/activity/activity.ts | Title Case |
| `task.kind.observation_analysis` | Observation analysis | Observation Analysis | label to heading | lib/card/work.ts, lib/activity/activity.ts | Title Case |
| `task.kind.livelihood_governance` | Livelihood and governance research | Livelihoods & Governance | label to heading | lib/card/work.ts, lib/activity/activity.ts | Title Case, 1 to 3 words ('&' allowed in names) |
| `task.kind.hypothesis_comparison` | Explanation comparison | Hypothesis Comparison | label to heading | lib/card/work.ts, lib/activity/activity.ts | The task tests hypotheses (stage 3); 'Explanation comparison' was the old voice rule |
| `task.kind.intervention_feasibility` | Possible responses | Intervention Feasibility | label to heading | lib/card/work.ts, lib/activity/activity.ts | Stage 4 is 'Interventions & Precedents'; the task kind's own name |
| `task.kind.brief_package` | Field-validation plan | Field Verification Plan | label to heading | lib/card/work.ts, lib/activity/activity.ts | Stage 5 'Field Verification'; the plan is the deliverable |
| `task.kind.validation` | Automated checks | Automated Checks | label to heading | lib/card/work.ts, lib/activity/activity.ts | Title Case |
| `work.observations` | Observations (precomputed) | Precomputed Observations | label to heading | lib/card/work.ts, lib/activity/activity.ts | Title Case header; 'precomputed' kept (ADR-0021) |
| `work.refused` | The request was not sent. Your question is kept. Try again. | Request not sent. Question text kept for another run. | ui to ui | lib/card/work.ts, lib/activity/activity.ts | No 'your', no 'Try again'; states what is kept |
| `work.quotaUsed` | This demo session has used its requests. Your question is kept. | Demo request limit reached for this session. Question text kept. | ui to ui | lib/card/work.ts, lib/activity/activity.ts | No 'your'; states the limit and what is kept |
| `activity.title` | Activity | Activity | label to heading | components/activity/ActivityPanel.tsx | Title Case |
| `activity.empty` | No activity yet. Each model call, tool call and check appears here as it happens. | No events for this request. | ui to ui | components/activity/ActivityPanel.tsx | Meta-commentary ('appears here as it happens') removed; a fact |
| `activity.model` | {model}, {route} | {model} · {route} | label to heading | components/activity/ActivityPanel.tsx | Badge segments with a middle dot, Title Case |
| `activity.route.synthetic` | synthetic replay | Synthetic Replay | label to heading | components/activity/ActivityPanel.tsx | Title Case |
| `activity.route.recorded` | recorded replay | Recorded Replay | label to heading | components/activity/ActivityPanel.tsx | Title Case |
| `activity.route.modelApi` | Model API | Model API | label to heading | components/activity/ActivityPanel.tsx | Title Case |
| `activity.code` | Code: {tool} | Code: {tool} | label to heading | components/activity/ActivityPanel.tsx | Title Case |
| `activity.proposal` | Model proposal: {tool} | Proposal: {tool} | label to heading | components/activity/ActivityPanel.tsx | 1 to 3 words |
| `activity.blocked` | Blocked: needs {inputs} | Required inputs not loaded: {inputs}. Attach the datasets or limit the question to loaded layers. | ui to ui | components/activity/ActivityPanel.tsx | Coverage boundary: what is missing, what is required |
| `activity.synthetic` | Replay of a synthetic run (no live model) | Synthetic Replay · No Live Model | label to heading | components/activity/ActivityPanel.tsx | Badge, Title Case, the honest mode name |
| `activity.recorded` | Replay of a recorded run | Recorded Replay | label to heading | components/activity/ActivityPanel.tsx | Badge, Title Case |
| `activity.pace` | Shown at reading pace, one event every {seconds} s | Reading pace: 1 event per {seconds} s. | ui to ui | components/activity/ActivityPanel.tsx | Exact rate as a detail line |
| `activity.showAll` | Show all steps | Show All Steps | button to button | components/activity/ActivityPanel.tsx | Title Case |
| `legend.ndvi.title` | NDVI departure, {period}, compared with other {months} | NDVI Departure · {period} | label to heading | components/map/DepartureLegend.tsx | Header 'NDVI Departure · {period}'; the comparison stays in the subtitle |
| `flat.legend` | Map legend | Map Legend | label to heading | components/flat/FlatListing.tsx | Title Case header |
| `legend.toggle` | Map legend | Map Legend | button to button | components/map/DepartureLegend.tsx | Title Case control |
| `notices.data` | Data in this case, as its records credit it | Data Credits | label to heading | components/notices/Notices.tsx | Header, 1 to 3 words; was a sentence |
| `notices.map` | Map and imagery | Map & Imagery | label to heading | components/notices/Notices.tsx | Title Case, '&' in a name |
| `notices.places` | Points on the land, as their records credit them | Place Credits | label to heading | components/notices/Notices.tsx | Header, 1 to 3 words; was a sentence |
| `notices.fonts` | Fonts | Fonts | label to heading | components/notices/Notices.tsx | Title Case |
| `notices.software` | Software | Software | label to heading | components/notices/Notices.tsx | Title Case |
| `notices.keys` | Keyboard | Keyboard | label to heading | components/notices/Notices.tsx | Title Case |
| `notices.singleKeys` | Single-key shortcuts | Single-Key Shortcuts | label to heading | components/notices/Notices.tsx | Title Case header |
| `notices.singleKeysDetail` | F opens Read flat and / moves to the command line. Turn them off if they get in your way. ↵ and Esc always work. | F toggles Flat Map View. / focuses the command line. Turning these off leaves ↵ and Esc on. | ui to ui | components/notices/Notices.tsx | No 'your', no 'get in your way'; states each key |
| `case.notFound` | This case is not open to this session. Start again from the home page. | Case not available to this session. Open the home page to start a new session. | ui to ui | components/case/CaseNotice.tsx | Declarative; what to do |
| `case.failed` | The case did not load. Nothing was changed. Reload the page to try again. | Case not loaded. No records changed. Reload the page to retry. | ui to ui | components/case/CaseNotice.tsx | Declarative; what is kept; what to do |
| `case.noBoundary` | The analysis boundary is not established yet, so the valley is not drawn. | No analysis boundary is set for this case. A catchment boundary is required to draw the region. | ui to ui | components/case/CaseNotice.tsx | Coverage boundary: what is missing, what is required |
| `command.label` | Ask Siterra | Question | label to heading | components/shell/ArrivalChrome.tsx | Names the field; founder item 6 asks for a visible label |
| `stage.relief` | Relief ×{factor} | Vertical Exaggeration ×{factor} | label to heading | components/stage, components/shell | Founder item 6 'Height exaggerated 2x'; as an instrument name in Title Case |
| `stage.north` | N | N | label to heading | components/stage, components/shell | Title Case |
| `stage.sources` | Sources and notices | Sources & Notices | link to link | components/stage, components/shell | Title Case link, '&' in a name |
| `stage.mapFailed` | The interactive map could not load. Everything it would show is listed below. | Map not loaded. All map content is listed below as text. | ui to ui | components/stage, components/shell | Declarative; no 'could not' and 'would show' |
| `mode.live` | Live | Live | label to heading | components/shell/ArrivalChrome.tsx | Title Case |
| `mode.replay` | Replay of live run, {date} | Recorded Replay · {date} | label to heading | components/shell/ArrivalChrome.tsx | Badge segments with a middle dot |
| `mode.simulated` | Simulated answer. | Simulated Answer | ui to heading | components/shell/ArrivalChrome.tsx | Badge, no full stop |
| `scope.name` | What Siterra will and will not do | Scope | label to heading | components/shell/ArrivalChrome.tsx | Header, 1 word; was a sentence |
| `scope.will` | Siterra will | In Scope | label to heading | components/shell/ArrivalChrome.tsx | Header, 1 to 3 words |
| `scope.will1` | Plan the investigation and retrieve published research | Plan the assessment and read published research | ui to ui | components/shell/ArrivalChrome.tsx | 'assessment' for the run; 'read', not 'retrieve' |
| `scope.will3` | Compare explanations and keep unresolved ones open | Test hypotheses against the records; unresolved ones stay open | ui to ui | components/shell/ArrivalChrome.tsx | Stage 3 'Hypothesis Testing'; unresolved hypotheses stay open |
| `scope.will4` | Prepare a field-validation plan and the reviews it needs | Draft a field verification plan and its required reviews | ui to ui | components/shell/ArrivalChrome.tsx | Stage 5 'Field Verification' |
| `scope.willNot` | Siterra will not | Out of Scope | label to heading | components/shell/ArrivalChrome.tsx | Header, 1 to 3 words |
| `mode.concept` | Concept prototype | Concept Prototype | label to heading | components/shell/ArrivalChrome.tsx | Badge, Title Case |
| `mode.fixture` | Fixture data | Fixture Data | label to heading | components/shell/ArrivalChrome.tsx | Badge, Title Case |
| `opening.title` | (new) | Siterra |  to heading | components/opening/Opening.tsx | Product name as the page heading; the sentence moves to a detail line |
| `opening.question` | (new) | Question |  to heading | components/opening/Opening.tsx | Field label, Title Case |
| `stage.scope_baseline` | (new) | Scope & Baseline |  to heading | lib/activity/activity.ts, components/activity/ActivityPanel.tsx, components/opening/Opening.tsx | New name, Title Case, 1 to 3 words |
| `stage.evidence` | (new) | Evidence |  to heading | lib/activity/activity.ts, components/activity/ActivityPanel.tsx, components/opening/Opening.tsx | New name, Title Case, 1 to 3 words |
| `stage.hypothesis_testing` | (new) | Hypothesis Testing |  to heading | lib/activity/activity.ts, components/activity/ActivityPanel.tsx, components/opening/Opening.tsx | New name, Title Case, 1 to 3 words |
| `stage.interventions_precedents` | (new) | Interventions & Precedents |  to heading | lib/activity/activity.ts, components/activity/ActivityPanel.tsx, components/opening/Opening.tsx | New name, Title Case, 1 to 3 words |
| `stage.field_verification` | (new) | Field Verification |  to heading | lib/activity/activity.ts, components/activity/ActivityPanel.tsx, components/opening/Opening.tsx | New name, Title Case, 1 to 3 words |
| `opening.stages` | (new) | Five Stages |  to heading | components/opening/Opening.tsx | Header for the five-stage list |
| `pack.title` | (new) | Region Pack |  to heading | lib/pack/regionPack.ts, components/shell/ArrivalChrome.tsx, components/opening/Opening.tsx | New name, Title Case, 1 to 3 words |
| `pack.layers` | (new) | Data Layers |  to heading | lib/pack/regionPack.ts, components/shell/ArrivalChrome.tsx, components/opening/Opening.tsx | New name, Title Case, 1 to 3 words |
| `pack.window` | (new) | Observation Window |  to heading | lib/pack/regionPack.ts, components/shell/ArrivalChrome.tsx, components/opening/Opening.tsx | New name, Title Case, 1 to 3 words |
| `pack.checks` | (new) | Checks |  to heading | lib/pack/regionPack.ts, components/shell/ArrivalChrome.tsx, components/opening/Opening.tsx | New name, Title Case, 1 to 3 words |
| `pack.statusLabel` | (new) | Status |  to heading | lib/pack/regionPack.ts, components/shell/ArrivalChrome.tsx, components/opening/Opening.tsx | New name, Title Case, 1 to 3 words |
| `pack.status` | (new) | {data} · {field} |  to heading | lib/pack/regionPack.ts, components/shell/ArrivalChrome.tsx, components/opening/Opening.tsx | New name, Title Case, 1 to 3 words |
| `pack.button` | (new) | Region Pack · {status} |  to heading | lib/pack/regionPack.ts, components/shell/ArrivalChrome.tsx, components/opening/Opening.tsx | New name, Title Case, 1 to 3 words |
| `pack.windowValue` | (new) | {first} to {last}, {n} months |  to ui | lib/pack/regionPack.ts, components/shell/ArrivalChrome.tsx, components/opening/Opening.tsx | New detail line |
| `pack.checksValue` | (new) | {passed} of {total} bundles passed automated data checks. |  to ui | lib/pack/regionPack.ts, components/shell/ArrivalChrome.tsx, components/opening/Opening.tsx | New detail line |
| `pack.realData` | (new) | Real Data |  to heading | lib/pack/regionPack.ts, components/shell/ArrivalChrome.tsx, components/opening/Opening.tsx | New name, Title Case, 1 to 3 words |
| `pack.checksPending` | (new) | Checks Pending |  to heading | lib/pack/regionPack.ts, components/shell/ArrivalChrome.tsx, components/opening/Opening.tsx | New name, Title Case, 1 to 3 words |
| `pack.checksFailed` | (new) | Checks Failed |  to heading | lib/pack/regionPack.ts, components/shell/ArrivalChrome.tsx, components/opening/Opening.tsx | New name, Title Case, 1 to 3 words |
| `pack.fieldUnverified` | (new) | Field Unverified |  to heading | lib/pack/regionPack.ts, components/shell/ArrivalChrome.tsx, components/opening/Opening.tsx | New name, Title Case, 1 to 3 words |
| `pack.verifiedOutcome` | (new) | Verified Outcome Recorded |  to heading | lib/pack/regionPack.ts, components/shell/ArrivalChrome.tsx, components/opening/Opening.tsx | New name, Title Case, 1 to 3 words |
| `pack.realDataDetail` | (new) | Real Data: every layer is a measured dataset that passed automated data checks. Field Unverified: no outcome has been checked on the ground. |  to ui | lib/pack/regionPack.ts, components/shell/ArrivalChrome.tsx, components/opening/Opening.tsx | New detail line |
| `globe.pack` | (new) | Region Pack: {name} |  to ui | components/journey | Names the loaded Region Pack from the case record |
| `work.outOfScope` | (new) | Out of Scope |  to heading | lib/card/work.ts, lib/activity/activity.ts | Scope refusal badge (out_of_scope), Title Case |
| `work.outOfScopeDetail` | (new) | The request treats people as the explanation by identity, or names a private individual. Questions must concern land, water, vegetation or land-use practices. |  to ui | lib/card/work.ts, lib/activity/activity.ts | Two sentences: what is wrong, what is required |
| `activity.notLoaded` | (new) | Dataset Not Loaded |  to heading | components/activity/ActivityPanel.tsx | Coverage boundary badge |
| `case.coverageRequired` | (new) | Coverage Required |  to heading | components/case/CaseNotice.tsx | Coverage boundary badge |

Unchanged (74): `globe.range`, `globe.legend`, `dive.highAtlas`, `credit.globe`, `credit.dive`, `arrival.valleyName`, `arrival.region`, `arrival.studyArea`, `arrival.studyAreaLimit`, `arrival.outlet`, `arrival.question`, `flat.close`, `flat.lonW`, `flat.latN`, `flat.km`, `flat.m`, `work.stop`, `work.observationLine`, `activity.rejected`, `activity.cause`, `rule.schema`, `rule.unknown_reference`, `rule.stale_reference`, `rule.ownership`, `rule.claim_kind`, `rule.numeric_provenance`, `rule.unit`, `rule.coverage`, `rule.authority`, `rule.prohibited_claim`, `rule.transition`, `rule.limit`, `rule.catalog_mismatch`, `rule.focus_not_permitted`, `rule.excerpt_mismatch`, `legend.ndvi.subtitle`, `legend.coverage`, `legend.ndvi.coverage`, `legend.ndvi.coverage.bare`, `legend.ndvi.painted`, `legend.ndvi.painted.bare`, `legend.flags`, `legend.flags.reducedQaNote`, `flag.snow`, `flag.terrainShadow`, `flag.lowSceneCount`, `flag.partialMonth`, `flag.qaJoinIncomplete`, `flag.reducedQa`, `legend.ndvi.excluded`, `legend.ndvi.note`, `legend.ndvi.method`, `legend.ndvi.cells`, `legend.ndvi.cellsDisplay`, `notice.maplibre`, `notice.maplibreContour`, `notice.relief`, `notice.imagery`, `notice.fontSans`, `notice.fontMono`, `stage.northName`, `stage.imagery`, `credit.terrain`, `credit.rainfall`, `credit.imagery`, `credit.outletInput`, `credit.worldcover`, `mode.liveDetail`, `mode.replayDetail`, `scope.will2`, `scope.willNot1`, `scope.willNot2`, `scope.willNot3`, `mode.conceptDetail`.

Shown but not catalog strings, so not changed in this pass:

| Text | Owner | Note |
|---|---|---|
| Event messages on the card's working line and the activity rows ("Request received", "Plan accepted with 2 tasks.", "Tool summarize_observations returned 3 records.", "Proposal accepted by validation.") | packages (event writers), not the UI lane | Declarative already; "Request received" has no full stop. A change belongs to the packages builder. |
| Bundle labels in the Region Pack and the Observations lines ("Catchment NDVI, Sentinel-2 monthly") | the case record (science lane) | Record text, shown as written. |
| Case title as the Region Pack name ("Grazing and livelihoods in the Aït Bouguemez valley") | the case record | No Region Pack name field exists in the contract; the case title stands in. |
| Place labels in the catalog (`arrival.valleyName`, `arrival.region`, `globe.range`, `dive.highAtlas`, `arrival.question`) | UI lane | Hard-coded place names, against the no-hard-coding rule; they should come from records. Not changed in this pass. |
