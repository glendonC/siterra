"use client";

// The chrome over the stage at arrival: the mode line, key hints, the command line holding the case's
// question, the instruments and the credit line. One action is primary: the ↵ hint.

import { useEffect, useRef } from "react";
import { en, format, type MessageId } from "../../lib/copy/en";
import { hintAction, keyLike } from "../../lib/shell/keys";
import styles from "./Shell.module.css";

export interface ArrivalChromeProps {
  /** The case question from the case record, shown in the command line. */
  question: string;
  /** Which mode line to show: live, replay, concept or fixture data. */
  mode: MessageId;
  reliefFactor: number;
  /** False while a dialog is open, so key hints do not act behind it. */
  keysEnabled: boolean;
  /** Map bearing, so the north mark points to north on the land. */
  bearingDeg: number;
  onStart: () => void;
  onReadFlat: () => void;
  onAsk: (text: string) => void;
  onSources: () => void;
}

const CREDITS: MessageId[] = [
  "credit.terrain",
  "credit.rainfall",
  "credit.imagery",
  "credit.places",
];

export function ArrivalChrome({
  question,
  mode,
  reliefFactor,
  keysEnabled,
  bearingDeg,
  onStart,
  onReadFlat,
  onAsk,
  onSources,
}: ArrivalChromeProps) {
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!keysEnabled) return;
    const onKey = (e: KeyboardEvent) => {
      const action = hintAction(keyLike(e));
      if (!action) return;
      if (action === "escape") {
        input.current?.blur();
        return;
      }
      e.preventDefault();
      if (action === "primary") onStart();
      else if (action === "readFlat") onReadFlat();
      else input.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [keysEnabled, onStart, onReadFlat]);

  return (
    <div className={styles.chrome}>
      <p className={styles.mode} data-budget="island">
        {en[mode].text}
      </p>

      <form
        className={styles.command}
        autoComplete="off"
        data-budget="command"
        onSubmit={(e) => {
          e.preventDefault();
          const text = input.current?.value.trim();
          if (text) onAsk(text);
        }}
      >
        <span className={styles.commandGlyph} aria-hidden="true">
          /
        </span>
        <span className={styles.commandSep} aria-hidden="true" />
        <label className={styles.srOnly} htmlFor="command-input">
          {en["command.label"].text}
        </label>
        <input
          ref={input}
          id="command-input"
          className={styles.commandInput}
          type="text"
          defaultValue={question}
          spellCheck={false}
          aria-keyshortcuts="/"
        />
      </form>

      <ul className={styles.keys}>
        <li>
          <button
            type="button"
            className={styles.key}
            onClick={onStart}
            aria-keyshortcuts="Enter"
            data-budget="action"
          >
            <kbd className={styles.glyph} aria-hidden="true">
              ↵
            </kbd>
            {en["arrival.start"].text}
          </button>
        </li>
        <li>
          <button
            type="button"
            className={styles.key}
            onClick={onReadFlat}
            aria-keyshortcuts="F"
            data-budget="key-hint"
          >
            <kbd className={styles.glyph} aria-hidden="true">
              F
            </kbd>
            {en["arrival.readFlat"].text}
          </button>
        </li>
      </ul>

      <div className={styles.instruments} data-budget="island">
        <div className={styles.instrumentRow}>
          <svg
            className={styles.north}
            viewBox="-20 -20 40 40"
            role="img"
            aria-label={en["stage.northName"].text}
            style={{ transform: `rotate(${-bearingDeg}deg)` }}
          >
            <path d="M0 -12 L4.5 5.5 L0 2 L-4.5 5.5 Z" />
          </svg>
          <span className={styles.northLabel} aria-hidden="true">
            {en["stage.north"].text}
          </span>
          <span>{format("stage.relief", { factor: reliefFactor })}</span>
        </div>
        <div className={styles.instrumentRow}>
          <span>{en["stage.imagery"].text}</span>
        </div>
      </div>

      <p className={styles.credit} data-budget="credit">
        {CREDITS.map((id) => en[id].text).join(" ")}
        <button type="button" className={styles.creditLink} onClick={onSources}>
          {en["stage.sources"].text}
        </button>
      </p>
    </div>
  );
}
