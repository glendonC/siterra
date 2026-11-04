"use client";

// The case's sources and limits in one overlay, S for Sources and W for Limits, in the landing's own Sources layout
// (components/opening/Opening.tsx): a tab bar with its coloured squares and the close the Ask has above two columns.
// Every name, credit, link and count is the case record's, and every limit says what the record states
// (lib/sources/overlay.ts). While it is open it has the keys: Esc closes it, S and W switch to their tab or close it
// from their own, and no key reaches the screen beneath.

import type { CaseSnapshot } from "@siterra/contracts";
import { useEffect, useId, useMemo, useRef } from "react";
import { en, format } from "../../lib/copy/en";
import { sc, sformat } from "../../lib/copy/sources";
import { dayWords } from "../../lib/run/recorded";
import { overlayView, type LimitSection, type OverlayView } from "../../lib/sources/overlay";
import { KeyChip } from "./Control";
import { scrollFade } from "./scrollFade";
import styles from "./SourcesOverlay.module.css";

export type SourcesTab = "sources" | "limits";

const FOCUSABLE = "button, a[href], [tabindex]:not([tabindex='-1'])";

export function SourcesOverlay({
  snapshot,
  tab,
  onTab,
  onClose,
  relief,
  runAt = null,
}: {
  /** The case as the screen holds it now. */
  snapshot: CaseSnapshot;
  /** The open tab; null keeps the overlay closed. */
  tab: SourcesTab | null;
  onTab: (tab: SourcesTab) => void;
  onClose: () => void;
  /** Where the land is drawn in relief, its vertical exaggeration, said with the data. */
  relief?: number;
  /** When the run behind the answer on screen was accepted (ISO); null when the answer is the case's own. */
  runAt?: string | null;
}) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const open = tab !== null;
  const view = useMemo(() => (open ? overlayView(snapshot) : null), [open, snapshot]);
  const runDay = runAt ? dayWords(runAt) : null;

  useEffect(() => {
    if (open) root.current?.focus({ preventScroll: true });
  }, [open]);

  useEffect(() => {
    if (!tab) return;
    const onKey = (e: KeyboardEvent) => {
      // in the capture phase, so the screen's own Esc, S and W do not also act
      e.stopImmediatePropagation();
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const key = e.key.toLowerCase();
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (key === "s" || key === "w") {
        e.preventDefault();
        const next: SourcesTab = key === "s" ? "sources" : "limits";
        if (next === tab) onClose();
        else onTab(next);
      } else if (e.key === "Tab" && root.current) {
        // the focus stays inside while it is open
        const all = [...root.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
        const first = all[0];
        const last = all.at(-1);
        if (!first || !last) return;
        const at = document.activeElement;
        if (e.shiftKey && (at === first || at === root.current)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && at === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
    };
  }, [tab, onTab, onClose]);

  if (!tab || !view) return null;
  const tabId = (t: SourcesTab) => `${id}-${t}`;
  return (
    <div
      ref={root}
      className={styles.veil}
      role="dialog"
      aria-modal="true"
      aria-label={sc["sources.dialog"].text}
      tabIndex={-1}
      data-sources-overlay
      data-tab={tab}
      onClick={onClose}
    >
      <div
        className={styles.sheet}
        data-sources-sheet
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <div className={styles.top}>
          <div className={styles.tabs} role="tablist" aria-label={sc["sources.tabs"].text}>
            {(["sources", "limits"] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                id={tabId(t)}
                aria-selected={tab === t}
                aria-controls={`${id}-panel`}
                aria-keyshortcuts={t === "sources" ? "S" : "W"}
                className={styles.tab}
                data-tone={t === "sources" ? "green" : "ink"}
                data-active={tab === t ? "" : undefined}
                data-sources-tab={t}
                onClick={() => {
                  onTab(t);
                }}
              >
                <i className={styles.dot} aria-hidden="true" />
                {sc[t === "sources" ? "sources.tab.sources" : "sources.tab.limits"].text}
              </button>
            ))}
          </div>
          {/* the close the Ask has: the key bar's Esc key and the word beside it */}
          <button
            type="button"
            className={styles.close}
            aria-keyshortcuts="Escape"
            onClick={onClose}
            data-sources-close
          >
            <KeyChip>Esc</KeyChip>
            {en["chrome.close"].text}
          </button>
        </div>
        {/* each column scrolls on its own and draws no bar (scrollFade); one column under the other on a narrow
            screen, the panel scrolls instead */}
        <div
          ref={scrollFade}
          className={styles.body}
          role="tabpanel"
          id={`${id}-panel`}
          aria-labelledby={tabId(tab)}
        >
          {tab === "sources" ? (
            <SourcesBody view={view} relief={relief} runDay={runDay} />
          ) : (
            <LimitsBody view={view} />
          )}
        </div>
      </div>
    </div>
  );
}

/** A credit with its links in place: each web address it writes opens in a new tab, its closing stop left as text. */
function Credit({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/\S+)/);
  return (
    <>
      {parts.map((part, i) => {
        if (i % 2 === 0) return part;
        const url = part.replace(/[.,;)]+$/, "");
        return (
          <span key={`${String(i)}-${url}`}>
            <a href={url} target="_blank" rel="noopener noreferrer" className={styles.link}>
              {url}
            </a>
            {part.slice(url.length)}
          </span>
        );
      })}
    </>
  );
}

function Arrow() {
  return (
    <svg
      className={styles.arrow}
      width="9"
      height="9"
      viewBox="0 0 10 10"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M2.5 7.5L7.5 2.5M7.5 2.5H3.5M7.5 2.5V6.5"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SourcesBody({
  view,
  relief,
  runDay,
}: {
  view: OverlayView;
  relief?: number;
  runDay: string | null;
}) {
  return (
    <>
      <aside ref={scrollFade} className={styles.spec}>
        <div className={styles.kicker}>{sc["sources.measuredWith"].text}</div>
        {view.datasets.length > 0 ? (
          <dl className={styles.specList}>
            {view.datasets.map((d) => (
              <div key={d.datasetId} className={styles.specRow} data-dataset={d.datasetId}>
                <dt className={styles.specLabel}>{d.measured}</dt>
                <dd className={styles.specValue}>
                  <span className={styles.specPrimary}>{d.name}</span>
                  {d.detail ? <span className={styles.specSub}>{d.detail}</span> : null}
                </dd>
                {d.credits.length !== 0 || d.link ? (
                  <dd className={styles.credits}>
                    {d.credits.map((c) => (
                      <p key={c} className={styles.notice} data-notice>
                        <Credit text={c} />
                      </p>
                    ))}
                    {d.link ? (
                      <p className={styles.notice}>
                        <a
                          href={d.link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={styles.link}
                        >
                          {d.link.title}
                        </a>
                      </p>
                    ) : null}
                  </dd>
                ) : null}
              </div>
            ))}
          </dl>
        ) : null}
        {view.mapCredits.length > 0 ? (
          <div className={styles.mapCredits} data-map-credits>
            <div className={styles.kicker}>{sc["sources.onMap"].text}</div>
            {view.mapCredits.map((c) => (
              <p key={c} className={styles.notice} data-notice>
                <Credit text={c} />
              </p>
            ))}
          </div>
        ) : null}
      </aside>
      <section ref={scrollFade} className={styles.narrative}>
        <div className={styles.head}>
          <p className={styles.lead} data-sources-lead>
            <span className={styles.ink}>{view.lead.ink}</span>{" "}
            <span className={styles.grey}>{view.lead.grey}</span>
          </p>
          {runDay ? (
            <p className={styles.note} data-sources-run>
              {sformat("sources.run", { date: runDay })}
            </p>
          ) : null}
          {relief === undefined ? null : (
            <p className={styles.note} data-relief>
              {format("chrome.relief.note", { value: relief })}
            </p>
          )}
        </div>
        {view.publications.length > 0 ? (
          <ul className={styles.publications}>
            {view.publications.map((p) => (
              <li key={p.sourceId} data-publication={p.sourceId}>
                <a
                  href={p.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.publication}
                >
                  <span className={styles.author}>
                    {p.cite}
                    <Arrow />
                  </span>
                  <span className={styles.title}>{p.title}</span>
                  {p.venue ? <span className={styles.venue}>{p.venue}</span> : null}
                </a>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </>
  );
}

function LimitsBody({ view }: { view: OverlayView }) {
  const { side, main } = view.limits;
  return (
    <>
      <aside ref={scrollFade} className={`${styles.spec} ${styles.limitsColumn}`}>
        {side.map((s) => (
          <Limits key={s.id} section={s} />
        ))}
      </aside>
      <section ref={scrollFade} className={`${styles.narrative} ${styles.limitsColumn}`}>
        {main.map((s) => (
          <Limits key={s.id} section={s} />
        ))}
        {side.length + main.length === 0 ? (
          <p className={styles.note}>{sc["sources.limits.none"].text}</p>
        ) : null}
      </section>
    </>
  );
}

function Limits({ section }: { section: LimitSection }) {
  return (
    <div className={styles.group} data-limits={section.id}>
      <div className={styles.kicker}>{section.heading}</div>
      {section.topics.map((t) => (
        <div key={t.id} className={styles.topic} data-topic={t.id}>
          {t.label ? <div className={styles.topicLabel}>{t.label}</div> : null}
          <ul className={styles.lines}>
            {t.lines.map((l) => (
              <li key={l} className={styles.line}>
                {l}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
