"use client";

// The briefing shell around one instrument: the instrument's own caption stays at the top left where its specimen
// puts it; the shell adds a quiet switcher between Valley, Layers, Cutaway, Pixel, Rainfall and Field plan at the top
// right (the corner every specimen leaves empty) and the ask (approved specimen D4) resting at the bottom centre, in
// the band the command line kept clear (y 796 to 840 of the 1440 x 900 design). The ask's circle or "/" opens it;
// Enter carries the typed text to the overview at /valley, which opens its ask with the text in it; nothing is sent.
// The instruments inside read their specs from the case records the shell opens (InstrumentRecords).

import type { CaseSnapshot, InstrumentListing } from "@siterra/contracts";
import Link from "next/link";
import { useCallback, useState, type ReactNode } from "react";
import { en, type MessageId } from "../../lib/copy/en";
import { carryQuestion } from "../../lib/shell/handoff";
import { Ask } from "../overview/Ask";
import { InstrumentRecords } from "./InstrumentRecords";
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
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const onOpen = useCallback(() => {
    setOpen(true);
  }, []);
  const onClose = useCallback(() => {
    setOpen(false);
  }, []);
  const onEnter = (typed: string) => {
    if (!typed.trim()) return;
    carryQuestion(typed);
    // a full load: the overview opens its ask with the question in it
    window.location.assign("/valley");
  };
  return (
    <div className={styles.shell} data-theme="obsidian" data-shell={current}>
      <InstrumentRecords records={records}>{children}</InstrumentRecords>
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
      <Ask
        variant="rest"
        open={open}
        onOpen={onOpen}
        onClose={onClose}
        text={text}
        onText={setText}
        onEnter={onEnter}
        activity={null}
      />
    </div>
  );
}
