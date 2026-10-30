"use client";

// The globe's page (the lead's decision 8): the place the globe turns to, in the record's words (the valley, then its
// region), one action into the valley with its Enter chip, and the mouse hint said in words. The legend, the credit,
// the case ring and the range name along the Atlas belong to the journey, which shows them across the globe and dive.

import { format, en } from "../../lib/copy/en";
import { Control } from "../controls/Control";
import styles from "./Journey.module.css";

export function GlobePage({
  valleyName,
  regionName,
  onDive,
}: {
  valleyName: string;
  regionName: string;
  onDive: () => void;
}) {
  return (
    <div className={styles.page}>
      <p className={styles.oneCase} data-globe-place>
        {format("globe.place", { valley: valleyName, region: regionName })}
      </p>
      <div className={styles.hints}>
        <Control variant="primary" keyHint="↵" keyShortcut="Enter" onClick={onDive}>
          {en["globe.go"].text}
        </Control>
        <span className={styles.quiet}>{en["globe.drag"].text}</span>
      </div>
    </div>
  );
}
