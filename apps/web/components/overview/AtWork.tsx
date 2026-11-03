"use client";

// Investigation thinking trace on the valley overview:
// - Top-left architectural header with the active question
// - Left-hand collapsible step accordion with horizontally scrollable dataset/literature chips and inline controls
// - Settled synthesis takeaway and direct transition to the findings and field verification plan when complete
// - Spatial task cursors across the 3D terrain synced with terrain layer lifts

import { useCallback, useEffect, useRef, useState } from "react";
import {
  along,
  centreOf,
  clockFraction,
  cursorPointsOf,
  lanesOf,
  outward,
  type Pt,
} from "../../lib/run/layout";
import type { RunModel, RunTask } from "../../lib/run/model";
import { AtWorkAgentTree, AtWorkCursors } from "./AtWorkPanels";
import styles from "./AtWork.module.css";

const LANE_PX = 0;

/** A live run's clock between its events: the wall time since the command was accepted, never behind its last event.
 * A replay keeps its own events' times; a recording plays on its replay clock. */
function useClock(run: RunModel, fixed: number | undefined, paused = false): number {
  const live =
    fixed === undefined && !run.done && !paused && run.replay === null && run.acceptedAt !== null;
  const [wall, setWall] = useState(() => Date.now());
  useEffect(() => {
    if (!live) return;
    const t = window.setInterval(() => {
      setWall(Date.now());
    }, 250);
    return () => {
      window.clearInterval(t);
    };
  }, [live]);
  if (fixed !== undefined) return fixed;
  if (!live) return run.nowMs;
  return Math.max(run.nowMs, wall - Date.parse(run.acceptedAt ?? ""));
}

function resolveTaskMatch(
  tasks: readonly RunTask[],
  key: string | null | undefined,
): string | null {
  if (!key) return null;
  const found = tasks.find((t) => t.id === key || t.kind === key);
  return found?.id ?? null;
}

export function AtWork({
  run,
  question,
  placeName: _placeName,
  arc,
  rimLeft,
  sourceName: _sourceName,
  nowMs: fixedNow,
  recording = null,
  onFindings,
  onFocusTask,
  onFocusLayer,
  onFocusCause,
  paused = false,
  onTogglePause,
  onStopRun,
}: {
  /** Opens the run's findings drawer once the investigation is complete. */
  onFindings: () => void;
  /** Syncs the 3D terrain layer carve/lift with the active or selected task. */
  onFocusTask?: (task: RunTask | null) => void;
  /** Manually focuses a specific 3D terrain layer from the inline visual breakdown. */
  onFocusLayer?: (layer: "bands" | "cover" | "trend" | "rain" | "routes" | null) => void;
  /** Focuses the 3D terrain layer corresponding to a hovered explanation cause. */
  onFocusCause?: (causeId: string) => void;
  /** Whether the active thinking run is paused for inspection. */
  paused?: boolean | undefined;
  /** Toggles pause/resume of the active thinking run. */
  onTogglePause?: (() => void) | undefined;
  /** Stops/cancels the active thinking run and returns to the overview. */
  onStopRun?: (() => void) | undefined;
  run: RunModel;
  /** The question the run answers, as it was asked. */
  question: string;
  /** Optional place name for the top-left architectural header. */
  placeName?: string;
  /** The drawn arc on screen (design px), a point every 2 degrees from the ask disc. */
  arc: readonly Pt[];
  /** The catchment's left-most rim point on screen (design px), where the proposed check is anchored. */
  rimLeft: Pt | null;
  /** A Source's short citation. */
  sourceName: (id: string) => string;
  /** A recorded run's replay clock (ms of run time), in place of the wall clock. */
  nowMs?: number;
  /** Recording playback metadata when replaying a recorded run. */
  recording?: { speed: number; length: number } | null;
}) {
  const clock = useClock(run, fixedNow, paused);
  // Once the run has completed, its time is fixed at its final event timestamp
  const nowMs = run.done ? run.nowMs : clock;
  const [folded, setFolded] = useState(true);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [hoveredTaskId, setHoveredTaskId] = useState<string | null>(null);
  const [stepsDismissed, setStepsDismissed] = useState(false);

  const nonQueuedTasks = run.tasks.filter((t) => t.state !== "queued");
  const sameStartCounts = new Map<number, number>();
  const staggeredNonQueued = nonQueuedTasks.filter((t) => {
    if (run.done || selectedTaskId === t.id || t.startMs === null) return true;
    const idxInBatch = sameStartCounts.get(t.startMs) ?? 0;
    sameStartCounts.set(t.startMs, idxInBatch + 1);
    return nowMs >= t.startMs + idxInBatch * 2200;
  });
  const runningTasks = staggeredNonQueued.filter(
    (t) => t.state === "running" && !(t.kind === "explanation_branches" && run.branches.length > 0),
  );
  const latestRunningTask = runningTasks[runningTasks.length - 1] ?? runningTasks[0] ?? null;
  const latestRunningId = latestRunningTask?.id ?? null;

  const prevLatestRunningId = useRef<string | null>(latestRunningId);
  const prevDone = useRef<boolean>(run.done);
  useEffect(() => {
    const runningChanged =
      latestRunningId !== null && latestRunningId !== prevLatestRunningId.current;
    const justFinished = run.done && !prevDone.current;
    prevLatestRunningId.current = latestRunningId;
    prevDone.current = run.done;
    if ((runningChanged || justFinished) && selectedTaskId === null) {
      setStepsDismissed(false);
    }
  }, [latestRunningId, run.done, selectedTaskId]);

  const selectedTask =
    !stepsDismissed && selectedTaskId !== null
      ? (nonQueuedTasks.find((t) => t.id === selectedTaskId) ?? null)
      : null;
  const defaultSettledTask = run.done
    ? ([...staggeredNonQueued]
        .reverse()
        .find((t) => t.steps.length > 0 || t.searchedChips.length > 0) ??
      staggeredNonQueued[0] ??
      null)
    : null;
  const activeOrRunningTask = !stepsDismissed
    ? (selectedTask ?? latestRunningTask ?? defaultSettledTask)
    : null;

  const hoveredTask =
    hoveredTaskId !== null ? (nonQueuedTasks.find((t) => t.id === hoveredTaskId) ?? null) : null;
  const focusedTerrainTask = hoveredTask ?? activeOrRunningTask;

  useEffect(() => {
    if (!onFocusTask) return;
    onFocusTask(focusedTerrainTask);
  }, [focusedTerrainTask?.id, focusedTerrainTask?.kind, focusedTerrainTask?.sublabel, onFocusTask]);

  useEffect(() => {
    const param = new URLSearchParams(
      typeof window === "undefined" ? "" : window.location.search,
    ).get("select");
    if (!param) return;
    const match = resolveTaskMatch(run.tasks, param);
    if (match) {
      setSelectedTaskId(match);
      setStepsDismissed(false);
    }
  }, [run.tasks]);

  const cycleFollow = useCallback(() => {
    const running = run.tasks.filter((t) => t.state === "running");
    const pool = running.length > 0 ? running : run.tasks.filter((t) => t.steps.length > 0);
    if (pool.length === 0) {
      setSelectedTaskId(null);
      return;
    }
    setStepsDismissed(false);
    setSelectedTaskId((cur) => {
      if (cur === null) return pool[0]?.id ?? null;
      const idx = pool.findIndex((t) => t.id === cur);
      if (idx === -1) return pool[0]?.id ?? null;
      if (pool.length === 1) return null;
      if (idx + 1 >= pool.length) return null;
      return pool[idx + 1]?.id ?? null;
    });
  }, [run.tasks]);

  const done = run.done;
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
      const t = ev.target as HTMLElement | null;
      if (t?.closest("input, textarea, [role='dialog']")) return;
      if (ev.key === "Enter" && done) {
        ev.preventDefault();
        ev.stopPropagation();
        onFindings();
      } else if ((ev.key === "p" || ev.key === "P") && !done && onTogglePause) {
        ev.preventDefault();
        ev.stopPropagation();
        onTogglePause();
      } else if (ev.key === " ") {
        ev.preventDefault();
        cycleFollow();
      } else if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
        const navTasks = run.tasks.filter((task) => task.state !== "queued");
        if (navTasks.length === 0) return;
        ev.preventDefault();
        setStepsDismissed(false);
        const dir = ev.key === "ArrowDown" ? 1 : -1;
        setSelectedTaskId((cur) => {
          const idx = cur ? navTasks.findIndex((x) => x.id === cur) : -1;
          const nextIdx =
            idx === -1
              ? dir > 0
                ? 0
                : navTasks.length - 1
              : (idx + dir + navTasks.length) % navTasks.length;
          return navTasks[nextIdx]?.id ?? null;
        });
      } else if (ev.key === "Escape" && selectedTaskId !== null) {
        ev.preventDefault();
        ev.stopPropagation();
        setSelectedTaskId(null);
      }
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => {
      window.removeEventListener("keydown", onKey, { capture: true });
    };
  }, [done, onFindings, onTogglePause, cycleFollow, selectedTaskId, run.tasks]);

  if (arc.length < 3) return null;
  const centre = centreOf(arc);
  const lanes = lanesOf(run.tasks, nowMs);
  const at = (ms: number, lane: number) =>
    outward(
      along(arc, clockFraction(ms, nowMs, run.done, recording?.length)),
      centre,
      lane * LANE_PX,
    );
  const lanePath = (from: number, to: number, lane: number) => {
    const n = 32;
    const pts = Array.from({ length: n + 1 }, (_, i) => at(from + ((to - from) * i) / n, lane));
    return pts.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  };
  const ticks = Array.from({ length: Math.floor(nowMs / 10_000) }, (_, i) => (i + 1) * 10_000);
  const head = at(nowMs, 0);
  const disc = arc[0] ?? { x: 0, y: 0 };
  const radius = Math.hypot(disc.x - centre.x, disc.y - centre.y) || 320;
  const cursors = cursorPointsOf(
    staggeredNonQueued,
    centre,
    radius,
    activeOrRunningTask?.id ?? selectedTaskId,
  );

  const check = run.checks[0] ?? null;
  const checkAt = rimLeft ? { x: rimLeft.x - 28, y: Math.max(rimLeft.y - 22, 430) } : null;

  return (
    <div
      className={styles.atWork}
      data-at-work
      data-run-layer=""
      data-done={run.done ? "" : undefined}
    >
      <svg className={styles.marks} aria-hidden="true">
        {ticks.map((ms) => {
          const a = at(ms, 0);
          const b = outward(a, centre, -7);
          return <line key={ms} className={styles.tick} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />;
        })}
        {run.tasks.map((t) => {
          const lane = lanes.get(t.id) ?? 0;
          const from = t.startMs ?? t.queuedMs;
          const to = t.endMs ?? nowMs;
          const s = at(from, lane);
          const dimmed = selectedTaskId !== null && selectedTaskId !== t.id;
          return (
            <g
              key={t.id}
              className={styles.laneGroup}
              data-run-task={t.kind}
              data-state={t.state}
              data-dimmed={dimmed ? "" : undefined}
            >
              <path
                className={t.running > 0 ? styles.laneCalling : styles.lane}
                d={lanePath(from, Math.max(to, from + 1), lane)}
              />
              <circle className={styles.taskDot} cx={s.x} cy={s.y} r={2.5} />
            </g>
          );
        })}
        <circle className={styles.head} cx={head.x} cy={head.y} r={run.done ? 3 : 4.5} />
        {check && checkAt && rimLeft ? (
          <circle className={styles.checkFoot} cx={rimLeft.x} cy={rimLeft.y} r={4} />
        ) : null}
      </svg>

      <header className={styles.topLeftHeader}>
        <section className={styles.question} data-run-question>
          <h2 className={styles.asked}>{question}</h2>
        </section>
      </header>

      <AtWorkAgentTree
        run={run}
        nowMs={nowMs}
        folded={folded}
        setFolded={setFolded}
        selectedTaskId={selectedTaskId}
        setSelectedTaskId={setSelectedTaskId}
        setStepsDismissed={setStepsDismissed}
        cycleFollow={cycleFollow}
        follow={selectedTaskId !== null}
        stepsDismissed={stepsDismissed}
        onFocusLayer={onFocusLayer}
        onFocusCause={onFocusCause}
        onFindings={onFindings}
        paused={paused}
        onTogglePause={onTogglePause}
        onStopRun={onStopRun}
      />

      <AtWorkCursors
        cursors={cursors}
        selectedTaskId={selectedTaskId}
        hoveredTaskId={hoveredTaskId}
        setHoveredTaskId={setHoveredTaskId}
        setFolded={setFolded}
        setSelectedTaskId={setSelectedTaskId}
        setStepsDismissed={setStepsDismissed}
      />
    </div>
  );
}
