# Voice and tone

Status: adopted 2026-10-27 (ADR-0043). Labels: **[V]** verified from a cited source, **[D]** decision proposed here, **[H]** hypothesis to test, **[J]** style judgment with no external evidence (reason given), **[P]** rule already set by Siterra's own documents. Source IDs (`WRT-NN`) resolve in the [writing research](../../research/design/writing.md). Strings for every screen are in the [microcopy](microcopy.md).

## Scope

This guide covers every string a person reads in Siterra: labels, buttons, statuses, errors, empty states, review text, legends, exports, screen-reader announcements, and the model-written text that the validator accepts (evidence statements, assessments, planner interpretations, relationship explanations, brief lines).

It does not cover user-typed text, verbatim source excerpts, citations, identifiers, or attribution and licence notices quoted as the licensor requires. Those are shown exactly as they are.

Rules already set elsewhere still apply: the actor is Siterra, never staff or personas (ADR-0005, ADR-0033); sentence case, no all-caps eyebrows, and no middle-dot strings (`docs/reference/design-system.md`); no prohibited claims (`docs/explanation/scientific-basis.md`); cautious hypothesis status words (`docs/reference/data-contracts.md`); buttons that name their effect (`docs/reference/review-and-authority.md`).

## The voice

[D] Siterra writes like a careful field scientist briefing a busy program manager: plain words, exact numbers, the same calm in success and failure, and clear about what is not known.

## Voice principles

### 1. Say what is known, and how it is known

Every statement carries its kind (observation, published context, hypothesis, field requirement) and its scope (area, period, coverage). Put an observation and its interpretation in separate sentences, and label the interpretation.

Why: US analytic standards require products to separate underlying information from assumptions and judgments and to explain the basis of each judgment [V: WRT-50]; IPCC guidance asks authors for a traceable account of the evidence behind each finding [V: WRT-43].

| Do | Do not |
|---|---|
| Spring 2022 NDVI in the catchment was 0.03 below the 2019 to 2025 median for the same months, with 86% of the area observed. | Satellite analysis reveals a significant vegetation decline, underscoring grazing pressure. |
| Published context (Romagny et al. 2008): customary institutions govern access to collective resources in the valley. | Research shows the community manages its pastures sustainably. |

### 2. Use plain words and exact numbers

Use the shortest common word that is still correct. Keep a technical term when it is the precise name (NDVI, catchment, stratum) and explain it once per view. Give every number its unit, period, and coverage. Precision follows the method.

Why: GOV.UK makes plain English mandatory but allows technical terms where they are needed [V: WRT-02, WRT-03]; Microsoft and Polaris both ask for fewer, plainer words and copy that sounds like a person [V: WRT-10, WRT-20].

| Do | Do not |
|---|---|
| Rainfall grid about 5 km: 33 cells touch the catchment, 2 of them fully inside. | Leveraging cutting-edge satellite intelligence to unlock robust, seamless insights. |
| Vegetation index (NDVI) | Vegetation health score |

### 3. Name the gap, then the next step

When something cannot be assessed, say so first, list what is missing, and say what would decide it. "Cannot be assessed with current data" is a result, not an apology. Where a reader could take a gap as good news, say what the gap does not mean.

Why: IPCC guidance tells authors not to express a lack of knowledge as an even chance, and to describe the governing factors instead [V: WRT-43]; ICD 203 asks analysts to name the causes of uncertainty and the indicators that would change a judgment [V: WRT-50].

| Do | Do not |
|---|---|
| Cannot be assessed with current data. Missing: animal numbers and timing, the current access calendar, and field vegetation surveys. | Results may vary. Further research is needed. |
| No household data was collected. Regional study findings are not local estimates. | Livelihood impacts appear manageable. |

### 4. Siterra acts; people decide

Siterra is the only actor in product copy. Its verbs describe what software did: planned, retrieved, loaded, compared, prepared, could not assess. It never thinks, believes, or feels, and it never recommends a land decision. Real-world decisions belong to named roles, and every button says what it records.

Why: ADR-0005 and ADR-0033; Apple advises against "we" because readers cannot tell who it means [V: WRT-16]; the first Human-AI Interaction guideline is to make clear what the system can do [V: WRT-52].

| Do | Do not |
|---|---|
| Siterra prepared a field-validation plan. Field visits need local consent and permissions; Siterra grants none. | We're excited to recommend restoring the pasture. |
| Record scientific review (demo) | Approve AI plan |

### 5. Stay calm in every state

The voice is the same when work succeeds, stalls, or fails. No exclamation marks, apologies, jokes, alarm words, or emoji. A failure says what happened, what is kept, and the one thing to do next.

Why: GOV.UK error guidance asks for what happened and how to fix it, and rules out "please", "sorry", and jokes [V: WRT-04]; Google's error guidance says to focus on the fix and avoid apologies and humor [V: WRT-15]; Apple calls interjections like "oops" insincere [V: WRT-16]; Mailchimp keeps one voice while the tone changes [V: WRT-23].

| Do | Do not |
|---|---|
| Planning stopped: the model did not respond within 60 s. Your request is saved. [Retry] | Oops! Something went wrong. Please try again later. |
| Updated Explanations: competing explanations, vegetation and rainfall by month | Done! Here is what I found (party emoji) |

## Tone by situation

The voice stays fixed; the tone follows what the reader is going through [V: WRT-22, WRT-23]. Examples are from [microcopy](microcopy.md).

| Situation | Reader | Tone | Rules | Example |
|---|---|---|---|---|
| First run (arrival) | New, orienting, possibly skeptical | Brief, concrete, neutral | Place, question, one action. No findings, adjectives, or promises. Limits one click away. | Not established: whether vegetation has changed, or why |
| Working | Watching; wants to see that the work is real | Terse, factual | Present tense while running, past tense when done. Counts only from events. No percentages, no "thinking". | Retrieving published sources, then: Retrieved 5 of 6 sources (1 unavailable, not used) |
| Success | Wants the result and where it is | Plain, no celebration | Say what changed and link to it by its visible name. | Updated Observations: vegetation over time, 5 evidence items |
| Partial | Needs to know what is missing and whether it matters | Matter-of-fact | What was done, then what was not done and why, then the next step. | Prepared a partial package. Not done: livelihood research (time limit reached). [Run remaining tasks] |
| Failure | Frustrated; worried about lost work | Calm, specific | Cause, effect, what is kept, one action. No apology, blame, or humor. | Source unavailable: Romagny et al. 2008 could not be retrieved. Siterra did not use it. |
| Uncertainty | Deciding what can be said | Exact, unhedged about the limit | Status word first, then evidence for and against, then what is missing, then what would decide it. | Cannot be assessed with current data. Not the same as ruled out. |
| Review | Accountable for a decision | Formal and plain | Say what the decision means and does not mean; label demo decisions; name the revision. | Means: you reviewed the method, data sufficiency, and limits at revision 9. |
| Authority boundary | May expect Siterra to act | Firm, not judgmental, still useful | What Siterra cannot do, who decides, what Siterra can prepare instead. | Siterra cannot change access to pastures. It can prepare a proposal for the people who decide. |
| Changed inputs | May not notice the change | Neutral, specific | Name what changed and the current revision; offer one action. | Inputs changed after this was assessed. [Assess again] |
| Offline | Unsure whether work continues | Reassuring through facts | What is shown, whether work continues, that it will reconnect. | Connection lost. Showing revision 9, saved 10:21. Reconnecting |

## Writing evidence and uncertainty

### Rules [D]

1. Status words, never probabilities, confidence levels, or ranks. Explanations carry one of five status words (see [microcopy](microcopy.md), section 9). Siterra never writes "likely", "probably", "high confidence", a percentage chance, a score, or a rank for an explanation or a response. [P: data contracts]
2. Lack of evidence is its own status. "Cannot be assessed with current data" always lists what is missing and what would decide it. Its description says it is not the same as ruled out.
3. Observation first, interpretation second. State the measurement with its scope, then the interpretation in its own sentence with its claim kind. For timing, use "coincides with" or "came after", and add "Timing alone does not show cause" wherever a cause could be read in.
4. Bound every number. Pair values with area, period, reference, and coverage: "82% of area observed", "33 cells of about 5 km". Prefer a number to a hedge: "In 23 of 84 months, coverage was below the threshold", not "data may be limited".
5. Precision follows the method. NDVI to two decimals, rainfall to whole millimeters, areas to one decimal km², coverage to whole percent. Never add decimals for effect. [P: design system]
6. Label what is modeled, spread, or unknown. Modeled values say "Model estimate". A spatial band says "spread across the catchment, not uncertainty". Unknown uncertainty is "not quantified", never zero. [P: components, data contracts]
7. Keep other people's calibrated language inside their attribution. If a published assessment uses calibrated terms (for example IPCC "likely" or "high confidence"), they stay inside the attributed published-context statement. Siterra never restates them in its own voice.
8. Say what a label does not mean. Statuses, review decisions, and "Prepared" carry a "does not mean" line wherever a misreading is plausible. Stripe does this for its risk levels: its documentation says a normal-risk payment can still turn out to be fraudulent [V: WRT-30].

### Why status words and not likelihood words [V]

- The same word means different numbers in different professions. IPCC AR5 maps "likely" to a probability of 66 to 100% [WRT-43]; ICD 203 maps "likely" to 55 to 80% [WRT-50].
- Lay readers misread calibrated terms. In Budescu, Broomell, and Por (2009), people's numeric readings of IPCC probability words deviated significantly from the IPCC's intended ranges [WRT-44].
- IPCC guidance says the even-chance term must not be used to express a lack of knowledge, and that confidence is not a probability [WRT-43].
- ICD 203 forbids putting a confidence level and a likelihood in the same sentence, to avoid confusion [WRT-50].
- Google's People + AI Guidebook calls numeric confidence indicators risky and suggests not showing confidence when it does not change a decision [WRT-53].
- Siterra computes no probability for any explanation, so any likelihood word would be invented. [P]

### Why numbers beat hedges [V]

- In van der Bles et al. (2020), communicating uncertainty about numbers caused only a small drop in trust in the numbers and their source, mostly when the uncertainty was expressed in words [WRT-47].
- The UK Government Analysis Function asks for plain language about uncertainty and its sources, for titles that signal uncertainty, and for statements of what statistics can and cannot support [WRT-51].
- The National Academies note that uncertainty can be mischaracterized, exploited, or exaggerated in controversies [WRT-49]. Grazing and access to land are contested, so Siterra states limits in exact terms that are hard to quote out of context.

### Words for evidence and relations

| Use | Instead of | Why |
|---|---|---|
| consistent with | suggests, indicates, points to (for causes) | Says the evidence fits, not how strongly it implies a cause [P: data contracts] |
| contradicted by | disproves, rules out | One accepted observation conflicts with the explanation as stated; not disproof of every variant [P] |
| coincides with, came after | led to, drove, caused, due to | Timing is not attribution [P: prohibited claims] |
| below the same-month median | decline, loss, degradation | One period below a reference is not a trend or damage [P] |
| below-average rainfall; a dry season or a dry year | drought | No drought index is computed [J]. "Drought" appears only in the viewer's own question, which is shown as typed (design language 1.3; VT-26) |
| change between periods | trend | No trend analysis runs in P0 (ADR-0023) [P] |
| 0.03 below | a significant difference | No statistical test is run; "significant" implies one [J] |
| about 5 km | ~5 km, approximately | Plain and read correctly by screen readers [J] |
| spread across the catchment, not uncertainty | error band, confidence band | The band is spatial variation [P: components] |
| not quantified | low uncertainty | Unknown is not zero [P: data contracts] |
| needs verification | verified, confirmed | Nothing is field-verified in P0 [P] |
| not collected | none, zero | Missing data is not a missing thing [P] |

### Claim kind labels [P]

| Kind | Label | One-line meaning (inspector, legend, brief) |
|---|---|---|
| `observation` | Observation | Measured from data for this area and period. |
| `scientific_context` | Published context | Reported in a published source; may not describe this area or period. |
| `hypothesis` | Hypothesis | A candidate explanation, not a finding. |
| `model_estimate` | Model estimate | Computed by a model, not measured. |
| `scenario` | Scenario | An assumption to explore, not a forecast. |
| `field_requirement` | Field requirement | Needs data collected on the ground. |
| `verified_outcome` | Verified outcome | Confirmed by recorded field evidence. Not used in P0. |

## Mechanics

### Capitalization

- Sentence case for everything: headings, buttons, labels, tabs, badges, statuses, chips, and legends [V: WRT-10, WRT-13, WRT-17, WRT-21, WRT-25; P: design system].
- Capitalize proper nouns, place names, dataset names, and section names used as names (Observations, Explanations, Next steps).
- No all caps, including badges: "Live", not "LIVE" [P: design system].
- Write acronyms and dataset names as their owners do: NDVI, CHIRPS, Sentinel-2 L2A, Copernicus GLO-30.

### Punctuation

- **No em dash (U+2014), anywhere** [P: project rule]. Split the sentence, or use a colon, comma, or parentheses. Polaris also treats the em dash as a last resort [V: WRT-21], and heavy em dash use is a documented sign of LLM text [V: WRT-42].
- No en dash in UI text. Use "to" in ranges: "2019 to 2025", "Mar to May 2022" [V: WRT-02].
- Hyphens only in compound modifiers: field-validation plan, same-month median, machine-drafted translation.
- A colon introduces a value or a list: "Missing: animal numbers and timing". After a colon, lowercase unless a proper noun follows. [D]
- Prefer two sentences to a semicolon; at most one semicolon per string. [J]
- No period on headings, buttons, labels, chips, statuses, legends, or single-fragment milestones. A string with two or more sentences ends every sentence with a period [V: WRT-10, WRT-17, WRT-20].
- Question marks only on real questions, such as user-voiced suggestions.
- No exclamation marks [V: WRT-21 avoids them; WRT-24 limits them].
- No ellipses in status text; truncation is visual [J; WRT-24 limits ellipses].
- Serial comma in lists of three or more [V: WRT-10, WRT-13, WRT-21, WRT-24]. The prototype omits it; add it as strings are externalized. [D]
- "and", not "&" [V: WRT-02].
- Quotation marks only for someone's own words, never for emphasis. [J]
- Negative values take the minus sign (U+2212) in display text, and positive departures take "+": "−0.03", "+0.02". Hyphens stay in identifiers. [D]

### Numbers

- Numerals for every count and measurement, including 2 to 9 [V: WRT-02, WRT-17, WRT-21]. Do not start a full sentence with a numeral [V: WRT-24]; start with the verb or a short phrase: "Loaded 84 monthly observations", "In 23 of 84 months...". Count fragments in summaries and chips may start with a numeral: "4 explanations".
- Group thousands with the locale separator: in English, "16,401" and "3,690 m" [V: WRT-21; P: accessibility doc requires locale-aware numbers].
- Percent: the symbol, no space: "82%" [V: WRT-12, WRT-24]. Never a percent on NDVI [P: design system].
- A count is a fact or it is not shown: "Retrieved 5 of 6 sources" only when 5 retrievals succeeded [P: agent orchestration].

### Units

- A space between number and unit symbol: "5 km", "417.2 km²", "48 mm", "6.1 s" [V: WRT-27]. Percent is the deliberate exception ("82%"), following Microsoft [V: WRT-12] rather than NIST, which spaces it.
- Unit symbols after numerals, never spelled-out unit names: "5 km", not "5 kilometers" or "five km" [V: WRT-27].
- When a unit is written out in prose, use US spelling: millimeters [D: the documents use US English].
- NDVI has no unit. Write "NDVI 0.21" or "0.03 below the same-month median", not "0.03 units".

### Dates and times

- Months in visible UI: "Apr 2022"; in screen-reader text: "April 2022" [P: design system; prototype].
- Full dates: "26 Oct 2026": day, short month, year; no comma; no ordinal [D; ordinals: V: WRT-02, WRT-21]. Reason: unambiguous internationally and in the same order as French, which ships next (ADR-0034).
- Never numeric-only dates such as 10/26/2026 [V: WRT-13, WRT-21].
- Periods: "Nov 2021 to Apr 2022". In measurements, name months rather than seasons; if a season is used, define it once: "spring (March to May)". [D] Reason: seasons differ by place.
- Times: 24-hour clock, "14:05". Exports and the trace add the time zone: "14:05 UTC". Relative time only for recency in the case pill ("Saved 2 min ago"), with the absolute time on focus. [D]
- Identifiers keep ISO formats: `period_2022-04` [P: design system].

### Ranges and approximations

- "to" for every range, tables included [D]. GOV.UK allows hyphens in tables [V: WRT-02]; Siterra keeps one form so screen readers read every range the same way.
- "about" for approximations; never "~" or "approx." [J]
- Bounds in words: "at least 70% of area observed", "at most 2 model calls at a time".

### Abbreviations and technical terms

- Spell out on first use in each view, then use the short form: "vegetation index (NDVI)" [V: WRT-02, WRT-24].
- Keep a technical term when it is the precise name, and explain it once [V: WRT-02].
- Gloss local terms on first use from the project's own definition: "agdal (a customary institution that governs access and use)" [P: scientific basis].
- No Latin abbreviations or "via": write "for example", "that is", "and more", "through" [V: WRT-02, WRT-14, WRT-17].
- No internal names in the interface: ledger, bundle, commit, reducer, component, and command stay in code and the trace.

### Pronouns, voice, and contractions

- "Siterra" for the product, "you" for the reader. No "we", "our", or "us" [P: ADR-0005; V: WRT-16].
- "I" only in user-voiced text: suggestions and the "I can provide this" control.
- Active voice, with Siterra as the subject of its own actions [V: WRT-03, WRT-13]. Use the passive only when the actor is unknown or does not matter: "No household data was collected."
- No negative contractions: write "cannot" and "does not" [V: WRT-02]. Siterra's honesty lines depend on negation, so it must not be misread. Positive contractions are fine in helper text.

### Length and structure

- 25 words or fewer per sentence, one idea per sentence [V: WRT-03].
- Put the key word first: the status, then the detail [V: WRT-10].
- Status labels: one to four words, sentence case, from a small fixed set [V: WRT-05, WRT-06].
- Lists: parallel grammar; no end punctuation on fragments.

### Links, buttons, emphasis, and fields

- Link text names the destination: "Open Romagny et al. 2008"; never "click here" or a bare "Learn more" [V: WRT-16].
- Buttons start with a verb and name the object: "Request changes", "Defer decision" [V: WRT-16, WRT-20].
- No bold for emphasis inside sentences, and no emoji. Icons always have a text label. [J; WRT-42 lists mechanical boldface and emoji formatting as LLM signs]
- A placeholder never replaces a visible label and never carries hints or examples [V: WRT-09].
- A toggle keeps one label and changes its pressed state; do not write "Toggle" into the label. [J]

### Translation-ready writing [P: ADR-0034]

- One complete sentence per string. Never build a sentence by joining fragments in code.
- Plurals through ICU MessageFormat: `{count, plural, one {# source} other {# sources}}`.
- Numbers, dates, and units through `Intl` formatters, never by hand inside a string.
- No idioms, puns, or culture-bound references.
- Leave room for longer strings; the brief template must handle longer French text (ADR-0034).
- Every translated output shows its translation status, and the original stays one action away.
- Place names: source titles and map labels keep their source's spelling; Siterra's own text uses one form (see terminology).

## Terminology

| Use | Avoid | Why |
|---|---|---|
| Siterra | we, our team, analysts, the AI, the agent, assistant | No accountable staff stand behind the work (ADR-0005). |
| investigation | analysis run, job, session, chat | The work Siterra does in a case. |
| case | project, workspace, conversation | The persistent record. |
| start (the investigation) | commission (on a button), run AI, generate | As a button, "Commission investigation" can be read as a noun phrase [H]; keep "commission" in narrative copy. |
| request (what the user sends) | command, prompt, query | "Command" is engineering language; it stays in code and the trace. |
| task | agent, sub-agent, worker, job | No personas. |
| revision | version (for the case) | One word for saved states; the case pill menu already says "Revision 9". |
| saved | committed | "Commit" stays in the trace. |
| explanation | hypothesis (in headings and sentences), theory, cause | Plain for program managers; "Hypothesis" stays as the claim-kind label. |
| observation | data point, signal, insight | A claim kind with a defined meaning. |
| published context | research shows, the literature says, science says | Name the source instead. |
| field requirement | gap, to-do, missing data (as a label) | A claim kind that always says which decision it informs. |
| finding | insight, takeaway | Only for accepted statements with evidence; never for hypotheses. |
| analysis area | study site, pasture, field, polygon, AOI | Always shown with its role label. |
| vegetation index (NDVI) | vegetation health, greenness score, pasture condition, biomass | NDVI measures greenness, not health or forage [P: scientific basis]. |
| greenness | health, productivity | Acceptable plain gloss of NDVI in sentences. |
| below (or above) the same-month median; departure in legends | anomaly, decline, loss, deficit | Neutral and exact. |
| % of area observed, coverage | data quality, confidence | Coverage is measured; quality is vague. |
| coverage threshold (70%) | coverage policy | A threshold is a number people can check. [J] |
| rainfall grid (about 5 km) | local rainfall, weather station, rainfall at the pasture | CHIRPS is a gridded product [P: scientific basis]. |
| below-average rainfall | drought | No drought index is computed. [J] |
| possible response, candidate response | intervention, solution, recommendation, action plan | Candidates, not choices; "intervention" can sound imposed on communities. [J] |
| field-validation plan | action plan, deployment, survey order | A plan to collect evidence. |
| decision brief | report, recommendation, summary | It frames a decision. |
| review (by role) | approval, sign-off, endorsement | Reviews are role-scoped. |
| Prepared | approved, ready to execute, done, complete | The terminal P0 state; nothing is executed. |
| requires authorization | permission granted, approved | Authority is outside the app. |
| herding households; households that rely on these pastures | locals, beneficiaries, users, villagers | Specific and respectful. [J] |
| customary institutions | tribes, village councils (unless a source uses the term) | Use the source's term. [P] |
| holders of local landscape knowledge, including women documented in published fieldwork | stakeholders | Specific; matches SCI-04. |
| not collected | none, zero, unknown (for absent data) | Absent data is not an absent thing. |
| unknown, to be established locally | TBD, N/A | Says who would establish it. |
| machine-drafted translation | translated, AI translation | Says what made it and that it is a draft (ADR-0034). |
| Live; Replay of live run, 24 Oct 2026; Concept prototype | LIVE, REPLAY, Demo mode (alone) | Sentence case; a replay always carries its run date. |
| Activity | logs, thinking, reasoning, chain of thought | The trace shows events, not hidden reasoning. |
| lists, shows | surfaces (verb) | Google's word list avoids "surface" as a transitive verb [V: WRT-14]. |
| Aït Bouguemez | Aït Bouguemez (in Siterra's own text) | One display form, matching the study-area document, the scientific basis, and the prototype; source titles keep their own spelling. [D] |
| canceled | cancelled | US English, as in the rest of the documents. [D] |

## Banned and discouraged words

Evidence labels:

- **[R]** Research: measured overuse in LLM-generated or LLM-era text (WRT-37 to WRT-41).
- **[W]** Listed in Wikipedia's "Signs of AI writing" field guide (WRT-42). The page describes itself as observations rather than rules and warns that these signs do not prove AI authorship.
- **[G]** On a published style guide's avoid list (WRT-02 to WRT-24).
- **[J]** Siterra style judgment, with the reason.
- **[P]** Siterra honesty rule from project documents.

Levels: **Banned** is a lint error in UI strings. **Discouraged** is a lint warning, allowed with a reason.

A caution on [R]: the frequency studies show that these words rose sharply in LLM-era text, not that every use is wrong. Kobak et al. also count ordinary words such as "within" and "across" as excess; those stay allowed. Siterra bans the [R] words below because each has a plainer, more exact replacement in this product.

### A. Words overused in LLM text

| Word or phrase | Use instead | Level | Evidence |
|---|---|---|---|
| delve, delves, delving | look at, examine; or delete | Banned | [R] "delves" ran 28 times its expected 2024 frequency in PubMed abstracts (WRT-37); a focal word in WRT-40; [W] |
| underscore, underscores | shows; or delete | Banned | [R] 13.8 times (WRT-37); WRT-40; WRT-41; [W] |
| showcase, showcasing | shows | Banned | [R] 10.7 times (WRT-37); WRT-40; [W] |
| pivotal | important, and say why | Banned | [R] top adjectives in LLM-modified reviews (WRT-38); [W] |
| crucial | needed, required; or say why | Discouraged | [R] common excess word (WRT-37); [W] |
| intricate, intricacies | complex; or name the parts | Banned | [R] 11.2 times in ICLR 2024 reviews (WRT-38); about 119 times for GPT-4o (WRT-41); WRT-40; [W] |
| meticulous, meticulously | describe the check: "checked against 84 monthly records" | Banned | [R] 34.7 times (WRT-38); [W] |
| commendable, noteworthy, invaluable, innovative, groundbreaking | delete, or state the property | Banned | [R] WRT-38 top adjectives; "groundbreaking" in WRT-40 |
| realm | field, area, topic | Banned | [R] WRT-40 |
| boasts | has | Banned | [R] WRT-40; [W] |
| garner, garnered | received, got | Banned | [R] WRT-40; [W] |
| tapestry, rich tapestry | name the parts | Banned | [R] about 155 times for GPT-4o (WRT-41); [W] |
| camaraderie, palpable, amidst | among; clear; or delete | Banned | [R] WRT-41 |
| vibrant, nestled, renowned, in the heart of | describe concretely | Banned | [W] |
| a testament to, stands as | shows; is | Banned | [W] |
| plays a crucial (vital, pivotal, key) role | say what it does | Banned | [W] |
| insights | findings (only with evidence); or name the thing | Banned | [R] common excess word (WRT-37); [W] |
| comprehensive | say what is covered: "all 84 months" | Discouraged | [R] WRT-37 |
| additionally, notably, particularly (opening a sentence) | Also; or delete | Discouraged | [R] WRT-37; [W] |
| enhance, enhancing | improve; or be specific | Discouraged | [R] WRT-37 |
| trailing clauses: ", highlighting", ", ensuring", ", contributing to" | end the sentence; start a new one | Discouraged (review) | [R] present participial clauses at about 5 times the human rate in GPT-4o text (WRT-41); [W] |
| not only X but also Y; it is not X, it is Y | state the point directly | Discouraged | [W] |
| rhetorical triads | list only the real items; two or four is fine | Discouraged (review) | [W] |

### B. Corporate and marketing words

| Word or phrase | Use instead | Level | Evidence |
|---|---|---|---|
| leverage | use | Banned | [G] WRT-02, WRT-11, WRT-14 |
| utilize | use | Banned | [G] WRT-02, WRT-14 |
| robust | reliable, checked; or name the check | Banned | [G] WRT-02; [W] |
| empower | let, allow | Banned | [G] WRT-02 |
| facilitate | name the action: run, prepare | Banned | [G] WRT-02 |
| streamline | simplify | Banned | [G] WRT-02 |
| transform, transformative | describe the change | Banned | [G] WRT-02 |
| seamless, seamlessly | delete | Banned | [G] WRT-17 |
| deliver (abstract), deploy (outside software) | make, provide, prepare | Discouraged | [G] WRT-02 |
| key (adjective) | delete, or important | Discouraged | [G] WRT-02 |
| impact (verb) | affect | Discouraged | [G] WRT-02, WRT-14 |
| foster, tackle, combat | encourage; solve, deal with | Discouraged | [G] WRT-02 |
| unlock | lets you; or name the result | Banned | [J] a metaphor with no concrete meaning |
| harness | use | Banned | [J] |
| holistic | name what is included | Banned | [J] |
| synergy | delete | Banned | [J] |
| cutting-edge, state-of-the-art, next-generation, world-class, best-in-class | delete; describe the capability | Banned | [J] unverifiable superlatives |
| game-changing, revolutionize, revolutionary | delete | Banned | [J] |
| AI-powered, powered by AI, smart, magic | say what Siterra does | Banned | [J]; HAX guideline 1 [V: WRT-52] |
| in today's fast-paced world, in an era of | delete | Banned | [J] |
| navigate the complexities, navigate the landscape | name the task | Banned | [J]. "Landscape" is literal in Siterra and stays allowed. |
| journey, ecosystem (as metaphors) | name the steps; name the parts | Discouraged | [J]. "Ecosystem" stays allowed in its ecological sense. |

### C. Hedges and filler

| Word or phrase | Use instead | Level | Evidence |
|---|---|---|---|
| it is important to note (that), it is worth noting | delete; state the fact | Banned | [W] |
| may potentially, could possibly, it seems that, somewhat, arguably, relatively | name the actual limit: "In 23 of 84 months, coverage was below the threshold" | Discouraged | [J]; ICD 203 asks for causes of uncertainty, not hedges [V: WRT-50] |
| simply, just, easily, obviously, clearly | delete | Discouraged | [G] WRT-14 |
| very, quite, really | delete, or give the number | Discouraged | [G] WRT-17 |
| e.g., i.e., etc., via | for example, that is, and more, through | Discouraged | [G] WRT-02, WRT-14, WRT-17 |
| in conclusion, in summary | delete | Banned | [J] |
| more research is needed | name the missing evidence and the decision it informs | Banned | [P] |

### D. Chat and persona language

| Word or phrase | Use instead | Level | Evidence |
|---|---|---|---|
| we, our, us, our team, our analysts, experts found | Siterra | Banned | [P] ADR-0005; [G] WRT-16 |
| Siterra thinks, believes, feels, knows, is confident | Siterra found, compared, could not assess | Banned | [J], [P] |
| Thinking, Reasoning (as a status) | Planning; or the task name | Banned | [J]; the trace shows no hidden reasoning [P] |
| Certainly, Great question, I hope this helps, Let me know | delete | Banned | [W] |
| As an AI | delete | Banned | [J] |
| recommend, we suggest, the best option (for responses) | candidate response | Banned | [P] a `proposes_response` link never means a recommendation |

### E. Error and status cliches

| Word or phrase | Use instead | Level | Evidence |
|---|---|---|---|
| Oops, Uh-oh, Whoops | delete; state the cause | Banned | [G] WRT-04, WRT-15, WRT-16 |
| please, sorry (in errors) | delete | Banned | [G] WRT-04, WRT-15 |
| Something went wrong, An error occurred, Unknown error | the cause, what is kept, the action | Banned | [G] WRT-04, WRT-07, WRT-15, WRT-19 |
| invalid | say what is needed | Banned | [G] WRT-04, WRT-16, WRT-19 |
| Approve, OK, Submit, Yes (as action buttons) | the effect: "Record scientific review (demo)" | Banned | [P] review spec; [G] WRT-16 |
| Click here, Learn more (alone) | name the destination | Banned | [G] WRT-16 |

### F. Honesty violations

Lint errors everywhere except strings allowlisted by ID for the "not claimed" panels.

| Word or phrase | Use instead | Level | Evidence |
|---|---|---|---|
| overgrazing detected, overgrazed, degraded, degradation, damage, crisis | below the same-month median; cannot be assessed with current data | Banned | [P] PC-03, SV-03, scientific basis |
| carrying capacity, animal units, biomass | not claimed | Banned | [P] |
| caused by, due to grazing, proves, confirms grazing | consistent with; coincides with | Banned | [P] |
| likely, unlikely, probably, high confidence, a percentage chance, score, rank, best option | a status word plus what supports, contradicts, and is missing | Banned in model text, discouraged in UI | [P] data contracts; [V] WRT-43, WRT-44, WRT-50, WRT-53 |
| vegetation (pasture, land) health | vegetation index (NDVI) | Banned | [P] |
| the community agreed, consent obtained, approved by the community | consultation required; not established | Banned | [P] |
| significant (no named test), trend (no trend analysis), drought (no index), reveals | the number; change between periods; below-average rainfall; shows | Discouraged in model text | [J], [P] |
| verified, confirmed (for anything not field-verified) | checked (automated), reviewed (demo) | Discouraged | [P] |
| real-time | precomputed; live (for model work only) | Discouraged | [P] ADR-0021 |

### G. Typography

| Item | Use instead | Level | Evidence |
|---|---|---|---|
| em dash (U+2014) | colon, comma, parentheses, or two sentences | Banned everywhere | [P] project rule; [G] WRT-21; [W] |
| en dash in ranges | to | Banned in UI | [G] WRT-02 |
| exclamation mark | period | Banned | [G] WRT-21; [J] |
| emoji | an icon with a text label | Banned | [W]; [J] |
| all caps | sentence case | Banned | [P] design system |
| middle-dot separators | labeled fields or separate elements | Banned | [P] design system |
| ellipsis in status text | the verb alone | Discouraged | [G] WRT-24 |
| bold for emphasis in sentences | plain text | Discouraged | [W] |

## Lint rules

### Where they run [D]

| Scope | Strings | Rules |
|---|---|---|
| `ui` | Every externalized UI string, including aria-label and alt text | Rules with scope `ui` |
| `label` | Buttons, headings, badges, statuses, chips, tabs | `ui` rules plus VT-09 |
| `button` | Button labels | `ui` rules plus VT-40 and VT-41 |
| `link` | Link text | `ui` rules plus VT-42 |
| `model` | Model-written fields before commit: evidence statements, assessments, relationship explanations, planner interpretations, brief lines | Rules with scope `model`. Errors reject the item as a validation issue, like the numeric provenance check, so the task retries with the issue listed. Warnings are logged in the trace. |
| `docs` | Repository Markdown | VT-01 only |
| never | User-typed text, verbatim source excerpts, citations, identifiers, attribution and licence notices quoted as the licensor requires, code, and this guide's own examples | None |

Exceptions are allowlisted by string ID with a written reason, never by pattern. Known cases: the area card's "Not claimed" line must contain "degradation"; the "What this case does not claim" panel lists prohibited claims by design; and five strings say that nothing is ranked, which VT-21 warns on in interface text: the responses note "No option is ranked or scored", the ledger caption "Siterra does not rank them.", the options interpretation "It will not rank them.", the Responses summary "4 possible responses, not ranked." and the hero's "5 explanations, none ranked".

The hero's strings ([microcopy](microcopy.md#1-demo-opening), sections 1 and 1a) carry these handled cases. The opening page quotes cited published results exactly as worded in [problem.md](../explanation/problem.md), outside the product chrome, as title overlays with their source tags:

| String ID | Rules | Handling and reason |
|---|---|---|
| `opening.beat2` | VT-20 error ("degraded"), VT-31 warning ("40 per cent") | Allowlisted. Cited published result (SCI-29) quoted exactly as worded in problem.md; shown outside the product chrome as a title overlay with its source tag; describes a simulation study, not this valley. It is Siterra's paraphrase of the abstract, not a verbatim excerpt, so the excerpt scope does not apply |
| `opening.beat3` | VT-34 warning ("six years"), VT-50 warning (28 words) | Kept as the approved source wording; warnings recorded with that reason |
| `opening.beat1` source tag | VT-08 warning ("UNCCD") | Cleared: UNCCD, FAO, IPBES and UNEP are in the acronym allowlist |
| `valley.work.explanations.done` | VT-21 warning ("ranked") | Kept: it says that no explanation was ranked |
| `valley.challenge.question` | VT-26 error ("drought") | Not linted: the viewer's own question, shown as typed (scope `never`); Siterra's own text never repeats the word |
| `credit.*` and `notices.*` | VT-03 warnings ("2019-2025", "2010-2014"), VT-08 warnings ("DLR", "COPERNICUS") | Not linted: attribution and licence notices quoted as the licensor requires (scope `never`) |

### Rule summary

| ID | Level | Scope | Catches | Fix |
|---|---|---|---|---|
| VT-01 | Error | ui, model, docs | Em dash | Two sentences, colon, comma, or parentheses |
| VT-02 | Error | ui, model | En dash and similar dashes | "to" in ranges; hyphen in compounds |
| VT-03 | Warn | ui, model | Hyphen ranges: 2019-2025, 0-3 months | "2019 to 2025" |
| VT-04 | Warn | ui | Middle-dot separators | Labeled fields |
| VT-05 | Warn | ui, model | Ellipses | The verb alone |
| VT-06 | Error | ui, model | Exclamation marks | Period |
| VT-07 | Error | ui, model | Emoji and pictographs (©, ®, ™ allowed) | Icon with text label |
| VT-08 | Warn | ui | All-caps words outside an acronym allowlist | Sentence case |
| VT-09 | Warn | label | Title Case outside a proper-noun allowlist | Sentence case |
| VT-10 | Error (ui), warn (model) | ui, model | LLM-overused vocabulary, list A | Replacement table |
| VT-11 | Error (ui), warn (model) | ui, model | Corporate and marketing words, list B | Replacement table |
| VT-12 | Error | ui, model | Stock phrases | Delete; state the fact |
| VT-13 | Warn | ui, model | Negative parallelisms | State the point |
| VT-14 | Error | ui, model | "we", "our", staff as actor | Siterra |
| VT-15 | Warn | ui, model | Mental-state verbs for Siterra; "Thinking" | Action verbs |
| VT-16 | Warn | ui, model | Filler words and stacked hedges | Delete, or name the limit |
| VT-17 | Warn | ui | Vague or apologetic errors | Cause, what is kept, action |
| VT-18 | Warn | ui, model | Latin abbreviations, "via" | Plain words |
| VT-19 | Warn | ui, model | "surfaces" (verb), "&", "real-time" | "lists", "and", "precomputed" |
| VT-20 | Error | ui, model | Prohibited claims | Allowlist only the "not claimed" panels |
| VT-21 | Error (model), warn (ui) | ui, model | Probability, confidence, score, rank | Status word plus evidence |
| VT-22 | Error | ui, model | "vegetation health" and similar | Vegetation index (NDVI) |
| VT-23 | Warn | model | Recommendation language for responses | Candidate response |
| VT-24 | Warn | model | drought, reveals, significant, trend, verified | Check the claim |
| VT-25 | Warn | model | Markdown in model text | Plain text |
| VT-26 | Error | ui | "drought" in Siterra's own text | "a dry season", "a dry year" |
| VT-30 | Warn | ui, model | Missing space before a unit: 5km | 5 km |
| VT-31 | Warn | ui, model | "82 %" or "82 percent" | 82% |
| VT-32 | Error | ui, model | Numeric dates: 10/26/2026 | 26 Oct 2026 |
| VT-33 | Warn | ui, model | Ordinal days: 2nd | 2 |
| VT-34 | Warn | ui, model | Spelled-out counts: three municipalities | 3 municipalities |
| VT-35 | Error | ui, model | Percent on NDVI | Index difference |
| VT-36 | Warn | ui | Hyphen-minus for negative values | Minus sign U+2212 |
| VT-37 | Warn | ui, model | UK spellings | US spellings |
| VT-38 | Warn | model | A sentence that starts with a numeral | Start with the verb or a short phrase |
| VT-40 | Error | button | OK, Yes, Submit, Approve, Defer (alone) | Verb plus object |
| VT-41 | Error | button | Review button without "(demo)" in demo mode | Add "(demo)" |
| VT-42 | Warn | link | "Learn more", "click here" | Name the destination |
| VT-43 | Warn | ui, model | Negative contractions | cannot, does not |
| VT-50 | Warn | ui, model | Sentence over 25 words (function) | Split it |

### Patterns

JavaScript (Node 22 or later; the patterns use lookbehind and Unicode property escapes). Run `lint(text, scope)` over the string catalog in CI and over model fields in the commit validator.

```js
const PROPER = [
  "Siterra", "NDVI", "CHIRPS", "Sentinel-2", "Copernicus", "OpenStreetMap", "Aït", "Ait", "Bouguemez",
  "Ouchi", "Central", "High", "Atlas", "Morocco", "Tabant", "Azilal", "Jbel", "Azourki", "Lac", "Izoughar",
  "Oued", "Lakhdar", "Assif", "Earth", "Search", "Muse", "Spark", "Meta", "French", "Arabic", "Darija",
  "Tamazight", "Tashelhit", "Amazigh", "English", "Place", "Observations", "Explanations", "Responses", "Next",
  "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November",
  "December", "Jan", "Feb", "Mar", "Apr", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "WorldCover", "Mountains",
];
const PROPER_ALT = PROPER.map((w) => w.replace(/[-]/g, "\\-")).join("|");

export const RULES = [
  // A. Typography
  { id: "VT-01", sev: "error", scope: ["ui", "model", "docs"], re: /\u2014/g, fix: "No em dash. Split the sentence, or use a colon, comma or parentheses." },
  { id: "VT-02", sev: "error", scope: ["ui", "model"], re: /[\u2012\u2013\u2015]/g, fix: "No en dash. Use 'to' for ranges, a hyphen for compound words." },
  { id: "VT-03", sev: "warn", scope: ["ui", "model"], re: /\b(?:19|20)\d{2}\s?-\s?(?:19|20)\d{2}\b|\b\d+(?:\.\d+)?\s?-\s?\d+(?:\.\d+)?\s?(?:%|km²|km|mm|m|months?|years?)(?=\W|$)/g, fix: "Write ranges with 'to': '2019 to 2025', '0 to 3 months'." },
  { id: "VT-04", sev: "warn", scope: ["ui"], re: /\s\u00B7\s/g, fix: "No middle-dot separators. Use labeled fields or separate elements." },
  { id: "VT-05", sev: "warn", scope: ["ui", "model"], re: /\u2026|\.{3}/g, fix: "No ellipsis in status text. Truncation is done by CSS." },
  { id: "VT-06", sev: "error", scope: ["ui", "model"], re: /!/g, fix: "No exclamation marks." },
  { id: "VT-07", sev: "error", scope: ["ui", "model"], re: /(?![\u00A9\u00AE\u2122])\p{Extended_Pictographic}/gu, fix: "No emoji or pictographs. Use the icon set with a text label." },
  { id: "VT-08", sev: "warn", scope: ["ui"], re: /\b(?!(?:NDVI|CHIRPS|DEM|GLO|ESA|OSM|HCP|SCI|GPS|UCSB|URL|API|PDF|CSV|JSON|SSE|UTC|ISO|WCAG|GIS|CRS|COG|STAC|USGS|EROS|NOAA|NASA|SRTM|GMTED|ETOPO|IRCAM|UNCCD|FAO|IPBES|UNEP|GIEWS)\b)[A-Z]{3,}\b/g, fix: "No all caps. Use sentence case: 'Live', not 'LIVE'." },
  { id: "VT-09", sev: "warn", scope: ["label"], re: new RegExp(`(?<=\\S\\s+)(?<![:.?!]\\s)(?!(?:${PROPER_ALT})\\b)[A-Z][a-z]+`, "g"), fix: "Sentence case: capitalize only the first word and proper nouns (allowlist in the rule)." },

  // B. Words and phrases
  { id: "VT-10", sev: "error", scope: ["ui", "model"], modelSev: "warn", re: /\b(?:delv(?:e|es|ed|ing)|tapestr(?:y|ies)|testaments?|underscor(?:e|es|ed|ing)|showcas(?:e|es|ed|ing)|pivotal|intricac(?:y|ies)|intricate(?:ly)?|meticulous(?:ly)?|commendabl[ey]|noteworthy|invaluable|groundbreaking|realms?|boast(?:s|ed|ing)?|garner(?:s|ed|ing)?|vibrant|camaraderie|palpable|amidst|nestled|renowned|insights?)\b/gi, fix: "Word overused in LLM text. Use the plain word from the replacement table." },
  { id: "VT-11", sev: "error", scope: ["ui", "model"], modelSev: "warn", re: /\b(?:leverag(?:e|es|ed|ing)|utili(?:s|z)(?:e|es|ed|ing|ation)|robust(?:ly|ness)?|seamless(?:ly)?|empower(?:s|ed|ing|ment)?|unlock(?:s|ed|ing)?|harness(?:es|ed|ing)?|holistic(?:ally)?|synerg(?:y|ies|istic)|cutting[- ]edge|state[- ]of[- ]the[- ]art|next[- ]gen(?:eration)?|game[- ]?chang(?:er|ers|ing)|revolutioni(?:s|z)(?:e|es|ed|ing)|revolutionary|transformative|streamlin(?:e|es|ed|ing)|facilitat(?:e|es|ed|ing)|supercharg(?:e|es|ed|ing)|world[- ]class|best[- ]in[- ]class|AI[- ]powered|powered by AI)\b/gi, fix: "Corporate or marketing word. Say what Siterra does: 'use', 'checked', 'lets you'." },
  { id: "VT-12", sev: "error", scope: ["ui", "model"], re: /\b(?:it(?:['\u2019]s| is) (?:important|worth|crucial|essential) to (?:note|remember|highlight|mention)|it(?:['\u2019]s| is) worth noting|in today['\u2019]s (?:fast[- ]paced|ever[- ]changing|digital|modern) (?:world|age|landscape)|navigat(?:e|es|ed|ing) the (?:complexit(?:y|ies)|landscape|intricacies|challenges)|(?:a|the) testament to|plays? an? (?:crucial|vital|pivotal|key|significant|important|central) role|in the heart of|setting the stage for|indelible mark|deeply rooted|(?:let['\u2019]s|let us) (?:dive|delve)|deep[- ]dive|dive (?:in|into)|I hope this helps|great question|as an AI|in conclusion|at the end of the day|rich (?:tapestry|heritage))\b/gi, fix: "Stock phrase. Delete it and state the fact." },
  { id: "VT-13", sev: "warn", scope: ["ui", "model"], re: /\bnot (?:only|just|merely)\b[^.?!]{0,80}?\bbut\b|\b(?:it|this)(?:['\u2019]s| is) not\b[^.?!]{0,60}?[,;:]\s*(?:it|this)(?:['\u2019]s| is)\b/gi, fix: "Negative parallelism ('not only X but Y', 'it is not X, it is Y'). State the point directly." },
  { id: "VT-14", sev: "error", scope: ["ui", "model"], re: /\b(?:[Ww]e(?:(?:'|\u2019)(?:re|ve|ll|d))?|[Oo]urs?|us)\b|\b(?:[Oo]ur|[Tt]he) (?:team|analysts?|experts?|scientists?|consultants?|staff)\b|\b(?:[Aa]nalysts?|[Cc]onsultants?|[Ee]xperts?) (?:found|reviewed|checked|recommend(?:s|ed)?|believe)\b/g, fix: "The actor is Siterra. No 'we', 'our team' or staff." },
  { id: "VT-15", sev: "warn", scope: ["ui", "model"], re: /\b(?:Siterra|the AI|the model|the system|the agent)\s+(?:thinks|believes|feels|knows|understands|wants|hopes|is (?:thinking|confident|sure|certain|excited|happy|sorry|worried|reasoning))\b|^(?:Thinking|Reasoning|Pondering)\b/gim, fix: "Describe actions, not mental states: 'Siterra compared', 'Siterra could not assess'." },
  { id: "VT-16", sev: "warn", scope: ["ui", "model"], re: /\b(?:simply|easily|obviously|clearly|basically|essentially|actually|really|very|quite|somewhat|arguably|relatively|to some extent|it (?:seems|appears)(?: that)?|may potentially|could possibly|might possibly)\b|\bjust\b(?! now)/gi, fix: "Filler or stacked hedge. Delete it, or name the actual limit." },
  { id: "VT-17", sev: "warn", scope: ["ui"], re: /\b(?:oops|uh[- ]oh|whoops|sorry|please|something went wrong|(?:an )?(?:unknown|unexpected) error|error (?:has )?occurred|invalid)\b/gi, fix: "Vague or apologetic error. Say what happened, what is kept, and what to do." },
  { id: "VT-18", sev: "warn", scope: ["ui", "model"], re: /(?:^|[\s(])(?:e\.g\.|i\.e\.|etc\.)|\bvia\b|\bvs\.?(?=\s)/gi, fix: "Use 'for example', 'that is', 'through', 'compared with'." },
  { id: "VT-19", sev: "warn", scope: ["ui", "model"], re: /\bsurfac(?:es|ed|ing)\b|\s&\s|\breal[- ]time\b/gi, fix: "Use 'lists' or 'shows' (not 'surfaces'), 'and' (not '&'); observations are precomputed, not real time." },

  // C. Honesty
  { id: "VT-20", sev: "error", scope: ["ui", "model"], re: /\b(?:overgraz(?:ed|ing)|degrad(?:ed|ation|ing)|damag(?:e|ed|ing)|crisis|carrying capacity|animal units?|biomass|restor(?:ed|ation) (?:success|achieved|works)|(?:communit(?:y|ies)|households?|herders?) (?:agreed|approved|consented|support(?:s|ed)?)|consent (?:obtained|given|granted|secured)|approved by (?:the )?(?:community|communities|authorit(?:y|ies))|prov(?:es|ed|en)|confirm(?:s|ed)? (?:that )?(?:grazing|overgrazing|drought|degradation)|caused by|due to (?:grazing|overgrazing|livestock|herding|drought))\b/gi, fix: "Prohibited claim. Allowed only in the 'not claimed' panel strings (allowlist by string ID)." },
  { id: "VT-21", sev: "error", scope: ["ui", "model"], uiSev: "warn", re: /\b(?:likely|unlikely|likelihood|probabl(?:e|y)|probability|almost certain(?:ly)?|virtually certain|(?:high|low|medium|moderate)(?:ly)? confiden(?:t|ce)|confidence (?:level|score|interval)|\d{1,3}\s?% (?:chance|likely|probability|confidence|confident|certain(?:ty)?)|scor(?:e|es|ed|ing)|rank(?:s|ed|ing)?|best option|top option|winner)\b/gi, fix: "No probabilities, confidence or ranking. Use a status word plus what supports, contradicts and is missing." },
  { id: "VT-22", sev: "error", scope: ["ui", "model"], re: /\b(?:vegetation|pasture|rangeland|land|ecosystem) health\b/gi, fix: "NDVI is not health. Say 'vegetation index (NDVI)'." },
  { id: "VT-23", sev: "warn", scope: ["model"], re: /\brecommend(?:s|ed|ation|ations)?\b|\bthe best (?:option|response|choice)\b|\bshould adopt\b/gi, fix: "Siterra does not recommend responses in P0. Say 'candidate response'." },
  { id: "VT-24", sev: "warn", scope: ["model"], re: /\bdrought\b|\breveal(?:s|ed|ing)?\b|\bdemonstrat(?:es|ed|ing) that\b|\bsignifican(?:t|tly|ce)\b|\btrends?\b|\b(?:verified|confirmed)\b/gi, fix: "Check the claim: 'below-average rainfall' unless a drought index was computed; no 'significant' without a named test; no 'trend' without a trend analysis; 'verified' only for verified outcomes." },
  { id: "VT-25", sev: "warn", scope: ["model"], re: /\*\*[^*\n]+\*\*|__[^_\n]+__|^#{1,6}\s/gm, fix: "No markdown in model text. The renderer formats records." },
  { id: "VT-26", sev: "error", scope: ["ui"], re: /\bdroughts?\b/gi, fix: "Siterra's own text says 'a dry season' or 'a dry year'; no drought index is computed. 'Drought' appears only in the viewer's own words, shown as typed." },

  // D. Numbers, units, dates
  { id: "VT-30", sev: "warn", scope: ["ui", "model"], re: /\b\d+(?:[.,]\d+)?(?:km²|km2|km|mm|m|ha|min)\b/g, fix: "Space between number and unit: '5 km', '3,690 m'." },
  { id: "VT-31", sev: "warn", scope: ["ui", "model"], re: /\d\s+%|\b\d+\s?per ?cent\b/gi, fix: "Percent: '82%', no space, symbol not word." },
  { id: "VT-32", sev: "error", scope: ["ui", "model"], re: /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g, fix: "No numeric dates. Write '26 Oct 2026' or 'Apr 2022'." },
  { id: "VT-33", sev: "warn", scope: ["ui", "model"], re: /\b\d{1,2}(?:st|nd|rd|th)\b/gi, fix: "No ordinal days: '2 June', not '2nd June'." },
  { id: "VT-34", sev: "warn", scope: ["ui", "model"], re: /\b(?:two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(?:sources?|months?|years?|tasks?|explanations?|hypothes[ie]s|cells?|items?|unknowns?|villages?|municipalities|strata|options?|responses?|records?|revisions?|reviews?|roles?)\b/gi, fix: "Use numerals for counts: '3 municipalities'." },
  { id: "VT-35", sev: "error", scope: ["ui", "model"], re: /[-+\u2212]?\d+(?:\.\d+)?\s?%\s*(?:of )?NDVI\b|\bNDVI\s+(?:fell|dropped|rose|increased|decreased|declined|changed|was)\s+(?:by\s+)?[-+\u2212]?\d+(?:\.\d+)?\s?%/gi, fix: "No percent on NDVI. Give the index difference: 'NDVI 0.03 below the same-month median'." },
  { id: "VT-36", sev: "warn", scope: ["ui"], re: /(?:^|[\s(])-(?=\d)/g, fix: "Use the minus sign (U+2212) for negative values in display text." },
  { id: "VT-37", sev: "warn", scope: ["ui", "model"], re: /\b(?:millimetres?|centimetres?|metres?|kilometres?|labell(?:ed|ing)|behaviour|colour(?:s|ed)?|organis(?:e|ed|ation)|analys(?:e|ed|ing)|modell(?:ed|ing)|cancell(?:ed|ing)|programme|centre)\b/gi, fix: "US English: millimeters, labeled, canceled, program, center." },

  { id: "VT-38", sev: "warn", scope: ["model"], re: /(?:^|[.?!]\s+)\d/gm, fix: "Do not start a sentence with a numeral. Start with the verb or a short phrase: 'In 23 of 84 months, ...'." },

  // E. Actions and links
  { id: "VT-40", sev: "error", scope: ["button"], re: /^(?:OK|Okay|Yes|No|Submit|Approve(?: AI)?|Accept|Confirm|Proceed|Go|Defer|Run AI|Generate|Click here|Learn more|Let['\u2019]s go)$/i, fix: "Name the effect: verb plus object ('Defer decision', 'Record scientific review (demo)')." },
  { id: "VT-41", sev: "error", scope: ["button"], re: /^(?:Record scientific review|Mark program review complete|Record (?:community|program) review)(?!.*\(demo\))/, fix: "In demo mode, review buttons end with '(demo)'." },
  { id: "VT-42", sev: "warn", scope: ["link"], re: /^(?:click here|here|learn more|read more|more|link|this)$/i, fix: "Link text names the destination: 'Open source: Romagny et al. 2008'." },
  { id: "VT-43", sev: "warn", scope: ["ui", "model"], re: /\b(?:can|don|won|isn|doesn|aren|wasn|weren|haven|hasn|hadn|didn|shouldn|wouldn|couldn|mustn)['\u2019]t\b/gi, fix: "No negative contractions: 'cannot', 'does not'." },
];

// F. Structure checks (functions, not single regexes)
export function longSentences(text, max = 25) {
  return text.split(/(?<=[.?!])\s+/).filter((s) => (s.match(/\S+/g) || []).length > max);
}

export function lint(text, kind) {
  const out = [];
  for (const r of RULES) {
    if (!r.scope.includes(kind)) {
      // a "ui" rule also applies to labels, buttons and links
      if (!(["label", "button", "link"].includes(kind) && r.scope.includes("ui"))) continue;
    }
    r.re.lastIndex = 0;
    const m = text.match(r.re);
    if (m) out.push({ id: r.id, sev: kind === "model" && r.modelSev ? r.modelSev : kind !== "model" && r.uiSev ? r.uiSev : r.sev, hits: [...new Set(m.map((s) => s.trim()))] });
  }
  if (kind !== "label" && kind !== "button" && kind !== "link") {
    const long = longSentences(text);
    if (long.length) out.push({ id: "VT-50", sev: "warn", hits: long.map((s) => s.slice(0, 40) + " (" + s.match(/\S+/g).length + " words)") });
  }
  return out;
}
```

### Test results

Tested in Node 24.15 against 128 cases (at least one that must match and one that must not, per rule) and 13 clean proposed strings: 0 failures. All 190 proposed strings in [microcopy](microcopy.md) pass, except "degradation" in the allowlisted "Not claimed" line. A heuristic scan of 370 strings from the first prototype (not published) found 4 real issues: "via" in a source venue, "Three villages" and "Four response options" (numerals), and "millimetres" (US spelling). Quoted strings in the storyboard add 4 middle-dot separators. The test files are not in the repository; the build recreates them from the patterns above.

On 27 Oct 2026 the scopes of VT-10, VT-11 and VT-21 in the patterns were corrected to `ui` and `model`, as the rule summary states (before, VT-10 and VT-11 ran on interface text only and VT-21 on model text only, so their second severities never applied), and VT-26 was added. The 128-case test above predates these changes; the build reruns it. With the corrected patterns, the hero's 99 strings (opening, globe, dive and the valley sequence, [microcopy](microcopy.md) sections 1 and 1a) give findings on 6; each string was checked to appear verbatim in the approved hero, except two the docs define: the challenge's action label, named to match the next beat, and the mode line's added accessible name, all handled in the table above, and the place names "Atlas Mountains, Morocco" and "High Atlas Mountains" pass with "Mountains" in the proper-noun list. Across the other 351 proposed table entries in microcopy the changes add VT-21 warnings on the four "not ranked" strings listed as known cases and no error, and GIEWS in the acronym allowlist clears one VT-08 warning.

### What lint cannot catch (review checklist)

- Read it aloud. Would a person say it? [V: WRT-10, WRT-16, WRT-20]
- Is the key word first?
- Does each sentence hold one idea?
- Is a three-item list real, or rhetorical?
- Does every statement show its kind, scope, and source?
- Where a misreading is plausible, does the status say what it does not mean?
- Would the string survive translation without reordering fragments?
- Does each button name its effect?
- Does any sentence sound like a press release? Rewrite it as a field note.

## Applied to the specifications

The conflicts this guide found in the earlier documents were resolved on 2026-10-27: the case card's place line and mode label ("Live", or "Replay of live run" with its date) replace the middle-dot eyebrow and the all-caps badge; status and count are separate elements; NDVI shows two decimals; US spelling throughout; "Aït Bouguemez" in Siterra's own text; "Defer decision"; "Review revision N"; "Needs reassessment"; "Contradicted by available evidence" as the display label of `inconsistent`; the product promise names Siterra, not a team; the director has the visible label "Ask Siterra" (the approved hero later replaced it with the "/" glyph and the placeholder "Ask Siterra", which is also its accessible name; [microcopy](microcopy.md), sections 1a and 5); single translated statements carry "Machine-drafted translation" with "Show original", and exported documents carry "Machine-drafted translation, needs local review".
