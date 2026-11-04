"use client";

// Rain and Greenness: the catchment's seasons of March to June greenness against the September to May rainfall
// total before each, the straight-line fit, and the four driest seasons marked. Above, the headline says how
// greenness follows rainfall from one season to the next (lib/instruments/scatter/lead.ts); in the left column, what
// a mark is, the fit's R squared and what it means, and how much greenness moved with rain. Data come from the
// rainfall scatter spec (restrend bundle files read through the case asset route); the 1440 x 900 stage is scaled to
// fit.

import { useEffect, useId, useRef, useState } from "react";
import { en, format } from "../../lib/copy/en";
import { windowWords } from "../../lib/land/season";
import { keepTogether } from "../../lib/instruments/caption";
import { fixed, signed } from "../../lib/instruments/format";
import { readJsonAsset } from "../../lib/instruments/listing";
import { RAIN_LEAD, rainLink } from "../../lib/instruments/scatter/lead";
import {
  NDVI_STEPS,
  RAIN_STEPS,
  axisRange,
  scatterFrom,
  type AxisRange,
  type ScatterData,
} from "../../lib/instruments/scatter/data";
import styles from "./InstrumentRainfallScatter.module.css";
import { useInstrument } from "./InstrumentRecords";
import { STAGE_MARGIN, useShellPalette } from "./ShellContext";

export const SCATTER_DESIGN = { width: 1440, height: 900 } as const;

/** The plot inside the stage, right of the left column that carries the words, as the answer's land is. */
const PLOT = { left: 620, right: 1180, top: 168, bottom: 680 } as const;
const SIDE = { x: 40, w: 380 } as const;
/** Before the seasons are read: the axes stand empty. */
const NO_AXIS: AxisRange = { lo: 0, hi: 1, step: 1 };

const ticks = (r: { lo: number; hi: number; step: number }) =>
  Array.from({ length: Math.round((r.hi - r.lo) / r.step) + 1 }, (_, i) => r.lo + i * r.step);
const mm = (v: number) => String(Math.round(v));

export function InstrumentRainfallScatter() {
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const record = useInstrument("rainfall_scatter");
  const pal = useShellPalette();
  const C = pal.pixel;
  const [data, setData] = useState<ScatterData | null>(null);
  const [loadFailed, setFailed] = useState(false);
  // an instrument the case holds no spec for cannot be drawn
  const failed = loadFailed || record.status === "failed" || record.status === "absent";
  const view = record.status === "ready" ? record.view : null;
  const descriptionId = useId();

  useEffect(() => {
    if (!view || view.spec.parameters.kind !== "rainfall_scatter") return;
    const ac = new AbortController();
    const { seasons, fit } = view.spec.parameters;
    const get = (input: string, init?: RequestInit) => fetch(input, init);
    Promise.all([
      readJsonAsset(view, seasons, get, ac.signal),
      readJsonAsset(view, fit, get, ac.signal),
    ])
      .then(([tables, summary]) => {
        setData(scatterFrom(tables, summary));
      })
      .catch((e: unknown) => {
        if (ac.signal.aborted) return;
        console.error("Rainfall scatter not loaded", e);
        setFailed(true);
      });
    return () => {
      ac.abort();
    };
  }, [view]);

  useEffect(() => {
    const root = rootRef.current;
    const stage = stageRef.current;
    if (!root || !stage) return;
    const fitStage = () => {
      const s = Math.min(
        root.clientWidth / SCATTER_DESIGN.width,
        root.clientHeight / SCATTER_DESIGN.height,
      );
      // the design's 40 px left margin on the screen's, under the breadcrumb, whatever the scale
      const left = STAGE_MARGIN * (1 - s);
      const top = (root.clientHeight - SCATTER_DESIGN.height * s) / 2;
      stage.style.transform = `translate(${left.toFixed(1)}px, ${top.toFixed(1)}px) scale(${s.toFixed(4)})`;
      // the stage's type keeps to 12 px on screen at any scale (the module's --min-type)
      stage.style.setProperty("--stage-scale", s.toFixed(4));
    };
    const observer = new ResizeObserver(fitStage);
    observer.observe(root);
    fitStage();
    return () => {
      observer.disconnect();
    };
  }, []);

  const caption = view?.spec.caption;
  // the bundle's own windows in words
  const words = {
    growing: windowWords(data?.windows.growing) ?? en["season.unstated"].text,
    rainfall: windowWords(data?.windows.rainfall) ?? en["season.unstated"].text,
  };
  // the axes from the place's own seasons
  const RAIN = data
    ? axisRange(
        data.seasons.map((s) => s.rain_mm),
        RAIN_STEPS,
      )
    : NO_AXIS;
  const NDVI = data
    ? axisRange(
        data.seasons.map((s) => s.ndvi),
        NDVI_STEPS,
      )
    : NO_AXIS;
  const xs = (v: number) =>
    PLOT.left + ((v - RAIN.lo) / (RAIN.hi - RAIN.lo)) * (PLOT.right - PLOT.left);
  const ys = (v: number) =>
    PLOT.bottom - ((v - NDVI.lo) / (NDVI.hi - NDVI.lo)) * (PLOT.bottom - PLOT.top);
  const line = data
    ? ([RAIN.lo, RAIN.hi] as const).map((x) => [
        xs(x),
        ys(data.fit.intercept + data.fit.slope_per_mm * x),
      ])
    : [];

  return (
    <div ref={rootRef} className={styles.root} data-instrument="rainfall">
      <p id={descriptionId} className={styles.srOnly}>
        {en["instrument.scatter.description"].text}
      </p>
      {failed && (
        <p className={styles.failed} role="status">
          {en["instrument.scatter.failed"].text}
        </p>
      )}
      <div ref={stageRef} className={styles.stage} role="group" aria-describedby={descriptionId}>
        {caption && data && !failed && (
          <>
            <p className={styles.caption}>
              {format(RAIN_LEAD[rainLink(data.fit)], {
                growing: words.growing,
                rainfall: words.rainfall,
              })}
            </p>
            <svg
              className={styles.plot}
              width={SCATTER_DESIGN.width}
              height={SCATTER_DESIGN.height}
              aria-hidden="true"
            >
              {/* the ticks are set off their lines in em, so they keep clear of each other at the size they are
                  drawn at: the greenness ticks centred on their lines, the rain ticks' baselines 1.9 em under the
                  plot, so their boxes start under the lowest greenness tick's */}
              {ticks(NDVI).map((v) => (
                <g key={`y${String(v)}`}>
                  <line x1={PLOT.left} x2={PLOT.right} y1={ys(v)} y2={ys(v)} stroke={C.gridLine} />
                  <text
                    className={styles.tick}
                    x={PLOT.left - 10}
                    y={ys(v)}
                    dy="0.35em"
                    textAnchor="end"
                  >
                    {fixed(v, 2)}
                  </text>
                </g>
              ))}
              {/* the rain axis's words stand where the open Ask's line does: they step aside while it is open */}
              {ticks(RAIN).map((v) => (
                <g key={`x${String(v)}`}>
                  <line x1={xs(v)} x2={xs(v)} y1={PLOT.top} y2={PLOT.bottom} stroke={C.gridLine} />
                  <text
                    className={styles.tick}
                    x={xs(v)}
                    y={PLOT.bottom}
                    dy="1.9em"
                    textAnchor="middle"
                    data-ask-aside
                  >
                    {v}
                  </text>
                </g>
              ))}
              <line
                x1={line[0]?.[0]}
                y1={line[0]?.[1]}
                x2={line[1]?.[0]}
                y2={line[1]?.[1]}
                stroke={C.ink2}
                strokeWidth={1}
              />
              {data.seasons.map((s) => (
                <circle
                  key={s.year}
                  cx={xs(s.rain_mm)}
                  cy={ys(s.ndvi)}
                  r={4}
                  fill={C.series}
                  stroke={pal.canvas}
                  strokeWidth={1}
                  data-season={s.year}
                />
              ))}
              {data.driest.map((s) => (
                <g key={`d${String(s.year)}`} data-driest={s.year}>
                  <circle
                    cx={xs(s.rain_mm)}
                    cy={ys(s.ndvi)}
                    r={8}
                    fill="none"
                    stroke={pal.accent}
                    strokeWidth={1.25}
                  />
                </g>
              ))}
            </svg>
            {data.driest.map((s, i) => (
              <div
                key={`l${String(s.year)}`}
                className={styles.driest}
                style={{
                  left: xs(s.rain_mm) + 16,
                  // the four sit close in rainfall: alternate above and below their rings, clear of them
                  top: ys(s.ndvi) + (i % 2 === 0 ? -30 : 12),
                }}
              >
                {format("instrument.scatter.driest", { year: s.year, mm: mm(s.rain_mm) })}
              </div>
            ))}
            <div
              className={styles.fitLabel}
              // past the line's right end, clear of the seasons
              style={{ left: PLOT.right + 10, top: (line[1]?.[1] ?? PLOT.top) - 8 }}
            >
              {en["instrument.scatter.fit"].text}
            </div>
            <div className={styles.axisY} style={{ left: PLOT.left, top: PLOT.top - 30 }}>
              {format("instrument.scatter.axis.ndvi", { window: words.growing })}
            </div>
            <div
              className={styles.axisX}
              style={{ left: PLOT.left, top: PLOT.bottom, width: PLOT.right - PLOT.left }}
              data-ask-aside
            >
              {format("instrument.scatter.axis.rain", { window: words.rainfall })}
            </div>
            <div className={styles.side} style={{ left: SIDE.x, top: PLOT.top, width: SIDE.w }}>
              <p className={styles.sideFigure}>
                {format("instrument.scatter.seasons", {
                  n: data.seasons.length,
                  from: data.period[0],
                  to: data.period[1],
                })}
              </p>
              <p className={styles.sideKey}>
                <svg className={styles.key} width={20} height={16} aria-hidden="true">
                  <circle cx={10} cy={8} r={4} fill={C.series} />
                </svg>
                {en["instrument.scatter.key.season"].text}
              </p>
              <p className={styles.sideKey}>
                <svg className={styles.key} width={20} height={16} aria-hidden="true">
                  <circle
                    cx={10}
                    cy={8}
                    r={6.5}
                    fill="none"
                    stroke={pal.accent}
                    strokeWidth={1.25}
                  />
                </svg>
                {format("instrument.scatter.key.driest", { window: words.rainfall })}
              </p>
              <div className={styles.notes} data-scatter-details>
                <p className={styles.sideNote}>
                  {keepTogether(
                    format("instrument.scatter.r2", { r2: fixed(data.fit.r_squared, 3) }),
                  )}
                </p>
                <p className={styles.sideNote}>
                  {format("instrument.scatter.slope", {
                    slope: signed(data.fit.slope_per_100_mm, 4),
                    // the bundle stores the interval per mm; per 100 mm is its two ends times 100
                    lower: signed(data.fit.lower * 100, 4),
                    upper: signed(data.fit.upper * 100, 4),
                  })}
                </p>
                {data.status === "precondition_not_met" && (
                  <p className={styles.sideNote}>{en["instrument.scatter.gate"].text}</p>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
