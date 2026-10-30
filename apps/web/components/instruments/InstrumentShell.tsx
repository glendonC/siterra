"use client";

// The briefing shell around one instrument (the lead's decisions 1 to 5, 30 Oct 2026): a breadcrumb with a back arrow
// at the top left ("Siterra / Aït Bouguemez valley / Cutaway"; Esc goes back to the valley, the Siterra crumb to the
// opening), the quiet switcher between the views at the top right, the instrument below them in its own stage area,
// the ask resting at the bottom centre, the keys that work now at the bottom right with the instrument's sources
// behind S and one short line of the data's names, and a view control (reset R, zoom) for the 3D instruments. The ask's
// circle or "/" opens it; Enter carries the typed text to the overview at /valley; nothing is sent from here.

import type { CaseSnapshot, InstrumentListing } from "@siterra/contracts";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { en, type MessageId } from "../../lib/copy/en";
import { placeNamesFromCase } from "../../lib/projection/arrival";
import { carryQuestion } from "../../lib/shell/handoff";
import {
  Breadcrumb,
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

const VIEWS: { id: InstrumentId | "valley"; href: string; label: MessageId }[] = [
  { id: "valley", href: "/valley", label: "instrument.shell.valley" },
  { id: "layers", href: "/instruments/layers", label: "instrument.shell.layers" },
  { id: "cutaway", href: "/instruments/cutaway", label: "instrument.shell.cutaway" },
  { id: "pixel", href: "/instruments/pixel", label: "instrument.shell.pixel" },
  { id: "rainfall", href: "/instruments/rainfall", label: "instrument.shell.rainfall" },
  { id: "field", href: "/instruments/field", label: "instrument.shell.field" },
];

const go = (href: string) => {
  window.location.assign(href);
};

export function InstrumentShell({
  current,
  records,
  children,
}: {
  current: InstrumentId;
  /** Records to draw instead of the case the shell would open (the lane's preview). */
  records?: { snapshot: CaseSnapshot; listing: InstrumentListing };
  children: ReactNode;
}) {
  const [sources, setSources] = useState<SourceSet | null>(null);
  const [view, setView] = useState<ViewHandle | null>(null);
  const slots = useMemo(() => ({ setSources, setView }), []);
  return (
    <div className={styles.shell} data-theme="obsidian" data-shell={current}>
      <ShellContext.Provider value={slots}>
        <InstrumentRecords records={records}>
          <div className={styles.stage}>{children}</div>
          <ShellChrome current={current} sources={sources} view={view} />
        </InstrumentRecords>
      </ShellContext.Provider>
    </div>
  );
}

function ShellChrome({
  current,
  sources,
  view,
}: {
  current: InstrumentId;
  sources: SourceSet | null;
  view: ViewHandle | null;
}) {
  const records = useInstrumentRecords();
  const valley =
    records.status === "ready" ? placeNamesFromCase(records.snapshot).valleyName : null;
  const label = VIEWS.find((v) => v.id === current)?.label ?? "instrument.shell.valley";
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
    go("/valley");
  }, []);
  const reset = useCallback(() => {
    view?.reset();
  }, [view]);

  // the screen's keys: Esc back one level (after the panel), R reset the 3D view, S the sources
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (askOpen || typing(e)) return;
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
  }, [askOpen, panel, view, sources, back, reset]);

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
          { label: en[label].text },
        ]}
      />
      <nav className={styles.switcher} aria-label={en["instrument.shell.nav"].text}>
        {VIEWS.map((v) => (
          <Link
            key={v.id}
            href={v.href}
            className={styles.view}
            aria-current={v.id === current ? "page" : undefined}
          >
            {en[v.label].text}
          </Link>
        ))}
      </nav>
      {view ? <ViewControl onReset={reset} onZoom={view.zoomBy} besideAsk /> : null}
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
      <Ask
        variant="rest"
        open={askOpen}
        onOpen={onOpen}
        onClose={onClose}
        text={text}
        onText={setText}
        onEnter={onEnter}
        activity={null}
      />
    </>
  );
}
