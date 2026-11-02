"use client";

import { en, format, type MessageId } from "../../lib/copy/en";
import { pkg } from "../../lib/copy/package";
import { tm } from "../../lib/copy/time";
import type { OverviewData } from "../../lib/overview/data";
import {
  overviewLabelOf,
  sharesWords,
  type Finding,
  type OverviewLabel,
} from "../../lib/overview/findings";
import type { Selection } from "../../lib/overview/scene/overview";
import styles from "./ValleyOverview.module.css";

/** The circled arrow: a hairline circle with an arrow pointing outward along the finding's angle. */
export function Arrow({ deg, className }: { deg: number; className: string | undefined }) {
  return (
    <svg className={className} viewBox="-9 -9 18 18" aria-hidden="true">
      <circle r="8.2" />
      <g transform={`rotate(${String(deg)})`}>
        <path d="M0 4 L0 -4 M-2.6 -1.4 L0 -4 L2.6 -1.4" />
      </g>
    </svg>
  );
}

/** What the card says of the land while a finding is open: only the trend map's rule, when its asset was read. */
export function onLandOf(sel: Selection, data: OverviewData | null): string | null {
  // decision 16: the lit land shows its footprint and the hover names it; only the trend map's rule stays in words
  if (sel === "fdr") return data?.footprints.slope ? en["overview.onLand.fdrRule"].text : null;
  return null;
}

/** The last crumb while something is open: the finding's own number with a few words, or what opened. */
export function crumbOf(sel: Selection, findings: readonly Finding[], bandLimit: string): string {
  const f = findings.find((x) => x.id === sel);
  switch (sel) {
    case "field":
      return en["overview.crumb.field"].text;
    case "routes":
      return en["overview.crumb.routes"].text;
    case "results":
      return en["overview.crumb.results"].text;
    case "package":
      return pkg["package.title"].text;
    case "time":
      return tm["time.crumb"].text;
    case "band":
      return format("overview.crumb.band", { value: f?.display ?? "", limit: bandLimit });
    case "catchment":
      if (f?.missingReason) return f.display;
      return format("overview.crumb.catchment", { value: f?.display ?? "" });
    case "rain":
      if (f?.headline) return `${f.display} per decade rainfall`;
      return format("overview.crumb.rain", { value: f?.display ?? "" });
    case "fdr":
      return f ? sharesWords(f) : "";
    default:
      return format(`overview.crumb.${sel}` as MessageId, { value: f?.display ?? "" });
  }
}

export function FindingMark({
  finding: f,
  label: labelProp,
  bandLimit = "",
  describedBy,
  dotRef,
  labelRef,
  numeralRef,
  onHover,
  onOpen,
}: {
  finding: Finding;
  caption?: string[];
  label?: OverviewLabel;
  bandLimit?: string;
  describedBy: string;
  dotRef: (el: HTMLDivElement | null) => void;
  labelRef: (el: HTMLButtonElement | null) => void;
  numeralRef: (el: HTMLSpanElement | null) => void;
  onHover: (on: boolean) => void;
  onOpen: () => void;
}) {
  const hasStem = f.id === "band" || f.id === "pixel";
  const label = labelProp ?? overviewLabelOf(f, bandLimit);
  return (
    <>
      <div
        ref={dotRef}
        className={`${styles.dot} ${styles[f.tone] ?? ""}`}
        data-point-stem={hasStem ? "" : undefined}
        aria-hidden="true"
      >
        {hasStem ? (
          <>
            <i className={styles.stem} />
            <i className={styles.footRing} />
          </>
        ) : null}
        <i className={styles.halo} />
        <i className={styles.core} />
      </div>
      <button
        ref={labelRef}
        type="button"
        className={styles.finding}
        data-finding={f.id}
        aria-describedby={describedBy}
        onPointerEnter={() => {
          onHover(true);
        }}
        onPointerLeave={() => {
          onHover(false);
        }}
        onFocus={() => {
          onHover(true);
        }}
        onBlur={() => {
          onHover(false);
        }}
        onClick={onOpen}
      >
        <span ref={numeralRef} className={styles.numeral}>
          {label.title}
        </span>
        <span className={styles.caption}>{label.subtitle}</span>
      </button>
    </>
  );
}
