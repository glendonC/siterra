"use client";

import type { CSSProperties, Dispatch, SetStateAction } from "react";
import { en, format } from "../../lib/copy/en";
import { rd, type ReadoutMessageId } from "../../lib/copy/readout";
import type { RunModel } from "../../lib/run/model";
import { KeyChip } from "../controls/Control";
import { agentAccentColor, shownSteps, stepLine } from "./AtWorkCursors";
import { ScrollableThinkingChips } from "./ScrollableThinkingChips";
import styles from "./AtWork.module.css";

export const seconds = (ms: number) => (Math.max(0, ms) / 1000).toFixed(1);

/** The explanations that fit first, then the ones without enough data, then the ones that do not fit; one with no
 *  verdict yet goes before the ones that do not fit. */
const RANK: Record<string, number> = {
  consistent: 0,
  cannot_be_assessed: 1,
  sealed: 2,
  contradicted: 3,
};

/** An explanation's verdict in the answer's own three words (lib/copy/readout.ts). */
const VERDICT: Record<string, ReadoutMessageId> = {
  consistent: "readout.verdict.consistent",
  cannot_be_assessed: "readout.verdict.cannot_be_assessed",
  contradicted: "readout.verdict.contradicted",
};

export function AtWorkAgentTree({
  run,
  nowMs,
  titles,
  folded: expandedAll,
  selectedTaskId,
  setSelectedTaskId,
  setStepsDismissed,
  stepsDismissed = false,
  onFocusCause,
  onFindings,
  paused = false,
  onTogglePause,
  onStopRun,
  reviewRequested = false,
  asked = false,
  stopped = null,
  chosen = null,
}: {
  run: RunModel;
  nowMs: number;
  titles: ReadonlyMap<string, string>;
  folded: boolean;
  selectedTaskId: string | null;
  setSelectedTaskId: Dispatch<SetStateAction<string | null>>;
  setStepsDismissed: Dispatch<SetStateAction<boolean>>;
  stepsDismissed?: boolean;
  onFocusCause?: ((causeId: string) => void) | undefined;
  onFindings?: (() => void) | undefined;
  paused?: boolean | undefined;
  onTogglePause?: (() => void) | undefined;
  onStopRun?: (() => void) | undefined;
  /** The run's own record asks the visitor for a review: the hand-over row says Needs You. */
  reviewRequested?: boolean | undefined;
  /** The steps of a question asked from the Ask: the status line says where it stands (data-ask-status). */
  asked?: boolean | undefined;
  /** A question asked from the Ask that was not answered: the status line is this sentence, with no hand-over row. */
  stopped?: string | null | undefined;
  /** How many of the case's findings a question asked from the Ask chose (lib/ask/task.ts); null for any other run. */
  chosen?: number | null | undefined;
}) {
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
  const primaryRunning =
    runningTasks.length > 0
      ? ((selectedTaskId ? runningTasks.find((t) => t.id === selectedTaskId) : null) ??
        runningTasks[runningTasks.length - 1] ??
        runningTasks[0] ??
        null)
      : null;

  // the status line stands from the start, before any step: the question is at work from Enter
  const visibleTasks = expandedAll
    ? staggeredNonQueued
    : staggeredNonQueued.filter((t) => t.state === "running" || selectedTaskId === t.id);
  const handOver = run.done && stopped === null;
  const showTreeList = visibleTasks.length > 0 || handOver;

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

  const word = run.done ? "run.tree.complete" : paused ? "run.tree.paused" : "run.tree.working";

  return (
    <div className={styles.leftRailSystem} data-stopped={stopped !== null ? "" : undefined}>
      <aside
        className={styles.agentTree}
        data-agent-tree=""
        data-folded={expandedAll ? "false" : "true"}
        data-stopped={stopped !== null ? "" : undefined}
      >
        <div
          className={styles.thinkingHeader}
          data-stopped={stopped !== null ? "" : undefined}
          data-ask-status={
            asked ? (stopped !== null ? "stopped" : run.done ? "answered" : "working") : undefined
          }
        >
          {stopped !== null ? (
            <>
              {/* the trace's closed dot, then why the question was not answered in the status word's type */}
              <span className={styles.thinkingClosedDot} aria-hidden="true" data-chrome="" />
              <span className={styles.thinkingStopped} role="status">
                {stopped}
              </span>
            </>
          ) : (
            <>
              {run.done ? (
                <span className={styles.thinkingDoneDot} aria-hidden="true" data-chrome="" />
              ) : null}
              <span
                className={styles.thinkingWord}
                data-active={!run.done && !paused ? "" : undefined}
                data-done={run.done ? "" : undefined}
                data-chrome=""
              >
                {en[word].text}
              </span>
              <span className={styles.thinkingTime} data-chrome="">
                {format("run.tree.time", { time: seconds(nowMs) })}
              </span>
              {/* a question asked from the Ask counts the case's findings its answer chose; a run, the ones it wrote */}
              <span className={styles.srOnly} data-run-status>
                {run.done
                  ? format("run.findings", {
                      n: chosen ?? run.findings.length,
                      time: seconds(nowMs),
                    })
                  : format("run.sofar", { n: chosen ?? run.findings.length })}
              </span>
            </>
          )}
        </div>

        {showTreeList ? (
          <ol className={styles.treeList}>
            {visibleTasks.map((t, idx) => {
              const isRoot = t.kind === "plan" || idx === 0;
              const isSelected = selectedTaskId === t.id;
              const isDimmed = selectedTaskId !== null && !isSelected;
              const isRunning = t.state === "running";
              const isPrimaryRunning = primaryRunning?.id === t.id;
              const isExpanded = expandedTask?.id === t.id;
              const isActiveHighlight = isExpanded || (expandedTask === null && isPrimaryRunning);
              const taskTitle = titles.get(t.id) ?? "";
              const unknownBundle = en["results.unknownBundle"].text;
              const unknownSource = en["results.unknownSource"].text;
              const chipSource = (
                t.searchedChips.length > 0
                  ? t.searchedChips
                  : [...(t.bundleLabels ?? []), ...(t.sourceCitations ?? [])]
              ).filter((c) => c && c !== unknownBundle && c !== unknownSource);
              const summaryStep = shownSteps(t).at(-1) ?? null;
              const stepSourceMeta = summaryStep?.target?.sourceId
                ? run.sourceMetaById?.[summaryStep.target.sourceId]
                : undefined;
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
                      "--agent-color": agentAccentColor(t),
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
                                const verdict = b.status ? VERDICT[b.status] : undefined;
                                return (
                                  <li
                                    key={b.id}
                                    className={styles.inlineBranchItem}
                                    data-status={statusKey}
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
                                    {verdict ? (
                                      <span
                                        className={styles.inlineBranchStatus}
                                        data-status={statusKey}
                                      >
                                        {rd[verdict].text}
                                      </span>
                                    ) : null}
                                  </li>
                                );
                              })}
                          </ul>
                        ) : null}

                        {t.kind === "brief_package" && run.checks[0] ? (
                          <div className={styles.inlineCheckRow}>
                            <span className={styles.inlineCheckLabel}>{run.checks[0].label}</span>
                          </div>
                        ) : null}

                        {summaryStep && stepSourceMeta?.url ? (
                          <a
                            href={stepSourceMeta.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={styles.thinkingStepLink}
                            data-thinking-step={isExpanded ? summaryStep.status : undefined}
                            data-active-shimmer={shouldShimmer ? "" : undefined}
                          >
                            <span className={styles.thinkingStepLabel}>{summaryStep.label}</span>
                          </a>
                        ) : (
                          <div
                            className={styles.thinkingStep}
                            data-thinking-step={
                              isExpanded
                                ? (summaryStep?.status ?? (isRunning ? "running" : "succeeded"))
                                : undefined
                            }
                            data-active-shimmer={shouldShimmer ? "" : undefined}
                          >
                            <span className={styles.thinkingStepLabel}>{stepLine(t)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}

            {handOver ? (
              <li
                className={styles.treeNodeReviewItem}
                data-agent-node="review"
                data-agent-state="review"
                data-agent-review=""
                data-chrome=""
              >
                <button
                  type="button"
                  className={styles.treeNodeReview}
                  aria-keyshortcuts="Enter"
                  onClick={() => {
                    onFindings?.();
                  }}
                >
                  {reviewRequested ? (
                    <span className={styles.needsYouPill} data-needs-you="">
                      {en["run.tree.needsYou"].text}
                    </span>
                  ) : null}
                  <span className={styles.treeNodeReviewLabel} data-chrome="">
                    {en["run.open"].text}
                  </span>
                  {reviewRequested && run.checks[0] ? (
                    <span className={styles.srOnly} data-chrome="" data-run-check="">
                      {run.checks[0].label}
                    </span>
                  ) : null}
                  <KeyChip>↵</KeyChip>
                </button>
              </li>
            ) : null}
          </ol>
        ) : null}

        {/* the step count with Pause and Stop, once a step is shown: before that the status line stands alone */}
        {!run.done && stopped === null && staggeredNonQueued.length > 0 ? (
          <div className={styles.thinkingFootRow} data-chrome="">
            <span className={styles.thinkingFoot} data-run-step-count="">
              {format("run.tree.step", {
                n: Math.max(1, staggeredNonQueued.length),
                total: run.tasks.length,
              })}
            </span>
            {onTogglePause ? (
              <button
                type="button"
                className={styles.thinkingActionBtn}
                data-run-pause=""
                aria-pressed={paused}
                aria-keyshortcuts="P"
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
                <span>{en[paused ? "run.tree.resume" : "run.tree.pause"].text}</span>
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
                <span>{en["run.tree.stop"].text}</span>
              </button>
            ) : null}
          </div>
        ) : null}
      </aside>
    </div>
  );
}
