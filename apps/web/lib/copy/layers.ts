// The words on the land's layers: each sheet's name, what it shows, the words at the two ends of its colour scale
// (only where its shading is a value scale), and what the trend is. A sibling of en.ts with the same Message shape
// and the same lint (layers.test.ts runs it). No place name: windows and months are record fields.

import type { Message } from "./en";

export const ly = {
  // the sheets, top to bottom, named as the overview's lifted sheet has always named them
  "layers.name.trend": { text: "Vegetation Trend", kind: "heading" },
  "layers.name.rain": { text: "Rainfall", kind: "heading" },
  "layers.name.snow": { text: "Snow Cover", kind: "heading" },
  "layers.name.cover": { text: "Land Cover", kind: "heading" },
  "layers.name.bands": { text: "Elevation Bands", kind: "heading" },

  // what each sheet shows, in one plain line; land cover says it with its two classes instead
  "layers.what.trend": { text: "Change in greenness, {window}", kind: "label" },
  "layers.what.trendAnyWindow": { text: "Change in greenness", kind: "label" },
  "layers.what.rain": { text: "Average rain, {window}", kind: "label" },
  "layers.what.rainAnyWindow": { text: "Average rain", kind: "label" },
  // the rain sheet when the amounts could not be read: its squares only, shaded by how much of each lies on the land
  "layers.what.rainSquares": { text: "Squares the rain data covers", kind: "label" },
  "layers.what.snow": { text: "Snow in {month}, by height", kind: "label" },
  "layers.what.bands": { text: "Three heights of equal area", kind: "label" },

  // the ends of each value scale, low first
  "layers.scale.trend.low": { text: "browner", kind: "label" },
  "layers.scale.trend.high": { text: "greener", kind: "label" },
  "layers.scale.rain.low": { text: "drier", kind: "label" },
  "layers.scale.rain.high": { text: "wetter", kind: "label" },
  "layers.scale.snow.low": { text: "no snow", kind: "label" },
  "layers.scale.snow.high": { text: "always snow", kind: "label" },
  "layers.scale.bands.low": { text: "lower", kind: "label" },
  "layers.scale.bands.high": { text: "higher", kind: "label" },
  // the land cover sheet's two classes
  "layers.class.tree": { text: "trees", kind: "label" },
  "layers.class.crop": { text: "fields or buildings", kind: "label" },

  // the vegetation trend is the thing the explanations explain (the other sheets' verdicts are readout.verdict.*)
  "layers.explained": { text: "What is being explained", kind: "label" },
} as const satisfies Record<string, Message>;

export type LayersMessageId = keyof typeof ly;

/** A layers message with its {placeholders} filled; a missing value leaves its placeholder visible. */
export function lformat(id: LayersMessageId, values: Record<string, string | number> = {}): string {
  return ly[id].text.replace(/\{(\w+)\}/g, (whole, key: string) =>
    key in values ? String(values[key]) : whole,
  );
}
