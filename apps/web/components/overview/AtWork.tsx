"use client";

// A question at work on the overview (U29, the founder's specimen R "Muse Spark at work", upgraded for Section 8 AI
// View), from the command's own event stream through the run model: the drawn arc is the run's clock from the ask
// disc; each task runs along a lane (heavier while its model call runs); the Agent Tree at the left edge lists the
// orchestrator and tasks with status, model, time and stored cost (plus "Needs you" when review is ready); Agent
// Cursors sit on the land strata and source sector from real tool events; and selecting a task opens its Steps
// card while dimming sibling lanes.

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Control } from "../controls/Control";
import { en, format, type MessageId } from "../../lib/copy/en";
import {
  along,
  centreOf,
  clockFraction,
  cursorPointsOf,
  lanesOf,
  outward,
  type Pt,
} from "../../lib/run/layout";
import type { RunModel, RunTask, RunTaskState } from "../../lib/run/model";
import styles from "./AtWork.module.css";

const LANE_PX = 14;
/** Maximum steps shown at once in the right-hand Agent Steps panel so the layout stays balanced. */
const MAX_VISIBLE_STEPS = 8;
const seconds = (ms: number) => (Math.max(0, ms) / 1000).toFixed(1);
const usd = (microUsd: number) => (microUsd / 1e6).toFixed(2);

/** A live run's clock between its events: the wall time since the command was accepted, never behind its last event.
 * A replay keeps its own events' times; a recording plays on its replay clock. */
function useClock(run: RunModel, fixed: number | undefined): number {
  const live = fixed === undefined && !run.done && run.replay === null && run.acceptedAt !== null;
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

/** The open explanations first, the contradicted after them (the reference study: what needs a person first). */
const RANK: Record<string, number> = {
  consistent: 0,
  cannot_be_assessed: 1,
  sealed: 2,
  contradicted: 3,
};

const STATUS: Record<string, MessageId> = {
  consistent: "run.branch.consistent",
  contradicted: "run.branch.contradicted",
  cannot_be_assessed: "run.branch.cannot",
};

const TASK_STATE_WORD: Record<RunTaskState, MessageId> = {
  queued: "task.queued",
  running: "task.running",
  succeeded: "task.done",
  partial: "task.partial",
  failed: "task.failed",
  cancelled: "task.cancelled",
};

/** The day a run was asked, as the recording's note gives it ("30 Oct 2026"). */
const dayOf = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      })
    : "";

function resolveTaskMatch(
  tasks: readonly RunTask[],
  key: string | null | undefined,
): string | null {
  if (!key) return null;
  const found = tasks.find((t) => t.id === key || t.kind === key);
  return found?.id ?? null;
}

function taskMetaLine(t: RunTask, nowMs: number): string {
  const dur = seconds((t.endMs ?? nowMs) - (t.startMs ?? t.queuedMs));
  if (t.model && t.costMicroUsd !== null) {
    return format("run.tree.metaCost", {
      model: t.model,
      time: dur,
      cost: usd(t.costMicroUsd),
    });
  }
  if (t.model) {
    return format("run.tree.meta", { model: t.model, time: dur });
  }
  return format("run.tree.time", { time: dur });
}

export function AtWork({
  run,
  question,
  arc,
  rimLeft,
  sourceName: _sourceName,
  nowMs: fixedNow,
  recording = null,
  onFindings,
}: {
  /** Opens the run's findings (the results), once it is done: the question card's Enter (decision 15). */
  onFindings: () => void;
  run: RunModel;
  /** The question the run answers, as it was asked. */
  question: string;
  /** The drawn arc on screen (design px), a point every 2 degrees from the ask disc. */
  arc: readonly Pt[];
  /** The catchment's left-most rim point on screen (design px), where the proposed check is anchored. */
  rimLeft: Pt | null;
  /** A Source's short citation (kept for the findings' reading card). */
  sourceName: (id: string) => string;
  /** A recorded run's replay clock (ms of run time), in place of the wall clock. */
  nowMs?: number;
  /** The run shown is a recording (the development harness), at this speed and of this length (ms); it says so at
   * the edge. */
  recording?: { speed: number; length: number } | null;
}) {
  const nowMs = useClock(run, fixedNow);
  const [hovered, setHovered] = useState<string | null>(null);
  const [folded, setFolded] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [stepsDismissed, setStepsDismissed] = useState(false);

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
      if (idx === -1 || idx + 1 >= pool.length) return null;
      return pool[idx + 1]?.id ?? null;
    });
  }, [run.tasks]);

  // once done, Enter opens the findings (before the overview's own keys); Space cycles followed agent
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
      } else if (ev.key === " ") {
        ev.preventDefault();
        cycleFollow();
      } else if (ev.key === "Escape" && selectedTaskId !== null) {
        ev.preventDefault();
        setSelectedTaskId(null);
      }
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => {
      window.removeEventListener("keydown", onKey, { capture: true });
    };
  }, [done, onFindings, cycleFollow, selectedTaskId]);

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
  const cursors = cursorPointsOf(run.tasks, centre, radius);

  const count = (l: string) => run.findings.filter((f) => f.lands === l).length;
  const counts = [
    { n: count("source"), id: "run.count.checked" as const, mark: "●" },
    { n: count("land"), id: "run.count.computed" as const, mark: "◆" },
    { n: count("unchecked"), id: "run.count.unchecked" as const, mark: "○" },
  ].filter((c) => c.n > 0);

  const check = run.checks[0] ?? null;
  const checkAt = rimLeft ? { x: rimLeft.x - 28, y: Math.max(rimLeft.y - 22, 430) } : null;
  const selectedTask =
    selectedTaskId !== null ? (run.tasks.find((t) => t.id === selectedTaskId) ?? null) : null;
  // While tasks are running and no agent is explicitly isolated, show the active running agent's steps on the right
  const autoThinkingTask =
    selectedTask === null && !run.done && !stepsDismissed
      ? ([...run.tasks]
          .filter((t) => t.state === "running" && t.steps.length > 0)
          .sort(
            (a, b) => b.steps.length - a.steps.length || (b.startMs ?? 0) - (a.startMs ?? 0),
          )[0] ??
        run.tasks.find((t) => t.state === "running") ??
        null)
      : null;
  const thinkingTask = selectedTask ?? autoThinkingTask;
  const selectedCursor =
    selectedTask !== null ? (cursors.find((c) => c.task.id === selectedTask.id) ?? null) : null;
  const doneCount = run.tasks.filter((t) => t.state === "succeeded").length;
  const runningCount = run.tasks.filter((t) => t.state === "running").length;

  // a recording or a replay says so at the edge, with the chrome
  let note: ReactNode = null;
  if (recording)
    note = (
      <aside className={styles.recording} data-chrome="" data-run-replay>
        <p className={styles.recTitle}>
          {format("run.recorded.title", { date: dayOf(run.acceptedAt) })}
        </p>
        <p className={styles.recDetail}>
          {format("run.recorded.detail", { speed: recording.speed })}
        </p>
      </aside>
    );
  else if (run.replay)
    note = (
      <aside className={styles.recording} data-chrome="" data-run-replay>
        <p className={styles.recTitle}>
          {en[run.replay === "synthetic" ? "run.replayed" : "run.recorded"].text}
        </p>
      </aside>
    );

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
        {selectedTask && selectedCursor ? (
          <line
            className={styles.leader}
            x1={at(selectedTask.endMs ?? nowMs, lanes.get(selectedTask.id) ?? 0).x}
            y1={at(selectedTask.endMs ?? nowMs, lanes.get(selectedTask.id) ?? 0).y}
            x2={selectedCursor.at.x}
            y2={selectedCursor.at.y}
          />
        ) : null}
        <circle className={styles.head} cx={head.x} cy={head.y} r={run.done ? 3 : 4.5} />
        {check && checkAt && rimLeft ? (
          <>
            <line
              className={styles.checkLeader}
              x1={checkAt.x}
              y1={checkAt.y + 9}
              x2={rimLeft.x}
              y2={rimLeft.y}
            />
            <circle className={styles.checkFoot} cx={rimLeft.x} cy={rimLeft.y} r={4} />
          </>
        ) : null}
      </svg>

      {/* Section 8: Agent Tree at the left edge */}
      {run.tasks.length > 0 ? (
        <aside
          className={styles.agentTree}
          data-agent-tree=""
          data-folded={folded ? "true" : "false"}
          data-chrome=""
        >
          <div className={styles.treeHeader}>
            <span className={styles.treeTitle}>{en["run.tree.title"].text}</span>
            <button
              type="button"
              className={styles.treeToggle}
              data-agent-tree-toggle=""
              onClick={() => {
                setFolded((f) => !f);
              }}
            >
              {en[folded ? "run.tree.expand" : "run.tree.fold"].text}
            </button>
          </div>
          {folded ? (
            <p className={styles.treeSummary} data-agent-tree-summary="">
              {run.done
                ? format("run.tree.foldedDone", {
                    total: run.tasks.length,
                    time: seconds(nowMs),
                  })
                : format("run.tree.folded", {
                    done: doneCount,
                    total: run.tasks.length,
                    running: runningCount,
                  })}
            </p>
          ) : (
            <>
              <ol className={styles.treeList}>
                {run.tasks.map((t) => {
                  const isSelected = selectedTaskId === t.id;
                  const isDimmed = selectedTaskId !== null && !isSelected;
                  const isRunningCard =
                    t.state === "running" &&
                    !(t.kind === "explanation_branches" && run.branches.length > 0);
                  return (
                    <li
                      key={t.id}
                      className={styles.treeNode}
                      data-agent-node={t.kind}
                      data-agent-state={t.state}
                      data-run-card={isRunningCard ? t.kind : undefined}
                      data-selected={isSelected ? "" : undefined}
                      data-dimmed={isDimmed ? "" : undefined}
                    >
                      <button
                        type="button"
                        className={styles.treeNodeBtn}
                        onClick={() => {
                          setStepsDismissed(false);
                          setSelectedTaskId((cur) => (cur === t.id ? null : t.id));
                        }}
                      >
                        <span className={styles.treeDot} data-state={t.state} />
                        <span className={styles.treeNodeBody}>
                          <span className={styles.treeNodeTop}>
                            <span className={styles.treeNodeName}>
                              {en[`task.kind.${t.kind}` as MessageId].text}
                            </span>
                            <span className={styles.treeNodeState} data-state={t.state}>
                              {en[TASK_STATE_WORD[t.state]].text}
                            </span>
                          </span>
                          {t.startMs !== null ? (
                            <span className={styles.treeNodeMeta}>{taskMetaLine(t, nowMs)}</span>
                          ) : null}
                        </span>
                      </button>
                    </li>
                  );
                })}
                {run.done && run.needsReview ? (
                  <li className={styles.treeReviewRow} data-agent-review="">
                    <span className={styles.treeDot} data-state="review" />
                    <span className={styles.treeReviewLabel}>{en["run.tree.review"].text}</span>
                    <span className={styles.needsYouPill} data-needs-you="">
                      {en["run.tree.needsYou"].text}
                    </span>
                  </li>
                ) : null}
              </ol>
              <div className={styles.treeFoot}>
                <button
                  type="button"
                  className={styles.followBtn}
                  data-agent-follow=""
                  onClick={cycleFollow}
                >
                  <span>
                    {en[selectedTaskId !== null ? "run.tree.followAll" : "run.tree.follow"].text}
                  </span>
                </button>
              </div>
            </>
          )}
        </aside>
      ) : null}

      {/* Section 8: Agent Cursors on the land strata and sources, strictly from real tool events */}
      {cursors.map((c) => {
        const isSelected = selectedTaskId === c.task.id;
        const isDimmed = selectedTaskId !== null && !isSelected;
        return (
          <button
            key={c.task.id}
            type="button"
            className={styles.agentCursor}
            style={{ left: `${c.at.x.toFixed(1)}px`, top: `${c.at.y.toFixed(1)}px` }}
            data-agent-cursor={c.task.kind}
            data-target-kind={c.targetKind}
            data-stratum={c.stratumId ?? undefined}
            data-selected={isSelected ? "" : undefined}
            data-dimmed={isDimmed ? "" : undefined}
            data-chrome=""
            onClick={() => {
              setStepsDismissed(false);
              setSelectedTaskId((cur) => (cur === c.task.id ? null : c.task.id));
            }}
          >
            <span className={styles.cursorPin} data-target-kind={c.targetKind} />
            <span className={styles.cursorFlag}>
              <span className={styles.cursorTask}>
                {en[`task.kind.${c.task.kind}` as MessageId].text}
              </span>
              <span className={styles.cursorLabel} data-cursor-label="">
                {c.label}
              </span>
            </span>
          </button>
        );
      })}

      {/* Section 8: Per-agent Steps / Thinking State card at the right */}
      {thinkingTask ? (
        <aside
          className={styles.thinkingCard}
          data-agent-thinking={thinkingTask.kind}
          data-chrome=""
        >
          <div className={styles.thinkingHeader}>
            <span className={styles.thinkingKicker}>{en["run.thinking.kicker"].text}</span>
            <span className={styles.thinkingHeaderRight}>
              <span
                className={styles.thinkingBadge}
                data-state={thinkingTask.endMs !== null ? "done" : "running"}
              >
                {
                  en[
                    thinkingTask.endMs !== null
                      ? "run.thinking.finished"
                      : TASK_STATE_WORD[thinkingTask.state]
                  ].text
                }
              </span>
              <button
                type="button"
                className={styles.thinkingClose}
                data-thinking-close=""
                onClick={() => {
                  setSelectedTaskId(null);
                  setStepsDismissed(true);
                }}
              >
                {en["run.thinking.close"].text}
              </button>
            </span>
          </div>
          <p className={styles.thinkingTitle}>
            {en[`task.kind.${thinkingTask.kind}` as MessageId].text}
          </p>
          <p className={styles.thinkingMeta}>{taskMetaLine(thinkingTask, nowMs)}</p>
          {thinkingTask.searchedChips.length > 0 ? (
            <div className={styles.thinkingBlock}>
              <p className={styles.thinkingSublabel}>{en["run.thinking.searched"].text}</p>
              <ul className={styles.chipList} data-thinking-chips="">
                {thinkingTask.searchedChips.map((chip) => (
                  <li key={chip} className={styles.chip} data-thinking-chip="">
                    {chip}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {thinkingTask.steps.length > 0 ? (
            <div className={styles.thinkingBlock}>
              <p className={styles.thinkingSublabel}>{en["run.thinking.steps"].text}</p>
              <ol className={styles.stepList} data-thinking-steps="">
                {thinkingTask.steps.slice(-MAX_VISIBLE_STEPS).map((s) => (
                  <li key={s.id} className={styles.stepRow} data-thinking-step={s.status}>
                    <span className={styles.stepDot} data-status={s.status} />
                    <span className={styles.stepLabel}>{s.label}</span>
                    <span className={styles.stepTime}>
                      {format("run.tree.time", { time: seconds(s.ms) })}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
        </aside>
      ) : null}

      {/* the question beside the ask disc: its findings so far, then how many in how long, by their words */}
      <section
        className={styles.question}
        style={{
          right: `${(1440 - disc.x + 78).toFixed(1)}px`,
          bottom: `${(900 - disc.y - 40).toFixed(1)}px`,
        }}
        data-run-question
      >
        <h2 className={styles.asked}>{question}</h2>
        <p className={styles.sofar} data-run-status>
          {run.done
            ? format("run.findings", { n: run.findings.length, time: seconds(nowMs) })
            : format("run.sofar", { n: run.findings.length })}
        </p>
        {run.done ? (
          <div className={styles.open} data-action-prompt="">
            <Control keyHint="↵" keyShortcut="Enter" onClick={onFindings} data-run-open-findings="">
              {en["run.open"].text}
            </Control>
          </div>
        ) : null}
        {counts.length ? (
          <p className={styles.counts} data-run-findings>
            {counts.map((c) => (
              <span key={c.id} className={styles.countItem} data-gather={c.id}>
                <span className={styles.mark} aria-hidden="true">
                  {c.mark}
                </span>
                {format(c.id, { n: c.n })}
              </span>
            ))}
          </p>
        ) : null}
      </section>

      {/* explanations: sealed when written, scored when the merge commits; the contradicted step back; a reason on
          hover */}
      {run.branches.length ? (
        <ul
          className={styles.branches}
          style={thinkingTask ? { top: "496px" } : undefined}
          data-run-branches
        >
          {[...run.branches]
            .sort((a, b) => (RANK[a.status ?? "sealed"] ?? 2) - (RANK[b.status ?? "sealed"] ?? 2))
            .map((b) => {
              const word = b.status
                ? (STATUS[b.status] ?? "run.branch.sealed")
                : "run.branch.sealed";
              return (
                <li
                  key={b.id}
                  className={styles.branch}
                  data-status={b.status ?? "sealed"}
                  onPointerEnter={() => {
                    setHovered(b.id);
                  }}
                  onPointerLeave={() => {
                    setHovered((h) => (h === b.id ? null : h));
                  }}
                >
                  <span className={styles.branchRow}>
                    <span>{b.label}</span>
                    <span className={styles.branchWord}>{en[word].text}</span>
                  </span>
                  {hovered === b.id && b.reason ? (
                    <span className={styles.reason}>{b.reason}</span>
                  ) : null}
                </li>
              );
            })}
        </ul>
      ) : null}

      {/* the proposed field check, on its leader to the catchment it is for */}
      {check && checkAt ? (
        <section
          className={styles.check}
          style={{ right: `${(1440 - checkAt.x).toFixed(1)}px`, top: `${checkAt.y.toFixed(1)}px` }}
          data-run-check
        >
          <p className={styles.checkKicker}>{en["run.check.kicker"].text}</p>
          <p className={styles.checkLabel}>{check.label}</p>
        </section>
      ) : null}

      {/* a recording says so, at the edge with the chrome */}
      {note}
    </div>
  );
}
