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

/**
 * Units after a number make it a quantity, never a year: "1950 m", "2040 m", "1991 mm", "2000 %",
 * "2000 masl".
 */
const UNIT_AFTER = String.raw`(?!\s*(?:%|per\s?cent\b|percent\b|°|km²|km2\b|m²|m2\b|masl\b|m\s?a\.?s\.?l\.?|asl\b|km\b|cm\b|mm\b|m\b|ha\b|kg\b|t\b|metres?\b|meters?\b|kilomet(?:re|er)s?\b|millimet(?:re|er)s?\b|hectares?\b))`;

const YEAR = String.raw`\b(?:19|20)\d{2}\b`;
const MONTH_NUMBER = String.raw`(?:0[1-9]|1[0-2])`;
const DAY_NUMBER = String.raw`(?:0[1-9]|[12]\d|3[01])`;

/**
 * Words after which a year can be a date ("in 2022", "since 2019", "from 2019 to 2025",
 * "until 2025", "between 2019 and 2025", "during 2020"). Not "to" on its own ("rose to 2000"),
 * "by", "of" or "for", which precede counts; "to" counts only inside a range that starts with one
 * of these words (AUDIT a46 10c recheck). Anywhere else a four-digit number is a quantity.
 */
const DATE_WORD = String.raw`\b(?:[Ii]n|[Ss]ince|[Ff]rom|[Uu]ntil|[Bb]etween|[Dd]uring)\s+`;

/**
 * After a date word, a year is a date only when the sentence ends, punctuation follows, or a
 * month, season or function word follows. A noun after it makes it a count: "Herds rose to 2000
 * head.", "In 2000 households, goats outnumber sheep." (AUDIT a46).
 */
const DATE_FOLLOWS = String.raw`(?=\s*(?:$|[.,;:!?)\]]|(?:and|or|the|a|an|when|while|as|after|before|spring|summer|autumn|fall|winter|season|${MONTHS})\b))`;

/** Spans that are always dates or identifiers, whatever the case period. */
const ALWAYS_DATE: readonly RegExp[] = [
  /\b[a-z][a-z0-9]*_[A-Za-z0-9][A-Za-z0-9_-]*\b/g, // record and period IDs
  new RegExp(String.raw`\b\d{4}-${MONTH_NUMBER}-${DAY_NUMBER}\b${UNIT_AFTER}`, "g"), // ISO dates
  new RegExp(String.raw`\b\d{4}-${MONTH_NUMBER}\b${UNIT_AFTER}`, "g"), // year-month
];

/**
 * Spans that are dates only when every four-digit year in them lies in the case span and no unit
 * follows: date patterns, and a year or a year range after a date word.
 */
const YEAR_DATES: readonly RegExp[] = [
  new RegExp(String.raw`\b\d{1,2}\s+(?:${MONTHS})\.?\s+(${YEAR})${UNIT_AFTER}`, "g"), // 3 April 2022
  new RegExp(String.raw`\b(?:${MONTHS})\.?\s+\d{1,2},\s*(${YEAR})${UNIT_AFTER}`, "g"), // April 3, 2022
  new RegExp(String.raw`\b(?:${MONTHS})\.?\s+(${YEAR})${UNIT_AFTER}`, "g"), // April 2022
  new RegExp(String.raw`(${YEAR})/(?:\d{2}|(${YEAR}))\b${UNIT_AFTER}`, "g"), // 2022/23, 2022/2023
  new RegExp(
    String.raw`${DATE_WORD}(${YEAR})\s*(?:to|-|\u2013|and)\s*(${YEAR})${UNIT_AFTER}${DATE_FOLLOWS}`,
    "g",
  ), // from 2019 to 2025.
  new RegExp(String.raw`${DATE_WORD}(${YEAR})${UNIT_AFTER}${DATE_FOLLOWS}`, "g"), // in 2022, ...
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
 * A change verb right before "from": "Herds rose from 2000 to 2010." reads as two counts, so the
 * span stays numbers to prove unless a month or season word follows it. Fails closed: a date
 * written this way costs a repair round ("between 2019 and 2022"), never a false number (b12).
 */
const CHANGE_VERB_BEFORE =
  /\b(?:rose|fell|grew|increased|decreased|declined|dropped|doubled|halved)\s+$/i;
const STARTS_WITH_FROM = /^from\s/i;
const MONTH_OR_SEASON_AFTER = new RegExp(
  String.raw`^\s*(?:spring|summer|autumn|fall|winter|season|${MONTHS})\b`,
  "i",
);

/**
 * The text with its date, period and ID spans blanked to spaces, so offsets are kept. `years` is
 * the case's year span: a bare year, a year range or a month with a year counts as a date only
 * inside it. With `years` null, no bare year is a date.
 */
export function maskDates(text: string, years: YearSpan | null): string {
  let masked = text;
  for (const pattern of ALWAYS_DATE) masked = masked.replace(pattern, blank);
  if (years !== null) {
    const inSpan = (y: string | undefined): boolean => {
      const n = Number(y);
      return y !== undefined && n >= years.first && n <= years.last;
    };
    for (const pattern of YEAR_DATES) {
      masked = masked.replace(pattern, (m: string, ...groups: unknown[]) => {
        const offset = groups.find((g): g is number => typeof g === "number") ?? 0;
        if (
          STARTS_WITH_FROM.test(m) &&
          CHANGE_VERB_BEFORE.test(masked.slice(0, offset)) &&
          !MONTH_OR_SEASON_AFTER.test(masked.slice(offset + m.length))
        ) {
          return m;
        }
        const found = groups.filter((g): g is string => typeof g === "string" && /^\d{4}$/.test(g));
        // A range is a date only when it runs forward: "from 2010 to 1995" is two numbers.
        const ascending = found.every((y, i) => i === 0 || Number(y) > Number(found[i - 1]));
        return found.length > 0 && ascending && found.every(inSpan) ? blank(m) : m;
      });
    }
  }
  return masked;
}

/**
 * Numbers in text after removing date, period and ID spans (see maskDates). With `years` null,
 * every number is returned (used to read excerpts).
 */
export function numbersIn(text: string, years: YearSpan | null): FoundNumber[] {
  const masked = maskDates(text, years);
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
