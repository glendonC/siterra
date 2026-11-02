"use client";

// The ask's results (U11b), in the opened record's place on the right: the answer caption from the request's
// BranchMerge counts (ink and grey, as the instruments set theirs), then the findings the request committed, one per
// line, each statement as recorded (a Source id in its text read as the Source's short citation), two lines until focused, with its verification state in catalog words
// and its numbered source chip; a chip opens the cited locator and excerpt in a small quiet note.

import type { CaseSnapshot } from "@siterra/contracts";
import { useMemo, useRef, useState, type Ref } from "react";
import { en, format } from "../../lib/copy/en";
import {
  chipNumbers,
  commandFindings,
  commandMerge,
  readableStatement,
  resultsCaption,
  sourceNote,
  verificationOf,
} from "../../lib/overview/results";
import type { Action } from "../../lib/overview/actions";
import { ActionList } from "./ActionList";
import { Control } from "../controls/Control";
import { pformat, pkg } from "../../lib/copy/package";
import { overviewVerdictForCase } from "../../lib/overview/findings";
import verdictStyles from "../package/Verdict.module.css";
import styles from "./OverviewResults.module.css";

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
  /** Opens the field plan in place over the land (decision 13); true when it did, so the link does not load. */
  onOpen?: (href: string) => boolean;
  /** Opens the question's next-steps package in place (UI-2); absent when its command committed none. */
  onPackage?: () => void;
  /** Rotates and highlights the 3D valley terrain behind the frost when a hypothesis is focused or hovered. */
  onFocusCause?: (explanationId: string) => void;
  /** What can be done from here, from what the record offers (decision 15). */
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
  const shownFindings = verdict ? allAcceptedFindings : findings;
  const caption = useMemo(
    () =>
      verdict
        ? verdict.caption
        : resultsCaption(commandMerge(snapshot, commandId), findings.length),
    [verdict, snapshot, commandId, findings.length],
  );
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
          <p className={styles.caption} data-results-caption>
            <span className={styles.ink}>{caption.ink}</span>
            {caption.grey ? (
              <>
                {" "}
                <span className={styles.grey}>{caption.grey}</span>
              </>
            ) : null}
          </p>
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
                <span>{pformat("verdict.tab.causes", { n: verdict.causes.length })}</span>
              </button>
              <button
                type="button"
                className={styles.tab}
                aria-pressed={tab === "livelihoods"}
                data-results-tab="livelihoods"
                onClick={() => {
                  setTab("livelihoods");
                }}
              >
                <span>{"Livelihood & Policy Audit (4)"}</span>
              </button>
              <button
                type="button"
                className={styles.tab}
                aria-pressed={tab === "findings"}
                data-results-tab="findings"
                onClick={() => {
                  setTab("findings");
                }}
              >
                <span>{pformat("verdict.tab.context", { n: allAcceptedFindings.length })}</span>
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
                          <span className={verdictStyles.causeIndex} data-chrome="">
                            {String(i + 1).padStart(2, "0")}
                          </span>
                          <span className={verdictStyles.name}>{c.label}</span>
                        </span>
                        <span
                          className={verdictStyles.status}
                          data-status={c.status}
                          data-verdict-status-text=""
                        >
                          {c.statusText}
                        </span>
                      </div>
                      {open ? (
                        <div className={verdictStyles.detail} data-verdict-detail="">
                          <p className={verdictStyles.reason} data-verdict-reason="">
                            {c.reason}
                          </p>
                          <p className={verdictStyles.prediction} data-verdict-prediction="">
                            <span className={verdictStyles.predLabel}>
                              {pkg["verdict.predicted"].text}:
                            </span>{" "}
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
                                {pkg["verdict.fieldCheck"].text}
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
          ) : showLivelihoods ? (
            <div data-chrome="">
              <ul className={styles.livelihoodMatrix}>
                <li
                  className={styles.livelihoodCard}
                  onPointerEnter={() => {
                    onFocusCause?.("grazing");
                  }}
                  onClick={() => {
                    onFocusCause?.("grazing");
                  }}
                >
                  <div className={styles.livelihoodHead}>
                    <span className={styles.livelihoodHeadLeft}>
                      <span className={styles.livelihoodIndex}>{"01"}</span>
                      <span className={styles.livelihoodTitle}>
                        {"Customary Agdal Pasture Rules & Grazing Shift"}
                      </span>
                    </span>
                    <span className={styles.livelihoodBadge}>{"Blanco et al. 2015"}</span>
                  </div>
                  <p className={styles.livelihoodBody}>
                    {
                      "Communal agdal rules regulate high-pasture opening dates, while winter transhumance decline has shifted year-round livestock reliance onto valley-floor orchards and lower slopes."
                    }
                  </p>
                </li>
                <li
                  className={styles.livelihoodCard}
                  onPointerEnter={() => {
                    onFocusCause?.("snow_terrain");
                  }}
                  onClick={() => {
                    onFocusCause?.("snow_terrain");
                  }}
                >
                  <div className={styles.livelihoodHead}>
                    <span className={styles.livelihoodHeadLeft}>
                      <span className={styles.livelihoodIndex}>{"02"}</span>
                      <span className={styles.livelihoodTitle}>
                        {"Pastoral Law 113-13 & National Drought Shock"}
                      </span>
                    </span>
                    <span className={styles.livelihoodBadge}>{"Dahan et al. 2012, FAO 2024"}</span>
                  </div>
                  <p className={styles.livelihoodBody}>
                    {
                      "Under Morocco's Law 113-13 permit framework and a 2024 cereal harvest >40% below average, restricting pasture access without verified forage baselines directly threatens smallholder herd survival."
                    }
                  </p>
                </li>
                <li
                  className={styles.livelihoodCard}
                  onPointerEnter={() => {
                    onFocusCause?.("land_use");
                  }}
                  onClick={() => {
                    onFocusCause?.("land_use");
                  }}
                >
                  <div className={styles.livelihoodHead}>
                    <span className={styles.livelihoodHeadLeft}>
                      <span className={styles.livelihoodIndex}>{"03"}</span>
                      <span className={styles.livelihoodTitle}>
                        {"Historical Policy Caution: 1917 Forest Decree"}
                      </span>
                    </span>
                    <span className={styles.livelihoodBadge}>{"Davis 2005, West et al. 2023"}</span>
                  </div>
                  <p className={styles.livelihoodBody}>
                    {
                      "Protectorate Morocco's 1917 decree banned pastoral grazing over deforestation claims later contradicted by fossil pollen, and 26-site audits show top-down restrictions fail without local baselines."
                    }
                  </p>
                </li>
                <li
                  className={styles.livelihoodCard}
                  onPointerEnter={() => {
                    onFocusCause?.("data_artefact");
                  }}
                  onClick={() => {
                    onFocusCause?.("data_artefact");
                  }}
                >
                  <div className={styles.livelihoodHead}>
                    <span className={styles.livelihoodHeadLeft}>
                      <span className={styles.livelihoodIndex}>{"04"}</span>
                      <span className={styles.livelihoodTitle}>
                        {"250 m Sensor Mixing: Ground Walks Precede Action"}
                      </span>
                    </span>
                    <span className={styles.livelihoodBadge}>{"Wessels et al. 2012"}</span>
                  </div>
                  <p className={styles.livelihoodBody}>
                    {
                      "A 250 m satellite pixel cannot distinguish nutritious forage grass from unpalatable thorny cushion shrubs. All 4 GPS field walks and community sign-off are required before any rule change."
                    }
                  </p>
                </li>
              </ul>
            </div>
          ) : (
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
          )}
          <div className={styles.bottomActionRow}>
            {onPackage ? (
              <div className={styles.package} data-chrome="">
                <Control
                  variant="quiet"
                  className={styles.openPlanBtn}
                  keyHint="Enter"
                  keyShortcut="Enter"
                  onClick={onPackage}
                  data-open-package=""
                >
                  {pkg["package.open"].text}
                </Control>
              </div>
            ) : null}
            <div data-chrome="">
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
