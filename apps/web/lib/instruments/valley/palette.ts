// How the valley sheets colour their data. The colours are tokens (lib/theme/obsidian.ts); this file only maps
// values onto them, as the approved specimens did.

import { sheetColours, type Channels } from "../../theme/obsidian";

export type Rgb = [number, number, number];
export type Rgba = [number, number, number, number];

export function hexRgb(hex: string): Rgb {
  const n = parseInt(hex.replace("#", ""), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export const channels = (c: Channels): Rgb => [c[0], c[1], c[2]];

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Linear interpolation along evenly spaced stops; t is clamped to 0 to 1. */
export function ramp(stops: readonly string[], t: number): Rgb {
  const c = Math.min(1, Math.max(0, t));
  const n = stops.length - 1;
  const i = Math.min(n - 1, Math.floor(c * n));
  const from = stops[i];
  const to = stops[i + 1];
  if (from === undefined || to === undefined) throw new Error("ramp: needs two stops or more");
  const a = hexRgb(from);
  const b = hexRgb(to);
  const f = c * n - i;
  return [lerp(a[0], b[0], f), lerp(a[1], b[1], f), lerp(a[2], b[2], f)];
}

/** The slope's fixed display scale, from the bundle: half-width of the domain and the neutral half-band. */
export interface TrendScale {
  domain: number;
  neutral: number;
}

/**
 * A slope's colour on the trend sheet: direction and magnitude by ramp, and an opacity that rises with magnitude so
 * small slopes stay a faint tint; slopes inside the neutral band are one faint grey.
 */
export function trendRgba(v: number, scale: TrendScale): Rgba {
  const a = Math.abs(v);
  if (a <= scale.neutral) return [...channels(sheetColours.trendNeutral), 0.16];
  const t = (a - scale.neutral) / (scale.domain - scale.neutral);
  const rgb = ramp(v > 0 ? sheetColours.trendAbove : sheetColours.trendBelow, t);
  return [...rgb, 0.3 + 0.62 * Math.min(1, Math.pow(t, 0.7) * 1.6)];
}

/** The rain sheet's display range (mm, September to May): it holds all 33 cells, 536.9 to 843.0 mm. */
export const RAIN_RANGE = { lo: 500, hi: 850 } as const;

/**
 * A place's rain sheet range: the first place's where its cells fit in it; otherwise the cells' own lowest and highest
 * totals, widened to the next 50 mm (U25b: another place's window holds other totals).
 */
export function rainRangeOf(cells: readonly { window_mm: number }[]): { lo: number; hi: number } {
  const mm = cells.map((c) => c.window_mm);
  const min = Math.min(...mm);
  const max = Math.max(...mm);
  if (!mm.length || (min >= RAIN_RANGE.lo && max <= RAIN_RANGE.hi)) return RAIN_RANGE;
  return {
    lo: Math.floor(min / 50) * 50,
    hi: Math.max(Math.ceil(max / 50) * 50, Math.floor(min / 50) * 50 + 50),
  };
}

export const rainColour = (mm: number, range: { lo: number; hi: number } = RAIN_RANGE): Rgb =>
  ramp(sheetColours.rain, (mm - range.lo) / (range.hi - range.lo));

/** A snow-covered share, 0 to 1. */
export const snowColour = (share: number): Rgb => ramp(sheetColours.snow, share);
