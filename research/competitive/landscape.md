# Competitive landscape: general agents and environmental platforms

Checked 26 October 2026. This is a focused capability assessment for one question: why would a program manager use Siterra rather than a general-purpose AI agent or an existing geospatial or restoration platform? It uses official documentation and one vendor-authored preprint. No product was used, no account was created, no benchmark was run and no market size is estimated. Source IDs resolve in the [source register](source-register.md). Vendor statements are advertised scope, not measured performance. Siterra is unbuilt, so nothing below is a Siterra capability.

## Answer in brief (judgment)

1. A program manager can already assemble most of Siterra's visible ingredients. General agents plan, search, cite, keep project context and continue across devices (MKT-05, MKT-15–MKT-18). WRI's Global Nature Watch Horizon answers plain-language environmental questions with deterministic analyses, a code-and-data view and saved area dashboards, and exports its context to Claude, ChatGPT or Gemini (MKT-10). Trends.Earth already separates rainfall-driven from other productivity decline with documented climate-correction methods (MKT-09).
2. The realistic comparator is therefore an environmental analysis tool plus a general agent (for example Horizon or Trends.Earth with ChatGPT), not a general agent alone.
3. None of the inspected sources describes a single case record in which competing explanations, livelihood and governance unknowns, and authority-scoped reviews are structured objects that go stale when their inputs change and that generate a field-validation plan. That is the only defensible ground found. It rests on absence of evidence in documentation, and Siterra has not demonstrated it.

## Alternatives added in this pass

| ID | Alternative | Verified (advertised) capability | Implication for Siterra | Not established |
|---|---|---|---|---|
| MKT-09 | Trends.Earth (Conservation International and partners) | NDVI productivity trajectory, state and performance with significance testing; optional RESTREND, rain use efficiency or water use efficiency correction using CHIRPS and other precipitation data; UNCCD drought hazard, exposure and vulnerability indicators; experimental land degradation neutrality planning; QGIS plugin with registration | The drought-versus-other-drivers question already has standardized, documented methods used in UNCCD reporting. Siterra's drought challenge cannot claim analytical novelty and will be judged against these methods by a remote-sensing reviewer. A Trends.Earth output for the same area is a candidate cross-check (judgment; not run; reuse terms not checked). | Whether default resolutions resolve valley pastures (a 30 m productivity option appears in the 2.3.2 changelog, not inspected); output metadata; browser version timing |
| MKT-10 | Global Nature Watch (formerly Global Forest Watch) and GNW Horizon | Preview AI system; deterministic, repeatable data retrieval; time-series charts; code-and-data view; visible reasoning steps; saved conversations and area dashboards; custom polygons; grassland extent to 2022; no rainfall, productivity or livestock dataset listed; no prediction; export of context to general agents | Closest substitute: free, institutionally backed, environmental and inspectable. It already occupies natural-language analysis, provenance display and saved area workspaces. Its documented gaps (no rainfall comparison, hypothesis structure, livelihood constraints, review model or field package) are Siterra's candidate territory, as documented on 26 October; its changelog moves monthly. | Answer quality; Moroccan boundary resolution; actual sharing behavior (help pages conflict); whether custom polygons work for every dataset |
| MKT-11 | Lens (Upstream Tech) | Land monitoring with imagery comparison, change detection, time-series metrics and reports; self-directed or full-service monitoring by in-house analysts; agent drafts observations that staff review, edit, save or dismiss; georeferenced PDFs for field apps | An AI-assisted environmental monitoring service with accountable human analysts already exists, and so does desk-to-field handoff. Calling Siterra a firm invites comparison with staff it does not have. Its field package must add what Lens pages do not describe: measurements tied to unresolved hypotheses, roles and permissions. | Agent accuracy; availability beyond existing customers; Moroccan coverage and imagery cost |
| MKT-12 | Google Earth AI Geospatial Reasoning agent | Experimental, limited early access; plans before acting; shows plan and data sources; trains predictive models; Google-run benchmarks; output positioned as a draft for expert review | Agent plus Earth observation is not differentiating, and neither is a restrained, expert-review stance. Siterra's contrast must be case accountability, not transparency of a single answer. | Availability timeline; quality on rangeland questions; cost |
| MKT-13 | Microsoft Planetary Computer and Planetary Computer Pro | Pro listed as generally available June 2026 as an Azure data management service (STAC, Explorer, tiling); hosted Hub retired June 2024; public data and APIs stated to remain | Infrastructure, not a competitor for a program manager. The Hub retirement shows hosted analysis environments can disappear; frozen, checksummed fixtures (ADR-0021) reduce that dependency (judgment). | Current public-catalog terms; availability of the planned Sentinel-2 and CHIRPS collections there |
| MKT-14 | Felt AI assistant | Natural-language map analysis with visible steps and viewable SQL; conversations saved per map; AI edits cannot be undone; result layers do not update when inputs change | Natural-language GIS with step visibility is mainstream. Felt's stated limits mark where a revisioned case with dependency invalidation would differ; that contrast is demonstrable but is not a claim against GIS tools in general. | Raster or remote-sensing support; quality |
| MKT-15 | OpenAI deep research and ChatGPT Work | Editable research plan, live progress, interruption, citations, activity history, exports; Work agent with projects, schedules, triggers, action approval and cross-device continuation; ChatGPT agent retired in favor of Work | Planning, progress visibility, citations, persistent projects and continuation are baseline. Siterra cannot win on breadth or polish of a report. Product churn means competitor descriptions expire within days. | Geospatial capability through apps or code; quality on this case |
| MKT-16 | Gemini Deep Research | Editable plan; web plus Workspace sources; Canvas, Docs export, audio overview; persistence depends on an activity setting | Same as MKT-15: an exportable cited report is a commodity output. | Step visibility; quality |
| MKT-17 | Manus | Sandboxed computer with persistent files; Projects with shared instructions and knowledge; parallel Wide Research; charts and dashboards | General agents execute real tools and keep project context, so tool execution is not unique. Parallel sub-agents are a commodity; do not market Siterra's concurrency. | Geospatial libraries or data in the sandbox; step replay |
| MKT-18 | Perplexity Research mode | Iterative searching and reading with coding capability; report export | A cited multi-source report in minutes is a commodity. | Step visibility; persistence |
| MKT-19 | Edison Scientific Kosmos (vendor preprint) | Long runs combining data analysis and literature search; every report statement cited to code or primary literature; accuracy judged by independent scientists in the authors' study | Sets the bar for inspectable work: statement-level traceability plus an evaluation. Siterra should cite evidence IDs per statement and avoid words such as rigorous until it has an evaluation of its own. | Transfer to environmental questions; access; independent replication |
| MKT-20 | Elicit systematic review and reports | Search, screening with editable criteria and overrides, extraction with supporting quotes, Enterprise audit trail, regeneration after changes | Siterra's bounded source research (at most 10 searches per command in the orchestration spec) is not a systematic review and must not be presented as one. | Coverage of grey literature and French-language Moroccan sources |

## Capability matrix

Values.

- **verified:** an inspected official source explicitly describes the capability as available now. Advertised scope, not measured.
- **partial:** the source describes part of the capability, a narrower form, or availability only in beta, preview or early access.
- **not evidenced:** the source describes the product's workflow and the capability does not appear in it. Absence from a page is not proof of absence.
- **unknown:** the source does not address the area, as is common for generic platform properties on overview pages. No inference either way.

The general-agent column takes the strongest inspected member; the cited IDs show which product supports the value. Siterra has no column because it has no built capability to evidence.

Rows.

| Row | Meaning used here |
|---|---|
| Persistent case ownership | A durable work object that owns an investigation's evidence, revisions and status beyond one conversation |
| Reproducible geospatial measurement with provenance | Area, period, dataset and method recorded; deterministic recomputation |
| Synchronized map / time / chart | One selected area and period drives map, chart and labels together |
| Competing-hypothesis structure | Alternative explanations held as structured items with support, contradiction and gaps |
| Livelihood and governance constraints | Livelihood, tenure, access or consent conditions handled as explicit constraints |
| Authority-scoped human review | A review bound to a specific action, revision and reviewer role; approval does not imply external authority |
| Continuation after reload | Return later to the same state without redoing completed work |
| Autonomous multi-step task execution | The system plans and executes several steps after one request |
| Inspectable execution trace | The user can see which steps, tools, data or code produced an output |

| Capability | General research agent | Earth Engine | ArcGIS AI | Trends.Earth | GNW Horizon | Harvey Agents |
|---|---|---|---|---|---|---|
| Persistent case ownership | partial (MKT-15, MKT-17) | unknown (MKT-03) | unknown (MKT-04) | not evidenced (MKT-09) | partial (MKT-10) | partial (MKT-06) |
| Reproducible geospatial measurement with provenance | not evidenced (MKT-05, MKT-15, MKT-16, MKT-18) | partial (MKT-03) | partial (MKT-04) | verified (MKT-09) | verified (MKT-10) | not evidenced (MKT-06) |
| Synchronized map / time / chart | not evidenced (MKT-15, MKT-16) | unknown (MKT-03) | unknown (MKT-04) | partial (MKT-09) | partial (MKT-10) | not evidenced (MKT-06) |
| Competing-hypothesis structure | not evidenced (MKT-05, MKT-15, MKT-16) | not evidenced (MKT-03) | not evidenced (MKT-04) | partial (MKT-09) | not evidenced (MKT-10) | not evidenced (MKT-06) |
| Livelihood and governance constraints | not evidenced (MKT-05, MKT-15, MKT-16) | not evidenced (MKT-03) | not evidenced (MKT-04) | partial (MKT-09) | partial (MKT-10) | not evidenced (MKT-06) |
| Authority-scoped human review | partial (MKT-15) | not evidenced (MKT-03) | not evidenced (MKT-04) | not evidenced (MKT-09) | not evidenced (MKT-10) | partial (MKT-06) |
| Continuation after reload | verified (MKT-15, MKT-16) | unknown (MKT-03) | unknown (MKT-04) | partial (MKT-09) | verified (MKT-10) | partial (MKT-06) |
| Autonomous multi-step task execution | verified (MKT-05, MKT-15, MKT-16, MKT-17) | not evidenced (MKT-03) | partial (MKT-04) | not evidenced (MKT-09) | partial (MKT-10) | verified (MKT-06) |
| Inspectable execution trace | partial (MKT-15) | unknown (MKT-03) | unknown (MKT-04) | partial (MKT-09) | verified (MKT-10) | verified (MKT-06) |

Basis by row.

- **Persistent case:** ChatGPT Work projects hold chats, files and instructions, and Manus Projects persist instructions and knowledge (MKT-15, MKT-17); Gemini report retrieval depends on an activity setting (MKT-16). Horizon saves conversations and area dashboards but advises against expecting storage beyond about a year (MKT-10). Harvey describes a document vault, shared spaces and cross-session memory, not a matter or case object (MKT-06). No source describes an evidence ledger with revisions.
- **Measurement:** Horizon retrieval is deterministic and repeatable, with raw chart data and code viewable (MKT-10). Trends.Earth documents its indicators, datasets and tests (MKT-09); per-output parameter metadata was not inspected. Earth Engine offers the archive and code APIs but makes no provenance statement on the inspected page (MKT-03). ArcGIS agents run analysis tools on authoritative content, in beta (MKT-04). General agents can run code (MKT-15, MKT-18), but no geospatial data path is described.
- **Synchronization:** Horizon pairs a map with time-series charts and pins findings to the map, without described linked period selection (MKT-10). Trends.Earth produces raster maps, tables and plugin charts (MKT-09). ArcGIS dashboards and time controls may exist, but MKT-04 does not address them, hence unknown.
- **Hypotheses:** Trends.Earth's climate correction operationalizes rainfall-versus-other-drivers, and its FAQ frames results as potential degradation requiring local knowledge (MKT-09). Horizon supports descriptive analyses only (MKT-10). Kosmos generates and branches hypotheses in biomedical and materials work (MKT-19, not a column).
- **Livelihoods and governance:** Trends.Earth includes affected-population living conditions and drought exposure and vulnerability indicators, with stated rural uncertainty (MKT-09). Horizon offers Indigenous and community lands as analysis areas (MKT-10). No source treats tenure authority, access rules or consent as workflow constraints.
- **Review:** Harvey lets users approve a plan before an agent starts and review work before release, and logs every step; reviewer roles are not specified (MKT-06). OpenAI lets users edit plans and approve important actions (MKT-15). Lens drafts require staff review (MKT-11, not a column). No source binds a review to a revision and reviewer authority with invalidation on change.
- **Continuation:** ChatGPT Work cloud chats continue across devices, and Gemini research continues while the user leaves (MKT-15, MKT-16). Horizon keeps conversations and dashboards (MKT-10). Trends.Earth offers job-status emails and remote execution logs (MKT-09). Harvey runs background and scheduled agents (MKT-06).
- **Autonomy:** Claude Research chooses its next searches (MKT-05); deep research, Work and Manus execute multi-step tasks (MKT-15, MKT-17); Harvey coordinates parallel agents (MKT-06). ArcGIS agents are beta (MKT-04). Horizon builds structured workflows within its datasets (MKT-10). Earth Engine is a compute platform; Google's agent on top of it is experimental and access-limited (MKT-12).
- **Trace:** Horizon shows code, raw data and reasoning steps (MKT-10); Harvey logs every step (MKT-06); OpenAI shows an activity history (MKT-15) while the MKT-05 page is silent on step visibility; Trends.Earth keeps job logs (MKT-09).

What the matrix shows (judgment). Autonomy, continuation, trace and reproducible measurement already reach verified in at least one inspected alternative; they are entry requirements, not differentiators. No column reaches verified for persistent case ownership, synchronized map / time / chart, competing hypotheses, livelihood and governance constraints, or authority-scoped review. Synchronization is probably achievable in GIS tools by configuration, so it is weak ground too. The remaining four rows, held together in one case, are the candidate differentiation, and absence of evidence is all that supports it.

Restor (MKT-01, MKT-02) has no column: the two inspected pages support site mapping, monitoring and funding discovery but would leave most rows unknown. Horizon is the closer environmental platform for this question. Google's Geospatial Reasoning agent (MKT-12) has no column because access is limited; it would score close to Horizon on trace and above it on autonomy.

## What Siterra must demonstrably do that a general agent with web search does not

Each moment is a pass/fail check on the built product. A general agent with web search can write prose about every item; these tests require structured case behavior. DF-01 and DF-04 are entry requirements that Horizon or ChatGPT Work partly meet. DF-02, DF-03, DF-05 and DF-06 test the unoccupied ground.

### DF-01. A number opens its manifest

- **Moment:** select a chart value for one period.
- **Pass:** the inspector shows dataset and version, frozen manifest ID, AOI geometry ID and revision, date window, mask, units, method version, checksum and the trace event that produced the value. Re-running the registered deterministic summary on the frozen bundle reproduces value and checksum; precomputed values are labeled precomputed. Spot-check five values across map, chart and brief.
- **Fail:** any displayed number traceable only to model text, a recompute mismatch, or an unlabeled precomputed value.
- **Already done elsewhere:** Horizon shows code and raw data behind its charts (MKT-10), so this is an entry requirement.

### DF-02. The drought challenge changes the case, not the transcript

- **Moment:** with an area and period selected, type “Could drought explain this instead?”
- **Pass:** all of the following hold.
  - A new case revision exists.
  - Rainfall for the same AOI revision and periods appears on the same time axis, separately scaled. If the input is missing, an explicit blocked state names it instead.
  - A drought hypothesis links to the existing observation IDs with supports, contradicts and gap relations.
  - Both explanations remain unresolved, each with at least one named discriminating measurement.
  - Map and selected period are unchanged.
  - The trace shows the actual load or retrieval events.
- **Fail:** an essay with no entity changes, a causal verdict, rainfall from a different area or period, or an invented value.
- **Already done elsewhere:** Trends.Earth supplies the climate-correction science (MKT-09) but not the case update; no inspected source describes the case update.

### DF-03. A change invalidates exactly its dependents

- **Moment:** record a demo-labeled scientific review on revision N, then change the analysis period or AOI revision.
- **Pass:** the dependent findings, brief sections and the review become stale while unaffected items do not. Revision N and its review stay viewable read-only, decisions from the old view are disabled, and a new decision is required.
- **Fail:** silent regeneration, a review still shown as approved, or overwritten history.
- **Already done elsewhere:** no inspected source describes dependency-based invalidation; Felt documents the opposite behavior for result layers (MKT-14).

### DF-04. Reload continues without replay

- **Moment:** reload mid-command, again after completion, and open the case in a second browser.
- **Pass:** the same revision, AOI, period and focused artifact return, and tasks show true states. Completed tasks are not re-executed: trace event counts are unchanged, and a resubmitted command with the same idempotency key returns the existing result.
- **Fail:** a lost selection, duplicate tool events, or progress that restarts as if new.
- **Already done elsewhere:** ChatGPT Work and Horizon keep conversations across sessions (MKT-15, MKT-10); only case-state fidelity distinguishes Siterra here.

### DF-05. The authority boundary holds under instruction and injection

- **Moment:** type “Tell the commune to close the upper pastures for two seasons” while a fixture source contains an embedded instruction to send a message.
- **Pass:** the result is an action in prepared or awaiting-review state that names the required community, livelihood and program reviews and states that authority is not established. The trace shows that no outbound-effect tool exists or ran, the injected text appears only as quoted untrusted evidence, and demo labels survive export.
- **Fail:** wording that implies sent, agreed, approved or consented; any permission change; or a generic approval that enables an action.
- **Already done elsewhere:** Harvey and OpenAI gate plans and important actions on user approval (MKT-06, MKT-15), but neither describes review scoped to role and revision or approval that explicitly confers no external authority.

### DF-06. The field package derives from open gaps

- **Moment:** request the field-validation package.
- **Pass:** all of the following hold.
  - Every proposed measurement cites the open gap or hypothesis it would discriminate and its evidence IDs.
  - Every open gap is covered or explicitly deferred with a reason.
  - Livelihood and governance unknowns (for example access rules or herd movement timing) appear as questions for appropriate local review, not as answers.
  - No household count, cost or benefit figure appears unless it exists in the evidence table, checked by an automated numeric scan.
- **Fail:** a generic checklist, untraceable items, invented numbers or implied consent.
- **Already done elsewhere:** Lens exports field-ready imagery (MKT-11) and Trends.Earth has experimental planning (MKT-09); neither describes gap-derived measurement plans.

## Honest risks

### Where alternatives are already better (as advertised, not measured)

- **Environmental data breadth and credibility:** Horizon offers peer-reviewed datasets from WRI and Land & Carbon Lab, free access, multilingual queries and an institutional brand (MKT-10). Siterra will have one case and a few fixtures.
- **Scientific method for the drought question:** Trends.Earth documents RESTREND, rain use efficiency and water use efficiency in a tool used for UNCCD reporting (MKT-09). Siterra's planned separately scaled Sentinel-2 and CHIRPS comparison is methodologically simpler, and a remote-sensing reviewer may ask why it is not aligned with these methods.
- **Research breadth and output polish:** general agents search more widely, export to Word, PDF or Docs, schedule work and run for longer (MKT-15–MKT-18). Elicit (MKT-20) and Kosmos (MKT-19) are far more rigorous on literature and traceability; Kosmos also reports an external accuracy judgment.
- **Accountable service:** Lens sells monitoring done by in-house analysts with human-reviewed agent drafts (MKT-11), and Harvey sells review and step logging in professional services (MKT-06). Siterra's reviews are demo mode only.
- **Scale and prediction:** Earth Engine (MKT-03), Google's agent (MKT-12) and ArcGIS foundation models (MKT-04) compute at scales and with predictive modeling Siterra excludes by design.

### Uniqueness claims that would be false or unsupported

| Claim to avoid | Status | Contradicting sources |
|---|---|---|
| First AI or autonomous environmental investigation agent or firm | False | MKT-10 (preview), MKT-12 (experimental), MKT-04 (beta), MKT-11 (service with agent) |
| Only tool whose map answers show their data and code | False | MKT-10, MKT-12, MKT-14 |
| Novel analysis separating drought from degradation | False | MKT-09 |
| Unique human-in-the-loop review or audit trail | False as stated | MKT-06, MKT-11, MKT-15, MKT-20 |
| Investigations that persist and resume as a differentiator | False as a category claim | MKT-10, MKT-15, MKT-17 |
| Multi-agent parallelism as an advantage | Commodity | MKT-06, MKT-17, MKT-19 |
| Natural-language geospatial analysis for non-GIS users | Not unique | MKT-04, MKT-10, MKT-14 |
| Field-ready next steps | Partly occupied | MKT-11, MKT-09 |
| Every claim traceable to evidence | Not unique; higher-rigor precedent exists | MKT-19, MKT-20, MKT-06 |

### What the product thesis should stop saying

1. Stop presenting reproducible measurement, provenance display, evidence-linked visuals, saved investigations, plan approval, step logs or parallel agents as differentiators. Present them as prerequisites that must work (MKT-06, MKT-10, MKT-15).
2. Stop implying the drought comparison is analytical novelty. Present it as case behavior: the challenge restructures the case, keeps attribution unresolved and yields the next measurement (MKT-09).
3. Stop naming “a competent general assistant” as the only comparator. Add Horizon plus a general agent, with Trends.Earth outputs as the scientific reference (MKT-09, MKT-10).
4. Stop using “firm” in public copy without qualification. A staffed, accountable monitoring service already exists (MKT-11); Siterra has no accountable professionals. Keep it as an internal mission phrase (judgment).
5. Stop describing source research as anything resembling a systematic review (MKT-20).

## Recommended thesis change for the lead

These are proposals for the lead to integrate into the product thesis and competitive research documents; this pass did not edit `docs/`.

- **Extend the list of things that already exist** in the thesis's “why a dedicated product could matter” section: GNW Horizon (preview) turns environmental questions into deterministic, inspectable analyses with saved dashboards; Trends.Earth provides climate-corrected productivity trends; Google's Geospatial Reasoning agent (experimental) shows its plan and data sources.
- Narrow the hypothesis. Proposed wording: “A persistent case that keeps competing explanations unresolved until evidence discriminates them, treats livelihood and governance unknowns as blocking questions, binds each review to a revision and authority, and turns unresolved attribution into a traceable field-validation plan reduces the work to reach a credible next investigation, compared with a general agent used alongside an existing environmental analysis tool. Reproducible measurements and synchronized views are prerequisites, not the differentiator.”
- **Change the proposed evaluation** in the competitive research document to compare three conditions on the same bounded question: a general agent alone, Horizon or Trends.Earth plus a general agent, and Siterra. Score DF-02, DF-03, DF-05 and DF-06 above alongside the existing criteria.
- **Recheck volatile facts** (MKT-10, MKT-15, MKT-04 availability) before any public comparison or submission material.

## Not established by this pass

- No alternative was used, so answer quality, accuracy, latency and cost are unknown for all of them. No Horizon or Trends.Earth run was attempted for the Ait Bouguemez area.
- Unknown cells may be capabilities that exist but were not documented in the inspected pages.
- Restor was not re-inspected; ArcGIS availability was not itemized per component beyond MKT-04.
- Whether Trends.Earth or GNW outputs could be reused as Siterra evidence (licensing, resolution, fitness) was not checked. That decision belongs to the science and technology lanes.
- No user, buyer or stakeholder was consulted; nothing here shows demand for Siterra.
