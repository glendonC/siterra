"use client";

// Shared screen controls across the overview and instruments: top-left breadcrumb navigation,
// bottom-right contextual key legend, the globe's credits drawer (S), and 3D camera reset/zoom controls. The case's
// sources and limits (S and W) are one overlay of their own (SourcesOverlay.tsx). All user-facing copy comes from the
// message catalog.

import { useEffect, useId, useRef, type ReactNode } from "react";
import { en, format } from "../../lib/copy/en";
import { Control, KeyChip } from "./Control";
import styles from "./ScreenChrome.module.css";

export interface Crumb {
  label: string;
  /** Moves to this level; none for the current one. */
  onSelect?: () => void;
}

/**
 * "Aït Bouguemez valley / Findings / Elevation Bands": the trail starts at the place on every screen, and each parent
 * crumb goes back to its level.
 */
export function Breadcrumb({ crumbs }: { crumbs: Crumb[] }) {
  return (
    <nav className={styles.crumbs} aria-label={en["chrome.crumbs"].text} data-crumbs>
      <ol className={styles.trail}>
        {crumbs.map((c, i) => (
          <li
            key={`${String(i)}-${c.label}`}
            className={styles.crumb}
            data-place-crumb={i === 0 ? "" : undefined}
          >
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
  /** A data attribute the entry's button carries (for an action that kept its marker when it moved into the bar). */
  marker?: string;
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
              {...(e.marker ? { [e.marker]: "" } : {})}
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
  /** The data's short names ("Copernicus DEM", "ESA WorldCover"), as tags over the globe's credits. */
  short: string[];
  /** Vertical terrain exaggeration factor shown with the dataset credits where 3D relief is drawn. */
  relief?: number;
}

function classifySourceLine(line: string): { category: string; url?: string } {
  const low = line.toLowerCase();
  if (low.includes("mod13q1") || (low.includes("modis") && !low.includes("mod10a1"))) {
    return {
      category: "Satellite Vegetation",
      url: "https://lpdaac.usgs.gov/products/mod13q1v061/",
    };
  }
  if (low.includes("mod10a1") || low.includes("nsidc")) {
    return {
      category: "Snow Cover",
      url: "https://nsidc.org/data/mod10a1/versions/61",
    };
  }
  if (low.includes("chirps")) {
    return {
      category: "Climate & Rainfall",
      url: "https://www.chc.ucsb.edu/data/chirps",
    };
  }
  if (low.includes("worldcover")) {
    return {
      category: "Land Cover · 10 m",
      url: "https://esa-worldcover.org/",
    };
  }
  if (low.includes("sentinel")) {
    return {
      category: "Optical Imagery · 10 m",
      url: "https://dataspace.copernicus.eu/",
    };
  }
  if (
    low.includes("worlddem") ||
    low.includes("copernicus dem") ||
    low.includes("glo-30") ||
    low.includes("glo-90") ||
    low.includes("terrarium") ||
    low.includes("elevation")
  ) {
    return {
      category: "Elevation & Relief",
      url: "https://spacedata.copernicus.eu/collections/copernicus-digital-elevation-model",
    };
  }
  if (low.includes("era5") || low.includes("open-meteo")) {
    return {
      category: "Climate Reanalysis",
      url: "https://open-meteo.com/en/docs/historical-weather-api",
    };
  }
  if (low.includes("geonames")) {
    return {
      category: "Place Gazetteer",
      url: "https://www.geonames.org/",
    };
  }
  if (low.includes("openstreetmap") || low.includes("overpass")) {
    return {
      category: "Hydrography & Paths",
      url: "https://www.openstreetmap.org/copyright",
    };
  }
  if (low.includes("gbif")) {
    return {
      category: "Biodiversity Records",
      url: "https://www.gbif.org/",
    };
  }
  if (low.includes("resolve") || low.includes("ecoregions")) {
    return {
      category: "Biome Extent",
      url: "https://ecoregions.appspot.com/",
    };
  }
  return { category: "Published Literature" };
}

/**
 * The globe's credits and licences in full (components/journey/Journey.tsx), in a drawer; Esc or S closes it. A case's
 * screens show its sources and limits from the record instead (SourcesOverlay.tsx).
 */
export function SourcesPanel({
  sources,
  open,
  onClose,
  side = "right",
}: {
  /** With `relief`, the drawn relief's exaggeration is stated alongside the credits. */
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
        <div className={styles.panelTitleGroup}>
          <h2 id={id} className={styles.panelTitle}>
            {en["chrome.sources"].text}
          </h2>
        </div>
        <Control keyHint="Esc" keyShortcut="Escape" onClick={onClose}>
          {en["chrome.close"].text}
        </Control>
      </div>
      {sources.short.length > 0 ? (
        <div className={styles.panelShortTags} aria-hidden="true">
          {sources.short.map((name) => (
            <span key={name} className={styles.panelShortTag}>
              {name}
            </span>
          ))}
        </div>
      ) : null}
      <ol className={styles.panelList}>
        {sources.lines.map((l, idx) => {
          const meta = classifySourceLine(l);
          return (
            <li key={l} className={styles.panelItem}>
              <div className={styles.panelItemTop}>
                <span className={styles.panelItemIndex}>{String(idx + 1).padStart(2, "0")}</span>
                <span className={styles.panelItemCategory}>{meta.category}</span>
                {meta.url ? (
                  <a
                    href={meta.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.panelItemLink}
                    aria-label={`Open ${meta.category} reference`}
                  >
                    <span>{"Reference"}</span>
                    <svg width="9" height="9" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                      <path
                        d="M2.5 7.5L7.5 2.5M7.5 2.5H3.5M7.5 2.5V6.5"
                        stroke="currentColor"
                        strokeWidth="1.3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </a>
                ) : null}
              </div>
              <span className={styles.panelItemText}>{l}</span>
            </li>
          );
        })}
      </ol>
      {sources.relief === undefined ? null : (
        <p className={styles.panelNote} data-relief>
          {format("chrome.relief.note", { value: sources.relief })}
        </p>
      )}
    </div>
  );
}

/** Reset (R), zoom out and zoom in, for a screen with a 3D view. */
export function ViewControl({
  onReset,
  onZoom,
}: {
  onReset: () => void;
  /** A factor on the view's distance: below 1 closer. */
  onZoom: (factor: number) => void;
}) {
  return (
    <div className={styles.view} role="group" aria-label={en["chrome.view"].text} data-view-control>
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
