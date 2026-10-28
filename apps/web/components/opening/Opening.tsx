"use client";

// The opening page: one beat at a time over the globe, a row of marks for the four beats, then one action.
// Arrow keys, space, Enter or a click step; the recording mode advances after a hold but never presses the
// action by itself.

import { useCallback, useEffect, useState } from "react";
import { en } from "../../lib/copy/en";
import {
  BEATS,
  OPENING_START,
  stepOpening,
  type OpeningInput,
  type OpeningState,
} from "../../lib/opening/beats";
import { LIMB, LIMB_ACT } from "../../lib/globe/views";
import styles from "./Opening.module.css";

export interface OpeningProps {
  onOpen: () => void;
  /** Told when a beat starts (index) and when the action appears, so the globe behind can follow. */
  onBeat?: (index: number) => void;
  onActionShown?: () => void;
  /** Recording mode: advance after this many ms. Absent in normal use. */
  autoAdvanceMs?: number;
}

/** The type's paper: below the mark row, and this far above the limb (CSS px, DESIGN a5). */
const PAPER_TOP = 58;
const LIMB_AIR = 34;

export function Opening({ onOpen, onBeat, onActionShown, autoAdvanceMs }: OpeningProps) {
  const [state, setState] = useState<OpeningState>(OPENING_START);

  useEffect(() => {
    if (state.actionShown) onActionShown?.();
    else onBeat?.(state.beat);
  }, [state, onBeat, onActionShown]);

  const step = useCallback(
    (input: OpeningInput) => {
      const next = stepOpening(state, input);
      if (next === "open") onOpen();
      else setState(next);
    },
    [state, onOpen],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      // a focused button handles its own Enter and space
      const tag = (e.target as HTMLElement | null)?.tagName;
      if ((tag === "BUTTON" || tag === "A") && (e.key === "Enter" || e.key === " ")) return;
      if (e.key === "ArrowRight" || e.key === " " || e.key === "Enter") {
        e.preventDefault();
        step("next");
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        step("previous");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [step]);

  useEffect(() => {
    if (!autoAdvanceMs || state.actionShown) return;
    const t = window.setTimeout(() => {
      step("timer");
    }, autoAdvanceMs);
    return () => {
      window.clearTimeout(t);
    };
  }, [autoAdvanceMs, state, step]);

  const beat = BEATS[state.beat];
  if (!beat) return null;
  return (
    <div
      className={styles.opening}
      onClick={() => {
        step("next");
      }}
    >
      <ol
        className={styles.marks}
        aria-label={`${String(state.beat + 1)} / ${String(BEATS.length)}`}
      >
        {BEATS.map((b, i) => (
          <li
            key={b.id}
            className={styles.mark}
            data-state={i < state.beat ? "done" : i === state.beat ? "current" : "next"}
            style={
              autoAdvanceMs && i === state.beat
                ? { animationDuration: `${String(autoAdvanceMs)}ms` }
                : undefined
            }
          />
        ))}
      </ol>
      {/* the paper between the mark row and the globe's limb; the beat sits centred in it, as approved */}
      <div
        className={styles.paper}
        style={{
          height:
            (state.actionShown ? LIMB_ACT : (LIMB[state.beat] ?? LIMB_ACT)) - PAPER_TOP - LIMB_AIR,
        }}
      >
        <article key={beat.id} className={styles.beat} data-string-id={beat.id} aria-live="polite">
          <p className={styles.sentence}>
            {beat.parts.map((p, i) => (
              <span key={p.text} className={p.tone === "ink" ? styles.ink : styles.grey}>
                {i > 0 ? " " : ""}
                {p.text}
              </span>
            ))}
          </p>
          {beat.tag ? <p className={styles.tag}>{en[beat.tag].text}</p> : null}
          {state.actionShown ? (
            <p className={styles.action}>
              <button
                type="button"
                className={styles.actionButton}
                onClick={(e) => {
                  e.stopPropagation();
                  onOpen();
                }}
                aria-keyshortcuts="Enter"
              >
                <kbd className={styles.glyph} aria-hidden="true">
                  ↵
                </kbd>
                {en["opening.action"].text}
              </button>
            </p>
          ) : null}
        </article>
      </div>
    </div>
  );
}
