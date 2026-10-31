"use client";

// A question at work on the overview (U29, the founder's specimen R "Muse Spark at work"), from the command's own
// event stream through the run model: the drawn arc is the run's clock from the ask disc; each task runs along a lane
// (heavier while its model call runs). Decision 16 holds the words to what runs now and what the run settled: the
// question beside the ask disc with its count of findings and their verification words; a card for each task that is
// running now (two at most), folded to its lane when done; the explanations sealed, then scored by the merge, with a
// reason on hover; the proposed field check on a leader to the catchment's edge. A recorded run says so at the edge.
// Nothing is invented: every word, number and time is a record field or an event's.

import { useEffect, useState, type ReactNode } from "react";
import { Control } from "../controls/Control";
import { en, format, type MessageId } from "../../lib/copy/en";
import { along, centreOf, clockFraction, lanesOf, outward, type Pt } from "../../lib/run/layout";
import type { RunModel, RunTask } from "../../lib/run/model";
import styles from "./AtWork.module.css";

const LANE_PX = 14;
/** A running task's card: its height on screen, and its gap from the arc. */
const CARD_H = 44;
/** At most this many running tasks have words at once (decision 16); the others run on their lanes. */
const CARDS = 2;
/** A task card's width at most (design px), for keeping it on screen. */
const CARD_W = 250;
/** The running tasks' column: its first card's middle (design px), under the case question at the top left. */
const COLUMN_TOP = 190;
const seconds = (ms: number) => (ms / 1000).toFixed(1);

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
  // once done, Enter opens the findings (before the overview's own keys)
  const done = run.done;
  useEffect(() => {
    if (!done) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== "Enter" || ev.metaKey || ev.ctrlKey || ev.altKey) return;
      const t = ev.target as HTMLElement | null;
      if (t?.closest("input, textarea, [role='dialog']")) return;
      ev.preventDefault();
      ev.stopPropagation();
      onFindings();
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => {
      window.removeEventListener("keydown", onKey, { capture: true });
    };
  }, [done, onFindings]);
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

  const count = (l: string) => run.findings.filter((f) => f.lands === l).length;
  const counts = [
    { n: count("source"), id: "run.count.checked" as const, mark: "●" },
    { n: count("land"), id: "run.count.computed" as const, mark: "◆" },
    { n: count("unchecked"), id: "run.count.unchecked" as const, mark: "○" },
  ].filter((c) => c.n > 0);

  // the tasks running now, the latest started first: a card each for the first two, beside its lane's head
  // (once the explanations are written, their column speaks for the task that writes them)
  const running = run.tasks
    .filter(
      (t) =>
        t.state === "running" && !(t.kind === "explanation_branches" && run.branches.length > 0),
    )
    .sort((a, b) => (b.startMs ?? 0) - (a.startMs ?? 0))
    .slice(0, CARDS);
  // the specimen's column at the left, outside every lane: one card under another, each on a hairline to its lane's
  // head, so no card crosses a lane or the land wherever the head has come to
  const outer = Math.max(0, ...run.tasks.map((t) => lanes.get(t.id) ?? 0));
  const columnRight = Math.min(...arc.map((p) => p.x)) - 28 - outer * LANE_PX;
  const cards = running.map((t, i) => ({
    t,
    x: Math.max(40 + CARD_W, columnRight),
    y: COLUMN_TOP + i * (CARD_H + 12),
    left: true,
  }));
  const taskLine = (t: RunTask) => {
    const time = seconds(nowMs - (t.startMs ?? nowMs));
    if (!t.model) return format("run.task.waiting", { time });
    const calls = t.calls + t.running;
    return calls === 1
      ? format("run.task.one", { model: t.model, time })
      : format("run.task.many", { model: t.model, calls, time });
  };

  const check = run.checks[0] ?? null;
  const checkAt = rimLeft ? { x: rimLeft.x - 28, y: rimLeft.y - 22 } : null;

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
          return (
            <g key={t.id} data-run-task={t.kind} data-state={t.state}>
              <path
                className={t.running > 0 ? styles.laneCalling : styles.lane}
                d={lanePath(from, Math.max(to, from + 1), lane)}
              />
              <circle className={styles.taskDot} cx={s.x} cy={s.y} r={2.5} />
            </g>
          );
        })}
        {cards.map(({ t, x, y }) => {
          const a = at(nowMs, lanes.get(t.id) ?? 0);
          return <line key={t.id} className={styles.leader} x1={a.x} y1={a.y} x2={x + 10} y2={y} />;
        })}
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

      {/* what runs now: its name, its model, its calls and time beside its lane's head */}
      {cards.map(({ t, x, y, left }) => (
        <div
          key={t.id}
          className={styles.taskCard}
          data-side={left ? "left" : "right"}
          style={{ left: `${x.toFixed(1)}px`, top: `${y.toFixed(1)}px` }}
          data-run-card={t.kind}
        >
          <span className={styles.taskName}>{en[`task.kind.${t.kind}` as MessageId].text}</span>
          <span className={styles.taskLine}>{taskLine(t)}</span>
        </div>
      ))}

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
        <ul className={styles.branches} data-run-branches>
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
