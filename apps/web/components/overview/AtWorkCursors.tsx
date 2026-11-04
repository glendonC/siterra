"use client";

import type { CSSProperties, Dispatch, SetStateAction } from "react";
import { isAskTaskId } from "../../lib/ask/task";
import { ak } from "../../lib/copy/ask";
import { en, type MessageId } from "../../lib/copy/en";
import type { CursorPoint, Pt } from "../../lib/run/layout";
import type { RunTask, RunTaskStep } from "../../lib/run/model";
import styles from "./AtWork.module.css";

/** A step's square in the list: the plan and the explanations in the accent, every other step in the trace's blue. */
export function agentAccentColor(t: RunTask): string {
  return t.kind === "plan" || t.kind === "explanation_branches"
    ? "var(--accent)"
    : "var(--trace-measured)";
}

const TITLE: Partial<Record<string, MessageId>> = {
  plan: "task.kind.plan",
  source_research: "run.title.sources",
  livelihood_governance: "task.kind.livelihood_governance",
  explanation_branches: "run.title.explanations",
  brief_package: "run.title.fieldPlan",
  instrument_composition: "run.title.views",
};

/** Each step's name, by task id. The two observation steps are told apart by what they read, the vegetation's
 *  greenness or the rainfall and terrain; a run with one has the one name for both. A question typed in the Ask has
 *  one step, which reads the case's own findings (lib/ask/task.ts). */
export function taskTitles(tasks: readonly RunTask[]): Map<string, string> {
  const observations = tasks.filter((t) => t.kind === "observation_analysis");
  const titles = new Map<string, string>();
  for (const t of tasks) {
    if (isAskTaskId(t.id)) {
      titles.set(t.id, ak["ask.task.title"].text);
      continue;
    }
    let id = TITLE[t.kind];
    if (t.kind === "observation_analysis") {
      const sub = (t.sublabel ?? "").toLowerCase();
      id =
        observations.length < 2
          ? "run.title.observations"
          : sub.includes("vegetation")
            ? "run.title.vegetation"
            : sub.includes("rain") || observations.indexOf(t) > 0
              ? "run.title.rainfall"
              : "run.title.vegetation";
    }
    const kindKey = `task.kind.${t.kind}`;
    titles.set(t.id, id ? en[id].text : kindKey in en ? en[kindKey as MessageId].text : "");
  }
  return titles;
}

const VALIDATED = en["run.step.validated"].text;

/** What a step's line is read from. */
export type StepTask = Pick<RunTask, "id" | "kind" | "sublabel" | "steps" | "activeLabel">;

/** A task's steps as the list shows them: code checking each proposal is not a step of its own. */
export function shownSteps(t: Pick<RunTask, "steps">): RunTaskStep[] {
  return t.steps.filter((s) => s.label !== VALIDATED);
}

/** What a step does, in one line: its last step, else what it does now, else what a step of its kind does first. The
 *  list and the step's cursor say the same line. A typed question's one step only ever reads the case's findings: its
 *  events can arrive before the record of its task, when no kind is known yet. */
export function stepLine(t: StepTask): string {
  if (isAskTaskId(t.id)) return ak["ask.task.line"].text;
  const last = shownSteps(t).at(-1);
  if (last) return last.label;
  if (t.activeLabel) return t.activeLabel;
  const sub = (t.sublabel ?? "").toLowerCase();
  switch (t.kind) {
    case "plan":
      return en["run.step.plan"].text;
    case "instrument_composition":
      return en["run.step.views"].text;
    case "explanation_branches":
      return en["run.step.branches"].text;
    case "source_research":
    case "livelihood_governance":
      return en["run.step.searchSources"].text;
    default:
      return sub.includes("vegetation")
        ? en["run.step.readGreenness"].text
        : sub.includes("rain")
          ? en["run.step.readRainfall"].text
          : en["run.step.readCatchment"].text;
  }
}

/** A sheet of the split land (lib/overview/layers, StackLayer). */
export type Sheet = "trend" | "rain" | "snow" | "cover" | "bands";

/** The sheet a step's words name: the rainfall, the snow, the land cover or the elevation bands; a line that names
 *  none reads for the vegetation trend, what is being explained. "Comparing greenness and rainfall" names the rain. */
export function sheetOfLine(line: string): Sheet {
  const l = line.toLowerCase();
  if (/\brain/.test(l)) return "rain";
  if (/\bsnow/.test(l)) return "snow";
  if (/\bland (?:cover|use)\b/.test(l)) return "cover";
  if (/\b(?:elevation|slope|basin|bands?)\b/.test(l)) return "bands";
  return "trend";
}

/** The sheet of the split land a step reads, by the words of its line (stepLine): the one the line names where the
 *  land has it, else the vegetation trend; null where the land has neither. The land lights it as the step comes into
 *  focus (useOverviewLayerFocus, focusTaskLayer) and the step's cursor points at it, so both match what the line says. */
export function sheetOfTask(t: StepTask, has: (sheet: Sheet) => boolean): Sheet | null {
  const named = sheetOfLine(stepLine(t));
  if (has(named)) return named;
  return has("trend") ? "trend" : null;
}

/** A cursor as drawn: beside its point on the land (its card to the right), or at the left edge of a split land's
 *  sheet, its card to the left, where it covers no other sheet and no sheet's label. */
export interface PlacedCursor {
  task: RunTask;
  at: Pt;
  side: "right" | "left";
  targetKind: CursorPoint["targetKind"];
  stratumId: string | null;
}

export function AtWorkCursors({
  cursors,
  titles,
  primaryId,
  selectedTaskId,
  hoveredTaskId,
  setHoveredTaskId,
  setFolded,
  setSelectedTaskId,
  setStepsDismissed,
}: {
  cursors: readonly PlacedCursor[];
  titles: ReadonlyMap<string, string>;
  /** The step whose cursor says what it does: the one picked, else the latest running. */
  primaryId: string | null;
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
      {cursors.map((c) => {
        const isSelected = selectedTaskId === c.task.id;
        const isHovered = hoveredTaskId === c.task.id;
        const isPrimary = primaryId === c.task.id;
        const showDetail = isPrimary || isSelected || isHovered;
        return (
          <button
            key={c.task.id}
            type="button"
            className={styles.agentCursor}
            style={
              {
                left: `${c.at.x.toFixed(1)}px`,
                top: `${c.at.y.toFixed(1)}px`,
                "--ax": `${c.at.x.toFixed(1)}px`,
              } as CSSProperties
            }
            data-agent-cursor={c.task.kind}
            data-target-kind={c.targetKind}
            data-stratum={c.stratumId ?? undefined}
            data-side={c.side}
            data-selected={isSelected ? "" : undefined}
            data-hovered={isHovered ? "" : undefined}
            data-primary={isPrimary ? "" : undefined}
            aria-pressed={isSelected}
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
                fill="var(--accent)"
                stroke="var(--bg-canvas)"
                strokeWidth="1.35"
                strokeLinejoin="round"
              />
            </svg>
            <span className={styles.cursorPill}>
              <span className={styles.cursorPillName}>{titles.get(c.task.id)}</span>
              {showDetail ? (
                <span className={styles.cursorPillAction}>{stepLine(c.task)}</span>
              ) : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}
