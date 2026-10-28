"use client";

// CMP-20 for the departure layer: bottom left, only while the layer shows; below 1100 px it collapses to a
// button, collapsed by default (UX architecture, viewport table). It names the records it describes
// (TemporalObservation, Measurement, DataBundle at their revisions); every line comes from them or the
// catalog.

import { useEffect, useId, useState } from "react";
import { en } from "../../lib/copy/en";
import type { DepartureBinding, DepartureLegend as Legend } from "../../lib/map/departure";
import styles from "./DepartureLegend.module.css";

export function DepartureLegend({
  legend,
  binding,
}: {
  legend: Legend;
  binding: DepartureBinding;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const close = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", close);
    return () => {
      window.removeEventListener("keydown", close);
    };
  }, [open]);
  return (
    <div className={styles.root} data-open={open}>
      <button
        type="button"
        className={styles.toggle}
        aria-expanded={open}
        aria-controls={id}
        data-budget="island"
        onClick={() => {
          setOpen((o) => !o);
        }}
      >
        {en["legend.toggle"].text}
      </button>
      <section
        id={id}
        className={styles.legend}
        aria-label={legend.title}
        data-budget="island"
        data-period-id={binding.periodId}
        data-entity-id={binding.observation.id}
        data-entity-revision={binding.observation.revision}
        data-measurement-id={binding.measurement.id}
        data-measurement-revision={binding.measurement.revision}
        data-bundle-id={binding.bundle.id}
        data-bundle-revision={binding.bundle.revision}
      >
        <h2 className={styles.title}>{legend.title}</h2>
        <p className={styles.subtitle}>{legend.subtitle}</p>
        <div className={styles.ramp} aria-hidden="true" />
        <p className={styles.ticks}>
          <span>{legend.low}</span>
          <span>{legend.high}</span>
        </p>
        {legend.coverage ? <p className={styles.line}>{legend.coverage}</p> : null}
        {legend.painted ? <p className={styles.line}>{legend.painted}</p> : null}
        {legend.flags ? <p className={styles.line}>{legend.flags}</p> : null}
        {legend.flagsNote ? <p className={styles.note}>{legend.flagsNote}</p> : null}
        {legend.excluded ? (
          <p className={styles.swatchRow}>
            <span className={styles.hatch} aria-hidden="true" />
            <span>{legend.excluded}</span>
          </p>
        ) : null}
        <p className={styles.note}>{legend.note}</p>
        <p className={styles.method}>{legend.method}</p>
        <p className={styles.cells}>{legend.cells}</p>
      </section>
    </div>
  );
}
