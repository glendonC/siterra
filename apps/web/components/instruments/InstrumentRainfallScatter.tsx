"use client";

// The rainfall scatter, in the instruments' A to C manner: the catchment's 26 seasons of March to June greenness
// against the September to May rainfall total before each, the straight-line fit with its R squared, and the four
// driest seasons marked. Data and caption come from the rainfall scatter spec (restrend bundle files read through
// the case asset route); the 1440 x 900 stage is scaled to fit.

import { useEffect, useId, useRef, useState } from "react";
import { en, format } from "../../lib/copy/en";
import { keepTogether } from "../../lib/instruments/caption";
import { fixed, signed } from "../../lib/instruments/format";
import { readJsonAsset } from "../../lib/instruments/listing";
import { scatterFrom, type ScatterData } from "../../lib/instruments/scatter/data";
import { obsidian, pixelColours as C } from "../../lib/theme/obsidian";
import { useShellSources } from "./ShellContext";
import styles from "./InstrumentRainfallScatter.module.css";
import { useInstrument } from "./InstrumentRecords";

export const SCATTER_DESIGN = { width: 1440, height: 900 } as const;

/**
 * The plot inside the stage, and its axes' ranges and ticks (mm, NDVI); it starts right of the ask disc's place on
 * the arc (decision 13), which every view keeps clear.
 */
const PLOT = { left: 540, right: 1010, top: 168, bottom: 680 } as const;
const RAIN = { lo: 300, hi: 1000, step: 100 } as const;
const NDVI = { lo: 0.18, hi: 0.23, step: 0.01 } as const;
const SIDE = { x: 1064, w: 336 } as const;

const xs = (mm: number) =>
  PLOT.left + ((mm - RAIN.lo) / (RAIN.hi - RAIN.lo)) * (PLOT.right - PLOT.left);
const ys = (v: number) =>
  PLOT.bottom - ((v - NDVI.lo) / (NDVI.hi - NDVI.lo)) * (PLOT.bottom - PLOT.top);
const ticks = (r: { lo: number; hi: number; step: number }) =>
  Array.from({ length: Math.round((r.hi - r.lo) / r.step) + 1 }, (_, i) => r.lo + i * r.step);
const mm = (v: number) => String(Math.round(v));

const CREDITS = ["instrument.credit.chirps", "instrument.credit.modisNdvi"] as const;

export function InstrumentRainfallScatter() {
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const record = useInstrument("rainfall_scatter");
  // its credits sit behind the shell's S; the data's short names stay visible
  useShellSources({
    lines: CREDITS.map((id) => en[id].text),
    short: [en["source.chirps"].text, en["source.modis"].text],
  });
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
      const left = (root.clientWidth - SCATTER_DESIGN.width * s) / 2;
      const top = (root.clientHeight - SCATTER_DESIGN.height * s) / 2;
      stage.style.transform = `translate(${left.toFixed(1)}px, ${top.toFixed(1)}px) scale(${s.toFixed(4)})`;
    };
    const observer = new ResizeObserver(fitStage);
    observer.observe(root);
    fitStage();
    return () => {
      observer.disconnect();
    };
  }, []);

  const caption = view?.spec.caption;
  const line = data
    ? ([RAIN.lo, RAIN.hi] as const).map((x) => [
        xs(x),
        ys(data.fit.intercept + data.fit.slope_per_mm * x),
      ])
    : [];

  return (
    <div ref={rootRef} className={styles.root} data-theme="obsidian" data-instrument="rainfall">
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
              <span className={styles.ink}>{keepTogether(caption.ink)}</span>
              <span className={styles.chip}>1</span>
              <span className={styles.chip}>2</span>{" "}
              <span className={styles.grey}>{keepTogether(caption.grey)}</span>
            </p>
            <svg
              className={styles.plot}
              width={SCATTER_DESIGN.width}
              height={SCATTER_DESIGN.height}
              aria-hidden="true"
            >
              {ticks(NDVI).map((v) => (
                <g key={`y${String(v)}`}>
                  <line x1={PLOT.left} x2={PLOT.right} y1={ys(v)} y2={ys(v)} stroke={C.gridLine} />
                  <text className={styles.tick} x={PLOT.left - 10} y={ys(v) + 4} textAnchor="end">
                    {fixed(v, 2)}
                  </text>
                </g>
              ))}
              {ticks(RAIN).map((v) => (
                <g key={`x${String(v)}`}>
                  <line x1={xs(v)} x2={xs(v)} y1={PLOT.top} y2={PLOT.bottom} stroke={C.gridLine} />
                  <text className={styles.tick} x={xs(v)} y={PLOT.bottom + 20} textAnchor="middle">
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
                  stroke={obsidian.canvas}
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
                    stroke={obsidian.accent}
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
              style={{ left: PLOT.right - 260, top: (line[1]?.[1] ?? PLOT.top) - 26 }}
            >
              {format("instrument.scatter.fit", { r2: fixed(data.fit.r_squared, 3) })}
            </div>
            <div className={styles.axisY} style={{ left: PLOT.left, top: PLOT.top - 30 }}>
              {en["instrument.scatter.axis.ndvi"].text}
            </div>
            <div
              className={styles.axisX}
              style={{ left: PLOT.left, top: PLOT.bottom + 40, width: PLOT.right - PLOT.left }}
            >
              {en["instrument.scatter.axis.rain"].text}
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
                    stroke={obsidian.accent}
                    strokeWidth={1.25}
                  />
                </svg>
                {en["instrument.scatter.key.driest"].text}
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
          </>
        )}
      </div>
    </div>
  );
}
