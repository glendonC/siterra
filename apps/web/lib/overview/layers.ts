// The land taken apart into its evidence, in the overview's own scene: which sheets the place has and in what order,
// where each stands in the stack, how they come off the land one after another, which one is lit, the layer the
// answer rests on, and each sheet's label. The layers are the evidence behind the explanations over the same land:
// the trend on top (what is being explained), then rain, snow, land cover and the elevation bands, each tied to the
// one explanation it bears on. That tie is a display choice, not a record claim; the verdict beside it is the
// record's. Pure: the scene (scene/overview-stack.ts) and the labels (components/overview/LayerStack.tsx) use it.

import type { CaseSnapshot } from "@siterra/contracts";
import { en } from "../copy/en";
import { lformat, ly } from "../copy/layers";
import { rd } from "../copy/readout";
import type { BranchStatus } from "../readout/readout";
import { daylight, ndviDeparture } from "../theme/daylight";
import { liftColours, pixelColours, sheetColours } from "../theme/obsidian";
import type { LiftId } from "./scene/overview-sheets";

/** The overview's sheets: the ones it lifts one at a time, and snow cover, which only the stack shows. */
export type StackLayer = LiftId | "snow";

export type Theme = "light" | "obsidian";

/** Top to bottom: what is being explained on top, then what might explain it, the land's heights last. */
export const STACK_ORDER: readonly StackLayer[] = ["trend", "rain", "snow", "cover", "bands"];

/** The explanation each sheet bears on (record explanation ids); the trend is what they explain. */
export const LAYER_EXPLANATION: Readonly<Record<StackLayer, string | null>> = {
  trend: null,
  rain: "rainfall",
  snow: "snow_terrain",
  cover: "land_use",
  bands: "grazing",
};

/** The sheets a place has, in stack order. */
export function stackOf(has: (id: StackLayer) => boolean): StackLayer[] {
  return STACK_ORDER.filter(has);
}

/** Each sheet's base height (model km), the first (top) sheet highest: one gap apart from one gap over the land's top. */
export function stackHeights(count: number, topY: number, gap: number): number[] {
  return Array.from({ length: count }, (_, i) => topY + gap * (count - i));
}

/**
 * The gap (model km) that keeps each sheet's picture clear of the next when seen from `elevationDeg`: a sheet
 * `depthKm` deep along the line of sight with `reliefKm` of its own relief pictures as depth sin(el) + relief cos(el)
 * high, and a gap as gap cos(el); `margin` is the share to spare.
 */
export function stackGap(
  depthKm: number,
  elevationDeg: number,
  reliefKm: number,
  margin = 1.25,
): number {
  const t = Math.tan((elevationDeg * Math.PI) / 180);
  return margin * (depthKm * t + reliefKm);
}

/** The answer's column (components/overview/Readout.module.css .rail): its left edge and width, in CSS px at every
 *  size (the column undoes the stage's scale). */
export const COLUMN = { left: 40, width: 470 } as const;
/** A layer label's width and the room between a sheet's edge and its label (CSS px, at every size). */
export const LABEL = { width: 260, gap: 44 } as const;
/** Clear of the column, the breadcrumb row and the key bar (CSS px). */
const CLEAR = { column: 56, top: 112, bottom: 84, right: 36 } as const;

/**
 * Where the camera puts the land and its sheets while they stand split (design px): right of the answer's column,
 * under the breadcrumb row, over the key bar, with room on the right for the labels at their CSS size. `fit` maps
 * design px to the canvas's CSS px (CSS = offset + design * scale).
 */
export function stackBox(
  size: { width: number; height: number },
  fit: { scale: number; ox: number; oy: number },
): { x0: number; y0: number; x1: number; y1: number } {
  const x0 = COLUMN.left + COLUMN.width + CLEAR.column;
  const x1 = Math.max(x0 + 120, size.width - CLEAR.right - LABEL.width - LABEL.gap);
  const y0 = CLEAR.top;
  const y1 = Math.max(y0 + 120, size.height - CLEAR.bottom);
  const d = (v: number, o: number) => (v - o) / fit.scale;
  return { x0: d(x0, fit.ox), y0: d(y0, fit.oy), x1: d(x1, fit.ox), y1: d(y1, fit.oy) };
}

/** Room the labels keep clear at the edges of the canvas (CSS px): the breadcrumb row above, the key bar below. */
export const LABEL_EDGE = { top: 64, bottom: 76, side: 24, spacing: 8 } as const;

/**
 * Where the labels stand (CSS px), each given its sheet's edge point and its height, top sheet first: one column right
 * of the land and every sheet, each label's name row (`row` px under its top) level with its sheet's edge where it
 * can be, never closer to the next than the spacing, and all between the breadcrumb row and the key bar.
 */
export function placeLabels(
  items: readonly { at: { x: number; y: number }; h: number }[],
  o: { landRight: number; width: number; height: number; row: number },
): { x: number; tops: number[] } {
  const right = Math.max(o.landRight, ...items.map((i) => i.at.x));
  const x = Math.min(o.width - LABEL_EDGE.side - LABEL.width, right + LABEL.gap);
  const tops = items.map((i) => i.at.y - o.row);
  let floor = LABEL_EDGE.top;
  items.forEach((i, n) => {
    tops[n] = Math.max(tops[n] ?? 0, floor);
    floor = (tops[n] ?? 0) + i.h + LABEL_EDGE.spacing;
  });
  let ceiling = o.height - LABEL_EDGE.bottom;
  for (let n = items.length - 1; n >= 0; n--) {
    const h = items[n]?.h ?? 0;
    tops[n] = Math.min(tops[n] ?? 0, ceiling - h);
    ceiling = (tops[n] ?? 0) - LABEL_EDGE.spacing;
  }
  return { x, tops };
}

/** Each sheet's travel takes this share of the split; the starts spread over the rest. */
const SHEET_SPAN = 0.5;

/** How far sheet `i` of `n` has come off the land (0 to 1) when the whole split is at `k`: the top sheet first. */
export function sheetProgress(k: number, i: number, n: number): number {
  const span = n > 1 ? SHEET_SPAN : 1;
  const delay = n > 1 ? ((1 - span) * i) / (n - 1) : 0;
  return Math.min(1, Math.max(0, (k - delay) / span));
}

/** The lit sheet of an open stack: the layer in focus when the stack holds it. */
export function litOf(stack: readonly StackLayer[], focus: StackLayer | null): StackLayer | null {
  return focus !== null && stack.includes(focus) ? focus : null;
}

export interface ExplanationVerdict {
  explanationId: string;
  label: string;
  status: BranchStatus;
}

/**
 * The verdicts a run has reached so far, as its steps show them (lib/run/model RunBranch): each scored branch with the
 * explanation its record names; none before the merge is committed.
 */
export function runVerdicts(
  snapshot: CaseSnapshot,
  branches: readonly { id: string; label: string; status: BranchStatus | null }[],
): ExplanationVerdict[] {
  const records = new Map((snapshot.records.explanationBranchRecords ?? []).map((b) => [b.id, b]));
  return branches.flatMap((b) => {
    const explanationId = records.get(b.id)?.explanationId;
    return b.status && explanationId ? [{ explanationId, label: b.label, status: b.status }] : [];
  });
}

/** The sheet an explanation is shown on, if any. */
export function layerOfExplanation(explanationId: string): StackLayer | null {
  return STACK_ORDER.find((id) => LAYER_EXPLANATION[id] === explanationId) ?? null;
}

/**
 * The layer the answer rests on, lifted alone once the stack settles: the sheet a measured claim reads (`proof`,
 * lib/readout/proof.ts); for an answer from the explanations, the sheet of the first explanation that fits and has
 * one the overview lifts (snow cover is drawn in the stack only); else none.
 */
export function answerLayer(
  proof: LiftId | null,
  claimKind: "measurement" | "status" | null,
  explanations: readonly ExplanationVerdict[],
): LiftId | null {
  if (proof) return proof;
  if (claimKind !== "status") return null;
  for (const e of explanations) {
    const layer = e.status === "consistent" ? layerOfExplanation(e.explanationId) : null;
    if (layer && layer !== "snow") return layer;
  }
  return null;
}

/** The sheets' colours in a theme: tokens only (lib/theme), so the sheets read on the page's own ground. */
export interface StackPalette {
  /** Inside the land where a sheet holds nothing. */
  plate: string;
  /** Each sheet's edge. */
  rim: string;
  /** The trend: its neutral middle, and each arm from the middle outward. */
  trend: { neutral: string; below: readonly string[]; above: readonly string[] };
  /** Low to high: drier to wetter, no snow to always snow, lower to higher. */
  rain: readonly string[];
  snow: readonly string[];
  bands: readonly [string, string, string];
  cover: { tree: string; crop: string };
}

export function paletteOf(theme: Theme): StackPalette {
  const cover = { tree: liftColours.tree, crop: liftColours.crop };
  if (theme === "obsidian")
    return {
      plate: liftColours.plate,
      rim: sheetColours.outline,
      trend: {
        neutral: pixelColours.slopeNeutral,
        below: pixelColours.slopeBelow,
        above: pixelColours.slopeAbove,
      },
      rain: sheetColours.rain,
      snow: sheetColours.snow,
      bands: [liftColours.bandLow, liftColours.bandMid, liftColours.bandHigh],
      cover,
    };
  // on paper a sheet is a shade darker than the ground, and its scales run from pale to deep, so more of a thing
  // reads as more ink
  return {
    plate: daylight.outsideVeil,
    rim: daylight.ink,
    trend: {
      neutral: ndviDeparture.reference,
      below: [ndviDeparture.below1, ndviDeparture.below2, ndviDeparture.below3],
      above: [ndviDeparture.above1, ndviDeparture.above2, ndviDeparture.above3],
    },
    rain: [...sheetColours.rain].reverse(),
    snow: [...sheetColours.snow].reverse(),
    bands: [liftColours.bandHigh, liftColours.bandMid, liftColours.bandLow],
    cover,
  };
}

/** A value scale: the words at its two ends and its colours, low to high. */
export interface LayerScale {
  low: string;
  high: string;
  stops: readonly string[];
}

export interface LayerLabel {
  id: StackLayer;
  name: string;
  /** What the sheet shows, in one plain line; null where its classes say it. */
  what: string | null;
  /** Only where the sheet's shading is a value scale. */
  scale: LayerScale | null;
  /** A sheet of classes: each class's word and colour. */
  classes: readonly { word: string; colour: string }[] | null;
  /**
   * The explanation the sheet bears on, with the record's verdict; null for the trend, or while the record holds none.
   * `named` is false where the explanation is called what the sheet is (Rainfall): the verdict alone says it then.
   */
  explanation: (ExplanationVerdict & { verdict: string; named: boolean }) | null;
  /** The trend's part: what is being explained; null for every other sheet. */
  role: string | null;
}

export interface LabelContext {
  theme: Theme;
  /** The trend sheet's season window in words ("March to June"), as its asset states it. */
  trendWindow: string | null;
  /** The rain sheet's window in words, and whether it is shaded by amount (else only its squares are drawn). */
  rain: { window: string | null; amounts: boolean };
  /** The month the snow sheet shows (0 January). */
  snowMonth: number;
  /** The record's explanations with their verdicts (none while the record holds none). */
  explanations: readonly ExplanationVerdict[];
}

/**
 * The record's verdict on the explanation a sheet bears on, in the answer's own three words (readout.verdict.*), or
 * null when the sheet bears on none the record holds.
 */
export function explanationOf(
  id: StackLayer,
  explanations: readonly ExplanationVerdict[],
): (ExplanationVerdict & { verdict: string }) | null {
  const e = explanations.find((x) => x.explanationId === LAYER_EXPLANATION[id]);
  return e ? { ...e, verdict: rd[`readout.verdict.${e.status}`].text } : null;
}

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

/** A month (0 January) in words. */
export const monthWord = (m: number): string => en[`month.${MONTH_KEYS[m] ?? "jan"}`].text;

const scaleOf = (
  id: "trend" | "rain" | "snow" | "bands",
  stops: readonly string[],
): LayerScale => ({
  low: ly[`layers.scale.${id}.low`].text,
  high: ly[`layers.scale.${id}.high`].text,
  stops,
});

export function labelOf(id: StackLayer, c: LabelContext): LayerLabel {
  const p = paletteOf(c.theme);
  const name = ly[`layers.name.${id}`].text;
  const verdict = explanationOf(id, c.explanations);
  const base = {
    id,
    name,
    classes: null,
    explanation: verdict
      ? { ...verdict, named: verdict.label.toLowerCase() !== name.toLowerCase() }
      : null,
    role: id === "trend" ? ly["layers.explained"].text : null,
  } as const;
  switch (id) {
    case "trend":
      return {
        ...base,
        what: c.trendWindow
          ? lformat("layers.what.trend", { window: c.trendWindow })
          : ly["layers.what.trendAnyWindow"].text,
        scale: scaleOf("trend", [
          ...[...p.trend.below].reverse(),
          p.trend.neutral,
          ...p.trend.above,
        ]),
      };
    case "rain":
      return {
        ...base,
        what: !c.rain.amounts
          ? ly["layers.what.rainSquares"].text
          : c.rain.window
            ? lformat("layers.what.rain", { window: c.rain.window })
            : ly["layers.what.rainAnyWindow"].text,
        scale: c.rain.amounts ? scaleOf("rain", p.rain) : null,
      };
    case "snow":
      return {
        ...base,
        what: lformat("layers.what.snow", { month: monthWord(c.snowMonth) }),
        scale: scaleOf("snow", p.snow),
      };
    case "cover":
      return {
        ...base,
        what: null,
        scale: null,
        classes: [
          { word: ly["layers.class.tree"].text, colour: p.cover.tree },
          { word: ly["layers.class.crop"].text, colour: p.cover.crop },
        ],
      };
    case "bands":
      return {
        ...base,
        what: ly["layers.what.bands"].text,
        scale: scaleOf("bands", p.bands),
      };
  }
}
