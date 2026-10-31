"use client";

// Object-anchored action prompts (the lead's decision 15, from contextual prompts such as Hitman 3's): pointing at or
// focusing a package item shows, beside it on a hairline leader, what can be done with it, at most three actions,
// each with its key chip and also clickable, Enter always the primary. The list is built only from what the item's
// record offers: its cited sources (Enter, Read the Source) and, when its record names a field check, the field plan
// (F). Reading a source opens its excerpts under the list; Esc closes them before it goes back.

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { pkg } from "../../lib/copy/package";
import type { PackageSource } from "../../lib/package/package";
import { en } from "../../lib/copy/en";
import { Control, ControlLink } from "../controls/Control";
import styles from "./ActionPrompt.module.css";

export interface PromptItem {
  key: string;
  chips: number[];
  /** The field plan view of the case, when the item's record names a field check it serves. */
  fieldPlanHref?: string | null;
}

interface Active extends PromptItem {
  rect: DOMRect;
}

export interface Binder {
  (item: PromptItem): {
    tabIndex: 0;
    "data-prompt-item": string;
    "data-active"?: "";
    onPointerEnter: (e: React.PointerEvent<HTMLElement>) => void;
    onPointerLeave: () => void;
    onFocus: (e: React.FocusEvent<HTMLElement>) => void;
    onBlur: () => void;
  };
}

const WIDTH = 280;
const GAP = 20;

function typing(e: KeyboardEvent): boolean {
  const el = e.target as HTMLElement | null;
  return !!el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
}

/** The prompt's state and the binder that makes an element a prompt item; `onBack` runs on Esc when nothing is open. */
export function usePrompt(
  sources: readonly PackageSource[],
  live: boolean,
  onBack: () => void,
  /** Opens a view in place over the same land; true when it did, so the link does not load. */
  onOpen?: (href: string) => boolean,
  /** Esc goes back when nothing is open here; false where the page around (the overview) already does. */
  escBack = true,
) {
  const [active, setActive] = useState<Active | null>(null);
  const [reading, setReading] = useState<string | null>(null);
  const leave = useRef<number | undefined>(undefined);

  const hold = useCallback(() => {
    window.clearTimeout(leave.current);
  }, []);
  const release = useCallback(() => {
    window.clearTimeout(leave.current);
    leave.current = window.setTimeout(() => {
      setActive(null);
      setReading(null);
    }, 280);
  }, []);
  const show = useCallback(
    (item: PromptItem, el: HTMLElement) => {
      hold();
      setActive((a) => {
        if (a?.key !== item.key) setReading(null);
        return { ...item, rect: el.getBoundingClientRect() };
      });
    },
    [hold],
  );

  const read = useCallback(() => {
    if (active && active.chips.length > 0)
      setReading((r) => (r === active.key ? null : active.key));
  }, [active]);

  useEffect(() => {
    if (!live) return;
    const onKey = (e: KeyboardEvent) => {
      if (typing(e) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Escape") {
        if (reading) {
          setReading(null);
          // the excerpts close first; the page around does not go back on the same press
          e.stopImmediatePropagation();
        } else if (escBack) onBack();
        else return;
        e.preventDefault();
      } else if (e.key === "Enter" && active) {
        read();
        e.preventDefault();
      } else if ((e.key === "f" || e.key === "F") && active?.fieldPlanHref) {
        if (!onOpen?.(active.fieldPlanHref)) window.location.assign(active.fieldPlanHref);
        e.preventDefault();
      }
    };
    // in the capture phase, so an Esc that closes the excerpts is not also the page's Esc
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
    };
  }, [live, active, reading, read, onBack, onOpen, escBack]);

  const bind: Binder = (item) => ({
    tabIndex: 0,
    "data-prompt-item": item.key,
    ...(active?.key === item.key ? { "data-active": "" as const } : {}),
    onPointerEnter: (e) => {
      show(item, e.currentTarget);
    },
    onPointerLeave: release,
    onFocus: (e) => {
      show(item, e.currentTarget);
    },
    onBlur: release,
  });

  const offers = active !== null && (active.chips.length > 0 || Boolean(active.fieldPlanHref));
  const layer: ReactNode =
    active && offers ? (
      <PromptLayer
        active={active}
        reading={reading === active.key}
        sources={sources}
        onRead={read}
        onBack={onBack}
        onOpen={onOpen}
        onHold={hold}
        onRelease={release}
      />
    ) : null;
  return { bind, layer, activeKey: active?.key ?? null };
}

function PromptLayer({
  active,
  reading,
  sources,
  onRead,
  onBack,
  onOpen,
  onHold,
  onRelease,
}: {
  active: Active;
  reading: boolean;
  sources: readonly PackageSource[];
  onRead: () => void;
  onBack: () => void;
  onOpen: ((href: string) => boolean) | undefined;
  onHold: () => void;
  onRelease: () => void;
}) {
  const r = active.rect;
  const vw = window.innerWidth;
  const right = r.right + GAP + WIDTH <= vw - 24;
  const x = right ? r.right + GAP : r.left - GAP - WIDTH;
  const y = Math.max(24, r.top - 2);
  const from = { x: right ? r.right + 4 : r.left - 4, y: r.top + 10 };
  const to = { x: right ? x : x + WIDTH, y: y + 14 };
  const cited = active.chips.flatMap((n) => sources.filter((s) => s.n === n));
  return (
    <div className={styles.layer} data-action-prompt="">
      <svg className={styles.leader} aria-hidden="true">
        <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} pathLength={1} />
      </svg>
      <div
        className={styles.prompt}
        data-side={right ? "right" : "left"}
        style={{ left: x, top: y, width: WIDTH }}
        role="group"
        aria-label={pkg["prompt.label"].text}
        onPointerEnter={onHold}
        onPointerLeave={onRelease}
      >
        <div className={styles.row}>
          {active.chips.length > 0 ? (
            <Control variant="primary" keyHint="Enter" keyShortcut="Enter" onClick={onRead}>
              {pkg["prompt.read"].text}
            </Control>
          ) : null}
          {active.fieldPlanHref ? (
            <ControlLink
              href={active.fieldPlanHref}
              keyHint="F"
              aria-keyshortcuts="F"
              onClick={(e) => {
                if (active.fieldPlanHref && onOpen?.(active.fieldPlanHref)) e.preventDefault();
              }}
            >
              {en["overview.open.field"].text}
            </ControlLink>
          ) : null}
          <Control variant="quiet" keyHint="Esc" keyShortcut="Escape" onClick={onBack}>
            {en["chrome.back"].text}
          </Control>
        </div>
        {reading ? (
          <ol className={styles.reading}>
            {cited.map((s) => (
              <li key={s.n}>
                <span className={styles.n}>{s.n}</span>
                <span>{s.note}</span>
              </li>
            ))}
          </ol>
        ) : null}
      </div>
    </div>
  );
}
