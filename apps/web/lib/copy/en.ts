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
  // Opening page (approved 27 Oct 2026; IDs and wording from the approved opening copy)
  "opening.beat1": {
    text: "Rangelands cover more than half of Earth's land and support the livelihoods of about two billion people.",
    kind: "ui",
  },
  "opening.beat1.tag": {
    text: "UN General Assembly, 2022; UNCCD, 2024 (SCI-125, SCI-127)",
    kind: "ui",
  },
  "opening.beat2": {
    text: "Greenness follows rainfall closely. In simulations, a vegetation-index trend only became statistically detectable once 30 to 40 per cent of the vegetation had been degraded.",
    kind: "ui",
  },
  "opening.beat2.tag": { text: "Wessels et al., 2012 (SCI-29)", kind: "ui" },
  "opening.beat3": {
    text: "In protectorate Morocco, a 1917 forest decree banned grazing for six years in burned or harvested forests, and officials treated forest grazing as the main cause of deforestation. Fossil pollen evidence contradicts the large deforestation estimates.",
    kind: "ui",
  },
  "opening.beat3.tag": { text: "Davis, 2005 (SCI-145)", kind: "ui" },
  "opening.beat4": {
    text: "Siterra investigates one place at a time. The first: is grazing changing the shared pastures of the Aït Bouguemez valley?",
    kind: "ui",
  },
  "opening.action": { text: "Open the investigation", kind: "button" },
  "opening.next": { text: "Next", kind: "button" },

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
  "work.planning": { text: "Planning: {n} steps to answer this question", kind: "ui" },
  "work.stop": { text: "Stop", kind: "button" },
  "work.received": { text: "Request received", kind: "ui" },
  "work.complete": { text: "Request complete", kind: "ui" },
  "work.observations": { text: "Observations", kind: "label" },
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

  // Sources and notices
  "notices.data": { text: "Data in this case, as its records credit it", kind: "label" },
  "notices.map": { text: "Map and imagery", kind: "label" },
  "notices.places": { text: "Points on the land, as their records credit them", kind: "label" },
  "notices.fonts": { text: "Fonts", kind: "label" },
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
    text: "The interactive map could not load. Everything shown on the map is also listed in Read flat.",
    kind: "ui",
  },

  // Credits
  "credit.terrain": { text: "© Mapterhorn. Copernicus WorldDEM-30.", kind: "ui" },
  "credit.rainfall": { text: "CHIRPS v3.0, accessed 27 Oct 2026.", kind: "ui" },
  "credit.imagery": { text: "Contains modified Copernicus Sentinel data 2019-2025.", kind: "ui" },
  "credit.outletInput": { text: "© OpenStreetMap contributors.", kind: "ui" },

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
  "opening.beat1.tag": {
    rules: ["VT-08"],
    reason:
      "UNCCD is the source organisation's acronym in a citation tag; the guide's acronym list lacks it.",
  },
  "opening.beat2": {
    rules: ["VT-20", "VT-31"],
    reason:
      "Cited published result (SCI-29) quoted exactly as worded in problem.md; shown outside the product chrome as a title with its source tag; describes a simulation study, not this valley.",
  },
  "opening.beat3": {
    rules: ["VT-34", "VT-50"],
    reason:
      "Approved source wording (Davis 2005, SCI-145): 'six years' is part of the decree and the sentence keeps its length.",
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
