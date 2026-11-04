// "Year by Year": the view's words, a sibling of en.ts with the same Message shape and lint (time.test.ts runs it).
// Every number and name it shows is a record field or computed from them in lib/time/words.ts; these are only the
// words around them. No place name.

import type { Message } from "./en";

export const tm = {
  // a year: where it stands among the record's years by the area's greenness, then what that greenness is
  "time.green.most": { text: "Greenest of {n} years", kind: "label" },
  "time.green.nth": { text: "{nth} greenest of {n} years", kind: "label" },
  "time.green.least": { text: "Least green of {n} years", kind: "label" },
  "time.green.nthLeast": { text: "{nth} least green of {n} years", kind: "label" },
  "time.green.above": { text: "Greener than {k} of the other {m} years", kind: "label" },
  "time.green.below": { text: "Less green than {k} of the other {m} years", kind: "label" },
  "time.noValue": { text: "No greenness value this year", kind: "label", honesty: true },
  "time.measure": { text: "Average greenness (NDVI) of the area, {window}", kind: "label" },
  // its rain, on the years the track marks
  "time.dry.most": { text: "Driest of {n} years: {mm} mm of rain, {from} to {to}", kind: "label" },
  "time.dry.nth": {
    text: "{nth} driest of {n} years: {mm} mm of rain, {from} to {to}",
    kind: "label",
  },
  "time.dry.below": {
    text: "Drier than {k} of the other {m} years: {mm} mm of rain, {from} to {to}",
    kind: "label",
  },
  "time.tied.one": { text: "{place}, tied with {year}", kind: "label" },
  "time.tied.many": { text: "{place}, tied with {count} other years", kind: "label" },
  // the ordinal words a place is said with, from the second on ("third greenest"); a place past the last is a count
  "time.ordinals": {
    text: "first second third fourth fifth sixth seventh eighth ninth tenth eleventh twelfth thirteenth fourteenth fifteenth sixteenth seventeenth eighteenth nineteenth twentieth",
    kind: "label",
  },
  "time.snow": { text: "{share} under snow", kind: "label" },
  // the end of the track: the whole record
  "time.span": { text: "{from} to {to}", kind: "label" },
  "time.greener": { text: "Greener", kind: "label" },
  "time.browner": { text: "Browner", kind: "label" },
  "time.unclear": { text: "No clear change", kind: "label" },
  // the catchment's shares as the answer says them: both, or none when both are zero
  "time.shares.both": { text: "{up} of the area greened and {down} browned.", kind: "ui" },
  "time.shares.none": { text: "No part of the area greened or browned.", kind: "ui" },
  "time.band.both": { text: "{up} greened, {down} browned", kind: "label" },
  "time.band.up": { text: "{up} greened", kind: "label" },
  "time.band.down": { text: "{down} browned", kind: "label" },
  "time.steps": {
    text: "Of the pixels that stepped up to greener, half did so by {year}.",
    kind: "ui",
  },
  // the keys
  "time.key": { text: "Greenness of each 250 m pixel", kind: "label" },
  "time.keyTrend": { text: "Change in each 250 m pixel", kind: "label" },
  "time.dryKey": { text: "The {n} driest years", kind: "label" },
  // the playhead
  "time.play": { text: "Play", kind: "button" },
  "time.pause": { text: "Pause", kind: "button" },
  "time.playhead": { text: "Year and month", kind: "ui" },
  "time.trendTick": { text: "trend", kind: "label" },
} as const satisfies Record<string, Message>;

export type TimeMessageId = keyof typeof tm;

export function tformat(id: TimeMessageId, values: Record<string, string | number> = {}): string {
  return tm[id].text.replace(/\{(\w+)\}/g, (whole, key: string) =>
    key in values ? String(values[key]) : whole,
  );
}
