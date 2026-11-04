"use client";

// Elevation Bands: the catchment cut north to south through its place, the section face as the hero. The headline
// says where greenness changed most, from the three bands' own trends (lib/instruments/valley/band-lead.ts), with
// the record's caption line under it. Against the face at each band's height: the band's name, its March to June
// trend and its monthly snow cover, on one hairline each; the two published statements, each waiting as the plain
// name of the part it describes and opening its words and references on focus or hover; the ruler, the limits and
// the place on the model. The scene is three.js (lib/instruments/valley/scene/cutaway.ts); the words are HTML, placed after
// every render so they follow the model when it is turned.

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from "react";
import { en, format, type MessageId } from "../../lib/copy/en";
import { bandLimitsOf } from "../../lib/land/record";
import { keepTogether } from "../../lib/instruments/caption";
import { metres, percent, signed } from "../../lib/instruments/format";
import { citedText } from "../../lib/instruments/placed-statements";
import { bandLead, type BandId } from "../../lib/instruments/valley/band-lead";
import { loadCutawayData, type CutawayData } from "../../lib/instruments/valley/cutaway-data";
import type { Vec3 } from "../../lib/instruments/valley/frame";
import { SNOW_YEARS } from "../../lib/instruments/valley/fixtures";
import { snowColour } from "../../lib/instruments/valley/palette";
import {
  cutawayExag,
  cutawayRuler,
  mountCutaway,
  type CutawayScene,
} from "../../lib/instruments/valley/scene/cutaway";
import { cssColour } from "../../lib/theme/obsidian";
import { useShellPalette, useShellView, type ViewHandle } from "./ShellContext";
import styles from "./InstrumentCutaway.module.css";
import { useInstrument } from "./InstrumentRecords";
import { useTeardown, type Teardown } from "./useTeardown";

/** Top to bottom, as they stand on the face. */
const BANDS: readonly BandId[] = ["elevation_high", "elevation_mid", "elevation_low"];

const bandName = (id: BandId, limits: readonly [number, number]) => {
  const lower = metres(limits[0]);
  const upper = metres(limits[1]);
  if (id === "elevation_high") return format("instrument.cutaway.band.high", { limit: upper });
  if (id === "elevation_mid") return format("instrument.cutaway.band.mid", { lower, upper });
  return format("instrument.cutaway.band.low", { limit: lower });
};

/** Where a band is, inside the headline's sentence. */
const WHERE: Record<BandId, MessageId> = {
  elevation_high: "instrument.cutaway.where.high",
  elevation_mid: "instrument.cutaway.where.mid",
  elevation_low: "instrument.cutaway.where.low",
};

/** Arrow keys turn the model (degrees of bearing, of elevation); Home shows the measured view. */
const TURN: Record<string, [number, number]> = {
  ArrowLeft: [5, 0],
  ArrowRight: [-5, 0],
  ArrowUp: [0, 3],
  ArrowDown: [0, -3],
};

type Anchor =
  "left-middle" | "left-top" | "right-middle" | "right-bottom" | "center-top" | "center-bottom";

/** The published statements, each named on the section by the part it describes, in plain words. */
type StatementId = "upper_slope" | "valley_floor";
const STATEMENT_AT: Record<StatementId, MessageId> = {
  upper_slope: "instrument.cutaway.at.upper_slope",
  valley_floor: "instrument.cutaway.at.valley_floor",
};

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

/** The section cut through in place over the overview's land; the clock is useTeardown's. */
const TEAR_S = { in: 2.8, back: 1.5 } as const;

export function InstrumentCutaway({ teardown }: { teardown?: Teardown } = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bandRefs = useRef<(HTMLDivElement | null)[]>([]);
  const bandLeaderRefs = useRef<(SVGLineElement | null)[]>([]);
  const bandDotRefs = useRef<(SVGCircleElement | null)[]>([]);
  const stripRef = useRef<HTMLSpanElement>(null);
  const monthsRef = useRef<HTMLDivElement>(null);
  const snowRef = useRef<HTMLDivElement>(null);
  const limitRefs = useRef<(HTMLDivElement | null)[]>([]);
  const tickRefs = useRef<(HTMLDivElement | null)[]>([]);
  const upperRef = useRef<HTMLDivElement>(null);
  const upperStemRef = useRef<SVGLineElement>(null);
  const upperDotRef = useRef<SVGCircleElement>(null);
  const placeRef = useRef<HTMLDivElement>(null);
  const placeTickRef = useRef<SVGLineElement>(null);
  const floorRef = useRef<HTMLDivElement>(null);
  const floorStemRef = useRef<SVGLineElement>(null);
  const endRefs = useRef<(HTMLDivElement | null)[]>([]);
  const scaleRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<CutawayScene | null>(null);
  const { tearing, kick } = useTeardown(sceneRef, teardown, TEAR_S.in, TEAR_S.back);
  // the shell's view control and key R reset and zoom this view
  const viewHandle = useMemo<ViewHandle>(
    () => ({
      reset: () => sceneRef.current?.reset(),
      zoomBy: (f: number) => sceneRef.current?.stage.zoomBy(f),
    }),
    [],
  );
  useShellView(viewHandle);
  const [data, setData] = useState<CutawayData | null>(null);
  const [placeName, setPlaceName] = useState<string | null>(null);
  // the statement whose words are open (its chip focused or under the pointer); at rest both wait as chips
  const [openStatement, setOpenStatement] = useState<StatementId | null>(null);
  const [loadFailed, setFailed] = useState(false);
  const record = useInstrument("cross_section");
  // the scene, the leaders and the snow strips in the app's theme
  const pal = useShellPalette();
  const snowKey = `linear-gradient(90deg, ${pal.snow.join(", ")})`;
  // the cross section spec draws no land cover raster yet: the layer stack's is read in its place
  const stack = useInstrument("layer_stack");
  const landFrom = stack.status === "ready" ? stack.view : null;
  // an instrument the case holds no spec for cannot be drawn
  const failed = loadFailed || record.status === "failed" || record.status === "absent";
  const view = record.status === "ready" ? record.view : null;
  const snapshot = record.status === "ready" ? record.snapshot : null;
  const caption = view?.spec.caption ?? null;
  const keysId = useId();

  useEffect(() => {
    if (!view || !snapshot) return;
    const ac = new AbortController();
    loadCutawayData(
      view,
      snapshot,
      landFrom ? [landFrom] : [],
      (input, init) => fetch(input, init),
      ac.signal,
    ).then(setData, (e: unknown) => {
      if (ac.signal.aborted) return;
      console.error("Cutaway not loaded", e);
      setFailed(true);
    });
    return () => {
      ac.abort();
    };
  }, [view, snapshot, landFrom]);

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
      const at = [(yTop + yU) / 2, (yU + yL) / 2, yL + (yL - yU) / 2];
      // a low place's bands are a few px apart on the face: each block keeps at least its own height below the one
      // above it, its hairline still from its own band's middle
      const BLOCK = 58;
      const ys = at.slice();
      for (let i = 1; i < ys.length; i++) ys[i] = Math.max(ys[i] ?? 0, (ys[i - 1] ?? 0) + BLOCK);
      ys.forEach((y, i) => {
        const from = at[i] ?? y;
        place(bandRefs.current[i] ?? null, colX, y, "left-middle");
        line(bandLeaderRefs.current[i] ?? null, south.x + 1, from, colX - 6, y);
        dot(bandDotRefs.current[i] ?? null, south.x + 1, from);
      });
      // the month initials under the lowest strip, the snow key under them; where the snow recipe does not apply, the
      // one line that says so under the lowest band
      const strip = stripRef.current;
      const lowest = bandRefs.current[BANDS.length - 1] ?? null;
      const root = canvas.parentElement;
      if (strip && root) {
        const sr = strip.getBoundingClientRect();
        const rr = root.getBoundingClientRect();
        const m = place(monthsRef.current, sr.left - rr.left, sr.bottom - rr.top + 3, "left-top");
        if (m) place(snowRef.current, sr.left - rr.left, m.bottom + 8, "left-top");
      } else if (lowest && root) {
        const lr = lowest.getBoundingClientRect();
        const rr = root.getBoundingClientRect();
        place(snowRef.current, lr.left - rr.left, lr.bottom - rr.top + 8, "left-top");
      }
      // the two limits, labelled on the face just above each line near the south edge
      [yL, yU].forEach((y, i) =>
        place(limitRefs.current[i] ?? null, south.x - 8, y - 2, "right-bottom"),
      );
      // upper rangelands above the high slopes at the south end, on a short stem down to the profile: its chip right
      // over the stem, its words (when open) ending at the south end
      const hp = P(marks.highSlope);
      const upperOpen = upperRef.current?.hasAttribute("data-open") ?? false;
      const ur = upperOpen
        ? place(upperRef.current, Math.min(width - 16, south.x + 210), yTop - 18, "right-bottom")
        : place(upperRef.current, hp.x, yTop - 18, "center-bottom");
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

    mountCutaway(canvas, data, pal).then(
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
        kick();
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
  }, [data, caption, kick, pal]);

  // the place's label appears after the scene has found it on the line, and a statement opens or closes; lay the
  // words out again then
  useEffect(() => {
    sceneRef.current?.stage.render();
  }, [placeName, openStatement]);

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
  // where greenness changed most and whether every band's interval clears zero, from the bands' own trends
  const headline = data
    ? (() => {
        const l = bandLead(data.figures.season_trend);
        const lower = metres(data.limits[0]);
        const upper = metres(data.limits[1]);
        const where = format(WHERE[l.band], {
          limit: l.band === "elevation_high" ? upper : lower,
          lower,
          upper,
        });
        return {
          lead: format(
            l.direction === "rose"
              ? "instrument.cutaway.lead.rose"
              : "instrument.cutaway.lead.fell",
            { where },
          ),
          clear:
            en[
              l.clear === "up"
                ? "instrument.cutaway.clear.up"
                : l.clear === "down"
                  ? "instrument.cutaway.clear.down"
                  : "instrument.cutaway.clear.mixed"
            ].text,
        };
      })()
    : null;
  // a statement on the section: the name of the part it describes, and its words with their references while it is
  // open
  const statementAt = (
    id: StatementId,
    ref: RefObject<HTMLDivElement | null>,
    className: string,
  ) => {
    // a place whose record publishes no such statement shows no name for it
    if (!statement(id)) return null;
    const open = openStatement === id;
    const close = () => {
      setOpenStatement((o) => (o === id ? null : o));
    };
    return (
      <div ref={ref} className={className} data-statement={id} data-open={open ? "" : undefined}>
        <button
          type="button"
          className={styles.statementChip}
          aria-expanded={open}
          data-statement-chip={id}
          onFocus={() => {
            setOpenStatement(id);
          }}
          onBlur={close}
          onPointerEnter={() => {
            setOpenStatement(id);
          }}
          onPointerLeave={(e) => {
            if (document.activeElement !== e.currentTarget) close();
          }}
          onClick={() => {
            setOpenStatement(id);
          }}
        >
          {en[STATEMENT_AT[id]].text}
        </button>
        {open ? (
          <span className={styles.statementText} data-statement-text>
            {(() => {
              const st = statement(id);
              return st ? citedText(st) : null;
            })()}
          </span>
        ) : null}
      </div>
    );
  };
  return (
    <div className={styles.root} data-instrument="cutaway" data-tearing={tearing ? "" : undefined}>
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
          {/* a record without its two band limits is a blocked state, not a failure (AUDIT's U23 advisory) */}
          {
            en[
              record.status === "ready" && bandLimitsOf(record.snapshot) === null
                ? "instrument.noBandLimits"
                : "instrument.cutaway.failed"
            ].text
          }
        </p>
      )}
      {/* the record's figure at once (no bare land while the section's assets arrive), the headline over it once
          the bands are read; a quiet line while the section is still drawn */}
      {caption && !failed && (
        <div className={styles.brief} data-cut-headline>
          {headline ? <p className={styles.lead}>{headline.lead}</p> : null}
          <p className={styles.unit}>{keepTogether(caption.ink)}</p>
          {headline ? <p className={styles.qual}>{headline.clear}</p> : null}
          {!data || tearing ? (
            <p className={styles.drawing} data-cut-drawing>
              {en["instrument.cutaway.drawing"].text}
            </p>
          ) : null}
        </div>
      )}
      {data && caption && !failed && (
        <>
          <svg className={styles.leaders} aria-hidden="true">
            {BANDS.map((id, i) => (
              <g key={id}>
                <line
                  ref={(e) => {
                    bandLeaderRefs.current[i] = e;
                  }}
                  stroke={pal.leaderQuiet}
                  strokeWidth={1}
                />
                <circle
                  ref={(e) => {
                    bandDotRefs.current[i] = e;
                  }}
                  r={2}
                  fill={pal.leaderDot}
                />
              </g>
            ))}
            {statement("upper_slope") ? (
              <>
                <line ref={upperStemRef} stroke={pal.leaderQuiet} strokeWidth={1} />
                <circle ref={upperDotRef} r={2} fill={pal.leaderDot} />
              </>
            ) : null}
            {placeName && <line ref={placeTickRef} stroke={pal.leaderDot} strokeWidth={1} />}
            {statement("valley_floor") ? (
              <line ref={floorStemRef} stroke={pal.leaderOnWall} strokeWidth={1} />
            ) : null}
          </svg>
          {BANDS.map((id, i) => (
            <div
              key={id}
              ref={(e) => {
                bandRefs.current[i] = e;
              }}
              className={styles.band}
              data-band={id}
            >
              <div className={styles.bandName}>{bandName(id, data.limits)}</div>
              <div className={styles.bandFig}>
                <b>{signed(data.figures.season_trend[id].per_decade, 4)}</b>{" "}
                {en["instrument.cutaway.band.unit"].text}
              </div>
              {data.snow ? (
                <span ref={i === BANDS.length - 1 ? stripRef : undefined} className={styles.strip}>
                  {(data.snow.bands[id]?.monthly_mean ?? []).map((v, m) => (
                    <i
                      key={data.snow?.months[m] ?? m}
                      title={`${data.snow?.months[m] ?? ""} ${percent(v, 0)}`}
                      style={{ background: cssColour(snowColour(v, pal.snow)) }}
                    />
                  ))}
                </span>
              ) : null}
            </div>
          ))}
          {data.snow ? (
            <>
              <div ref={monthsRef} className={styles.months} aria-hidden="true">
                {data.snow.months.map((m) => (
                  <span key={m}>{m.charAt(0)}</span>
                ))}
              </div>
              <div ref={snowRef} className={styles.snowKey}>
                <div>{en["instrument.cutaway.snow"].text}</div>
                <div>
                  {format("instrument.cutaway.snow.years", {
                    from: SNOW_YEARS[0],
                    to: SNOW_YEARS[1],
                  })}
                  <span className={styles.rampKey}>
                    <span>{0}</span>
                    <i style={{ background: snowKey }} />
                    <span>{percent(1, 0)}</span>
                  </span>
                </div>
              </div>
            </>
          ) : (
            // the snow summary records the recipe as not applicable here: no snow is drawn, and the line says why
            <div ref={snowRef} className={styles.snowKey} data-no-snow>
              {en["instrument.cutaway.noSnow"].text}
            </div>
          )}
          {data.limits.map((e, i) => (
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
          {cutawayRuler(data).labels.map((e, i) => (
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
          {statementAt("upper_slope", upperRef, `${styles.statement} ${styles.side}`)}
          {placeName && (
            <div ref={placeRef} className={styles.place} data-place>
              {placeName}
            </div>
          )}
          {statementAt("valley_floor", floorRef, `${styles.statement} ${styles.onWallText}`)}
          {/* the words at the section's foot stand where the open Ask's label does: they step aside while it is open */}
          {(["instrument.cutaway.north", "instrument.cutaway.south"] as const).map((id, i) => (
            <div
              key={id}
              ref={(el) => {
                endRefs.current[i] = el;
              }}
              className={styles.tickLabel}
              data-ask-aside
              data-section-foot
            >
              {en[id].text}
            </div>
          ))}
          <div
            ref={scaleRef}
            className={styles.scaleNote}
            data-scale-note
            data-ask-aside
            data-section-foot
          >
            {format("instrument.layers.scale", { value: cutawayExag(data) })}
          </div>
        </>
      )}
    </div>
  );
}
