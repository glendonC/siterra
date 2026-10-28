// CMP-20 for the departure layer: bottom left, only while the layer shows. It names the records it
// describes (TemporalObservation, Measurement, DataBundle at their revisions); every line comes from them
// or the catalog.

import type { DepartureBinding, DepartureLegend as Legend } from "../../lib/map/departure";
import styles from "./DepartureLegend.module.css";

export function DepartureLegend({
  legend,
  binding,
}: {
  legend: Legend;
  binding: DepartureBinding;
}) {
  return (
    <section
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
      {legend.excluded ? (
        <p className={styles.swatchRow}>
          <span className={styles.hatch} aria-hidden="true" />
          <span>{legend.excluded}</span>
        </p>
      ) : null}
      <p className={styles.note}>{legend.note}</p>
      <p className={styles.method}>{legend.method}</p>
    </section>
  );
}
