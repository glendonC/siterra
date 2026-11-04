// The instrument views follow the app's theme as the overview does: daylight unless the visitor chose Obsidian (the
// overview's toggle, saved under THEME_KEY), and inside the overview whatever theme it shows. This file only chooses
// between the token files (lib/theme/daylight.ts, lib/theme/obsidian.ts); it writes no colour itself (VC-01).

import { daylightInstruments } from "./daylight";
import { modelColours, obsidian, pixelColours, sheetColours } from "./obsidian";

export type AppTheme = "light" | "obsidian";

/** Where the overview keeps the visitor's choice (components/overview/ValleyOverview.tsx). */
export const THEME_KEY = "siterra.theme";

export const themeOf = (value: string | null | undefined): AppTheme =>
  value === "obsidian" ? "obsidian" : "light";

/** The visitor's saved theme, daylight where none is saved or the storage cannot be read. */
export function savedTheme(): AppTheme {
  try {
    return themeOf(window.localStorage.getItem(THEME_KEY));
  } catch {
    return "light";
  }
}

/** The pixel's chart colours: the neutrals by theme, the data ramps shared. */
export interface PixelPalette {
  classes: Readonly<Record<number, string>>;
  otherClass: string;
  ndviSteps: readonly string[];
  noValue: string;
  slopeBelow: readonly string[];
  slopeNeutral: string;
  slopeAbove: readonly string[];
  locatorGround: string;
  locatorOutline: string;
  cellLine: string;
  veil: string;
  gridLine: string;
  bandShade: string;
  axis: string;
  ink2: string;
  ink: string;
  series: string;
  connector: string;
  connectorWarm: string;
}

export interface InstrumentPalette {
  canvas: string;
  accent: string;
  leaderQuiet: string;
  leaderDot: string;
  leaderOnWall: string;
  /** The cutaway's ruler and catchment line. */
  line: string;
  /** Snow-covered share, none to all. */
  snow: readonly string[];
  pixel: PixelPalette;
}

const OBSIDIAN: InstrumentPalette = {
  canvas: obsidian.canvas,
  accent: obsidian.accent,
  leaderQuiet: obsidian.leaderQuiet,
  leaderDot: obsidian.leaderDot,
  leaderOnWall: obsidian.leaderOnWall,
  line: modelColours.catchmentLine,
  snow: sheetColours.snow,
  pixel: pixelColours,
};

const DAYLIGHT: InstrumentPalette = {
  canvas: daylightInstruments.canvas,
  accent: daylightInstruments.accent,
  leaderQuiet: daylightInstruments.leaderQuiet,
  leaderDot: daylightInstruments.leaderDot,
  leaderOnWall: daylightInstruments.leaderOnWall,
  line: daylightInstruments.line,
  snow: daylightInstruments.snow,
  pixel: { ...pixelColours, ...daylightInstruments.pixel },
};

export const instrumentPalette = (theme: AppTheme): InstrumentPalette =>
  theme === "obsidian" ? OBSIDIAN : DAYLIGHT;
