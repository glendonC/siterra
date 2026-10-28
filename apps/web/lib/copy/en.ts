// English message catalog (I18N-01): every interface string the app shows lives here, keyed by string ID.
// Place names, numbers and record fields come from records and are not catalog strings.
// Placeholders use ICU-style names in braces: {area}.

import type { Scope } from "./lint";

export interface Message {
  text: string;
  /** Lint scope: plain interface text, a label, a button or a link. */
  kind: Extract<Scope, "ui" | "label" | "button" | "link">;
  /** A line that says what a value is not or does not prove; exempt from the land-label word cap. */
  honesty?: true;
}

export const en = {
  // Opening page: one screen. The case question comes from the case record (opening.case)
  "opening.what": {
    text: "Siterra assesses environmental questions for communities and organisations that have no specialist to ask.",
    kind: "ui",
  },
  "opening.how": {
    text: "Its agents plan the work and read published research with Meta's Muse Spark model, and code checks every quote against its source. Code computes every number. A person reviews the results; Siterra contacts no one and decides nothing.",
    kind: "ui",
  },
  "opening.case": { text: "This case: {question}", kind: "ui" },
  "opening.action": { text: "Open the case", kind: "button" },
  "opening.skip": { text: "Skip to the map", kind: "link" },

  // Globe and dive (approved hero study A4)
  "globe.range": { text: "Atlas Mountains, Morocco", kind: "label" },
  "globe.oneCase": { text: "One case so far: Aït Bouguemez", kind: "ui" },
  "globe.legend": {
    text: "Rangeland biomes, potential extent (Rangelands Atlas method)",
    kind: "ui",
  },
  "globe.turn": { text: "Turn", kind: "label" },
  "globe.dragKey": { text: "drag", kind: "label" },
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
  "arrival.start": { text: "Start investigation", kind: "button" },
  "arrival.readFlat": { text: "Read flat", kind: "button" },

  // Read flat
  "flat.title": { text: "Everything on screen, as text", kind: "label" },
  "flat.close": { text: "Close", kind: "button" },
  "flat.skip": { text: "Skip to everything on screen, as text", kind: "link" },
  "flat.lonW": { text: "{deg}° W", kind: "label" },
  "flat.latN": { text: "{deg}° N", kind: "label" },
  "flat.km": { text: "{n} km", kind: "label" },
  "flat.m": { text: "{n} m", kind: "label" },
  "flat.place": { text: "Place", kind: "label" },
  "flat.question": { text: "Question", kind: "label" },
  "flat.notes": { text: "View notes", kind: "label" },
  "flat.sources": { text: "Sources", kind: "label" },

  // Task status words (microcopy section 6)
  "task.queued": { text: "Queued", kind: "label" },
  "task.running": { text: "Running", kind: "label" },
  "task.needs_input": { text: "Needs your input", kind: "label" },
  "task.done": { text: "Done", kind: "label" },
  "task.partial": { text: "Partly done", kind: "label" },
  "task.failed": { text: "Failed", kind: "label" },
  "task.cancelled": { text: "Canceled", kind: "label" },
  "task.awaiting_review": { text: "Awaiting review", kind: "label" },
  "work.planning": { text: "Planning: {n} steps to answer this question", kind: "ui" },
  "work.stop": { text: "Stop", kind: "button" },
  "work.received": { text: "Request received", kind: "ui" },
  "work.complete": { text: "Request complete", kind: "ui" },
  // microcopy section 5 Failed and Partial; "Your question is kept" as in work.refused, no Retry on the card
  "work.failed": { text: "Request failed: {cause}. Your question is kept.", kind: "ui" },
  "work.partial": { text: "Finished with gaps. Not done: {tasks}.", kind: "ui" },
  "work.cancelled": { text: "Request canceled", kind: "ui" },
  // causes after the section 16 patterns: Budget or time limit, Model output rejected, Model service down
  "work.cause.roundLimit": { text: "stopped at the model round limit", kind: "ui" },
  "work.cause.rejected": { text: "Siterra rejected the model's proposal", kind: "ui" },
  "work.cause.modelDown": { text: "the model service is not responding", kind: "ui" },
  "work.cause.other": { text: "no step finished", kind: "ui" },
  // task kinds (microcopy section 6 task rows; the voice guide's terminology for the two it does not list:
  // "possible response", not "intervention"; "checked (automated)", not "verified")
  "task.kind.plan": { text: "Plan", kind: "label" },
  "task.kind.source_research": { text: "Source research", kind: "label" },
  "task.kind.observation_analysis": { text: "Observation analysis", kind: "label" },
  "task.kind.livelihood_governance": { text: "Livelihood and governance research", kind: "label" },
  "task.kind.hypothesis_comparison": { text: "Explanation comparison", kind: "label" },
  "task.kind.intervention_feasibility": { text: "Possible responses", kind: "label" },
  "task.kind.brief_package": { text: "Field-validation plan", kind: "label" },
  "task.kind.validation": { text: "Automated checks", kind: "label" },
  // labeled precomputed (ADR-0021; agent orchestration, "Precomputed observations are labeled precomputed")
  "work.observations": { text: "Observations (precomputed)", kind: "label" },
  "work.observationLine": {
    text: "{label}: {available} of {total} months observed, {first} to {last}",
    kind: "ui",
  },
  "work.refused": {
    text: "The request was not sent. Your question is kept. Try again.",
    kind: "ui",
  },
  "work.quotaUsed": {
    text: "This demo session has used its requests. Your question is kept.",
    kind: "ui",
  },

  // Activity panel (microcopy section 20: panel title, empty state, model badge "{model}, {route}")
  "activity.title": { text: "Activity", kind: "label" },
  "activity.empty": {
    text: "No activity yet. Each model call, tool call and check appears here as it happens.",
    kind: "ui",
  },
  "activity.model": { text: "{model}, {route}", kind: "label" },
  "activity.route.synthetic": { text: "synthetic replay", kind: "label" },
  "activity.route.recorded": { text: "recorded replay", kind: "label" },
  "activity.route.modelApi": { text: "Model API", kind: "label" },
  "activity.code": { text: "Code: {tool}", kind: "label" },
  "activity.proposal": { text: "Model proposal: {tool}", kind: "label" },
  "activity.rejected": { text: "Rejected: {rule} ({code})", kind: "ui" },
  "activity.blocked": { text: "Blocked: needs {inputs}", kind: "ui" },
  "activity.cause": { text: "Cause: {cause}", kind: "ui" },
  "activity.synthetic": { text: "Replay of a synthetic run (no live model)", kind: "label" },
  "activity.recorded": { text: "Replay of a recorded run", kind: "label" },
  "activity.pace": { text: "Shown at reading pace, one event every {seconds} s", kind: "ui" },
  "activity.showAll": { text: "Show all steps", kind: "button" },
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
  "legend.ndvi.title": {
    text: "NDVI departure, {period}, compared with other {months}",
    kind: "label",
  },
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
  "flat.legend": { text: "Map legend", kind: "label" },
  // one label, its state in aria-expanded (voice and tone: a toggle keeps one label)
  "legend.toggle": { text: "Map legend", kind: "button" },

  // Sources and notices
  "notices.data": { text: "Data in this case, as its records credit it", kind: "label" },
  "notices.map": { text: "Map and imagery", kind: "label" },
  "notices.places": { text: "Points on the land, as their records credit them", kind: "label" },
  "notices.fonts": { text: "Fonts", kind: "label" },
  "notices.software": { text: "Software", kind: "label" },
  "notice.maplibre": { text: "MapLibre GL JS, BSD 3-Clause License", kind: "link" },
  "notice.maplibreContour": {
    text: "maplibre-contour, BSD 3-Clause License, with the licences of the code it includes",
    kind: "link",
  },
  "notices.keys": { text: "Keyboard", kind: "label" },
  "notices.singleKeys": { text: "Single-key shortcuts", kind: "label" },
  "notices.singleKeysDetail": {
    text: "F opens Read flat and / moves to the command line. Turn them off if they get in your way. ↵ and Esc always work.",
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
    text: "This case is not open to this session. Start again from the home page.",
    kind: "ui",
  },
  "case.failed": {
    text: "The case did not load. Nothing was changed. Reload the page to try again.",
    kind: "ui",
  },
  "case.noBoundary": {
    text: "The analysis boundary is not established yet, so the valley is not drawn.",
    kind: "ui",
  },

  // Command line
  "command.label": { text: "Ask Siterra", kind: "label" },

  // Stage notes
  "stage.relief": { text: "Relief ×{factor}", kind: "label" },
  "stage.north": { text: "N", kind: "label" },
  "stage.northName": { text: "North", kind: "ui" },
  "stage.imagery": { text: "Imagery: Sentinel-2, summer 2025, display only", kind: "ui" },
  "stage.sources": { text: "Sources and notices", kind: "link" },
  "stage.mapFailed": {
    text: "The interactive map could not load. Everything it would show is listed below.",
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
  "mode.live": { text: "Live", kind: "label" },
  "mode.liveDetail": {
    text: "Model and tool calls run now. Observations are precomputed.",
    kind: "ui",
  },
  "mode.replay": { text: "Replay of live run, {date}", kind: "label" },
  "mode.replayDetail": {
    text: "Recorded outputs from a live run. Nothing is computed now.",
    kind: "ui",
  },
  "mode.simulated": { text: "Simulated answer.", kind: "ui" },
  // The scope popover the mode line opens (microcopy section 2, PC-04)
  "scope.name": { text: "What Siterra will and will not do", kind: "label" },
  "scope.will": { text: "Siterra will", kind: "label" },
  "scope.will1": { text: "Plan the investigation and retrieve published research", kind: "ui" },
  "scope.will2": {
    text: "Load satellite and rainfall observations for the analysis area",
    kind: "ui",
  },
  "scope.will3": { text: "Compare explanations and keep unresolved ones open", kind: "ui" },
  "scope.will4": { text: "Prepare a field-validation plan and the reviews it needs", kind: "ui" },
  "scope.willNot": { text: "Siterra will not", kind: "label" },
  "scope.willNot1": { text: "Contact anyone, spend money, or publish anything", kind: "ui" },
  "scope.willNot2": { text: "Make or authorize land-management decisions", kind: "ui" },
  "scope.willNot3": { text: "Claim consent, partnerships, or outcomes", kind: "ui" },
  "mode.concept": { text: "Concept prototype", kind: "label" },
  "mode.conceptDetail": {
    text: "Model steps are synthetic examples, not live model output. The rainfall and vegetation records are measured.",
    kind: "ui",
  },
  "mode.fixture": { text: "Fixture data", kind: "label" },
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
    rules: ["VT-08"],
    reason: "IBM and SIL are the names of the font's maker and its licence's publisher.",
  },
  "notice.maplibre": {
    rules: ["VT-08"],
    reason: "BSD is part of the licence's name, the BSD 3-Clause License.",
  },
  "notice.maplibreContour": {
    rules: ["VT-08"],
    reason: "BSD is part of the licence's name, the BSD 3-Clause License.",
  },
  "notice.fontMono": {
    rules: ["VT-08"],
    reason: "IBM and SIL are the names of the font's maker and its licence's publisher.",
  },
  "globe.range": {
    rules: ["VT-09"],
    reason:
      '"Atlas Mountains" is the range\'s proper name; "Mountains" is missing from the guide\'s allowlist.',
  },
  "dive.highAtlas": {
    rules: ["VT-09"],
    reason:
      '"High Atlas Mountains" is the range\'s proper name; "Mountains" is missing from the guide\'s allowlist.',
  },
  "credit.globe": {
    rules: ["VT-03", "VT-08"],
    reason: "Copernicus WorldDEM-90 licence notice, kept in the wording the licence requires.",
  },
  "arrival.region": {
    rules: ["VT-09"],
    reason:
      '"High Atlas Mountains" is the range\'s proper name; "Mountains" is missing from the guide\'s allowlist.',
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
