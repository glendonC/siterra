import type { Sheet } from "../../lib/prototype/story";
import type { SheetState } from "./ProtoMap";

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
export const easeOut = (k: number) => 1 - (1 - k) ** 3;
export const easeInOut = (k: number) => (k < 0.5 ? 4 * k ** 3 : 1 - (-2 * k + 2) ** 3 / 2);

/** Sheets lift 600 ms each, then come down onto the land in 900 ms when their step runs. */
export function sheetStates(sheets: Sheet[], t: number, still: boolean): SheetState[] {
  return sheets.map((s) => {
    const rise = still ? (t >= s.liftAt ? 1 : 0) : easeOut(clamp01((t - s.liftAt) / 0.6));
    const down = still ? (t >= s.downAt ? 1 : 0) : easeInOut(clamp01((t - s.downAt) / 0.9));
    return {
      id: s.id,
      n: s.n,
      label: s.label,
      height: rise * (1 - down),
      opacity: Math.min(1, rise * 1.5) * (1 - down),
    };
  });
}
