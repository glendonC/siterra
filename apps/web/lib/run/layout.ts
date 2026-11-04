// Where a run is drawn on the overview: the drawn arc is the run's clock, from the ask disc
// clockwise; each task takes a lane, the arc itself or one ring outside it, the lowest that is free when it starts.
// Pure: points in, points out (design px).

import type { RunTask } from "./model";

export interface Pt {
  x: number;
  y: number;
}

export interface CursorSlot {
  task: RunTask;
  at: Pt;
  targetKind: "land" | "bundle" | "source";
  stratumId: string | null;
}

export type CursorPoint = CursorSlot;

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

const SOURCE_WAYPOINTS: readonly Pt[] = [
  { x: 0.14, y: -0.08 },
  { x: 0.18, y: 0.01 },
  { x: 0.12, y: 0.08 },
];

const RAIN_WAYPOINTS: readonly Pt[] = [
  { x: -0.12, y: -0.28 },
  { x: -0.05, y: -0.23 },
  { x: -0.16, y: -0.21 },
];

const VEG_WAYPOINTS: readonly Pt[] = [
  { x: -0.2, y: 0.11 },
  { x: -0.23, y: 0.18 },
  { x: -0.15, y: 0.25 },
];

function anchorForTarget(
  centre: Pt,
  radius: number,
  task: RunTask,
  targetKind: "land" | "bundle" | "source",
  stratumId: string | null,
  occurrenceIndex: number,
): Pt {
  const sub = (task.sublabel ?? "").toLowerCase();
  const stepIdx = Math.max(0, task.steps.length - 1) % 3;
  if (
    targetKind === "source" ||
    task.kind === "source_reading" ||
    task.kind === "source_research"
  ) {
    const wp = SOURCE_WAYPOINTS[stepIdx] ?? { x: 0.14, y: -0.08 };
    return {
      x: centre.x + radius * wp.x + occurrenceIndex * 24,
      y: centre.y + radius * wp.y + occurrenceIndex * 64,
    };
  }
  if (
    stratumId === "upper_basin" ||
    sub.includes("rain") ||
    sub.includes("terrain") ||
    sub.includes("chirps")
  ) {
    const wp = RAIN_WAYPOINTS[stepIdx] ?? { x: -0.12, y: -0.28 };
    return {
      x: centre.x + radius * wp.x + occurrenceIndex * 26,
      y: centre.y + radius * wp.y + occurrenceIndex * 64,
    };
  }
  if (
    stratumId === "valley_floor" ||
    sub.includes("ndvi") ||
    sub.includes("trend") ||
    sub.includes("vegetation")
  ) {
    const wp = VEG_WAYPOINTS[stepIdx] ?? { x: -0.2, y: 0.11 };
    return {
      x: centre.x + radius * wp.x + occurrenceIndex * 26,
      y: centre.y + radius * wp.y + occurrenceIndex * 64,
    };
  }
  switch (stratumId) {
    case "mid_slope":
      return {
        x: centre.x + radius * 0.12 + occurrenceIndex * 26,
        y: centre.y + radius * 0.12 + occurrenceIndex * 64,
      };
    case "water_zone":
      return {
        x: centre.x + radius * 0.04 + occurrenceIndex * 26,
        y: centre.y + radius * 0.28 + occurrenceIndex * 64,
      };
    default:
      if (task.kind === "livelihood_governance" || task.kind === "field_check") {
        return {
          x: centre.x + radius * 0.04 + occurrenceIndex * 26,
          y: centre.y + radius * 0.28 + occurrenceIndex * 64,
        };
      }
      if (task.kind === "explanation_branches") {
        return {
          x: centre.x + radius * 0.12 + occurrenceIndex * 26,
          y: centre.y + radius * 0.12 + occurrenceIndex * 64,
        };
      }
      return {
        x: centre.x - radius * 0.06 + occurrenceIndex * 26,
        y: centre.y - radius * 0.12 + occurrenceIndex * 64,
      };
  }
}

const CURSOR_BOX_W = 212;
const CURSOR_BOX_H = 58;
const DISPLACEMENT_OFFSETS: readonly Pt[] = [
  { x: 0, y: 0 },
  { x: 0, y: 66 },
  { x: 0, y: -66 },
  { x: -195, y: 52 },
  { x: 175, y: 52 },
  { x: -195, y: -52 },
  { x: 175, y: -52 },
  { x: 0, y: 132 },
  { x: 0, y: -132 },
];

function boxesOverlap(a: Pt, b: Pt): boolean {
  return Math.abs(a.x - b.x) < CURSOR_BOX_W && Math.abs(a.y - b.y) < CURSOR_BOX_H;
}

function resolveNonOverlappingPosition(desired: Pt, placed: readonly Pt[]): Pt {
  for (const off of DISPLACEMENT_OFFSETS) {
    const candidate = { x: desired.x + off.x, y: desired.y + off.y };
    if (!placed.some((p) => boxesOverlap(candidate, p))) {
      return candidate;
    }
  }
  return {
    x: desired.x,
    y: desired.y + placed.length * (CURSOR_BOX_H + 8),
  };
}

/** Agent cursors on the land and sources, placed deterministically from running tasks' tool events (plus the selected task's latest target when inspecting a completed task). */
export function cursorPointsOf(
  tasks: readonly RunTask[],
  centre: Pt,
  radius: number,
  selectedTaskId?: string | null,
): CursorSlot[] {
  const bucketCounts = new Map<string, number>();
  const cursors: CursorSlot[] = [];
  for (const task of tasks) {
    let target = task.state === "running" ? task.activeTarget : null;
    if (!target && selectedTaskId && task.id === selectedTaskId) {
      const lastWithTarget = [...task.steps]
        .reverse()
        .find(
          (s) =>
            s.target &&
            (s.target.kind === "land" || s.target.kind === "bundle" || s.target.kind === "source"),
        );
      if (lastWithTarget?.target) {
        target = lastWithTarget.target;
      } else {
        const defaultStratum =
          task.kind === "livelihood_governance" || task.kind === "field_check"
            ? "valley_floor"
            : task.kind === "explanation_branches"
              ? "mid_slope"
              : "catchment";
        target = {
          kind: "land",
          stratumId: defaultStratum,
          bundleId: null,
          recipeId: null,
          sourceId: null,
          pages: [],
          sections: [],
          queryTerms: [],
        };
      }
    }
    if (!target) continue;
    const kind = target.kind;
    if (kind !== "land" && kind !== "bundle" && kind !== "source") continue;
    const key = `${kind}:${target.stratumId ?? ""}:${task.sublabel ?? ""}`;
    const idx = bucketCounts.get(key) ?? 0;
    bucketCounts.set(key, idx + 1);
    cursors.push({
      task,
      at: anchorForTarget(centre, radius, task, kind, target.stratumId, idx),
      targetKind: kind,
      stratumId: target.stratumId,
    });
  }
  if (cursors.length <= 1) return cursors;
  const primaryIdx = selectedTaskId
    ? cursors.findIndex((c) => c.task.id === selectedTaskId)
    : cursors.length - 1;
  const order = cursors.map((_, i) => i);
  if (primaryIdx >= 0) {
    order.sort((a, b) => (a === primaryIdx ? -1 : b === primaryIdx ? 1 : b - a));
  }
  const placed: Pt[] = [];
  const resolved = new Array<Pt>(cursors.length);
  for (const idx of order) {
    const slot = cursors[idx];
    if (!slot) continue;
    const pos = resolveNonOverlappingPosition(slot.at, placed);
    placed.push(pos);
    resolved[idx] = pos;
  }
  return cursors.map((c, i) => ({
    ...c,
    at: resolved[i] ?? c.at,
  }));
}
