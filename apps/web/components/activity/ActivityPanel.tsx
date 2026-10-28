"use client";

// The activity panel, docked under the card: the request's steps from its event log (projectActivity),
// under the engine's five stages (stageGroups; a stage with no task shows its name only), each with its status, the models and tools it used, what it returned, and what was rejected or is
// missing. A replay says it is one, and a replay playing at reading pace says that too. While the request
// runs the panel holds the one Esc action (Stop, or Show all steps during a paced replay).

import { stageGroups, type ActivityRow, type TraceSummary } from "../../lib/activity/activity";
import { en, format, type MessageId } from "../../lib/copy/en";
import type { ProjectedBranches } from "../../lib/projection/branches";
import { ExplanationBranches } from "../branches/ExplanationBranches";
import { READING_PACE_MS } from "./usePacedLog";
import styles from "./ActivityPanel.module.css";

export interface ActivityPanelProps {
  rows: ActivityRow[];
  /** The request's model calls were replayed, not live. */
  replay?: "synthetic" | "recorded" | undefined;
  /** True while a replay plays at reading pace. */
  pacing?: boolean;
  /** The Esc action's label while there is one. */
  stop?: MessageId | undefined;
  onStop?: () => void;
  /** CMP-16 execution trace summary and items. */
  trace?: TraceSummary | undefined;
  traceOpen?: boolean;
  onToggleTrace?: () => void;
  /** CMP-23 explanation branches and field plan. */
  branches?: ProjectedBranches | undefined;
  selectedBranchId?: string | null;
  onSelectBranch?: (branchId: string) => void;
}

export function ActivityPanel({
  rows,
  replay,
  pacing = false,
  stop,
  onStop,
  trace,
  traceOpen = false,
  onToggleTrace,
  branches,
  selectedBranchId,
  onSelectBranch,
}: ActivityPanelProps) {
  return (
    <section
      className={styles.panel}
      data-budget="island"
      data-activity
      aria-labelledby="activity-title"
    >
      <header className={styles.head}>
        <h2 id="activity-title" className={styles.title}>
          {en["activity.title"].text}
        </h2>
        <div className={styles.headActions}>
          {trace ? (
            <button
              type="button"
              className={styles.traceButton}
              aria-pressed={traceOpen}
              onClick={onToggleTrace}
              data-trace-toggle
            >
              {en["action.trace"].text}
            </button>
          ) : null}
          {stop ? (
            <button
              type="button"
              className={styles.key}
              onClick={onStop}
              aria-keyshortcuts="Escape"
              data-budget="action"
            >
              <kbd className={styles.glyph} aria-hidden="true">
                Esc
              </kbd>
              {en[stop].text}
            </button>
          ) : null}
        </div>
      </header>
      {trace && traceOpen ? (
        <div className={styles.traceDrilldown} data-trace-drilldown>
          <h3 className={styles.traceHeading}>{en["trace.heading"].text}</h3>
          <p className={styles.traceLine}>{trace.summaryLine}</p>
          <p className={styles.traceLine}>{trace.usageLine}</p>
          {trace.items.length > 0 ? (
            <ol className={styles.traceList}>
              {trace.items.map((item) => (
                <li
                  key={`${String(item.sequence)}-${item.kind}`}
                  className={styles.traceItem}
                  data-trace-kind={item.kind}
                >
                  <span className={styles.traceSeq}>#{item.sequence}</span>
                  <span className={styles.traceDetail}>{item.detail}</span>
                </li>
              ))}
            </ol>
          ) : null}
        </div>
      ) : null}
      {replay ? (
        <p className={styles.replay} data-replay={replay}>
          {en[replay === "recorded" ? "activity.recorded" : "activity.synthetic"].text}
          {pacing ? (
            <>
              {". "}
              {format("activity.pace", { seconds: (READING_PACE_MS / 1000).toFixed(1) })}
            </>
          ) : null}
        </p>
      ) : null}
      {rows.length === 0 ? (
        <p className={styles.empty}>{en["activity.empty"].text}</p>
      ) : (
        <ol className={styles.stages}>
          {stageGroups(rows).map((g) => (
            <li
              key={g.id}
              className={styles.stage}
              data-stage={g.id}
              data-empty={g.rows.length === 0}
            >
              <h3 className={styles.stageName}>{g.label}</h3>
              {g.rows.length > 0 ? (
                <ol className={styles.rows}>
                  {g.rows.map((r) => (
                    <Row key={r.taskId} r={r} />
                  ))}
                </ol>
              ) : null}
              {g.id === "hypothesis_testing" && branches ? (
                <ExplanationBranches
                  branches={branches}
                  selectedBranchId={selectedBranchId}
                  onSelectBranch={onSelectBranch}
                />
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function Row({ r }: { r: ActivityRow }) {
  return (
    <li className={styles.row} data-state={r.state} data-record-ids={r.taskId}>
      <p className={styles.rowHead}>
        <span className={styles.label}>{r.label}</span>
        <span className={styles.status}>{r.status}</span>
      </p>
      <p className={styles.question}>{r.question}</p>
      {r.badges.length > 0 ? (
        <ul className={styles.badges}>
          {r.badges.map((b) => (
            <li key={b} className={styles.badge}>
              {b}
            </li>
          ))}
        </ul>
      ) : null}
      {r.lines.map((l, i) => (
        <p key={`${String(i)} ${l.text}`} className={styles.line} data-kind={l.kind}>
          {l.text}
        </p>
      ))}
    </li>
  );
}
