"use client";

// The briefing shell around one instrument: the instrument's own caption stays at the top left where its specimen
// puts it; the shell adds a quiet switcher between Valley, Layers, Cutaway and Pixel at the top right (the corner
// every specimen leaves empty) and the command line at the bottom centre, 480 x 44 at y 796 of the 1440 x 900
// design. Enter carries the typed text to the valley's command line and opens the valley; nothing is sent. The
// instruments inside read their specs from the case records the shell opens (InstrumentRecords).

import type { CaseSnapshot, InstrumentListing } from "@siterra/contracts";
import Link from "next/link";
import type { ReactNode, SubmitEvent } from "react";
import { en, type MessageId } from "../../lib/copy/en";
import { carryQuestion } from "../../lib/shell/handoff";
import { InstrumentRecords } from "./InstrumentRecords";
import styles from "./InstrumentShell.module.css";

export type InstrumentId = "layers" | "cutaway" | "pixel";

const VIEWS: { id: InstrumentId | "valley"; href: string; label: MessageId }[] = [
  { id: "valley", href: "/", label: "instrument.shell.valley" },
  { id: "layers", href: "/instruments/layers", label: "instrument.shell.layers" },
  { id: "cutaway", href: "/instruments/cutaway", label: "instrument.shell.cutaway" },
  { id: "pixel", href: "/instruments/pixel", label: "instrument.shell.pixel" },
];

/**
 * The command line as specimens A and B draw it: 480 x 44 CSS px, its bottom 60 px above the frame's (y 796 at the
 * 900 px design height), so the credit line under it keeps the specimens' gap.
 */
const COMMAND = { width: 480, bottom: 60 } as const;

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
  const onSubmit = (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    const text = new FormData(e.currentTarget).get("question");
    if (typeof text !== "string" || !text.trim()) return;
    carryQuestion(text);
    // a full load: the valley starts its own arrival and takes the question there
    window.location.assign("/");
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
      <form
        className={styles.command}
        style={COMMAND}
        onSubmit={onSubmit}
        autoComplete="off"
        data-command
      >
        <span className={styles.glyph} aria-hidden="true">
          /
        </span>
        <span className={styles.sep} aria-hidden="true" />
        <input
          className={styles.input}
          type="text"
          placeholder={en["instrument.shell.command"].text}
          aria-label={en["instrument.shell.command"].text}
          name="question"
        />
      </form>
    </div>
  );
}
