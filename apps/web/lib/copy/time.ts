// "See It Over Time": the view's words, a sibling of en.ts with the same Message shape and lint
// (time.test.ts runs it). Every number and name it shows is a record field; these are only the labels around them.
// No place name.

import type { Message } from "./en";

export const tm = {
  "time.crumb": { text: "Over Time", kind: "heading" },
  "time.region": { text: "The land's greenness season by season", kind: "ui" },
  "time.value": { text: "{window} NDVI, the catchment", kind: "label" },
  "time.trendValue": { text: "NDVI per decade, {window}, the catchment", kind: "label" },
  "time.trendKicker": { text: "Trend, {n} seasons", kind: "label" },
  "time.driest": { text: "One of the {n} driest: {mm} mm, {from} to {to}", kind: "label" },
  "time.snow": { text: "snow {share}", kind: "label" },
  "time.key": { text: "Greenness, each 250 m pixel", kind: "label" },
  "time.keyTrend": { text: "Trend of each pixel, NDVI per decade", kind: "label" },
  "time.blended": {
    text: "Blended for motion between months and seasons.",
    kind: "ui",
    honesty: true,
  },
  "time.noValue": { text: "No value that season", kind: "label", honesty: true },
  "time.noSnow": {
    text: "No snow layer: the record finds snow too rare here",
    kind: "label",
    honesty: true,
  },
  "time.dryKey": { text: "Driest seasons", kind: "label" },
  "time.trendTick": { text: "trend", kind: "label" },
  "time.changeYearMark": { text: "shift {year}", kind: "label" },
  "time.changeTiming": {
    text: "Shift began around {year} ({count} pixels)",
    kind: "label",
  },
  "time.changeTimingNone": {
    text: "No lasting shift year (0 pixels pass change-point check)",
    kind: "label",
    honesty: true,
  },
  "time.regionalScan": {
    text: "Regional scan ({total} pixels): {inside}% in catchment, {outside}% outside",
    kind: "label",
  },
  "time.bandTiming": { text: "rank {rank}, since {year}", kind: "label" },
  "time.play": { text: "Play", kind: "button" },
  "time.pause": { text: "Pause", kind: "button" },
  "time.playhead": { text: "Season and month", kind: "ui" },
  "time.keys": { text: "drag the playhead to move through the years", kind: "ui" },
} as const satisfies Record<string, Message>;

export type TimeMessageId = keyof typeof tm;

export function tformat(id: TimeMessageId, values: Record<string, string | number> = {}): string {
  return tm[id].text.replace(/\{(\w+)\}/g, (whole, key: string) =>
    key in values ? String(values[key]) : whole,
  );
}
