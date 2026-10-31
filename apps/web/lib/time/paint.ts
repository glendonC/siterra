// "See It Over Time" (UI-2): each 250 m pixel painted on the land's overlay for one moment of the playhead. In a
// season: the pixel's growing-season NDVI on the place's own scale (the ramp of lib/theme/obsidian.ts timeColours),
// blended into the next season only over a year's last two months, the no-value tone where the season has none. In
// the trend: each pixel's Theil-Sen slope on the trend asset's own display scale (the overview's slope colours),
// spreading out from the outlet in the order of each pixel's distance from it; the land not yet reached keeps the last
// season. The colours are computed from tokens; nothing here writes a colour literal.

import { cssColour, timeColours as TC } from "../theme/obsidian";
import { slopeColour } from "../overview/footprint";
import { hexRgb } from "../instruments/valley/palette";
import type { PixelCell, SeasonCube } from "./data";
import { valueAt } from "./data";

/** 256 steps of the greenness ramp, as 0 to 1 channels, over the place's domain. */
export function rampLut(): [number, number, number][] {
  const stops = TC.ramp.map(([t, h]) => [t, hexRgb(h)] as const);
  return Array.from({ length: 256 }, (_, i) => {
    const t = i / 255;
    const j = Math.max(
      0,
      stops.findIndex(([s], k) => t >= s && t <= (stops[k + 1]?.[0] ?? 1)),
    );
    const [s0, c0] = stops[j] ?? stops[0] ?? [0, [0, 0, 0] as const];
    const [s1, c1] = stops[j + 1] ?? stops[j] ?? [1, c0];
    const w = s1 > s0 ? (t - s0) / (s1 - s0) : 0;
    return [0, 1, 2].map((c) => (c0[c] ?? 0) + ((c1[c] ?? 0) - (c0[c] ?? 0)) * w) as [
      number,
      number,
      number,
    ];
  });
}

/** A value's colour on the domain: values beyond it take the end colours (the key says so). */
export function greenOf(
  v: number,
  domain: [number, number],
  lut: readonly [number, number, number][],
): string {
  if (!Number.isFinite(v)) return TC.noValue;
  const t = Math.min(1, Math.max(0, (v - domain[0]) / (domain[1] - domain[0])));
  return cssColour(lut[Math.round(t * 255)] ?? [0, 0, 0]);
}

export interface PaintMoment {
  /** The season shown, the next one and the blend weight toward it (0 outside a year's last two months). */
  season: number;
  next: number;
  blend: number;
  /** In the trend: how far it has spread, 0 to 1 of the farthest pixel's distance; null before it. */
  reveal: number | null;
}

/** Cells in order of their distance from a point (the outlet), with each one's share of the farthest distance. */
export function spreadOrder(cells: readonly PixelCell[], from: [number, number]): number[] {
  const d = cells.map((c) => {
    const cx = c.corners.reduce((a, [E]) => a + E, 0) / 4;
    const cy = c.corners.reduce((a, [, N]) => a + N, 0) / 4;
    return Math.hypot(cx - from[0], cy - from[1]);
  });
  const far = Math.max(...d, 1);
  return d.map((x) => x / far);
}

export function paintMoment(
  ctx: CanvasRenderingContext2D,
  px: (E: number, N: number) => [number, number],
  cube: SeasonCube,
  cells: readonly PixelCell[],
  domain: [number, number],
  trendScale: { domain: number; neutral: number },
  spread: readonly number[],
  lut: readonly [number, number, number][],
  m: PaintMoment,
): void {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  cells.forEach((c, i) => {
    let fill: string;
    if (m.reveal !== null && (spread[i] ?? 1) <= m.reveal) {
      fill = slopeColour(c.slope, trendScale.domain, trendScale.neutral);
    } else {
      const a = valueAt(cube, m.season, c.row, c.col);
      const b = m.blend > 0 ? valueAt(cube, m.next, c.row, c.col) : a;
      const v =
        Number.isFinite(a) && Number.isFinite(b) ? a + (b - a) * m.blend : m.blend < 0.5 ? a : b;
      fill = greenOf(v, domain, lut);
    }
    ctx.beginPath();
    c.corners.forEach(([E, N], k) => {
      const [x, y] = px(E, N);
      if (k === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  });
}
