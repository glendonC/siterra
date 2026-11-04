"use client";

// The ask: the "/" key, or the key bar's "/ Ask" entry, opens a colourless fade rising from the bottom with the
// question typed in large light type under its label (CMP-05: a labeled line, no placeholder). Esc, its own "Esc
// Close" or a click anywhere outside its line closes it; that click does nothing else. Enter or its "Submit" hands the
// text to the page (the overview sends it; an instrument carries it to the overview). While the line is empty, up to
// two suggested questions stand on its left: the arrow keys pick one and Enter asks it; typing puts them away. The
// activity line shows only once the page passes one, after Enter.

import type { SuggestedQuestion } from "@siterra/contracts";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type Ref,
} from "react";
import { en, format } from "../../lib/copy/en";
import type { AskLine } from "../../lib/overview/ask-line";
import { KeyChip } from "../controls/Control";
import styles from "./Ask.module.css";

export interface AskProps {
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
  /** The activity line at the ask's resting place while the ask is closed (the overview places it). */
  besideRef?: Ref<HTMLParagraphElement>;
  /** Validated questions for the place, offered beside the empty line inside the open ask. */
  suggestions?: readonly SuggestedQuestion[] | undefined;
}

/** True when a key press belongs to a field the viewer is typing in. */
const typing = (t: EventTarget | null) =>
  t instanceof HTMLElement &&
  (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName));

/** The smallest font size a long question steps down to before it scrolls. */
const ASK_MIN_PX = 24;

/** CMP-05: up to two suggestions. */
const SUGGESTIONS_MAX = 2;

export function Ask({
  keysOff = false,
  open,
  onOpen,
  onClose,
  text,
  onText,
  onEnter,
  activity,
  onFindings,
  besideRef,
  suggestions,
}: AskProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const lineId = useId();
  const suggestedId = useId();
  // the suggestion the arrow keys or the pointer picked, lit alone; -1 is none, and Enter sends the line as typed
  const [pick, setPick] = useState(-1);
  const offered =
    open && text === "" && activity === null ? (suggestions ?? []).slice(0, SUGGESTIONS_MAX) : [];
  const picked = pick < offered.length ? pick : -1;

  const ask = (q: SuggestedQuestion) => {
    onText(q.question);
    onEnter(q.question);
  };

  // while the line is empty the arrow keys step through the suggestions and back to the line itself, and Enter asks
  // the one picked; the focus stays on the line
  const onLineKey = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    const n = offered.length;
    if (n === 0 || e.nativeEvent.isComposing) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : n;
      setPick(((picked + 1 + step) % (n + 1)) - 1);
    } else if (e.key === "Enter") {
      const q = offered[picked];
      if (!q) return;
      e.preventDefault();
      ask(q);
    }
  };

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
      if (ev.metaKey || ev.ctrlKey || ev.altKey || typing(ev.target)) return;
      if (ev.key !== "/") return;
      ev.preventDefault();
      onOpen();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [keysOff, open, onOpen, onClose]);

  // a press outside the line, its suggestions, its activity and its keys closes the ask, and the click it makes is
  // spent on that: it does not also act on the land or the view under the fade
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const shut = useRef({ open, keysOff });
  shut.current = { open, keysOff };
  useEffect(() => {
    let spent = false;
    const inside = (t: EventTarget | null) =>
      t instanceof Element &&
      (rootRef.current?.contains(t) ?? false) &&
      t.closest("form, [data-ask-suggestions], [data-ask-activity], [data-ask-keys]") !== null;
    const onDown = (e: PointerEvent) => {
      if (!shut.current.open || shut.current.keysOff || inside(e.target)) return;
      spent = true;
      closeRef.current();
    };
    const onClick = (e: MouseEvent) => {
      if (!spent) return;
      spent = false;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("click", onClick, true);
    };
  }, []);

  // open, the typing goes to the question; closed, the focus leaves it
  // a long question stays whole on its one line: the type steps down to fit the field, from 46 px to 24 px
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
    <div ref={rootRef} className={styles.ask} data-open={open ? "" : undefined} data-ask-overlay>
      <div className={styles.veil} aria-hidden="true" />
      <p
        ref={besideRef}
        className={styles.beside}
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
          <label className={styles.name} htmlFor={lineId}>
            {en["ask.label"].text}
          </label>
          <input
            ref={inputRef}
            id={lineId}
            className={styles.input}
            type="text"
            name="question"
            value={text}
            tabIndex={open ? 0 : -1}
            onChange={(e) => {
              setPick(-1);
              onText(e.target.value);
            }}
            onKeyDown={onLineKey}
            onBlur={() => {
              setPick(-1);
            }}
          />
        </form>
        {offered.length > 0 ? (
          <div className={styles.suggested} data-ask-suggestions>
            {/* a div, not a p: the text checks read a p with an id as the screen reader's key description */}
            <div className={styles.kicker} id={suggestedId}>
              {en["ask.suggested"].text}
            </div>
            {/* the arrow keys light a suggestion while the focus stays on the line: say which one */}
            <p className={styles.srOnly} aria-live="polite" data-ask-picked>
              {picked >= 0 ? (offered[picked]?.question ?? "") : ""}
            </p>
            <ul className={styles.suggestions} aria-labelledby={suggestedId}>
              {offered.map((q, i) => (
                <li key={q.id}>
                  <button
                    type="button"
                    className={styles.suggestion}
                    data-ask-suggestion={q.id}
                    data-selected={i === picked ? "" : undefined}
                    onPointerEnter={() => {
                      setPick(i);
                    }}
                    onClick={() => {
                      ask(q);
                    }}
                  >
                    {q.question}
                  </button>
                </li>
              ))}
            </ul>
          </div>
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
        {/* the keys that work while it is open, each also a button, drawn as the key bar draws its entries */}
        <div className={styles.keys} data-ask-keys>
          <button
            type="button"
            className={styles.keyEntry}
            tabIndex={open ? 0 : -1}
            aria-keyshortcuts="Enter"
            data-ask-key="Enter"
            onClick={() => {
              onEnter(text);
            }}
          >
            <KeyChip>↵</KeyChip>
            {en["ask.key.submit"].text}
          </button>
          <button
            type="button"
            className={styles.keyEntry}
            tabIndex={open ? 0 : -1}
            aria-keyshortcuts="Escape"
            data-ask-key="Escape"
            onClick={onClose}
          >
            <KeyChip>Esc</KeyChip>
            {en["ask.key.close"].text}
          </button>
        </div>
      </div>
    </div>
  );
}
