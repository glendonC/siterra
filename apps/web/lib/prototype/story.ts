// The scripted demo run for /prototype: the status lines, the five explanation lanes, the cited answer, the
// explanations, the next measurements and the method notes. Every number is computed here from the fixture
// (the repository's bundles); the words are fixed. Nothing here comes from a model.

import type { Fixture, Month } from "./fixture";

export type LaneId = "rain" | "grazing" | "orchards" | "snow" | "gaps";
export type Verdict = "possible" | "satellite" | "unknown" | "nofit";

export const VERDICT_TEXT: Record<Verdict, string> = {
  possible: "Still possible",
  satellite: "Can't tell from satellite data",
  unknown: "Can't tell yet",
  nofit: "Doesn't fit the data",
};

/** What each status does not mean, shown with it (voice and tone, rule 8). */
export const VERDICT_NOT: Record<Verdict, string> = {
  possible: "Other explanations can fit too.",
  satellite: "This isn't the same as ruled out.",
  unknown: "This isn't the same as ruled out.",
  nofit: "Doesn't mean the data is perfect.",
};

export type Layer =
  | { kind: "none" }
  | { kind: "greenness"; periodId: string; rainOutline?: boolean }
  | { kind: "rain"; values: Record<string, number> | null }
  | { kind: "cropland"; rainOutline?: boolean };

/** A measured step of the plan, drawn as a thin sheet above the valley until its step runs. */
export interface Sheet {
  id: string;
  n: string;
  label: string;
  liftAt: number;
  downAt: number;
}

export interface Step {
  running: string;
  done: string;
  /** Seconds on the run's clock. */
  start: number;
  end: number;
}

export interface Lane {
  id: LaneId;
  name: string;
  steps: Step[];
  verdict: Verdict;
  detail: string;
  caveat?: string;
  /** The observations this explanation was tested against. */
  links: { obs: string; relation: Relation }[];
}

/** fits: the observation agrees; against: it argues against; gap: the data is missing. */
export type Relation = "fits" | "against" | "gap";

export const RELATION_TEXT: Record<Relation, string> = {
  fits: "Fits",
  against: "Argues against",
  gap: "Missing data",
};

export interface Observation {
  id: string;
  kind: "seen" | "missing";
  text: string;
  /** Source chip number, when there is one. */
  source?: number;
  /** Where it applies on the land; null when it has no mapped place. */
  at: [number, number] | null;
}

export interface OptionCard {
  id: string;
  title: string;
  what: string;
  tradeoff: string;
  decides: string;
  size: string;
  addresses: LaneId[];
}

export interface PlanStep {
  what: string;
  who: string;
  when: string;
}

export interface Beat {
  at: number;
  status: string;
  /** What the map shows while this beat runs. */
  layer: Layer;
  key: KeyInfo | null;
  /** The area being read; a new value draws one sweep across it. */
  reading: string;
}

export type ClaimId = "browner" | "dryWinter";

export interface Segment {
  text: string;
  cite?: number[];
  claim?: ClaimId;
}

export interface SourceChip {
  n: number;
  label: string;
  title: string;
  quote?: string;
  body?: string;
  where: string;
  note: string;
  url?: string;
}

export interface KeyInfo {
  kind: "greenness" | "rain";
  title: string;
}

export interface ClaimView {
  shot: "valley-floor" | "rain-grid";
  layer: Layer;
  key: KeyInfo;
}

export interface Story {
  question: string;
  /** From the case record, so no component names a place itself. */
  place: { name: string; location: string; area: string };
  period: string;
  /** The lowest month against the same month a year earlier. */
  compare: { before: Pick<Month, "periodId" | "label">; after: Pick<Month, "periodId" | "label"> };
  beats: Beat[];
  sheets: Sheet[];
  lanes: Lane[];
  endsAt: number;
  sourcesLine: string;
  headline: string;
  limit: string;
  segments: Segment[];
  meaning: string;
  chips: SourceChip[];
  claims: Record<ClaimId, ClaimView>;
  next: string[];
  nextNote: string;
  observations: Observation[];
  options: OptionCard[];
  optionsNote: string;
  plan: PlanStep[];
  planNote: string;
  method: string[];
  summary: string;
  numbers: {
    months: number;
    measured: number;
    browner: number;
    minSeenPercent: number;
    lowest: Month;
    dry: { label: string; totalMm: number };
    usualMm: number;
    lateRain: Month;
    sources: number;
    opened: number;
    winterMonths: number;
    winterMeasured: number;
    snowInBrowner: number;
    rainCells: number;
    seasonsCompared: number;
  };
}

const MINUS = "\u2212";
export const ndvi = (v: number) => `${v < 0 ? MINUS : "+"}${Math.abs(v).toFixed(2)}`;
const mm = (v: number) => `${String(Math.round(v))} mm`;

function seasonCells(f: Fixture, startYear: number): Record<string, number> {
  const periods = [
    `period_${String(startYear)}-11`,
    `period_${String(startYear)}-12`,
    ...["01", "02", "03", "04"].map((m) => `period_${String(startYear + 1)}-${m}`),
  ];
  const out: Record<string, number> = {};
  for (const p of periods)
    for (const [cell, v] of Object.entries(f.cellRain[p] ?? {})) out[cell] = (out[cell] ?? 0) + v;
  return out;
}

export function buildStory(f: Fixture): Story {
  const months = f.months;
  const measuredMonths = months.filter((m) => m.greenness !== null);
  const inWindow = months.filter((m) => m.id >= "2022-05" && m.id <= "2023-04");
  const browner = inWindow.filter((m) => m.greenness !== null);
  if (browner.some((m) => (m.greenness ?? 0) >= 0))
    throw new Error("The fixture no longer shows every measured month below usual in the window");
  const lowest = browner.reduce((a, b) => ((b.greenness ?? 0) < (a.greenness ?? 0) ? b : a));
  const yearBefore = `${String(Number(lowest.id.slice(0, 4)) - 1)}${lowest.id.slice(4)}`;
  const beforeLowest = months.find((m) => m.id === yearBefore && m.greenness !== null);
  if (!beforeLowest) throw new Error("No measured month a year before the lowest one");
  const minSeenPercent = Math.floor(Math.min(...browner.map((m) => m.seenShare)) * 100);
  const dry = f.seasons.find((s) => s.id === "season_2022-11_2023-04");
  const wetBefore = f.seasons.find((s) => s.id === "season_2021-11_2022-04");
  const lateRain = months.find((m) => m.id === "2022-03");
  const nov21 = months.find((m) => m.id === "2021-11");
  const dec21 = months.find((m) => m.id === "2021-12");
  if (!dry || !wetBefore || !lateRain || !nov21 || !dec21) throw new Error("Fixture incomplete");
  if (nov21.rainVsUsualMm >= 0 || dec21.rainVsUsualMm >= 0)
    throw new Error("Nov and Dec 2021 are no longer below their usual rain");
  const winter = months.filter((m) => ["12", "01", "02", "03"].includes(m.id.slice(5)));
  const winterMeasured = winter.filter((m) => m.greenness !== null).length;
  const snowInBrowner = browner.filter((m) => m.snowSuspected).length;
  const opened = f.sources.filter((s) => s.accessStatus === "retrieved").length;
  const years = months.length / 12;
  const cells = f.rainCells.features.length;
  const usualMm = Math.round(f.usualSeasonMm);
  const seasonsCompared = f.seasons.length;

  const sciRain = f.excerpts.find((e) => e.id === "gx-SCI-09-001");
  const fao = f.excerpts.find((e) => e.id === "gx-SCI-25-006");
  const faoSource = f.sources.find((s) => s.id === "SCI-25");
  const rainSource = f.sources.find((s) => s.id === "SCI-09");

  const country = f.location.split(",").pop()?.trim() ?? f.location;
  const greennessKey = (m: Month): KeyInfo => ({ kind: "greenness", title: m.label });
  const lowestLayer: Layer = { kind: "greenness", periodId: lowest.periodId };

  const lanes: Lane[] = [
    {
      id: "rain",
      name: "Rain",
      steps: [
        {
          running: `Loading ${String(months.length)} months of rain`,
          done: `Loaded ${String(months.length)} months of rain, 2019 to 2025`,
          start: 3.0,
          end: 5.4,
        },
        {
          running: `Comparing ${String(seasonsCompared)} winters with 1991 to 2020`,
          done: `Compared ${String(seasonsCompared)} winters with 1991 to 2020`,
          start: 5.4,
          end: 7.8,
        },
      ],
      verdict: "possible",
      links: [
        { obs: "browner", relation: "fits" },
        { obs: "dry", relation: "fits" },
      ],
      detail: `The browner months came after a winter whose rain arrived late, then ran through a dry one. Timing alone doesn't show cause.`,
    },
    {
      id: "grazing",
      name: "More grazing",
      steps: [
        {
          running: "Looking for animal counts",
          done: "No animal counts in the case",
          start: 3.4,
          end: 5.8,
        },
        {
          running: "Looking for grazing dates",
          done: "No grazing dates in the case",
          start: 5.8,
          end: 7.8,
        },
      ],
      verdict: "satellite",
      links: [
        { obs: "browner", relation: "fits" },
        { obs: "animals", relation: "gap" },
      ],
      detail:
        "There are no animal counts or grazing dates for this valley in the case, and satellites can't see them.",
    },
    {
      id: "orchards",
      name: "New orchards and fields",
      steps: [
        {
          running: "Looking for land-cover maps",
          done: "Found 1 map, from 2021",
          start: 4.8,
          end: 7.0,
        },
        {
          running: "Looking for a later map",
          done: "No later map in the case",
          start: 7.0,
          end: 8.8,
        },
      ],
      verdict: "unknown",
      links: [{ obs: "landcover", relation: "gap" }],
      detail:
        "There's one land-cover map, from 2021. A later one is needed to see change. Fields and orchards on the valley floor are counted in the greenness.",
    },
    {
      id: "snow",
      name: "Late snow",
      steps: [
        {
          running: "Checking the winter months",
          done: `${String(winterMeasured)} of ${String(winter.length)} winter months could be measured`,
          start: 6.6,
          end: 8.8,
        },
        {
          running: "Checking snow in the browner months",
          done: `Snow flagged in ${String(snowInBrowner)} of ${String(browner.length)}`,
          start: 8.8,
          end: 10.2,
        },
      ],
      verdict: "unknown",
      links: [
        { obs: "winter", relation: "gap" },
        { obs: "browner", relation: "fits" },
      ],
      detail: `Snow and cloud hid too much of the valley in all ${String(winter.length)} winter months, December to March, so none could be measured.`,
    },
    {
      id: "gaps",
      name: "Gaps in the satellite data",
      steps: [
        {
          running: "Counting the months that could be measured",
          done: `${String(measuredMonths.length)} of ${String(months.length)} months measured`,
          start: 6.6,
          end: 9.0,
        },
        {
          running: "Checking how much of the valley was seen",
          done: `At least ${String(minSeenPercent)}% seen in each browner month`,
          start: 9.0,
          end: 11.0,
        },
      ],
      verdict: "nofit",
      links: [{ obs: "browner", relation: "against" }],
      detail: `At least ${String(minSeenPercent)}% of the valley was seen in each of the ${String(browner.length)} browner months.`,
      caveat:
        "Cloud screening was simplified in every month, so some snow or shadow may be left in.",
    },
  ];

  const beats: Beat[] = [
    { at: 0, status: "Planning 5 checks", layer: { kind: "none" }, key: null, reading: "plan" },
    {
      at: 3.0,
      status: `Reading ${String(f.sources.length)} sources and ${String(years)} years of rain`,
      layer: { kind: "rain", values: null },
      key: null,
      reading: "rain",
    },
    {
      at: 4.8,
      status: "Looking at fields and orchards on the valley floor",
      layer: { kind: "cropland", rainOutline: true },
      key: null,
      reading: "fields",
    },
    {
      at: 6.6,
      status: `Reading saved greenness for ${String(measuredMonths.length)} months`,
      layer: { ...lowestLayer, rainOutline: true },
      key: greennessKey(lowest),
      reading: "greenness",
    },
    {
      at: 9.0,
      status: "Checking each explanation against the data",
      layer: lowestLayer,
      key: greennessKey(lowest),
      reading: "check",
    },
    {
      at: 11.0,
      status: "Drafting options and their trade-offs",
      layer: lowestLayer,
      key: greennessKey(lowest),
      reading: "options",
    },
    {
      at: 11.8,
      status: "Outlining a plan for people to review",
      layer: lowestLayer,
      key: greennessKey(lowest),
      reading: "plan",
    },
  ];

  const ring = (() => {
    const g = f.catchment.geometry;
    return ((g.type === "Polygon" ? g.coordinates[0] : g.coordinates[0]?.[0]) ?? []) as [
      number,
      number,
    ][];
  })();
  const centroid: [number, number] = [
    ring.reduce((a, p) => a + p[0], 0) / ring.length,
    ring.reduce((a, p) => a + p[1], 0) / ring.length,
  ];
  const farFromOutlet = ring.reduce((a, p) =>
    (p[0] - f.outlet.lon) ** 2 + (p[1] - f.outlet.lat) ** 2 >
    (a[0] - f.outlet.lon) ** 2 + (a[1] - f.outlet.lat) ** 2
      ? p
      : a,
  );
  const floor = f.places.find((p) => p.role === "settlement");
  const floor2 = f.places.find((p) => p.role !== "settlement") ?? floor;
  const pt = (p: { lon: number; lat: number } | undefined): [number, number] | null =>
    p ? [p.lon, p.lat] : null;

  const observations: Observation[] = [
    {
      id: "browner",
      kind: "seen",
      text: `Browner than usual in all ${String(browner.length)} measured months, May 2022 to Apr 2023. At least ${String(minSeenPercent)}% seen.`,
      source: 1,
      at: pt(floor),
    },
    {
      id: "dry",
      kind: "seen",
      text: `A dry winter, with ${mm(dry.totalMm)} of rain against ${String(usualMm)} mm on average.`,
      source: 2,
      at: centroid,
    },
    {
      id: "landcover",
      kind: "missing",
      text: "One land-cover map, from 2021. No later map to compare.",
      at: pt(floor2),
    },
    {
      id: "winter",
      kind: "missing",
      text: `${String(winterMeasured)} of ${String(winter.length)} winter months could be measured. Snow and cloud hid the rest.`,
      at: [
        farFromOutlet[0] + (centroid[0] - farFromOutlet[0]) * 0.15,
        farFromOutlet[1] + (centroid[1] - farFromOutlet[1]) * 0.15,
      ],
    },
    {
      id: "animals",
      kind: "missing",
      text: "No animal counts or grazing dates in the case.",
      at: null,
    },
  ];

  const options: OptionCard[] = [
    {
      id: "measure",
      title: "Measure on the ground first",
      what: "Survey plant cover in the low, middle and high parts of the valley, and count animals on the shared pastures.",
      tradeoff: "Changes nothing on the land, but any decision waits at least one season.",
      decides: "The villages that share the pastures",
      size: "A small field team for one spring. Not costed yet.",
      addresses: ["grazing", "snow", "orchards"],
    },
    {
      id: "rest",
      title: "Rest some pastures for a season",
      what: "Only if the survey shows less plant cover where grazing is heaviest.",
      tradeoff:
        "Less grazing for herders that season, and it won't help if dry years are the cause.",
      decides: "Herders and their villages, with the local authorities",
      size: "No cost to Siterra. A real cost to herders, not estimated.",
      addresses: ["grazing"],
    },
    {
      id: "dry-years",
      title: "Agree a plan for dry years",
      what: "Agree in advance how grazing changes after a dry winter.",
      tradeoff: "Costs little until a dry year comes, but needs agreement between villages.",
      decides: "The villages that share the pastures",
      size: "A few meetings. Not costed yet.",
      addresses: ["rain"],
    },
  ];

  const plan: PlanStep[] = [
    {
      what: "Share this brief and ask the villages if they want a ground survey",
      who: "The program team",
      when: "First",
    },
    {
      what: "Survey plant cover and count animals",
      who: "A field team, with the herders' agreement",
      when: "Next spring",
    },
    {
      what: "Run the assessment again with the survey results",
      who: "Siterra, checked by a person",
      when: "After the survey",
    },
    {
      what: "Decide together whether to try any option",
      who: "The villages",
      when: "After the results",
    },
  ];

  const sheets: Sheet[] = [
    { id: "rain", n: "01", label: "Did it rain less than usual?", liftAt: 0.3, downAt: 3.0 },
    {
      id: "fields",
      n: "02",
      label: "Where are the fields and orchards?",
      liftAt: 1.0,
      downAt: 4.8,
    },
    { id: "greenness", n: "03", label: "Greener or browner than usual?", liftAt: 1.7, downAt: 6.6 },
  ];

  const segments: Segment[] = [
    {
      text: `All ${String(browner.length)} measured months from May 2022 to April 2023 were a little browner than usual.`,
      cite: [1, 3],
      claim: "browner",
    },
    { text: " " },
    {
      text: `That included a dry winter, with ${mm(dry.totalMm)} of rain against ${String(usualMm)} mm on average.`,
      cite: [2],
      claim: "dryWinter",
    },
  ];
  const meaning = "A dry spell. Not evidence about grazing.";

  const chips: SourceChip[] = [
    {
      n: 1,
      label: "Satellite greenness",
      title: "Sentinel-2 greenness, every month from 2019 to 2025",
      body: `Each month is compared with the same month in the other years. The lowest was ${lowest.label}, ${ndvi(lowest.greenness ?? 0)} on the vegetation index (NDVI).`,
      where: "Copernicus Sentinel-2, worked out by Siterra",
      note: "Saved result from the case, not a live run.",
    },
    {
      n: 2,
      label: "Rain estimates",
      title: rainSource?.title ?? "CHIRPS v3",
      ...(sciRain ? { quote: sciRain.excerpt } : {}),
      where: "Climate Hazards Center, UC Santa Barbara",
      note: `Estimates for squares of about 5 km (${String(cells)} touch the valley), not rain gauge readings.`,
      ...(rainSource?.url ? { url: rainSource.url } : {}),
    },
    {
      n: 3,
      label: "FAO crop report",
      title: `FAO GIEWS ${(faoSource?.title ?? "country brief").split(" (")[0] ?? ""}`,
      ...(fao ? { quote: fao.excerpt } : {}),
      where: `${fao?.attribution ?? faoSource?.publisher ?? "FAO"}${fao?.page ? `, page ${String(fao.page)}` : ""}`,
      note: `${country}, national. It's about the whole country, not this valley. Quote picked by a model and not yet checked by a person.`,
      ...(faoSource?.url ? { url: faoSource.url } : {}),
    },
  ];

  const claims: Record<ClaimId, ClaimView> = {
    browner: { shot: "valley-floor", layer: lowestLayer, key: greennessKey(lowest) },
    dryWinter: {
      shot: "rain-grid",
      layer: { kind: "rain", values: seasonCells(f, 2022) },
      key: { kind: "rain", title: "Nov 2022 to Apr 2023" },
    },
  };

  const headline = "Can't tell yet if grazing is changing the pastures.";
  const limit = "Satellite data can't count animals.";
  const summary = [
    headline,
    limit,
    segments.map((s) => s.text).join(""),
    meaning,
    "Demo data from the Siterra prototype. Scripted from saved records; no AI model ran.",
  ].join("\n\n");

  return {
    question: f.caseQuestion,
    place: {
      name: f.placeName,
      location: f.location,
      area: `${f.areaLabel}, ${f.areaKm2.toFixed(1)} km²`,
    },
    period: `${months[0]?.id.slice(0, 4) ?? ""} to ${months[months.length - 1]?.id.slice(0, 4) ?? ""}`,
    compare: {
      before: { periodId: beforeLowest.periodId, label: beforeLowest.label },
      after: { periodId: lowest.periodId, label: lowest.label },
    },
    beats,
    sheets,
    lanes,
    endsAt: 12.8,
    sourcesLine: `${String(opened)} of ${String(f.sources.length)} sources opened. ${String(f.sources.length - opened)} couldn't be opened, so they weren't used.`,
    headline,
    limit,
    segments,
    meaning,
    chips,
    claims,
    next: [
      "Count the animals on the shared pastures, and when they graze each one",
      "Measure plant cover on the ground in the low, middle and high parts of the valley",
      "Map the orchards and fields on the valley floor, to compare with 2021",
    ],
    nextNote: "A plan only. Nothing has been arranged with the villages.",
    observations,
    options,
    optionsNote:
      "Options to discuss, not advice. People on the ground decide. Nothing has been arranged with anyone.",
    plan,
    planNote: "An outline for review. Nothing is scheduled, sent or paid for.",
    method: [
      "Specialist agents each do one job: investigate, test every explanation, draft options, size the resources and outline a plan. Each has its own tools and an independent check, and people review the result.",
      "Greenness is the vegetation index (NDVI) from Sentinel-2. Each month is compared with the same month in the other years, 2019 to 2025.",
      `Rain is CHIRPS v3.0, estimated for squares of about 5 km and compared with 1991 to 2020 (${String(f.referenceSeasons)} winters).`,
      `A month counts only if at least ${String(Math.round(f.coverageThreshold * 100))}% of the valley was seen.`,
      "No cropland mask is applied, so fields and orchards are included.",
      "The steps on this screen were scripted from saved records. No AI model ran.",
    ],
    summary,
    numbers: {
      months: months.length,
      measured: measuredMonths.length,
      browner: browner.length,
      minSeenPercent,
      lowest,
      dry: { label: dry.label, totalMm: dry.totalMm },
      usualMm,
      lateRain,
      sources: f.sources.length,
      opened,
      winterMonths: winter.length,
      winterMeasured,
      snowInBrowner,
      rainCells: cells,
      seasonsCompared,
    },
  };
}

/** The beat running at a time on the run's clock. */
export function beatAt(beats: Beat[], t: number): Beat | undefined {
  return [...beats].reverse().find((b) => t >= b.at);
}

export type StepState = "waiting" | "running" | "done";

export function stepState(s: Step, t: number): StepState {
  return t >= s.end ? "done" : t >= s.start ? "running" : "waiting";
}

export function laneDone(l: Lane, t: number): boolean {
  return l.steps.every((s) => t >= s.end);
}
