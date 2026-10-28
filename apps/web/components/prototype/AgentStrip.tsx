"use client";

// The run's steps in one strip: what each step does, the Meta model it calls in the product (or that it is a
// deterministic tool), the check its output must pass, and the hypotheses rejected. Stop is one press away.

import { en, format } from "../../lib/copy/en";
import type { AgentStep } from "../../lib/prototype/flow";
import { Check, Chevron, Stop } from "./icons";
import styles from "./Story.module.css";

type State = "waiting" | "running" | "done" | "skipped";

function stateOf(s: AgentStep, t: number): State {
  if (s.skipped) return t >= s.start ? "skipped" : "waiting";
  if (t >= s.end) return "done";
  if (t >= s.start) return "running";
  return "waiting";
}

export function AgentStrip({
  steps,
  t,
  stopped,
  finished,
  open,
  onToggle,
  onStop,
}: {
  steps: AgentStep[];
  t: number;
  stopped: boolean;
  finished: boolean;
  open: boolean;
  onToggle: () => void;
  onStop: () => void;
}) {
  const rejected = steps.flatMap((s) => (t >= s.end ? (s.rejected ?? []) : []));
  const done = steps.filter((s) => stateOf(s, t) === "done").length;
  return (
    <section className={styles.strip} data-open={open ? "true" : "false"} aria-live="polite">
      <header className={styles.stripHead}>
        <span className={styles.demoTag}>{en["flow.strip.run"].text}</span>
        <span className={styles.demoTag}>{en["flow.strip.noModel"].text}</span>
        {stopped ? (
          <span className={styles.stripNote}>
            {en["flow.strip.stopped"].text}. {en["flow.strip.stoppedNote"].text}
          </span>
        ) : null}
        {finished ? (
          <span className={styles.stripSummary}>
            {format("flow.strip.summary", { n: done, r: rejected.length })}
          </span>
        ) : null}
        {finished || stopped ? (
          <button
            type="button"
            className={styles.stripToggle}
            aria-expanded={open}
            onClick={onToggle}
          >
            {en["flow.steps"].text}
            <span data-open={open ? "true" : "false"}>
              <Chevron />
            </span>
          </button>
        ) : (
          <button type="button" className={styles.stripStop} onClick={onStop}>
            <Stop />
            {en["flow.stop"].text}
          </button>
        )}
      </header>
      {open ? (
        <ol className={styles.stripSteps}>
          {steps.map((s) => {
            const st = stopped && stateOf(s, t) !== "done" ? "waiting" : stateOf(s, t);
            return (
              <li key={s.id} className={styles.stepCard} data-state={st}>
                <span className={styles.stepRing} aria-hidden="true">
                  {st === "done" ? <Check /> : null}
                </span>
                <span className={styles.stepTitle}>{s.title}</span>
                <span className={styles.badge} data-tool={s.model ? "false" : "true"}>
                  {s.model ? (
                    <>
                      <b>{en["flow.strip.meta"].text}</b>
                      {s.model}
                    </>
                  ) : (
                    en["flow.strip.tool"].text
                  )}
                </span>
                {st === "skipped" ? (
                  <span className={styles.stepCheck}>
                    <span className={styles.demoTag}>{en["flow.strip.skipped"].text}</span>{" "}
                    {s.skipped}
                  </span>
                ) : (
                  <span className={styles.stepCheck}>{s.check}</span>
                )}
                {s.rejected && st === "done"
                  ? s.rejected.map((r) => (
                      <span key={r} className={styles.rejected}>
                        <span>{en["flow.strip.rejected"].text}</span> <s>{r}</s>
                      </span>
                    ))
                  : null}
              </li>
            );
          })}
        </ol>
      ) : null}
    </section>
  );
}
