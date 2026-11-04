// The answer column's wording rules, shared by the column (readout.ts) and the list of the case's findings a typed
// question is answered from (lib/ask/findings.ts), so both say a thing in the same words: dates for period ids,
// labels inside a sentence, a check's sentence, an explanation's verdict as a sentence. Pure; every word is a record
// field or the readout catalog's.

import { en, format, type MessageId } from "../copy/en";
import { rformat, type ReadoutMessageId } from "../copy/readout";
import type { BranchStatus, ExplanationRow, GroundCheck } from "./readout";

const MONTH_KEYS = [
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

/** A month's number (1 to 12) as its name; null for any other number. */
const monthName = (m: number): string | null => {
  const key = MONTH_KEYS[m - 1];
  return key ? en[`month.${key}` as MessageId].text : null;
};

/** A "YYYY-MM" with a month from 01 to 12 as "April 2022"; null for any other text. */
function monthWords(ym: string): string | null {
  const [, year, month] = /^(\d{4})-(\d{2})$/.exec(ym) ?? [];
  const name = month === undefined ? null : monthName(Number(month));
  return year !== undefined && name ? `${name} ${year}` : null;
}

/** A season id ("season_2021-11_2022-04") in words: "November 2021 to April 2022"; null unless both are months. */
export function seasonIdWords(id: string): string | null {
  const [, start, end] = /^season_(\d{4}-\d{2})_(\d{4}-\d{2})$/.exec(id) ?? [];
  const from = start === undefined ? null : monthWords(start);
  const to = end === undefined ? null : monthWords(end);
  return from && to ? format("season.window", { from, to }) : null;
}

/** A monthly period id ("period_2022-04") in words ("April 2022"); any other id as written. */
export function periodIdWords(id: string): string {
  const month = /^period_(\d{4}-(?:0[1-9]|1[0-2]))$/.exec(id)?.[1];
  return (month === undefined ? null : monthWords(month)) ?? id;
}

/** A host's text with its period and season ids shown as dates; every other word is left as written. */
export function datedText(text: string): string {
  return text
    .replace(/\bseason_\d{4}-\d{2}_\d{4}-\d{2}\b/g, (id) => seasonIdWords(id) ?? id)
    .replace(/\bperiod_\d{4}-\d{2}\b/g, (id) => periodIdWords(id));
}

/** A label inside a sentence: lower case first unless it reads as an acronym ("MODIS"). */
export const inline = (label: string) =>
  /^[A-Z][a-z]/.test(label) ? label.charAt(0).toLowerCase() + label.slice(1) : label;

/** Words that start a sentence: the first letter in capitals. */
export const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * A plan's own description in sentence case: the first letter in capitals and every other word in lower case,
 * except a word in capitals or with a figure ("Local Rain Records" as "Local rain records", "MODIS" and "2019" kept).
 */
export function sentenceCase(text: string): string {
  return capital(
    text
      .split(" ")
      .map((word) =>
        /\d/.test(word) || /^[^a-z]*[A-Z][^a-z]*[A-Z][^a-z]*$/.test(word)
          ? word
          : word.toLowerCase(),
      )
      .join(" "),
  );
}

/** Words joined as a list, each as given: "a", "a and b", "a, b and c". */
export function joinWords(words: readonly string[]): string {
  if (words.length <= 1) return words[0] ?? "";
  const last = words[words.length - 1] ?? "";
  return rformat("readout.and", { first: words.slice(0, -1).join(", "), last });
}

/** Labels joined as words: "Grazing", "Grazing and land use", "Grazing, land use and snow or terrain". */
export function joinLabels(labels: readonly string[], sentenceStart = true): string {
  return joinWords(labels.map((l, i) => (i === 0 && sentenceStart ? capital(l) : inline(l))));
}

/** An answer made of verdicts, in the order one is chosen; the labels start the sentence except after "Not enough data". */
export const STATUS_ANSWERS: readonly {
  status: BranchStatus;
  one: ReadoutMessageId;
  many: ReadoutMessageId;
  labelsFirst: boolean;
}[] = [
  {
    status: "consistent",
    one: "readout.answer.fits.one",
    many: "readout.answer.fits.many",
    labelsFirst: true,
  },
  {
    status: "contradicted",
    one: "readout.answer.doesNotFit.one",
    many: "readout.answer.doesNotFit.many",
    labelsFirst: true,
  },
  {
    status: "cannot_be_assessed",
    one: "readout.answer.open",
    many: "readout.answer.open",
    labelsFirst: false,
  },
];

/**
 * One explanation's verdict as a sentence, in the words the answer uses for it: "Rainfall does not fit the evidence.",
 * "Not enough data yet on grazing."
 */
export function verdictWords(row: Pick<ExplanationRow, "label" | "status">): string {
  const s = STATUS_ANSWERS.find((x) => x.status === row.status);
  return s ? rformat(s.one, { labels: joinLabels([row.label], s.labelsFirst) }) : row.label;
}

/**
 * What a check would tell apart, in one sentence: "Local rain records would tell rainfall from grazing."; a check
 * that alone tells nothing apart is named on its own: "Orchard planting years."
 */
export function nextWords(check: Pick<GroundCheck, "what" | "separates">): string {
  const what = sentenceCase(check.what);
  return check.separates.length
    ? rformat("readout.next.separates", {
        check: what,
        pairs: joinWords(check.separates.map((p) => rformat("readout.next.pair", p))),
      })
    : rformat("readout.next.check", { check: what });
}
