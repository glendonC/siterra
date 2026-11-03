"use client";

import {
  useCallback,
  useEffect,
  useRef,
  type CSSProperties,
  type Dispatch,
  type SetStateAction,
} from "react";
import { en, format, type MessageId } from "../../lib/copy/en";
import type { CursorPoint } from "../../lib/run/layout";
import type { RunModel, RunTask, RunTaskState } from "../../lib/run/model";
import styles from "./AtWork.module.css";

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

/** The open explanations first, the contradicted after them (the reference study: what needs a person first). */
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

const TRIAD_BY_KIND: Record<string, string> = {
  plan: "#1d6fe8",
  observation_analysis: "#1e824c",
  source_research: "#d48817",
  livelihood_governance: "#d94838",
  explanation_branches: "#1d6fe8",
  field_check: "#1e824c",
};

const TRIAD_CYCLE = ["#1d6fe8", "#1e824c", "#d48817", "#d94838"] as const;

export function agentAccentColor(t: RunTask, idx: number): string {
  return TRIAD_BY_KIND[t.kind] ?? TRIAD_CYCLE[idx % TRIAD_CYCLE.length] ?? "#1d6fe8";
}

function humanTaskTitle(t: RunTask, duplicateKind: boolean, obsIdx: number): string {
  switch (t.kind) {
    case "plan":
      return "Plan";
    case "observation_analysis": {
      if (!duplicateKind) return "Satellite & climate check";
      const sub = (t.sublabel ?? "").toLowerCase();
      if (sub.includes("rain") || obsIdx > 0) return "Rainfall & terrain check";
      return "Satellite & vegetation check";
    }
    case "source_research":
      return "Published sources";
    case "livelihood_governance":
      return en["task.kind.livelihood_governance"].text;
    case "explanation_branches":
      return "Competing explanations";
    case "field_check":
      return "Field verification plan";
    case "instrument_composition":
    case "view":
    case "view_order":
      return "Synthesis & view order";
    default:
      return en[`task.kind.${t.kind}` as MessageId].text;
  }
}

function ScrollableThinkingChips({
  chips,
  chipMeta,
  isExpanded,
}: {
  chips: readonly string[];
  chipMeta: RunModel["chipMeta"];
  isExpanded: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const fadeRef = useRef<"right" | "left" | "both" | null>(null);

  const syncFade = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const maxScroll = el.scrollWidth - el.clientWidth;
    let next: "right" | "left" | "both" | null = null;
    if (maxScroll > 2) {
      const left = el.scrollLeft > 3;
      const right = el.scrollLeft < maxScroll - 3;
      next = left && right ? "both" : right ? "right" : left ? "left" : null;
    }
    if (fadeRef.current !== next) {
      fadeRef.current = next;
      if (next) {
        el.setAttribute("data-fade", next);
      } else {
        el.removeAttribute("data-fade");
      }
    }
  }, []);

  useEffect(() => {
    syncFade();
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      syncFade();
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
    };
  }, [chips.length, isExpanded, syncFade]);

  return (
    <div
      ref={scrollRef}
      className={styles.thinkingChips}
      data-thinking-chips=""
      onScroll={syncFade}
      onWheel={(e) => {
        const el = e.currentTarget;
        if (el.scrollWidth <= el.clientWidth) return;
        if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
          e.preventDefault();
          el.scrollLeft += e.deltaY;
          syncFade();
        }
      }}
    >
      {chips.map((chip, chipIdx) => {
        const meta = chipMeta?.[chip];
        const tip = meta
          ? meta.publisher
            ? `${meta.title} (${meta.publisher})`
            : meta.title
          : undefined;
        return meta?.url ? (
          <a
            key={chip}
            href={meta.url}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.thinkingChipLink}
            title={tip}
            aria-label={`Open ${chip}`}
            style={{ "--chip-idx": chipIdx } as CSSProperties}
            data-thinking-chip={isExpanded ? "" : undefined}
          >
            <span>{chip}</span>
            <svg
              className={styles.thinkingChipArrow}
              width="9"
              height="9"
              viewBox="0 0 10 10"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M2.5 7.5L7.5 2.5M7.5 2.5H3.5M7.5 2.5V6.5"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </a>
        ) : (
          <span
            key={chip}
            className={styles.thinkingChip}
            title={tip}
            style={{ "--chip-idx": chipIdx } as CSSProperties}
            data-thinking-chip={isExpanded ? "" : undefined}
          >
            {chip}
          </span>
        );
      })}
    </div>
  );
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
    ((layer: "bands" | "cover" | "trend" | "rain" | "routes" | null) => void) | undefined;
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
          <span
            className={styles.thinkingWord}
            data-active={!run.done && !paused ? "" : undefined}
            data-chrome=""
          >
            {"Thinking"}
          </span>
          <span className={styles.thinkingTime} data-chrome="">
            {format("run.tree.time", { time: seconds(nowMs) })}
          </span>
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
                className={styles.treeNode}
                style={{ "--agent-color": "#d97706" } as CSSProperties}
                data-agent-node="review"
                data-agent-state="review"
                data-agent-review=""
                data-chrome=""
              >
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
                  <span className={styles.treeNodeReviewLabel} data-chrome="" data-run-check="">
                    {run.checks[0]
                      ? `Review field plan · ${run.checks[0].label}`
                      : "Review field plan"}
                  </span>
                  <svg
                    className={styles.treeNodeChevron}
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

export function AtWorkCursors(_props: {
  cursors: readonly CursorPoint[];
  selectedTaskId: string | null;
  setSelectedTaskId: Dispatch<SetStateAction<string | null>>;
  setStepsDismissed: Dispatch<SetStateAction<boolean>>;
}) {
  return null;
}

export function AtWorkThinkingCard(_props: {
  thinkingTask: RunTask | undefined;
  nowMs: number;
  setStepsDismissed: Dispatch<SetStateAction<boolean>>;
}) {
  return null;
}
