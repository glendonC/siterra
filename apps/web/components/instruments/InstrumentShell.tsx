"use client";

// The briefing shell around one instrument: the breadcrumb at the top left as on the overview, starting at the place
// ("Aït Bouguemez valley / Findings / Elevation Bands"; Esc and each parent crumb go back to the overview), the theme
// toggle at the top right where the answer has it, the instrument below them in its own stage area, the keys that work
// now at the bottom right in the answer's order (Esc Back last) with the case's sources behind S and its limits behind
// W (one overlay, components/controls/SourcesOverlay.tsx), and a view control (reset R, zoom) for the 3D instruments.
// "/" or the key bar's "/ Ask" opens the ask as the overview opens it, with the same suggested questions; Enter carries
// the typed text to the overview at /valley; nothing is sent from here.

import type { CaseSnapshot, InstrumentListing } from "@siterra/contracts";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";
import { en } from "../../lib/copy/en";
import { VIEW_LABEL } from "../../lib/overview/actions";
import { placeNamesFromCase } from "../../lib/projection/arrival";
import { carryQuestion } from "../../lib/shell/handoff";
import { THEME_KEY, savedTheme, themeOf, type AppTheme } from "../../lib/theme/instruments";
import {
  Breadcrumb,
  KeyLegend,
  ViewControl,
  typing,
  type KeyEntry,
  type SourceSet,
} from "../controls/ScreenChrome";
import { SourcesOverlay, type SourcesTab } from "../controls/SourcesOverlay";
import { ThemeIcon } from "../opening/Opening";
import { Ask } from "../overview/Ask";
import { InstrumentRecords, useInstrumentRecords } from "./InstrumentRecords";
import { ShellContext, ShellTheme, type ViewHandle } from "./ShellContext";
import styles from "./InstrumentShell.module.css";

export type InstrumentId = "layers" | "cutaway" | "pixel" | "rainfall" | "field";

/**
 * The app's theme for the shell: inside the overview (a view opened in place) the overview's own, followed as it
 * changes; on a view's own address the visitor's saved choice, as the overview reads it. Daylight until it is read.
 * The toggle hands the change to the overview where it was given one, else switches here and saves the choice.
 */
function useAppTheme(
  ref: RefObject<HTMLElement | null>,
  onToggle: (() => void) | undefined,
): [AppTheme, () => void] {
  const [theme, setTheme] = useState<AppTheme>("light");
  const [own, setOwn] = useState<AppTheme | null>(null);
  // before the first paint, so a view opened over a dark overview never shows a light frame
  useLayoutEffect(() => {
    const host = ref.current?.parentElement?.closest("[data-theme]") ?? null;
    const read = () => {
      setTheme(host ? themeOf(host.getAttribute("data-theme")) : savedTheme());
      setOwn(null);
    };
    read();
    if (!host) return;
    const watch = new MutationObserver(read);
    watch.observe(host, { attributes: true, attributeFilter: ["data-theme"] });
    return () => {
      watch.disconnect();
    };
  }, [ref]);
  const shown = own ?? theme;
  const toggle = useCallback(() => {
    if (onToggle) {
      onToggle();
      return;
    }
    const next: AppTheme = shown === "obsidian" ? "light" : "obsidian";
    setOwn(next);
    try {
      window.localStorage.setItem(THEME_KEY, next);
    } catch {
      // a browser that keeps nothing still shows the switch for this visit
    }
  }, [onToggle, shown]);
  return [shown, toggle];
}

// a full load; the way back to the overview keeps the address's query (the place, ?case=), so it opens the same place
const go = (href: string) => {
  window.location.assign(href === "/valley" ? href + window.location.search : href);
};

export function InstrumentShell({
  current,
  records,
  onBack,
  tearing,
  finding,
  onToggleTheme,
  children,
}: {
  current: InstrumentId;
  /** Records to draw instead of the case the shell would open (the lane's preview). */
  records?: { snapshot: CaseSnapshot; listing: InstrumentListing };
  /**
   * Back to the valley without a page load: the overview opened this instrument in place and plays
   * the land back together; without it, back loads the valley.
   */
  onBack?: () => void;
  /** True while the land is being taken apart or put back: the shell's chrome waits, and no key but Esc acts. */
  tearing?: boolean;
  /** The crumb of the overview level the view was opened from (its crumb plays the view back to it). */
  finding?: string;
  /** The overview's own theme switch, where it opened this view in place. */
  onToggleTheme?: () => void;
  children: ReactNode;
}) {
  const [sources, setSources] = useState<SourceSet | null>(null);
  const [view, setView] = useState<ViewHandle | null>(null);
  const slots = useMemo(() => ({ setSources, setView }), []);
  const ref = useRef<HTMLDivElement>(null);
  const [theme, toggleTheme] = useAppTheme(ref, onToggleTheme);
  return (
    <div
      ref={ref}
      className={styles.shell}
      data-theme={theme}
      data-shell={current}
      data-tearing={tearing ? "" : undefined}
    >
      <ShellTheme.Provider value={theme}>
        <ShellContext.Provider value={slots}>
          <InstrumentRecords records={records}>
            <div className={styles.stage}>{children}</div>
            <button
              type="button"
              className={styles.themeButton}
              onClick={toggleTheme}
              aria-label={
                en[theme === "obsidian" ? "chrome.theme.light" : "chrome.theme.dark"].text
              }
              title={en[theme === "obsidian" ? "chrome.theme.light" : "chrome.theme.dark"].text}
              data-theme-toggle
            >
              <ThemeIcon theme={theme} />
            </button>
            <ShellChrome
              current={current}
              sources={sources}
              view={view}
              onBack={onBack}
              tearing={tearing ?? false}
              finding={finding ?? null}
            />
          </InstrumentRecords>
        </ShellContext.Provider>
      </ShellTheme.Provider>
    </div>
  );
}

function ShellChrome({
  current,
  sources,
  view,
  onBack,
  tearing,
  finding,
}: {
  current: InstrumentId;
  sources: SourceSet | null;
  view: ViewHandle | null;
  onBack: (() => void) | undefined;
  tearing: boolean;
  finding: string | null;
}) {
  const records = useInstrumentRecords();
  const valley =
    records.status === "ready" ? placeNamesFromCase(records.snapshot).valleyName : null;
  // the open ask stands in the 1440 x 900 design scaled to the window, as on the overview: its suggestions and keys
  // keep to the screen's own margins through the same frame variables
  const [fit, setFit] = useState({ s: 1, ox: 0, oy: 0 });
  useEffect(() => {
    const onResize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const s = Math.min(w / 1440, h / 900);
      setFit({ s, ox: (w - 1440 * s) / 2, oy: (h - 900 * s) / 2 });
    };
    onResize();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
    };
  }, []);
  const [askOpen, setAskOpen] = useState(false);
  const [text, setText] = useState("");
  // the sources and limits overlay and its open tab, from the case record once it is read
  const [sheet, setSheet] = useState<SourcesTab | null>(null);
  const snapshot = records.status === "ready" ? records.snapshot : null;
  const closeSheet = useCallback(() => {
    setSheet(null);
  }, []);
  const onOpen = useCallback(() => {
    setAskOpen(true);
  }, []);
  const onClose = useCallback(() => {
    setAskOpen(false);
  }, []);
  const onEnter = (typed: string) => {
    if (!typed.trim()) return;
    carryQuestion(typed);
    // a full load: the overview opens its ask with the question in it
    go("/valley");
  };
  const back = useCallback(() => {
    if (onBack) onBack();
    else go("/valley");
  }, [onBack]);
  const reset = useCallback(() => {
    view?.reset();
  }, [view]);

  // the screen's keys: Esc back one level, R reset the 3D view, S the sources and W the limits; while the overlay is
  // open it has the keys itself (Esc closes it first). S or W pressed before the record is read opens it once it is.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (askOpen || typing(e)) return;
      // while the land is taken apart or put back only Esc acts (it plays the land back)
      if (tearing && e.key !== "Escape") return;
      if (e.key === "Escape") {
        e.preventDefault();
        if (sheet) setSheet(null);
        else back();
      } else if ((e.key === "r" || e.key === "R") && view) {
        e.preventDefault();
        reset();
      } else if (e.key === "s" || e.key === "S") {
        e.preventDefault();
        setSheet("sources");
      } else if (e.key === "w" || e.key === "W") {
        e.preventDefault();
        setSheet("limits");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [askOpen, view, sheet, back, reset, tearing]);

  // the answer's order, Esc Back last; "chrome.key.reset" is shown in ViewControl rather than duplicated here
  const entries: KeyEntry[] = [
    { chip: "/", shortcut: "/", label: en["chrome.key.ask"].text, onPress: onOpen },
    ...(snapshot
      ? [
          {
            chip: "S",
            shortcut: "S",
            label: en["chrome.key.sources"].text,
            onPress: () => {
              setSheet((t) => (t === "sources" ? null : "sources"));
            },
            pressed: sheet === "sources",
          },
          {
            chip: "W",
            shortcut: "W",
            label: en["chrome.key.scope"].text,
            onPress: () => {
              setSheet((t) => (t === "limits" ? null : "limits"));
            },
            pressed: sheet === "limits",
          },
        ]
      : []),
    { chip: "Esc", shortcut: "Escape", label: en["chrome.key.back"].text, onPress: back },
  ];
  // the overview's suggested questions for the place, less the case's own question
  const suggestions =
    records.status === "ready"
      ? (records.listing.suggestedQuestions ?? []).filter(
          (q) =>
            q.question.trim().toLowerCase() !==
            records.snapshot.case.objective.trim().toLowerCase(),
        )
      : undefined;

  // the frame variables the ask reads to keep its suggestions and keys on the screen's margins (Ask.module.css)
  const frame = {
    transform: `translate(${fit.ox.toFixed(1)}px, ${fit.oy.toFixed(1)}px) scale(${fit.s.toFixed(5)})`,
    "--hud-scale": fit.s.toFixed(5),
    "--hud-shift-x": `${(fit.ox / fit.s).toFixed(2)}px`,
    "--hud-shift-y": `${(fit.oy / fit.s).toFixed(2)}px`,
  } as CSSProperties;

  return (
    <>
      {/* the trail waits for the place's name, so it does not shift once the record is read */}
      {records.status === "opening" ? null : (
        <Breadcrumb
          crumbs={[
            ...(valley ? [{ label: valley, onSelect: back }] : []),
            // the level the view was opened from; a view loaded by its own address goes back to the place's findings
            { label: finding ?? en["overview.crumb.results"].text, onSelect: back },
            { label: en[VIEW_LABEL[current]].text },
          ]}
        />
      )}
      {view ? <ViewControl onReset={reset} onZoom={view.zoomBy} /> : null}
      <KeyLegend entries={entries} />
      {snapshot ? (
        <SourcesOverlay
          snapshot={snapshot}
          tab={sheet}
          onTab={setSheet}
          onClose={closeSheet}
          relief={sources?.relief}
        />
      ) : null}
      <div className={styles.askPlace} style={frame}>
        <Ask
          keysOff={tearing}
          open={askOpen}
          onOpen={onOpen}
          onClose={onClose}
          text={text}
          onText={setText}
          onEnter={onEnter}
          activity={null}
          suggestions={suggestions}
        />
      </div>
    </>
  );
}
