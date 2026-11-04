// "Year by Year": the view's words from the record. Where a year stands among the record's years, by the area's
// greenness and by its rain; what the whole record shows at the end of the track; each band's share of change; the
// year the step changes reached half. Every figure is a record field or counted from record fields here (tested in
// words.test.ts against the records' own ranks and shares); the words around them are the time catalog's. Pure.

import { percent } from "../instruments/format";
import { tformat, tm } from "../copy/time";
import type { AreaShares, ChangeTiming, StratumSeries } from "./data";

export interface Standing {
  /** 1 for the record's highest value; years with the same value share a place. */
  fromTop: number;
  /** 1 for the record's lowest value. */
  fromBottom: number;
  /** How many years hold a value. */
  of: number;
  /** The other years with exactly the same value. */
  tiedWith: number[];
}

/** Each year's standing among the years that hold a value; a year with none has no standing. */
export function standingsOf(values: ReadonlyMap<number, number | null>): Map<number, Standing> {
  const held = [...values].filter(
    (e): e is [number, number] => typeof e[1] === "number" && Number.isFinite(e[1]),
  );
  return new Map(
    held.map(([year, v]): [number, Standing] => [
      year,
      {
        fromTop: 1 + held.filter(([, w]) => w > v).length,
        fromBottom: 1 + held.filter(([, w]) => w < v).length,
        of: held.length,
        tiedWith: held.filter(([y, w]) => w === v && y !== year).map(([y]) => y),
      },
    ]),
  );
}

const ORDINALS = tm["time.ordinals"].text.split(" ");

/** "Third" for 3; null past the last ordinal word the catalog holds. */
function nth(k: number): string | null {
  const w = ORDINALS[k - 1];
  return w ? w.charAt(0).toUpperCase() + w.slice(1) : null;
}

/** A place with the years that share it named or counted. */
function withTies(place: string, s: Standing): string {
  const [one] = s.tiedWith;
  if (s.tiedWith.length > 1) return tformat("time.tied.many", { place, count: s.tiedWith.length });
  return one === undefined ? place : tformat("time.tied.one", { place, year: one });
}

/** "Third greenest of 26 years", "Least green of 26 years": said from the end of the record the year is nearer. */
export function greenWords(s: Standing): string {
  const top = s.fromTop <= s.fromBottom;
  const k = top ? s.fromTop : s.fromBottom;
  const word = nth(k);
  const place =
    k === 1
      ? tformat(top ? "time.green.most" : "time.green.least", { n: s.of })
      : word
        ? tformat(top ? "time.green.nth" : "time.green.nthLeast", { nth: word, n: s.of })
        : tformat(top ? "time.green.above" : "time.green.below", {
            k: top ? s.fromBottom - 1 : s.fromTop - 1,
            m: s.of - 1,
          });
  return withTies(place, s);
}

const whole = new Intl.NumberFormat("en", { maximumFractionDigits: 0 });

/** A record month "2000-09" as "Sep 2000" (or "September 2000"). */
export function monthOf(id: string, long = false): string {
  const [y, m] = id.split("-").map(Number);
  return new Date(Date.UTC(y ?? 2000, (m ?? 1) - 1, 15)).toLocaleString("en", {
    month: long ? "long" : "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** "Second driest of 26 years: 391 mm of rain, Sep 2023 to May 2024", counted from the dry end. */
export function dryWords(s: Standing, rain: { mm: number; from: string; to: string }): string {
  const k = s.fromBottom;
  const word = nth(k);
  const said = {
    n: s.of,
    mm: whole.format(Math.round(rain.mm)),
    from: monthOf(rain.from),
    to: monthOf(rain.to),
  };
  const place =
    k === 1
      ? tformat("time.dry.most", said)
      : word
        ? tformat("time.dry.nth", { ...said, nth: word })
        : tformat("time.dry.below", { ...said, k: s.fromTop - 1, m: s.of - 1 });
  return withTies(place, s);
}

/**
 * The whole record in one word, from the catchment's trend as the record states it: its direction from the 95%
 * interval, counted only where the record does not say it fails the false discovery rate check. Null where the record
 * states no direction.
 */
export function trendWord(catchment: Pick<StratumSeries, "direction" | "fdrPass">): string | null {
  const { direction, fdrPass } = catchment;
  if (direction === null) return null;
  if (fdrPass !== false && direction === "upward") return tm["time.greener"].text;
  if (fdrPass !== false && direction === "downward") return tm["time.browner"].text;
  return tm["time.unclear"].text;
}

/**
 * The catchment's shares in one sentence, as the answer says them: both, or none when both are zero (the same
 * percent form, from the same record field).
 */
export function sharesWords(c: AreaShares): string {
  return c.up === 0 && c.down === 0
    ? tm["time.shares.none"].text
    : tformat("time.shares.both", { up: percent(c.up, 1), down: percent(c.down, 1) });
}

/** A band's shares, only the ones above zero; null when the band holds none. */
export function bandWords(c: AreaShares | undefined): string | null {
  if (!c) return null;
  const up = percent(c.up, 1);
  const down = percent(c.down, 1);
  if (c.up > 0 && c.down > 0) return tformat("time.band.both", { up, down });
  if (c.up > 0) return tformat("time.band.up", { up });
  if (c.down > 0) return tformat("time.band.down", { down });
  return null;
}

/** The year by which half of the pixels with an upward step had stepped, when any did. */
export function stepsWords(
  ct: Pick<ChangeTiming, "upwardFdrPixels" | "medianYearUpward">,
): string | null {
  return ct.upwardFdrPixels > 0 && ct.medianYearUpward !== null
    ? tformat("time.steps", { year: ct.medianYearUpward })
    : null;
}
