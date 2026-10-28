"use client";

// "Read flat": everything the screen shows, as plain text in reading order, so no fact depends on the map
// or on motion. A native modal dialog gives focus trapping, Escape and the backdrop without a library.

import { useEffect, useRef } from "react";
import { en } from "../../lib/copy/en";
import type { FlatSection } from "../../lib/flat/types";
import styles from "./ReadFlat.module.css";

export interface ReadFlatProps {
  open: boolean;
  sections: FlatSection[];
  onClose: () => void;
}

export function ReadFlat({ open, sections, onClose }: ReadFlatProps) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={dialog}
      className={styles.dialog}
      aria-labelledby="read-flat-title"
      onClose={onClose}
    >
      <h2 id="read-flat-title" className={styles.title}>
        {en["flat.title"].text}
      </h2>
      {sections.map((s) => (
        <section key={s.heading} className={styles.section}>
          <h3 className={styles.heading}>{s.heading}</h3>
          <ul className={styles.lines}>
            {s.lines.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </section>
      ))}
      <form method="dialog">
        <button type="submit" className={styles.close}>
          <kbd className={styles.glyph} aria-hidden="true">
            Esc
          </kbd>
          {en["flat.close"].text}
        </button>
      </form>
    </dialog>
  );
}
