"use client";

import type { Dispatch, SetStateAction } from "react";
import { pformat, pkg, type PackageMessageId } from "../../lib/copy/package";
import type { HeightRange } from "../../lib/package/bands";
import type { PackageView } from "../../lib/package/package";
import {
  reviewMessageOf,
  type RecordedReviewDecision,
  type ReviewChoice,
} from "../../lib/package/review";
import {
  checkLines,
  type Cursor,
  type Step,
  type StepId,
  type StepPage,
} from "../../lib/package/steps";
import { Control } from "../controls/Control";
import type { usePrompt } from "./ActionPrompt";
import styles from "./PackageBriefing.module.css";

const t = (id: PackageMessageId) => pkg[id].text;

export const TITLE: Record<StepId, PackageMessageId> = {
  known: "steps.known",
  open: "steps.open",
  checks: "steps.checks",
  responses: "steps.responses",
  approve: "steps.approve",
};

export function PackageStepCard({
  step,
  page,
  pageKey,
  at,
  totalSteps,
  view,
  card,
  cardWidth,
  ranges,
  decision,
  effectiveStatus,
  noteOpen,
  setNoteOpen,
  noteDraft,
  setNoteDraft,
  recordReview,
  bind,
}: {
  step: Step;
  page: StepPage;
  pageKey: string;
  at: Cursor | null;
  totalSteps: number;
  view: PackageView;
  card: { x: number; y: number; side: "right" | "left" };
  cardWidth: number;
  ranges: (HeightRange | null)[];
  decision: RecordedReviewDecision | null;
  effectiveStatus: PackageView["status"];
  noteOpen: boolean;
  setNoteOpen: Dispatch<SetStateAction<boolean>>;
  noteDraft: string;
  setNoteDraft: Dispatch<SetStateAction<string>>;
  recordReview: (status: ReviewChoice, note?: string) => Promise<void>;
  bind: ReturnType<typeof usePrompt>["bind"];
}) {
  return (
    <section
      key={pageKey}
      className={styles.card}
      style={{ left: card.x, top: card.y, width: cardWidth }}
      aria-live="polite"
      data-card={step.id}
    >
      <p className={styles.kicker}>
        <span>{pformat("steps.of", { n: (at?.step ?? 0) + 1, total: totalSteps })}</span>
        {step.id === "approve" && !decision ? (
          <span className={styles.needsYou} data-needs-you="">
            {t("steps.needsYou")}
          </span>
        ) : null}
        {step.id === "approve" && decision ? (
          <span className={styles.statusWord} data-review-badge={decision.status}>
            {t(`package.status.${effectiveStatus}`)}
          </span>
        ) : null}
        {step.id !== "approve" && view.mode !== "live" ? (
          <span className={styles.kickerMode} data-chrome="">
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
          {step.id === "approve" ? (
            <div className={styles.reviewBox} data-review-section="">
              {decision ? (
                <p
                  className={styles.reviewStatus}
                  role="status"
                  data-review-recorded={decision.status}
                >
                  {reviewMessageOf(decision.status)}
                </p>
              ) : null}
              {decision?.status === "changes_requested" && decision.note && !noteOpen ? (
                <p className={styles.reviewNoteText} data-review-note-shown="">
                  {pformat("review.recordedNote", { note: decision.note })}
                </p>
              ) : null}
              {noteOpen ? (
                <form
                  className={styles.noteForm}
                  onSubmit={(e) => {
                    e.preventDefault();
                    void recordReview("changes_requested", noteDraft);
                    setNoteOpen(false);
                  }}
                >
                  <label className={styles.noteLabel}>
                    <span>{t("review.note.label")}</span>
                    <input
                      type="text"
                      className={styles.noteInput}
                      value={noteDraft}
                      placeholder={t("review.note.placeholder")}
                      data-review-note=""
                      onChange={(e) => {
                        const val = e.target.value;
                        setNoteDraft(val);
                        void recordReview("changes_requested", val);
                      }}
                    />
                  </label>
                  <div className={styles.reviewActions} data-review-actions="">
                    <Control
                      variant="primary"
                      keyHint="Enter"
                      keyShortcut="Enter"
                      data-review-record-changes=""
                      onClick={() => {
                        void recordReview("changes_requested", noteDraft);
                        setNoteOpen(false);
                      }}
                    >
                      {t("review.recordChanges")}
                    </Control>
                    <Control
                      data-review-approve=""
                      onClick={() => {
                        setNoteOpen(false);
                        void recordReview("approved", "");
                      }}
                    >
                      {t("review.approve")}
                    </Control>
                  </div>
                </form>
              ) : (
                <div className={styles.reviewActions} data-review-actions="">
                  {decision?.status !== "approved" ? (
                    <Control
                      variant="primary"
                      keyHint="Enter"
                      keyShortcut="Enter"
                      data-review-approve=""
                      onClick={() => {
                        void recordReview("approved", "");
                      }}
                    >
                      {t("review.approve")}
                    </Control>
                  ) : null}
                  <Control
                    keyHint="A"
                    keyShortcut="A"
                    data-review-ask-changes=""
                    onClick={() => {
                      setNoteOpen(true);
                      void recordReview("changes_requested", noteDraft);
                    }}
                  >
                    {t("review.askChanges")}
                  </Control>
                </div>
              )}
            </div>
          ) : null}
        </>
      ) : null}
      {page.kind === "check" && view.measures[page.measure] ? (
        <CheckCard n={page.measure} view={view} onLand={ranges[page.measure] !== null} />
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
  );
}

function CheckCard({ n, view, onLand }: { n: number; view: PackageView; onLand: boolean }) {
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
    <span className={styles.tags} data-chrome="">
      {chips.map((n) => (
        <span key={n} className={styles.tagN} aria-label={pformat("briefing.chip", { n })}>
          {n}
        </span>
      ))}
    </span>
  );
}
