"use client";

// Post-thinking investigation results drawer on the valley overview:
// Synthesizes the direct answer to the case question, presents the tested explanations with their
// predictions and verification status, surfaces local context & published studies, lists all committed
// evidence records with verifiable source excerpts, and frames the transition to the on-the-ground
// field verification plan.

import type { CaseSnapshot } from "@siterra/contracts";
import { useMemo, useRef, useState, type Ref } from "react";
import { en, format } from "../../lib/copy/en";
import {
  chipNumbers,
  commandFindings,
  commandMerge,
  readableStatement,
  resultsCaption,
  shortCitation,
  sourceNote,
  verificationOf,
} from "../../lib/overview/results";
import type { Action } from "../../lib/overview/actions";
import { ActionList } from "./ActionList";
import { Control } from "../controls/Control";
import { pkg } from "../../lib/copy/package";
import { answerForCase, overviewVerdictForCase } from "../../lib/overview/findings";
import type { VerdictCause, VerdictStatus } from "../../lib/package/verdict";
import verdictStyles from "../package/Verdict.module.css";
import styles from "./OverviewResults.module.css";

const HUMAN_STATUS_BADGE: Record<VerdictStatus, string> = {
  consistent: "Supported by data",
  cannot_be_assessed: "Needs field check",
  contradicted: "Ruled out",
};

function joinHumanList(items: readonly string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0] ?? ""} and ${items[1] ?? ""}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1] ?? ""}`;
}

function buildHumanLeadSummary(causes: readonly VerdictCause[], limit: string | null): string {
  const supported = causes
    .filter((c) => c.status === "consistent")
    .map((c) => c.label.toLowerCase());
  const open = causes
    .filter((c) => c.status === "cannot_be_assessed")
    .map((c) => c.label.toLowerCase());
  const ruledOut = causes
    .filter((c) => c.status === "contradicted")
    .map((c) => c.label.toLowerCase());

  const parts: string[] = [];
  if (limit) parts.push(limit);
  if (supported.length > 0 && ruledOut.length > 0) {
    parts.push(
      `Across the ${String(causes.length)} explanations we checked, ${joinHumanList(supported)} aligns with the satellite record, while ${joinHumanList(ruledOut)} ${ruledOut.length === 1 ? "is" : "are"} ruled out.`,
    );
  } else if (ruledOut.length > 0) {
    parts.push(
      `We checked ${String(causes.length)} possible explanations: ${joinHumanList(ruledOut)} ${ruledOut.length === 1 ? "is" : "are"} ruled out by the satellite record.`,
    );
  }
  if (open.length > 0) {
    parts.push(
      `Whether ${joinHumanList(open)} played a role cannot be separated from space and requires an on-the-ground check.`,
    );
  }
  return parts.join(" ");
}

function buildPlanCalloutCopy(causes: readonly VerdictCause[]): string {
  const open = causes
    .filter((c) => c.status === "cannot_be_assessed")
    .map((c) => c.label.toLowerCase());
  if (open.length > 0) {
    return `Satellite records cannot measure ${joinHumanList(open)} from space. Review the proposed on-the-ground field checks, candidate responses, and sign-off steps.`;
  }
  return "Review the proposed on-the-ground field checks, candidate responses, and sign-off steps before any land decision.";
}

export interface ResultsRefs {
  root: Ref<HTMLDivElement>;
  inst: Ref<HTMLElement>;
  frost: Ref<HTMLDivElement>;
  first: Ref<HTMLLIElement>;
}

export function OverviewResults({
  snapshot,
  commandId,
  onOpen,
  onPackage,
  onFocusCause,
  actions,
  onBack,
  refs,
}: {
  snapshot: CaseSnapshot;
  commandId: string;
  /** Opens an instrument or field plan view in place over the land; returns true when handled. */
  onOpen?: (href: string) => boolean;
  /** Opens the question's next-steps field verification briefing in place over the land. */
  onPackage?: () => void;
  /** Rotates and highlights the 3D valley terrain behind the frost when a hypothesis is focused or hovered. */
  onFocusCause?: (explanationId: string) => void;
  /** Available terrain and instrument views from the case record. */
  actions: readonly Action[];
  onBack?: () => void;
  refs: ResultsRefs;
}) {
  const findings = useMemo(() => {
    const direct = commandFindings(snapshot, commandId);
    if (direct.length > 0) return direct;
    return snapshot.records.evidenceRecords
      .filter((e) => e.status === "accepted")
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  }, [snapshot, commandId]);
  const allAcceptedFindings = useMemo(() => {
    const accepted = snapshot.records.evidenceRecords
      .filter((e) => e.status === "accepted")
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
    if (accepted.length <= findings.length) return findings;
    const seen = new Set(findings.map((e) => e.id));
    return [...findings, ...accepted.filter((e) => !seen.has(e.id))];
  }, [snapshot, findings]);
  const verdict = useMemo(() => overviewVerdictForCase(snapshot, commandId), [snapshot, commandId]);
  const caseAnswer = useMemo(() => answerForCase(snapshot), [snapshot]);
  const shownFindings = verdict ? allAcceptedFindings : findings;
  const caption = useMemo(
    () =>
      verdict
        ? verdict.caption
        : resultsCaption(commandMerge(snapshot, commandId), findings.length),
    [verdict, snapshot, commandId, findings.length],
  );
  const contextCards = useMemo(() => {
    const cards: { id: string; title: string; badge: string; body: string; causeId: string }[] = [];
    const seenTexts = new Set<string>();
    for (const ev of allAcceptedFindings) {
      const loc = ev.provenance.sourceLocators[0];
      if (ev.claimKind !== "scientific_context" && !loc) continue;
      const src = loc
        ? snapshot.records.sourceRecords.find((s) => s.id === loc.sourceId)
        : undefined;
      const body = readableStatement(snapshot, ev.statement);
      if (seenTexts.has(body)) continue;
      seenTexts.add(body);
      const lower = body.toLowerCase();
      const causeId =
        lower.includes("graz") || lower.includes("agdal") || lower.includes("herd")
          ? "grazing"
          : lower.includes("rain") || lower.includes("drought")
            ? "rainfall"
            : lower.includes("snow") || lower.includes("elevation")
              ? "snow_terrain"
              : "land_use";
      cards.push({
        id: ev.id,
        title: src?.title ?? "Published study in case record",
        badge: src ? shortCitation(src) : "Case source",
        body,
        causeId,
      });
    }
    for (const iv of snapshot.records.interventionRecords) {
      const body = readableStatement(snapshot, iv.description);
      if (seenTexts.has(body)) continue;
      seenTexts.add(body);
      cards.push({
        id: iv.id,
        title: iv.title,
        badge: "Candidate response",
        body,
        causeId: "grazing",
      });
    }
    return cards.slice(0, 6);
  }, [allAcceptedFindings, snapshot]);
  const chips = useMemo(() => chipNumbers(shownFindings), [shownFindings]);
  const [note, setNote] = useState<string | null>(null);
  const [activeCauseIdx, setActiveCauseIdx] = useState(0);
  const [tab, setTab] = useState<"verdict" | "livelihoods" | "findings">("verdict");
  const causeRefs = useRef<(HTMLLIElement | null)[]>([]);
  const assignFirst = (el: HTMLLIElement | null) => {
    const r = refs.first;
    if (!r) return;
    if (typeof r === "function") r(el);
    else (r as { current: HTMLLIElement | null }).current = el;
  };
  const showVerdict = verdict !== null && tab === "verdict";
  const showLivelihoods = verdict !== null && tab === "livelihoods";
  return (
    <div ref={refs.root} className={styles.results} data-record="results">
      <div ref={refs.frost} className={styles.frost} aria-hidden="true" />
      <section
        ref={refs.inst}
        className={styles.inst}
        aria-label={showVerdict ? pkg["verdict.title"].text : en["results.title"].text}
      >
        <div className={styles.plane}>
          <p className={styles.srOnly} data-results-caption>
            <span className={styles.ink}>{caption.ink}</span>
            {caption.grey ? (
              <>
                {" "}
                <span className={styles.grey}>{caption.grey}</span>
              </>
            ) : null}
          </p>
          <div className={styles.leadBriefing} data-chrome="">
            <span className={styles.leadKicker}>{"What the evidence shows"}</span>
            <h2 className={styles.leadHeadline}>{caseAnswer.claim}</h2>
            {verdict || caseAnswer.limit ? (
              <p className={styles.leadSummary}>
                {verdict ? buildHumanLeadSummary(verdict.causes, caseAnswer.limit) : caseAnswer.limit}
              </p>
            ) : null}
          </div>
          {verdict && findings.length > 0 ? (
            <div className={styles.tabs} data-chrome="">
              <button
                type="button"
                className={styles.tab}
                aria-pressed={tab === "verdict"}
                data-results-tab="verdict"
                onClick={() => {
                  setTab("verdict");
                }}
              >
                <span>{`What we tested (${String(verdict.causes.length)})`}</span>
              </button>
              {contextCards.length > 0 ? (
                <button
                  type="button"
                  className={styles.tab}
                  aria-pressed={tab === "livelihoods"}
                  data-results-tab="livelihoods"
                  onClick={() => {
                    setTab("livelihoods");
                  }}
                >
                  <span>{`Local context & studies (${String(contextCards.length)})`}</span>
                </button>
              ) : null}
              <button
                type="button"
                className={styles.tab}
                aria-pressed={tab === "findings"}
                data-results-tab="findings"
                onClick={() => {
                  setTab("findings");
                }}
              >
                <span>{`All evidence (${String(allAcceptedFindings.length)})`}</span>
              </button>
            </div>
          ) : null}
          {showVerdict ? (
            <>
              <div className={styles.k} data-chrome="">
                {pkg["verdict.title"].text}
              </div>
              <ul className={verdictStyles.list} data-verdict-list="">
                {verdict.causes.map((c, i) => {
                  const open = i === activeCauseIdx;
                  return (
                    <li
                      key={c.id}
                      ref={(el) => {
                        causeRefs.current[i] = el;
                        if (i === 0) assignFirst(el);
                      }}
                      className={verdictStyles.cause}
                      tabIndex={0}
                      aria-expanded={open}
                      data-open={open ? "" : undefined}
                      data-verdict-cause={c.id}
                      data-verdict-status={c.status}
                      {...(i < Math.max(1, findings.length)
                        ? { "data-result": findings[i]?.id ?? c.id }
                        : {})}
                      onPointerEnter={() => {
                        onFocusCause?.(c.id);
                      }}
                      onFocus={() => {
                        setActiveCauseIdx(i);
                        onFocusCause?.(c.id);
                      }}
                      onClick={() => {
                        setActiveCauseIdx(i);
                        onFocusCause?.(c.id);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "ArrowDown") {
                          e.preventDefault();
                          const next = Math.min(verdict.causes.length - 1, i + 1);
                          setActiveCauseIdx(next);
                          const nextCause = verdict.causes[next];
                          if (nextCause) onFocusCause?.(nextCause.id);
                          causeRefs.current[next]?.focus();
                        } else if (e.key === "ArrowUp") {
                          e.preventDefault();
                          const prev = Math.max(0, i - 1);
                          setActiveCauseIdx(prev);
                          const prevCause = verdict.causes[prev];
                          if (prevCause) onFocusCause?.(prevCause.id);
                          causeRefs.current[prev]?.focus();
                        }
                      }}
                    >
                      <div className={verdictStyles.head}>
                        <span className={verdictStyles.headLeft}>
                          <span
                            className={verdictStyles.causeDot}
                            data-status={c.status}
                            data-chrome=""
                          />
                          <span className={verdictStyles.name}>{c.label}</span>
                        </span>
                        <span
                          className={verdictStyles.status}
                          data-status={c.status}
                          data-chrome=""
                        >
                          {HUMAN_STATUS_BADGE[c.status]}
                        </span>
                        <span className={styles.srOnly} data-verdict-status-text="">
                          {c.statusText}
                        </span>
                      </div>
                      {open ? (
                        <div className={verdictStyles.detail} data-verdict-detail="">
                          <p className={verdictStyles.reason} data-verdict-reason="">
                            {c.reason}
                          </p>
                          <p className={verdictStyles.prediction} data-verdict-prediction="">
                            <span className={verdictStyles.predLabel}>{"Hypothesis tested:"}</span>{" "}
                            {c.prediction}
                          </p>
                          {c.localContext ? (
                            <div className={verdictStyles.contextNode} data-verdict-context="">
                              <div className={verdictStyles.contextHead}>
                                <span className={verdictStyles.contextTag}>
                                  {c.localContext.title}
                                </span>
                                <span className={verdictStyles.contextCite}>
                                  {c.localContext.citation}
                                </span>
                              </div>
                              <p className={verdictStyles.contextText}>{c.localContext.detail}</p>
                            </div>
                          ) : null}
                          {c.nextCheck ? (
                            <p className={verdictStyles.nextCheck} data-verdict-check="">
                              <span className={verdictStyles.predLabel}>
                                {"On-the-ground check:"}
                              </span>{" "}
                              {c.nextCheck}
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </>
          ) : null}
          {!showVerdict && showLivelihoods ? (
            <div data-chrome="">
              <ul className={styles.livelihoodMatrix}>
                {contextCards.map((item, idx) => (
                  <li
                    key={item.id}
                    className={styles.livelihoodCard}
                    onPointerEnter={() => {
                      onFocusCause?.(item.causeId);
                    }}
                    onClick={() => {
                      onFocusCause?.(item.causeId);
                    }}
                  >
                    <div className={styles.livelihoodHead}>
                      <span className={styles.livelihoodHeadLeft}>
                        <span className={styles.livelihoodIndex}>
                          {String(idx + 1).padStart(2, "0")}
                        </span>
                        <span className={styles.livelihoodTitle}>{item.title}</span>
                      </span>
                      <span className={styles.livelihoodBadge}>{item.badge}</span>
                    </div>
                    <p className={styles.livelihoodBody}>{item.body}</p>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {!showVerdict && !showLivelihoods ? (
            <>
              <div className={styles.k} data-chrome="">
                {en["results.findings"].text}
              </div>
              <ul className={styles.list}>
                {shownFindings.map((e, i) => {
                  const n = chips[i] ?? null;
                  const open = note === e.id;
                  return (
                    <li
                      key={e.id}
                      ref={i === 0 ? refs.first : undefined}
                      className={styles.item}
                      tabIndex={0}
                      data-result={e.id}
                    >
                      <span className={styles.state}>
                        {en[verificationOf(e)].text}
                        {n !== null ? (
                          <button
                            type="button"
                            className={styles.chip}
                            aria-label={format("results.chip", { n })}
                            aria-expanded={open}
                            onClick={() => {
                              setNote(open ? null : e.id);
                            }}
                          >
                            {n}
                          </button>
                        ) : null}
                      </span>
                      <span className={styles.statement}>
                        {readableStatement(snapshot, e.statement)}
                      </span>
                      {open ? (
                        <span className={styles.note} role="note">
                          {sourceNote(snapshot, e)}
                        </span>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </>
          ) : null}
          <div className={styles.bottomActionSection} data-chrome="">
            {onPackage ? (
              <div className={styles.packageCallout} data-chrome="">
                <div className={styles.packageCalloutCopy}>
                  <span className={styles.packageCalloutKicker}>
                    {"Next step · On-the-ground verification"}
                  </span>
                  <span className={styles.packageCalloutTitle}>
                    {"Field verification & decision plan"}
                  </span>
                  <p className={styles.packageCalloutDesc}>
                    {buildPlanCalloutCopy(verdict?.causes ?? [])}
                  </p>
                </div>
                <div className={styles.package}>
                  <Control
                    variant="primary"
                    className={styles.openPlanBtn}
                    keyHint="Enter"
                    keyShortcut="Enter"
                    onClick={onPackage}
                    data-open-package=""
                  >
                    {pkg["package.open"].text}
                  </Control>
                </div>
              </div>
            ) : null}
            <div className={styles.secondaryActionsRow} data-chrome="">
              <span className={styles.secondaryActionsLabel}>{"Explore 3D terrain views:"}</span>
              <ActionList
                actions={actions}
                {...(onOpen ? { onOpen } : {})}
                {...(onBack ? { onBack } : {})}
              />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
