// Inside One Pixel's statement, in plain words from the pixel's own data: whether it got greener or browner over its
// seasons (its Theil-Sen trend and that trend's 95% interval), the trend's figure as the detail under it, and the note
// on what the pixel is made of: the share its trees and fields cover, and whether more of them alone would make it
// greener in the model that mixes its covers' measured light (mix.ts), its grassland's light unchanged. Pure; the
// words are the catalog's (instrument.pixel.lead.*, instrument.pixel.trend, instrument.pixel.note.*).

import { en, format, type MessageId } from "../../copy/en";
import { percent, signed } from "../format";
import type { PixelData } from "./data";
import { mixSpectra, ndviOf, type Shares } from "./mix";

/** WorldCover's tree cover and cropland, the covers greener than grassland; and grassland. */
const TREE = 10;
const CROP = 40;
const GRASS = 30;

export interface PixelStatement {
  /** What the pixel did over its seasons, in words. */
  lead: string;
  /** The trend's figure with its unit and season. */
  detail: string;
  /** What the pixel is made of and what that does to its greenness; null where no trees or fields cover it. */
  note: string | null;
}

type Trend = "greener" | "browner" | "flat";

const LEAD: Record<Trend, MessageId> = {
  greener: "instrument.pixel.lead.greener",
  browner: "instrument.pixel.lead.browner",
  flat: "instrument.pixel.lead.flat",
};

/** The note's two sentences by the covers the pixel holds: what covers it, and what more of them alone would do. */
const NOTE: Record<"both" | "trees" | "fields", { cover: MessageId; more: MessageId }> = {
  both: { cover: "instrument.pixel.note.both", more: "instrument.pixel.note.both.more" },
  trees: { cover: "instrument.pixel.note.trees", more: "instrument.pixel.note.trees.more" },
  fields: { cover: "instrument.pixel.note.fields", more: "instrument.pixel.note.fields.more" },
};

/** Greener, browner, or neither, by where the trend's 95% interval lies against zero. */
export function trendWord(t: PixelData["series"]["pixel_theil_sen"]): Trend {
  if (t.lower_per_decade > 0) return "greener";
  if (t.upper_per_decade < 0) return "browner";
  return "flat";
}

/**
 * True when moving the model's example share (the bundle's shift, in points) from grassland to each of the given covers
 * raises the mix's NDVI: more of them alone, grassland's light kept as measured, makes the pixel greener.
 */
export function moreRaises(d: PixelData, covers: readonly number[]): boolean {
  const shares: Shares = Object.fromEntries(
    Object.entries(d.measured_shares).map(([code, share]) => [Number(code), share]),
  );
  const grass = shares[GRASS] ?? 0;
  if (grass <= 0 || covers.length === 0) return false;
  const step = Math.min(grass, d.model.shift.points / 100);
  const ndvi = ndviOf(mixSpectra(d.classes, shares));
  return covers.every((code) => {
    const moved = { ...shares, [GRASS]: grass - step, [code]: (shares[code] ?? 0) + step };
    return ndviOf(mixSpectra(d.classes, moved)) > ndvi;
  });
}

/** The statement, with the trend's season in words as the trend cells state it (or the catalog's unstated season). */
export function pixelStatement(d: PixelData, window: string | null): PixelStatement {
  const t = d.series.pixel_theil_sen;
  const years = d.series.pixel.map((s) => s.year);
  const lead = format(LEAD[trendWord(t)], { from: Math.min(...years), to: Math.max(...years) });
  const detail = format("instrument.pixel.trend", {
    value: signed(t.slope_per_decade, 4),
    window: window ?? en["season.unstated"].text,
  });
  const shareOf = (code: number) => d.classes.find((c) => c.code === code)?.share ?? 0;
  const covers = [TREE, CROP].filter((code) => shareOf(code) > 0);
  if (covers.length === 0) return { lead, detail, note: null };
  const words = NOTE[covers.length === 2 ? "both" : covers[0] === TREE ? "trees" : "fields"];
  const cover = format(words.cover, { share: percent(shareOf(TREE) + shareOf(CROP), 0) });
  return {
    lead,
    detail,
    note: moreRaises(d, covers) ? `${cover} ${en[words.more].text}` : cover,
  };
}
