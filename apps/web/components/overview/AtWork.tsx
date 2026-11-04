"use client";

// The analysis steps on the valley overview:
// - the question, top left
// - the status line under it: the word while the steps work (from Enter, before any step), once done the word that
//   says so, or for a question asked from the Ask that was not answered, one sentence saying why with the closed dot
// - the steps, one open at a time, with the sources each read and its last step, and Pause and Stop while they run
// - once the run is done, the row that hands over to its findings (Enter)
// - each running step's cursor at the sheet of the split land it reads, the land lighting the step in focus

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  along,
  centreOf,
  clockFraction,
  cursorPointsOf,
  lanesOf,
  outward,
  type CursorPoint,
  type Pt,
} from "../../lib/run/layout";
import type { RunModel, RunTask } from "../../lib/run/model";
import {
  AtWorkCursors,
  sheetOfTask,
  stepLine,
  taskTitles,
  type PlacedCursor,
  type Sheet,
} from "./AtWorkCursors";
import { AtWorkAgentTree } from "./AtWorkPanels";
import styles from "./AtWork.module.css";

const LANE_PX = 0;

/** A live run's clock between its events: the wall time since the command was accepted (a question asked from the
 * Ask: since Enter), never behind its last event. A replay keeps its own events' times; a recording plays on its replay
 * clock. */
function useClock(
  run: RunModel,
  fixed: number | undefined,
  paused = false,
  startedAt?: number,
): number {
  const origin = startedAt ?? (run.acceptedAt !== null ? Date.parse(run.acceptedAt) : null);
  const live =
    fixed === undefined && !run.done && !paused && run.replay === null && origin !== null;
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
  return Math.max(run.nowMs, wall - origin);
}

/** A step that did something: it read a source or a bundle, or took a step of its own. */
const didWork = (t: RunTask) => t.steps.length > 0 || t.searchedChips.length > 0;

/** A sheet of the split land: its layer and its left-most edge point on screen (design px). */
export interface SheetAnchor {
  id: string;
  left: Pt;
}

/** The cursors at the split land's sheets: each at the left edge of the sheet the land lights for its step, or of the
 *  land itself, one to a sheet; `first` names the steps that keep their sheet when two share one (the step in focus,
 *  then the primary). */
function onSheets(
  cursors: readonly CursorPoint[],
  sheets: readonly SheetAnchor[],
  land: Pt | null,
  first: readonly (string | null)[],
): PlacedCursor[] {
  const rank = (id: string) => {
    const i = first.indexOf(id);
    return i < 0 ? first.length : i;
  };
  const order = [...cursors].sort((a, b) => rank(a.task.id) - rank(b.task.id));
  const has = (id: Sheet) => sheets.some((s) => s.id === id);
  const taken = new Set<string>();
  const placed: PlacedCursor[] = [];
  for (const c of order) {
    const layer = sheetOfTask(c.task, has);
    const sheet = layer === null ? undefined : sheets.find((s) => s.id === layer);
    const at = sheet?.left ?? land;
    const key = sheet?.id ?? "land";
    if (!at || taken.has(key)) continue;
    taken.add(key);
    placed.push({
      task: c.task,
      at,
      side: "left",
      targetKind: c.targetKind,
      stratumId: c.stratumId,
    });
  }
  return placed;
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
  run: given,
  question,
  arc,
  rimLeft,
  sheets,
  nowMs: fixedNow,
  recording = null,
  onFindings,
  onFocusTask,
  onFocusCause,
  paused = false,
  onTogglePause,
  onStopRun,
  reviewRequested = false,
  startedAt,
  stopped = null,
  chosen = null,
  onBack,
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
  /** The land's left-most rim point on screen (design px): a step that reads no sheet of the split land points here. */
  rimLeft: Pt | null;
  /** The split land's sheets once the split stands, null while it moves or is settled; left out, the cursors stand by
   *  their points round the arc. */
  sheets?: readonly SheetAnchor[] | null | undefined;
  /** A Source's short citation. */
  sourceName: (id: string) => string;
  /** A recorded run's replay clock (ms of run time), in place of the wall clock. */
  nowMs?: number;
  /** Recording playback metadata when replaying a recorded run. */
  recording?: { speed: number; length: number } | null;
  /** The run's own record asks the visitor for a review, as its answer then says (Needs You). */
  reviewRequested?: boolean | undefined;
  /** A question asked from the Ask: when Enter was pressed (ms since the epoch), the moment its clock counts from. */
  startedAt?: number | undefined;
  /** A question asked from the Ask that was not answered: the sentence that says why (lib/overview/ask-line.ts). */
  stopped?: string | null | undefined;
  /** How many of the case's findings a question asked from the Ask chose (lib/ask/task.ts); null for any other run. */
  chosen?: number | null | undefined;
  /** A question asked from the Ask: Esc leaves its steps for the answer (asking a question still at work to stop). */
  onBack?: (() => void) | undefined;
}) {
  // a question that was not answered shows only the steps that did something; the reason is its status line
  const run = useMemo(
    () => (stopped === null ? given : { ...given, tasks: given.tasks.filter(didWork) }),
    [given, stopped],
  );
  const clock = useClock(run, fixedNow, paused, startedAt);
  // Once the run has completed, its time is fixed at its final event timestamp; a question asked from the Ask keeps
  // the time it counted since Enter, so its clock never steps back as it ends
  const counted = useRef(0);
  const nowMs = run.done
    ? startedAt === undefined
      ? run.nowMs
      : Math.max(run.nowMs, counted.current)
    : clock;
  useEffect(() => {
    counted.current = nowMs;
  }, [nowMs]);
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
  // the explanations' step stays open while it writes and tests them: its list is where they show during the run
  const runningTasks = staggeredNonQueued.filter((t) => t.state === "running");
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

  // the land lights the sheet the step's line names, so it follows the line as the step moves on
  const focusLine = focusedTerrainTask ? stepLine(focusedTerrainTask) : null;
  useEffect(() => {
    if (!onFocusTask) return;
    onFocusTask(focusedTerrainTask);
  }, [focusedTerrainTask?.id, focusLine, onFocusTask]);

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

  // a question that was not answered has no findings to hand over to: its ways on are Ask Again and Esc
  const done = run.done && stopped === null;
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
      } else if (ev.key === "Escape" && onBack) {
        // ahead of the overview's own Esc, which would leave the place while a question is at work
        ev.preventDefault();
        ev.stopPropagation();
        onBack();
      }
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => {
      window.removeEventListener("keydown", onKey, { capture: true });
    };
  }, [done, onBack, onFindings, onTogglePause, cycleFollow, selectedTaskId, run.tasks]);

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
  const primaryId =
    cursors.find((c) => c.task.id === activeOrRunningTask?.id)?.task.id ??
    cursors.at(-1)?.task.id ??
    null;
  const placed: PlacedCursor[] =
    sheets === undefined
      ? cursors.map((c) => ({
          task: c.task,
          at: c.at,
          side: "right",
          targetKind: c.targetKind,
          stratumId: c.stratumId,
        }))
      : sheets === null
        ? []
        : onSheets(cursors, sheets, rimLeft, [focusedTerrainTask?.id ?? null, primaryId]);
  const titles = taskTitles(run.tasks);

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
      </svg>

      <header className={styles.topLeftHeader}>
        <section className={styles.question} data-run-question>
          <h2 className={styles.asked}>{question}</h2>
        </section>
      </header>

      <AtWorkAgentTree
        run={run}
        nowMs={nowMs}
        titles={titles}
        folded={folded}
        selectedTaskId={selectedTaskId}
        setSelectedTaskId={setSelectedTaskId}
        setStepsDismissed={setStepsDismissed}
        stepsDismissed={stepsDismissed}
        onFocusCause={onFocusCause}
        onFindings={onFindings}
        paused={paused}
        onTogglePause={onTogglePause}
        onStopRun={onStopRun}
        reviewRequested={reviewRequested}
        asked={startedAt !== undefined}
        stopped={stopped}
        chosen={chosen}
      />

      <AtWorkCursors
        cursors={stopped === null ? placed : []}
        titles={titles}
        primaryId={primaryId}
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
