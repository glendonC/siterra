"use client";

// The layer stack (approved specimen A): five sheets of the record stacked straight up over the 3D catchment,
// numbered labels on one hairline leader each, one large figure at the top left, and the sources. The scene is
// three.js (lib/instruments/valley/scene/layer-stack.ts); the words around it are HTML, placed after every render
// so they follow the model when it is turned. The caption is the layer stack spec's, as the case records carry it.

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { en, format, type MessageId } from "../../lib/copy/en";
import { bandLimitsOf } from "../../lib/land/record";
import { splitFigure } from "../../lib/instruments/caption";
import { metres, percent, signed } from "../../lib/instruments/format";
import {
  RAIN_REFERENCE_YEARS,
  SNOW_YEARS,
  WORLDCOVER,
  type LayerStackData,
} from "../../lib/instruments/valley/fixtures";
import { loadLayerStackData } from "../../lib/instruments/valley/layer-stack-data";
import { RAIN_RANGE } from "../../lib/instruments/valley/palette";
import {
  LAYER_STACK_DESIGN,
  LAYER_STACK_EXAG,
  SHEETS,
  mountLayerStack,
  type LayerStackScene,
  type SheetId,
} from "../../lib/instruments/valley/scene/layer-stack";
import { obsidian, sheetColours } from "../../lib/theme/obsidian";
import { useShellSources, useShellView, type ViewHandle } from "./ShellContext";
import { useTeardown, type Teardown } from "./useTeardown";
import styles from "./InstrumentLayerStack.module.css";
import { useInstrument } from "./InstrumentRecords";

/** Left edge of the labels at the design width, as the specimen measured it. */
const LABEL_X = 1100;
/** The selected sheet: its number and its leader carry the one warm line. */
const SELECTED: SheetId = "trend";

const NAME: Record<SheetId, MessageId> = {
  trend: "instrument.sheet.trend",
  rain: "instrument.sheet.rain",
  snow: "instrument.sheet.snow",
  cover: "instrument.sheet.cover",
  bands: "instrument.sheet.bands",
};

const SWATCH: Record<SheetId, string> = {
  trend: sheetColours.swatchTrend,
  rain: sheetColours.swatchRain,
  snow: sheetColours.swatchSnow,
  cover: sheetColours.coverCrop,
  bands: sheetColours.bandTint,
};

/** The sources, numbered as the sheets' chips are. */
const CREDITS: MessageId[] = [
  "instrument.credit.modisNdvi",
  "instrument.credit.chirps",
  "instrument.credit.modisSnow",
  "instrument.credit.worldcover",
  "instrument.credit.dem",
];
/** The data's short names for the shell's one visible line. */
const SHORT: MessageId[] = ["source.modis", "source.chirps", "source.worldcover", "source.dem"];

const gradient = (stops: readonly string[]) => `linear-gradient(90deg, ${stops.join(", ")})`;
const TREND_KEY = [
  ...[...sheetColours.trendBelow].reverse(),
  sheetColours.trendKeyNeutral,
  ...sheetColours.trendAbove,
];

function question(id: SheetId, d: LayerStackData): string {
  const [from, to] = d.trend.period;
  return id === "trend"
    ? format("instrument.sheet.trend.question", { from, to })
    : en[`instrument.sheet.${id}.question`].text;
}

function sheetKey(id: SheetId, d: LayerStackData): ReactNode {
  switch (id) {
    case "trend": {
      const half = d.trend.display_scale.domain_per_decade[1];
      return (
        <>
          <span>{signed(-half, 2)}</span>
          <i className={styles.ramp} style={{ background: gradient(TREND_KEY) }} />
          <span>{format("instrument.sheet.trend.key", { value: signed(half, 2) })}</span>
        </>
      );
    }
    case "rain":
      return (
        <>
          <span>{RAIN_RANGE.lo}</span>
          <i className={styles.ramp} style={{ background: gradient(sheetColours.rain) }} />
          <span>
            {format("instrument.sheet.rain.key", {
              value: RAIN_RANGE.hi,
              from: RAIN_REFERENCE_YEARS[0],
              to: RAIN_REFERENCE_YEARS[1],
            })}
          </span>
        </>
      );
    case "snow":
      return (
        <>
          <span>{0}</span>
          <i className={styles.ramp} style={{ background: gradient(sheetColours.snow) }} />
          <span>
            {format("instrument.sheet.snow.key", {
              value: percent(1, 0),
              from: SNOW_YEARS[0],
              to: SNOW_YEARS[1],
            })}
          </span>
        </>
      );
    case "cover":
      return (
        <>
          <i className={styles.patch} style={{ background: sheetColours.coverCrop }} />
          <span>{en["instrument.sheet.cover.crop"].text}</span>
          <i className={styles.patch} style={{ background: sheetColours.coverTree }} />
          <span>
            {format("instrument.sheet.cover.tree", { year: WORLDCOVER.year, res: WORLDCOVER.res })}
          </span>
        </>
      );
    case "bands":
      return (
        <>
          <i className={styles.limit} style={{ background: sheetColours.outline }} />
          <span>
            {format("instrument.sheet.bands.key", {
              lower: metres(d.limits[0]),
              upper: metres(d.limits[1]),
            })}
          </span>
        </>
      );
  }
}

/** Arrow keys turn the model (degrees of bearing, of elevation); Home shows the measured view. */
const TURN: Record<string, [number, number]> = {
  ArrowLeft: [5, 0],
  ArrowRight: [-5, 0],
  ArrowUp: [0, 3],
  ArrowDown: [0, -3],
};

/**
 * The land taken apart in place (decision 12): the overview hands over where its land stands (`from`); the stack's
 * first frame draws that land there and calls `onDrawn`, then the sheets peel up into the stack. With `back` set it
 * plays back until the sheets have settled into the land, then calls `onBack`.
 */
export type StackTeardown = Teardown;

/** The teardown's lengths (s): the stack taken apart, and played back. */
const TEAR_S = { in: 2.6, back: 1.4 } as const;

export function InstrumentLayerStack({ teardown }: { teardown?: StackTeardown } = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const labelRefs = useRef<(HTMLDivElement | null)[]>([]);
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);
  const leaderRefs = useRef<(SVGLineElement | null)[]>([]);
  const dotRefs = useRef<(SVGCircleElement | null)[]>([]);
  const scaleRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<LayerStackScene | null>(null);
  // the shell's view control and key R reset and zoom this view; its sources sit behind the shell's S
  const viewHandle = useMemo<ViewHandle>(
    () => ({
      reset: () => sceneRef.current?.reset(),
      zoomBy: (f: number) => sceneRef.current?.stage.zoomBy(f),
    }),
    [],
  );
  useShellView(viewHandle);
  useShellSources({
    lines: CREDITS.map((id) => en[id].text),
    short: SHORT.map((id) => en[id].text),
  });
  const [data, setData] = useState<LayerStackData | null>(null);
  const [loadFailed, setFailed] = useState(false);
  const record = useInstrument("layer_stack");
  // an instrument the case holds no spec for cannot be drawn
  const failed = loadFailed || record.status === "failed" || record.status === "absent";
  const view = record.status === "ready" ? record.view : null;
  const snapshot = record.status === "ready" ? record.snapshot : null;
  const caption = view?.spec.caption ?? null;
  const lead = caption ? splitFigure(caption.ink) : null;
  const keysId = useId();

  // the teardown's clock: the first frame where the overview left its land, then the peel; played back on Esc
  const { tearing, kick: go } = useTeardown(sceneRef, teardown, TEAR_S.in, TEAR_S.back);

  useEffect(() => {
    if (!view || !snapshot) return;
    const ac = new AbortController();
    loadLayerStackData(view, snapshot, (input, init) => fetch(input, init), ac.signal).then(
      setData,
      (e: unknown) => {
        if (ac.signal.aborted) return;
        console.error("Layer stack not loaded", e);
        setFailed(true);
      },
    );
    return () => {
      ac.abort();
    };
  }, [view, snapshot]);

  useEffect(() => {
    const canvas = canvasRef.current;
    // the words are placed with the scene, so it mounts once the caption is in the record too
    if (!data || !canvas || !caption) return;
    const ac = new AbortController();
    let scene: LayerStackScene | null = null;

    // each sheet's label at the leader from its plate's right-most corner; the scale note under the model
    const place = () => {
      if (!scene) return;
      const { stage, sheetY, plate, footprint } = scene;
      const { width, height } = stage.size();
      const fit = Math.min(width / LAYER_STACK_DESIGN.width, height / LAYER_STACK_DESIGN.height);
      const labelX = width / 2 + (LABEL_X - LAYER_STACK_DESIGN.width / 2) * fit;
      sheetY.forEach((y, i) => {
        const p = plate
          .map(([x, z]) => stage.project([x, y, z]))
          .reduce((a, b) => (b.x > a.x ? b : a));
        const label = labelRefs.current[i];
        const row = rowRefs.current[i];
        // a sheet's number and label come in as it separates from the land
        const shown = Math.min(1, Math.max(0, ((scene?.sheetIn[i] ?? 1) - 0.55) / 0.45)).toFixed(3);
        if (label && row) {
          label.style.left = `${labelX.toFixed(1)}px`;
          label.style.top = `${(p.y - (row.offsetTop + row.offsetHeight / 2)).toFixed(1)}px`;
          label.style.visibility = "visible";
          label.style.opacity = shown;
        }
        leaderRefs.current[i]?.style.setProperty("opacity", shown);
        dotRefs.current[i]?.style.setProperty("opacity", shown);
        const leader = leaderRefs.current[i];
        leader?.setAttribute("x1", p.x.toFixed(1));
        leader?.setAttribute("y1", p.y.toFixed(1));
        leader?.setAttribute("x2", (labelX - 10).toFixed(1));
        leader?.setAttribute("y2", p.y.toFixed(1));
        dotRefs.current[i]?.setAttribute("cx", p.x.toFixed(1));
        dotRefs.current[i]?.setAttribute("cy", p.y.toFixed(1));
      });
      let left = Infinity;
      let lowest = -Infinity;
      for (const [x, z] of footprint) {
        const q = stage.project([x, 0, z]);
        left = Math.min(left, q.x);
        lowest = Math.max(lowest, q.y);
      }
      const note = scaleRef.current;
      if (note) {
        note.style.left = `${left.toFixed(1)}px`;
        note.style.top = `${(lowest + 16).toFixed(1)}px`;
        note.style.visibility = "visible";
      }
    };

    mountLayerStack(canvas, data).then(
      (s) => {
        if (ac.signal.aborted) {
          s.dispose();
          return;
        }
        scene = s;
        sceneRef.current = s;
        s.stage.onRender(place);
        s.stage.render();
        go();
      },
      () => {
        if (!ac.signal.aborted) setFailed(true);
      },
    );
    return () => {
      ac.abort();
      scene?.dispose();
      sceneRef.current = null;
    };
  }, [data, caption, go]);

  const onKeyDown = (e: KeyboardEvent<HTMLCanvasElement>) => {
    const scene = sceneRef.current;
    if (!scene) return;
    if (e.key === "Home") {
      scene.reset();
      e.preventDefault();
      return;
    }
    const t = TURN[e.key];
    if (t) {
      scene.turn(t[0], t[1]);
      e.preventDefault();
    }
  };

  return (
    <div
      className={styles.root}
      data-theme="obsidian"
      data-instrument="layers"
      data-tearing={tearing ? "" : undefined}
    >
      <canvas
        ref={canvasRef}
        className={styles.canvas}
        tabIndex={0}
        aria-label={en["instrument.layers.description"].text}
        aria-describedby={keysId}
        onKeyDown={onKeyDown}
      />
      <p id={keysId} className={styles.srOnly}>
        {en["instrument.layers.keys"].text}
      </p>
      {failed && (
        <p className={styles.failed} role="status">
          {/* a record without its two band limits is a blocked state, not a failure (AUDIT's U23 advisory) */}
          {
            en[
              record.status === "ready" && bandLimitsOf(record.snapshot) === null
                ? "instrument.noBandLimits"
                : "instrument.layers.failed"
            ].text
          }
        </p>
      )}
      {data && caption && lead && !failed && (
        <>
          <svg className={styles.leaders} aria-hidden="true">
            {SHEETS.map((id, i) => {
              const stroke = id === SELECTED ? obsidian.accent : obsidian.leaderQuiet;
              return (
                <g key={id}>
                  <line
                    ref={(e) => {
                      leaderRefs.current[i] = e;
                    }}
                    stroke={stroke}
                    strokeWidth={1}
                  />
                  <circle
                    ref={(e) => {
                      dotRefs.current[i] = e;
                    }}
                    r={2.4}
                    fill={stroke}
                  />
                </g>
              );
            })}
          </svg>
          <p className={styles.brief}>
            {lead.figure !== null && <span className={styles.fig}>{lead.figure}</span>}
            <span className={styles.unit}>{lead.rest}</span>
            <span className={styles.qual}>
              {caption.grey}
              <span className={styles.chip}>{1}</span>
            </span>
          </p>
          {SHEETS.map((id, i) => (
            <div
              key={id}
              ref={(e) => {
                labelRefs.current[i] = e;
              }}
              className={id === SELECTED ? `${styles.label} ${styles.selected}` : styles.label}
              data-sheet={id}
            >
              <div
                ref={(e) => {
                  rowRefs.current[i] = e;
                }}
                className={styles.row}
              >
                <span className={styles.num}>{String(i + 1).padStart(2, "0")}</span>
                <span className={styles.swatch} style={{ background: SWATCH[id] }} />
                <span className={styles.name}>{en[NAME[id]].text}</span>
                <span className={styles.chip}>{i + 1}</span>
              </div>
              <p className={styles.question}>{question(id, data)}</p>
              <div className={styles.key}>{sheetKey(id, data)}</div>
            </div>
          ))}
          <div ref={scaleRef} className={styles.scaleNote} data-scale-note>
            {format("instrument.layers.scale", { value: LAYER_STACK_EXAG })}
          </div>
        </>
      )}
    </div>
  );
}
