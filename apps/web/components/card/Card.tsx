"use client";

// The one card (design language rule 5). It keeps its place at the right, is as tall as its content, and
// says one thing at a time. Parts arrive in the order of rule 7: the statement whole, its grey half 250 ms
// later, the source 250 ms after; the leader draws once the card has settled.

import type { ReactNode } from "react";
import type { CardContent, StepState } from "../../lib/card/content";
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
  return (
    <section
      className={styles.card}
      key={stepKey}
      data-budget="card"
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
