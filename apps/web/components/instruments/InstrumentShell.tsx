"use client";

// The briefing shell around one instrument (the lead's decisions 1 to 5, 30 Oct 2026): a breadcrumb with a back arrow
// at the top left ("Siterra / Aït Bouguemez valley / Cutaway"; Esc goes back to the valley, the Siterra crumb to the
// opening), the quiet switcher between the views at the top right, the instrument below them in its own stage area,
// the ask resting at the bottom centre, the keys that work now at the bottom right with the instrument's sources
// behind S and one short line of the data's names, and a view control (reset R, zoom) for the 3D instruments. The ask's
// circle or "/" opens it; Enter carries the typed text to the overview at /valley; nothing is sent from here.

import type { CaseSnapshot, InstrumentListing } from "@siterra/contracts";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { en, type MessageId } from "../../lib/copy/en";
import { ASK_AT } from "../../lib/overview/arc";
import { placeNamesFromCase } from "../../lib/projection/arrival";
import { carryQuestion } from "../../lib/shell/handoff";
import {
  Breadcrumb,
  ModeLine,
  KeyLegend,
  OPENING_HREF,
  SourcesLine,
  SourcesPanel,
  ViewControl,
  typing,
  type KeyEntry,
  type SourceSet,
} from "../controls/ScreenChrome";
import { Ask } from "../overview/Ask";
import { InstrumentRecords, useInstrumentRecords } from "./InstrumentRecords";
import { ShellContext, type ViewHandle } from "./ShellContext";
import styles from "./InstrumentShell.module.css";

export type InstrumentId = "layers" | "cutaway" | "pixel" | "rainfall" | "field";

/** Each view's name in the breadcrumb (decision 13: no list of views; the visitor reaches them through the findings). */
const VIEW_NAME: Record<InstrumentId, MessageId> = {
  layers: "instrument.shell.layers",
  cutaway: "instrument.shell.cutaway",
  pixel: "instrument.shell.pixel",
  rainfall: "instrument.shell.rainfall",
  field: "instrument.shell.field",
};

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
  children,
}: {
  current: InstrumentId;
  /** Records to draw instead of the case the shell would open (the lane's preview). */
  records?: { snapshot: CaseSnapshot; listing: InstrumentListing };
  /**
   * Back to the valley without a page load: the overview opened this instrument in place (decision 12) and plays
   * the land back together; without it, back loads the valley.
   */
  onBack?: () => void;
  /** True while the land is being taken apart or put back: the shell's chrome waits, and no key but Esc acts. */
  tearing?: boolean;
  /** The finding the view was opened from (its crumb plays the view back to that finding's record). */
  finding?: string;
  children: ReactNode;
}) {
  const [sources, setSources] = useState<SourceSet | null>(null);
  const [view, setView] = useState<ViewHandle | null>(null);
  const slots = useMemo(() => ({ setSources, setView }), []);
  return (
    <div
      className={styles.shell}
      data-theme="obsidian"
      data-shell={current}
      data-tearing={tearing ? "" : undefined}
    >
      <ShellContext.Provider value={slots}>
        <InstrumentRecords records={records}>
          <div className={styles.stage}>{children}</div>
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
  const label = VIEW_NAME[current];
  const question = records.status === "ready" ? records.snapshot.case.objective : null;
  // the ask disc rests where the overview's rests, on the arc's start, scaled with the 1440 x 900 design
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
  const [panel, setPanel] = useState(false);
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

  // the screen's keys: Esc back one level (after the panel), R reset the 3D view, S the sources
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (askOpen || typing(e)) return;
      // while the land is taken apart or put back only Esc acts (it plays the land back)
      if (tearing && e.key !== "Escape") return;
      if (e.key === "Escape") {
        e.preventDefault();
        if (panel) setPanel(false);
        else back();
      } else if ((e.key === "r" || e.key === "R") && view) {
        e.preventDefault();
        reset();
      } else if ((e.key === "s" || e.key === "S") && sources) {
        e.preventDefault();
        setPanel((p) => !p);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [askOpen, panel, view, sources, back, reset, tearing]);

  const entries: KeyEntry[] = [
    { chip: "Esc", shortcut: "Escape", label: en["chrome.key.back"].text, onPress: back },
    ...(view
      ? [{ chip: "R", shortcut: "R", label: en["chrome.key.reset"].text, onPress: reset }]
      : []),
    { chip: "/", shortcut: "/", label: en["chrome.key.ask"].text, onPress: onOpen },
    ...(sources
      ? [
          {
            chip: "S",
            shortcut: "S",
            label: en["chrome.key.sources"].text,
            onPress: () => {
              setPanel((p) => !p);
            },
            pressed: panel,
          },
        ]
      : []),
  ];

  return (
    <>
      {records.status === "ready" ? <ModeLine mode={records.snapshot.case.mode} /> : null}
      <Breadcrumb
        onBack={back}
        crumbs={[
          {
            label: en["opening.title"].text,
            onSelect: () => {
              go(OPENING_HREF);
            },
          },
          ...(valley ? [{ label: valley, onSelect: back }] : []),
          ...(finding ? [{ label: finding, onSelect: back }] : []),
          { label: en[label].text },
        ]}
      />
      {question ? (
        <p className={styles.question} data-case-question>
          {question}
        </p>
      ) : null}
      {view ? <ViewControl onReset={reset} onZoom={view.zoomBy} /> : null}
      <KeyLegend entries={entries}>{sources ? <SourcesLine sources={sources} /> : null}</KeyLegend>
      {sources ? (
        <SourcesPanel
          sources={sources}
          open={panel}
          onClose={() => {
            setPanel(false);
          }}
        />
      ) : null}
      <div
        className={styles.askPlace}
        style={{
          transform: `translate(${fit.ox.toFixed(1)}px, ${fit.oy.toFixed(1)}px) scale(${fit.s.toFixed(5)})`,
        }}
      >
        <Ask
          variant="arc"
          circleStyle={{ left: `${ASK_AT.x.toFixed(1)}px`, top: `${ASK_AT.y.toFixed(1)}px` }}
          open={askOpen}
          onOpen={onOpen}
          onClose={onClose}
          text={text}
          onText={setText}
          onEnter={onEnter}
          activity={null}
        />
      </div>
    </>
  );
}
