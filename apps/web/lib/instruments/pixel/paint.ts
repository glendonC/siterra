// The pixel's 10 m cells painted three ways: their shared true-colour composite (display only),
// their June NDVI median in the anatomy's steps, or their WorldCover class; the same colours as the pixel anatomy.

import { pixelColours as C } from "../../theme/obsidian";

export type CellPaint = "rgb" | "ndvi" | "class";

/** The NDVI step limits of the anatomy's key. */
export const NDVI_BREAKS = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6] as const;

export interface PaintedCell {
  rgb: readonly [number, number, number];
  ndvi: number | null;
  cls: number;
}

/** A cell's colour as 0 to 1 RGB, or a hex string for the token colours. */
export function cellColour(paint: CellPaint, cell: PaintedCell): string | [number, number, number] {
  if (paint === "rgb") return [cell.rgb[0] / 255, cell.rgb[1] / 255, cell.rgb[2] / 255];
  if (paint === "class") return C.classes[cell.cls] ?? C.otherClass;
  const v = cell.ndvi;
  if (v === null) return C.noValue;
  let i = 0;
  while (i < NDVI_BREAKS.length && v >= (NDVI_BREAKS[i] ?? Infinity)) i++;
  return C.ndviSteps[i] ?? C.noValue;
}
