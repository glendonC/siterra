"use client";

// The ask (approved specimen D4): a matte slate-teal circle with a small light label and a thin circled plus, no glow
// and no outline. The circle or the "/" key opens a colourless fade rising from the bottom with the question typed in
// large light type; Esc closes it. Enter hands the text to the page (the overview sends it; an instrument carries it
// to the overview). The activity line shows only once the page passes one, after Enter.

import type { SuggestedQuestion } from "@siterra/contracts";
import { useEffect, useLayoutEffect, useRef, type CSSProperties, type Ref } from "react";
import { en, format } from "../../lib/copy/en";
import type { AskLine } from "../../lib/overview/ask-line";
import styles from "./Ask.module.css";

export interface AskProps {
  /** "arc": D4's 112 px circle, placed by the page on the arc's start; "rest": a 44 px circle at the bottom centre. */
  variant: "arc" | "rest";
  /** True while no key may open or close it (the overview's arrival from the globe). */
  keysOff?: boolean;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  text: string;
  onText: (text: string) => void;
  onEnter: (text: string) => void;
  /** The line under the question once it is sent; null shows none. */
  activity: AskLine | null;
  /** A completed request's "Findings: N" opens its results. */
  onFindings?: () => void;
  /** The circle hovered or focused (the overview dims its findings a little). */
  onHover?: (on: boolean) => void;
  circleRef?: Ref<HTMLButtonElement>;
  circleStyle?: CSSProperties;
  /** The activity line beside the disc while the ask is closed (decision 14: a status stands beside its subject). */
  besideRef?: Ref<HTMLParagraphElement>;
  /** Validated questions for the place (U33b), shown as guided prompts at rest and inside the open ask. */
  suggestions?: readonly SuggestedQuestion[] | undefined;
  /** True while the guided prompts stand beside the ask circle at rest on the overview. */
  showPromptsAtRest?: boolean | undefined;
  promptsRef?: Ref<HTMLDivElement> | undefined;
}

/** True when a key press belongs to a field the viewer is typing in. */
const typing = (t: EventTarget | null) =>
  t instanceof HTMLElement &&
  (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName));

/** The smallest type a long question steps down to before it would scroll (U30). */
const ASK_MIN_PX = 24;

export function Ask({
  variant,
  keysOff = false,
  open,
  onOpen,
  onClose,
  text,
  onText,
  onEnter,
  activity,
  onFindings,
  onHover,
  circleRef,
  circleStyle,
  besideRef,
  suggestions,
  showPromptsAtRest = false,
  promptsRef,
}: AskProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  // "/" opens the ask from anywhere but a field being typed in
  // "1", "2", "3" at rest on the overview immediately commission the corresponding suggested question (U33b)
  // Esc closes it from anywhere while it is open
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (keysOff) return;
      if (open) {
        if (ev.key !== "Escape") return;
        ev.preventDefault();
        onClose();
        return;
      }
      if (ev.metaKey || ev.ctrlKey || ev.altKey || typing(ev.target)) return;
      if (
        showPromptsAtRest &&
        suggestions?.length &&
        (ev.key === "1" || ev.key === "2" || ev.key === "3")
      ) {
        const picked = suggestions[Number(ev.key) - 1];
        if (picked) {
          ev.preventDefault();
          onText(picked.question);
          onEnter(picked.question);
        }
        return;
      }
      if (ev.key !== "/") return;
      ev.preventDefault();
      onOpen();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [keysOff, open, onOpen, onClose, showPromptsAtRest, suggestions, onText, onEnter]);

  // open, the typing goes to the question; closed, the focus leaves it
  // a long question stays whole on its one line: the type steps down to fit the field, from 46 px to 24 px (U30)
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.fontSize = "";
    if (!text || el.clientWidth < 1) return;
    const full = parseFloat(getComputedStyle(el).fontSize) || 46;
    const ctx = document.createElement("canvas").getContext("2d");
    if (!ctx) return;
    const cs = getComputedStyle(el);
    ctx.font = `${cs.fontWeight} ${String(full)}px ${cs.fontFamily}`;
    const width = ctx.measureText(text).width * 1.02;
    if (width <= el.clientWidth) return;
    el.style.fontSize = `${String(Math.max(ASK_MIN_PX, Math.floor((full * el.clientWidth) / width)))}px`;
    el.scrollLeft = 0;
  }, [text, open]);
  useEffect(() => {
    if (open) inputRef.current?.focus();
    else inputRef.current?.blur();
  }, [open]);

  return (
    <div className={styles.ask} data-variant={variant} data-open={open ? "" : undefined}>
      <div className={styles.veil} aria-hidden="true" />
      <button
        ref={circleRef}
        type="button"
        className={styles.disc}
        style={circleStyle}
        aria-label={open ? en["ask.close"].text : en["ask.open"].text}
        aria-keyshortcuts="/"
        aria-expanded={open}
        data-ask
        onClick={open ? onClose : onOpen}
        onPointerEnter={() => onHover?.(true)}
        onPointerLeave={() => onHover?.(false)}
        onFocus={() => onHover?.(true)}
        onBlur={() => onHover?.(false)}
      >
        <span className={styles.label} aria-hidden="true">
          {en["ask.circle"].text}
        </span>
        <svg className={styles.plus} viewBox="-10 -10 20 20" aria-hidden="true">
          <circle r="9" />
          <path d="M-3.6 0 H3.6 M0 -3.6 V3.6" />
        </svg>
      </button>
      <p
        ref={besideRef}
        className={styles.beside}
        style={circleStyle}
        aria-hidden="true"
        data-ask-beside
        data-shown={!open && activity !== null ? "" : undefined}
      >
        {activity?.text}
      </p>
      {variant === "arc" && suggestions && suggestions.length > 0 ? (
        <div
          ref={promptsRef}
          className={styles.prompts}
          data-ask-prompts
          data-shown={!open && showPromptsAtRest ? "" : undefined}
          aria-hidden={open || !showPromptsAtRest}
        >
          <p className={styles.promptsKicker}>{en["ask.prompts.kicker"].text}</p>
          <ul className={styles.promptsList}>
            {suggestions.slice(0, 3).map((q, idx) => (
              <li key={q.id}>
                <button
                  type="button"
                  className={styles.promptBtn}
                  data-suggested-question={q.id}
                  tabIndex={!open && showPromptsAtRest ? 0 : -1}
                  aria-keyshortcuts={String(idx + 1)}
                  onPointerEnter={() => onHover?.(true)}
                  onPointerLeave={() => onHover?.(false)}
                  onFocus={() => onHover?.(true)}
                  onBlur={() => onHover?.(false)}
                  onClick={() => {
                    onText(q.question);
                    onEnter(q.question);
                  }}
                >
                  <kbd className={styles.promptKey} aria-hidden="true">
                    {idx + 1}
                  </kbd>
                  <span className={styles.promptText}>{q.question}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className={styles.panel} aria-hidden={!open}>
        <form
          className={styles.qline}
          autoComplete="off"
          onSubmit={(e) => {
            e.preventDefault();
            onEnter(text);
          }}
        >
          <input
            ref={inputRef}
            className={styles.input}
            type="text"
            name="question"
            value={text}
            placeholder={en["instrument.shell.command"].text}
            tabIndex={open ? 0 : -1}
            aria-label={en["instrument.shell.command"].text}
            onChange={(e) => {
              onText(e.target.value);
            }}
          />
        </form>
        {activity === null && suggestions && suggestions.length > 0 ? (
          <ul className={styles.openSuggestions} data-ask-suggestions>
            {suggestions.slice(0, 3).map((q, idx) => (
              <li key={q.id}>
                <button
                  type="button"
                  className={styles.openSuggestionBtn}
                  data-ask-suggestion={q.id}
                  tabIndex={open ? 0 : -1}
                  onClick={() => {
                    onText(q.question);
                    onEnter(q.question);
                  }}
                >
                  <kbd className={styles.promptKey} aria-hidden="true">
                    {idx + 1}
                  </kbd>
                  <span className={styles.openSuggestionText}>{q.question}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {activity !== null ? (
          <p className={styles.act} role="status" data-ask-activity>
            {activity.text}
            {activity.findings !== null && onFindings ? (
              <>
                {" "}
                <button
                  type="button"
                  className={styles.findings}
                  data-ask-findings
                  onClick={onFindings}
                >
                  {format("ask.findings", { n: activity.findings })}
                </button>
              </>
            ) : null}
          </p>
        ) : null}
      </div>
    </div>
  );
}
