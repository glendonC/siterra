"use client";

import type { CSSProperties, Dispatch, SetStateAction } from "react";
import { Control } from "../controls/Control";
import { en, format, type MessageId } from "../../lib/copy/en";
import type { CursorPoint } from "../../lib/run/layout";
import type { RunModel, RunTask, RunTaskState } from "../../lib/run/model";
import styles from "./AtWork.module.css";

const MAX_VISIBLE_STEPS = 6;
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

export function agentAccentColor(_t: RunTask, _idx: number): string {
  return "#2563eb";
}

function AgentDomainGlyph({ task }: { task: RunTask }) {
  if (task.kind === "plan") {
    return (
      <svg viewBox="0 0 16 16" fill="none" className={styles.squircleGlyph} aria-hidden="true">
        <circle cx="8" cy="8" r="4.8" stroke="currentColor" strokeWidth="1.15" />
        <path
          d="M8 1.8V4.2M8 11.8V14.2M1.8 8H4.2M11.8 8H14.2"
          stroke="currentColor"
          strokeWidth="1.15"
          strokeLinecap="round"
        />
        <circle cx="8" cy="8" r="1" fill="currentColor" />
      </svg>
    );
  }
  if (task.kind === "observation_analysis") {
    if (task.sublabel?.toLowerCase().includes("rain")) {
      return (
        <svg viewBox="0 0 16 16" fill="none" className={styles.squircleGlyph} aria-hidden="true">
          <path
            d="M3.8 10.2V12.8M6.6 6.2V12.8M9.4 8.4V12.8M12.2 3.8V12.8"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
        </svg>
      );
    }
    return (
      <svg viewBox="0 0 16 16" fill="none" className={styles.squircleGlyph} aria-hidden="true">
        <path
          d="M2.5 11.5L6.2 7.8L9.2 10L13.5 4.5"
          stroke="currentColor"
          strokeWidth="1.15"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="13.5" cy="4.5" r="1.2" fill="currentColor" />
      </svg>
    );
  }
  if (task.kind === "source_research") {
    return (
      <svg viewBox="0 0 16 16" fill="none" className={styles.squircleGlyph} aria-hidden="true">
        <path
          d="M3.2 4.8H12.8M3.2 8H12.8M3.2 11.2H8.8"
          stroke="currentColor"
          strokeWidth="1.15"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  if (task.kind === "livelihood_governance") {
    return (
      <svg viewBox="0 0 16 16" fill="none" className={styles.squircleGlyph} aria-hidden="true">
        <path
          d="M8 2.6L13.4 8L8 13.4L2.6 8L8 2.6Z"
          stroke="currentColor"
          strokeWidth="1.15"
          strokeLinejoin="round"
        />
        <path
          d="M8 5.4L10.6 8L8 10.6L5.4 8L8 5.4Z"
          stroke="currentColor"
          strokeWidth="1"
          strokeLinejoin="round"
          opacity="0.65"
        />
      </svg>
    );
  }
  if (task.kind === "explanation_branches") {
    return (
      <svg viewBox="0 0 16 16" fill="none" className={styles.squircleGlyph} aria-hidden="true">
        <path
          d="M3 8H7.2M7.2 8L11.8 4.2M7.2 8H13M7.2 8L11.8 11.8"
          stroke="currentColor"
          strokeWidth="1.15"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="12.2" cy="4.2" r="1.1" fill="currentColor" />
        <circle cx="13" cy="8" r="1.1" fill="currentColor" />
        <circle cx="12.2" cy="11.8" r="1.1" fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 16 16" fill="none" className={styles.squircleGlyph} aria-hidden="true">
      <path
        d="M8 3.2L13.2 5.9L8 8.6L2.8 5.9L8 3.2Z"
        stroke="currentColor"
        strokeWidth="1.15"
        strokeLinejoin="round"
      />
      <path
        d="M2.8 9.6L8 12.3L13.2 9.6"
        stroke="currentColor"
        strokeWidth="1.15"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
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
  onFocusLayer?: ((layer: "bands" | "cover" | "trend" | "rain" | "routes" | null) => void) | undefined;
}) {
  if (run.tasks.length === 0) return null;

  const kindCounts = new Map<string, number>();
  for (const t of run.tasks) {
    kindCounts.set(t.kind, (kindCounts.get(t.kind) ?? 0) + 1);
  }

  const visibleTasks = expandedAll
    ? run.tasks
    : run.tasks.filter((t) => t.state === "running" || selectedTaskId === t.id);
  const showTreeList = visibleTasks.length > 0 || (run.done && run.needsReview);

  const selectedTask =
    !stepsDismissed && selectedTaskId !== null
      ? (run.tasks.find((t) => t.id === selectedTaskId) ?? null)
      : null;

  return (
    <div className={styles.leftRailSystem} data-chrome="">
      <aside
        className={styles.agentTree}
        data-agent-tree=""
        data-folded={expandedAll ? "false" : "true"}
        data-chrome=""
      >
        {showTreeList ? (
          <ol className={styles.treeList}>
            {visibleTasks.map((t, idx) => {
              const fullIdx = run.tasks.findIndex((x) => x.id === t.id);
              const accent = agentAccentColor(t, fullIdx >= 0 ? fullIdx : idx);
              const isRoot = t.kind === "plan" || idx === 0;
              const isSelected = selectedTaskId === t.id;
              const isDimmed = selectedTaskId !== null && !isSelected;
              const isRunning = t.state === "running";
              const elapsedMs = t.startMs !== null ? (t.endMs ?? nowMs) - t.startMs : 0;
              const dur =
                t.startMs !== null && elapsedMs >= 50
                  ? format("run.tree.time", {
                      time: seconds(elapsedMs),
                    })
                  : null;
              const rightLabel = !isRunning && dur ? dur : en[TASK_STATE_WORD[t.state]].text;
              const duplicateKind = (kindCounts.get(t.kind) ?? 0) > 1;
              const scopeChip =
                t.sublabel ?? (duplicateKind ? (t.searchedChips[0] ?? null) : null);
              const taskTitle = en[`task.kind.${t.kind}` as MessageId].text;

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
                  data-dimmed={isDimmed ? "" : undefined}
                >
                  <button
                    type="button"
                    className={styles.treeNodeBtn}
                    aria-label={`${taskTitle}${scopeChip ? ` (${scopeChip})` : ""} — ${rightLabel}`}
                    onClick={() => {
                      setStepsDismissed(false);
                      setSelectedTaskId((cur) => (cur === t.id ? null : t.id));
                    }}
                  >
                    <span
                      className={styles.squircle}
                      data-state={t.state}
                      data-selected={isSelected ? "" : undefined}
                    >
                      <svg className={styles.squircleSvg} viewBox="0 0 32 32" aria-hidden="true">
                        <rect
                          className={styles.squircleTrack}
                          x="0.75"
                          y="0.75"
                          width="30.5"
                          height="30.5"
                          rx="7"
                          ry="7"
                          pathLength="100"
                        />
                        {isRunning ? (
                          <rect
                            className={styles.squircleSweep}
                            x="0.75"
                            y="0.75"
                            width="30.5"
                            height="30.5"
                            rx="7"
                            ry="7"
                            pathLength="100"
                          />
                        ) : null}
                      </svg>
                      <AgentDomainGlyph task={t} />
                    </span>

                    {/* Hover pill tooltip (hidden at rest so the left rail stays a sleek icon column) */}
                    <span className={styles.treeNodeTooltip} data-chrome="">
                      <span className={styles.treeNodeName} data-state={t.state}>
                        {taskTitle}
                        {scopeChip ? ` · ${scopeChip}` : ""}
                      </span>
                      <span className={styles.treeNodeState} data-state={t.state}>
                        {rightLabel}
                      </span>
                    </span>
                  </button>
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
              >
                <div className={styles.treeNodeReview}>
                  <span className={styles.squircle} data-state="review">
                    <svg className={styles.squircleSvg} viewBox="0 0 32 32" aria-hidden="true">
                      <rect
                        className={styles.squircleTrack}
                        x="0.75"
                        y="0.75"
                        width="30.5"
                        height="30.5"
                        rx="7"
                        ry="7"
                        pathLength="100"
                      />
                    </svg>
                    <span className={styles.reviewExclaim} aria-hidden="true">!</span>
                  </span>
                  <span className={styles.needsYouPill} data-needs-you="">
                    {en["run.tree.needsYou"].text}
                  </span>
                </div>
              </li>
            ) : null}
          </ol>
        ) : null}
      </aside>

      {selectedTask ? (
        <div
          className={styles.sideBlurInspector}
          style={
            {
              "--agent-color": agentAccentColor(
                selectedTask,
                Math.max(0, run.tasks.findIndex((x) => x.id === selectedTask.id)),
              ),
            } as CSSProperties
          }
          data-agent-thinking={selectedTask.kind}
          data-chrome=""
        >
          <div className={styles.inspectorHeader}>
            <div className={styles.inspectorTitleBlock}>
              <span className={styles.inspectorKicker}>
                {en[`task.kind.${selectedTask.kind}` as MessageId].text}
                {selectedTask.sublabel ? ` · ${selectedTask.sublabel}` : ""}
              </span>
              {selectedTask.activeLabel ? (
                <p className={styles.inspectorLiveLine}>{selectedTask.activeLabel}</p>
              ) : null}
            </div>
            <button
              type="button"
              className={styles.inlineResetBtn}
              data-agent-show-all=""
              onClick={() => {
                setSelectedTaskId(null);
                setStepsDismissed(false);
              }}
            >
              <kbd className={styles.keycapDark}>{"ESC"}</kbd>
              <span>{en["run.tree.followAll"].text}</span>
            </button>
          </div>

          {selectedTask.searchedChips.length > 0 ? (
            <div className={styles.thinkingChips}>
              {selectedTask.searchedChips.map((chip) => (
                <span key={chip} className={styles.thinkingChip} data-thinking-chip="">
                  {chip}
                </span>
              ))}
            </div>
          ) : null}

          {selectedTask.steps.length > 0 ? (
            <ol className={styles.thinkingStepList}>
              {selectedTask.steps.slice(-MAX_VISIBLE_STEPS).map((step) => (
                <li
                  key={step.id}
                  className={styles.thinkingStep}
                  data-thinking-step={step.status}
                >
                  <span
                    className={styles.thinkingStepDot}
                    data-status={step.status}
                    aria-hidden="true"
                  />
                  <span className={styles.thinkingStepLabel}>{step.label}</span>
                  <span className={styles.thinkingStepTime}>
                    {format("run.tree.time", { time: seconds(step.ms) })}
                  </span>
                </li>
              ))}
            </ol>
          ) : null}

          {selectedTask.startMs !== null ? (
            <div className={styles.inlineMetaFooter}>
              <span>{taskMetaLine(selectedTask, nowMs)}</span>
            </div>
          ) : null}
        </div>
      ) : null}
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
  onFindings,
  onFocusCause,
}: {
  run: RunModel;
  nowMs: number;
  selectedTaskId: string | null;
  setSelectedTaskId: Dispatch<SetStateAction<string | null>>;
  setStepsDismissed: Dispatch<SetStateAction<boolean>>;
  hoveredBranch: string | null;
  setHoveredBranch: Dispatch<SetStateAction<string | null>>;
  onFindings: () => void;
  onFocusCause?: ((causeId: string) => void) | undefined;
}) {
  const runningTasks = run.tasks.filter(
    (t) => t.state === "running" && !(t.kind === "explanation_branches" && run.branches.length > 0),
  );

  const primary =
    runningTasks.length > 0
      ? ((selectedTaskId ? runningTasks.find((t) => t.id === selectedTaskId) : null) ??
        runningTasks[runningTasks.length - 1] ??
        runningTasks[0]!)
      : null;
  const primaryIdx = primary ? Math.max(0, run.tasks.findIndex((x) => x.id === primary.id)) : 0;
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
              const idx = Math.max(0, run.tasks.findIndex((x) => x.id === t.id));
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

          {run.done ? (
            <div className={styles.open} data-action-prompt="">
              <Control
                variant="quiet"
                className={styles.openBtn}
                keyHint="↵"
                keyShortcut="Enter"
                onClick={onFindings}
                data-run-open-findings=""
              >
                {en["run.open"].text}
              </Control>
            </div>
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
                      <span className={styles.branchWord}>{en[word].text}</span>
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
