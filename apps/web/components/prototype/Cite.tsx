"use client";

// Numbered source chips inside a sentence; hover or focus opens the source's card.

import { useState } from "react";
import type { Source } from "../../lib/prototype/flow";
import styles from "./Story.module.css";

export function Cite({
  ns,
  chips,
  down = false,
}: {
  ns: number[];
  chips: Source[];
  /** Opens the source card below the chip, for sentences near the top of the screen. */
  down?: boolean;
}) {
  const [shown, setShown] = useState<number | null>(null);
  return (
    <span className={styles.cites}>
      {ns.map((n) => {
        const c = chips.find((x) => x.n === n);
        if (!c) return null;
        return (
          <span
            key={n}
            className={styles.citeWrap}
            data-down={down ? "true" : "false"}
            onMouseEnter={() => {
              setShown(n);
            }}
            onMouseLeave={() => {
              setShown(null);
            }}
          >
            <button
              type="button"
              className={styles.cite}
              aria-expanded={shown === n}
              aria-label={c.label}
              onFocus={() => {
                setShown(n);
              }}
              onBlur={() => {
                setShown(null);
              }}
              onClick={() => {
                setShown(shown === n ? null : n);
              }}
            >
              {n}
            </button>
            {shown === n ? (
              <span className={styles.sourceCard} role="tooltip">
                <span className={styles.sourceTop}>
                  <span className={styles.cite}>{n}</span>
                  {c.label}
                </span>
                <span className={styles.sourceTitle}>{c.title}</span>
                {c.quote ? <q className={styles.sourceQuote}>{c.quote}</q> : null}
                {c.body ? <span className={styles.sourceBody}>{c.body}</span> : null}
                <span className={styles.sourceWhere}>{c.where}</span>
                <span className={styles.sourceNote}>{c.note}</span>
              </span>
            ) : null}
          </span>
        );
      })}
    </span>
  );
}
