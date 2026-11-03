// A place's seasons in words, from the ids its own record and bundles use: a window id names its first
// and last month ("feb_may" is February to May, "oct_apr" October to April), and a period id names its years and its
// window ("period_2000-2025_feb_may"). Every place's captions say its own season this way; none is fixed in code.

import { en, format, type MessageId } from "../copy/en";

const MONTHS = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
] as const;
type Month = (typeof MONTHS)[number];
const isMonth = (m: string | undefined): m is Month => MONTHS.includes(m as Month);

/** A window id ("feb_may") in words ("February to May"), or null when it does not name two months. */
export function windowWords(id: string | null | undefined): string | null {
  const [a, b, ...rest] = (id ?? "").split("_");
  if (rest.length || !isMonth(a) || !isMonth(b)) return null;
  return format("season.window", {
    from: en[`month.${a}` as MessageId].text,
    to: en[`month.${b}` as MessageId].text,
  });
}

export interface Period {
  from: number;
  to: number;
  /** The window id, when the period names one ("feb_may"). */
  window: string | null;
}

/** A period id ("period_2000-2025_feb_may", "period_2021") as its years and window, or null when it is neither. */
export function periodOf(id: string | null | undefined): Period | null {
  const m = /^period_(\d{4})(?:-(\d{4}))?(?:_([a-z]{3}_[a-z]{3}))?$/.exec(id ?? "");
  if (!m?.[1]) return null;
  const from = Number(m[1]);
  return { from, to: m[2] ? Number(m[2]) : from, window: m[3] ?? null };
}

/** A finding's season for its captions: the window in words and the years, from its own period. */
export function seasonWords(period: Period | null): { window: string; from: string; to: string } {
  return {
    window: windowWords(period?.window) ?? en["season.unstated"].text,
    from: period ? String(period.from) : "",
    to: period ? String(period.to) : "",
  };
}
