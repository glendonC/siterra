"use client";

// The globe's page (the lead's decisions 8 and 10, 30 Oct 2026): every case the visitor can open stands on the globe
// as a point, and beside it a card in Destiny's manner with the place and region in the record's words, the case's own
// question and the one action into it (Enter). With one case the card shows by itself once the globe settles. The
// mouse hint is said in words. The journey moves the card with its point each frame (cardRef); no place is written here.

import type { Ref } from "react";
import { en, format } from "../../lib/copy/en";
import { Control } from "../controls/Control";
import styles from "./Journey.module.css";

export interface GlobeCase {
  id: string;
  place: string;
  region: string;
  question: string;
}

export function GlobePage({
  cases,
  cardRef,
  onOpen,
}: {
  cases: GlobeCase[];
  /** The card the journey places beside the case's point (today the listing holds one case). */
  cardRef: Ref<HTMLDivElement>;
  onOpen: () => void;
}) {
  return (
    <div className={styles.page}>
      <ul className={styles.cases} aria-label={en["globe.cases"].text}>
        {cases.map((c) => (
          <li key={c.id}>
            <div ref={cardRef} className={styles.caseCard} data-case-card={c.id}>
              <p className={styles.casePlace}>
                {format("globe.place", { place: c.place, region: c.region })}
              </p>
              <p className={styles.caseQuestion}>{c.question}</p>
              <Control variant="primary" keyHint="↵" keyShortcut="Enter" onClick={onOpen}>
                {en["globe.open"].text}
              </Control>
            </div>
          </li>
        ))}
      </ul>
      <div className={styles.hints}>
        <span className={styles.quiet}>{en["globe.drag"].text}</span>
      </div>
    </div>
  );
}
