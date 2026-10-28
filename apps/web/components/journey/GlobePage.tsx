"use client";

// The globe's page: the one case and the two key hints. The legend, the credit, the case ring and the range
// name along the Atlas belong to the journey, which shows them across the opening, the globe and the dive.

import { en } from "../../lib/copy/en";
import styles from "./Journey.module.css";

export function GlobePage({ onDive }: { onDive: () => void }) {
  return (
    <div className={styles.page}>
      <p className={styles.oneCase}>{en["globe.oneCase"].text}</p>
      <ul className={styles.hints}>
        <li>
          <button type="button" className={styles.hint} onClick={onDive} aria-keyshortcuts="Enter">
            <kbd className={styles.glyph} aria-hidden="true">
              ↵
            </kbd>
            {en["opening.action"].text}
          </button>
        </li>
        <li className={styles.quiet}>
          <kbd className={styles.glyph} aria-hidden="true">
            {en["globe.dragKey"].text}
          </kbd>
          {en["globe.turn"].text}
        </li>
      </ul>
    </div>
  );
}
