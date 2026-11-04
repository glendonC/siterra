"use client";

// The answer (UI-2): one sheet that needs no click to be understood. The question; the answer in one sentence; then
// one grid of a label and its content: a question typed in the Ask with the case's findings that answer it, each verdict
// with the explanations the answer does not already name, the checks that would tell them apart, the views each one key
// away, and the review the plan asks for. Every word is a record field or a catalog word around one
// (lib/readout/readout.ts), a chosen view's lead is its view's own (lib/ask/leads.ts), and the land shows the claim's
// own sheet (lib/readout/proof.ts). No explanation is drawn on the land (CMP-23).

import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";
import type { LeadView, ViewLeads } from "../../lib/ask/findings";
import { loadViewLeads, type LeadSources } from "../../lib/ask/leads";
import { en } from "../../lib/copy/en";
import { rd } from "../../lib/copy/readout";
import { loadInstruments } from "../../lib/instruments/listing";
import { VIEW_LABEL } from "../../lib/overview/actions";
import {
  followUpOf,
  nextWords,
  reviewWords,
  type FollowUpFinding,
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

/** How long the column waits for a chosen view's lead before it shows the rest without it. */
const LEAD_WAIT_MS = 4000;

type Get = (input: string, init?: RequestInit) => Promise<Response>;
const get: Get = (input, init) => fetch(input, init);

/** The listing of each case, and each view's lead, read once per page (lib/ask/leads.ts); a failed read is tried again. */
const listings = new Map<string, Promise<Awaited<ReturnType<typeof loadInstruments>>>>();
const leadReads = new Map<string, Promise<readonly string[] | null>>();

function leadOf(sources: LeadSources, view: LeadView): Promise<readonly string[] | null> {
  const key = `${sources.caseId} ${view}`;
  const held = leadReads.get(key);
  if (held) return held;
  let listing = listings.get(sources.caseId);
  if (!listing) {
    listing = loadInstruments(sources.caseId, get);
    listings.set(sources.caseId, listing);
  }
  const read = listing
    .then((l) => (l.status === "ready" ? loadViewLeads(sources, l.listing, get, [view]) : {}))
    .then((leads: ViewLeads) => leads[view] ?? null)
    .catch(() => null)
    .then((lines) => {
      if (lines === null) {
        leadReads.delete(key);
        listings.delete(sources.caseId);
      }
      return lines;
    });
  leadReads.set(key, read);
  return read;
}

/**
 * The leads of the views a follow-up chose, once read: until they are (or the wait is over), `settled` is false and
 * the column holds its groups back, so nothing moves under the reader when the lines arrive.
 */
function useViewLeads(
  sources: LeadSources | null,
  views: readonly LeadView[],
): { leads: ViewLeads; settled: boolean } {
  const caseId = sources?.caseId ?? null;
  const lower = sources?.limits?.[0] ?? null;
  const upper = sources?.limits?.[1] ?? null;
  const seasons = sources?.seasons ?? null;
  const want = views.join(" ");
  const key = caseId !== null && want ? `${caseId} ${want}` : "";
  const [read, setRead] = useState<{ key: string; leads: ViewLeads; settled: boolean }>({
    key: "",
    leads: {},
    settled: false,
  });
  useEffect(() => {
    if (caseId === null || !want) return;
    const src: LeadSources = {
      caseId,
      limits: lower !== null && upper !== null ? [lower, upper] : null,
      seasons,
    };
    const at = `${caseId} ${want}`;
    let live = true;
    const timer = window.setTimeout(() => {
      if (live)
        setRead((r) =>
          r.key === at ? { ...r, settled: true } : { key: at, leads: {}, settled: true },
        );
    }, LEAD_WAIT_MS);
    void Promise.all(
      (want.split(" ") as LeadView[]).map(async (v) => [v, await leadOf(src, v)] as const),
    ).then((pairs) => {
      if (!live) return;
      window.clearTimeout(timer);
      setRead({
        key: at,
        leads: Object.fromEntries(pairs.flatMap(([v, lines]) => (lines ? [[v, lines]] : []))),
        settled: true,
      });
    });
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [caseId, lower, upper, seasons, want]);
  if (!key) return { leads: {}, settled: true };
  return read.key === key ? read : { leads: {}, settled: false };
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

  // a chosen view's lead is read from its view's own data; every other finding comes worded from the record
  const chosenViews = useMemo(
    () => [
      ...new Set(
        (request?.findings ?? []).flatMap((f) =>
          f.lines === null && f.place.kind === "view" ? [f.place.view] : [],
        ),
      ),
    ],
    [request],
  );
  const { leads, settled } = useViewLeads(request?.leads ?? null, chosenViews);
  const findings = (request?.findings ?? []).flatMap(
    (f): (FollowUpFinding & { lines: readonly string[] })[] => {
      const lines = f.lines ?? (f.place.kind === "view" ? leads[f.place.view] : undefined);
      return lines?.length ? [{ ...f, lines }] : [];
    },
  );
  const viewOf = (view: LeadView) => {
    const label = en[VIEW_LABEL[view]].text;
    const n = views.findIndex((v) => v.label === label);
    const v = views[n];
    return v ? { ...v, key: String(n + 1) } : null;
  };

  const { verdicts } = readout;
  const checks = ground?.checks ?? [];
  const reviewLine = ground ? reviewWords(ground.reviews) : null;
  const followUp = request ? followUpOf(findings, allFindings) : null;
  const askedWords = asked ?? request?.question ?? null;
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
          {!settled ? null : request && followUp ? (
            <dl
              className={`${styles.grid} ${styles.arrive}`}
              data-readout-request
              style={at(next())}
            >
              <dt className={styles.head}>{rd["readout.request.head"].text}</dt>
              <dd className={`${styles.cell} ${styles.lines}`}>
                {askedWords ? <p className={styles.asked}>{askedWords}</p> : null}
                {followUp.shown.map((f) => {
                  const view = f.place.kind === "view" ? viewOf(f.place.view) : null;
                  return (
                    <div
                      key={f.id}
                      className={styles.finding}
                      data-readout-request-finding={f.place.kind}
                    >
                      {f.lines.map((line) => (
                        <p key={line}>{line}</p>
                      ))}
                      {f.place.kind === "source" && f.place.source ? (
                        <p className={styles.source}>{f.place.source}</p>
                      ) : null}
                      {view ? (
                        <button
                          type="button"
                          className={styles.row}
                          aria-keyshortcuts={view.key}
                          onClick={view.onOpen}
                        >
                          <KeyChip>{view.key}</KeyChip>
                          <span>{view.label}</span>
                        </button>
                      ) : null}
                    </div>
                  );
                })}
                {/* the answer to the question, in ink like any finding: the case says nothing on it yet */}
                {request.answered && !findings.length ? (
                  <p>{rd["readout.request.none"].text}</p>
                ) : null}
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

          {settled && verdicts.length ? (
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

          {settled && checks.length ? (
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

          {settled && views.length ? (
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

        {settled && reviewLine ? (
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
