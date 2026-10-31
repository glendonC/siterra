"use client";

// The ask's results (U11b), in the opened record's place on the right: the answer caption from the request's
// BranchMerge counts (ink and grey, as the instruments set theirs), then the findings the request committed, one per
// line, each statement as recorded (a Source id in its text read as the Source's short citation), two lines until focused, with its verification state in catalog words
// and its numbered source chip; a chip opens the cited locator and excerpt in a small quiet note.

import type { CaseSnapshot } from "@siterra/contracts";
import { useMemo, useState, type Ref } from "react";
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
import { pkg } from "../../lib/copy/package";
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
  /** What can be done from here, from what the record offers (decision 15). */
  actions: readonly Action[];
  onBack?: () => void;
  refs: ResultsRefs;
}) {
  const findings = useMemo(() => commandFindings(snapshot, commandId), [snapshot, commandId]);
  const caption = useMemo(
    () => resultsCaption(commandMerge(snapshot, commandId), findings.length),
    [snapshot, commandId, findings.length],
  );
  const chips = useMemo(() => chipNumbers(findings), [findings]);
  const [note, setNote] = useState<string | null>(null);
  return (
    <div ref={refs.root} className={styles.results} data-record="results">
      <div ref={refs.frost} className={styles.frost} aria-hidden="true" />
      <section ref={refs.inst} className={styles.inst} aria-label={en["results.title"].text}>
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
          <div className={styles.k}>{en["results.findings"].text}</div>
          <ul className={styles.list}>
            {findings.map((e, i) => {
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
          {onPackage ? (
            // the question's next-steps package, when its command committed one (UI-2): the card's Enter
            <div className={styles.package}>
              <Control
                variant="primary"
                keyHint="Enter"
                keyShortcut="Enter"
                onClick={onPackage}
                data-open-package=""
              >
                {pkg["package.open"].text}
              </Control>
            </div>
          ) : null}
          <ActionList
            actions={actions}
            {...(onOpen ? { onOpen } : {})}
            {...(onBack ? { onBack } : {})}
          />
        </div>
      </section>
    </div>
  );
}
