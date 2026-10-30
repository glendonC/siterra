"use client";

// The opening page over the globe's limb (the lead's decisions 7 and 10, 30 Oct 2026): what Siterra does, in general
// and large, and one action, "Choose a Place", into the globe with its Enter chip, where each case waits on its point.
// How it works waits behind a quiet button. No place and no case is named here. Enter opens, unless a control has
// focus and handles its own Enter.

import { useEffect, useId, useState } from "react";
import { openingCopy } from "../../lib/opening/opening";
import { LIMB } from "../../lib/globe/views";
import { Control } from "../controls/Control";
import styles from "./Opening.module.css";

export interface OpeningProps {
  onOpen: () => void;
  /** Told once the page shows, so the globe behind can follow. */
  onShown?: () => void;
}

/** The type's paper: from the top, and this far above the limb (CSS px, DESIGN a5). */
const PAPER_TOP = 58;
const LIMB_AIR = 34;

export function Opening({ onOpen, onShown }: OpeningProps) {
  const copy = openingCopy();
  const [how, setHow] = useState(false);
  const howId = useId();

  useEffect(() => {
    onShown?.();
  }, [onShown]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || e.altKey || e.ctrlKey || e.metaKey) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "BUTTON" || tag === "A") return;
      e.preventDefault();
      onOpen();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [onOpen]);

  return (
    <div className={styles.opening} data-opening>
      <p className={styles.brand}>{copy.title}</p>
      <div className={styles.paper} style={{ height: LIMB[0] - PAPER_TOP - LIMB_AIR }}>
        <article className={styles.beat}>
          <h1 className={styles.question}>{copy.what}</h1>
          <p className={styles.action}>
            <Control variant="primary" keyHint="↵" keyShortcut="Enter" onClick={onOpen}>
              {copy.action}
            </Control>
          </p>
          <p className={styles.howLine}>
            <Control
              variant="quiet"
              aria-expanded={how}
              aria-controls={howId}
              onClick={() => {
                setHow((v) => !v);
              }}
            >
              {copy.howButton}
            </Control>
          </p>
          <p id={howId} className={styles.how} hidden={!how} data-how>
            {copy.how}
          </p>
        </article>
      </div>
    </div>
  );
}
