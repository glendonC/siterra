"use client";

// The one card (design language rule 5). It keeps its place at the right, is as tall as its content, and
// says one thing at a time. Parts arrive in the order of rule 7: the statement whole, its grey half 250 ms
// later, the source 250 ms after; the leader draws once the card has settled.

import { useState, type ReactNode } from "react";
import { cardLines, type CardContent, type StepState } from "../../lib/card/content";
import { en, type MessageId } from "../../lib/copy/en";
import styles from "./Card.module.css";

const STEP_WORD: Record<StepState, MessageId> = {
  queued: "task.queued",
  running: "task.running",
  needs_input: "task.needs_input",
  done: "task.done",
  partial: "task.partial",
  failed: "task.failed",
  cancelled: "task.cancelled",
};

export interface CardProps {
  content: CardContent;
  /** The one action as a key hint, for example "↵ Show the field plan". */
  action?: ReactNode;
  /** Changing the key replays the arrival order, for a new step. */
  stepKey: string;
  /** Element the leader starts from: the line the leader belongs to. */
  anchor?: "statement" | "figure" | "working" | "section";
}

export function Card({ content: c, action, stepKey, anchor = "statement" }: CardProps) {
  const [activeCitation, setActiveCitation] = useState<number | null>(null);
  const selectedCit =
    activeCitation !== null
      ? c.findings?.citations.find((cit) => cit.index === activeCitation)
      : undefined;

  return (
    <section
      className={styles.card}
      key={stepKey}
      data-budget="card"
      data-budget-text={cardLines(c).join(" ")}
      aria-live="polite"
      data-record-ids={c.recordIds.join(" ")}
    >
      {c.question ? <p className={styles.question}>{c.question}</p> : null}
      {c.branch ? (
        <p className={styles.branch}>
          <i className={styles.branchLine} aria-hidden="true" />
          {c.branch}
        </p>
      ) : null}
      {c.working ? (
        <p className={styles.working} data-leader-anchor={anchor === "working" ? "" : undefined}>
          {c.working}
        </p>
      ) : null}
      {c.steps?.length ? (
        <ol className={styles.steps}>
          {c.steps.map((s) => (
            <li
              key={s.taskId}
              className={styles.step}
              data-state={s.state}
              data-record-ids={s.taskId}
            >
              <span className={styles.stepN}>{s.n}</span>
              <span className={styles.stepText}>{s.text}</span>
              <i className={styles.stepMark} aria-hidden="true" />
              <span className={styles.srOnly}>{en[STEP_WORD[s.state]].text}</span>
            </li>
          ))}
        </ol>
      ) : null}
      {c.section ? (
        <div className={styles.section} data-leader-anchor={anchor === "section" ? "" : undefined}>
          <h3 className={styles.sectionHeading}>{c.section.heading}</h3>
          {c.section.lines.map((l) => (
            <p key={l} className={styles.sectionLine}>
              {l}
            </p>
          ))}
        </div>
      ) : null}
      {c.findings && c.findings.items.length > 0 ? (
        <div className={styles.findings} data-findings>
          <h3 className={styles.sectionHeading}>{en["findings.heading"].text}</h3>
          <ul className={styles.findingList}>
            {c.findings.items.map((f) => (
              <li
                key={f.evidenceId}
                className={styles.findingItem}
                data-finding-id={f.evidenceId}
                data-record-ids={f.recordIds.join(" ")}
              >
                <span className={styles.findingStatement}>{f.statement}</span>
                {f.citationNumbers.map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={styles.citationChip}
                    data-citation-chip={n}
                    aria-pressed={activeCitation === n}
                    onClick={() => {
                      setActiveCitation((prev) => (prev === n ? null : n));
                    }}
                  >
                    [{n}]
                  </button>
                ))}
              </li>
            ))}
          </ul>
          {selectedCit ? (
            <div
              className={styles.citationDetail}
              data-citation-detail={selectedCit.index}
              data-record-ids={selectedCit.recordId}
            >
              <div className={styles.citationHeader}>
                <span className={styles.citationKind}>
                  [{selectedCit.index}]{" "}
                  {
                    en[selectedCit.kind === "source" ? "findings.excerpt" : "findings.measurement"]
                      .text
                  }
                </span>
                <button
                  type="button"
                  className={styles.citationClose}
                  onClick={() => {
                    setActiveCitation(null);
                  }}
                >
                  {en["findings.close"].text}
                </button>
              </div>
              <p className={styles.citationTitle}>
                {selectedCit.title}
                {selectedCit.locator ? ` · ${selectedCit.locator}` : ""}
              </p>
              <p className={styles.citationExcerpt}>{selectedCit.detail}</p>
            </div>
          ) : null}
        </div>
      ) : null}
      {c.status ? <p className={styles.status}>{c.status}</p> : null}
      {c.statement ? (
        <p
          className={styles.statement}
          data-leader-anchor={anchor === "statement" ? "" : undefined}
        >
          <span className={styles.ink}>{c.statement.claim}</span>
          {c.statement.limit ? (
            <>
              {" "}
              <span className={styles.grey}>{c.statement.limit}</span>
            </>
          ) : null}
        </p>
      ) : null}
      {c.figure ? (
        <div className={styles.figure} data-leader-anchor={anchor === "figure" ? "" : undefined}>
          <p className={styles.figureLabel}>{c.figure.label}</p>
          <p className={styles.figureValue}>
            <span className={styles.figureNumber}>{c.figure.value}</span>
            <span className={styles.figureUnit}>{c.figure.unit}</span>
          </p>
          {c.figure.context ? <p className={styles.figureContext}>{c.figure.context}</p> : null}
        </div>
      ) : null}
      {c.sources.map((s) => (
        <p key={s} className={styles.source}>
          {s}
        </p>
      ))}
      {c.meaning ? <p className={styles.meaning}>{c.meaning}</p> : null}
      {(c.open ?? []).map((o) => (
        <p key={o} className={styles.open}>
          <i className={styles.ring} aria-hidden="true" />
          {o}
        </p>
      ))}
      {action ? <div className={styles.action}>{action}</div> : null}
    </section>
  );
}
