"use client";

// The opened finding's record (approved specimen D4, js/node.js nodeHud and css/d4.css): on the finding's side, a
// small kicker, the big number, its caption, the season chart (the 26 March to June means, the fitted line and light
// gridlines) and its interval line, then the way to the full instrument; below, the published context in the record's
// short display text with its sources, joined by one fine dotted line. A frosted field behind the record blurs the
// land with no edge and no box. The page places the frost, the dotted line and the hairline from the finding's dot
// (ValleyOverview's apply); every value here comes from the case.

import { useEffect, useState, type CSSProperties, type Ref } from "react";
import { en, format } from "../../lib/copy/en";
import { signed } from "../../lib/instruments/format";
import type { ScatterData } from "../../lib/instruments/scatter/data";
import { seasonWords, windowWords } from "../../lib/land/season";
import {
  recordHeadlineForFinding,
  recordRowsForFinding,
  type Finding,
} from "../../lib/overview/findings";
import { chartScale } from "../../lib/overview/record";
import type { RecordData } from "../../lib/overview/record-data";
import type { Selection } from "../../lib/overview/scene/overview";
import type { Action } from "../../lib/overview/actions";
import type { ScanTimingSummary } from "../../lib/time/load";
import { ActionList } from "./ActionList";
import { pixelColours as C } from "../../lib/theme/obsidian";
import styles from "./OverviewRecord.module.css";

/** D4's chart: compact 420 x 154 CSS px with its margins so the slanted card and open context fit the frame. */
const CHART = { w: 420, h: 154, pl: 34, pr: 8, pt: 20, pb: 28 } as const;
const NARROW = CHART;
/** The rain card opened wide (Compare with Rainfall). */
const WIDE = { w: 580, h: 270, pl: 34, pr: 8, pt: 20, pb: 28 } as const;

export interface RecordRefs {
  root: Ref<HTMLDivElement>;
  inst: Ref<HTMLElement>;
  big: Ref<HTMLDivElement>;
  link: Ref<HTMLAnchorElement>;
  evid: Ref<HTMLElement>;
  frost: Ref<HTMLDivElement>;
  connector: Ref<SVGSVGElement>;
  midcap: Ref<HTMLDivElement>;
}

/** September to May rainfall (mm) across, March to June NDVI up, the straight-line fit across the seasons. */
function RainScatter({ data, wide = false }: { data: ScatterData; wide?: boolean }) {
  // compared with rainfall (decision 13): the card opens wider and the 26 seasons rise into place, one by one
  const CHART = wide ? WIDE : NARROW;
  const H = CHART.h + 16;
  const pb = CHART.pb + 16;
  const mm = data.seasons.map((s) => s.rain_mm);
  const x0 = Math.floor(Math.min(...mm) / 100) * 100;
  const x1 = Math.ceil(Math.max(...mm) / 100) * 100;
  const step = x1 - x0 > 600 ? 200 : 100;
  const xt: number[] = [];
  for (let v = x0; v <= x1; v += step) xt.push(v);
  const { lo, hi, ticks } = chartScale(data.seasons.map((s) => s.ndvi));
  const digits = ticks.some((t) => Math.round(t * 10) !== t * 10) ? 2 : 1;
  const X = (x: number) => CHART.pl + ((x - x0) / (x1 - x0 || 1)) * (CHART.w - CHART.pl - CHART.pr);
  const Y = (y: number) => CHART.pt + (1 - (y - lo) / (hi - lo || 1)) * (H - CHART.pt - pb);
  const at = (x: number) => data.fit.intercept + data.fit.slope_per_mm * x;
  return (
    <svg
      className={styles.chart}
      width={CHART.w}
      height={H}
      viewBox={`0 0 ${String(CHART.w)} ${String(H)}`}
      aria-hidden="true"
    >
      {ticks.map((g) => (
        <g key={g}>
          <line className={styles.grid} x1={CHART.pl} x2={CHART.w - CHART.pr} y1={Y(g)} y2={Y(g)} />
          <text x={CHART.pl - 8} y={Y(g) + 4} textAnchor="end">
            {g.toFixed(digits)}
          </text>
        </g>
      ))}
      {xt.map((v) => (
        <text key={v} x={X(v)} y={H - pb + 20} textAnchor="middle">
          {v}
        </text>
      ))}
      <text x={CHART.w - CHART.pr} y={H - 4} textAnchor="end">
        {/* the rainfall window the bundle's primary analysis uses, in words (U25) */}
        {format("overview.record.rain", {
          window:
            windowWords(data.windows.rainfall === "annual" ? "jan_dec" : data.windows.rainfall) ??
            en["season.unstated"].text,
        })}
      </text>
      <text x={CHART.pl - 8} y={CHART.pt - 2} textAnchor="end">
        {en["overview.record.ndvi"].text}
      </text>
      <line className={styles.fit} x1={X(x0)} x2={X(x1)} y1={Y(at(x0))} y2={Y(at(x1))} />
      {data.seasons.map((s, i) => (
        <circle
          key={s.year}
          className={wide ? `${styles.point} ${styles.rise}` : styles.point}
          cx={X(s.rain_mm)}
          cy={Y(s.ndvi)}
          r={wide ? 3.4 : 2.6}
          style={
            wide
              ? ({
                  "--rise": `${(H - pb - Y(s.ndvi)).toFixed(1)}px`,
                  animationDelay: `${String(120 + i * 28)}ms`,
                } as CSSProperties)
              : undefined
          }
        />
      ))}
    </svg>
  );
}

export function OverviewRecord({
  sel,
  finding,
  allFindings = [],
  caption,
  bandLimit,
  data,
  reasons,
  fieldCaption,
  pixelNote: _pixelNote,
  areaLabel,
  side,
  onLand,
  slopeKey,
  scanTiming: _scanTiming = null,
  actions,
  onOpen,
  onBack,
  onContextToggle,
  wide = false,
  refs,
}: {
  sel: Exclude<Selection, "results" | "routes">;
  /** The opened finding (none for the field check). */
  finding: Finding | null;
  /** All findings on the case, so relative ratios and whole-area comparisons can be derived. */
  allFindings?: readonly Finding[];
  caption: string[];
  bandLimit: string;
  /** The record's chart, scatter and context once read; null while reading. */
  data: RecordData | null;
  /** The field plan's blocked reasons, as the record states them. */
  reasons: string[];
  /** The field plan's caption once the composer opens one; it replaces the blocked reasons. */
  fieldCaption: { ink: string; grey: string } | null;
  /** The pixel bundle's note on how the pixel was chosen, shown with the pixel's record. */
  pixelNote: string | null;
  /** The record's name for its area ("Valley catchment"), the kicker of a finding over the whole area. */
  areaLabel: string;
  /** The side it opens on: the side its finding sits on the arc (decision 6). */
  side: "left" | "right";
  /** What the land shows while it is open (its footprint), in the catalog's words. */
  onLand: string | null;
  /** The fixed slope scale the land is painted on, when it is. */
  slopeKey: { domain: number } | null;
  /** Regional scan (7B) and Pettitt change-point timing (7C) for band and fdr cards. */
  scanTiming?: ScanTimingSummary | null;
  /** What can be done with this finding, from what the record offers (decision 15). */
  actions: readonly Action[];
  /** Opens a view in place, taking the land apart (decision 12); true when it did, so the link does not load. */
  onOpen?: (href: string) => boolean;
  onBack?: () => void;
  /** The published context opened or closed: the page places the card's words again. */
  onContextToggle?: () => void;
  /** The rain card opened wide: its seasons compared with rainfall, rising beside the rain-tinted land. */
  wide?: boolean;
  refs: RecordRefs;
}) {
  // the published context behind its button; the page lays the card out again when it opens or closes
  const [contextOpen, setContextOpen] = useState(false);
  useEffect(() => {
    setContextOpen(false);
  }, [sel]);
  useEffect(() => {
    onContextToggle?.();
  }, [contextOpen, onContextToggle]);
  // the finding's own season and years, from its measurement's period (U25)
  const { window } = seasonWords(finding?.period ?? null);
  const kicker =
    sel === "field"
      ? en["overview.field"].text
      : sel === "pixel"
        ? "One 250 m square"
        : sel === "band"
          ? format("overview.record.band", { limit: bandLimit })
          : sel === "rain" && finding?.subtitle?.startsWith("Nearest ")
            ? finding.subtitle
            : areaLabel;
  const headline = finding
    ? recordHeadlineForFinding(finding, allFindings, bandLimit)
    : (caption[0] ?? "");
  const rows = finding ? recordRowsForFinding(finding, allFindings, bandLimit) : [];
  const context = data?.context ?? null;
  return (
    <div
      ref={refs.root}
      className={styles.record}
      data-record={sel}
      data-side={side}
      data-wide={wide ? "" : undefined}
    >
      <div ref={refs.frost} className={styles.frost} aria-hidden="true" />
      <section ref={refs.inst} className={styles.inst}>
        <div className={styles.glass} aria-hidden="true" />
        <div className={styles.plane}>
          <div className={styles.k}>{kicker}</div>
          {finding ? (
            <div ref={refs.big} className={styles.headline} data-record-headline="">
              {headline}
            </div>
          ) : null}
          {rows.length > 0 ? (
            <div className={styles.rows} data-record-rows="">
              {rows.map((r) => (
                <div key={r.label} className={styles.row} data-record-row="">
                  <span className={styles.rowLabel}>{r.label}</span>
                  <span className={styles.rowValue}>{r.value}</span>
                </div>
              ))}
            </div>
          ) : null}
          {sel === "field"
            ? (fieldCaption ? [fieldCaption.ink, fieldCaption.grey] : reasons).map((r) => (
                <p key={r} className={styles.cap}>
                  {r}
                </p>
              ))
            : null}
          {wide && data?.scatter ? <RainScatter data={data.scatter} wide={wide} /> : null}
          {finding?.missingReason ? (
            <div className={styles.note} data-not-measured="">
              {finding.missingReason}
            </div>
          ) : null}
          {slopeKey ? <SlopeKey domain={slopeKey.domain} window={window} /> : null}
          {onLand ? (
            <div className={styles.note} data-on-land>
              {onLand}
            </div>
          ) : null}
          {wide ? null : (
            <ActionList
              actions={actions.filter((a) => a.view !== null)}
              {...(onOpen ? { onOpen } : {})}
              {...(onBack ? { onBack } : {})}
              primaryRef={refs.link}
              trailing={
                context ? (
                  <button
                    type="button"
                    className={styles.contextToggle}
                    aria-expanded={contextOpen}
                    data-context-toggle
                    onClick={() => {
                      setContextOpen((o) => !o);
                    }}
                  >
                    {en["overview.record.context"].text}
                  </button>
                ) : null
              }
            />
          )}
        </div>
      </section>
      {context ? (
        <>
          <svg
            ref={refs.connector}
            className={styles.connector}
            aria-hidden="true"
            style={{ display: contextOpen ? undefined : "none" }}
          >
            <path className={styles.dotted} />
            <circle className={styles.end} r="2" />
            <circle className={styles.end} r="2" />
          </svg>
          <div ref={refs.midcap} className={styles.midcap} hidden />
          <section
            ref={refs.evid}
            className={styles.evid}
            hidden={!contextOpen}
            data-paper-specimen=""
          >
            <div className={styles.paperHeader}>
              <span className={styles.paperKicker}>{"Published research"}</span>
              <span className={styles.paperBadge}>{"Verified excerpt"}</span>
            </div>
            <p className={styles.q}>
              <mark className={styles.excerptMark}>{context.text}</mark>
            </p>
            <p className={styles.cite}>
              {context.references.map((line) => (
                <span key={line} className={styles.ref}>
                  {line}
                </span>
              ))}
            </p>
          </section>
        </>
      ) : null}
    </div>
  );
}

/** The fixed scale the land's slope is painted on: browning arm, the neutral middle, greening arm. */
function SlopeKey({ domain, window }: { domain: number; window: string }) {
  const stops = [...[...C.slopeBelow].reverse(), C.slopeNeutral, ...C.slopeAbove];
  return (
    <div className={styles.slopeKey} data-slope-key>
      <span
        className={styles.slopeBar}
        style={{ background: `linear-gradient(90deg, ${stops.join(", ")})` }}
        aria-hidden="true"
      />
      <span className={styles.slopeTicks}>
        <span>{signed(-domain, 2)}</span>
        <span>0</span>
        <span>{signed(domain, 2)}</span>
      </span>
      <span className={styles.slopeLabel}>{format("overview.slopeKey", { window })}</span>
    </div>
  );
}
