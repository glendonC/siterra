// Choosing a place and a question on the globe: what the card shows in each step and what a picked point is called.
// Every decision here comes from a real signal already at hand: the geocoder's class and type, and the globe's own
// 0.08 degree land share grid (data/map/README.md). Nothing is invented; a point without a name is named by its
// coordinates.

/** The globe's world grid: elevation in metres and land share 0 to 1, interleaved, rows north to south. */
export interface WorldGrid {
  w: number;
  h: number;
  data: Float32Array;
}

/** water: no land within the case's box (a live case spans 10 km each way); coast: some land; land: all land. */
export type Surface = "land" | "coast" | "water" | "unknown";

/** The geocoder's answer for a point, or nothing when it had no name for it. */
export interface GeocodeHit {
  name?: string;
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

/** Open water, a coast or land, from the land share in the cells a case at this point would span. */
export function surfaceAt(world: WorldGrid | null | undefined, lon: number, lat: number): Surface {
  if (!world) return "unknown";
  let min = 1;
  let max = 0;
  for (const i of cellsAround(world, lon, lat, caseHalfRows(world))) {
    const share = world.data[i * 2 + 1] ?? 0;
    min = Math.min(min, share);
    max = Math.max(max, share);
  }
  if (max <= 0) return "water";
  if (min >= 1) return "land";
  return "coast";
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
        : "Open ocean";
    return { title: waterName, region: "", surface, investigable: false };
  }
  if (name) return { title: name, region, surface, investigable: true };
  if (surface === "unknown")
    return { title: `The point at ${coords}`, region, surface, investigable: false };
  const what = surface === "coast" ? "The coast" : "The land";
  return { title: `${what} at ${coords}`, region, surface, investigable: true };
}
