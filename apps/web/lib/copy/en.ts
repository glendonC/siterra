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

  // Globe and dive (approved hero study A4)
  "globe.range": { text: "Atlas Mountains, Morocco", kind: "label" },
  "globe.pack": { text: "Region Pack: {name}", kind: "ui" },
  "globe.legend": {
    text: "Rangeland biomes, potential extent (Rangelands Atlas method)",
    kind: "ui",
  },
  "globe.turn": { text: "Turn", kind: "heading" },
  "globe.dragKey": { text: "Drag", kind: "heading" },
  "dive.highAtlas": { text: "High Atlas Mountains", kind: "label" },
  "credit.globe": {
    text: "Globe relief: produced using Copernicus WorldDEM™-90 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved",
    kind: "ui",
  },
  "credit.dive": { text: "Dive relief over Morocco: © Mapterhorn (Copernicus GLO-30)", kind: "ui" },

  // Arrival
  "arrival.valleyName": { text: "Aït Bouguemez valley", kind: "label" },
  "arrival.region": { text: "High Atlas Mountains, Morocco", kind: "label" },
  "arrival.studyArea": { text: "Valley catchment: {area} km²", kind: "label" },
  "arrival.studyAreaLimit": {
    text: "Not a pasture, agdal, or management boundary.",
    kind: "ui",
    honesty: true,
  },
  "arrival.outlet": { text: "Outlet: the whole catchment drains here", kind: "label" },
  "arrival.question": {
    text: "Is grazing changing the shared pastures of the Aït Bouguemez valley?",
    kind: "ui",
  },
  "arrival.start": { text: "Run Assessment", kind: "button" },
  "arrival.readFlat": { text: "Flat Map View", kind: "button" },

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

  // Command line
  "command.label": { text: "Question", kind: "heading" },

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
