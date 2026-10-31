// Where a run is drawn on the overview (U29, specimen R): the drawn arc is the run's clock, from the ask disc
// clockwise; each task takes a lane, the arc itself or one ring outside it, the lowest that is free when it starts.
// Pure: points in, points out (design px).

import type { RunTask } from "./model";

export interface Pt {
  x: number;
  y: number;
}

/**
 * How far round the arc a moment is (0 to 1): the run's length once done, or a recording's known length throughout;
 * while a live run runs, room ahead of now.
 */
export function clockFraction(ms: number, nowMs: number, done: boolean, known?: number): number {
  const total =
    known !== undefined
      ? Math.max(known, 1)
      : done
        ? Math.max(nowMs, 1)
        : Math.max(nowMs * 1.25, 30_000);
  return Math.max(0, Math.min(1, ms / total));
}

/** A point a fraction of the way along a polyline (the arc's sampled points). */
export function along(points: readonly Pt[], f: number): Pt {
  if (points.length === 0) return { x: 0, y: 0 };
  const n = points.length - 1;
  const t = Math.max(0, Math.min(1, f)) * n;
  const i = Math.min(n - 1, Math.floor(t));
  const a = points[Math.max(0, i)] ?? { x: 0, y: 0 };
  const b = points[Math.min(n, i + 1)] ?? a;
  const k = t - Math.max(0, i);
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
}

/** The circle through three points (the arc's start, middle and end): its centre. */
export function centreOf(points: readonly Pt[]): Pt {
  const a = points[0] ?? { x: 0, y: 0 };
  const b = points[Math.floor(points.length / 2)] ?? a;
  const c = points[points.length - 1] ?? a;
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
  if (Math.abs(d) < 1e-9) return a;
  const sq = (p: Pt) => p.x * p.x + p.y * p.y;
  return {
    x: (sq(a) * (b.y - c.y) + sq(b) * (c.y - a.y) + sq(c) * (a.y - b.y)) / d,
    y: (sq(a) * (c.x - b.x) + sq(b) * (a.x - c.x) + sq(c) * (b.x - a.x)) / d,
  };
}

/** A point pushed outward from the centre by `px` (a lane outside the arc). */
export function outward(p: Pt, centre: Pt, px: number): Pt {
  const dx = p.x - centre.x;
  const dy = p.y - centre.y;
  const l = Math.hypot(dx, dy) || 1;
  return { x: p.x + (dx / l) * px, y: p.y + (dy / l) * px };
}

/** Each task's lane: the plan on the arc (0); every other task the lowest lane free when it starts. */
export function lanesOf(tasks: readonly RunTask[], nowMs: number): Map<string, number> {
  const lanes = new Map<string, number>();
  const busyUntil: number[] = [];
  const order = [...tasks].sort(
    (a, b) => (a.startMs ?? a.queuedMs) - (b.startMs ?? b.queuedMs) || a.id.localeCompare(b.id),
  );
  for (const t of order) {
    const start = t.startMs ?? t.queuedMs;
    const end = t.endMs ?? nowMs;
    let lane = busyUntil.findIndex((until) => until <= start);
    if (lane < 0) lane = busyUntil.length;
    busyUntil[lane] = end;
    lanes.set(t.id, lane);
  }
  return lanes;
}
