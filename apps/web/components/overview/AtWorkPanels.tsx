"use client";

import type { Dispatch, SetStateAction } from "react";
import { en, format, type MessageId } from "../../lib/copy/en";
import type { CursorPoint } from "../../lib/run/layout";
import type { RunModel, RunTask, RunTaskState } from "../../lib/run/model";
import styles from "./AtWork.module.css";

const MAX_VISIBLE_STEPS = 8;
export const seconds = (ms: number) => (Math.max(0, ms) / 1000).toFixed(1);
export const usd = (microUsd: number) => (microUsd / 1e6).toFixed(2);

export const TASK_STATE_WORD: Record<RunTaskState, MessageId> = {
  queued: "task.queued",
  running: "task.running",
  succeeded: "task.done",
  partial: "task.partial",
  failed: "task.failed",
  cancelled: "task.cancelled",
};

export function taskMetaLine(t: RunTask, nowMs: number): string {
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

export function AtWorkAgentTree({
  run,
  nowMs,
  folded: expandedAll,
  setFolded: setExpandedAll,
  selectedTaskId,
  setSelectedTaskId,
  setStepsDismissed,
  cycleFollow,
}: {
  run: RunModel;
  nowMs: number;
  folded: boolean;
  setFolded: Dispatch<SetStateAction<boolean>>;
  selectedTaskId: string | null;
  setSelectedTaskId: Dispatch<SetStateAction<string | null>>;
  setStepsDismissed: Dispatch<SetStateAction<boolean>>;
  cycleFollow: () => void;
}) {
  const doneCount = run.tasks.filter((t) => t.state === "succeeded").length;
  const runningCount = run.tasks.filter((t) => t.state === "running").length;

  if (run.tasks.length === 0) return null;

  const kindCounts = new Map<string, number>();
  for (const t of run.tasks) {
    kindCounts.set(t.kind, (kindCounts.get(t.kind) ?? 0) + 1);
  }

  const visibleTasks = expandedAll
    ? run.tasks
    : run.tasks.filter((t) => t.state === "running" || selectedTaskId === t.id);
  const showTreeList = visibleTasks.length > 0 || (run.done && run.needsReview);

  const summaryText = run.done
    ? format("run.tree.foldedDone", {
        total: run.tasks.length,
        time: seconds(nowMs),
      })
    : format("run.tree.folded", {
        done: doneCount,
        total: run.tasks.length,
        running: runningCount,
      });

  return (
    <aside
      className={styles.agentTree}
      data-agent-tree=""
      data-folded={expandedAll ? "false" : "true"}
      data-chrome=""
    >
      <button
        type="button"
        className={styles.treeSummaryBtn}
        data-agent-tree-toggle=""
        data-agent-tree-summary=""
        onClick={() => {
          setExpandedAll((e) => !e);
        }}
      >
        <span className={styles.treeSummaryDot} data-done={run.done ? "" : undefined} />
        <span className={styles.treeSummaryText}>{summaryText}</span>
      </button>

      {showTreeList ? (
        <ol className={styles.treeList}>
          {visibleTasks.map((t) => {
            const isSelected = selectedTaskId === t.id;
            const isDimmed = selectedTaskId !== null && !isSelected;
            const isRunning = t.state === "running";
            const isRunningCard =
              isRunning && !(t.kind === "explanation_branches" && run.branches.length > 0);
            const showDetail = isRunning || isSelected;
            const dur =
              t.startMs !== null
                ? format("run.tree.time", {
                    time: seconds((t.endMs ?? nowMs) - t.startMs),
                  })
                : null;
            const rightLabel = !isRunning && dur ? dur : en[TASK_STATE_WORD[t.state]].text;
            const duplicateKind = (kindCounts.get(t.kind) ?? 0) > 1;
            const scopeChip = duplicateKind ? (t.searchedChips[0] ?? null) : null;

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
                  <span className={styles.treeSpineCol} aria-hidden="true">
                    <span className={styles.treeDot} data-state={t.state} />
                  </span>
                  <span className={styles.treeNodeBody}>
                    <span className={styles.treeNodeTop}>
                      <span className={styles.treeNodeName} data-state={t.state}>
                        {en[`task.kind.${t.kind}` as MessageId].text}
                        {scopeChip ? (
                          <span className={styles.treeNodeScope}> · {scopeChip}</span>
                        ) : null}
                      </span>
                      <span className={styles.treeNodeState} data-state={t.state}>
                        {rightLabel}
                      </span>
                    </span>
                    {showDetail && t.activeLabel ? (
                      <span className={styles.treeNodeActivity}>{t.activeLabel}</span>
                    ) : null}
                    {showDetail && t.startMs !== null ? (
                      <span className={styles.treeNodeMeta}>{taskMetaLine(t, nowMs)}</span>
                    ) : null}
                  </span>
                </button>
              </li>
            );
          })}
          {run.done && run.needsReview ? (
            <li className={styles.treeReviewRow} data-agent-review="">
              <span className={styles.treeSpineCol} aria-hidden="true">
                <span className={styles.treeDot} data-state="review" />
              </span>
              <span className={styles.treeReviewLabel}>{en["run.tree.review"].text}</span>
              <span className={styles.needsYouWord} data-needs-you="">
                {en["run.tree.needsYou"].text}
              </span>
            </li>
          ) : null}
        </ol>
      ) : null}

      {selectedTaskId !== null ? (
        <div className={styles.treeFoot}>
          <button
            type="button"
            className={styles.followBtn}
            data-agent-follow=""
            onClick={cycleFollow}
          >
            <span>{en["run.tree.followAll"].text}</span>
          </button>
        </div>
      ) : null}
    </aside>
  );
}

export function AtWorkCursors({
  cursors,
  selectedTaskId,
  setSelectedTaskId,
  setStepsDismissed,
}: {
  cursors: readonly CursorPoint[];
  selectedTaskId: string | null;
  setSelectedTaskId: Dispatch<SetStateAction<string | null>>;
  setStepsDismissed: Dispatch<SetStateAction<boolean>>;
}) {
  return (
    <>
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
            <span className={styles.cursorRing} data-target-kind={c.targetKind}>
              <span className={styles.cursorDot} />
            </span>
            <span className={styles.cursorStem} aria-hidden="true" />
            <span className={styles.cursorCallout}>
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
    </>
  );
}

export function AtWorkThinkingCard({
  thinkingTask,
  nowMs,
  setSelectedTaskId,
  setStepsDismissed,
}: {
  thinkingTask: RunTask;
  nowMs: number;
  setSelectedTaskId: Dispatch<SetStateAction<string | null>>;
  setStepsDismissed: Dispatch<SetStateAction<boolean>>;
}) {
  const isDone = thinkingTask.endMs !== null;
  const visibleSteps = thinkingTask.steps.slice(-MAX_VISIBLE_STEPS);
  return (
    <aside
      className={styles.thinkingCard}
      data-agent-thinking={thinkingTask.kind}
      data-chrome=""
    >
      <div className={styles.thinkingHeader}>
        <span className={styles.thinkingHeaderLeft}>
          <span
            className={styles.thinkingBadge}
            data-state={isDone ? "done" : "running"}
          >
            {
              en[
                isDone
                  ? "run.thinking.finished"
                  : TASK_STATE_WORD[thinkingTask.state]
              ].text
            }
          </span>
          <span className={styles.thinkingKicker}>{en["run.thinking.kicker"].text}</span>
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
      </div>

      <div className={styles.thinkingIdentityBox}>
        <p className={styles.thinkingTitle}>
          {en[`task.kind.${thinkingTask.kind}` as MessageId].text}
        </p>
        <p className={styles.thinkingMeta}>{taskMetaLine(thinkingTask, nowMs)}</p>
      </div>

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

      {visibleSteps.length > 0 ? (
        <div className={styles.thinkingBlock}>
          <p className={styles.thinkingSublabel}>{en["run.thinking.steps"].text}</p>
          <ol className={styles.stepList} data-thinking-steps="">
            {visibleSteps.map((s, idx) => {
              const isActiveStep = !isDone && idx === visibleSteps.length - 1;
              const visualStatus = isActiveStep ? "running" : s.status;
              return (
                <li
                  key={s.id}
                  className={styles.stepRow}
                  data-thinking-step={s.status}
                  data-active={isActiveStep ? "" : undefined}
                >
                  <span className={styles.stepRailCol} aria-hidden="true">
                    <span className={styles.stepDot} data-status={visualStatus} />
                  </span>
                  <span className={styles.stepLabel}>{s.label}</span>
                  <span className={styles.stepTime}>
                    {format("run.tree.time", { time: seconds(s.ms) })}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      ) : null}
    </aside>
  );
}
