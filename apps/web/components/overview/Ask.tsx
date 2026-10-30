"use client";

// The ask (approved specimen D4): a matte slate-teal circle with a small light label and a thin circled plus, no glow
// and no outline. The circle or the "/" key opens a colourless fade rising from the bottom with the question typed in
// large light type; Esc closes it. Enter hands the text to the page (the overview sends it; an instrument carries it
// to the overview). The activity line shows only once the page passes one, after Enter.

import { useEffect, useRef, type CSSProperties, type Ref } from "react";
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
}

/** True when a key press belongs to a field the viewer is typing in. */
const typing = (t: EventTarget | null) =>
  t instanceof HTMLElement &&
  (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName));

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
}: AskProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  // "/" opens the ask from anywhere but a field being typed in
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
      if (ev.key !== "/" || ev.metaKey || ev.ctrlKey || ev.altKey || typing(ev.target)) return;
      ev.preventDefault();
      onOpen();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [keysOff, open, onOpen, onClose]);

  // open, the typing goes to the question; closed, the focus leaves it
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
            tabIndex={open ? 0 : -1}
            aria-label={en["instrument.shell.command"].text}
            onChange={(e) => {
              onText(e.target.value);
            }}
          />
        </form>
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
