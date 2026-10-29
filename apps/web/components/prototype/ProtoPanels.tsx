"use client";

import { useState } from "react";
import { en } from "../../lib/copy/en";
import type { Coverage } from "../../lib/prototype/flow";
import { protoCopy } from "../../lib/prototype/proto-copy";
import styles from "./Story.module.css";

export function CoverageNote({ c }: { c: Coverage }) {
  return (
    <p className={styles.focusNote} role="status">
      <span className={styles.monoChip}>
        {c.badge === "required" ? en["flow.cov.required"].text : en["flow.cov.notLoaded"].text}
      </span>{" "}
      {c.detail}
    </p>
  );
}

/**
 * Hero 1.3 Key Slot (docs/reference/components.md, "Key slot"):
 * Bottom left above the key hints (left: 40px, bottom: 92px), mono 11/14 in text.secondary,
 * the layer's title, then its scale's ends or its classes as swatches. Hover or keyboard focus
 * opens its focus note (12/17 text.primary on bg.surface, 340 wide, popover shadow).
 */
export function KeySlot({ kind }: { kind: "ndvi" | "rain" }) {
  const [focused, setFocused] = useState(false);
  return (
    <div
      className={styles.keySlotWrap}
      onMouseEnter={() => {
        setFocused(true);
      }}
      onMouseLeave={() => {
        setFocused(false);
      }}
    >
      <button
        type="button"
        className={styles.keySlot}
        aria-expanded={focused}
        onFocus={() => {
          setFocused(true);
        }}
        onBlur={() => {
          setFocused(false);
        }}
        onClick={() => {
          setFocused((f) => !f);
        }}
      >
        {kind === "ndvi" ? (
          <>
            <span>{protoCopy.keySlotNdviTitle}</span>
            <span className={styles.keyScale}>
              <span>{protoCopy.keySlotNdviLow}</span>
              <i className={styles.ndviRamp} aria-hidden="true" />
              <span>{protoCopy.keySlotNdviHigh}</span>
            </span>
          </>
        ) : (
          <>
            <span>{protoCopy.keySlotRainTitle}</span>
            <span className={styles.keyScale}>
              <span className={styles.swatchItem}>
                <i className={styles.rainSwatch1} aria-hidden="true" />
                {protoCopy.keySlotRainC1}
              </span>
              <span className={styles.swatchItem}>
                <i className={styles.rainSwatch2} aria-hidden="true" />
                {protoCopy.keySlotRainC2}
              </span>
              <span className={styles.swatchItem}>
                <i className={styles.rainSwatch3} aria-hidden="true" />
                {protoCopy.keySlotRainC3}
              </span>
            </span>
          </>
        )}
      </button>
      {focused ? (
        <p className={styles.keyFocusNote} role="tooltip">
          {kind === "ndvi" ? protoCopy.keySlotNdviNote : protoCopy.keySlotRainNote}
        </p>
      ) : null}
    </div>
  );
}
