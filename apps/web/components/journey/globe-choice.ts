// Choosing a place and a question on the globe: what the card shows in each step, what a picked point is called,
// what kind of place it is, and which questions fit it. Every decision here comes from a real signal already at hand:
// the geocoder's class and type, and the globe's own 0.08 degree land share and elevation grids and its rangeland
// biome layer (data/map/README.md). Nothing is invented; a point without a name is named by its coordinates.

/** The globe's world grid: elevation in metres and land share 0 to 1, interleaved, rows north to south. */
export interface WorldGrid {
  w: number;
  h: number;
  data: Float32Array;
}

/** The rangeland biome layer: each cell's share in the rangeland biomes, 0 to 255, rows north to south. */
export interface BiomeLayer {
  w: number;
  h: number;
  data: Uint8Array;
}

/** water: no land within the case's box (a live case spans 10 km each way); coast: some land; land: all land. */
export type Surface = "land" | "coast" | "water" | "unknown";

export type PlaceKind =
  "city" | "coast" | "mountain-valley" | "mountain" | "rangeland" | "farmland" | "forest";

/** The geocoder's answer for a point, or nothing when it had no name for it. */
export interface GeocodeHit {
  name?: string;
  /** A shorter everyday name for the same place, when the geocoder gives one ("Kathmandu"). */
  shortName?: string;
  region?: string;
  /** OpenStreetMap class, type and address type as Nominatim reports them. */
  osmClass?: string;
  osmType?: string;
  addressType?: string;
}

export function formatLatLon(lat: number, lon: number): string {
  const ns = lat >= 0 ? "N" : "S";
  const ew = lon >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(2)}° ${ns}, ${Math.abs(lon).toFixed(2)}° ${ew}`;
}

/** The question on the globe card: none while the place is being chosen, the live question from step 2. */
export function cardQuestion(step: 1 | 2, question: string): string | null {
  return step === 2 && question.trim() ? question : null;
}

const CASE_HALF_KM = 10;
const RELIEF_HALF_CELLS = 3;
const KM_PER_DEG = 111.32;

function cellOf(grid: { w: number; h: number }, lon: number, lat: number): [number, number] {
  const c = Math.floor(((((lon + 180) % 360) + 360) % 360) / (360 / grid.w));
  const r = Math.floor((90 - lat) / (180 / grid.h));
  return [Math.min(grid.w - 1, Math.max(0, c)), Math.min(grid.h - 1, Math.max(0, r))];
}

/** The cells within halfRows rows of the point, and as many kilometres east and west as that is north and south. */
function cellsAround(
  grid: { w: number; h: number },
  lon: number,
  lat: number,
  halfRows: number,
): number[] {
  const [c0, r0] = cellOf(grid, lon, lat);
  const cosLat = Math.max(0.15, Math.cos((lat * Math.PI) / 180));
  const halfCols = Math.ceil(halfRows / cosLat);
  const out: number[] = [];
  for (let dr = -halfRows; dr <= halfRows; dr++) {
    const r = Math.min(grid.h - 1, Math.max(0, r0 + dr));
    for (let dc = -halfCols; dc <= halfCols; dc++)
      out.push(r * grid.w + ((c0 + dc + grid.w) % grid.w));
  }
  return out;
}

function caseHalfRows(grid: { h: number }): number {
  return Math.ceil(CASE_HALF_KM / KM_PER_DEG / (180 / grid.h));
}

/** The land share grid as stored (data/map/globe/dots-land-*.uint8.bin.gz): 0 to 255 per cell, rows north to south. */
export interface LandGrid {
  w: number;
  h: number;
  data: Uint8Array;
}

function surfaceFrom(
  grid: { w: number; h: number },
  share: (i: number) => number,
  lon: number,
  lat: number,
): Surface {
  let min = 1;
  let max = 0;
  for (const i of cellsAround(grid, lon, lat, caseHalfRows(grid))) {
    min = Math.min(min, share(i));
    max = Math.max(max, share(i));
  }
  if (max <= 0) return "water";
  if (min >= 1) return "land";
  return "coast";
}

/** Open water, a coast or land, from the land share in the cells a case at this point would span. */
export function surfaceAt(world: WorldGrid | null | undefined, lon: number, lat: number): Surface {
  if (!world) return "unknown";
  return surfaceFrom(world, (i) => world.data[i * 2 + 1] ?? 0, lon, lat);
}

/** The same, from the stored land share file the server reads. */
export function surfaceOfLand(
  land: LandGrid | null | undefined,
  lon: number,
  lat: number,
): Surface {
  if (!land) return "unknown";
  return surfaceFrom(land, (i) => (land.data[i] ?? 0) / 255, lon, lat);
}

/** Relief round the point (about 27 km each way) and where the point sits in it, 0 at the lowest cell, 1 the highest. */
export function reliefAt(
  world: WorldGrid | null | undefined,
  lon: number,
  lat: number,
): { reliefM: number; position: number } | null {
  if (!world) return null;
  let min = Infinity;
  let max = -Infinity;
  for (const i of cellsAround(world, lon, lat, RELIEF_HALF_CELLS)) {
    if ((world.data[i * 2 + 1] ?? 0) <= 0) continue;
    const e = world.data[i * 2] ?? 0;
    min = Math.min(min, e);
    max = Math.max(max, e);
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  const [c, r] = cellOf(world, lon, lat);
  const here = world.data[(r * world.w + c) * 2] ?? 0;
  const reliefM = max - min;
  return { reliefM, position: reliefM > 0 ? (here - min) / reliefM : 0 };
}

/** The point's share in the rangeland biomes, 0 to 1. */
export function rangelandShareAt(
  layer: BiomeLayer | null | undefined,
  lon: number,
  lat: number,
): number | null {
  if (!layer) return null;
  const [c, r] = cellOf(layer, lon, lat);
  const v = layer.data[r * layer.w + c];
  return v === undefined ? null : v / 255;
}

const SEA_TYPES = new Set(["sea", "ocean"]);
const WATER_NAME_TYPES = new Set(["sea", "ocean", "bay", "strait", "water", "gulf", "sound"]);

/** The geocoder itself names a sea or an ocean at the point. */
export function geocoderNamesSea(hit: GeocodeHit | null | undefined): boolean {
  if (!hit) return false;
  return SEA_TYPES.has(hit.osmType ?? "") || SEA_TYPES.has(hit.addressType ?? "");
}

export interface PointName {
  /** The place's name, or what the point is when nothing names it. */
  title: string;
  /** The region the geocoder gives, empty when it gives none. */
  region: string;
  surface: Surface;
  /** Whether a question may be asked here: on land or a coast, or at a named place when the land is unchecked. */
  investigable: boolean;
}

/** A true name for a picked point: the geocoder's name, the water body's, or the coordinates. */
export function namePoint(input: {
  lon: number;
  lat: number;
  surface: Surface;
  hit: GeocodeHit | null | undefined;
}): PointName {
  const { lon, lat, hit } = input;
  const coords = formatLatLon(lat, lon);
  const name = hit?.name?.trim() ?? "";
  const region = hit?.region?.trim() ?? "";
  const surface: Surface = geocoderNamesSea(hit) ? "water" : input.surface;
  if (surface === "water") {
    const waterName =
      name &&
      (WATER_NAME_TYPES.has(hit?.osmType ?? "") || WATER_NAME_TYPES.has(hit?.addressType ?? ""))
        ? name
        : "Open water";
    return { title: waterName, region: "", surface, investigable: false };
  }
  if (name) return { title: name, region, surface, investigable: true };
  if (surface === "unknown")
    return { title: `The point at ${coords}`, region, surface, investigable: false };
  const what = surface === "coast" ? "The coast" : "The land";
  return { title: `${what} at ${coords}`, region, surface, investigable: true };
}

const CITY_TYPES = new Set([
  "city",
  "town",
  "suburb",
  "borough",
  "city_district",
  "quarter",
  "neighbourhood",
  "residential",
]);
const FARM_TYPES = new Set(["farmland", "farmyard", "orchard", "vineyard", "meadow", "allotments"]);
const FOREST_TYPES = new Set(["forest", "wood"]);

/** The least relief, in metres over about 27 km each way, that makes the point mountain country. */
export const MOUNTAIN_RELIEF_M = 1000;
/** A point in the lower part of that relief sits in a valley rather than on the high ground. */
export const VALLEY_POSITION = 0.6;
/** A point at least this much in the rangeland biomes is rangeland. */
export const RANGELAND_SHARE = 0.5;

export interface PlaceSignals {
  hit?: GeocodeHit | null;
  surface: Surface;
  relief?: { reliefM: number; position: number } | null;
  rangelandShare?: number | null;
}

/** The kind of place, decided only from the signals given; null when none of them says. */
export function classifyPlace(s: PlaceSignals): PlaceKind | null {
  const cls = s.hit?.osmClass ?? "";
  const types = [s.hit?.osmType ?? "", s.hit?.addressType ?? ""];
  if (s.surface === "water" || s.surface === "unknown") return null;
  if (
    types.some((t) => CITY_TYPES.has(t)) &&
    (cls === "place" || cls === "boundary" || cls === "landuse")
  )
    return "city";
  if ((cls === "landuse" || cls === "natural") && types.some((t) => FOREST_TYPES.has(t)))
    return "forest";
  if (
    (cls === "landuse" || cls === "place") &&
    types.some((t) => FARM_TYPES.has(t) || t === "farm")
  )
    return "farmland";
  if (s.surface === "coast") return "coast";
  if (s.relief && s.relief.reliefM >= MOUNTAIN_RELIEF_M)
    return s.relief.position < VALLEY_POSITION ? "mountain-valley" : "mountain";
  if (s.rangelandShare != null && s.rangelandShare >= RANGELAND_SHARE) return "rangeland";
  return null;
}

/** Where a question looks: "in Manhattan", or "around 21.88° N, 33.75° E" for a point with no name. */
export interface QuestionPlace {
  name?: string;
  /** The geocoder's shorter name for the place, used inside questions when given. */
  shortName?: string;
  lat: number;
  lon: number;
}

function shortName(raw: string): string {
  return raw.split(",")[0]?.trim() ?? "";
}

/**
 * The shorter everyday name Nominatim gives in its name details for the same place (the place node a boundary is
 * linked to, its short or international name), when it is shorter than the name and written in Latin letters;
 * otherwise nothing. "Kathmandu" for "Kathmandu Metropolitan City".
 */
export function shortNameFrom(
  details: Record<string, string | undefined> | null | undefined,
  name: string,
): string | undefined {
  if (!details) return undefined;
  for (const key of ["_place_name:en", "short_name:en", "short_name", "int_name"]) {
    const v = details[key]?.trim();
    if (v && v.length < name.trim().length && /^[\p{Script=Latin}\p{N}\s.'’()-]+$/u.test(v))
      return v;
  }
  return undefined;
}

/**
 * Broad questions first, then two that fit the kind of place; a place of unknown kind gets the broad ones only. None
 * presupposes a result: each asks whether, where or how much, never why something already measured happened.
 */
export function placeQuestions(place: QuestionPlace, kind: PlaceKind | null): string[] {
  const name = place.shortName?.trim() || (place.name ? shortName(place.name) : "");
  const coords = formatLatLon(place.lat, place.lon);
  const inP = name ? `in ${name}` : `around ${coords}`;
  const round = name ? `around ${name}` : `around ${coords}`;
  const broad = [
    `What are the biggest land cover changes ${inP} since 2000?`,
    `Where is the land changing fastest ${inP}, and what is driving it?`,
  ];
  const fit: Record<PlaceKind, string[]> = {
    city: [
      `Has built-up land spread into the open land ${round} since 2000?`,
      `Has vegetation cover inside ${name || `the area ${round}`} changed since 2000, and where?`,
    ],
    coast: [
      `Has the shoreline ${round} moved since 2000?`,
      `Has land use along the coast ${round} changed since 2000, and where?`,
    ],
    "mountain-valley": [
      `Does land cover change differently on the valley floor ${round} than on the slopes above it?`,
      `Does vegetation ${round} change differently with elevation?`,
    ],
    mountain: [
      `Does vegetation ${round} change differently with elevation?`,
      `Has the share of bare ground on the slopes ${round} changed since 2000?`,
    ],
    rangeland: [
      `How closely does vegetation ${round} follow rainfall from year to year?`,
      `Are there places ${round} where vegetation trends differ from what rainfall would suggest?`,
    ],
    farmland: [
      `Has the area under cultivation ${round} changed since 2000?`,
      `How much does the growing season ${round} vary from year to year?`,
    ],
    forest: [
      `Has forest cover ${round} been lost or gained since 2000?`,
      `Has the forest ${round} become more or less fragmented since 2000?`,
    ],
  };
  return kind ? [...broad, ...fit[kind]] : broad;
}

/**
 * What a start is really doing. A new place's case is gathered first (terrain, climate records and literature
 * sources, apps/web/lib/live-place/ingest.ts); a studied place's case already exists and the camera goes down to it.
 */
export function launchStatus(kind: "new" | "studied"): string {
  return kind === "new"
    ? "Gathering the terrain, climate records and sources for this place, then opening the investigation"
    : "Going down to the land and opening the investigation";
}

/** A new place's start, decided from the case service's answer: open its own case, or say why it did not start. */
export type StartOutcome = { caseId: string } | { failure: string };

/**
 * The case service's answer to a start: its HTTP status (null when it could not be reached) and body. Only this
 * place's own case opens; anything else is a failure the visitor sees, never another place's case in its stead.
 */
export function startOutcome(status: number | null, body: unknown): StartOutcome {
  if (status === null) return { failure: launchFailure(null) };
  const caseId =
    body && typeof body === "object" && typeof (body as { caseId?: unknown }).caseId === "string"
      ? (body as { caseId: string }).caseId.trim()
      : "";
  if (status >= 200 && status < 300 && caseId) return { caseId };
  return { failure: launchFailure(status) };
}

/** Why a new place did not start, from the case service's HTTP status, or null when it could not be reached. */
export function launchFailure(status: number | null): string {
  if (status === null)
    return "This place could not be started: Siterra could not be reached. Try again, or pick another place.";
  return `This place could not be started (HTTP ${String(status)}). Try again, or pick another place.`;
}
