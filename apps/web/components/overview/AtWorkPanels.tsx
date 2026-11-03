"use client";

import type { CSSProperties, Dispatch, SetStateAction } from "react";
import { en, format, type MessageId } from "../../lib/copy/en";
import type { RunBranch, RunModel, RunTask, RunTaskState } from "../../lib/run/model";
import { AtWorkCursors, agentAccentColor, humanTaskTitle } from "./AtWorkCursors";
import { ScrollableThinkingChips } from "./ScrollableThinkingChips";
import styles from "./AtWork.module.css";

export { AtWorkCursors, ScrollableThinkingChips, agentAccentColor, humanTaskTitle };

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

/** Open explanations first, contradicted explanations after them so items requiring field checks surface first. */
const RANK: Record<string, number> = {
  consistent: 0,
  cannot_be_assessed: 1,
  sealed: 2,
  contradicted: 3,
};

const BRANCH_SHORT_STATUS: Record<string, string> = {
  consistent: "Supported",
  cannot_be_assessed: "Needs field data",
  contradicted: "Ruled out",
  sealed: "Checking",
};

export function taskMetaLine(t: RunTask, nowMs: number): string {
  const dur = seconds((t.endMs ?? nowMs) - (t.startMs ?? t.queuedMs));
  if (t.model) {
    return format("run.tree.meta", { model: t.model, time: dur });
  }
  return format("run.tree.time", { time: dur });
}

function buildSettledTakeaway(branches: readonly RunBranch[], checkLabel: string | null): string {
  const supported = branches.filter((b) => b.status === "consistent");
  const open = branches.filter((b) => b.status === "cannot_be_assessed");
  const ruledOut = branches.filter((b) => b.status === "contradicted");

  if (open.length > 0 && ruledOut.length > 0) {
    const openNames = open.map((b) => b.label.toLowerCase()).join(" and ");
    const supPart =
      supported.length > 0
        ? `supports ${supported.map((b) => b.label.toLowerCase()).join(" and")} and `
        : "";
    return `Satellite data ${supPart}rules out ${String(ruledOut.length)} causes, while ${openNames} requires an on-the-ground check${checkLabel ? ` (${checkLabel})` : ""}.`;
  }
  if (open.length > 0) {
    const openNames = open.map((b) => b.label.toLowerCase()).join(" and ");
    return `Whether ${openNames} contributed cannot be separated from space and needs an on-the-ground check.`;
  }
  return "All candidate causes have been evaluated against the case record.";
}

export function AtWorkAgentTree({
  run,
  nowMs,
  folded: expandedAll,
  setFolded: _setExpandedAll,
  selectedTaskId,
  setSelectedTaskId,
  setStepsDismissed,
  cycleFollow: _cycleFollow,
  follow: _follow = false,
  stepsDismissed = false,
  onFocusCause,
  onFindings,
  paused = false,
  onTogglePause,
  onStopRun,
}: {
  run: RunModel;
  nowMs: number;
  folded: boolean;
  setFolded: Dispatch<SetStateAction<boolean>>;
  selectedTaskId: string | null;
  setSelectedTaskId: Dispatch<SetStateAction<string | null>>;
  setStepsDismissed: Dispatch<SetStateAction<boolean>>;
  cycleFollow: () => void;
  follow?: boolean;
  stepsDismissed?: boolean;
  onFocusLayer?:
    | ((layer: "bands" | "cover" | "trend" | "rain" | "routes" | null) => void)
    | undefined;
  onFocusCause?: ((causeId: string) => void) | undefined;
  onFindings?: (() => void) | undefined;
  paused?: boolean | undefined;
  onTogglePause?: (() => void) | undefined;
  onStopRun?: (() => void) | undefined;
}) {
  const kindCounts = new Map<string, number>();
  for (const t of run.tasks) {
    kindCounts.set(t.kind, (kindCounts.get(t.kind) ?? 0) + 1);
  }

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
  const primaryRunning =
    runningTasks.length > 0
      ? ((selectedTaskId ? runningTasks.find((t) => t.id === selectedTaskId) : null) ??
        runningTasks[runningTasks.length - 1] ??
        runningTasks[0] ??
        null)
      : null;

  if (run.tasks.length === 0) return null;

  const visibleTasks = expandedAll
    ? staggeredNonQueued
    : staggeredNonQueued.filter((t) => t.state === "running" || selectedTaskId === t.id);
  const showTreeList = visibleTasks.length > 0 || (run.done && run.needsReview);

  const defaultSettledTask = run.done
    ? ([...visibleTasks].reverse().find((t) => t.steps.length > 0 || t.searchedChips.length > 0) ??
      visibleTasks[0] ??
      null)
    : null;
  const selectedTask =
    !stepsDismissed && selectedTaskId !== null
      ? (nonQueuedTasks.find((t) => t.id === selectedTaskId) ?? null)
      : null;
  const expandedTask = !stepsDismissed
    ? (selectedTask ?? primaryRunning ?? (run.done ? defaultSettledTask : null))
    : null;

  let obsSeen = 0;

  return (
    <div className={styles.leftRailSystem}>
      <aside
        className={styles.agentTree}
        data-agent-tree=""
        data-folded={expandedAll ? "false" : "true"}
      >
        <div className={styles.thinkingHeader}>
          {run.done ? (
            <span className={styles.thinkingDoneDot} aria-hidden="true" data-chrome="" />
          ) : null}
          <span
            className={styles.thinkingWord}
            data-active={!run.done && !paused ? "" : undefined}
            data-done={run.done ? "" : undefined}
            data-chrome=""
          >
            {run.done ? "Analysis complete" : "Thinking"}
          </span>
          <span className={styles.thinkingTime} data-chrome="">
            {format("run.tree.time", { time: seconds(nowMs) })}
          </span>
          {run.done && run.findings.length > 0 ? (
            <span className={styles.thinkingFindingsBadge} data-chrome="">
              {`${String(run.findings.length)} findings`}
            </span>
          ) : null}
          {!run.done && paused ? (
            <span className={styles.thinkingPausedBadge} data-chrome="">
              {"Paused"}
            </span>
          ) : null}
          <span className={styles.srOnly} data-run-status>
            {run.done
              ? format("run.findings", { n: run.findings.length, time: seconds(nowMs) })
              : format("run.sofar", { n: run.findings.length })}
          </span>
        </div>

        {showTreeList ? (
          <ol className={styles.treeList}>
            {visibleTasks.map((t, idx) => {
              const fullIdx = run.tasks.findIndex((x) => x.id === t.id);
              const accent = agentAccentColor(t, fullIdx >= 0 ? fullIdx : idx);
              const isRoot = t.kind === "plan" || idx === 0;
              const isSelected = selectedTaskId === t.id;
              const isDimmed = selectedTaskId !== null && !isSelected;
              const isRunning = t.state === "running";
              const isPrimaryRunning = primaryRunning?.id === t.id;
              const isExpanded = expandedTask?.id === t.id;
              const isActiveHighlight = isExpanded || (expandedTask === null && isPrimaryRunning);
              const duplicateKind = (kindCounts.get(t.kind) ?? 0) > 1;
              const obsIdx = t.kind === "observation_analysis" ? obsSeen++ : 0;
              const taskTitle = humanTaskTitle(t, duplicateKind, obsIdx);
              const unknownBundle = en["results.unknownBundle"].text;
              const unknownSource = en["results.unknownSource"].text;
              const chipSource = (
                t.searchedChips.length > 0
                  ? t.searchedChips
                  : [...(t.bundleLabels ?? []), ...(t.sourceCitations ?? [])]
              ).filter((c) => c && c !== unknownBundle && c !== unknownSource);
              const summaryStep = t.steps.length > 0 ? (t.steps[t.steps.length - 1] ?? null) : null;
              const stepSourceMeta = summaryStep?.target?.sourceId
                ? run.sourceMetaById?.[summaryStep.target.sourceId]
                : undefined;
              const fallbackStepText =
                t.kind === "instrument_composition" || t.kind === "view" || t.kind === "view_order"
                  ? "Ordered findings and views for the briefing"
                  : t.kind === "plan"
                    ? en["run.step.plan"].text
                    : t.sublabel
                      ? `Checking ${t.sublabel.toLowerCase()}`
                      : en["run.step.readCatchment"].text;
              const shouldShimmer =
                !run.done &&
                !paused &&
                isPrimaryRunning &&
                (summaryStep ? summaryStep.status === "running" || isRunning : isRunning);

              return (
                <li
                  key={t.id}
                  className={styles.treeNode}
                  style={
                    {
                      "--agent-color": accent,
                      "--node-delay": run.done ? idx * 24 : 0,
                    } as CSSProperties
                  }
                  data-run-task={t.kind}
                  data-agent-node={t.kind}
                  data-agent-state={t.state}
                  data-root={isRoot ? "" : undefined}
                  data-selected={isSelected ? "" : undefined}
                  data-expanded={isExpanded ? "" : undefined}
                  data-active-node={isActiveHighlight ? "" : undefined}
                  data-dimmed={isDimmed ? "" : undefined}
                >
                  <button
                    type="button"
                    className={styles.treeNodeBtn}
                    aria-expanded={isExpanded}
                    aria-label={taskTitle}
                    data-run-card={!run.done && isPrimaryRunning ? t.kind : undefined}
                    data-chrome={run.done || isPrimaryRunning ? undefined : ""}
                    onClick={() => {
                      if (isExpanded) {
                        setStepsDismissed(true);
                        setSelectedTaskId(null);
                      } else {
                        setStepsDismissed(false);
                        setSelectedTaskId(t.id);
                      }
                    }}
                  >
                    <span
                      className={styles.treeNodeBullet}
                      data-state={t.state}
                      data-selected={isSelected ? "" : undefined}
                      aria-hidden="true"
                      data-chrome=""
                    />

                    <span className={styles.treeNodeName} data-state={t.state}>
                      {taskTitle}
                    </span>

                    <svg
                      className={styles.treeNodeChevron}
                      data-expanded={isExpanded ? "" : undefined}
                      width="12"
                      height="12"
                      viewBox="0 0 12 12"
                      fill="none"
                      aria-hidden="true"
                      data-chrome=""
                    >
                      <path
                        d="M4.5 2.75L7.75 6L4.5 9.25"
                        stroke="currentColor"
                        strokeWidth="1.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>

                  <div
                    className={styles.inlineTraceWrap}
                    data-expanded={isExpanded ? "" : undefined}
                    aria-hidden={!isExpanded}
                    data-chrome=""
                  >
                    <div className={styles.inlineTraceInner}>
                      <div
                        className={styles.inlineTraceDetail}
                        data-agent-thinking={isExpanded ? t.kind : undefined}
                        data-chrome=""
                      >
                        {chipSource.length > 0 ? (
                          <ScrollableThinkingChips
                            chips={chipSource}
                            chipMeta={run.chipMeta}
                            isExpanded={isExpanded}
                          />
                        ) : null}

                        {t.kind === "explanation_branches" && run.branches.length > 0 ? (
                          <ul
                            className={styles.inlineBranchesList}
                            data-run-branches={isExpanded ? "" : undefined}
                          >
                            {[...run.branches]
                              .sort(
                                (a, b) =>
                                  (RANK[a.status ?? "sealed"] ?? 2) -
                                  (RANK[b.status ?? "sealed"] ?? 2),
                              )
                              .map((b) => {
                                const statusKey = b.status ?? "sealed";
                                const shortStatus = BRANCH_SHORT_STATUS[statusKey] ?? "Checking";
                                return (
                                  <li
                                    key={b.id}
                                    className={styles.inlineBranchItem}
                                    data-status={statusKey}
                                    title={b.reason ?? undefined}
                                    onPointerEnter={() => {
                                      onFocusCause?.(b.id);
                                    }}
                                  >
                                    <span
                                      className={styles.inlineBranchDot}
                                      data-status={statusKey}
                                      aria-hidden="true"
                                    />
                                    <span className={styles.inlineBranchLabel}>{b.label}</span>
                                    <span
                                      className={styles.inlineBranchStatus}
                                      data-status={statusKey}
                                    >
                                      {shortStatus}
                                    </span>
                                  </li>
                                );
                              })}
                          </ul>
                        ) : null}

                        {t.kind === "field_check" && run.checks[0] ? (
                          <div className={styles.inlineCheckRow}>
                            <span className={styles.inlineCheckLabel}>{run.checks[0].label}</span>
                          </div>
                        ) : null}

                        {summaryStep ? (
                          stepSourceMeta?.url ? (
                            <a
                              href={stepSourceMeta.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={styles.thinkingStepLink}
                              title={
                                stepSourceMeta.publisher
                                  ? `${stepSourceMeta.title} (${stepSourceMeta.publisher})`
                                  : stepSourceMeta.title
                              }
                              data-thinking-step={isExpanded ? summaryStep.status : undefined}
                              data-active-shimmer={shouldShimmer ? "" : undefined}
                            >
                              <span className={styles.thinkingStepLabel}>{summaryStep.label}</span>
                            </a>
                          ) : (
                            <div
                              className={styles.thinkingStep}
                              data-thinking-step={isExpanded ? summaryStep.status : undefined}
                              data-active-shimmer={shouldShimmer ? "" : undefined}
                            >
                              <span className={styles.thinkingStepLabel}>{summaryStep.label}</span>
                            </div>
                          )
                        ) : t.activeLabel ? (
                          <p
                            className={styles.inspectorLiveLine}
                            data-active-shimmer={shouldShimmer ? "" : undefined}
                          >
                            {t.activeLabel}
                          </p>
                        ) : (
                          <div
                            className={styles.thinkingStep}
                            data-thinking-step={
                              isExpanded ? (isRunning ? "running" : "succeeded") : undefined
                            }
                            data-active-shimmer={shouldShimmer ? "" : undefined}
                          >
                            <span className={styles.thinkingStepLabel}>{fallbackStepText}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}

            {run.done && run.needsReview ? (
              <li
                className={styles.treeNodeReviewItem}
                style={{ "--agent-color": "#d97706" } as CSSProperties}
                data-agent-node="review"
                data-agent-state="review"
                data-agent-review=""
                data-chrome=""
              >
                <p className={styles.settledTakeaway} data-chrome="">
                  {buildSettledTakeaway(run.branches, run.checks[0]?.label ?? null)}
                </p>
                <button
                  type="button"
                  className={styles.treeNodeReview}
                  onClick={() => {
                    onFindings?.();
                  }}
                >
                  <span
                    className={styles.treeNodeBullet}
                    data-state="review"
                    aria-hidden="true"
                    data-chrome=""
                  />
                  <span className={styles.needsYouPill} data-needs-you="">
                    {en["run.tree.needsYou"].text}
                  </span>
                  <span className={styles.treeNodeReviewLabel} data-chrome="">
                    {"See findings & Review field plan"}
                  </span>
                  {run.checks[0] ? (
                    <span className={styles.srOnly} data-chrome="" data-run-check="">
                      {run.checks[0].label}
                    </span>
                  ) : null}
                  <span className={styles.reviewKeyHint} data-chrome="">
                    {"↵"}
                  </span>
                </button>
              </li>
            ) : null}
          </ol>
        ) : null}

        {!run.done && run.tasks.length > 0 ? (
          <div className={styles.thinkingFootRow} data-chrome="">
            <span className={styles.thinkingFoot} data-run-step-count="">
              {`Step ${String(Math.max(1, staggeredNonQueued.length))} of ${String(Math.max(7, run.tasks.length))}`}
            </span>
            {onTogglePause ? (
              <button
                type="button"
                className={styles.thinkingActionBtn}
                data-run-pause=""
                aria-pressed={paused}
                onClick={onTogglePause}
              >
                <svg
                  width="9"
                  height="9"
                  viewBox="0 0 10 10"
                  fill="none"
                  aria-hidden="true"
                  className={styles.thinkingActionIcon}
                >
                  {paused ? (
                    <path d="M2.5 1.8L8.2 5L2.5 8.2V1.8Z" fill="currentColor" />
                  ) : (
                    <>
                      <rect x="2.2" y="1.8" width="2" height="6.4" rx="0.5" fill="currentColor" />
                      <rect x="5.8" y="1.8" width="2" height="6.4" rx="0.5" fill="currentColor" />
                    </>
                  )}
                </svg>
                <span>{paused ? "Resume" : "Pause"}</span>
              </button>
            ) : null}
            {onStopRun ? (
              <button
                type="button"
                className={styles.thinkingActionBtn}
                data-run-stop=""
                onClick={onStopRun}
              >
                <svg
                  width="8"
                  height="8"
                  viewBox="0 0 10 10"
                  fill="none"
                  aria-hidden="true"
                  className={styles.thinkingActionIcon}
                >
                  <rect x="2" y="2" width="6" height="6" rx="1" fill="currentColor" />
                </svg>
                <span>{"Stop"}</span>
              </button>
            ) : null}
          </div>
        ) : null}
      </aside>
    </div>
  );
}

export function AtWorkThinkingCard(_props: {
  thinkingTask: RunTask | undefined;
  nowMs: number;
  setStepsDismissed: Dispatch<SetStateAction<boolean>>;
}) {
  return null;
}
