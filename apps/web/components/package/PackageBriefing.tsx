"use client";

// The next-steps package as a briefing you step through (the lead's decision 16), the way a game briefs a mission
// over its map (the reference study's Division 2 map: a dark matte land under one warm light, one stem rising from the
// chosen place, a name and a few short rows beside it, key hints instead of buttons; Death Stranding's markers on
// stems to their true place; Maverick's dashed line for what is proposed).
// On arrival: the land, each field check as an amber marker on its band, and one headline. Then five steps, one card
// at a time, Space or the arrow keys: what is known so far, what is still open, the field checks (the land lights the
// one the card is about), the candidate responses (none ranked) and who must approve. A card holds a title and at
// most three short lines (steps.ts pages longer ones, never cutting a record line); it stands beside the land on a
// hairline leader, never over it. Everything in full lives in the exported brief (E). Nothing here sends, schedules or
// authorizes anything.

import type { CaseSnapshot } from "@siterra/contracts";
import { useEffect, useMemo, useState } from "react";
import { pformat, pkg, type PackageMessageId } from "../../lib/copy/package";
import { rangeOfKey, type HeightRange } from "../../lib/package/bands";
import type { PackageView } from "../../lib/package/package";
import {
  checkLines,
  nextOf,
  previousOf,
  stepsOf,
  type Cursor,
  type Step,
  type StepId,
} from "../../lib/package/steps";
import { Control } from "../controls/Control";
import { usePrompt } from "./ActionPrompt";
import styles from "./PackageBriefing.module.css";

const t = (id: PackageMessageId) => pkg[id].text;
const LEAVE_MS = 260;
const TITLE: Record<StepId, PackageMessageId> = {
  known: "steps.known",
  open: "steps.open",
  checks: "steps.checks",
  responses: "steps.responses",
  approve: "steps.approve",
};

/** Where the overview's land stands on screen (CSS px), and each field check's marker point on it. */
export interface Stands {
  points: ({ x: number; y: number; behind: boolean } | null)[];
  box: { x0: number; y0: number; x1: number; y1: number };
}

/** The briefing over the overview's own land: it lights a band and follows the markers' points every frame. */
export interface LandMount {
  /** The record's two elevation band limits (bandLimitsOf), for each check's height range. */
  limits: readonly [number, number] | null;
  /** Each field check's height range with one, in the package's order, and the one lit (null: none). */
  onRanges: (ranges: HeightRange[], lit: number | null) => void;
  /** The land eases aside while a card is open, and back to the centre on the arrival. */
  onAside: (aside: boolean) => void;
  subscribe: (f: (s: Stands) => void) => () => void;
}

function typing(e: KeyboardEvent): boolean {
  const el = e.target as HTMLElement | null;
  return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
}

/** The card's width, and its place: beside the land on its free side, never over it, inside the edges' chrome. */
const CARD_W = 400;
function cardAt(s: Stands | null, vw: number): { x: number; y: number; side: "right" | "left" } {
  if (!s) return { x: vw - CARD_W - 160, y: 300, side: "right" };
  const right = vw - 60 - s.box.x1;
  const side = right >= CARD_W + 56 ? "right" : "left";
  const x = side === "right" ? s.box.x1 + 56 : Math.max(56, s.box.x0 - 56 - CARD_W);
  const y = Math.min(Math.max(s.box.y0 + (s.box.y1 - s.box.y0) * 0.22, 240), 500);
  return { x, y, side };
}

const back = (steps: readonly Step[], c: Cursor | null): Cursor | null => {
  if (c === null) return null;
  const p = previousOf(steps, c);
  return p.step === c.step && p.page === c.page ? null : p;
};
const forward = (steps: readonly Step[], c: Cursor | null): Cursor =>
  c === null ? { step: 0, page: 0 } : nextOf(steps, c);

export function PackageBriefing({
  snapshot,
  view,
  open,
  onClose,
  onOpen,
  land,
}: {
  snapshot: CaseSnapshot;
  view: PackageView;
  open: boolean;
  onClose: () => void;
  /** Opens a view in place over the same land (the overview's opener); true when it did. */
  onOpen?: (href: string) => boolean;
  /** Mounted over the overview's land (its Esc, its legend); without it, the development harness. */
  land?: LandMount;
}) {
  const [present, setPresent] = useState(open);
  const steps = useMemo(() => stepsOf(view), [view]);
  /** null: the arrival (the headline and the markers only); else the step and page shown. */
  const [at, setAt] = useState<Cursor | null>(null);
  const [stands, setStands] = useState<Stands | null>(null);
  const [vw, setVw] = useState(1440);

  useEffect(() => {
    if (open) {
      setPresent(true);
      return;
    }
    const id = window.setTimeout(() => {
      setPresent(false);
      setAt(null);
    }, LEAVE_MS);
    return () => {
      window.clearTimeout(id);
    };
  }, [open]);

  useEffect(() => {
    const size = () => {
      setVw(window.innerWidth);
    };
    size();
    window.addEventListener("resize", size);
    return () => {
      window.removeEventListener("resize", size);
    };
  }, []);

  // each field check's height range on the land, and the one the card is about
  const ranges = useMemo(
    () =>
      view.measures.map(
        (m) =>
          m.places
            .filter((p) => p.bundleId !== null)
            .map((p) => rangeOfKey(p.key, land?.limits ?? null))
            .find((r): r is HeightRange => r !== null) ?? null,
      ),
    [view.measures, land?.limits],
  );
  const step = at ? steps[at.step] : undefined;
  const page = at ? step?.pages[at.page] : undefined;
  const lit = page?.kind === "check" ? page.measure : null;
  /** A check's index among those with a place on the land (the scene's order), or null. */
  const landIndex = (i: number): number | null =>
    ranges[i] ? ranges.slice(0, i).filter((r) => r !== null).length : null;
  const onRanges = land?.onRanges;
  useEffect(() => {
    if (!onRanges) return;
    // markers stand on every check's band; only the check the card is about lights its band
    const on = ranges.filter((r): r is HeightRange => r !== null);
    onRanges(open ? on : [], open && lit !== null ? landIndex(lit) : null);
  }, [onRanges, open, ranges, lit]);
  const onAside = land?.onAside;
  useEffect(() => {
    onAside?.(open && at !== null);
  }, [onAside, open, at]);
  // the markers' points, read every frame; React re-renders only when the land's box or a point moves a pixel
  useEffect(() => {
    if (!land) return;
    let last = "";
    return land.subscribe((s) => {
      const key = JSON.stringify([
        [s.box.x0, s.box.x1, s.box.y0, s.box.y1].map(Math.round),
        s.points.map((p) => (p ? [Math.round(p.x), Math.round(p.y), p.behind] : null)),
      ]);
      if (key !== last) {
        last = key;
        setStands(s);
      }
    });
  }, [land]);

  const briefHref = `/brief?case=${encodeURIComponent(snapshot.case.id)}&brief=${encodeURIComponent(view.briefId)}`;
  const { bind, layer } = usePrompt(view.sources, open, onClose, onOpen, !land);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (typing(e) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === " " || e.key === "ArrowRight" || e.key === "ArrowDown") {
        setAt((c) => forward(steps, c));
        e.preventDefault();
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        setAt((c) => back(steps, c));
        e.preventDefault();
      } else if (e.key === "e" || e.key === "E") {
        // E exports the printable brief beside the page, wherever the briefing is mounted (AUDIT, 30 Oct 20:09)
        window.open(briefHref, "_blank", "noopener");
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [open, steps, briefHref]);

  if (!present) return null;
  const checks = view.measures.length || view.measureNext.length;
  const markerOf = (i: number) => {
    const k = landIndex(i);
    return k === null ? null : (stands?.points[k] ?? null);
  };
  const card = cardAt(stands, vw);
  // the leader: from the card's near edge to the top of the marker it is about, else to the land's near edge
  const litMarker = lit === null ? null : markerOf(lit);
  const target = litMarker
    ? { x: litMarker.x, y: litMarker.y - 96 }
    : stands
      ? { x: card.side === "right" ? stands.box.x1 - 12 : stands.box.x0 + 12, y: card.y + 22 }
      : null;
  const from = { x: card.side === "right" ? card.x - 12 : card.x + CARD_W + 12, y: card.y + 22 };
  const pageKey = at ? `${String(at.step)}:${String(at.page)}` : "arrival";

  return (
    <div
      className={styles.briefing}
      data-state={open ? "in" : "out"}
      data-package-briefing=""
      data-land={land ? "" : undefined}
      data-step={step?.id ?? "arrival"}
    >
      <header className={styles.head}>
        {/* the case question keeps its place under the breadcrumb, as on every view: chrome, not the briefing's words */}
        <p className={styles.question} data-chrome="">
          {snapshot.case.objective}
        </p>
        <h2 className={styles.headline}>
          {pformat("steps.headline", {
            checks: pformat(checks === 1 ? "steps.count.one" : "steps.count.many", {
              n: checks,
            }),
          })}
        </h2>
        <p className={styles.status}>
          <span className={styles.statusWord}>{t(`package.status.${view.status}`)}</span>
          <span>{t("steps.nothingSent")}</span>
          {view.mode !== "live" ? <span>{t(`package.mode.${view.mode}`)}</span> : null}
        </p>
      </header>

      {view.measures.map((m, i) => {
        const p = markerOf(i);
        if (!p) return null;
        return (
          <div
            key={i}
            className={styles.marker}
            data-on={lit === i ? "" : undefined}
            data-behind={p.behind ? "" : undefined}
            style={{ transform: `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)` }}
          >
            <span className={styles.stem} />
            <span className={styles.foot} />
            <span className={styles.markerLabel}>
              <span className={styles.n}>{String(i + 1).padStart(2, "0")}</span>
              <span>{m.fieldCheck?.label ?? m.what}</span>
            </span>
          </div>
        );
      })}

      {target && page ? (
        <svg className={styles.leader} aria-hidden="true" key={`leader-${pageKey}`}>
          <line x1={from.x} y1={from.y} x2={target.x} y2={target.y} pathLength={1} />
        </svg>
      ) : null}

      {step && page ? (
        <section
          key={pageKey}
          className={styles.card}
          style={{ left: card.x, top: card.y, width: CARD_W }}
          aria-live="polite"
          data-card={step.id}
        >
          <p className={styles.kicker}>
            <span>{pformat("steps.of", { n: (at?.step ?? 0) + 1, total: steps.length })}</span>
            {/* while a card is open the headline steps back; the replay label stays, here */}
            {view.mode !== "live" ? (
              <span className={styles.kickerMode}>
                {view.mode === "replay" ? t("steps.replay") : t(`package.mode.${view.mode}`)}
              </span>
            ) : null}
          </p>
          {page.kind === "lines" ? (
            <>
              <h3 className={styles.title}>{t(TITLE[step.id])}</h3>
              <ul className={styles.lines}>
                {page.lines.map((l, i) => (
                  <li key={i} {...bind({ key: `${pageKey}-${String(i)}`, chips: l.chips })}>
                    {l.text}
                    <Tags chips={l.chips} />
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {page.kind === "check" && view.measures[page.measure] ? (
            <CheckCard
              n={page.measure}
              view={view}
              onLand={ranges[page.measure] !== null}
              bindLine={(chips) => bind({ key: `${pageKey}-check`, chips })}
            />
          ) : null}
          {page.kind === "responses" ? (
            <>
              <h3 className={styles.title}>{t(TITLE[step.id])}</h3>
              <ol className={styles.responses}>
                {page.responses.map((r, i) => (
                  <li key={r.id} {...bind({ key: r.id, chips: r.chips })}>
                    <span className={styles.n}>{String.fromCharCode(65 + i)}</span>
                    <span>
                      {r.title}
                      {r.chips.length > 0 ? (
                        <Tags chips={r.chips} />
                      ) : (
                        <span className={styles.noSource}>{t("steps.noSource")}</span>
                      )}
                    </span>
                  </li>
                ))}
              </ol>
              <p className={styles.note}>{t("steps.noneRanked")}</p>
            </>
          ) : null}
        </section>
      ) : null}

      <nav className={styles.counter} aria-label={t("steps.counter")}>
        <ol className={styles.dots}>
          {steps.map((s, i) => (
            <li key={s.id}>
              <button
                type="button"
                className={styles.dot}
                data-done={at !== null && i < at.step ? "" : undefined}
                aria-label={t(TITLE[s.id])}
                aria-current={at?.step === i ? "step" : undefined}
                onClick={() => {
                  setAt({ step: i, page: 0 });
                }}
              />
            </li>
          ))}
        </ol>
        <span className={styles.keys}>
          {at !== null ? (
            <Control
              variant="quiet"
              keyHint="←"
              keyShortcut="ArrowLeft"
              onClick={() => {
                setAt((c) => back(steps, c));
              }}
            >
              {t("steps.previous")}
            </Control>
          ) : null}
          <Control
            variant="primary"
            keyHint="Space"
            keyShortcut="Space"
            data-step-next=""
            onClick={() => {
              setAt((c) => forward(steps, c));
            }}
          >
            {at === null ? t("steps.begin") : t("steps.next")}
          </Control>
        </span>
      </nav>
      {layer}
    </div>
  );
}

function CheckCard({
  n,
  view,
  onLand,
  bindLine,
}: {
  n: number;
  view: PackageView;
  onLand: boolean;
  bindLine: (chips: number[]) => object;
}) {
  const m = view.measures[n];
  if (!m) return null;
  return (
    <>
      <h3 className={styles.title}>
        <span className={styles.n}>{String(n + 1).padStart(2, "0")}</span> {m.what}
      </h3>
      <ul className={styles.lines}>
        {checkLines(m).map((l, i) => (
          <li key={i}>{l}</li>
        ))}
        {m.fieldCheck ? (
          <li {...bindLine(m.chips)}>
            {pformat("steps.settles", { label: m.fieldCheck.label })}
            <Tags chips={m.chips} />
          </li>
        ) : null}
      </ul>
      <p className={styles.proposed}>
        {t("briefing.proposed")}
        {onLand ? null : ` ${t("steps.offLand")}`}
      </p>
    </>
  );
}

function Tags({ chips }: { chips: number[] }) {
  if (chips.length === 0) return null;
  return (
    <span className={styles.tags}>
      {chips.map((n) => (
        <span key={n} className={styles.tagN} aria-label={pformat("briefing.chip", { n })}>
          {n}
        </span>
      ))}
    </span>
  );
}
