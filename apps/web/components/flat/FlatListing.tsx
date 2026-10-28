"use client";

// Everything the screen shows, as plain text in reading order, so no fact depends on the map or on motion.
// "F Read flat" is the flat map reading (MOT-12); this listing stays for keyboard and screen reader users
// and for when the map cannot load: a skip link shown on keyboard focus, a labelled region that opens on
// focus, and the listing in place of the map when the map fails.

import { en } from "../../lib/copy/en";
import type { FlatSection } from "../../lib/flat/types";
import styles from "./FlatListing.module.css";

export interface FlatListingProps {
  sections: FlatSection[];
  /** True when the map could not load: the listing takes its place on screen. */
  shown: boolean;
}

export function FlatListing({ sections, shown }: FlatListingProps) {
  return (
    <>
      <a href="#flat-listing" className={styles.skip}>
        {en["flat.skip"].text}
      </a>
      <section
        id="flat-listing"
        tabIndex={-1}
        aria-labelledby="flat-listing-title"
        className={shown ? styles.shown : styles.listing}
        data-flat-listing={shown ? "shown" : "on-focus"}
      >
        <h2 id="flat-listing-title" className={styles.title}>
          {en["flat.title"].text}
        </h2>
        {sections.map((s) => (
          <section key={s.heading} className={styles.section}>
            <h3 className={styles.heading}>{s.heading}</h3>
            <ul className={styles.lines}>
              {s.lines.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </section>
        ))}
      </section>
    </>
  );
}
