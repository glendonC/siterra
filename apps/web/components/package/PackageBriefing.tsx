"use client";

// Step-by-step on-the-ground field verification briefing over the 3D valley terrain:
// On arrival, displays the valley with each proposed field check anchored on its elevation band
// by an amber stem marker, alongside the briefing headline and overview framing.
// Stepping forward (Space, arrow keys, or clicking any step in the bottom rail) walks through five
// structured cards: Known So Far, Still Open, The Field Checks (highlighting each check's terrain band),
// Candidate Responses (unranked), and Who Must Approve.
// Full details can be exported to the printable brief (E). Nothing here sends, schedules, or authorizes action.

import type { CaseSnapshot } from "@siterra/contracts";
import { useCallback, useEffect, useMemo, useState } from "react";
import { pformat, pkg, type PackageMessageId } from "../../lib/copy/package";
import { rangeOfKey, type HeightRange } from "../../lib/package/bands";
import type { PackageView } from "../../lib/package/package";
import {
  submitReviewDecision,
  viewRecordedReview,
  type RecordedReviewDecision,
  type ReviewChoice,
} from "../../lib/package/review";
import { nextOf, previousOf, stepsOf, type Cursor, type Step } from "../../lib/package/steps";
import { LABEL_DROP, labelWidth, layoutMarkers } from "../../lib/package/markers";
import { Control } from "../controls/Control";
import { usePrompt } from "./ActionPrompt";
import { PackageStepCard, TITLE } from "./PackageStepCard";
import styles from "./PackageBriefing.module.css";

const t = (id: PackageMessageId) => pkg[id].text;
const LEAVE_MS = 260;

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
  const landIndex = (i: number): number | null =>
    ranges[i] ? ranges.slice(0, i).filter((r) => r !== null).length : null;
  const onRanges = land?.onRanges;
  useEffect(() => {
    if (!onRanges) return;
    const on = ranges.filter((r): r is HeightRange => r !== null);
    onRanges(open ? on : [], open && lit !== null ? landIndex(lit) : null);
  }, [onRanges, open, ranges, lit]);
  const onAside = land?.onAside;
  useEffect(() => {
    onAside?.(open && at !== null);
  }, [onAside, open, at]);

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
  const { bind, layer, activeKey } = usePrompt(view.sources, open, onClose, onOpen, !land);
  const [decision, setDecision] = useState<RecordedReviewDecision | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");

  useEffect(() => {
    const sync = () => {
      const existing = viewRecordedReview(snapshot.case.id, view);
      setDecision(existing);
      if (existing?.note) setNoteDraft(existing.note);
    };
    sync();
    window.addEventListener("siterra:review-decision", sync);
    return () => {
      window.removeEventListener("siterra:review-decision", sync);
    };
  }, [snapshot.case.id, view]);

  const recordReview = useCallback(
    async (status: ReviewChoice, note = "") => {
      const actionId =
        snapshot.records.briefRecords.find((b) => b.id === view.briefId)?.actionIds[0] ?? null;
      const recorded = await submitReviewDecision({
        caseId: snapshot.case.id,
        briefId: view.briefId,
        actionId,
        caseRevision: snapshot.case.revision,
        status,
        note,
      });
      setDecision(recorded);
    },
    [snapshot.case.id, snapshot.case.revision, snapshot.records.briefRecords, view.briefId],
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (typing(e)) {
        if (e.key === "Escape" && noteOpen) {
          setNoteOpen(false);
          e.preventDefault();
          e.stopPropagation();
        }
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === " " || e.key === "ArrowRight" || e.key === "ArrowDown") {
        setAt((c) => forward(steps, c));
        e.preventDefault();
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        setAt((c) => back(steps, c));
        e.preventDefault();
      } else if (e.key === "Enter" && step?.id === "approve" && !activeKey) {
        setNoteOpen(false);
        void recordReview("approved", "");
        e.preventDefault();
      } else if ((e.key === "a" || e.key === "A") && step?.id === "approve") {
        setNoteOpen(true);
        void recordReview("changes_requested", noteDraft);
        e.preventDefault();
      } else if (e.key === "e" || e.key === "E") {
        window.open(briefHref, "_blank", "noopener");
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [open, steps, briefHref, step?.id, activeKey, noteOpen, noteDraft, recordReview]);

  if (!present) return null;
  const checks = view.measures.length || view.measureNext.length;
  const markerOf = (i: number) => {
    const k = landIndex(i);
    return k === null ? null : (stands?.points[k] ?? null);
  };
  const card = cardAt(stands, vw);
  const markers = layoutMarkers(
    view.measures.map((_, i) => markerOf(i)),
    (members) => labelWidth(members.length, null),
  );
  const litMarker = lit === null ? null : markerOf(lit);
  const target = litMarker
    ? { x: litMarker.x, y: litMarker.y - 96 }
    : stands
      ? { x: card.side === "right" ? stands.box.x1 - 12 : stands.box.x0 + 12, y: card.y + 22 }
      : null;
  const from = { x: card.side === "right" ? card.x - 12 : card.x + CARD_W + 12, y: card.y + 22 };
  const pageKey = at ? `${String(at.step)}:${String(at.page)}` : "arrival";
  const effectiveStatus = decision
    ? decision.status === "approved"
      ? "prepared"
      : "draft"
    : view.status;
  const hasNext = at === null || at.step < steps.length - 1;

  return (
    <div
      className={styles.briefing}
      data-state={open ? "in" : "out"}
      data-package-briefing=""
      data-land={land ? "" : undefined}
      data-step={step?.id ?? "arrival"}
    >
      <header className={styles.head}>
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
          <span className={styles.statusWord}>{t(`package.status.${effectiveStatus}`)}</span>
          <span>{t("steps.nothingSent")}</span>
        </p>
        <p className={styles.arrivalContext} data-chrome="">
          {
            "Satellite data established the valley's long-term trends, but ground-level causes require on-the-ground verification at the numbered markers on the terrain."
          }
        </p>
      </header>

      {markers.map((g) => {
        const open = lit !== null && g.members.includes(lit) ? lit : null;
        return (
          <div
            key={g.members.join("-")}
            className={styles.marker}
            data-on={open !== null ? "" : undefined}
            data-behind={g.at.behind ? "" : undefined}
            data-marker={g.members.map((i) => String(i + 1)).join(" ")}
            style={{ transform: `translate(${g.at.x.toFixed(1)}px, ${g.at.y.toFixed(1)}px)` }}
          >
            <span className={styles.stem} style={{ height: `${String(g.stem)}px` }} />
            <span className={styles.foot} />
            <span
              className={styles.markerLabel}
              style={{ bottom: `${String(g.stem - LABEL_DROP)}px` }}
              data-flip={g.flip ? "" : undefined}
              data-marker-label=""
            >
              {g.members.map((i) => (
                <span key={i} className={styles.n} data-open={i === open ? "" : undefined}>
                  {String(i + 1).padStart(2, "0")}
                </span>
              ))}
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
        <PackageStepCard
          step={step}
          page={page}
          pageKey={pageKey}
          at={at}
          totalSteps={steps.length}
          view={view}
          card={card}
          cardWidth={CARD_W}
          ranges={ranges}
          decision={decision}
          effectiveStatus={effectiveStatus}
          noteOpen={noteOpen}
          setNoteOpen={setNoteOpen}
          noteDraft={noteDraft}
          setNoteDraft={setNoteDraft}
          recordReview={recordReview}
          bind={bind}
        />
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
              >
                <span className={styles.dotBar} aria-hidden="true" data-chrome="" />
                <span className={styles.dotLabel} data-chrome="">
                  {`${String(i + 1).padStart(2, "0")} ${t(TITLE[s.id])}`}
                </span>
              </button>
            </li>
          ))}
        </ol>
        <span className={styles.keys} data-chrome="">
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
          {hasNext ? (
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
          ) : null}
        </span>
      </nav>
      {layer}
    </div>
  );
}
