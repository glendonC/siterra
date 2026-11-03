"use client";

import { useEffect, type CSSProperties, type Dispatch, type SetStateAction } from "react";
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

const STATUS: Record<string, MessageId> = {
  consistent: "run.branch.consistent",
  contradicted: "run.branch.contradicted",
  cannot_be_assessed: "run.branch.cannot",
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

  const primaryRunningId = primaryRunning?.id ?? null;
  useEffect(() => {
    if (selectedTaskId === null) {
      setStepsDismissed(false);
    }
  }, [primaryRunningId, run.done, selectedTaskId, setStepsDismissed]);

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
            data-active={!run.done ? "" : undefined}
            data-chrome=""
          >
            {"Thinking"}
          </span>
          <span className={styles.thinkingTime} data-chrome="">
            {format("run.tree.time", { time: seconds(nowMs) })}
          </span>
          {!run.done ? (
            <span className={styles.srOnly} data-run-status>
              {format("run.sofar", { n: run.findings.length })}
            </span>
          ) : null}
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
              const shownChips = chipSource.slice(0, 2);
              const extraChipCount = Math.max(0, chipSource.length - shownChips.length);
              const summaryStep = t.steps.length > 0 ? (t.steps[t.steps.length - 1] ?? null) : null;
              const fallbackStepText =
                t.kind === "instrument_composition" || t.kind === "view" || t.kind === "view_order"
                  ? "Ordered findings and views for the briefing"
                  : t.kind === "plan"
                    ? en["run.step.plan"].text
                    : t.sublabel
                      ? `Checking ${t.sublabel.toLowerCase()}`
                      : en["run.step.readCatchment"].text;

              return (
                <li
                  key={t.id}
                  className={styles.treeNode}
                  style={{ "--agent-color": accent } as CSSProperties}
                  data-run-task={t.kind}
                  data-agent-node={t.kind}
                  data-agent-state={t.state}
                  data-root={isRoot ? "" : undefined}
                  data-selected={isSelected ? "" : undefined}
                  data-expanded={isExpanded ? "" : undefined}
                  data-dimmed={isDimmed ? "" : undefined}
                >
                  <button
                    type="button"
                    className={styles.treeNodeBtn}
                    aria-expanded={isExpanded}
                    aria-label={taskTitle}
                    data-run-card={isPrimaryRunning ? t.kind : undefined}
                    data-chrome={isPrimaryRunning ? undefined : ""}
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

                  {isExpanded ? (
                    <div
                      className={styles.inlineTraceDetail}
                      data-agent-thinking={t.kind}
                      data-chrome=""
                    >
                      {shownChips.length > 0 ? (
                        <div className={styles.thinkingChips}>
                          {shownChips.map((chip) => (
                            <span key={chip} className={styles.thinkingChip} data-thinking-chip="">
                              {chip}
                            </span>
                          ))}
                          {extraChipCount > 0 ? (
                            <span className={styles.thinkingChip} data-thinking-chip="">
                              {`+${String(extraChipCount)} more`}
                            </span>
                          ) : null}
                        </div>
                      ) : null}

                      {summaryStep ? (
                        <div
                          className={styles.thinkingStep}
                          data-thinking-step={summaryStep.status}
                          data-active-shimmer={
                            summaryStep.status === "running" || isRunning ? "" : undefined
                          }
                        >
                          <span className={styles.thinkingStepLabel}>{summaryStep.label}</span>
                        </div>
                      ) : t.activeLabel ? (
                        <p className={styles.inspectorLiveLine} data-active-shimmer="">
                          {t.activeLabel}
                        </p>
                      ) : (
                        <div
                          className={styles.thinkingStep}
                          data-thinking-step={isRunning ? "running" : "succeeded"}
                          data-active-shimmer={isRunning ? "" : undefined}
                        >
                          <span className={styles.thinkingStepLabel}>{fallbackStepText}</span>
                        </div>
                      )}
                    </div>
                  ) : null}
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
                <div className={styles.treeNodeReview}>
                  <span className={styles.treeNodeBullet} data-state="review" aria-hidden="true" />
                  <span className={styles.needsYouPill} data-needs-you="">
                    {en["run.tree.needsYou"].text}
                  </span>
                </div>
              </li>
            ) : null}
          </ol>
        ) : null}

        {!run.done && run.tasks.length > 0 ? (
          <div className={styles.thinkingFoot} data-run-step-count="" data-chrome="">
            {`Step ${String(Math.max(1, staggeredNonQueued.length))} of ${String(Math.max(7, run.tasks.length))}`}
          </div>
        ) : null}
      </aside>
    </div>
  );
}

export function AtWorkBottomThinkingBand({
  run,
  nowMs,
  selectedTaskId,
  setSelectedTaskId,
  setStepsDismissed,
  hoveredBranch,
  setHoveredBranch,
  onFocusCause,
}: {
  run: RunModel;
  nowMs: number;
  selectedTaskId: string | null;
  setSelectedTaskId: Dispatch<SetStateAction<string | null>>;
  setStepsDismissed: Dispatch<SetStateAction<boolean>>;
  hoveredBranch: string | null;
  setHoveredBranch: Dispatch<SetStateAction<string | null>>;
  onFocusCause?: ((causeId: string) => void) | undefined;
}) {
  const runningTasks = run.tasks.filter(
    (t) => t.state === "running" && !(t.kind === "explanation_branches" && run.branches.length > 0),
  );

  const primary =
    runningTasks.length > 0
      ? ((selectedTaskId ? runningTasks.find((t) => t.id === selectedTaskId) : null) ??
        runningTasks[runningTasks.length - 1] ??
        runningTasks[0] ??
        null)
      : null;
  const primaryIdx = primary
    ? Math.max(
        0,
        run.tasks.findIndex((x) => x.id === primary.id),
      )
    : 0;
  const accent = primary ? agentAccentColor(primary, primaryIdx) : "#2563eb";

  const count = (l: string) => run.findings.filter((f) => f.lands === l).length;
  const counts = [
    { n: count("source"), id: "run.count.checked" as const, mark: "●" },
    { n: count("land"), id: "run.count.computed" as const, mark: "◆" },
    { n: count("unchecked"), id: "run.count.unchecked" as const, mark: "○" },
  ].filter((c) => c.n > 0);

  const check = run.checks[0] ?? null;

  return (
    <div
      className={styles.bottomThinkingBand}
      style={{ "--agent-color": accent } as CSSProperties}
      data-settled={run.done ? "" : undefined}
    >
      {!run.done ? (
        <div className={styles.bottomLoaderTrack} aria-hidden="true">
          <div className={styles.bottomLoaderBar} />
        </div>
      ) : null}

      <div className={styles.bottomThinkingContent}>
        {/* Active agent thinking stream while running */}
        {!run.done && primary ? (
          <div className={styles.bottomRunningRow}>
            {runningTasks.map((t) => {
              const isPrimary = t.id === primary.id;
              const idx = Math.max(
                0,
                run.tasks.findIndex((x) => x.id === t.id),
              );
              const color = agentAccentColor(t, idx);
              if (!isPrimary) {
                return (
                  <button
                    key={t.id}
                    type="button"
                    className={styles.bottomSecondaryRunning}
                    style={{ "--agent-color": color } as CSSProperties}
                    data-run-card={t.kind}
                    data-chrome=""
                    onClick={() => {
                      setStepsDismissed(false);
                      setSelectedTaskId(t.id);
                    }}
                  >
                    <span className={styles.bottomSecondaryDot} />
                    <span>{en[`task.kind.${t.kind}` as MessageId].text}</span>
                  </button>
                );
              }
              return (
                <button
                  key={t.id}
                  type="button"
                  className={styles.bottomPrimaryCard}
                  style={{ "--agent-color": color } as CSSProperties}
                  data-run-card={t.kind}
                  onClick={() => {
                    setStepsDismissed(false);
                    setSelectedTaskId((cur) => (cur === t.id ? null : t.id));
                  }}
                >
                  <span className={styles.bottomAgentName}>
                    {en[`task.kind.${t.kind}` as MessageId].text}
                  </span>
                  {t.activeLabel ? (
                    <span className={styles.bottomThinkingText} data-chrome="">
                      {t.activeLabel}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        ) : null}

        {/* Status + Evidence Breakdown + Field Check + CTA Row */}
        <div className={styles.bottomStatusRow}>
          <p className={styles.sofar} data-run-status>
            {run.done
              ? format("run.findings", { n: run.findings.length, time: seconds(nowMs) })
              : format("run.sofar", { n: run.findings.length })}
          </p>

          {counts.length > 0 ? (
            <p className={styles.counts} data-run-findings>
              {counts.map((c) => (
                <span key={c.id} className={styles.countItem} data-gather={c.id}>
                  <span className={styles.mark} aria-hidden="true" data-chrome="">
                    {c.mark}
                  </span>
                  {format(c.id, { n: c.n })}
                </span>
              ))}
            </p>
          ) : null}

          {check ? (
            <section className={styles.check} data-run-check>
              <span className={styles.checkKicker}>{en["run.check.kicker"].text}</span>
              <span className={styles.checkLabel}>{check.label}</span>
            </section>
          ) : null}
        </div>

        {/* Horizontal 5-Cause Pill Strip when branches are available */}
        {run.branches.length > 0 ? (
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
                      setHoveredBranch(b.id);
                      onFocusCause?.(b.id);
                    }}
                    onPointerLeave={() => {
                      setHoveredBranch((h) => (h === b.id ? null : h));
                    }}
                  >
                    <span className={styles.branchRow}>
                      <span>{b.label}</span>
                      <span className={styles.branchWord} data-chrome="">
                        {en[word].text}
                      </span>
                    </span>
                    {hoveredBranch === b.id && b.reason ? (
                      <span className={styles.reason}>{b.reason}</span>
                    ) : null}
                  </li>
                );
              })}
          </ul>
        ) : null}
      </div>
    </div>
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
  const primaryTaskId =
    selectedTaskId ?? cursors[cursors.length - 1]?.task.id ?? cursors[0]?.task.id ?? null;

  return (
    <>
      {cursors.map((c) => {
        const isSelected = selectedTaskId === c.task.id;
        const isPrimary = c.task.id === primaryTaskId;
        const isDimmed = selectedTaskId !== null && !isSelected;
        return (
          <button
            key={c.task.id}
            type="button"
            className={styles.agentCursor}
            style={{ top: `${c.at.y.toFixed(1)}px`, left: `${c.at.x.toFixed(1)}px` }}
            data-agent-cursor={c.task.kind}
            data-target-kind={c.targetKind}
            data-stratum={c.stratumId ?? undefined}
            data-selected={isSelected ? "" : undefined}
            data-primary={isPrimary ? "" : undefined}
            data-dimmed={isDimmed ? "" : undefined}
            data-chrome=""
            onClick={() => {
              setStepsDismissed(false);
              setSelectedTaskId((cur) => (cur === c.task.id ? null : c.task.id));
            }}
          >
            <span className={styles.cursorReticle} data-target-kind={c.targetKind}>
              <span className={styles.cursorRing} data-target-kind={c.targetKind} />
            </span>
            <span className={styles.cursorBody}>
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

export function AtWorkThinkingCard(_props: {
  thinkingTask: RunTask | undefined;
  nowMs: number;
  setStepsDismissed: Dispatch<SetStateAction<boolean>>;
}) {
  return null;
}
