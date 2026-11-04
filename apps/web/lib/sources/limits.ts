// The Limits tab (W) in plain words. The record's limitations are written for the record, with rule IDs, source IDs,
// method names and change logs among them. Each line below says what one or more of them say, in words a first-time
// visitor reads, under one of four headings and a topic; it shows only when a limitation of the case writes one of
// its phrases, so the tab states nothing the record does not. A limitation that no line says is shown as the record
// writes it, without its IDs (lib/sources/overlay.ts). The table's order is the order on screen.

import type { SourcesMessageId } from "../copy/sources";

export type SectionId = "app" | "data" | "analysis" | "map";

export type TopicId =
  | "brief"
  | "responses"
  | "explanations"
  | "studies"
  | "steps"
  | "views"
  | "coverage"
  | "greenness"
  | "images"
  | "landCover"
  | "rainfall"
  | "snow"
  | "species"
  | "monthly"
  | "rainGreen"
  | "trends"
  | "windows"
  | "bands"
  | "wetSeasons"
  | "pixel"
  | "rules"
  | "area"
  | "heights"
  | "streams"
  | "profiles"
  | "routes"
  | "places"
  | "pictures";

export interface PlainLimit {
  id: SourcesMessageId;
  section: SectionId;
  topic: TopicId;
  /** Phrases of the record's limitations that this line says in plain words; one is enough to show it. */
  says: readonly RegExp[];
}

const line = (
  id: SourcesMessageId,
  section: SectionId,
  topic: TopicId,
  ...says: RegExp[]
): PlainLimit => ({ id, section, topic, says });

export const PLAIN: readonly PlainLimit[] = [
  // what Siterra does not do
  line("sources.limit.example", "app", "brief", /^Synthetic fixture for the interface/),
  line("sources.limit.draft", "app", "brief", /nothing is sent, scheduled or authorized/),
  line(
    "sources.limit.responses",
    "app",
    "responses",
    /^A candidate response, not a recommendation/,
  ),
  line("sources.limit.noEffect", "app", "responses", /^No benefit, outcome or effect is estimated/),
  line(
    "sources.limit.predictions",
    "app",
    "explanations",
    /predictions committed before any result was read/,
  ),
  line(
    "sources.limit.rules",
    "app",
    "explanations",
    /set by fixed rules \(merge@\d+\)/,
    /^Scored by host code/,
  ),
  line(
    "sources.limit.notProof",
    "app",
    "explanations",
    /^A hypothesis is a candidate explanation/,
    /is not a probability, a rank or proof/,
  ),
  line(
    "sources.limit.pairs",
    "app",
    "explanations",
    /^The explanation pairs each field check separates/,
  ),
  line("sources.limit.studies", "app", "studies", /^Says what the cited source says/),
  line("sources.limit.prepared", "app", "steps", /^Written from a synthetic replay/),
  line(
    "sources.limit.views",
    "app",
    "views",
    /^Composed by host rules from the case configuration/,
  ),

  // what the data cannot show (the coverage counted from the record comes first, lib/sources/overlay.ts)
  line(
    "sources.limit.coverageCounts",
    "data",
    "coverage",
    /^Coverage counts how much data passed the mask/,
    /summarizes the catchment only/,
  ),
  line(
    "sources.limit.anyClear",
    "data",
    "coverage",
    /^An observation date counts when at least one/,
  ),
  line(
    "sources.limit.clearShare",
    "data",
    "coverage",
    /^A clear share counts cells/,
    /^The shares depend on the Sentinel-2 scene classification/,
  ),
  line("sources.limit.winterOnly", "data", "coverage", /monthly series holds are covered/),
  line(
    "sources.limit.greenness",
    "data",
    "greenness",
    /^NDVI measures how green the ground looks from above/,
  ),
  line("sources.limit.greenMix", "data", "greenness", /spiny xerophytic vegetation/),
  line(
    "sources.limit.greenParts",
    "data",
    "greenness",
    /annual grasses, oak canopy and shrubs all add to it/,
  ),
  line(
    "sources.limit.seasonValue",
    "data",
    "greenness",
    /mean over the composites of one growing window/,
  ),
  line(
    "sources.limit.quality",
    "data",
    "greenness",
    /Composites keep only pixels flagged good or marginal/,
  ),
  line("sources.limit.mixed", "data", "images", /mixes surfaces/),
  line(
    "sources.limit.snowShade",
    "data",
    "images",
    /^Reduced QA/,
    /^Spring windows include snow-covered ground/,
    /^In the spring windows, upper slopes are snow-covered/,
  ),
  line(
    "sources.limit.snowmelt",
    "data",
    "images",
    /earlier or later (?:snow)?melt can (?:move|change)/,
  ),
  line(
    "sources.limit.winterBias",
    "data",
    "images",
    /^In winter months the accepted pixels favour/,
  ),
  line("sources.limit.drift", "data", "images", /^Terra's overpass has drifted earlier/),
  line(
    "sources.limit.fewImages",
    "data",
    "images",
    /absent from Planetary Computer/,
    /winter cloud can leave few usable/,
  ),
  line(
    "sources.limit.versions",
    "data",
    "images",
    /^Processing baselines differ across the record/,
  ),
  line("sources.limit.tiles", "data", "images", /overlap counts twice/),
  line(
    "sources.limit.oneMap",
    "data",
    "landCover",
    /single 2021 map/,
    /is a 2021 context mask/,
    /one 2021 land cover map/,
  ),
  line("sources.limit.noPasture", "data", "landCover", /[Nn]o class is a pasture/),
  line(
    "sources.limit.treeCover",
    "data",
    "landCover",
    /[Tt]ree cover[^.;]*may include (?:orchards|open woodland)/,
    /woodland and savanna may be mapped/,
  ),
  line(
    "sources.limit.fields",
    "data",
    "landCover",
    /cropland is a small share/,
    /Cropland \([\d.]+% of the catchment\)/,
    /of the catchment as cropland/,
  ),
  line("sources.limit.areas", "data", "landCover", /^Areas are cell counts times/),
  line(
    "sources.limit.rainGrid",
    "data",
    "rainfall",
    /^Rainfall is shown on its native/,
    /^CHIRPS cells are estimates for 5 km squares/,
    /^Rainfall comes from 5 km/,
  ),
  line("sources.limit.noGauge", "data", "rainfall", /^No rain gauge in or near/),
  line("sources.limit.rainShare", "data", "rainfall", /area-weighted value of \d+ cells/),
  line(
    "sources.limit.rainSnow",
    "data",
    "rainfall",
    /^Snowfall and snowmelt timing are not represented/,
    /snowfall is counted with rain/,
  ),
  line("sources.limit.rainVersion", "data", "rainfall", /never splice v2 and v3/),
  line("sources.limit.snowClear", "data", "snow", /sees snow only on clear days/),
  line("sources.limit.snowPixel", "data", "snow", /^Each 500 m pixel is called snow-covered/),
  line("sources.limit.snowDepth", "data", "snow", /^Snow cover is not snow depth/),
  line(
    "sources.limit.snowChecked",
    "data",
    "snow",
    /^Against \d+ Sentinel-2 scenes/,
    /^Against \w+ \w+ stations/,
    /validation studies of this product/,
  ),
  line("sources.limit.snowThresholds", "data", "snow", /Both thresholds are shown/),
  line("sources.limit.snowSample", "data", "snow", /^The check covers \d+ sample months/),
  line("sources.limit.snowNotRun", "data", "snow", /^Not applicable means the recipe is not run/),
  line(
    "sources.limit.speciesSeen",
    "data",
    "species",
    /^Each record says an organism was recorded/,
  ),
  line(
    "sources.limit.speciesWhere",
    "data",
    "species",
    /not a measurement of presence or abundance/,
    /^Records follow where people look/,
  ),
  line("sources.limit.speciesYears", "data", "species", /^Years reflect recording effort/),
  line(
    "sources.limit.speciesKept",
    "data",
    "species",
    /^Coordinates are as recorded/,
    /^Only records under CC0 1\.0 or CC BY 4\.0 are kept/,
  ),
  line(
    "sources.limit.speciesLater",
    "data",
    "species",
    /records are added, corrected and withdrawn over time/,
  ),
  line("sources.limit.speciesAbsent", "data", "species", /^A zero for a named plant means/),

  // what the analysis assumes
  line(
    "sources.limit.shortRecord",
    "analysis",
    "monthly",
    /^Seven years is a short record/,
    /^The reference is a short period/,
  ),
  line(
    "sources.limit.chance",
    "analysis",
    "monthly",
    /^A short record can hold months that move together by chance/,
  ),
  line(
    "sources.limit.departure",
    "analysis",
    "monthly",
    /^A departure describes how this month differs/,
  ),
  line(
    "sources.limit.spread",
    "analysis",
    "monthly",
    /^The spatial IQR is variability across pixels/,
  ),
  line("sources.limit.noMask", "analysis", "monthly", /^No cropland or irrigation mask is applied/),
  line(
    "sources.limit.cooccur",
    "analysis",
    "rainGreen",
    /^Counting months that move together shows co-occurrence/,
  ),
  line("sources.limit.zero", "analysis", "rainGreen", /stored V or R_k is 0/),
  line(
    "sources.limit.bothRefs",
    "analysis",
    "rainGreen",
    /^Counts are given for both vegetation references/,
  ),
  line(
    "sources.limit.manyPixels",
    "analysis",
    "trends",
    /^Each pixel's interval is one of thousands/,
  ),
  line(
    "sources.limit.slopeOnly",
    "analysis",
    "trends",
    /map shows the slope only/,
    /rule against drawing pixel-wise significance/,
  ),
  line("sources.limit.neighbors", "analysis", "trends", /^Neighbouring pixels are not independent/),
  line(
    "sources.limit.manyPairs",
    "analysis",
    "trends",
    /^Each stratum and window pair has its own interval/,
  ),
  line(
    "sources.limit.pairCheck",
    "analysis",
    "trends",
    /is stated beside every pair, and every pair is shown/,
  ),
  line("sources.limit.miss", "analysis", "trends", /^Trend methods can miss real change/),
  line(
    "sources.limit.notRainAdjusted",
    "analysis",
    "trends",
    /^These trends are not adjusted for rainfall/,
  ),
  line(
    "sources.limit.residual",
    "analysis",
    "trends",
    /^The rainfall-adjusted residual still holds/,
  ),
  line("sources.limit.stepping", "analysis", "trends", /^The values are an input to /),
  line("sources.limit.windowsFixed", "analysis", "windows", /^The windows were fixed before the/),
  line(
    "sources.limit.windowsRead",
    "analysis",
    "windows",
    /reading of the annual grassland growing season/,
  ),
  line(
    "sources.limit.summerWindow",
    "analysis",
    "windows",
    /^The June to September window spans the transition/,
  ),
  line(
    "sources.limit.dryWindow",
    "analysis",
    "windows",
    /^The June to September window is the dry-season half/,
  ),
  line(
    "sources.limit.bands",
    "analysis",
    "bands",
    /^Bands are elevation terciles/,
    /^An elevation band is a stratum/,
    /^Strata organize field sampling/,
  ),
  line("sources.limit.straddle", "analysis", "bands", /stratum values weight pixels by how much/),
  line(
    "sources.limit.reservoir",
    "analysis",
    "bands",
    /^Pixels around the reservoir change with the water level/,
    /^The reservoir zone is its own stratum/,
  ),
  line(
    "sources.limit.reservoirZone",
    "analysis",
    "bands",
    /^The reservoir zone is the largest mapped water body/,
  ),
  line(
    "sources.limit.rainReference",
    "analysis",
    "wetSeasons",
    /mean is a reference for departures/,
    /^The category places this wet season/,
  ),
  line("sources.limit.national", "analysis", "wetSeasons", /^Agreement compares directions only/),
  line(
    "sources.limit.pixelOne",
    "analysis",
    "pixel",
    /^One pixel is an illustration, not a sample/,
  ),
  line(
    "sources.limit.pixelMix",
    "analysis",
    "pixel",
    /^The class spectra come from one clear day/,
    /^The mix model assumes/,
  ),
  line("sources.limit.pixelSeries", "analysis", "pixel", /series is the pixel's own/),
  line(
    "sources.limit.pixelWindow",
    "analysis",
    "pixel",
    /built for this pixel's display window alone/,
  ),
  line(
    "sources.limit.postHoc",
    "analysis",
    "rules",
    /^Version [\d.]+ is post hoc/,
    /^Revision \d+ \(/,
  ),

  // what the map does not show
  line("sources.limit.area", "map", "area", /hydrological analysis extent/),
  line("sources.limit.reviewed", "map", "area", /^Not expert-reviewed/),
  line(
    "sources.limit.surface",
    "map",
    "heights",
    /surface model, not the ground/,
    /^A profile is read from a 30 m surface model/,
    /^The DEM is a surface model/,
  ),
  line("sources.limit.accuracy", "map", "heights", /stated (?:absolute )?vertical accuracy/),
  line("sources.limit.resample", "map", "heights", /^Each height is a bilinear resampling/),
  line(
    "sources.limit.ring",
    "map",
    "heights",
    /^The cells outside the catchment that the layer keeps/,
  ),
  line("sources.limit.traced", "map", "streams", /^The network is drawn from a 30 m surface model/),
  line("sources.limit.start", "map", "streams", /^A segment is drawn wherever/),
  line("sources.limit.uphill", "map", "streams", /^Depression filling and flat resolution/),
  line("sources.limit.upstream", "map", "streams", /^Upstream area counts the cells/),
  line("sources.limit.order", "map", "streams", /^Strahler order counts how channels join/),
  line("sources.limit.spacing", "map", "profiles", /^Samples are 30 m apart/),
  line(
    "sources.limit.floor",
    "map",
    "profiles",
    /floor segment follows the published elevation range/,
  ),
  line("sources.limit.axis", "map", "profiles", /^The valley axis is the longest flow path/),
  line("sources.limit.waterSurface", "map", "profiles", /gives the water surface, not the bed/),
  line("sources.limit.routes", "map", "routes", /^Proposed route, access unconfirmed/),
  line("sources.limit.unchecked", "map", "routes", /cannot see cliffs, scree, snow/),
  line("sources.limit.times", "map", "routes", /^Times are one way on trackless ground/),
  line("sources.limit.climb", "map", "routes", /^Climb and descent are sums over unsmoothed/),
  line(
    "sources.limit.sites",
    "map",
    "routes",
    /^The sites are chosen by a rule/,
    /^The end of the line is a candidate site/,
  ),
  line("sources.limit.villages", "map", "places", /^A published locator for the village/),
  line("sources.limit.labels", "map", "places", /^A label position for orientation/),
  line("sources.limit.outlet", "map", "places", /^The point all of the catchment drains to/),
  line("sources.limit.outletInput", "map", "places", /^Its input is one /),
  line("sources.limit.gaugeRecords", "map", "places", /the gauge's records were not used/),
  line("sources.limit.display", "map", "pictures", /gains a display raster for the map/),
  line("sources.limits.pixelPicture", "map", "pictures", /The true colou?r is display only/),
  // said where the case offers Year by Year (lib/sources/overlay.ts), not by any limitation's words
  line("sources.limits.timeBlend", "map", "pictures"),
  line("sources.limits.timeBlendSnow", "map", "pictures"),
];

/** The plain lines that say a limitation of the record; none when the tab has no plain words for it. */
export const linesSaying = (text: string): PlainLimit[] =>
  PLAIN.filter((p) => p.says.some((re) => re.test(text)));

/**
 * A limitation no plain line says, as the record writes it but without what only the record reads: a citation by
 * source ID in brackets ("(SCI-19, p. 2)", or the ID inside a bracket that says more), a rule ID ("(merge@2)"), and a
 * sentence that names a method by its ID ("pixel_trend_long_record"). Null when nothing is left.
 */
export function withoutIds(text: string): string | null {
  const bracketed = text.replace(/\s*\(([^()]*)\)/g, (whole, inner: string) => {
    if (/^[a-z]+@\d+$/.test(inner.trim())) return "";
    if (!/\bSCI-\d+/.test(inner)) return whole;
    // a part that starts with the ID is a citation (its pages and tables too); one that says more keeps what it says
    const kept = inner
      .split(";")
      .map((part) => (/^(.*?)(?:,\s*)?\bSCI-\d+/.exec(part.trim())?.[1] ?? part).trim())
      .filter(Boolean);
    return kept.length ? ` (${kept.join("; ")})` : "";
  });
  const sentences = bracketed
    .split(/(?<=[.?!])\s+/)
    .filter((s) => !/\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/.test(s));
  const out = sentences.join(" ").trim();
  return out || null;
}
