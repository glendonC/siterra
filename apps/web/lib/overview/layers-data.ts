// What the stack draws beyond the overview's own data, read through the layer stack spec's assets (checksums
// checked), as the layers view reads them: the snow-covered share of each 500 m height band in the month the snow
// sheet shows, and each CHIRPS cell's average rain over the spec's window (its 1991 to 2020 monthly means), so the
// rain sheet is shaded by amount. Either is null when the spec names no such layer or its asset cannot be read.

import type { InstrumentView } from "@siterra/contracts";
import { readJsonAsset } from "../instruments/listing";
import { rainCellsFrom, snowFrom, windowMonths } from "../instruments/valley/derive";
import type { Snow } from "../instruments/valley/fixtures";
import { rainRangeOf } from "../instruments/valley/palette";
import { windowWords } from "../land/season";

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

/** The month the snow sheet shows (0 January): February, as the layers view shows it. */
export const SNOW_MONTH = 1;

export interface SnowBand {
  /** Its heights (m): from `lo` up to below `hi`; null is open. */
  lo: number | null;
  hi: number | null;
  /** The share of the band covered by snow in the month shown, on average (0 to 1). */
  share: number;
}

export interface StackData {
  snow: { month: number; bands: SnowBand[] } | null;
  rain: {
    /** Each cell's corners in the zone's metres and its average rain over the window (mm). */
    cells: { corners: [number, number][]; mm: number }[];
    /** The amounts the shading spans (mm), low to high. */
    range: { lo: number; hi: number };
    /** The window in words ("September to May"), or null when the spec states none it can name. */
    window: string | null;
  } | null;
}

/** The fixed 500 m height bands of the snow tables, low to high, with their share in a month. */
export function snowBandsOf(snow: Snow, month: number): SnowBand[] {
  const bands: SnowBand[] = [];
  for (const [key, b] of Object.entries(snow.bands)) {
    const below = /^elev_below_(\d+)$/.exec(key);
    const between = /^elev_(\d+)_(\d+)$/.exec(key);
    const up = /^elev_(\d+)_up$/.exec(key);
    const share = b.monthly_mean[month] ?? 0;
    if (below) bands.push({ lo: null, hi: Number(below[1]), share });
    else if (between) bands.push({ lo: Number(between[1]), hi: Number(between[2]), share });
    else if (up) bands.push({ lo: Number(up[1]), hi: null, share });
  }
  return bands.sort((a, b) => (a.lo ?? -Infinity) - (b.lo ?? -Infinity));
}

const MONTH_KEY = (m: string) => m.slice(0, 3);

export async function loadStackData(
  layers: InstrumentView,
  zone: number,
  fetchImpl: Fetch = (input, init) => fetch(input, init),
  signal?: AbortSignal,
): Promise<StackData> {
  const p = layers.spec.parameters;
  if (p.kind !== "layer_stack") return { snow: null, rain: null };
  const optional = async <T>(read: () => Promise<T>): Promise<T | null> => {
    try {
      return await read();
    } catch (e) {
      if (signal?.aborted) throw e;
      console.error("Layer stack sheet not read", e);
      return null;
    }
  };
  const snowRef = p.layers.find((l) => l.layer === "snow_cover")?.data;
  const rainRef = p.layers.find((l) => l.layer === "rainfall")?.data;
  const window = p.rainfallWindow;
  const [snow, rain] = await Promise.all([
    optional(async () =>
      snowRef ? snowFrom(await readJsonAsset(layers, snowRef, fetchImpl, signal)) : null,
    ),
    optional(async () => {
      if (!rainRef) return null;
      const json = await readJsonAsset(layers, rainRef, fetchImpl, signal);
      const cells = rainCellsFrom(json, zone, window ? windowMonths(window) : undefined).cells;
      return {
        cells: cells.map((c) => ({
          corners: c.corners.map(([E, N]): [number, number] => [E, N]),
          mm: c.window_mm,
        })),
        range: rainRangeOf(cells),
        window: windowWords(
          window ? `${MONTH_KEY(window.start.month)}_${MONTH_KEY(window.end.month)}` : "sep_may",
        ),
      };
    }),
  ]);
  return {
    snow: snow ? { month: SNOW_MONTH, bands: snowBandsOf(snow, SNOW_MONTH) } : null,
    rain,
  };
}
