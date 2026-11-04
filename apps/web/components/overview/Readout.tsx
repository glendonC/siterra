"use client";

// The answer (UI-2): one sheet that needs no click to be understood. The question; the answer in one sentence; then
// one grid of a label and its content: each verdict with the explanations the answer does not already name, the checks
// that would tell them apart, the views each one key away, and the review the plan asks for. Every word is a record
// field or a catalog word around one (lib/readout/readout.ts), and the land shows the claim's own sheet
// (lib/readout/proof.ts). No explanation is drawn on the land (CMP-23).

import { Fragment, useEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import { en } from "../../lib/copy/en";
import { rd } from "../../lib/copy/readout";
import {
  findingWords,
  followUpOf,
  nextWords,
  reviewWords,
  type GroundCheck,
  type Readout as ReadoutModel,
} from "../../lib/readout/readout";
import { KeyChip } from "../controls/Control";
import { scrollFade } from "../controls/scrollFade";
import trace from "./AtWork.module.css";
import styles from "./Readout.module.css";

export interface ReadoutView {
  /** The view's name, as the catalog gives it. */
  label: string;
  onOpen: () => void;
  /** For a view that stands open on the answer itself (Map Layers' split): whether it is open now. */
  pressed?: boolean;
}

export interface ReadoutProps {
  readout: ReadoutModel;
  /** The question the answer is to: the record's own, else the case's. */
  question: string;
  /** Not read: the column does not say where its record came from. */
  recorded?: boolean;
  /** A question the visitor sent, shown above its own findings. */
  asked: string | null;
  /** The views the place offers, in the order the number keys open them. */
  views: readonly ReadoutView[];
  /** Lights a check's place on the land, or hands the land back to the answer's proof. */
  onCheck: (check: GroundCheck | null) => void;
  /** Opens the brief; null when the record holds no brief. */
  onBrief: (() => void) | null;
  /** True while something else holds the keys (the Ask, an instrument opened in place). */
  keysOff?: boolean;
  /** Not read: nothing in the column steps. */
  stepRef?: RefObject<((delta: 1 | -1) => void) | null>;
}

/** The stagger index of a part as it arrives. */
const at = (i: number) => ({ "--i": i }) as CSSProperties;

/** Words with a key after the last one: when the words wrap, the key goes with the last word, never alone. */
function WithKey({ text, chip }: { text: string; chip: string }) {
  const cut = text.lastIndexOf(" ");
  return (
    <>
      {text.slice(0, cut + 1)}
      <span className={styles.last}>
        {text.slice(cut + 1)}
        <span className={styles.trail}>
          <KeyChip>{chip}</KeyChip>
        </span>
      </span>
    </>
  );
}

export function Readout({
  readout,
  question,
  asked,
  views,
  onCheck,
  onBrief,
  keysOff = false,
}: ReadoutProps) {
  const { answer, ground, request } = readout;
  const [check, setCheck] = useState<string | null>(null);
  const [said, setSaid] = useState("");
  const [allFindings, setAllFindings] = useState(false);
  useEffect(() => {
    setCheck(null);
    setSaid("");
    setAllFindings(false);
  }, [readout]);

  // a pressed check lights its own place; letting it go hands the land back to the answer's proof
  const lit = useRef<string | null>(null);
  useEffect(() => {
    const c = ground?.checks.find((x) => x.number === check);
    const next = c?.drawn ? c : null;
    if ((next?.number ?? null) === lit.current) return;
    lit.current = next?.number ?? null;
    onCheck(next);
  }, [check, ground, onCheck]);
  useEffect(
    () => () => {
      if (lit.current !== null) {
        lit.current = null;
        onCheck(null);
      }
    },
    [onCheck],
  );

  // the number keys open the views, E the brief
  useEffect(() => {
    if (keysOff) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
      const t = ev.target;
      if (t instanceof HTMLElement && t.closest("input, textarea, select, [contenteditable]"))
        return;
      if (/^[1-9]$/.test(ev.key)) {
        const view = views[Number(ev.key) - 1];
        if (view) {
          ev.preventDefault();
          view.onOpen();
        }
      } else if ((ev.key === "e" || ev.key === "E") && onBrief) {
        ev.preventDefault();
        onBrief();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [keysOff, onBrief, views]);

  const { verdicts } = readout;
  const checks = ground?.checks ?? [];
  const reviewLine = ground ? reviewWords(ground.reviews) : null;
  const followUp = request ? followUpOf(request.findings, allFindings) : null;
  let order = 0;
  const next = () => order++;

  return (
    <div className={styles.readout} data-readout>
      <div className={styles.rail}>
        <section className={styles.question} data-run-question>
          <h2 className={trace.asked}>{question}</h2>
        </section>
        <p className={`${styles.answer} ${styles.arrive}`} data-readout-answer style={at(next())}>
          {answer.claim ? <span>{answer.claim}</span> : null}
        </p>

        <div className={styles.sections} ref={scrollFade}>
          {request && followUp ? (
            <dl
              className={`${styles.grid} ${styles.arrive}`}
              data-readout-request
              style={at(next())}
            >
              <dt className={styles.head}>{rd["readout.request.head"].text}</dt>
              <dd className={`${styles.cell} ${styles.lines}`}>
                {asked ? <p className={styles.asked}>{asked}</p> : null}
                {request.findings.length ? (
                  followUp.shown.map((f) => <p key={f.id}>{findingWords(f)}</p>)
                ) : (
                  <p className={styles.quiet}>{rd["readout.request.none"].text}</p>
                )}
                {followUp.toggle ? (
                  <button
                    type="button"
                    className={`${styles.row} ${styles.more}`}
                    aria-expanded={allFindings}
                    data-readout-request-toggle
                    onClick={() => {
                      setAllFindings((x) => !x);
                    }}
                  >
                    {followUp.toggle}
                  </button>
                ) : null}
              </dd>
            </dl>
          ) : null}

          {verdicts.length ? (
            <dl className={styles.grid} data-readout-group="explanations">
              {verdicts.map((v) => {
                const i = next();
                return (
                  <Fragment key={v.status}>
                    <dt className={`${styles.head} ${styles.arrive}`} style={at(i)}>
                      <span className={styles.dot} data-status={v.status} aria-hidden="true" />
                      {rd[`readout.verdict.${v.status}`].text}
                    </dt>
                    <dd
                      className={`${styles.cell} ${styles.arrive}`}
                      data-verdict={v.status}
                      style={at(i)}
                    >
                      {v.rows.map((row, n) => (
                        <Fragment key={row.branchId}>
                          {n > 0 ? ", " : null}
                          <span data-readout-branch={row.explanationId}>
                            {row.label}
                            {row.stale ? (
                              <span className={styles.stale}>
                                {" ("}
                                {rd["readout.verdict.stale"].text}
                                {")"}
                              </span>
                            ) : null}
                          </span>
                        </Fragment>
                      ))}
                    </dd>
                  </Fragment>
                );
              })}
            </dl>
          ) : null}

          {checks.length ? (
            <dl
              className={`${styles.grid} ${styles.arrive}`}
              data-readout-group="ground"
              style={at(next())}
            >
              <dt className={styles.head}>{rd["readout.next.head"].text}</dt>
              <dd className={styles.cell}>
                <ul className={styles.list}>
                  {checks.map((c) => (
                    <li key={c.number} data-readout-check={c.fieldCheckId ?? c.number}>
                      {c.drawn ? (
                        <button
                          type="button"
                          className={styles.row}
                          aria-pressed={check === c.number}
                          onClick={() => {
                            const on = check !== c.number;
                            setCheck(on ? c.number : null);
                            setSaid(on ? (c.place ?? "") : "");
                          }}
                        >
                          {nextWords(c)}
                        </button>
                      ) : (
                        <p>{nextWords(c)}</p>
                      )}
                    </li>
                  ))}
                </ul>
              </dd>
            </dl>
          ) : null}

          {views.length ? (
            <dl className={`${styles.grid} ${styles.arrive}`} data-readout-views style={at(next())}>
              <dt className={styles.head}>{rd["readout.views.head"].text}</dt>
              <dd className={styles.cell}>
                <ul className={styles.list}>
                  {views.map((v, n) => (
                    <li key={v.label}>
                      <button
                        type="button"
                        className={styles.row}
                        aria-keyshortcuts={String(n + 1)}
                        aria-pressed={v.pressed}
                        onClick={v.onOpen}
                      >
                        <KeyChip>{String(n + 1)}</KeyChip>
                        <span>{v.label}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </dd>
            </dl>
          ) : null}
        </div>

        {reviewLine ? (
          <div className={`${styles.grid} ${styles.review} ${styles.arrive}`} style={at(next())}>
            <div className={styles.head}>
              <span className={styles.pill}>{en["run.tree.needsYou"].text}</span>
            </div>
            <div className={styles.cell}>
              <button
                type="button"
                className={`${styles.row} ${styles.flow}`}
                data-readout-review
                aria-keyshortcuts={onBrief ? "E" : undefined}
                disabled={onBrief === null}
                onClick={() => onBrief?.()}
              >
                {onBrief ? (
                  <WithKey text={reviewLine} chip={rd["readout.review.key"].text} />
                ) : (
                  reviewLine
                )}
              </button>
            </div>
          </div>
        ) : null}
      </div>
      <p className={styles.srOnly} aria-live="polite">
        {said}
      </p>
    </div>
  );
}
