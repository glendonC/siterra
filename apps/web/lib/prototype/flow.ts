// The five-stage analysis flow on /prototype: Scope & Baseline, Evidence, Hypothesis Testing, Interventions &
// Precedents, Field Verification. The High Atlas rangeland case is the one loaded Region Pack; the other packs
// plug into the same stages and are shown as not loaded. Every number comes from the case fixture and the
// story built from it, plus the 26-season MODIS MOD13Q1 long record. The run is scripted: no model is called,
// and every finding is marked as fixture.

import type { Fixture } from "./fixture";
import { DRIEST_YEARS, RESTREND_STRATA, type StratumRecord } from "./restrend-data";
import { ndvi, type LaneId, type Story, type Verdict } from "./story";

export type StageId = "scope" | "evidence" | "hypotheses" | "interventions" | "field";
export const STAGES: readonly StageId[] = [
  "scope",
  "evidence",
  "hypotheses",
  "interventions",
  "field",
];

export type MapViewId = "overview" | "oblique" | "stack" | "timerecord" | "split" | "viewpoint";
export const MAP_VIEWS: readonly { id: MapViewId; label: string; keyHint: string }[] = [
  { id: "overview", label: "Overview", keyHint: "F" },
  { id: "oblique", label: "Oblique", keyHint: "O" },
  { id: "stack", label: "Exploded Stack", keyHint: "E" },
  { id: "timerecord", label: "Time Record", keyHint: "T" },
  { id: "split", label: "Split Comparison", keyHint: "S" },
  { id: "viewpoint", label: "Viewpoint 50 m", keyHint: "V" },
];

export type FormalVerdict = "consistent" | "contradicted" | "cannot";

export const FORMAL: Record<Verdict, FormalVerdict> = {
  possible: "consistent",
  nofit: "contradicted",
  satellite: "cannot",
  unknown: "cannot",
};

export const FORMAL_TEXT: Record<FormalVerdict, string> = {
  consistent: "Consistent",
  contradicted: "Contradicted",
  cannot: "Cannot Be Assessed",
};

/** How one observation bears on one hypothesis. */
export const RELATION: Record<"fits" | "against" | "gap", string> = {
  fits: "Agrees",
  against: "Disagrees",
  gap: "No Data",
};

/** A coverage boundary: what is missing, then what is required. */
export interface Coverage {
  badge: "required" | "notLoaded";
  detail: string;
}

export interface RegionPack {
  id: string;
  name: string;
  theme: string;
  loaded: boolean;
  coverage?: Coverage;
}

export interface LoadedPack extends RegionPack {
  loaded: true;
  area: string;
  boundary: string;
  layers: { name: string; span: string }[];
  baseline: { name: string; span: string }[];
  checks: { name: string; rule: string; applied: boolean }[];
}

export interface Hypothesis {
  id: LaneId;
  name: string;
  verdict: FormalVerdict;
  detail: string;
}

export interface ExplanationBranchNode {
  id: string;
  label: string;
  at: [number, number] | null;
  lockedPrediction: string;
  revision: string;
  status: FormalVerdict;
  outcomeTitle: string;
  outcomeDetail: string;
  qualifier: string;
  separatingCheck: string;
}

export interface TraceRecord {
  id: string;
  stepTitle: string;
  actor: string;
  promptOrTool: string;
  durationMs: number;
  validatorRule: string;
  status: "Accepted" | "Rejected" | "Checked";
  excerptOrPayload: string;
}

export interface LayerSheetSpec {
  id: string;
  n: string;
  title: string;
  span: string;
  resolution: string;
  status: "Real Data" | "Staged";
  liftAt: number;
  downAt: number;
}

export interface Measure {
  id: string;
  name: string;
  text?: string;
  cite?: number[];
  coverage?: Coverage;
}

export interface Question {
  text: string;
  runs: boolean;
  coverage?: Coverage;
}

export interface AgentStep {
  id: string;
  title: string;
  /** The model this step calls in the product (ADR-0041); null for a deterministic tool. */
  model: string | null;
  check: string;
  /** Seconds on the run's clock. */
  start: number;
  end: number;
  rejected?: string[];
  /** Shown but not run in this prototype, with the reason. */
  skipped?: string;
}

export interface Pin {
  id: string;
  at: [number, number];
  label: string;
  sub: string;
  say: string;
  cite: number[];
  coverage?: Coverage;
  kind: "seen" | "missing";
  bears: { lane: LaneId; name: string; verdict: FormalVerdict; relation: string }[];
  stem: number;
}

export interface Source {
  n: number;
  label: string;
  title: string;
  quote?: string;
  body?: string;
  where: string;
  note: string;
}

export interface TimeStop {
  id: string;
  year: string;
  kind: "missing" | "greenness" | "photo";
  periodId?: string;
  layerName: string;
  note: string;
  coverage?: Coverage;
  rain?: string;
}

export interface GroundCheck {
  id: string;
  at: [number, number] | null;
  label: string;
  short: string;
  what: string;
  distanceLabel?: string;
  elevationDelta?: string;
  elevationM?: string;
  separates?: string;
  profilePts?: readonly number[];
}

export interface FlowOption {
  id: string;
  title: string;
  group: "precedent" | "none";
  evidence: string;
  decides: string;
  footprintBand?: "low" | "mid" | "high" | "unmapped";
  precedentMeta?: {
    study: string;
    window: string;
    scope: string;
    excerpt: string;
    badge: string;
  };
}

export interface BriefText {
  lang: "en" | "fr";
  title: string;
  status: string;
  meta: { key: string; value: string }[];
  sections: { head: string; lines: string[] }[];
  sources: string[];
  footer: string;
}

export interface Flow {
  placeTitle: string;
  pack: LoadedPack;
  otherPacks: RegionPack[];
  placeStarters: { text: string; query: string }[];
  analysis: { name: string; detail: string; window: string };
  questions: Question[];
  steps: AgentStep[];
  sheetLabels: Record<string, string>;
  layerStack: LayerSheetSpec[];
  restrendStrata: readonly StratumRecord[];
  driestYears: readonly number[];
  branchNodes: ExplanationBranchNode[];
  traceRecords: TraceRecord[];
  pastureCoverage: Coverage;
  sources: Source[];
  season: string;
  measures: Measure[];
  hypotheses: Hypothesis[];
  scopeNote: string;
  pins: Pin[];
  timeStops: TimeStop[];
  groundChecks: GroundCheck[];
  options: FlowOption[];
  optionsNote: string;
  brief: BriefText[];
  /** The catchment edge as a few draggable points. */
  edge: [number, number][];
}

type LngLat = [number, number];

export function ringOf(f: Pick<Fixture, "catchment">): LngLat[] {
  const g = f.catchment.geometry;
  return ((g.type === "Polygon" ? g.coordinates[0] : g.coordinates[0]?.[0]) ?? []) as LngLat[];
}

/** Ray casting on lon/lat; fine at valley scale. */
export function inside(p: LngLat, ring: LngLat[]): boolean {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if (!a || !b) continue;
    if (
      a[1] > p[1] !== b[1] > p[1] &&
      p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      hit = !hit;
  }
  return hit;
}

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");

/** "Aït Bouguemez valley" to "Aït Bouguemez Valley". */
export const titleCase = (s: string) =>
  s.replace(/(^|\s)(\p{Ll})/gu, (_, a: string, b: string) => a + b.toUpperCase());

/** True when typed words name the case's place, one of its villages or its wider location. */
export function matchPlace(text: string, f: Fixture): boolean {
  const q = norm(text);
  if (q.length < 3) return false;
  const names = [
    f.placeName,
    f.placeName.replace(/\s+valley$/i, ""),
    ...f.places.filter((p) => p.role.startsWith("settlement")).map((p) => p.name),
    ...f.location.split(",").map((s) => s.trim()),
  ].map(norm);
  return names.some((n) => n.length >= 3 && (n.includes(q) || q.includes(n)));
}

const PACK_WORDS: Record<string, readonly string[]> = {
  "urban-heat": ["heat", "urban", "city", "thermal", "canopy"],
  watersheds: ["watershed", "streamflow", "river", "flood", "water"],
  wildfire: ["wildfire", "fire", "burn"],
};

export type PlaceResult =
  { kind: "match" } | { kind: "pack"; pack: RegionPack } | { kind: "outside"; coverage: Coverage };

/** What a typed place or theme resolves to: the loaded pack, a pack that is not loaded, or no coverage. */
export function resolvePlace(
  text: string,
  f: Fixture,
  flow: Pick<Flow, "otherPacks">,
): PlaceResult {
  const words = text.toLowerCase().split(/[^\p{L}]+/u);
  const pack = flow.otherPacks.find((p) =>
    (PACK_WORDS[p.id] ?? []).some((w) => words.some((x) => x.startsWith(w))),
  );
  if (pack) return { kind: "pack", pack };
  if (matchPlace(text, f)) return { kind: "match" };
  const name = text.trim().replace(/\s+/g, " ").slice(0, 40);
  return {
    kind: "outside",
    coverage: {
      badge: "required",
      detail: `No loaded Region Pack covers ${name ? `"${name}"` : "this place"}. Select a supported region or attach the required dataset.`,
    },
  };
}

export function buildFlow(f: Fixture, s: Story): Flow {
  const ring = ringOf(f);
  const n = s.numbers;
  const village = f.places.find((p) => p.role === "settlement");
  const pct = Math.round(f.coverageThreshold * 100);
  const usual = n.usualMm;
  const dryMm = Math.round(n.dry.totalMm);
  const season = n.dry.label;
  const first = f.months[0]?.id.slice(0, 4) ?? "";
  const last = f.months[f.months.length - 1]?.id.slice(0, 4) ?? "";
  const record = `${first} to ${last}`;
  const lowestValue = ndvi(n.lowest.greenness ?? 0);
  const lastSeason = f.seasons[f.seasons.length - 1];
  const placeTitle = titleCase(f.placeName);
  const area = `${f.areaKm2.toFixed(1)} km²`;
  const opened = n.opened;
  const minSeen = n.minSeenPercent;

  const names: Record<LaneId, string> = {
    rain: "Low Rainfall",
    grazing: "Grazing Pressure",
    orchards: "Cropland Expansion",
    snow: "Late Snow",
    gaps: "Data Gaps",
  };

  const details: Record<LaneId, string> = {
    rain: `Winter rainfall was ${String(dryMm)} mm against a ${String(usual)} mm average. Greenness was below the record in all ${String(n.browner)} measured months, May 2022 to Apr 2023.`,
    grazing:
      "No livestock counts or grazing dates are loaded. Satellite greenness does not separate grazing from other causes.",
    orchards:
      "One land-cover map is loaded, ESA WorldCover 2021. Change requires a second, later map.",
    snow: `${String(n.winterMeasured)} of ${String(n.winterMonths)} winter months passed the ${String(pct)}% coverage threshold. Snow timing is unmeasured.`,
    gaps: `At least ${String(minSeen)}% of the catchment was observed in each of the ${String(n.browner)} months. Cloud screening was simplified; some snow or shadow may remain.`,
  };

  const hypotheses: Hypothesis[] = s.lanes.map((l) => ({
    id: l.id,
    name: names[l.id],
    verdict: FORMAL[l.verdict],
    detail: details[l.id],
  }));

  const snowCoverage: Coverage = {
    badge: "required",
    detail: `${String(n.winterMeasured)} of ${String(n.winterMonths)} winter months passed the ${String(pct)}% coverage threshold. A dedicated snow-cover dataset is required.`,
  };
  const greenUpCoverage: Coverage = {
    badge: "required",
    detail:
      "This pack holds monthly greenness composites, too coarse for green-up dates. A 5 to 10 day greenness series is required.",
  };
  const livestockCoverage: Coverage = {
    badge: "notLoaded",
    detail:
      "Livestock counts and grazing dates are not in this Region Pack. Herder-reported counts or a field census are required.",
  };
  const croplandCoverage: Coverage = {
    badge: "required",
    detail:
      "One land-cover map is loaded, ESA WorldCover 2021. A second map from a later year is required.",
  };
  const pastureCoverage: Coverage = {
    badge: "required",
    detail:
      "No digital agdal or pasture boundary exists in the case corpus. Mapping with the local association is required.",
  };

  const pack: LoadedPack = {
    id: "high-atlas-rangelands",
    name: "High Atlas Rangelands",
    theme: "Rangeland Greenness",
    loaded: true,
    area: `${placeTitle}, ${area}`,
    boundary: `${f.areaLabel}. Hydrological extent, not a pasture, agdal or management boundary.`,
    layers: [
      { name: "MODIS MOD13Q1 NDVI", span: "26 springs, 2000 to 2025, 250 m" },
      { name: "MODIS MOD10A1 Snow", span: "300 months, 2001 to 2025, 500 m" },
      { name: "CHIRPS v3.0 Rainfall", span: `1991 to 2025, ${String(n.rainCells)} cells` },
      { name: "Sentinel-2 NDVI", span: `Monthly, ${record}, 10 m` },
      { name: "Copernicus DEM", span: "30 m relief, 3 elevation bands" },
      { name: "ESA WorldCover", span: "2021 cropland hatch" },
    ],
    baseline: [
      { name: "MODIS Long Record", span: "2000 to 2025, 26 spring seasons" },
      { name: "Sentinel-2 Departure", span: `${record}, ${String(n.months)} months` },
      { name: "CHIRPS Reference", span: `1991 to 2020, ${String(f.referenceSeasons)} winters` },
    ],
    checks: [
      {
        name: "Coverage Threshold",
        rule: `${String(pct)}% of the catchment per month`,
        applied: true,
      },
      {
        name: "Pre-Registration Lock",
        rule: "Predictions committed before scoring",
        applied: true,
      },
      { name: "Excerpt Match", rule: "Quote found on the cited page", applied: true },
      { name: "Numeric Provenance", rule: "Every number traced to a bundle", applied: true },
      { name: "Claim Wording", rule: "Forecast and causal wording blocked", applied: true },
    ],
  };

  const otherPacks: RegionPack[] = [
    {
      id: "watersheds",
      name: "Watersheds",
      theme: "Streamflow",
      loaded: false,
      coverage: {
        badge: "notLoaded",
        detail:
          "Watershed analysis requires streamflow and land-use layers not loaded in this workspace. Select a supported region or attach the required dataset.",
      },
    },
    {
      id: "wildfire",
      name: "Wildfire Corridors",
      theme: "Burned Area",
      loaded: false,
      coverage: {
        badge: "notLoaded",
        detail:
          "Wildfire corridor analysis requires burned-area and fuel layers not loaded in this workspace. Select a supported region or attach the required dataset.",
      },
    },
    {
      id: "urban-heat",
      name: "Urban Heat",
      theme: "Heat Island",
      loaded: false,
      coverage: {
        badge: "notLoaded",
        detail:
          "Urban heat-island analysis requires thermal and canopy layers not loaded in this workspace. Select a supported region or attach the required dataset.",
      },
    },
  ];

  const questions: Question[] = [
    { text: "Baseline Comparison", runs: true },
    { text: "Green-Up Timing", runs: false, coverage: greenUpCoverage },
    { text: "Snow Cover", runs: false, coverage: snowCoverage },
    { text: "Livestock Pressure", runs: false, coverage: livestockCoverage },
  ];

  const steps: AgentStep[] = [
    {
      id: "plan",
      title: "Plan Analysis",
      model: "muse-spark-1.3",
      check: `${String(s.lanes.length)} hypothesis tests planned. Plan matches the task schema.`,
      start: 0,
      end: 1.6,
    },
    {
      id: "read",
      title: "Read Sources",
      model: "muse-spark-1.3",
      check: `${String(opened)} of ${String(n.sources)} sources opened. Cited excerpts matched on their pages.`,
      start: 1.6,
      end: 4.2,
    },
    {
      id: "measure",
      title: "Measure Layers",
      model: null,
      check: `26 MODIS springs (2000 to 2025) and ${String(n.measured)} of ${String(n.months)} Sentinel-2 months loaded.`,
      start: 3.0,
      end: 7.8,
    },
    {
      id: "test",
      title: "Test Hypotheses",
      model: "muse-spark-1.3",
      check: "Predictions committed at revision 1 before host code scored each branch.",
      start: 7.8,
      end: 10.2,
      rejected: ["Expected Decline", "Data Gaps"],
    },
    {
      id: "second",
      title: "Second Reader",
      model: "Muse Glimmer 30B",
      check: "",
      start: 10.2,
      end: 10.2,
      skipped: "Runs on a local machine only.",
    },
    {
      id: "draft",
      title: "Draft Brief",
      model: "muse-spark-1.3",
      check: "Forecast and causal wording blocked.",
      start: 10.2,
      end: s.endsAt,
    },
  ];

  const layerStack: LayerSheetSpec[] = [
    {
      id: "modis_ndvi",
      n: "01",
      title: "MODIS Greenness 2000 to 2025",
      span: "26 spring seasons, March to June",
      resolution: "250 m · 8,094 pixels",
      status: "Real Data",
      liftAt: 0.2,
      downAt: 2.8,
    },
    {
      id: "modis_snow",
      n: "02",
      title: "MODIS Snow 2001 to 2025",
      span: "300 months by elevation band",
      resolution: "500 m · NDSI 0.4",
      status: "Staged",
      liftAt: 0.9,
      downAt: 4.4,
    },
    {
      id: "chirps_rain",
      n: "03",
      title: "CHIRPS Rainfall 1991 to 2025",
      span: "34 wet seasons, Sep to May",
      resolution: "5 km · 33 cells",
      status: "Real Data",
      liftAt: 1.6,
      downAt: 6.0,
    },
    {
      id: "s2_ndvi",
      n: "04",
      title: "Sentinel-2 NDVI 2019 to 2025",
      span: "56 of 84 monthly departures",
      resolution: "10 m analysis grid",
      status: "Real Data",
      liftAt: 2.3,
      downAt: 7.6,
    },
    {
      id: "dem_strata",
      n: "05",
      title: "Copernicus DEM 30 m",
      span: "3 elevation bands, 5 aspect classes",
      resolution: "30 m · WorldCover 2021",
      status: "Real Data",
      liftAt: 3.0,
      downAt: 9.2,
    },
  ];

  const chip = (k: number) => s.chips.find((c) => c.n === k);
  const sources: Source[] = [
    {
      n: 1,
      label: "MODIS & Sentinel-2 NDVI",
      title: `MODIS MOD13Q1 (2000 to 2025) and Sentinel-2 L2A (${record})`,
      body: `26 spring seasons in 3 elevation bands (+0.01 NDVI per decade catchment-wide). Lowest monthly departure: ${n.lowest.label}, NDVI ${lowestValue}.`,
      where: "NASA LP DAAC & Copernicus Sentinel-2. Stored in the Region Pack.",
      note: "Precomputed bundles restrend_long_record and ndvi_departure.",
    },
    {
      n: 2,
      label: "CHIRPS v3.0",
      title: chip(2)?.title ?? "CHIRPS v3.0",
      ...(chip(2)?.quote ? { quote: chip(2)?.quote } : {}),
      where: "Climate Hazards Center, UC Santa Barbara.",
      note: `Satellite and gauge estimates on 0.05 degree cells; ${String(n.rainCells)} cells intersect the catchment.`,
    },
    {
      n: 3,
      label: "FAO GIEWS",
      title: chip(3)?.title ?? "FAO GIEWS country brief",
      ...(chip(3)?.quote ? { quote: chip(3)?.quote } : {}),
      where: chip(3)?.where ?? "FAO",
      note: "National scope, Morocco. Excerpt selected by a model; not reviewed by a person.",
    },
  ];

  const measures: Measure[] = [
    {
      id: "longrecord",
      name: "26-Season Trend",
      text: "Spring greenness rose in all 3 elevation bands, 2000 to 2025 (+0.01 NDVI per decade in the catchment; +0.02 on level ground).",
      cite: [1],
    },
    {
      id: "rainfit",
      name: "Rainfall Fit",
      text: "Greenness barely tracks Sep to May rainfall (R squared 0.04 in the catchment, 0.01 to 0.08 across strata; precondition not met).",
      cite: [1, 2],
    },
    {
      id: "greenness",
      name: "2022/23 Departure",
      text: `Below the ${record} monthly median in ${String(n.browner)} of ${String(n.browner)} measured months, May 2022 to Apr 2023.`,
      cite: [1],
    },
    {
      id: "rain",
      name: "Winter Rainfall",
      text: `${String(dryMm)} mm in Nov 2022 to Apr 2023 after 650 mm in 2021/22. Average ${String(usual)} mm, 1991 to 2020.`,
      cite: [2],
    },
    { id: "greenup", name: "Green-Up Timing", coverage: greenUpCoverage },
    { id: "snow", name: "Snow Cover", coverage: snowCoverage },
  ];

  const words: Record<string, Omit<Pin, "id" | "at" | "kind" | "bears" | "stem">> = {
    browner: {
      label: "Expected Decline",
      sub: "Contradicted: Greener In Every Band",
      say: `Locked prediction expected spring greenness to fall from 2000 to 2025. Instead, MODIS March to June NDVI rose in all 3 elevation bands (+0.01 per decade). In the shorter ${record} monthly series, ${String(n.browner)} months in 2022/23 sat below median.`,
      cite: [1, 3],
    },
    dry: {
      label: "Low Rainfall",
      sub: `${String(dryMm)} mm after 650 mm`,
      say: `Wet season 2021/22 before the low months was above normal at 650 mm; winter ${season} fell to ${String(dryMm)} mm against a ${String(usual)} mm mean. Across 26 springs, the 4 driest years (2001, 2016, 2023, 2024) did not brown the bands.`,
      cite: [2],
    },
    winter: {
      label: "Late Snow",
      sub: `${String(n.winterMeasured)} of ${String(n.winterMonths)} winter months`,
      say: "Snow and cloud masked every Sentinel-2 winter month, December to March, in the upper band above 2,815 m.",
      cite: [1],
      coverage: snowCoverage,
    },
    landcover: {
      label: "Fields And Orchards",
      sub: "Level ground +0.02 per decade",
      say: "Level ground below 5 degrees greened fastest (+0.02 NDVI per decade), where irrigated fields and orchards sit inside the unmasked values.",
      cite: [1],
      coverage: croplandCoverage,
    },
  };
  const stems: Record<string, number> = { browner: 68, dry: 128, winter: 92, landcover: 108 };

  const pins: Pin[] = s.observations.flatMap((o) => {
    const w = words[o.id];
    if (!o.at || !w) return [];
    const bears = s.lanes.flatMap((l) =>
      l.links
        .filter((k) => k.obs === o.id)
        .map((k) => ({
          lane: l.id,
          name: names[l.id],
          verdict: FORMAL[l.verdict],
          relation: RELATION[k.relation],
        })),
    );
    return [{ id: o.id, at: o.at, kind: o.kind, bears, stem: stems[o.id] ?? 80, ...w }];
  });

  const farFromOutlet = ring.reduce((a, p) =>
    (p[0] - f.outlet.lon) ** 2 + (p[1] - f.outlet.lat) ** 2 >
    (a[0] - f.outlet.lon) ** 2 + (a[1] - f.outlet.lat) ** 2
      ? p
      : a,
  );
  const centroid: LngLat = [
    ring.reduce((a, p) => a + p[0], 0) / ring.length,
    ring.reduce((a, p) => a + p[1], 0) / ring.length,
  ];
  const toward = (a: LngLat, b: LngLat, k: number): LngLat => [
    a[0] + (b[0] - a[0]) * k,
    a[1] + (b[1] - a[1]) * k,
  ];
  const outlet: LngLat = [f.outlet.lon, f.outlet.lat];

  const branchNodes: ExplanationBranchNode[] = [
    {
      id: "expected_decline",
      label: "Expected Decline",
      at: centroid,
      lockedPrediction: "Spring NDVI slope (2000 to 2025) is negative in the shared pasture bands.",
      revision: "Revision 1 · Committed Before Data",
      status: "contradicted",
      outcomeTitle: "Contradicted: Greener In Every Band",
      outcomeDetail:
        "MODIS March to June NDVI rose in all 3 elevation bands (+0.01 per decade catchment, +0.01 low, +0.01 middle, +0.01 high).",
      qualifier:
        "Greener is not better forage. Shrubs, unpalatable species or orchards can raise greenness.",
      separatingCheck: "Botanical Quadrat Survey",
    },
    {
      id: "low_rainfall",
      label: "Low Rainfall",
      at: toward(outlet, centroid, 0.55),
      lockedPrediction: "Wet season 2021/22 before the May 2022 low months is below normal.",
      revision: "Revision 1 · Committed Before Data",
      status: "contradicted",
      outcomeTitle: "Contradicted On 2021/22 Pre-Condition",
      outcomeDetail:
        "Season 2021/22 was above normal at 650 mm (mean 562 mm), and the 4 driest years (369 to 421 mm) did not brown the bands.",
      qualifier: "Winter 2022/23 was dry at 349 mm, consistent with the late-2022 monthly dip.",
      separatingCheck: "Soil Moisture Paired Plots",
    },
    {
      id: "late_snow",
      label: "Late Snow",
      at: toward(centroid, farFromOutlet, 0.72),
      lockedPrediction: "Upper band (> 2,815 m) spring green-up tracks March snow-cover fraction.",
      revision: "Revision 1 · Committed Before Data",
      status: "cannot",
      outcomeTitle: "Cannot Be Assessed: Winter Optical Gap",
      outcomeDetail: `${String(n.winterMeasured)} of ${String(n.winterMonths)} Sentinel-2 winter months passed the ${String(pct)}% coverage threshold.`,
      qualifier: "Staged MODIS MOD10A1 snow series (300 months) awaits catalog extension.",
      separatingCheck: "Upper Band Snowmelt Transect",
    },
    {
      id: "fields_orchards",
      label: "Fields And Orchards",
      at: village ? ([village.lon, village.lat] as LngLat) : toward(outlet, centroid, 0.3),
      lockedPrediction: "Valley-floor orchard expansion accounts for the catchment greening slope.",
      revision: "Revision 1 · Committed Before Data",
      status: "cannot",
      outcomeTitle: "Cannot Be Assessed: Single Land-Cover Map",
      outcomeDetail:
        "Level ground (< 5 deg) greened fastest at +0.02 NDVI per decade, but only one land-cover map (ESA WorldCover 2021) is loaded.",
      qualifier: "A second land-cover map from a different year is required to measure expansion.",
      separatingCheck: "Valley Floor Cropland Remapping",
    },
    {
      id: "grazing",
      label: "Grazing Pressure",
      at: null,
      lockedPrediction: "Forage cover declines along grazing intensity gradients near summer azib.",
      revision: "Revision 1 · Committed Before Data",
      status: "cannot",
      outcomeTitle: "Cannot Be Assessed: No Herd Or Pasture Records",
      outcomeDetail:
        "No livestock counts, opening dates or digital agdal boundaries exist in the case records.",
      qualifier: "Satellite NDVI at 10 m to 250 m cannot separate palatable forage from shrubs.",
      separatingCheck: "Paired Exclosure & Herd Census",
    },
  ];

  const traceRecords: TraceRecord[] = [
    {
      id: "tr-01",
      stepTitle: "Plan Analysis",
      actor: "Meta muse-spark-1.3 (plan@3)",
      promptOrTool: "propose_plan -> explanation_branches + observation_analysis",
      durationMs: 1420,
      validatorRule: "Schema strict subset; out-of-scope group check SA-10 passed",
      status: "Accepted",
      excerptOrPayload:
        '{"tasks":["source_research","observation_analysis","explanation_branches","intervention_feasibility","brief_package"]}',
    },
    {
      id: "tr-02",
      stepTitle: "Commit Predictions",
      actor: "Meta muse-spark-1.3 (explanation_branches@1)",
      promptOrTool: "propose_predictions (revision 1, before any bundle read)",
      durationMs: 1890,
      validatorRule: "DF-07 & TR-07: committed at case revision 6 before compare_series",
      status: "Accepted",
      excerptOrPayload:
        '{"branch":"low_rainfall","test":{"kind":"season_category","seasonId":"season_2021-11_2022-04","expected":"below_normal"}}',
    },
    {
      id: "tr-03",
      stepTitle: "Load Long Record & Score",
      actor: "Host Code (merge@1, no model)",
      promptOrTool: "restrend_long_record 1.0.0 + season_summary 1.0.0",
      durationMs: 48,
      validatorRule: "DF-08 deterministic scoring: 26 seasons, 9 strata, R2 = 0.04",
      status: "Checked",
      excerptOrPayload:
        '{"catchment_unadjusted":"+0.0091/dec","status":"precondition_not_met","season_2021_22":"650.4 mm (above_normal -> outcome: not_met)"}',
    },
    {
      id: "tr-04",
      stepTitle: "Read Corpus Excerpts",
      actor: "Meta muse-spark-1.3 (source_research@2)",
      promptOrTool: "read_source (SCI-09, SCI-20, SCI-25, SCI-29)",
      durationMs: 2150,
      validatorRule: "Exact substring locator check on stored corpus pages",
      status: "Accepted",
      excerptOrPayload:
        "SCI-29 (Wessels et al. 2012): 30 to 40% cover loss required before a slope became statistically detectable in simulations.",
    },
    {
      id: "tr-05",
      stepTitle: "Candidate Claim Filter",
      actor: "Host Validator (VT-20, ADR-0023)",
      promptOrTool: "validate_claims",
      durationMs: 12,
      validatorRule: "Rejected causal phrase and un-cited year",
      status: "Rejected",
      excerptOrPayload:
        "Rejected draft item: causal wording blocked by ADR-0023; only stored bundle measurements committed.",
    },
    {
      id: "tr-06",
      stepTitle: "Minimum Field Plan",
      actor: "Host Code (DF-09 minimum test cover)",
      promptOrTool: "compute_field_plan (BranchMerge.fieldPlan)",
      durationMs: 19,
      validatorRule: "Every open explanation pair separated by at least 1 field check",
      status: "Checked",
      excerptOrPayload:
        '{"checks":["plot_survey_bands","cropland_remap_2021","herd_census_agdal"],"unseparated":[]}',
    },
  ];

  const landsat = (year: string): Coverage => ({
    badge: "notLoaded",
    detail: `No ${year} imagery is loaded in this Region Pack. Landsat archive scenes for ${year} are required.`,
  });
  const timeStops: TimeStop[] = [
    {
      id: "1985",
      year: "1985",
      kind: "missing",
      layerName: "Not Loaded",
      note: "",
      coverage: landsat("1985"),
    },
    {
      id: "2005",
      year: "2005",
      kind: "missing",
      layerName: "Not Loaded",
      note: "",
      coverage: landsat("2005"),
    },
    {
      id: n.lowest.id,
      year: n.lowest.label,
      kind: "greenness",
      periodId: n.lowest.periodId,
      layerName: "NDVI Departure",
      note: `${n.lowest.label} NDVI departure against the same month in other years, ${record}.`,
      rain: `Winter ${season} rainfall ${String(dryMm)} mm. Average ${String(usual)} mm.`,
    },
    {
      id: "today",
      year: "Summer 2025",
      kind: "photo",
      layerName: "True Color",
      note: "Sentinel-2 true color, summer 2025. Display layer; no values are read from it.",
      ...(lastSeason
        ? {
            rain: `Winter ${lastSeason.label} rainfall ${String(Math.round(lastSeason.totalMm))} mm. Average ${String(usual)} mm.`,
          }
        : {}),
    },
  ];

  const groundChecks: GroundCheck[] = [
    {
      id: "low",
      at: toward(outlet, centroid, 0.35),
      label: "Plot Survey, Low",
      short: "Below 2,317 m · 165 m",
      what: "Plant cover and palatable species share on fixed quadrats in spring.",
      distanceLabel: "Distance 165 m",
      elevationDelta: "+14 m / −6 m",
      elevationM: "1,920 m",
      separates: "Separates Grazing Pressure vs Shrub Gain",
      profilePts: [0.22, 0.28, 0.35, 0.31, 0.42, 0.48, 0.52],
    },
    {
      id: "middle",
      at: centroid,
      label: "Plot Survey, Middle",
      short: "2,317 to 2,815 m · 1.4 km",
      what: "Paired plots sampled the same week as the lower band.",
      distanceLabel: "Distance 1.4 km",
      elevationDelta: "+620 m / −18 m",
      elevationM: "2,540 m",
      separates: "Separates Low Rainfall vs Grazing Pressure",
      profilePts: [0.25, 0.38, 0.51, 0.64, 0.72, 0.78, 0.84],
    },
    {
      id: "high",
      at: toward(centroid, farFromOutlet, 0.7),
      label: "Plot Survey, High",
      short: "Above 2,815 m · 3.8 km",
      what: `Upper snow-masked zone (${String(n.winterMonths)} winter months masked in Sentinel-2).`,
      distanceLabel: "Distance 3.8 km",
      elevationDelta: "+1,125 m / −40 m",
      elevationM: "2,980 m",
      separates: "Separates Late Snow vs Grazing Pressure",
      profilePts: [0.3, 0.45, 0.58, 0.74, 0.86, 0.94, 1.0],
    },
    ...(village
      ? [
          {
            id: "fields",
            at: [village.lon, village.lat] as LngLat,
            label: "Cropland Mapping",
            short: "Valley floor · 410 m",
            what: "Irrigated fields and orchards on level ground mapped against WorldCover 2021.",
            distanceLabel: "Distance 410 m",
            elevationDelta: "+4 m / −2 m",
            elevationM: "1,855 m",
            separates: "Separates Fields And Orchards vs Rangeland Trend",
            profilePts: [0.18, 0.19, 0.21, 0.2, 0.22, 0.23, 0.22],
          },
        ]
      : []),
    {
      id: "livestock",
      at: null,
      label: "Livestock Count",
      short: "Open ring · No location",
      what: "Herd counts and opening dates on shared pastures. Requires the herders' agreement.",
      separates: "Required for Grazing Pressure assessment",
    },
  ];

  const options: FlowOption[] = [
    {
      id: "rest",
      title: "Seasonal Rest (Agdal)",
      group: "precedent",
      evidence:
        "In this valley, 1964 aerial photos against 2002 SPOT imagery show forest canopy kept under agdal control (SCI-20, SCI-21). Forest, not pasture; not in the case corpus.",
      decides: "Village assembly",
      footprintBand: "unmapped",
      precedentMeta: {
        study:
          "Ait Bouguemez Forest Agdals (Auclair et al. 2011; Hammi et al. 2010, SCI-20, SCI-21)",
        window: "1964 aerial photography compared with 2002 SPOT imagery (38 years)",
        scope:
          "Managed sacred/communal forest reserves inside the valley; not high-elevation summer pastures",
        excerpt:
          "Forest agdals regulated by village institutions maintained canopy density between 1964 and 2002 while adjacent unmanaged slopes thinned.",
        badge: "Context, Not Evidence (ADR-0037)",
      },
    },
    {
      id: "dry-year",
      title: "Dry-Year Grazing Rule",
      group: "none",
      evidence: `No study of a pre-agreed dry-year rule in the ${String(n.sources)} case sources.`,
      decides: "Villages sharing the pastures",
      footprintBand: "mid",
    },
  ];

  const verdictLine = (id: LaneId, fr = false) => {
    const h = hypotheses.find((x) => x.id === id);
    if (!h) return "";
    if (!fr) return `${h.name}: ${FORMAL_TEXT[h.verdict].toLowerCase()}.`;
    const nameFr: Record<LaneId, string> = {
      rain: "Pluie faible",
      grazing: "Pression de pâturage",
      orchards: "Extension des cultures",
      snow: "Neige tardive",
      gaps: "Lacunes des données",
    };
    const vFr: Record<FormalVerdict, string> = {
      consistent: "compatible",
      contradicted: "contredit",
      cannot: "non évaluable",
    };
    return `${nameFr[id]} : ${vFr[h.verdict]}.`;
  };
  const lanes: LaneId[] = ["rain", "grazing", "orchards", "snow", "gaps"];
  const frMonth = (label: string) => {
    const [m, y] = label.split(" ");
    const map: Record<string, string> = {
      Jan: "janvier",
      Feb: "février",
      Mar: "mars",
      Apr: "avril",
      May: "mai",
      Jun: "juillet",
      Jul: "juillet",
      Aug: "août",
      Sep: "septembre",
      Oct: "octobre",
      Nov: "novembre",
      Dec: "décembre",
    };
    return `${map[m ?? ""] ?? m ?? ""} ${y ?? ""}`;
  };
  const frNum = (v: string) => v.replace(".", ",");

  const brief: BriefText[] = [
    {
      lang: "en",
      title: "Assembly Brief",
      status: "Field Unverified · Prepared. Nothing sent.",
      meta: [
        { key: "Area", value: `${placeTitle} catchment, ${area} (3 elevation bands)` },
        { key: "Records", value: `MODIS 2000 to 2025 (26 springs) and Sentinel-2 ${record}` },
        { key: "Prepared For", value: "Village assembly, agdal opening dates" },
      ],
      sections: [
        {
          head: "Measured",
          lines: [
            "Spring greenness (MODIS 250 m, March to June, 2000 to 2025) rose in all 3 elevation bands (+0.01 NDVI per decade catchment-wide; +0.02 on level ground) [1].",
            "Greenness barely tracks Sep to May rainfall (R squared 0.04; the 4 driest years 2001, 2016, 2023 and 2024 did not brown the bands) [1, 2].",
            `In the shorter ${record} monthly series, greenness was below median in ${String(n.browner)} of ${String(n.browner)} measured months, May 2022 to Apr 2023 (lowest ${n.lowest.label}, NDVI ${lowestValue}) [1].`,
            `Winter rainfall was ${String(dryMm)} mm in 2022/23 after 650 mm in 2021/22 (1991 to 2020 average ${String(usual)} mm) [2].`,
          ],
        },
        {
          head: "Not Measured",
          lines: [
            "Greener is not better forage: satellite NDVI does not separate palatable pasture species from shrubs or valley-floor orchards [1].",
            `Snow cover: ${String(n.winterMeasured)} of ${String(n.winterMonths)} Sentinel-2 winter months observed above 2,815 m.`,
            "Livestock numbers, grazing dates and digital pasture boundaries: no data in the pack.",
          ],
        },
        {
          head: "Hypothesis Tests",
          lines: [
            "Expected Decline (2000 to 2025): contradicted at band scale (greener in every band).",
            ...lanes.map((id) => verdictLine(id)),
          ],
        },
        {
          head: "Field Checks",
          lines: [
            "Plant cover and species composition on fixed plots in the low (< 2,317 m), middle (2,317 to 2,815 m) and high (> 2,815 m) bands in spring.",
            "Valley-floor fields and orchards mapped against ESA WorldCover 2021.",
            "Herd counts and pasture boundaries mapped with the herders' agreement.",
          ],
        },
        {
          head: "Options",
          lines: [
            "Seasonal rest (agdal): studied for forest agdals in this valley (context, not evidence) [3].",
            "Dry-year grazing rule: no precedent found in the case corpus.",
          ],
        },
      ],
      sources: [
        `1. MODIS MOD13Q1 (2000 to 2025) and Sentinel-2 L2A (${record}) NDVI bundles.`,
        "2. CHIRPS v3.0 rainfall (1991 to 2025, 33 cells), Climate Hazards Center.",
        "3. Case corpus: Auclair et al. 2011 (SCI-20), Wessels et al. 2012 (SCI-29), FAO GIEWS.",
      ],
      footer:
        "The assembly sets the opening dates. This brief holds measurements only. Prepared. Nothing sent.",
    },
    {
      lang: "fr",
      title: "Note pour l'assemblée",
      status: "Terrain non vérifié · Préparé. Rien n'a été envoyé.",
      meta: [
        {
          key: "Zone",
          value: `Bassin versant, vallée des Aït Bouguemez, ${frNum(f.areaKm2.toFixed(1))} km² (3 étages)`,
        },
        {
          key: "Séries",
          value: `MODIS 2000 à 2025 (26 printemps) et Sentinel-2 ${first} à ${last}`,
        },
        { key: "Destinataire", value: "Assemblée du village, dates d'ouverture de l'agdal" },
      ],
      sections: [
        {
          head: "Mesuré",
          lines: [
            "Verdure de printemps (MODIS 250 m, mars à juin, 2000 à 2025) en hausse dans les 3 étages d'altitude (+0,01 NDVI par décennie) [1].",
            "La verdure suit très peu les pluies de septembre à mai (R carré 0,04 ; les 4 années les plus sèches 2001, 2016, 2023 et 2024 n'ont pas bruni les étages) [1, 2].",
            `Verdure inférieure à la référence de ${first} à ${last} pendant ${String(n.browner)} des ${String(n.browner)} mois mesurés, de mai 2022 à avril 2023 (plus bas : ${frMonth(n.lowest.label)}, NDVI ${frNum(lowestValue)}) [1].`,
            `Pluie d'hiver : ${String(dryMm)} mm en 2022/23 après 650 mm en 2021/22, contre ${String(usual)} mm en moyenne (1991 à 2020) [2].`,
          ],
        },
        {
          head: "Non mesuré",
          lines: [
            "Plus vert ne veut pas dire meilleur fourrage : le satellite ne sépare pas les espèces appétentes des buissons ou des vergers [1].",
            `Couverture neigeuse : ${String(n.winterMeasured)} des ${String(n.winterMonths)} mois d'hiver observés au-dessus de 2 815 m.`,
            "Nombre d'animaux, dates de pâturage et limites d'agdal : aucune donnée.",
          ],
        },
        {
          head: "Hypothèses testées",
          lines: [
            "Baisse attendue (2000 à 2025) : contredit à l'échelle des étages (plus vert partout).",
            ...lanes.map((id) => verdictLine(id, true)),
          ],
        },
        {
          head: "Vérifications de terrain",
          lines: [
            "Couvert végétal et espèces sur placettes fixes, en bas (< 2 317 m), au milieu et en haut (> 2 815 m) de la vallée, au printemps.",
            "Champs et vergers cartographiés et comparés à 2021.",
            "Comptage des troupeaux, avec l'accord des éleveurs.",
          ],
        },
        {
          head: "Options",
          lines: [
            "Repos saisonnier (agdal) : étudié pour les agdals forestiers de la vallée (contexte, non preuve) [3].",
            "Règle pour les années sèches : aucun précédent trouvé.",
          ],
        },
      ],
      sources: [
        `1. MODIS MOD13Q1 (2000 à 2025) et Sentinel-2 L2A (${first} à ${last}).`,
        "2. CHIRPS v3.0, pluie (1991 à 2025, 33 mailles), Climate Hazards Center.",
        "3. Corpus : Auclair et al. 2011 (SCI-20), Wessels et al. 2012 (SCI-29), FAO GIEWS.",
      ],
      footer:
        "L'assemblée fixe les dates d'ouverture. Cette note contient uniquement des mesures. Rien n'a été envoyé.",
    },
  ];

  const step = Math.max(1, Math.floor(ring.length / 34));
  const edge = ring.filter((_, i) => i % step === 0).slice(0, -1);

  return {
    placeTitle,
    pack,
    otherPacks,
    placeStarters: [
      { text: placeTitle, query: f.placeName },
      ...(village ? [{ text: village.name, query: village.name }] : []),
      { text: "Marrakech Urban Heat", query: "Marrakech urban heat" },
      { text: "Casablanca", query: "Casablanca" },
    ],
    analysis: {
      name: "Baseline Comparison",
      detail: `26 spring seasons (MODIS 2000 to 2025) across 3 elevation bands and 5 aspect classes, plus ${record} monthly departures (${season} against 1991 to 2020 rainfall).`,
      window: `2000 to 2025 (26 springs) and ${season} against ${record}.`,
    },
    questions,
    steps,
    sheetLabels: {
      rain: "CHIRPS Rainfall 1991 to 2025",
      fields: "Copernicus DEM & WorldCover",
      greenness: "MODIS & Sentinel-2 NDVI",
    },
    layerStack,
    restrendStrata: RESTREND_STRATA,
    driestYears: DRIEST_YEARS,
    branchNodes,
    traceRecords,
    pastureCoverage,
    sources,
    season,
    measures,
    hypotheses,
    scopeNote: `${f.areaLabel}, ${area}. Sampling strata: 3 elevation bands (< 2,317 m, 2,317 to 2,815 m, > 2,815 m), not pasture boundaries.`,
    pins,
    timeStops,
    groundChecks,
    options,
    optionsNote:
      "Precedents are context by analogy, not evidence (ADR-0037). Fixture options; none is advised.",
    brief,
    edge,
  };
}
