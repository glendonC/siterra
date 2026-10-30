"use client";

// The cutaway (approved specimen B): the catchment cut north to south through Tabant, the section face as the hero.
// Against the face at each elevation band's height: the band's name, its March to June trend and its monthly snow
// cover, on one hairline each; the two published statements next to what they describe; the ruler, the limits and
// the place on the model. The scene is three.js (lib/instruments/valley/scene/cutaway.ts); the words are HTML,
// placed after every render so they follow the model when it is turned. The caption is the cross section spec's,
// as the case records carry it.

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { en, format, type MessageId } from "../../lib/copy/en";
import { splitFigure } from "../../lib/instruments/caption";
import { metres, percent, signed } from "../../lib/instruments/format";
import { loadCutawayData, type CutawayData } from "../../lib/instruments/valley/cutaway-data";
import type { Vec3 } from "../../lib/instruments/valley/frame";
import { BAND_LIMITS_M, SNOW_YEARS, VALLEY_FIXTURES } from "../../lib/instruments/valley/fixtures";
import { snowColour } from "../../lib/instruments/valley/palette";
import {
  CUTAWAY_EXAG,
  RULER_LABELS,
  mountCutaway,
  type CutawayScene,
} from "../../lib/instruments/valley/scene/cutaway";
import { cssColour, obsidian, sheetColours } from "../../lib/theme/obsidian";
import styles from "./InstrumentCutaway.module.css";
import { useInstrument } from "./InstrumentRecords";

type BandId = "elevation_high" | "elevation_mid" | "elevation_low";
/** Top to bottom, as they stand on the face. */
const BANDS: readonly BandId[] = ["elevation_high", "elevation_mid", "elevation_low"];

const bandName = (id: BandId) => {
  const lower = metres(BAND_LIMITS_M[0]);
  const upper = metres(BAND_LIMITS_M[1]);
  if (id === "elevation_high") return format("instrument.cutaway.band.high", { limit: upper });
  if (id === "elevation_mid") return format("instrument.cutaway.band.mid", { lower, upper });
  return format("instrument.cutaway.band.low", { limit: lower });
};

/** The sources, numbered as the chips are; the two statements' sources and the place's come from the case record. */
const CREDITS_BEFORE: MessageId[] = ["instrument.credit.modisNdvi", "instrument.credit.modisSnow"];
const CREDITS_AFTER: MessageId[] = ["instrument.credit.worldcover", "instrument.credit.dem"];
const STATEMENT_CHIP_FROM = CREDITS_BEFORE.length + 1;

const SNOW_KEY = `linear-gradient(90deg, ${sheetColours.snow.join(", ")})`;

/** Arrow keys turn the model (degrees of bearing, of elevation); Home shows the measured view. */
const TURN: Record<string, [number, number]> = {
  ArrowLeft: [5, 0],
  ArrowRight: [-5, 0],
  ArrowUp: [0, 3],
  ArrowDown: [0, -3],
};

type Anchor =
  "left-middle" | "left-top" | "right-middle" | "right-bottom" | "center-top" | "center-bottom";

/** Puts an element's anchor point at (x, y) and shows it. */
function place(e: HTMLElement | null, x: number, y: number, anchor: Anchor) {
  if (!e) return null;
  const w = e.offsetWidth;
  const h = e.offsetHeight;
  const left = anchor.startsWith("right") ? x - w : anchor.startsWith("center") ? x - w / 2 : x;
  const top = anchor.endsWith("middle") ? y - h / 2 : anchor.endsWith("bottom") ? y - h : y;
  e.style.left = `${left.toFixed(1)}px`;
  e.style.top = `${top.toFixed(1)}px`;
  e.style.visibility = "visible";
  return { left, top, right: left + w, bottom: top + h };
}

function line(e: SVGLineElement | null, x1: number, y1: number, x2: number, y2: number) {
  e?.setAttribute("x1", x1.toFixed(1));
  e?.setAttribute("y1", y1.toFixed(1));
  e?.setAttribute("x2", x2.toFixed(1));
  e?.setAttribute("y2", y2.toFixed(1));
}

function dot(e: SVGCircleElement | null, x: number, y: number) {
  e?.setAttribute("cx", x.toFixed(1));
  e?.setAttribute("cy", y.toFixed(1));
}

export function InstrumentCutaway({
  base = VALLEY_FIXTURES,
}: {
  /** The valley fixtures the cutaway still reads: the relief. */
  base?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bandRefs = useRef<(HTMLDivElement | null)[]>([]);
  const bandLeaderRefs = useRef<(SVGLineElement | null)[]>([]);
  const bandDotRefs = useRef<(SVGCircleElement | null)[]>([]);
  const stripRef = useRef<HTMLSpanElement>(null);
  const monthsRef = useRef<HTMLDivElement>(null);
  const snowRef = useRef<HTMLDivElement>(null);
  const limitRefs = useRef<(HTMLDivElement | null)[]>([]);
  const tickRefs = useRef<(HTMLDivElement | null)[]>([]);
  const upperRef = useRef<HTMLParagraphElement>(null);
  const upperStemRef = useRef<SVGLineElement>(null);
  const upperDotRef = useRef<SVGCircleElement>(null);
  const placeRef = useRef<HTMLDivElement>(null);
  const placeTickRef = useRef<SVGLineElement>(null);
  const floorRef = useRef<HTMLParagraphElement>(null);
  const floorStemRef = useRef<SVGLineElement>(null);
  const endRefs = useRef<(HTMLDivElement | null)[]>([]);
  const scaleRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<CutawayScene | null>(null);
  const [data, setData] = useState<CutawayData | null>(null);
  const [placeName, setPlaceName] = useState<string | null>(null);
  const [loadFailed, setFailed] = useState(false);
  const record = useInstrument("cross_section");
  // an instrument the case holds no spec for cannot be drawn
  const failed = loadFailed || record.status === "failed" || record.status === "absent";
  const view = record.status === "ready" ? record.view : null;
  const snapshot = record.status === "ready" ? record.snapshot : null;
  const caption = view?.spec.caption ?? null;
  const lead = caption ? splitFigure(caption.ink) : null;
  const keysId = useId();

  useEffect(() => {
    if (!view || !snapshot) return;
    const ac = new AbortController();
    loadCutawayData(view, snapshot, base, (input, init) => fetch(input, init), ac.signal).then(
      setData,
      (e: unknown) => {
        if (ac.signal.aborted) return;
        console.error("Cutaway not loaded", e);
        setFailed(true);
      },
    );
    return () => {
      ac.abort();
    };
  }, [view, snapshot, base]);

  useEffect(() => {
    const canvas = canvasRef.current;
    // the words are placed with the scene, so it mounts once the caption is in the record too
    if (!data || !canvas || !caption) return;
    const ac = new AbortController();
    let scene: CutawayScene | null = null;

    const layout = () => {
      if (!scene) return;
      const { stage, marks } = scene;
      const P = (p: Vec3) => stage.project(p);
      const { width } = stage.size();
      const south = P(marks.southBase);
      const yTop = P(marks.southTop).y;
      const yL = P(marks.southLimits[0]).y;
      const yU = P(marks.southLimits[1]).y;
      // each band's block against the face at the middle of its band, on a short hairline
      const colX = south.x + 28;
      const ys = [(yTop + yU) / 2, (yU + yL) / 2, yL + (yL - yU) / 2];
      ys.forEach((y, i) => {
        place(bandRefs.current[i] ?? null, colX, y, "left-middle");
        line(bandLeaderRefs.current[i] ?? null, south.x + 1, y, colX - 6, y);
        dot(bandDotRefs.current[i] ?? null, south.x + 1, y);
      });
      // the month initials under the lowest strip, the snow key under them
      const strip = stripRef.current;
      const root = canvas.parentElement;
      if (strip && root) {
        const sr = strip.getBoundingClientRect();
        const rr = root.getBoundingClientRect();
        const m = place(monthsRef.current, sr.left - rr.left, sr.bottom - rr.top + 3, "left-top");
        if (m) place(snowRef.current, sr.left - rr.left, m.bottom + 8, "left-top");
      }
      // the two limits, labelled on the face just above each line near the south edge
      [yL, yU].forEach((y, i) =>
        place(limitRefs.current[i] ?? null, south.x - 8, y - 2, "right-bottom"),
      );
      // upper rangelands above the high slopes at the south end, on a short stem down to the profile
      const hp = P(marks.highSlope);
      const ur = place(
        upperRef.current,
        Math.min(width - 16, south.x + 210),
        yTop - 18,
        "right-bottom",
      );
      if (ur) line(upperStemRef.current, hp.x, hp.y - 4, hp.x, ur.bottom + 3);
      dot(upperDotRef.current, hp.x, hp.y - 3);
      // the ruler's labels left of its long ticks
      marks.ruler.forEach((r, i) => {
        const q = P(r.at);
        place(tickRefs.current[i] ?? null, q.x - 8, q.y, "right-middle");
      });
      // the place on the profile, and the valley floor statement on the face under it
      const fq = P(marks.floorAnchor);
      if (marks.place) {
        place(placeRef.current, fq.x, fq.y - 14, "center-bottom");
        line(placeTickRef.current, fq.x, fq.y - 3, fq.x, fq.y - 13);
      }
      const fr = place(floorRef.current, fq.x, fq.y + 24, "center-top");
      if (fr) line(floorStemRef.current, fq.x, fq.y + 7, fq.x, fr.top - 3);
      const nb = P(marks.northBase);
      place(endRefs.current[0] ?? null, nb.x, nb.y + 6, "center-top");
      place(endRefs.current[1] ?? null, south.x, south.y + 6, "center-top");
      place(scaleRef.current, nb.x + 18, nb.y + 6, "left-top");
    };

    mountCutaway(canvas, data, base, ac.signal).then(
      (s) => {
        if (ac.signal.aborted) {
          s.dispose();
          return;
        }
        scene = s;
        sceneRef.current = s;
        setPlaceName(s.marks.place?.name ?? null);
        s.stage.onRender(layout);
        s.stage.render();
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
  }, [data, base, caption]);

  // the place's label appears after the scene has found it on the line; lay the words out again then
  useEffect(() => {
    sceneRef.current?.stage.render();
  }, [placeName]);

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

  const section = data?.places.places[0]?.name ?? "";
  const statement = (id: string) => data?.statements.statements.find((s) => s.id === id);
  const chip = (sourceId: string) =>
    (data?.statements.sources.findIndex((s) => s.id === sourceId) ?? -1) + STATEMENT_CHIP_FROM;
  const chips = (id: string) =>
    [...new Set(statement(id)?.cites.map((c) => chip(c.sourceId)))]
      .sort((a, b) => a - b)
      .map((n) => (
        <span key={n} className={styles.chip}>
          {n}
        </span>
      ));
  const credits = data
    ? [
        ...CREDITS_BEFORE.map((id) => en[id].text),
        ...data.statements.sources.map((s) => s.citation),
        ...CREDITS_AFTER.map((id) => en[id].text),
        ...data.places.places.map((p) => p.attribution),
      ]
    : [];

  return (
    <div className={styles.root} data-theme="obsidian" data-instrument="cutaway">
      <canvas
        ref={canvasRef}
        className={styles.canvas}
        tabIndex={0}
        aria-label={format("instrument.cutaway.description", { place: section })}
        aria-describedby={keysId}
        onKeyDown={onKeyDown}
      />
      <p id={keysId} className={styles.srOnly}>
        {en["instrument.cutaway.keys"].text}
      </p>
      {failed && (
        <p className={styles.failed} role="status">
          {en["instrument.cutaway.failed"].text}
        </p>
      )}
      {data && caption && lead && !failed && (
        <>
          <svg className={styles.leaders} aria-hidden="true">
            {BANDS.map((id, i) => (
              <g key={id}>
                <line
                  ref={(e) => {
                    bandLeaderRefs.current[i] = e;
                  }}
                  stroke={obsidian.leaderQuiet}
                  strokeWidth={1}
                />
                <circle
                  ref={(e) => {
                    bandDotRefs.current[i] = e;
                  }}
                  r={2}
                  fill={obsidian.leaderDot}
                />
              </g>
            ))}
            <line ref={upperStemRef} stroke={obsidian.leaderQuiet} strokeWidth={1} />
            <circle ref={upperDotRef} r={2} fill={obsidian.leaderDot} />
            {placeName && <line ref={placeTickRef} stroke={obsidian.leaderDot} strokeWidth={1} />}
            <line ref={floorStemRef} stroke={obsidian.leaderOnWall} strokeWidth={1} />
          </svg>
          <p className={styles.brief}>
            {lead.figure !== null && <span className={styles.fig}>{lead.figure}</span>}
            <span className={styles.unit}>{lead.rest}</span>
            <span className={styles.qual}>
              {caption.grey}
              <span className={styles.chip}>{1}</span>
            </span>
          </p>
          {BANDS.map((id, i) => (
            <div
              key={id}
              ref={(e) => {
                bandRefs.current[i] = e;
              }}
              className={styles.band}
              data-band={id}
            >
              <div className={styles.bandName}>{bandName(id)}</div>
              <div className={styles.bandFig}>
                <b>{signed(data.figures.season_trend[id].per_decade, 4)}</b>{" "}
                {en["instrument.cutaway.band.unit"].text}
              </div>
              <span ref={i === BANDS.length - 1 ? stripRef : undefined} className={styles.strip}>
                {(data.snow.bands[id]?.monthly_mean ?? []).map((v, m) => (
                  <i
                    key={data.snow.months[m] ?? m}
                    title={`${data.snow.months[m] ?? ""} ${percent(v, 0)}`}
                    style={{ background: cssColour(snowColour(v)) }}
                  />
                ))}
              </span>
            </div>
          ))}
          <div ref={monthsRef} className={styles.months} aria-hidden="true">
            {data.snow.months.map((m) => (
              <span key={m}>{m.charAt(0)}</span>
            ))}
          </div>
          <div ref={snowRef} className={styles.snowKey}>
            <div>{en["instrument.cutaway.snow"].text}</div>
            <div>
              {format("instrument.cutaway.snow.years", { from: SNOW_YEARS[0], to: SNOW_YEARS[1] })}
              <span className={styles.rampKey}>
                <span>{0}</span>
                <i style={{ background: SNOW_KEY }} />
                <span>{percent(1, 0)}</span>
              </span>
              <span className={styles.chip}>{2}</span>
            </div>
          </div>
          {BAND_LIMITS_M.map((e, i) => (
            <div
              key={e}
              ref={(el) => {
                limitRefs.current[i] = el;
              }}
              className={`${styles.tickLabel} ${styles.onWall}`}
            >
              {format("instrument.cutaway.metres", { value: metres(e) })}
            </div>
          ))}
          {RULER_LABELS.map((e, i) => (
            <div
              key={e}
              ref={(el) => {
                tickRefs.current[i] = el;
              }}
              className={styles.tickLabel}
            >
              {format("instrument.cutaway.metres", { value: metres(e) })}
            </div>
          ))}
          <p
            ref={upperRef}
            className={`${styles.statement} ${styles.side}`}
            data-statement="upper_slope"
          >
            {statement("upper_slope")?.text}
            {chips("upper_slope")}
          </p>
          {placeName && (
            <div ref={placeRef} className={styles.place} data-place>
              {placeName}
            </div>
          )}
          <p
            ref={floorRef}
            className={`${styles.statement} ${styles.onWallText}`}
            data-statement="valley_floor"
          >
            {statement("valley_floor")?.text}
            {chips("valley_floor")}
          </p>
          {(["instrument.cutaway.north", "instrument.cutaway.south"] as const).map((id, i) => (
            <div
              key={id}
              ref={(el) => {
                endRefs.current[i] = el;
              }}
              className={styles.tickLabel}
            >
              {en[id].text}
            </div>
          ))}
          <div ref={scaleRef} className={styles.scaleNote} data-scale-note>
            {format("instrument.layers.scale", { value: CUTAWAY_EXAG })}
          </div>
          <p className={styles.credit}>
            {credits.map((text, i) => (
              <span key={text}>
                <b>{i + 1}</b>
                {"\u00a0"}
                {text}
              </span>
            ))}
          </p>
        </>
      )}
    </div>
  );
}
