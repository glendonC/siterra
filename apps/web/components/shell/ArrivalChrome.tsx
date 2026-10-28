"use client";

// The chrome over the stage at arrival: the mode line (one line, which opens the scope popover with the
// mode's detail line and what Siterra will and will not do), key hints, the command line holding the case's
// question, the instruments and the credit line. One action is primary: the ↵ hint.

import { useEffect, useRef } from "react";
import { en, format, type MessageId } from "../../lib/copy/en";
import type { ModeLines } from "../../lib/projection/arrival";
import { hintAction, keyLike } from "../../lib/shell/keys";
import { arrivalTiming, type ArrivalPart } from "../../lib/stage/arrival-sequence";
import styles from "./Shell.module.css";

export interface ArrivalChromeProps {
  /** The case question from the case record, shown in the command line. */
  question: string;
  /** The mode line and the line under it, chosen from the case record's mode (projectArrival). */
  mode: ModeLines;
  reliefFactor: number;
  /** The places part of the credit line, from the case's ContextFeature records (contextLand). */
  placeCredit: string;
  /** False when the viewer turned single-key shortcuts off; the hints stay as buttons. */
  singleKeys?: boolean;
  /** True once arrival has begun: the command line, key hints and instruments land on their delays. */
  arrived: boolean;
  /** Map bearing, so the north mark points to north on the land. */
  bearingDeg: number;
  onStart: () => void;
  /** The one primary action's label: start at arrival, Stop while work runs. */
  primary?: MessageId;
  /** A message under the command line when a request was refused. */
  notice?: MessageId | undefined;
  onReadFlat: () => void;
  onAsk: (text: string) => void;
  onSources: () => void;
}

const SCOPE_WILL: MessageId[] = ["scope.will1", "scope.will2", "scope.will3", "scope.will4"];
const SCOPE_WILL_NOT: MessageId[] = ["scope.willNot1", "scope.willNot2", "scope.willNot3"];

const CREDITS: MessageId[] = ["credit.terrain", "credit.rainfall", "credit.imagery"];

export function ArrivalChrome({
  question,
  mode,
  reliefFactor,
  placeCredit,
  singleKeys = true,
  arrived,
  bearingDeg,
  onStart,
  primary = "arrival.start",
  notice,
  onReadFlat,
  onAsk,
  onSources,
}: ArrivalChromeProps) {
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!arrived) return;
    const onKey = (e: KeyboardEvent) => {
      // key hints never act behind an open dialog (Read flat, Sources and notices). The page is asked, not
      // React state: a dialog's close event comes a task after Esc, and a key pressed in between would be lost
      if (document.querySelector("dialog[open]")) return;
      const action = hintAction(keyLike(e), { singleKeys });
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
  }, [singleKeys, arrived, onStart, onReadFlat]);

  const reduced =
    typeof window !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  /** The landing class and its timing variables, or hidden until arrival begins. */
  const land = (part: ArrivalPart) => {
    if (!arrived) return { className: styles.waiting ?? "", style: {} };
    const t = arrivalTiming(part, reduced);
    return {
      className: styles.landing ?? "",
      style: {
        "--land-delay": `${String(t.delayMs)}ms`,
        "--land-dur": `${String(t.durationMs)}ms`,
      } as Record<string, string>,
    };
  };
  const cmd = land("command");
  const keys = land("keys");
  const instruments = land("instruments");

  return (
    <div className={styles.chrome}>
      <p className={styles.mode} data-budget="island">
        <button
          type="button"
          className={styles.modeButton}
          popoverTarget="scope-popover"
          aria-label={`${en[mode.label].text}. ${en["scope.name"].text}`}
        >
          {en[mode.label].text}
        </button>
      </p>
      <div id="scope-popover" popover="auto" className={styles.scope}>
        <p className={styles.scopeMode}>{en[mode.detail].text}</p>
        <h2 className={styles.scopeHeading}>{en["scope.will"].text}</h2>
        <ul className={styles.scopeList}>
          {SCOPE_WILL.map((id) => (
            <li key={id}>{en[id].text}</li>
          ))}
        </ul>
        <h2 className={styles.scopeHeading}>{en["scope.willNot"].text}</h2>
        <ul className={styles.scopeList}>
          {SCOPE_WILL_NOT.map((id) => (
            <li key={id}>{en[id].text}</li>
          ))}
        </ul>
      </div>

      <form
        className={`${styles.command ?? ""} ${cmd.className}`}
        style={cmd.style}
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

      {notice ? (
        <p className={styles.notice} role="status">
          {en[notice].text}
        </p>
      ) : null}
      <ul className={`${styles.keys ?? ""} ${keys.className}`} style={keys.style}>
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
            {en[primary].text}
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

      <div
        className={`${styles.instruments ?? ""} ${instruments.className}`}
        style={instruments.style}
        data-budget="island"
      >
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
        {[...CREDITS.map((id) => en[id].text), placeCredit].filter(Boolean).join(" ")}
        <button type="button" className={styles.creditLink} onClick={onSources}>
          {en["stage.sources"].text}
        </button>
      </p>
    </div>
  );
}
