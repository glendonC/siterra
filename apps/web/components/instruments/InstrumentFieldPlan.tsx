"use client";

// The field plan, in the instruments' A to C manner, drawn as a dashed blueprint and labelled proposed: the branch
// merge's explanations across the top with the status the merge gave each, and every proposed field check as a
// dashed row joining the explanations it tells apart. Caption and records come from the case (the field plan spec
// and the merge it names). A case without a field plan spec shows why the composer opened none.

import { en, format, type MessageId } from "../../lib/copy/en";
import { keepTogether } from "../../lib/instruments/caption";
import { fieldPlanFrom, type FieldPlanData } from "../../lib/instruments/fieldplan/data";
import { plainReason } from "../../lib/instruments/fieldplan/reason";
import { obsidian, pixelColours as C } from "../../lib/theme/obsidian";
import styles from "./InstrumentFieldPlan.module.css";
import { Fragment, useEffect, useId, useRef } from "react";
import { useBlockedReasons, useInstrument } from "./InstrumentRecords";

export const FIELD_PLAN_DESIGN = { width: 1440, height: 900 } as const;

/** Column centres for the explanations, and the rows of the checks, on the 1440 x 900 stage. */
const COLUMNS = { first: 200, step: 260, head: 196 } as const;
const ROWS = { first: 470, step: 150 } as const;
const OPEN = "cannot_be_assessed";

const statusLabel = (status: string) => {
  const id = `branches.status.${status}` as MessageId;
  return id in en ? en[id].text : status;
};

function plan(d: FieldPlanData) {
  const x = (id: string) => {
    const i = d.explanations.findIndex((e) => e.id === id);
    return COLUMNS.first + Math.max(0, i) * COLUMNS.step;
  };
  const label = (id: string) => d.explanations.find((e) => e.id === id)?.label ?? id;
  return { x, label };
}

export function InstrumentFieldPlan() {
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const record = useInstrument("field_plan");
  const blocked = useBlockedReasons("field_plan");
  const descriptionId = useId();

  useEffect(() => {
    const root = rootRef.current;
    const stage = stageRef.current;
    if (!root || !stage) return;
    const fitStage = () => {
      const s = Math.min(
        root.clientWidth / FIELD_PLAN_DESIGN.width,
        root.clientHeight / FIELD_PLAN_DESIGN.height,
      );
      const left = (root.clientWidth - FIELD_PLAN_DESIGN.width * s) / 2;
      const top = (root.clientHeight - FIELD_PLAN_DESIGN.height * s) / 2;
      stage.style.transform = `translate(${left.toFixed(1)}px, ${top.toFixed(1)}px) scale(${s.toFixed(4)})`;
    };
    const observer = new ResizeObserver(fitStage);
    observer.observe(root);
    fitStage();
    return () => {
      observer.disconnect();
    };
  }, []);

  let data: FieldPlanData | null = null;
  let failed = record.status === "failed";
  if (record.status === "ready" && record.view.spec.parameters.kind === "field_plan") {
    try {
      data = fieldPlanFrom(record.view.spec.parameters.branchMergeId, record.snapshot.records);
    } catch (e) {
      console.error("Field plan not loaded", e);
      failed = true;
    }
  }
  const caption = record.status === "ready" ? record.view.spec.caption : null;
  const layout = data ? plan(data) : null;

  return (
    <div ref={rootRef} className={styles.root} data-theme="obsidian" data-instrument="field">
      <p id={descriptionId} className={styles.srOnly}>
        {en["instrument.fieldPlan.description"].text}
      </p>
      <div ref={stageRef} className={styles.stage} role="group" aria-describedby={descriptionId}>
        {failed && (
          <p className={styles.notice} role="status">
            {en["instrument.fieldPlan.failed"].text}
          </p>
        )}
        {record.status === "absent" && (
          <div className={styles.notice} role="status" data-field-plan="blocked">
            <p className={styles.noticeHead}>{en["instrument.fieldPlan.none"].text}</p>
            {blocked.map((r) => (
              <p key={r} className={styles.noticeReason}>
                {r}
              </p>
            ))}
          </div>
        )}
        {data && layout && caption && !failed && (
          <>
            <p className={styles.caption}>
              <span className={styles.ink}>{keepTogether(caption.ink)}</span>{" "}
              <span className={styles.grey}>{keepTogether(caption.grey)}</span>
            </p>
            <svg
              className={styles.plot}
              width={FIELD_PLAN_DESIGN.width}
              height={FIELD_PLAN_DESIGN.height}
              aria-hidden="true"
            >
              {data.explanations.map((e) => (
                <line
                  key={e.id}
                  x1={layout.x(e.id)}
                  x2={layout.x(e.id)}
                  y1={COLUMNS.head + 96}
                  y2={ROWS.first + (data.checks.length - 1) * ROWS.step}
                  stroke={C.gridLine}
                />
              ))}
              {data.checks.map((c, i) => {
                const y = ROWS.first + i * ROWS.step;
                const ids = [...new Set(c.separates.flat())];
                const xs = ids.map((id) => layout.x(id));
                return (
                  <g key={c.id} data-check={c.id}>
                    {/* one fine dashed line through exactly the explanations the check tells apart */}
                    <line
                      x1={Math.min(...xs)}
                      x2={Math.max(...xs)}
                      y1={y}
                      y2={y}
                      stroke={obsidian.accent}
                      strokeWidth={1}
                      strokeDasharray="4 4"
                    />
                    {ids.map((id) => (
                      <circle
                        key={id}
                        cx={layout.x(id)}
                        cy={y}
                        r={4}
                        fill={obsidian.canvas}
                        stroke={obsidian.accent}
                        strokeWidth={1.5}
                      />
                    ))}
                  </g>
                );
              })}
            </svg>
            {data.explanations.map((e) => (
              <div
                key={e.id}
                className={e.status === OPEN ? styles.column : `${styles.column} ${styles.closed}`}
                style={{ left: layout.x(e.id) - 115, top: COLUMNS.head }}
                data-explanation={e.id}
              >
                <p className={styles.colLabel}>{e.label}</p>
                <p className={styles.colStatus}>{statusLabel(e.status)}</p>
                {plainReason(e.reason) !== null && (
                  <p className={styles.colReason}>{plainReason(e.reason)}</p>
                )}
              </div>
            ))}
            {data.checks.map((c, i) => {
              const ids = [...new Set(c.separates.flat())];
              const left = Math.min(...ids.map((id) => layout.x(id)));
              const y = ROWS.first + i * ROWS.step;
              return (
                <Fragment key={c.id}>
                  <div className={styles.checkHead} style={{ left: left - 4, top: y - 34 }}>
                    <span className={styles.checkLabel}>{c.label}</span>
                    <span className={styles.proposed}>
                      {en["instrument.fieldPlan.proposed"].text}
                    </span>
                  </div>
                  <div className={styles.checkNote} style={{ left: left - 4, top: y + 12 }}>
                    {format("instrument.fieldPlan.separates", {
                      pairs: c.separates
                        .map(([a, b]) =>
                          format("instrument.fieldPlan.pair", {
                            a: layout.label(a),
                            b: layout.label(b),
                          }),
                        )
                        .join("; "),
                    })}
                  </div>
                  {c.onlySeparates.map(([a, b]) => (
                    <div
                      key={`${a} ${b}`}
                      className={styles.checkNote}
                      style={{ left: left - 4, top: y + 30 }}
                    >
                      {format("instrument.fieldPlan.only", {
                        a: layout.label(a),
                        b: layout.label(b),
                      })}
                    </div>
                  ))}
                </Fragment>
              );
            })}
            <p className={styles.footnote}>
              {data.unseparated.length === 0
                ? en["instrument.fieldPlan.unseparated.none"].text
                : format("instrument.fieldPlan.unseparated", {
                    pairs: data.unseparated
                      .map(([a, b]) =>
                        format("instrument.fieldPlan.pair", {
                          a: layout.label(a),
                          b: layout.label(b),
                        }),
                      )
                      .join("; "),
                  })}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
