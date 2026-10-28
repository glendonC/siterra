"use client";

// The chrome over the stage at arrival: the mode line (one line: the Region Pack, which opens its layers,
// window, checks and status, and the mode, which opens the scope popover with the mode's detail line and
// what Siterra will and will not do), key hints, the command line holding the case's
// question, the instruments and the credit line. One action is primary: the ↵ hint, shown only when ↵
// does something (primaryHint).

import { useEffect, useRef } from "react";
import { en, format, type MessageId } from "../../lib/copy/en";
import type { RegionPack } from "../../lib/pack/regionPack";
import type { ModeLines } from "../../lib/projection/arrival";
import { hintAction, keyLike } from "../../lib/shell/keys";
import { arrivalTiming, type ArrivalPart } from "../../lib/stage/arrival-sequence";
import styles from "./Shell.module.css";

export interface ArrivalChromeProps {
  /** The case question from the case record, shown in the command line. */
  question: string;
  /** The study area name from the case record, shown as a context chip before sending (IU-03). */
  areaName: string;
  /** The mode line and the line under it, chosen from the case record's mode (projectArrival). */
  mode: ModeLines;
  /** The Region Pack the case loads, from its records (regionPack). */
  pack: RegionPack;
  reliefFactor: number;
  /** True when the Sentinel-2 imagery is drawn on the land; its instrument line shows only then. */
  imagery: boolean;
  /** The places part of the credit line, from the case's ContextFeature records (contextLand). */
  placeCredit: string;
  /** False when the viewer turned single-key shortcuts off; the hints stay as buttons. */
  singleKeys?: boolean;
  /** True once arrival has begun: the command line, key hints and instruments land on their delays. */
  arrived: boolean;
  /** Map bearing, so the north mark points to north on the land. */
  bearingDeg: number;
  /** The primary action, given what the command line holds. */
  onStart: (text: string) => void;
  /** The one primary action's label, or none when ↵ would do nothing (primaryHint). */
  primary: MessageId | undefined;
  /** The Esc action while there is one (stopHint); its button is in the activity panel. */
  stop?: MessageId | undefined;
  onStop?: () => void;
  /** A message under the command line when a request was refused. */
  notice?: MessageId | undefined;
  /** False when the map could not be drawn: no F hint and no map instruments (the hint rule). */
  mapDrawn?: boolean;
  /** True when an input cut the arrival settle short: everything lands at once. */
  instant?: boolean;
  /** True in the flat reading: the F hint is pressed, and F again returns. */
  flat?: boolean;
  onReadFlat: () => void;
  /** True when the viewer has moved the camera away from the active step's pose. */
  cameraMoved?: boolean;
  onResetView?: () => void;
  onChallenge?: (text: string) => void;
  onTrace?: () => void;
  onBrief?: () => void;
  /** Enter in the command line, with its trimmed text. */
  onAsk: (text: string) => void;
  onSources: () => void;
}

const SCOPE_WILL: MessageId[] = ["scope.will1", "scope.will2", "scope.will3", "scope.will4"];
const SCOPE_WILL_NOT: MessageId[] = ["scope.willNot1", "scope.willNot2", "scope.willNot3"];

const CREDITS: MessageId[] = ["credit.terrain", "credit.rainfall", "credit.imagery"];

export function ArrivalChrome({
  question,
  areaName,
  mode,
  pack,
  reliefFactor,
  imagery,
  placeCredit,
  singleKeys = true,
  arrived,
  bearingDeg,
  onStart,
  primary,
  stop,
  onStop = () => undefined,
  notice,
  flat = false,
  mapDrawn = true,
  instant = false,
  onReadFlat,
  cameraMoved = false,
  onResetView = () => undefined,
  onChallenge = () => undefined,
  onTrace = () => undefined,
  onBrief = () => undefined,
  onAsk,
  onSources,
}: ArrivalChromeProps) {
  const input = useRef<HTMLInputElement>(null);

  // listening from the start, so a key that cuts the arrival settle short still does its own job
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // key hints never act behind an open dialog (Read flat, Sources and notices). The page is asked, not
      // React state: a dialog's close event comes a task after Esc, and a key pressed in between would be lost
      if (document.querySelector("dialog[open]")) return;
      const action = hintAction(keyLike(e), { singleKeys });
      if (!action) return;
      if (action === "escape") {
        input.current?.blur();
        // an open popover (the mode's scope) takes its own Esc; otherwise Esc stops a running request
        if (stop && !document.querySelector(":popover-open")) {
          e.preventDefault();
          onStop();
        }
        return;
      }
      // ↵ with no primary hint does nothing, so the key is left alone
      if (action === "primary" && !primary) return;
      if ((action === "readFlat" || action === "resetView") && !mapDrawn) return;
      e.preventDefault();
      if (action === "primary") onStart(input.current?.value ?? "");
      else if (action === "readFlat") onReadFlat();
      else if (action === "resetView") onResetView();
      else input.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [singleKeys, primary, stop, mapDrawn, onStart, onStop, onReadFlat, onResetView]);

  const reduced =
    instant ||
    (typeof window !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches);
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
        <button type="button" className={styles.modeButton} popoverTarget="pack-popover" data-pack>
          {format("pack.button", { status: pack.status })}
        </button>
        <button
          type="button"
          className={styles.modeButton}
          popoverTarget="scope-popover"
          aria-label={`${en[mode.label].text}. ${en["scope.name"].text}`}
        >
          {en[mode.label].text}
        </button>
      </p>
      <div
        id="pack-popover"
        popover="auto"
        className={styles.scope}
        aria-label={en["pack.title"].text}
      >
        <h2 className={styles.scopeHeading}>{en["pack.title"].text}</h2>
        <p className={styles.packName}>{pack.name}</p>
        <h2 className={styles.scopeHeading}>{en["pack.layers"].text}</h2>
        <ul className={styles.scopeList}>
          {pack.layers.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
        {pack.window ? (
          <>
            <h2 className={styles.scopeHeading}>{en["pack.window"].text}</h2>
            <p className={styles.packValue}>{pack.window}</p>
          </>
        ) : null}
        <h2 className={styles.scopeHeading}>{en["pack.checks"].text}</h2>
        <p className={styles.packValue}>{pack.checks}</p>
        <h2 className={styles.scopeHeading}>{en["pack.statusLabel"].text}</h2>
        <p className={styles.packValue}>{pack.status}</p>
        <p className={styles.scopeMode}>{en["pack.realDataDetail"].text}</p>
      </div>
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
          const text = input.current?.value.trim() ?? "";
          onAsk(text);
        }}
      >
        <div className={styles.commandHeader}>
          <label className={styles.commandLabel} htmlFor="command-input">
            {en["command.label"].text}
          </label>
          <div className={styles.commandChips} data-command-context>
            <span className={styles.commandChip}>
              {format("command.areaChip", { area: areaName })}
            </span>
            {pack.periodSpan ? (
              <span className={styles.commandChip}>
                {format("command.periodChip", { period: pack.periodSpan })}
              </span>
            ) : null}
          </div>
          <div className={styles.nextSteps} data-next-steps>
            <button
              type="button"
              className={styles.nextStep}
              onClick={() => {
                onStart(input.current?.value ?? "");
              }}
            >
              {en["action.investigate"].text}
            </button>
            <button
              type="button"
              className={styles.nextStep}
              onClick={() => {
                const current = input.current?.value.trim() ?? "";
                const next =
                  current && current !== question ? current : en["command.challengeQuestion"].text;
                if (input.current) {
                  input.current.value = next;
                  input.current.focus();
                }
                onChallenge(next);
              }}
            >
              {en["action.challenge"].text}
            </button>
            <button type="button" className={styles.nextStep} onClick={onTrace}>
              {en["action.trace"].text}
            </button>
            {mapDrawn ? (
              <button type="button" className={styles.nextStep} onClick={onReadFlat}>
                {en["action.flat"].text}
              </button>
            ) : null}
            <button type="button" className={styles.nextStep} onClick={onBrief}>
              {en["action.brief"].text}
            </button>
          </div>
        </div>
        <div className={styles.commandInputRow}>
          <span className={styles.commandGlyph} aria-hidden="true">
            /
          </span>
          <span className={styles.commandSep} aria-hidden="true" />
          <input
            ref={input}
            id="command-input"
            className={styles.commandInput}
            type="text"
            defaultValue={question}
            spellCheck={false}
            aria-keyshortcuts="/"
          />
        </div>
      </form>

      {notice ? (
        <p className={styles.notice} role="status">
          {en[notice].text}
        </p>
      ) : null}
      <ul className={`${styles.keys ?? ""} ${keys.className}`} style={keys.style}>
        {primary ? (
          <li>
            <button
              type="button"
              className={styles.key}
              onClick={() => {
                onStart(input.current?.value ?? "");
              }}
              aria-keyshortcuts="Enter"
              data-budget="action"
            >
              <kbd className={styles.glyph} aria-hidden="true">
                ↵
              </kbd>
              {en[primary].text}
            </button>
          </li>
        ) : null}
        {mapDrawn ? (
          <li>
            <button
              type="button"
              className={styles.key}
              onClick={onReadFlat}
              aria-pressed={flat}
              aria-keyshortcuts="F"
              data-budget="key-hint"
            >
              <kbd className={styles.glyph} aria-hidden="true">
                F
              </kbd>
              {en["arrival.readFlat"].text}
            </button>
          </li>
        ) : null}
        {mapDrawn && cameraMoved ? (
          <li>
            <button
              type="button"
              className={styles.key}
              onClick={onResetView}
              aria-keyshortcuts="Home H"
              data-budget="key-hint"
            >
              <kbd className={styles.glyph} aria-hidden="true">
                H
              </kbd>
              {en["stage.resetView"].text}
            </button>
          </li>
        ) : null}
      </ul>

      {/* the instruments describe the map: none when it is not drawn */}
      {mapDrawn ? (
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
              // north up in the flat reading
              style={{ transform: `rotate(${String(flat ? 0 : -bearingDeg)}deg)` }}
            >
              <path d="M0 -12 L4.5 5.5 L0 2 L-4.5 5.5 Z" />
            </svg>
            <span className={styles.northLabel} aria-hidden="true">
              {en["stage.north"].text}
            </span>
            {/* the flat reading has no relief, so no exaggeration to state */}
            {flat ? null : <span>{format("stage.relief", { factor: reliefFactor })}</span>}
          </div>
          {imagery ? (
            <div className={styles.instrumentRow}>
              <span>{en["stage.imagery"].text}</span>
            </div>
          ) : null}
        </div>
      ) : null}

      <p className={styles.credit} data-budget="credit">
        {[...CREDITS.map((id) => en[id].text), placeCredit].filter(Boolean).join(" ")}
        <button type="button" className={styles.creditLink} onClick={onSources}>
          {en["stage.sources"].text}
        </button>
      </p>
    </div>
  );
}
