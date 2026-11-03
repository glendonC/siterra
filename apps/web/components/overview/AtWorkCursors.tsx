"use client";

import type { CSSProperties, Dispatch, SetStateAction } from "react";
import { en, type MessageId } from "../../lib/copy/en";
import type { CursorPoint } from "../../lib/run/layout";
import type { RunTask } from "../../lib/run/model";
import styles from "./AtWork.module.css";

const TRIAD_BY_KIND: Record<string, string> = {
  plan: "var(--accent)",
  observation_analysis: "var(--status-supported)",
  source_research: "var(--status-open)",
  livelihood_governance: "var(--status-refuted)",
  explanation_branches: "var(--accent)",
  field_check: "var(--status-supported)",
};

const TRIAD_CYCLE = [
  "var(--accent)",
  "var(--status-supported)",
  "var(--status-open)",
  "var(--status-refuted)",
] as const;

export function agentAccentColor(t: RunTask, idx: number): string {
  return TRIAD_BY_KIND[t.kind] ?? TRIAD_CYCLE[idx % TRIAD_CYCLE.length] ?? "var(--accent)";
}

export function humanTaskTitle(t: RunTask, duplicateKind: boolean, obsIdx: number): string {
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

export function AtWorkCursors({
  cursors,
  selectedTaskId,
  hoveredTaskId,
  setHoveredTaskId,
  setFolded,
  setSelectedTaskId,
  setStepsDismissed,
}: {
  cursors: readonly CursorPoint[];
  selectedTaskId: string | null;
  hoveredTaskId: string | null;
  setHoveredTaskId: Dispatch<SetStateAction<string | null>>;
  setFolded: Dispatch<SetStateAction<boolean>>;
  setSelectedTaskId: Dispatch<SetStateAction<string | null>>;
  setStepsDismissed: Dispatch<SetStateAction<boolean>>;
}) {
  if (cursors.length === 0) return null;
  return (
    <div className={styles.cursorLayer} data-chrome="">
      {cursors.map((c, i) => {
        const isSelected = selectedTaskId === c.task.id;
        const isHovered = hoveredTaskId === c.task.id;
        const isPrimary =
          selectedTaskId !== null ? isSelected : i === cursors.length - 1 || cursors.length === 1;
        const showDetail = isPrimary || isSelected || isHovered;
        const color = agentAccentColor(c.task, i);
        const title = humanTaskTitle(c.task, true, i);
        return (
          <button
            key={c.task.id}
            type="button"
            className={styles.agentCursor}
            style={
              {
                left: `${c.at.x.toFixed(1)}px`,
                top: `${c.at.y.toFixed(1)}px`,
                "--agent-color": color,
              } as CSSProperties
            }
            data-agent-cursor={c.task.kind}
            data-target-kind={c.targetKind}
            data-stratum={c.stratumId ?? undefined}
            data-selected={isSelected ? "" : undefined}
            data-hovered={isHovered ? "" : undefined}
            data-primary={isPrimary ? "" : undefined}
            aria-pressed={isSelected}
            title={
              isSelected
                ? `${title} (following in trace - click to unpin)`
                : `${title} - click to inspect step in trace`
            }
            onMouseEnter={() => {
              setHoveredTaskId(c.task.id);
            }}
            onMouseLeave={() => {
              setHoveredTaskId((cur) => (cur === c.task.id ? null : cur));
            }}
            onFocus={() => {
              setHoveredTaskId(c.task.id);
            }}
            onBlur={() => {
              setHoveredTaskId((cur) => (cur === c.task.id ? null : cur));
            }}
            onClick={() => {
              setFolded(true);
              setStepsDismissed(false);
              setSelectedTaskId((cur) => (cur === c.task.id ? null : c.task.id));
            }}
          >
            <span className={styles.cursorScanRing} aria-hidden="true" />
            <svg
              className={styles.cursorPointerSvg}
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M2.2 1.8L13.8 6.7C14.5 7.0 14.5 8.0 13.7 8.2L8.9 9.5L6.9 14.1C6.6 14.8 5.6 14.7 5.3 14.0L1.4 2.8C1.2 2.1 1.6 1.5 2.2 1.8Z"
                fill="var(--agent-color, var(--accent))"
                stroke="var(--bg-canvas)"
                strokeWidth="1.35"
                strokeLinejoin="round"
              />
            </svg>
            <span className={styles.cursorPill}>
              <span className={styles.cursorPillHeader}>
                <span className={styles.cursorPillName}>{title}</span>
                {isSelected || isHovered ? (
                  <span className={styles.cursorPillHint}>
                    {isSelected ? "Following" : "Inspect ›"}
                  </span>
                ) : null}
              </span>
              {showDetail && c.label ? (
                <span className={styles.cursorPillAction}>{c.label}</span>
              ) : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}
