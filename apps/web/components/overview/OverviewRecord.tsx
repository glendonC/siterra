"use client";

// The opened finding's record (approved specimen D4, js/node.js nodeHud and css/d4.css): on the finding's side, a
// small kicker, the big number, its caption, the season chart (the 26 March to June means, the fitted line and light
// gridlines) and its interval line, then the way to the full instrument; below, the published context in the record's
// short display text with its sources, joined by one fine dotted line. A frosted field behind the record blurs the
// land with no edge and no box. The page places the frost, the dotted line and the hairline from the finding's dot
// (ValleyOverview's apply); every value here comes from the case.

import Link from "next/link";
import type { Ref } from "react";
import { en, format } from "../../lib/copy/en";
import { signed } from "../../lib/instruments/format";
import type { ScatterData } from "../../lib/instruments/scatter/data";
import { SEASON_TREND_YEARS } from "../../lib/instruments/valley/fixtures";
import type { Finding } from "../../lib/overview/findings";
import { chartScale, yearTicks, type SeasonChart } from "../../lib/overview/record";
import type { RecordData } from "../../lib/overview/record-data";
import type { Selection } from "../../lib/overview/scene/overview";
import styles from "./OverviewRecord.module.css";

/** The full instrument each record opens. */
export const INSTRUMENT_HREF: Record<Exclude<Selection, "results" | "routes">, string> = {
  catchment: "/instruments/layers",
  fdr: "/instruments/layers",
  band: "/instruments/cutaway",
  pixel: "/instruments/pixel",
  rain: "/instruments/rainfall",
  field: "/instruments/field",
};

/** D4's chart: 500 x 190 CSS px with its margins. */
const CHART = { w: 500, h: 190, pl: 34, pr: 8, pt: 22, pb: 26 } as const;

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

function SeasonsChart({ chart }: { chart: SeasonChart }) {
  const first = chart.seasons[0]?.year ?? SEASON_TREND_YEARS[0];
  const last = chart.seasons[chart.seasons.length - 1]?.year ?? SEASON_TREND_YEARS[1];
  const { lo, hi, ticks } = chartScale(chart.seasons.map((s) => s.ndvi));
  const digits = ticks.some((t) => Math.round(t * 10) !== t * 10) ? 2 : 1;
  const X = (x: number) =>
    CHART.pl + ((x - first) / (last - first || 1)) * (CHART.w - CHART.pl - CHART.pr);
  const Y = (y: number) =>
    CHART.pt + (1 - (y - lo) / (hi - lo || 1)) * (CHART.h - CHART.pt - CHART.pb);
  const at = (x: number) => chart.intercept + (chart.slopePerDecade / 10) * x;
  return (
    <svg
      className={styles.chart}
      width={CHART.w}
      height={CHART.h}
      viewBox={`0 0 ${String(CHART.w)} ${String(CHART.h)}`}
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
      {yearTicks(first, last).map((yr) => (
        <text key={yr} x={X(yr)} y={CHART.h - 6} textAnchor="middle">
          {yr}
        </text>
      ))}
      <text x={CHART.pl - 8} y={CHART.pt - 2} textAnchor="end">
        {en["overview.record.ndvi"].text}
      </text>
      <line className={styles.fit} x1={X(first)} x2={X(last)} y1={Y(at(first))} y2={Y(at(last))} />
      {chart.seasons.map((s) => (
        <circle key={s.year} className={styles.point} cx={X(s.year)} cy={Y(s.ndvi)} r="2.6" />
      ))}
    </svg>
  );
}

/** September to May rainfall (mm) across, March to June NDVI up, the straight-line fit across the seasons. */
function RainScatter({ data }: { data: ScatterData }) {
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
        {en["overview.record.rain"].text}
      </text>
      <text x={CHART.pl - 8} y={CHART.pt - 2} textAnchor="end">
        {en["overview.record.ndvi"].text}
      </text>
      <line className={styles.fit} x1={X(x0)} x2={X(x1)} y1={Y(at(x0))} y2={Y(at(x1))} />
      {data.seasons.map((s) => (
        <circle key={s.year} className={styles.point} cx={X(s.rain_mm)} cy={Y(s.ndvi)} r="2.6" />
      ))}
    </svg>
  );
}

export function OverviewRecord({
  sel,
  finding,
  caption,
  bandLimit,
  data,
  reasons,
  fieldCaption,
  refs,
}: {
  sel: Exclude<Selection, "results" | "routes">;
  /** The opened finding (none for the field check). */
  finding: Finding | null;
  caption: string[];
  bandLimit: string;
  /** The record's chart, scatter and context once read; null while reading. */
  data: RecordData | null;
  /** The field plan's blocked reasons, as the record states them. */
  reasons: string[];
  /** The field plan's caption once the composer opens one; it replaces the blocked reasons. */
  fieldCaption: { ink: string; grey: string } | null;
  refs: RecordRefs;
}) {
  const [from, to] = SEASON_TREND_YEARS;
  const kicker =
    sel === "field"
      ? en["overview.field"].text
      : sel === "pixel"
        ? en["overview.record.pixel"].text
        : sel === "band"
          ? format("overview.record.band", { limit: bandLimit })
          : en["overview.record.catchment"].text;
  const chart = data?.chart ?? null;
  const ci = chart
    ? format(chart.fit === "theil_sen" ? "overview.record.theilSen" : "overview.record.ols", {
        lower: signed(chart.lower, 4),
        upper: signed(chart.upper, 4),
      })
    : data?.scatter
      ? en["overview.record.scatter"].text
      : null;
  const capText =
    chart && finding ? format("overview.record.caption", { from, to }) : caption.join(" ");
  const context = data?.context ?? null;
  return (
    <div ref={refs.root} className={styles.record} data-record={sel}>
      <div ref={refs.frost} className={styles.frost} aria-hidden="true" />
      <section ref={refs.inst} className={styles.inst}>
        <div className={styles.plane}>
          <div className={styles.k}>{kicker}</div>
          {finding ? (
            <div ref={refs.big} className={styles.big}>
              {finding.display}
            </div>
          ) : null}
          {finding ? <div className={styles.cap}>{capText}</div> : null}
          {sel === "field"
            ? (fieldCaption ? [fieldCaption.ink, fieldCaption.grey] : reasons).map((r) => (
                <p key={r} className={styles.cap}>
                  {r}
                </p>
              ))
            : null}
          {chart ? <SeasonsChart chart={chart} /> : null}
          {data?.scatter ? <RainScatter data={data.scatter} /> : null}
          {ci ? <div className={styles.ci}>{ci}</div> : null}
          <Link ref={refs.link} className={styles.open} href={INSTRUMENT_HREF[sel]}>
            {en["overview.record.open"].text}
          </Link>
        </div>
      </section>
      {context ? (
        <>
          <svg ref={refs.connector} className={styles.connector} aria-hidden="true">
            <path className={styles.dotted} />
            <circle className={styles.end} r="2" />
            <circle className={styles.end} r="2" />
          </svg>
          <div ref={refs.midcap} className={styles.midcap}>
            {en["overview.record.context"].text}
          </div>
          <section ref={refs.evid} className={styles.evid}>
            <p className={styles.q}>{context.text}</p>
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
