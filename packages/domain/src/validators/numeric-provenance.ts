// Numeric provenance, validation step 5 in docs/reference/agent-orchestration.md: every number in
// model-written text must match a value in a referenced measurement within its displayed
// precision, a date or period, or a number inside a cited excerpt. Anything else is rejected.
// Held here until packages/domain takes it; the rule is the same.

const MONTHS =
  "January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec";

/** The first and last calendar year of the case's periods; a bare year counts as a date only inside it. */
export interface YearSpan {
  first: number;
  last: number;
}

/** Units after a number make it a quantity, never a year: "1950 m", "2040 m", "1991 mm", "2000 %". */
const UNIT_AFTER = String.raw`(?!\s*(?:%|per\s?cent\b|percent\b|°|km²|km2\b|m²|m2\b|km\b|cm\b|mm\b|m\b|ha\b|kg\b|t\b|metres?\b|meters?\b|kilomet(?:re|er)s?\b|millimet(?:re|er)s?\b|hectares?\b))`;

const YEAR = String.raw`\b(?:19|20)\d{2}\b`;

/** Spans that are always dates or identifiers, whatever the case period. */
const ALWAYS_DATE: readonly RegExp[] = [
  /\b[a-z][a-z0-9]*_[A-Za-z0-9][A-Za-z0-9_-]*\b/g, // record and period IDs
  /\b\d{4}-\d{2}-\d{2}\b/g, // ISO dates
  /\b\d{4}-\d{2}\b/g, // year-month
];

/** Spans that are dates only when every year in them lies in the case span and no unit follows. */
const YEAR_DATES: readonly RegExp[] = [
  new RegExp(String.raw`\b\d{1,2}\s+(?:${MONTHS})\.?\s+(${YEAR})${UNIT_AFTER}`, "g"), // 3 April 2022
  new RegExp(String.raw`\b(?:${MONTHS})\.?\s+\d{1,2},\s*(${YEAR})${UNIT_AFTER}`, "g"), // April 3, 2022
  new RegExp(String.raw`\b(?:${MONTHS})\.?\s+(${YEAR})${UNIT_AFTER}`, "g"), // April 2022
  new RegExp(String.raw`(${YEAR})\s*(?:to|-|\u2013|and)\s*(${YEAR})${UNIT_AFTER}`, "g"), // year ranges
  new RegExp(String.raw`(${YEAR})${UNIT_AFTER}`, "g"), // a year
];

const NUMBER = /[-+\u2212]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?%?/g;

export interface FoundNumber {
  text: string;
  value: number;
  decimals: number;
  percent: boolean;
}

const blank = (m: string): string => " ".repeat(m.length);

/**
 * Numbers in text after removing date, period and ID spans. `years` is the case's year span: a
 * bare year, a year range or a month with a year counts as a date only inside it. With `years`
 * null, no bare year is a date, so every number is returned (used to read excerpts).
 */
export function numbersIn(text: string, years: YearSpan | null): FoundNumber[] {
  let masked = text;
  for (const pattern of ALWAYS_DATE) masked = masked.replace(pattern, blank);
  if (years !== null) {
    const inSpan = (y: string | undefined): boolean => {
      const n = Number(y);
      return y !== undefined && n >= years.first && n <= years.last;
    };
    for (const pattern of YEAR_DATES) {
      masked = masked.replace(pattern, (m: string, ...groups: unknown[]) => {
        const found = groups.filter((g): g is string => typeof g === "string" && /^\d{4}$/.test(g));
        return found.length > 0 && found.every(inSpan) ? blank(m) : m;
      });
    }
  }
  const found: FoundNumber[] = [];
  for (const match of masked.matchAll(NUMBER)) {
    let raw = match[0];
    // In "0.11-0.19" the hyphen joins a range; it is not the sign of the second value.
    if (raw.startsWith("-") && /\d/.test(masked.charAt(match.index - 1))) raw = raw.slice(1);
    const percent = raw.endsWith("%");
    const body = raw.replace("%", "").replace("\u2212", "-").replaceAll(",", "");
    const decimals = body.includes(".") ? (body.split(".")[1]?.length ?? 0) : 0;
    found.push({ text: raw, value: Number(body), decimals, percent });
  }
  return found;
}

function roundTo(value: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

/**
 * True when `n`, at its own displayed precision, equals one of the allowed values: a value
 * rounded to the decimals the text shows, or a fraction shown as a percent.
 */
export function numberIsAllowed(n: FoundNumber, allowed: readonly number[]): boolean {
  for (const value of allowed) {
    const candidates = n.percent ? [value * 100] : [value, Math.abs(value)];
    for (const c of candidates) {
      if (Math.abs(roundTo(c, n.decimals) - n.value) < 1e-9) return true;
    }
  }
  return false;
}

/**
 * Numbers in `text` that no allowed value, case date or excerpt accounts for. Every number in a
 * verified excerpt counts, years included, because the excerpt is the source.
 */
export function unprovenNumbers(
  text: string,
  allowedValues: readonly number[],
  excerpts: readonly string[],
  years: YearSpan | null,
): string[] {
  const excerptValues = excerpts.flatMap((e) => numbersIn(e, null).map((n) => n.value));
  return numbersIn(text, years)
    .filter((n) => !numberIsAllowed(n, allowedValues) && !excerptValues.includes(n.value))
    .map((n) => n.text);
}
