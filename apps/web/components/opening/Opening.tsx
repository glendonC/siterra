"use client";

// The opening page: one screen over the globe's limb saying what Siterra does and the case it opens on,
// then one action into the globe, and a skip link straight to the map. Enter opens, unless a control has
// focus and handles its own Enter.

import { useEffect } from "react";
import { en } from "../../lib/copy/en";
import { openingCopy } from "../../lib/opening/opening";
import type { RegionPack } from "../../lib/pack/regionPack";
import { LIMB } from "../../lib/globe/views";
import styles from "./Opening.module.css";

export interface OpeningProps {
  /** The case's question, from its record. */
  question: string;
  /** The Region Pack the case loads: its name and status show under the question. */
  pack: Pick<RegionPack, "name" | "status">;
  onOpen: () => void;
  /** The skip link: straight to the map, without the globe and the dive. */
  onSkip: () => void;
  /** Told once the page shows, so the globe behind can follow. */
  onShown?: () => void;
}

/** The type's paper: from the top, and this far above the limb (CSS px, DESIGN a5). */
const PAPER_TOP = 58;
const LIMB_AIR = 34;

export function Opening({ question, pack, onOpen, onSkip, onShown }: OpeningProps) {
  const copy = openingCopy(question);

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
      <div className={styles.paper} style={{ height: LIMB[0] - PAPER_TOP - LIMB_AIR }}>
        <article className={styles.beat}>
          <h1 className={styles.sentence}>{copy.title}</h1>
          <p className={styles.what}>{copy.what}</p>
          <p className={styles.how}>{copy.how}</p>
          <p className={styles.caseLine}>
            <span className={styles.label}>{copy.questionLabel}</span>
            {copy.question}
          </p>
          <p className={styles.caseLine} data-pack>
            <span className={styles.label}>{en["pack.title"].text}</span>
            {pack.name}
            <span className={styles.status}>{pack.status}</span>
          </p>
          <p className={styles.action}>
            <button
              type="button"
              className={styles.actionButton}
              onClick={onOpen}
              aria-keyshortcuts="Enter"
            >
              <kbd className={styles.glyph} aria-hidden="true">
                ↵
              </kbd>
              {copy.action}
            </button>
            <a
              href="#arrival"
              className={styles.skip}
              onClick={(e) => {
                e.preventDefault();
                onSkip();
              }}
            >
              {copy.skip}
            </a>
          </p>
        </article>
      </div>
    </div>
  );
}
