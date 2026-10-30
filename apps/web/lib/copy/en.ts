// English message catalog (I18N-01): every interface string the app shows lives here, keyed by string ID.
// Place names, numbers and record fields come from records and are not catalog strings.
// Placeholders use ICU-style names in braces: {area}.

import type { Scope } from "./lint";

export interface Message {
  text: string;
  /**
   * Lint scope: a detail line ("ui"), a map or data label, a heading (header, tab, badge, status word or
   * stage name, in Title Case), a button or a link.
   */
  kind: Extract<Scope, "ui" | "label" | "heading" | "button" | "link">;
  /** A line that says what a value is not or does not prove; exempt from the land-label word cap. */
  honesty?: true;
}

export const en = {
  // Opening page: one screen. The case question comes from the case record
  "opening.title": { text: "Siterra", kind: "heading" },
  "opening.what": {
    text: "An environmental analysis engine for communities and organizations with no specialist to ask.",
    kind: "ui",
  },
  "opening.how": {
    text: "Meta Muse Spark plans the tasks and reads published sources. Code computes every number and checks every quote against its source. A person reviews every result. Siterra sends, spends and decides nothing.",
    kind: "ui",
  },
  "opening.question": { text: "Question", kind: "heading" },
  "opening.action": { text: "Open Region Pack", kind: "button" },
  "opening.skip": { text: "Skip to Map", kind: "link" },

  // The engine's five stages (ADR-0043 amendment, proposed). ADR-0023 bars causal diagnosis, so stage 3
  // tests hypotheses; precedents are published studies; nothing is verified in the field yet
  "stage.scope_baseline": { text: "Scope & Baseline", kind: "heading" },
  "stage.evidence": { text: "Evidence", kind: "heading" },
  "stage.hypothesis_testing": { text: "Hypothesis Testing", kind: "heading" },
  "stage.interventions_precedents": { text: "Interventions & Precedents", kind: "heading" },
  "stage.field_verification": { text: "Field Verification", kind: "heading" },
  "opening.stages": { text: "Five Stages", kind: "heading" },

  // The Region Pack the case loads (lib/pack/regionPack.ts): every value comes from the case record
  "pack.title": { text: "Region Pack", kind: "heading" },
  "pack.layers": { text: "Data Layers", kind: "heading" },
  "pack.window": { text: "Observation Window", kind: "heading" },
  "pack.checks": { text: "Checks", kind: "heading" },
  "pack.statusLabel": { text: "Status", kind: "heading" },
  "pack.status": { text: "{data} · {field}", kind: "heading" },
  "pack.button": { text: "Region Pack · {status}", kind: "heading" },
  "pack.windowValue": { text: "{first} to {last}, {n} months", kind: "ui" },
  // a bundle's status "validated" is the automated data checks, not field validation
  "pack.checksValue": {
    text: "{passed} of {total} bundles passed automated data checks.",
    kind: "ui",
  },
  "pack.realData": { text: "Real Data", kind: "heading" },
  "pack.checksPending": { text: "Checks Pending", kind: "heading" },
  "pack.checksFailed": { text: "Checks Failed", kind: "heading" },
  "pack.fieldUnverified": { text: "Field Unverified", kind: "heading" },
  "pack.verifiedOutcome": { text: "Verified Outcome Recorded", kind: "heading" },
  "pack.realDataDetail": {
    text: "Real Data: every layer is a measured dataset that passed automated data checks. Field Unverified: no outcome has been checked on the ground.",
    kind: "ui",
  },

  // Globe and dive (approved hero study A4; place and range names come from the case record)
  "globe.range": { text: "{range}", kind: "label" },
  "globe.pack": { text: "Region Pack: {name}", kind: "ui" },
  "globe.legend": {
    text: "Rangeland biomes, potential extent (Rangelands Atlas method)",
    kind: "ui",
  },
  "globe.turn": { text: "Turn", kind: "heading" },
  "globe.dragKey": { text: "Drag", kind: "heading" },
  "dive.highAtlas": { text: "{subrange}", kind: "label" },
  "credit.globe": {
    text: "Globe relief: produced using Copernicus WorldDEM™-90 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved",
    kind: "ui",
  },
  "credit.dive": { text: "Dive relief: © Mapterhorn (Copernicus GLO-30)", kind: "ui" },

  // Arrival (valley and region names come from the case record)
  "arrival.valleyName": { text: "{valley}", kind: "label" },
  "arrival.region": { text: "{region}", kind: "label" },
  "arrival.studyArea": { text: "Valley catchment: {area} km²", kind: "label" },
  "arrival.studyAreaLimit": {
    text: "Not a pasture, agdal, or management boundary.",
    kind: "ui",
    honesty: true,
  },
  "arrival.outlet": { text: "Outlet: the whole catchment drains here", kind: "label" },
  "arrival.start": { text: "Run Assessment", kind: "button" },
  "arrival.readFlat": { text: "Flat Map View", kind: "button" },
  "stage.resetView": { text: "Reset View", kind: "button" },

  // Text view (the flat listing)
  "flat.title": { text: "Text View", kind: "heading" },
  "flat.close": { text: "Close", kind: "button" },
  "flat.skip": { text: "Text View", kind: "link" },
  "flat.lonW": { text: "{deg}° W", kind: "label" },
  "flat.latN": { text: "{deg}° N", kind: "label" },
  "flat.km": { text: "{n} km", kind: "label" },
  "flat.m": { text: "{n} m", kind: "label" },
  "flat.place": { text: "Place", kind: "heading" },
  "flat.question": { text: "Question", kind: "heading" },
  "flat.notes": { text: "Notes", kind: "heading" },
  "flat.sources": { text: "Sources", kind: "heading" },

  // Task status words (microcopy section 6)
  "task.queued": { text: "Queued", kind: "heading" },
  "task.running": { text: "Running", kind: "heading" },
  "task.needs_input": { text: "Input Required", kind: "heading" },
  "task.done": { text: "Done", kind: "heading" },
  "task.partial": { text: "Partial", kind: "heading" },
  "task.failed": { text: "Failed", kind: "heading" },
  "task.cancelled": { text: "Canceled", kind: "heading" },
  "task.awaiting_review": { text: "Awaiting Review", kind: "heading" },
  "work.planning": { text: "Planned tasks: {n}.", kind: "ui" },
  "work.stop": { text: "Stop", kind: "button" },
  "work.received": { text: "Request received.", kind: "ui" },
  // accepted evidence only; three words so the completed card stays within its 45 (VC-04)
  "work.complete": { text: "Complete. Findings: {n}.", kind: "ui" },
  // microcopy section 5 Failed and Partial; the question text stays in the command line, no Retry on the card
  "work.failed": { text: "Assessment failed: {cause}. Question text kept.", kind: "ui" },
  "work.partial": { text: "Assessment partial. Not completed: {tasks}.", kind: "ui" },
  "work.cancelled": { text: "Assessment canceled.", kind: "ui" },
  // causes after the section 16 patterns: Budget or time limit, Model output rejected, Model service down
  "work.cause.roundLimit": { text: "model round limit reached", kind: "ui" },
  "work.cause.rejected": { text: "model proposal rejected by checks", kind: "ui" },
  "work.cause.modelDown": { text: "model service not responding", kind: "ui" },
  "work.cause.other": { text: "no task completed", kind: "ui" },
  // the scope refusal (packages/agent tasks/scope.ts): a badge and two sentences, what is wrong and what is required
  "work.outOfScope": { text: "Out of Scope", kind: "heading" },
  "work.outOfScopeDetail": {
    text: "The request treats people as the explanation by identity, or names a private individual. Questions must concern land, water, vegetation or land-use practices.",
    kind: "ui",
  },
  // task kinds, by the five-stage engine's names where a stage owns the task
  "task.kind.plan": { text: "Plan", kind: "heading" },
  "task.kind.source_research": { text: "Source Research", kind: "heading" },
  "task.kind.observation_analysis": { text: "Observation Analysis", kind: "heading" },
  "task.kind.livelihood_governance": { text: "Livelihoods & Governance", kind: "heading" },
  "task.kind.hypothesis_comparison": { text: "Hypothesis Comparison", kind: "heading" },
  "task.kind.explanation_branches": { text: "Explanation Branches", kind: "heading" },
  "task.kind.intervention_feasibility": { text: "Intervention Feasibility", kind: "heading" },
  "task.kind.brief_package": { text: "Field Verification Plan", kind: "heading" },
  "task.kind.instrument_composition": { text: "Instrument Order", kind: "heading" },
  "task.kind.validation": { text: "Automated Checks", kind: "heading" },
  // labeled precomputed (ADR-0021; agent orchestration, "Precomputed observations are labeled precomputed")
  "work.observations": { text: "Precomputed Observations", kind: "heading" },
  "work.observationLine": {
    text: "{label}: {available} of {total} months observed, {first} to {last}",
    kind: "ui",
  },
  "work.refused": { text: "Request not sent. Question text kept for another run.", kind: "ui" },
  "work.quotaUsed": {
    text: "Demo request limit reached for this session. Question text kept.",
    kind: "ui",
  },

  // Activity panel (microcopy section 20: panel title, empty state, model badge)
  "activity.title": { text: "Activity", kind: "heading" },
  "activity.empty": { text: "No events for this request.", kind: "ui" },
  "activity.model": { text: "{model} · {route}", kind: "heading" },
  "activity.route.synthetic": { text: "Synthetic Replay", kind: "heading" },
  "activity.route.recorded": { text: "Recorded Replay", kind: "heading" },
  "activity.route.modelApi": { text: "Model API", kind: "heading" },
  "activity.code": { text: "Code: {tool}", kind: "heading" },
  "activity.proposal": { text: "Proposal: {tool}", kind: "heading" },
  "activity.rejected": { text: "Rejected: {rule} ({code})", kind: "ui" },
  // a coverage boundary: the badge, then what is missing and what is required
  "activity.notLoaded": { text: "Dataset Not Loaded", kind: "heading" },
  "activity.blocked": {
    text: "Required inputs not loaded: {inputs}. Attach the datasets or limit the question to loaded layers.",
    kind: "ui",
  },
  "activity.cause": { text: "Cause: {cause}", kind: "ui" },
  "activity.synthetic": { text: "Synthetic Replay · No Live Model", kind: "heading" },
  "activity.recorded": { text: "Recorded Replay", kind: "heading" },
  "activity.pace": { text: "Reading pace: 1 event per {seconds} s.", kind: "ui" },
  "activity.showAll": { text: "Show All Steps", kind: "button" },
  // the check that rejected a proposal, by its validation issue code (ValidationResult)
  "rule.schema": { text: "wrong shape", kind: "ui" },
  "rule.unknown_reference": { text: "cites a record that does not exist", kind: "ui" },
  "rule.stale_reference": { text: "cites an outdated record", kind: "ui" },
  "rule.ownership": { text: "changes a record this step does not own", kind: "ui" },
  "rule.claim_kind": { text: "the wrong kind of claim", kind: "ui" },
  "rule.numeric_provenance": { text: "a number not found in its records", kind: "ui" },
  "rule.unit": { text: "the wrong unit", kind: "ui" },
  "rule.coverage": { text: "too little observed data", kind: "ui" },
  "rule.authority": { text: "claims authority it does not have", kind: "ui" },
  "rule.prohibited_claim": { text: "a claim Siterra may not make", kind: "ui" },
  "rule.transition": { text: "a status change that is not allowed", kind: "ui" },
  "rule.limit": { text: "over a set limit", kind: "ui" },
  "rule.catalog_mismatch": { text: "not in the analysis catalog", kind: "ui" },
  "rule.focus_not_permitted": { text: "a map view that is not allowed", kind: "ui" },
  "rule.excerpt_mismatch": { text: "quote not found in its source", kind: "ui" },

  // Map legend (microcopy section 19, the approved key's form for any month; section 1a valley.key.ndvi.note)
  "legend.ndvi.title": { text: "NDVI Departure · {period}", kind: "heading" },
  "legend.ndvi.subtitle": {
    text: "Difference from the median of the other {months}, 2019 to 2025, inside the catchment",
    kind: "ui",
  },
  "legend.coverage": { text: "{percent}% of area observed", kind: "ui" },
  // the departure's two shares: the coverage-check figure (all-years reference) and the cells the picture colors
  // (leave-one-year-out reference); the bare forms when the method states no reference-year minimum
  "legend.ndvi.coverage": {
    text: "Coverage: {percent}% of area, observed in at least {years} {months} including {period}",
    kind: "ui",
    honesty: true,
  },
  "legend.ndvi.coverage.bare": { text: "Coverage: {percent}% of area", kind: "ui", honesty: true },
  "legend.ndvi.painted": {
    text: "Colored: {percent}% of area, observed in {period} and at least {years} other {months}",
    kind: "ui",
    honesty: true,
  },
  "legend.ndvi.painted.bare": { text: "Colored: {percent}% of area", kind: "ui", honesty: true },
  // the period's quality flags, in the approved verdict line's form (valley.verdict.flags and its note)
  "legend.flags": { text: "{period} views: {flags}.", kind: "ui", honesty: true },
  "legend.flags.reducedQaNote": {
    text: "Cloud screening used the scene classification only.",
    kind: "ui",
    honesty: true,
  },
  "flag.snow": { text: "snow suspected", kind: "ui" },
  "flag.terrainShadow": { text: "terrain shadow suspected", kind: "ui" },
  "flag.lowSceneCount": { text: "few satellite dates", kind: "ui" },
  "flag.partialMonth": { text: "part of the month only", kind: "ui" },
  "flag.qaJoinIncomplete": { text: "scene classification incomplete", kind: "ui" },
  "flag.reducedQa": { text: "cloud screening reduced", kind: "ui" },
  // the strata bundle's excluded stratum, drawn over the values, not masked from them
  "legend.ndvi.excluded": {
    text: "Hatched: cropland and buildings mapped by ESA WorldCover in 2021, left out of the field-sampling strata. Their departure is still drawn.",
    kind: "ui",
  },
  "legend.ndvi.note": {
    text: "No cropland mask is applied: valley-floor fields and orchards are included.",
    kind: "ui",
    honesty: true,
  },
  "legend.ndvi.method": {
    text: "Sentinel-2 L2A, monthly median NDVI, cloud and snow masked. Method {method} {version}.",
    kind: "ui",
  },
  // SC-04 asks for true cell size: the display cells are coarser than the analysis grid, so the key says so
  "legend.ndvi.cells": {
    text: "Drawn in cells of about {display} m, averaged from the {analysis} m analysis grid. The measurements use the {analysis} m cells.",
    kind: "ui",
    honesty: true,
  },
  "legend.ndvi.cellsDisplay": {
    text: "Drawn in cells of about {display} m.",
    kind: "ui",
    honesty: true,
  },
  "flat.legend": { text: "Map Legend", kind: "heading" },
  // one label, its state in aria-expanded (voice and tone: a toggle keeps one label)
  "legend.toggle": { text: "Map Legend", kind: "button" },

  // Sources and notices
  "notices.data": { text: "Data Credits", kind: "heading" },
  "notices.map": { text: "Map & Imagery", kind: "heading" },
  "notices.places": { text: "Place Credits", kind: "heading" },
  "notices.fonts": { text: "Fonts", kind: "heading" },
  "notices.software": { text: "Software", kind: "heading" },
  "notice.maplibre": { text: "MapLibre GL JS, BSD 3-Clause License", kind: "link" },
  "notice.maplibreContour": {
    text: "maplibre-contour, BSD 3-Clause License, with the licences of the code it includes",
    kind: "link",
  },
  "notice.three": { text: "three.js, MIT License", kind: "link" },
  "notices.keys": { text: "Keyboard", kind: "heading" },
  "notices.singleKeys": { text: "Single-Key Shortcuts", kind: "heading" },
  "notices.singleKeysDetail": {
    text: "F toggles Flat Map View. / focuses the command line. Turning these off leaves ↵ and Esc on.",
    kind: "ui",
  },
  "notice.relief": {
    text: "Relief: © Mapterhorn; produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved.",
    kind: "ui",
  },
  "notice.imagery": {
    text: "Imagery: contains modified Copernicus Sentinel data 2025. A Sentinel-2 summer 2025 view, display only: no number is read from it.",
    kind: "ui",
  },
  "notice.fontSans": { text: "IBM Plex Sans, SIL Open Font License 1.1", kind: "link" },
  "notice.fontMono": { text: "IBM Plex Mono, SIL Open Font License 1.1", kind: "link" },

  // Opening a case
  "case.notFound": {
    text: "Case not available to this session. Open the home page to start a new session.",
    kind: "ui",
  },
  "case.failed": {
    text: "Case not loaded. No records changed. Reload the page to retry.",
    kind: "ui",
  },
  // a coverage boundary: the badge, then what is missing and what is required
  "case.coverageRequired": { text: "Coverage Required", kind: "heading" },
  "case.noBoundary": {
    text: "No analysis boundary is set for this case. A catchment boundary is required to draw the region.",
    kind: "ui",
  },

  // Command line and next-step actions (IU-03, 28 Oct copy standard)
  "command.label": { text: "Question", kind: "heading" },
  "command.challengeQuestion": {
    text: "Could a dry year explain this instead?",
    kind: "ui",
  },
  "command.areaChip": { text: "Area · {area}", kind: "heading" },
  "command.periodChip": { text: "Period · {period}", kind: "heading" },
  "action.investigate": { text: "Investigate", kind: "button" },
  "action.challenge": { text: "Challenge", kind: "button" },
  "action.trace": { text: "Trace", kind: "button" },
  "action.flat": { text: "Flat", kind: "button" },
  "action.brief": { text: "Brief", kind: "button" },

  // Findings and citations (IU-02, TR-01, TR-04)
  "findings.heading": { text: "Accepted Findings", kind: "heading" },
  "findings.close": { text: "Close", kind: "button" },
  "findings.excerpt": { text: "Source Excerpt", kind: "heading" },
  "findings.measurement": { text: "Measurement Record", kind: "heading" },

  // Explanation branches and field plan (CMP-23, DF-09)
  "branches.heading": { text: "Explanation Branches", kind: "heading" },
  "branches.locked": { text: "Predictions Locked · Rev {rev}", kind: "heading" },
  "branches.status.predicted": { text: "Predictions Locked", kind: "heading" },
  "branches.status.consistent": { text: "Consistent", kind: "heading" },
  "branches.status.contradicted": { text: "Contradicted", kind: "heading" },
  "branches.status.cannot_be_assessed": { text: "Cannot Be Assessed", kind: "heading" },
  "branches.outcome.met": { text: "Met", kind: "heading" },
  "branches.outcome.not_met": { text: "Not Met", kind: "heading" },
  "branches.outcome.not_testable": { text: "Not Testable", kind: "heading" },
  "branches.outcome.pending": { text: "Committed", kind: "heading" },
  "branches.fieldPlan": { text: "Field Verification", kind: "heading" },
  "branches.separates": { text: "Separates: {pairs}.", kind: "ui" },
  "branches.unseparated": { text: "Not separated by configured checks: {pairs}.", kind: "ui" },

  // Trace drill-down (CMP-16, TR-02, TR-05, TR-06)
  "trace.heading": { text: "Execution Trace", kind: "heading" },
  "trace.summary": {
    text: "Models: {models}. Tools: {tools}. Checks: {accepted} accepted, {rejected} rejected.",
    kind: "ui",
  },
  "trace.usage": { text: "Tokens: {input} in, {output} out. Cost: ${cost}.", kind: "ui" },

  // Stage notes
  "stage.relief": { text: "Vertical Exaggeration ×{factor}", kind: "heading" },
  "stage.north": { text: "N", kind: "heading" },
  "stage.northName": { text: "North", kind: "ui" },
  "stage.imagery": { text: "Imagery: Sentinel-2, summer 2025, display only", kind: "ui" },
  "stage.sources": { text: "Sources & Notices", kind: "link" },
  "stage.mapFailed": {
    text: "Map not loaded. All map content is listed below as text.",
    kind: "ui",
  },

  // Credits
  "credit.terrain": { text: "© Mapterhorn. Copernicus WorldDEM-30.", kind: "ui" },
  "credit.rainfall": { text: "CHIRPS v3.0, accessed 27 Oct 2026.", kind: "ui" },
  "credit.imagery": { text: "Contains modified Copernicus Sentinel data 2019-2025.", kind: "ui" },
  "credit.outletInput": { text: "© OpenStreetMap contributors.", kind: "ui" },
  // microcopy section 1a credit.valley.plan: added while mapped cropland and buildings show
  "credit.worldcover": { text: "© ESA WorldCover project.", kind: "ui" },

  // Mode
  "mode.live": { text: "Live", kind: "heading" },
  "mode.liveDetail": {
    text: "Model and tool calls run now. Observations are precomputed.",
    kind: "ui",
  },
  "mode.replay": { text: "Recorded Replay · {date}", kind: "heading" },
  "mode.replayDetail": {
    text: "Recorded outputs from a live run. Nothing is computed now.",
    kind: "ui",
  },
  "mode.simulated": { text: "Simulated Answer", kind: "heading" },
  // The scope popover the mode line opens (microcopy section 2, PC-04)
  "scope.name": { text: "Scope", kind: "heading" },
  "scope.will": { text: "In Scope", kind: "heading" },
  "scope.will1": { text: "Plan the assessment and read published research", kind: "ui" },
  "scope.will2": {
    text: "Load satellite and rainfall observations for the analysis area",
    kind: "ui",
  },
  "scope.will3": {
    text: "Test hypotheses against the records; unresolved ones stay open",
    kind: "ui",
  },
  "scope.will4": { text: "Draft a field verification plan and its required reviews", kind: "ui" },
  "scope.willNot": { text: "Out of Scope", kind: "heading" },
  "scope.willNot1": { text: "Contact anyone, spend money, or publish anything", kind: "ui" },
  "scope.willNot2": { text: "Make or authorize land-management decisions", kind: "ui" },
  "scope.willNot3": { text: "Claim consent, partnerships, or outcomes", kind: "ui" },
  "mode.concept": { text: "Concept Prototype", kind: "heading" },
  "mode.conceptDetail": {
    text: "Model steps are synthetic examples, not live model output. The rainfall and vegetation records are measured.",
    kind: "ui",
  },
  "mode.fixture": { text: "Fixture Data", kind: "heading" },

  // Instruments: the layer stack (approved specimen A). Figures, years and limits come from the record's fixtures
  // (lib/instruments/valley/fixtures.ts); credits are numbered by the sheet they serve
  "instrument.layers.description": {
    text: "A relief model of the valley catchment with its drainage lines. Above it are five sheets: the March to June vegetation trend, rainfall, snow cover, land cover on the valley floor, and the three elevation bands.",
    kind: "ui",
  },
  "instrument.layers.keys": {
    text: "Arrow keys turn the model; Home returns to the measured view.",
    kind: "ui",
  },
  "instrument.layers.scale": { text: "Vertical scale {value}×", kind: "label" },
  "instrument.layers.failed": { text: "Layers not loaded. Reload the page to retry.", kind: "ui" },
  "instrument.sheet.trend": { text: "Vegetation Trend", kind: "heading" },
  "instrument.sheet.trend.question": {
    text: "Where did greenness change, {from} to {to}?",
    kind: "ui",
  },
  "instrument.sheet.trend.key": { text: "{value} NDVI per decade", kind: "label" },
  "instrument.sheet.rain": { text: "Rainfall", kind: "heading" },
  "instrument.sheet.rain.question": {
    text: "Where does more rain fall, September to May?",
    kind: "ui",
  },
  "instrument.sheet.rain.key": { text: "{value} mm, {from} to {to} mean", kind: "label" },
  "instrument.sheet.snow": { text: "Snow Cover", kind: "heading" },
  // the sheet shows February (SNOW_MONTH in lib/instruments/valley/scene/layer-stack.ts)
  "instrument.sheet.snow.question": {
    text: "How snowy is each 500 m band in February?",
    kind: "ui",
  },
  "instrument.sheet.snow.key": { text: "{value}, mean of {from} to {to}", kind: "label" },
  "instrument.sheet.cover": { text: "Land Cover", kind: "heading" },
  "instrument.sheet.cover.question": {
    text: "Where are the fields, buildings and trees?",
    kind: "ui",
  },
  "instrument.sheet.cover.crop": { text: "cropland or built-up", kind: "label" },
  "instrument.sheet.cover.tree": { text: "tree cover, {year}, {res} m", kind: "label" },
  "instrument.sheet.bands": { text: "Elevation Bands", kind: "heading" },
  "instrument.sheet.bands.question": {
    text: "Which equal-area third is each place in?",
    kind: "ui",
  },
  "instrument.sheet.bands.key": { text: "limits at {lower} m and {upper} m", kind: "label" },
  "instrument.credit.modisNdvi": { text: "MODIS MOD13Q1 v6.1, NASA LP DAAC", kind: "ui" },
  "instrument.credit.chirps": {
    text: "CHIRPS v3.0, Climate Hazards Center, UC Santa Barbara",
    kind: "ui",
  },
  "instrument.credit.modisSnow": { text: "MODIS MOD10A1 v6.1, NSIDC", kind: "ui" },
  "instrument.credit.worldcover": { text: "© ESA WorldCover 2021, CC BY 4.0", kind: "ui" },
  "instrument.credit.dem": {
    text: "Produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved",
    kind: "ui",
  },

  // Instruments: the cutaway (approved specimen B). Figures, years and limits come from the fixtures; the place's
  // name and the two published statements with their sources come from their own fixtures, not from here
  // (lib/instruments/valley/cutaway-data.ts)
  "instrument.cutaway.description": {
    text: "The valley catchment cut north to south through {place}. Its section face shows the true elevation profile and the two band limits. Beside each band are its March to June vegetation trend and its monthly snow cover.",
    kind: "ui",
  },
  "instrument.cutaway.keys": {
    text: "Arrow keys turn the model; Home returns to the measured view.",
    kind: "ui",
  },
  "instrument.cutaway.failed": {
    text: "Cutaway not loaded. Reload the page to retry.",
    kind: "ui",
  },
  "instrument.cutaway.band.high": { text: "{limit} m and above", kind: "label" },
  "instrument.cutaway.band.mid": { text: "{lower} to {upper} m", kind: "label" },
  "instrument.cutaway.band.low": { text: "Below {limit} m", kind: "label" },
  "instrument.cutaway.band.unit": { text: "NDVI per decade", kind: "label" },
  // the snow key's two lines, as specimen B breaks them
  "instrument.cutaway.snow": { text: "Snow-covered share by month,", kind: "label" },
  "instrument.cutaway.snow.years": { text: "mean of {from} to {to}", kind: "label" },
  "instrument.cutaway.metres": { text: "{value} m", kind: "label" },
  "instrument.cutaway.north": { text: "N", kind: "label" },
  "instrument.cutaway.south": { text: "S", kind: "label" },

  // Instruments: the briefing shell around them. Enter in the command line opens the valley with the typed text in
  // the valley's command line, sending nothing
  "instrument.shell.nav": { text: "Instruments", kind: "label" },
  "instrument.shell.valley": { text: "Valley", kind: "label" },
  "instrument.shell.layers": { text: "Layers", kind: "label" },
  "instrument.shell.cutaway": { text: "Cutaway", kind: "label" },
  "instrument.shell.pixel": { text: "Pixel", kind: "label" },
  "instrument.shell.rainfall": { text: "Rainfall", kind: "label" },
  "instrument.shell.field": { text: "Field plan", kind: "label" },
  "instrument.shell.command": { text: "Ask or challenge", kind: "label" },

  // Instruments: the pixel anatomy (approved specimen C). Every number comes from the pixel's data file; the species
  // statements and their sources come from the statements fixture
  "instrument.pixel.question": {
    text: "Why can a pixel get greener while its pasture does not?",
    kind: "ui",
  },
  "instrument.pixel.source.trend": {
    text: "MODIS MOD13Q1 v6.1 (Didan 2021), per-pixel Theil-Sen trend, March to June 2000 to 2025, Siterra pixel_trend_long_record 1.0.0; ESA WorldCover 2021 v200 (Zanaga et al. 2022).",
    kind: "ui",
  },
  "instrument.pixel.source.spectra": {
    text: "Sentinel-2 L2A S2B_29SQR_20250611_0_L2A, 11 Jun 2025, Earth Search sentinel-cogs; herders' reports of palatable species lost (SCI-03, pp. 7 to 8).",
    kind: "ui",
  },
  "instrument.pixel.chip": { text: "Source {n}: {text}", kind: "label" },
  "instrument.pixel.locate": { text: "Locate", kind: "heading" },
  "instrument.pixel.locate.key": {
    text: "NDVI per decade, March to June {from} to {to}",
    kind: "label",
  },
  "instrument.pixel.km": { text: "{value} km", kind: "label" },
  "instrument.pixel.m": { text: "{value} m", kind: "label" },
  "instrument.pixel.cells": { text: "Pixel Cells", kind: "heading" },
  "instrument.pixel.cells.detail": {
    text: "Pixel {tile}, row {row}, column {col}, as its {cells} Sentinel-2 cells of 10 m. Cells outside it are veiled.",
    kind: "ui",
  },
  "instrument.pixel.cells.truecolour": { text: "True color", kind: "label" },
  "instrument.pixel.cells.ndvi": { text: "NDVI, {month}", kind: "label" },
  "instrument.pixel.cells.class": { text: "WorldCover {year} class", kind: "label" },
  "instrument.pixel.cells.truecolourNote": {
    text: "Shared display composite. Display only, no value read from it.",
    kind: "ui",
  },
  "instrument.pixel.cells.ndviNote": {
    text: "Monthly median of {min} to {max} clear dates per cell",
    kind: "label",
  },
  "instrument.pixel.class.10": { text: "Tree cover", kind: "label" },
  "instrument.pixel.class.40": { text: "Cropland", kind: "label" },
  "instrument.pixel.class.30": { text: "Grassland", kind: "label" },
  "instrument.pixel.class.60": { text: "Bare or sparse", kind: "label" },
  "instrument.pixel.classShort.10": { text: "Tree", kind: "label" },
  "instrument.pixel.classShort.40": { text: "Cropland", kind: "label" },
  "instrument.pixel.classShort.30": { text: "Grassland", kind: "label" },
  "instrument.pixel.classShort.60": { text: "Bare", kind: "label" },
  "instrument.pixel.spectra": { text: "Measured Spectra", kind: "heading" },
  "instrument.pixel.spectra.detail": {
    text: "Sentinel-2 L2A, {date}: median of each class's cells. All {cells} cells clear.",
    kind: "ui",
  },
  "instrument.pixel.spectra.reflectance": { text: "Reflectance", kind: "label" },
  "instrument.pixel.spectra.red": { text: "Red B04", kind: "label" },
  "instrument.pixel.spectra.nir": { text: "Near-infrared B08", kind: "label" },
  "instrument.pixel.spectra.axis": {
    text: "Wavelength, nm (axis broken at 900 to 1500)",
    kind: "label",
  },
  "instrument.pixel.spectra.ndvi": { text: "NDVI {value}", kind: "label" },
  "instrument.pixel.spectra.cellCount": { text: "{n} cells", kind: "label" },
  "instrument.pixel.spectra.pixel": { text: "This pixel, all cells", kind: "label" },
  "instrument.pixel.spectra.model": { text: "Model mix, panel 05", kind: "label" },
  "instrument.pixel.series": { text: "Season Record", kind: "heading" },
  "instrument.pixel.series.pixel": { text: "This pixel", kind: "label" },
  "instrument.pixel.series.band": { text: "Band below", kind: "label" },
  "instrument.pixel.series.trend": {
    text: "{slope} per decade, 95% {lower} to {upper}",
    kind: "label",
  },
  "instrument.pixel.model": { text: "Linear Mix Model", kind: "heading" },
  "instrument.pixel.model.label": {
    text: "Model: linear mix of measured class spectra from this pixel. Not a measurement of plant species.",
    kind: "ui",
  },
  "instrument.pixel.model.bar": {
    text: "Class shares in the model; ticks mark the measured shares.",
    kind: "ui",
  },
  "instrument.pixel.model.segment": { text: "{name} {share}", kind: "label" },
  "instrument.pixel.model.boundary": { text: "Boundary between {left} and {right}", kind: "label" },
  "instrument.pixel.model.key": {
    text: "Model NDVI, mix of the {date} class medians",
    kind: "label",
  },
  "instrument.pixel.model.delta": { text: "{value} from measured shares", kind: "label" },
  "instrument.pixel.model.gloss": { text: "Mixed red {red} and near-infrared {nir}.", kind: "ui" },
  "instrument.pixel.model.measured": {
    text: "Measured {value} on the same date (mean of cells).",
    kind: "ui",
  },
  "instrument.pixel.model.drag": {
    text: "Drag a boundary to move share between two classes.",
    kind: "ui",
  },
  "instrument.pixel.model.reset": { text: "Reset Shares", kind: "button" },
  "instrument.pixel.model.meaning": {
    text: "Grassland keeps its measured spectrum in every mix; only the shares move. The satellite records the mix, not which plants grow in the grassland.",
    kind: "ui",
  },
  "instrument.pixel.field": { text: "Field Check", kind: "heading" },
  "instrument.pixel.field.proposed": { text: "Proposed field check. Not measured.", kind: "ui" },
  "instrument.pixel.field.transect": {
    text: "Transect of {length} m on grassland: {n} quadrats, dashed on 02",
    kind: "label",
  },
  "instrument.pixel.field.records": {
    text: "Records plant cover by species and palatability, bare ground",
    kind: "label",
  },
  "instrument.pixel.field.noSpectrum": {
    text: "No spectrum of any of these species was measured here.",
    kind: "ui",
  },
  "instrument.pixel.description": {
    text: "One 250 m satellite pixel shown as its 10 m Sentinel-2 cells, with the measured spectra of its land cover classes and its season record. A linear mix model has movable class shares, and a field check is proposed.",
    kind: "ui",
  },
  // a cited statement and its references, as "(SCI-03, pp. 7 to 8)"
  "instrument.pixel.ref": { text: "{text} ({refs}).", kind: "label" },
  "instrument.pixel.ref.page": { text: "{id}, p. {page}", kind: "label" },
  "instrument.pixel.ref.pages": { text: "{id}, pp. {page}", kind: "label" },
  "instrument.pixel.failed": { text: "Pixel not loaded. Reload the page to retry.", kind: "ui" },

  // Instruments: the rainfall scatter. Every total here is a September to May total and says so; seasons, the fit
  // and the driest seasons come from the restrend bundle files the rainfall scatter spec names
  "instrument.scatter.description": {
    text: "The catchment's seasons as points: March to June greenness against the September to May rainfall before each, a straight-line fit, the four driest seasons ringed.",
    kind: "ui",
  },
  "instrument.scatter.failed": {
    text: "Rainfall scatter not loaded. Reload the page to retry.",
    kind: "ui",
  },
  "instrument.scatter.axis.rain": { text: "September to May rainfall, mm", kind: "label" },
  "instrument.scatter.axis.ndvi": { text: "March to June NDVI, catchment mean", kind: "label" },
  "instrument.scatter.fit": { text: "Straight-line fit, R squared {r2}", kind: "label" },
  "instrument.scatter.driest": { text: "{year}, {mm} mm", kind: "label" },
  "instrument.scatter.seasons": { text: "{n} seasons, {from} to {to}", kind: "label" },
  "instrument.scatter.key.season": { text: "One season", kind: "label" },
  "instrument.scatter.key.driest": {
    text: "The four driest September to May totals",
    kind: "label",
  },
  "instrument.scatter.slope": {
    text: "Rainfall slope {slope} NDVI per 100 mm, 95% {lower} to {upper}.",
    kind: "ui",
  },
  // Instruments: the field plan. Explanations, statuses and checks come from the branch merge the field plan spec
  // names; every check is proposed, nothing is scheduled
  "instrument.fieldPlan.description": {
    text: "The explanations the branch merge weighed, with the status it gave each, and the proposed field checks that would tell the open ones apart.",
    kind: "ui",
  },
  "instrument.fieldPlan.failed": {
    text: "Field plan not loaded. Reload the page to retry.",
    kind: "ui",
  },
  "instrument.fieldPlan.none": {
    text: "This case's record holds no field plan instrument yet.",
    kind: "ui",
  },
  "instrument.fieldPlan.proposed": { text: "Proposed", kind: "label" },
  "instrument.fieldPlan.reason.failed": {
    text: "A prediction it needs failed on adequate data.",
    kind: "ui",
  },
  "instrument.fieldPlan.reason.tooFew.one": {
    text: "Not enough data yet: {have} period of data, {need} are needed to rule it out.",
    kind: "ui",
  },
  "instrument.fieldPlan.reason.tooFew": {
    text: "Not enough data yet: {have} periods of data, {need} are needed to rule it out.",
    kind: "ui",
  },
  "instrument.fieldPlan.reason.noneRecorded": { text: "No predictions were recorded.", kind: "ui" },
  "instrument.fieldPlan.reason.noneTestable": {
    text: "No prediction can be tested with the record yet.",
    kind: "ui",
  },
  "instrument.fieldPlan.reason.allMet": {
    text: "Every testable prediction is met, {n} of {of}.",
    kind: "ui",
  },
  "instrument.fieldPlan.separates": { text: "Tells apart {pairs}", kind: "label" },
  "instrument.fieldPlan.only": {
    text: "The only proposed check that tells {a} from {b}",
    kind: "label",
  },
  "instrument.fieldPlan.pair": { text: "{a} and {b}", kind: "label" },
  "instrument.fieldPlan.unseparated.none": {
    text: "Every pair of open explanations has a proposed check that tells them apart.",
    kind: "ui",
  },
  "instrument.fieldPlan.unseparated": {
    text: "No proposed check tells these apart: {pairs}.",
    kind: "ui",
  },
  "instrument.scatter.gate": {
    text: "The interval includes zero, so the rainfall-adjusted trend's precondition is not met.",
    kind: "ui",
  },
  "instrument.pixel.credit": {
    text: "Contains modified Copernicus Sentinel data 2025. MODIS MOD13Q1 v6.1, NASA LP DAAC. © ESA WorldCover project 2021, CC BY 4.0. Catchment from Copernicus DEM GLO-30.",
    kind: "ui",
  },

  // The overview (approved specimen D4) at /valley: the relief inside an arc, five findings on it, the proposed field
  // check on the land and the ask. Every number, the case question, the place's name and its area come from the
  // records; the findings' captions name what each number is
  "overview.description": {
    text: "A relief model of the valley catchment inside one arc. Each point on the arc is a finding with its number. The circle on the arc's lower left opens the ask.",
    kind: "ui",
  },
  "overview.keys": {
    text: "Enter opens a finding's instrument beside the land; Esc returns to the overview. The slash key opens the ask.",
    kind: "ui",
  },
  "overview.findings": { text: "Findings", kind: "heading" },
  "overview.finding.catchment.1": { text: "NDVI per decade, March to June,", kind: "label" },
  "overview.finding.catchment.2": { text: "{from} to {to}", kind: "label" },
  "overview.finding.band.1": { text: "NDVI per decade below {limit} m", kind: "label" },
  "overview.finding.pixel.1": { text: "NDVI per decade in one pixel", kind: "label" },
  "overview.finding.pixel.2": { text: "at the valley floor edge", kind: "label" },
  "overview.finding.rain.1": { text: "R squared, September to May rain", kind: "label" },
  "overview.finding.rain.2": { text: "against March to June greenness", kind: "label" },
  "overview.finding.fdr.1": { text: "of the area greening after a", kind: "label" },
  "overview.finding.fdr.2": { text: "false discovery rate check", kind: "label" },
  "overview.field": { text: "Proposed field check, not measured", kind: "label", honesty: true },
  "overview.pixel": { text: "This pixel", kind: "label" },
  "overview.key.tree": { text: "Tree cover", kind: "label" },
  "overview.key.crop": { text: "Cropland or built-up, {year}", kind: "label" },
  // the opened finding's record (D4's opened node): a kicker, the number, its caption, the season chart and its
  // line, the published context in the record's display text with its sources, and the way to the full instrument
  "overview.record.pixel": { text: "One pixel at the valley floor edge", kind: "label" },
  "overview.record.band": { text: "Below {limit} m", kind: "label" },
  "overview.record.catchment": { text: "Valley catchment", kind: "label" },
  "overview.record.caption": {
    text: "NDVI per decade, March to June, {from} to {to}",
    kind: "label",
  },
  "overview.record.theilSen": {
    text: "Theil-Sen line, interval at 95%: {lower} to {upper}. One point per season, the March to June mean.",
    kind: "ui",
  },
  "overview.record.ols": {
    text: "Least squares line, interval at 95%: {lower} to {upper}. One point per season, the March to June mean.",
    kind: "ui",
  },
  "overview.record.scatter": {
    text: "One point per season; the line is the straight-line fit across them.",
    kind: "ui",
  },
  "overview.record.ndvi": { text: "NDVI", kind: "label" },
  "overview.record.rain": { text: "September to May, mm", kind: "label" },
  "overview.record.context": { text: "Published context", kind: "label" },
  "overview.record.open": { text: "Open Instrument", kind: "link" },
  "overview.cite": { text: "{authors} {year}, {venue}, p. {page}", kind: "label" },
  "overview.cite.pages": { text: "{authors} {year}, {venue}, pp. {pages}", kind: "label" },
  "overview.cite.noPage": { text: "{authors} {year}, {venue}", kind: "label" },
  "overview.cite.etAl": { text: "{name} et al.", kind: "label" },
  "overview.cite.two": { text: "{a} and {b}", kind: "label" },
  "overview.back": { text: "Back to Overview", kind: "button" },
  "overview.failed": { text: "Overview not loaded. Reload the page to retry.", kind: "ui" },

  // The ask: a matte circle that opens a fade from the bottom with the question typed in large type. Enter sends it
  // on the overview (the same commission as the valley's command line) and carries it to the overview from an
  // instrument, sending nothing there; the activity line shows only after Enter, from the session's log
  "ask.circle": { text: "ask", kind: "label" },
  "ask.open": { text: "Ask Siterra", kind: "button" },
  "ask.close": { text: "Close Ask", kind: "button" },
  // the activity line: the step running with the model and route that served it (the activity panel's badge)
  "ask.taskModel": { text: "{model}: {task}, {status}", kind: "ui" },
  "ask.task": { text: "{task}, {status}", kind: "ui" },
  // The ask's results (U11b): the work card's outcome with its findings count as a button, and the results view it
  // opens: an answer caption from the request's BranchMerge counts, then the findings it committed, each statement
  // as recorded, with a source chip that opens the cited locator and excerpt
  "ask.complete": { text: "Complete.", kind: "ui" },
  "ask.findings": { text: "Findings: {n}", kind: "button" },
  "results.title": { text: "Results", kind: "heading" },
  "results.findings": { text: "Findings", kind: "heading" },
  "results.chip": { text: "Source {n}", kind: "button" },
  "results.n0": { text: "no", kind: "label" },
  "results.n1": { text: "one", kind: "label" },
  "results.n2": { text: "two", kind: "label" },
  "results.n3": { text: "three", kind: "label" },
  "results.n4": { text: "four", kind: "label" },
  "results.n5": { text: "five", kind: "label" },
  "results.first.contradicted.one": { text: "{n} explanation is contradicted", kind: "ui" },
  "results.first.contradicted.many": { text: "{n} explanations are contradicted", kind: "ui" },
  "results.then.contradicted.one": { text: "{n} is contradicted", kind: "ui" },
  "results.then.contradicted.many": { text: "{n} are contradicted", kind: "ui" },
  "results.first.consistent.one": {
    text: "{n} explanation is consistent with the records",
    kind: "ui",
  },
  "results.first.consistent.many": {
    text: "{n} explanations are consistent with the records",
    kind: "ui",
  },
  "results.then.consistent.one": { text: "{n} is consistent with the records", kind: "ui" },
  "results.then.consistent.many": { text: "{n} are consistent with the records", kind: "ui" },
  "results.first.cannot.one": { text: "{n} explanation cannot be assessed yet", kind: "ui" },
  "results.first.cannot.many": { text: "{n} explanations cannot be assessed yet", kind: "ui" },
  "results.then.cannot.one": { text: "{n} cannot be assessed yet", kind: "ui" },
  "results.then.cannot.many": { text: "{n} cannot be assessed yet", kind: "ui" },
  "results.join1": { text: "{a}.", kind: "ui" },
  "results.join2": { text: "{a} and {b}.", kind: "ui" },
  "results.join3": { text: "{a}, {b} and {c}.", kind: "ui" },
  "results.plan.one": {
    text: "The field plan proposes {n} check that tells the open ones apart.",
    kind: "ui",
  },
  "results.plan.many": {
    text: "The field plan proposes {n} checks that tell the open ones apart.",
    kind: "ui",
  },
  "results.plan.none": { text: "No proposed field check tells the open ones apart.", kind: "ui" },
  // the counts agree with their numbers: "1 check", "2 checks"; "1 pair ... is", "2 pairs ... are"
  "results.plan.partial": {
    text: "The field plan proposes {checks}; {pairs} not told apart by any of them.",
    kind: "ui",
  },
  "results.count.check.one": { text: "{n} check", kind: "ui" },
  "results.count.check.many": { text: "{n} checks", kind: "ui" },
  "results.count.pair.one": { text: "{n} pair of open explanations is", kind: "ui" },
  "results.count.pair.many": { text: "{n} pairs of open explanations are", kind: "ui" },
  "results.only.one": { text: "The request added {n} finding to the case record.", kind: "ui" },
  "results.only.many": { text: "The request added {n} findings to the case record.", kind: "ui" },
  "results.excerpt": { text: "{title}, {locator}: \u201c{excerpt}\u201d", kind: "ui" },
  "results.locator": { text: "{title}, {locator}", kind: "ui" },
  "results.checked": { text: "Checked against the source", kind: "label" },
  "results.unchecked": { text: "Not yet checked against the source", kind: "label", honesty: true },
  "results.computed.state": { text: "Computed from the record's measurements", kind: "label" },
  "results.computed": { text: "{bundle}. Computed from {measurements}.", kind: "ui" },
} as const satisfies Record<string, Message>;

export type MessageId = keyof typeof en;

/**
 * Lint exceptions by string ID with the reason, never by pattern (voice and tone guide). Each entry names
 * the rules it may break.
 */
export const LINT_ALLOWLIST: Partial<Record<MessageId, { rules: string[]; reason: string }>> = {
  "notice.relief": {
    rules: ["VT-03", "VT-08"],
    reason: "Copernicus WorldDEM-30 licence notice, kept in the wording the licence requires.",
  },
  "notice.fontSans": {
    rules: ["VT-08", "VT-48"],
    reason:
      "IBM and SIL are the names of the font's maker and its licence's publisher; the link names the font and its licence in full.",
  },
  "notice.maplibre": {
    rules: ["VT-08", "VT-48"],
    reason:
      "BSD is part of the licence's name, the BSD 3-Clause License; the link names the library and its licence in full.",
  },
  "notice.maplibreContour": {
    rules: ["VT-08", "VT-09", "VT-48"],
    reason:
      "maplibre-contour is the package's own lower-case name; the link names it, its licence and the bundled licences in full.",
  },
  "instrument.credit.modisNdvi": {
    rules: ["VT-08"],
    reason:
      "MODIS is the instrument's name and LP DAAC the archive's; the credit names the product as NASA's archive lists it.",
  },
  "instrument.credit.modisSnow": {
    rules: ["VT-08"],
    reason:
      "MODIS is the instrument's name and NSIDC the data centre's; the credit names the product as the data centre lists it.",
  },
  "instrument.credit.dem": {
    rules: ["VT-03", "VT-08"],
    reason: "Copernicus WorldDEM-30 licence notice, kept in the wording the licence requires.",
  },
  "instrument.pixel.source.trend": {
    rules: ["VT-08"],
    reason:
      "MODIS is the instrument's name; the source note names the product, the recipe and the land cover map as their publishers list them.",
  },
  "instrument.pixel.credit": {
    rules: ["VT-08"],
    reason:
      "MODIS is the instrument's name and LP DAAC the archive's; the credit carries the data licences' required wording.",
  },
  "notice.three": {
    rules: ["VT-08", "VT-09"],
    reason:
      "three.js is the library's own lower-case name, and MIT is part of the licence's name, the MIT License; the link names both in full.",
  },
  "notice.fontMono": {
    rules: ["VT-08", "VT-48"],
    reason:
      "IBM and SIL are the names of the font's maker and its licence's publisher; the link names the font and its licence in full.",
  },
  "credit.globe": {
    rules: ["VT-03", "VT-08"],
    reason: "Copernicus WorldDEM-90 licence notice, kept in the wording the licence requires.",
  },
  "credit.imagery": {
    rules: ["VT-03"],
    reason: "Copernicus attribution wording, kept as the licence states it with the year range.",
  },
};

/** True for a line that says what a value is not or does not prove (exempt from the label word cap). */
export function isHonesty(id: MessageId): boolean {
  const m: Message = en[id];
  return m.honesty === true;
}

/** Fills {name} placeholders. Unknown placeholders are left as written so a missing value shows. */
export function format(id: MessageId, values: Record<string, string | number> = {}): string {
  return en[id].text.replace(/\{(\w+)\}/g, (whole, key: string) =>
    key in values ? String(values[key]) : whole,
  );
}
