// The playhead of "See It Over Time" (the reference clock): one position from the first season's January to the last
// season's December, then the trend. A position on a month's centre outside a year's last two months shows measured
// values only; between month centres the snow share is interpolated for motion, and over a year's last two months the
// pixels' season blends into the next one. Both are named in the key as blended; the readout and the annotations
// always show stored values. A paused or dragged playhead rests on a month's centre. Pure.

/** Months a year's season blends into the next over (November and December). */
export const BLEND_MONTHS = 2;

export interface ClockState {
  /** The season shown (index into the cube's seasons) and the next one it blends into, with the blend weight. */
  season: number;
  next: number;
  blend: number;
  /** The month the readout names, its index from the first January, and "YYYY-MM". */
  month: number;
  monthId: string;
  /** The neighbouring month and how far toward it the snow share has moved (0 at a month's centre). */
  snowNext: number;
  snowW: number;
  /** True when every value on the land is a stored one: a month's centre outside the blend months. */
  measured: boolean;
}

/** The clock at a position in months from the first January's centre (0) to the last December's centre. */
export function clockAt(position: number, firstYear: number, years: number): ClockState {
  const last = years * 12 - 1;
  const p = Math.min(Math.max(position, 0), last);
  const month = Math.round(p);
  const base = Math.floor(p);
  const w = p - base;
  const season = Math.floor(month / 12);
  const inYear = p - season * 12;
  // the season blends into the next one over the year's last months (positions 10 to 11 of a year, centres 9.5 on)
  const start = 12 - BLEND_MONTHS - 0.5;
  const blend =
    season + 1 < years && inYear > start ? Math.min(1, (inYear - start) / BLEND_MONTHS) : 0;
  const y = firstYear + season;
  const m = (month % 12) + 1;
  return {
    season,
    next: Math.min(season + 1, years - 1),
    blend,
    month,
    monthId: `${String(y)}-${String(m).padStart(2, "0")}`,
    snowNext: Math.min(base + 1, last),
    snowW: w,
    measured: Math.abs(p - month) < 1e-6 && blend === 0,
  };
}

/** A month index as "YYYY-MM". */
export function monthIdOf(month: number, firstYear: number): string {
  return `${String(firstYear + Math.floor(month / 12))}-${String((month % 12) + 1).padStart(2, "0")}`;
}

/** The position a paused or dragged playhead rests on: the nearest month's centre. */
export const restOn = (position: number): number => Math.round(position);
