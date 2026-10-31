"use client";

// The controls every screen after the opening shares (the lead's decisions 2 to 5, 30 Oct 2026): a breadcrumb with a
// back arrow at the top left (Esc goes back one level; the Siterra crumb returns to the opening), a quiet legend of
// the keys that work right now at the bottom right whose entries are themselves the buttons (Destiny's manner), the
// sources behind one of them (S) with one short line of the data's names always visible, and a small view control
// (reset, zoom out, zoom in) for screens with a 3D view. Words come from the catalog, colours from the theme tokens.

import { useEffect, useId, useRef, type ReactNode } from "react";
import { en, format } from "../../lib/copy/en";
import { Control, KeyChip } from "./Control";
import styles from "./ScreenChrome.module.css";

export interface Crumb {
  label: string;
  /** Moves to this level; none for the current one. */
  onSelect?: () => void;
}

/** "← Siterra / Aït Bouguemez valley / 24.7% greening": the back pill goes to the level above the last crumb. */
export function Breadcrumb({ crumbs, onBack }: { crumbs: Crumb[]; onBack: () => void }) {
  return (
    <nav className={styles.crumbs} aria-label={en["chrome.crumbs"].text} data-crumbs>
      <Control
        className={styles.back}
        keyHint="Esc"
        keyShortcut="Escape"
        aria-label={en["chrome.back"].text}
        onClick={onBack}
      >
        <span aria-hidden="true">←</span>
      </Control>
      <ol className={styles.trail}>
        {crumbs.map((c, i) => (
          <li key={`${String(i)}-${c.label}`} className={styles.crumb}>
            {i > 0 ? (
              <span className={styles.sep} aria-hidden="true">
                /
              </span>
            ) : null}
            {c.onSelect ? (
              <button type="button" className={styles.crumbButton} onClick={c.onSelect}>
                {c.label}
              </button>
            ) : (
              <span className={styles.here} aria-current="page">
                {c.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export interface KeyEntry {
  /** The key as drawn in its chip ("Esc", "R", "/", "S"). */
  chip: string;
  /** The aria-keyshortcuts value. */
  shortcut: string;
  label: string;
  onPress: () => void;
  pressed?: boolean;
}

/** The keys that work right now, each a button that does what its key does. */
export function KeyLegend({ entries, children }: { entries: KeyEntry[]; children?: ReactNode }) {
  return (
    <div className={styles.legendBlock}>
      {children}
      <ul className={styles.legend} aria-label={en["chrome.keys"].text} data-key-legend>
        {entries.map((e) => (
          <li key={e.chip}>
            <button
              type="button"
              className={styles.keyEntry}
              aria-keyshortcuts={e.shortcut}
              aria-pressed={e.pressed}
              onClick={e.onPress}
              data-key={e.chip}
            >
              <KeyChip>{e.chip}</KeyChip>
              <span>{e.label}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export interface SourceSet {
  /** Every credit and licence in full, in the order the screen's numbered chips cite them. */
  lines: string[];
  /** The data's short names for the one visible line ("Copernicus DEM", "ESA WorldCover"). */
  short: string[];
  /** The drawn relief's vertical exaggeration, said on the data line where land is drawn (decision 16). */
  relief?: number;
}

/** The one short line of the data's names, always visible. */
export function SourcesLine({ sources }: { sources: SourceSet }) {
  if (sources.short.length === 0) return null;
  return (
    <p className={styles.dataLine} data-sources-line>
      {format("chrome.data", { names: sources.short.join(", ") })}
      {sources.relief === undefined ? null : (
        <span className={styles.relief} data-relief>
          {format("chrome.relief", { value: sources.relief })}
        </span>
      )}
    </p>
  );
}

/** Every credit and licence in full, in a quiet panel above the legend; Esc or S closes it. */
export function SourcesPanel({
  sources,
  open,
  onClose,
  side = "right",
}: {
  sources: SourceSet;
  open: boolean;
  onClose: () => void;
  /** Which bottom corner it opens in: the right by default, the left when something on the right must stay read. */
  side?: "left" | "right";
}) {
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open) ref.current?.focus({ preventScroll: true });
  }, [open]);
  if (!open) return null;
  return (
    <div
      ref={ref}
      className={styles.panel}
      role="dialog"
      aria-labelledby={id}
      tabIndex={-1}
      data-sources-panel
      data-side={side}
    >
      <div className={styles.panelHead}>
        <h2 id={id} className={styles.panelTitle}>
          {en["chrome.sources"].text}
        </h2>
        <Control keyHint="Esc" keyShortcut="Escape" onClick={onClose}>
          {en["chrome.close"].text}
        </Control>
      </div>
      <ol className={styles.panelList}>
        {sources.lines.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ol>
    </div>
  );
}

/** Reset (R), zoom out and zoom in, for a screen with a 3D view. */
export function ViewControl({
  onReset,
  onZoom,
  besideAsk = false,
}: {
  onReset: () => void;
  /** A factor on the view's distance: below 1 closer. */
  onZoom: (factor: number) => void;
  /** Where the ask rests at the bottom centre (the instruments), the control sits just left of it. */
  besideAsk?: boolean;
}) {
  return (
    <div
      className={besideAsk ? `${styles.view} ${styles.besideAsk}` : styles.view}
      role="group"
      aria-label={en["chrome.view"].text}
      data-view-control
    >
      <Control keyHint="R" keyShortcut="R" onClick={onReset}>
        {en["chrome.reset"].text}
      </Control>
      <Control
        aria-label={en["chrome.zoomOut"].text}
        onClick={() => {
          onZoom(1.15);
        }}
      >
        <span aria-hidden="true">−</span>
      </Control>
      <Control
        aria-label={en["chrome.zoomIn"].text}
        onClick={() => {
          onZoom(1 / 1.15);
        }}
      >
        <span aria-hidden="true">+</span>
      </Control>
    </div>
  );
}

/** True while the visitor types in a field: screen keys then belong to the field. */
export function typing(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  return (
    e.altKey ||
    e.ctrlKey ||
    e.metaKey ||
    t?.tagName === "INPUT" ||
    t?.tagName === "TEXTAREA" ||
    t?.isContentEditable === true
  );
}

/** Where the Siterra crumb goes: the opening, even for a visitor who has been here. */
export const OPENING_HREF = "/?start";
