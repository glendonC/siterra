"use client";

// Sources and notices: the data credits and the credits of the points on the land, both from the case record,
// the map and imagery notices, and the font
// licences shipped with the app, and the switch for single-key shortcuts. A native modal dialog, closed with
// Esc, as Read flat is.

import { useEffect, useRef } from "react";
import { en, type MessageId } from "../../lib/copy/en";
import type { PlaceCredit } from "../../lib/projection/places";
import styles from "./Notices.module.css";

/** Display notices for what the map draws that is not a case record, each with its source page. */
const RELIEF_NOTICE: { id: MessageId; href?: string } = {
  id: "notice.relief",
  href: "https://mapterhorn.com/attribution/",
};
const IMAGERY_NOTICE: { id: MessageId; href?: string } = { id: "notice.imagery" };

const FONT_LICENCES: { id: MessageId; href: string }[] = [
  { id: "notice.fontSans", href: "/fonts/LICENSE-IBM-Plex-Sans.txt" },
  { id: "notice.fontMono", href: "/fonts/LICENSE-IBM-Plex-Mono.txt" },
];

export interface NoticesProps {
  open: boolean;
  /** Credits from the case record (dataCredits). */
  dataCredits: string[];
  /** Credits of the points on the land, from their ContextFeature records (contextLand). */
  placeCredits: PlaceCredit[];
  /** True when the imagery is drawn on the land; its notice shows only then. */
  imagery: boolean;
  /** Whether single-key shortcuts are on, and the switch that changes it. */
  singleKeys: boolean;
  onSingleKeys: (on: boolean) => void;
  onClose: () => void;
}

export function Notices({
  open,
  dataCredits,
  placeCredits,
  imagery,
  singleKeys,
  onSingleKeys,
  onClose,
}: NoticesProps) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={dialog}
      className={styles.dialog}
      aria-labelledby="notices-title"
      onClose={onClose}
    >
      <h2 id="notices-title" className={styles.title}>
        {en["stage.sources"].text}
      </h2>
      <h3 className={styles.heading}>{en["notices.data"].text}</h3>
      <ul className={styles.list}>
        {dataCredits.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      {placeCredits.length > 0 ? (
        <>
          <h3 className={styles.heading}>{en["notices.places"].text}</h3>
          <ul className={styles.list}>
            {placeCredits.map((c) => (
              <li key={c.id}>
                {c.name}: {c.attribution}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      <h3 className={styles.heading}>{en["notices.map"].text}</h3>
      <ul className={styles.list}>
        {(imagery ? [RELIEF_NOTICE, IMAGERY_NOTICE] : [RELIEF_NOTICE]).map((n) => (
          <li key={n.id}>
            {en[n.id].text}
            {n.href ? (
              <>
                {" "}
                <a href={n.href} target="_blank" rel="noopener noreferrer">
                  {new URL(n.href).host}
                </a>
              </>
            ) : null}
          </li>
        ))}
      </ul>
      <h3 className={styles.heading}>{en["notices.fonts"].text}</h3>
      <ul className={styles.list}>
        {FONT_LICENCES.map((f) => (
          <li key={f.id}>
            <a href={f.href} target="_blank" rel="noopener noreferrer">
              {en[f.id].text}
            </a>
          </li>
        ))}
      </ul>
      <h3 className={styles.heading}>{en["notices.keys"].text}</h3>
      <label className={styles.switch}>
        <input
          type="checkbox"
          role="switch"
          checked={singleKeys}
          aria-describedby="notices-single-keys"
          onChange={(e) => {
            onSingleKeys(e.currentTarget.checked);
          }}
        />
        {en["notices.singleKeys"].text}
      </label>
      <p id="notices-single-keys" className={styles.detail}>
        {en["notices.singleKeysDetail"].text}
      </p>
      <form method="dialog">
        <button type="submit" className={styles.close}>
          <kbd className={styles.glyph} aria-hidden="true">
            Esc
          </kbd>
          {en["flat.close"].text}
        </button>
      </form>
    </dialog>
  );
}
