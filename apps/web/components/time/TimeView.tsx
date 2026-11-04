"use client";

// "Year by Year", in place over the overview's own land: one playhead from the first season's January to the last
// season's December, then the whole record. The land's pixels take each season's growing-season greenness (painted
// through the overview's footprint overlay) and each month's snow whitens its elevation band. The left column says
// where the season stands among the record's years and, on the driest years the track marks, how little rain fell;
// at the end each pixel's change spreads out from the outlet and the column says what the whole record shows. A
// paused or dragged playhead rests on a month's centre, so what stays on screen is measured. While the Ask, Sources or
// Limits cover the screen, the view's words step aside and the playhead waits. Every value comes from the case's own
// bundles (lib/time); the words are lib/time/words.ts's; no place is written here.

import type { CaseSnapshot } from "@siterra/contracts";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { tformat, tm, type TimeMessageId } from "../../lib/copy/time";
import { lonLatToUtm } from "../../lib/instruments/valley/utm";
import { bandLimitsOf } from "../../lib/land/record";
import { slopeColour } from "../../lib/overview/footprint";
import { cssColour } from "../../lib/theme/obsidian";
import { clockAt, restOn } from "../../lib/time/clock";
import { labelShown } from "../../lib/time/data";
import { loadTimeData, timeSourcesOf, type TimeData } from "../../lib/time/load";
import { paintMoment, rampLut, spreadOrder } from "../../lib/time/paint";
import {
  bandWords,
  dryWords,
  greenWords,
  monthOf,
  sharesWords,
  standingsOf,
  stepsWords,
  trendWord,
} from "../../lib/time/words";
import { Control } from "../controls/Control";
import { typing } from "../controls/ScreenChrome";
import styles from "./TimeView.module.css";

const t = (id: TimeMessageId) => tm[id].text;
/** Months per second while playing (26 years in about 21 s). */
const RATE = 15;
/** The whole record's spread, in playhead months after the last December. */
const TREND_SPAN = 30;
/** What covers the view: the open Ask, or Sources or Limits. */
const COVERS = "[data-ask-overlay][data-open], [data-sources-overlay]";

export interface TimeFrame {
  /** Each elevation band's lit rim point on screen (CSS px), lowest first. */
  edges: ({ x: number; y: number } | null)[];
  e: number;
}

/** What the view needs from the overview: the overlay's grid, the land state it sets, and each frame's band edges. */
export interface TimeMount {
  grid: () => {
    width: number;
    height: number;
    px: (E: number, N: number) => [number, number];
  } | null;
  push: (
    overlay: { canvas: HTMLCanvasElement; version: number } | null,
    snow: { limits: readonly [number, number]; shares: readonly [number, number, number] } | null,
  ) => void;
  subscribe: (f: (frame: TimeFrame) => void) => () => void;
}

const fmt = (v: number, dp: number) => {
  const r = Math.sign(v) * Math.round(Math.abs(v) * 10 ** dp);
  return (r / 10 ** dp).toFixed(dp);
};

export function TimeView({
  snapshot,
  open,
  mount,
}: {
  snapshot: CaseSnapshot;
  open: boolean;
  mount: TimeMount;
}) {
  const [data, setData] = useState<TimeData | null>(null);
  const [failed, setFailed] = useState(false);
  const [month, setMonth] = useState(0);
  const [reveal, setReveal] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [edges, setEdges] = useState<TimeFrame["edges"]>([]);
  const [covered, setCovered] = useState(false);
  const coveredRef = useRef(false);
  const pos = useRef(0);
  const play = useRef(false);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const version = useRef(0);
  const raf = useRef(0);
  const lut = useMemo(() => rampLut(), []);
  const limits = useMemo(() => bandLimitsOf(snapshot), [snapshot]);

  useEffect(() => {
    const src = timeSourcesOf(snapshot);
    if (!src) return;
    const ac = new AbortController();
    loadTimeData(snapshot.case.id, src, (i, init) => fetch(i, init), ac.signal)
      .then(setData)
      .catch((e: unknown) => {
        if (ac.signal.aborted) return;
        console.error("Seasons not loaded", e);
        setFailed(true);
      });
    return () => {
      ac.abort();
    };
  }, [snapshot]);

  // each pixel's share of the farthest distance from the outlet, for the whole record's spread
  const spread = useMemo(() => {
    if (!data) return [];
    const outlet = (snapshot.records.contextFeatureRecords ?? []).find((f) => f.role === "outlet");
    const g = outlet?.geometry;
    if (!g || g.type !== "Point") return data.cells.map(() => 0);
    const [lon, lat] = g.coordinates;
    const zone = Math.floor((lon + 180) / 6) + 1;
    return spreadOrder(data.cells, lonLatToUtm(lon, lat, zone));
  }, [data, snapshot]);

  // where each year stands among the record's years: by the catchment's greenness, and by its rain
  const greenPlaces = useMemo(
    () => standingsOf(data?.strata.find((s) => s.id === "catchment")?.ndvi ?? new Map()),
    [data],
  );
  const rainPlaces = useMemo(
    () => standingsOf(new Map((data?.rain ?? []).map((r) => [r.year, r.mm]))),
    [data],
  );

  const years = data?.cube.seasons.length ?? 0;
  const last = years * 12 - 1;

  /** Paints the land and its snow for the playhead's position, and hands both to the overview. */
  const draw = useCallback(() => {
    if (!data) return;
    const grid = mount.grid();
    if (!grid) return;
    if (!canvas.current) {
      const c = document.createElement("canvas");
      c.width = grid.width;
      c.height = grid.height;
      canvas.current = c;
    }
    const ctx = canvas.current.getContext("2d");
    if (!ctx) return;
    const p = pos.current;
    const inTrend = p > last;
    const c = clockAt(Math.min(p, last), data.cube.seasons[0] ?? 0, years);
    const rv = inTrend ? Math.min(1, (p - last) / TREND_SPAN) : null;
    paintMoment(ctx, grid.px, data.cube, data.cells, data.domain, data.trendScale, spread, lut, {
      season: c.season,
      next: c.next,
      blend: c.blend,
      reveal: rv,
    });
    version.current += 1;
    let snow: Parameters<TimeMount["push"]>[1] = null;
    if (limits) {
      const firstYear = data.cube.seasons[0] ?? 0;
      const id = (m: number) =>
        `${String(firstYear + Math.floor(m / 12))}-${String((m % 12) + 1).padStart(2, "0")}`;
      const a = data.snow?.months.get(id(Math.floor(Math.min(p, last))));
      const b = data.snow?.months.get(id(c.snowNext));
      const share = (k: number) => {
        const x = a?.[k] ?? 0;
        const y = b?.[k] ?? x;
        return inTrend ? 0 : x + (y - x) * c.snowW;
      };
      snow = { limits, shares: [share(0), share(1), share(2)] };
    }
    mount.push({ canvas: canvas.current, version: version.current }, snow);
    setMonth(c.month);
    setReveal(rv);
  }, [data, mount, last, years, spread, lut, limits]);

  // the playhead's clock
  const tick = useCallback(
    (now: number, prev: number) => {
      if (!play.current) return;
      const dt = Math.min(0.1, (now - prev) / 1000);
      pos.current = Math.min(last + TREND_SPAN, pos.current + dt * RATE);
      draw();
      if (pos.current >= last + TREND_SPAN) {
        play.current = false;
        setPlaying(false);
        return;
      }
      raf.current = requestAnimationFrame((n) => {
        tick(n, now);
      });
    },
    [draw, last],
  );
  const start = useCallback(() => {
    if (pos.current >= last + TREND_SPAN) pos.current = 0;
    play.current = true;
    setPlaying(true);
    const now = performance.now();
    raf.current = requestAnimationFrame((n) => {
      tick(n, now);
    });
  }, [tick, last]);
  const pause = useCallback(() => {
    play.current = false;
    setPlaying(false);
    cancelAnimationFrame(raf.current);
    // what stays on screen is a measured month
    if (pos.current <= last) pos.current = restOn(pos.current);
    draw();
  }, [draw, last]);
  const goTo = useCallback(
    (p: number) => {
      play.current = false;
      setPlaying(false);
      cancelAnimationFrame(raf.current);
      pos.current = Math.min(Math.max(p, 0), last + TREND_SPAN);
      draw();
    },
    [draw, last],
  );

  // the Ask, Sources and Limits cover the view: its words step aside and a playing playhead waits for them to close
  const resume = useRef(false);
  useEffect(() => {
    const root = document.querySelector("[data-overview-root]");
    if (!root) return;
    const check = () => {
      const c = root.querySelector(COVERS) !== null;
      coveredRef.current = c;
      setCovered(c);
    };
    check();
    const watch = new MutationObserver(check);
    watch.observe(root, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["data-open"],
    });
    return () => {
      watch.disconnect();
    };
  }, []);
  useEffect(() => {
    if (covered && play.current) {
      resume.current = true;
      pause();
    } else if (!covered && resume.current) {
      resume.current = false;
      start();
    }
  }, [covered, pause, start]);

  // it plays once on arrival, after the land has come to rest (or once whatever covers it closes)
  useEffect(() => {
    if (!open || !data) return;
    draw();
    const id = window.setTimeout(() => {
      if (coveredRef.current) resume.current = true;
      else start();
    }, 900);
    return () => {
      window.clearTimeout(id);
      play.current = false;
      cancelAnimationFrame(raf.current);
    };
  }, [open, data, draw, start]);

  // leaving hands the land back without the overlay or the snow (the overview fades both out as it closes)
  useEffect(() => {
    if (!open) mount.push(null, null);
    return () => {
      mount.push(null, null);
    };
  }, [open, mount]);

  useEffect(
    () =>
      mount.subscribe((f) => {
        setEdges((old) =>
          JSON.stringify(old) ===
          JSON.stringify(f.edges.map((p) => p && { x: Math.round(p.x), y: Math.round(p.y) }))
            ? old
            : f.edges.map((p) => p && { x: Math.round(p.x), y: Math.round(p.y) }),
        );
      }),
    [mount],
  );

  // Space plays and pauses, the arrows step a month (a year with Shift), Home and End go to the track's ends; never
  // while a field has the typing or something covers the view
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (coveredRef.current || typing(e)) return;
      if (e.key === " ") {
        if (play.current) pause();
        else start();
        e.preventDefault();
      } else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        const step = (e.shiftKey ? 12 : 1) * (e.key === "ArrowRight" ? 1 : -1);
        goTo(Math.min(restOn(pos.current) + step, last));
        e.preventDefault();
      } else if (e.key === "Home" || e.key === "End") {
        goTo(e.key === "Home" ? 0 : last + TREND_SPAN);
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [open, pause, start, goTo, last]);

  // the track: drag or click moves the playhead, resting on a month's centre
  const track = useRef<HTMLDivElement>(null);
  const span = last + TREND_SPAN;
  const fromPointer = (x: number) => {
    const r = track.current?.getBoundingClientRect();
    if (!r) return 0;
    const p = ((x - r.left) / r.width) * span;
    return p > last ? p : restOn(p);
  };

  if (!data || failed) return null;
  const firstYear = data.cube.seasons[0] ?? 0;
  const lastYear = data.cube.seasons.at(-1) ?? firstYear;
  const clock = clockAt(Math.min(month, last), firstYear, years);
  const year = firstYear + clock.season;
  const catchment = data.strata.find((s) => s.id === "catchment");
  const bands = data.strata.filter((s) => s.id.startsWith("elevation_"));
  const inTrend = reveal !== null;
  const snowAt = data.snow?.months.get(clock.monthId);
  const standing = greenPlaces.get(year);
  const dry = data.driest.find((d) => d.year === year);
  const dryStanding = dry ? rainPlaces.get(dry.year) : undefined;
  const word = catchment ? trendWord(catchment) : null;
  const steps = stepsWords(data.changeTiming);
  const trendKey = [-1, -0.5, 0, 0.5, 1].map((k) =>
    slopeColour(k * data.trendScale.domain, data.trendScale.domain, data.trendScale.neutral),
  );
  const greenKey = lut.filter((_, i) => i % 32 === 0 || i === 255).map((c) => cssColour(c));
  const head = (inTrend ? last + reveal * TREND_SPAN : month) / span;
  const at = (months: number) => `${String((months / span) * 100)}%`;

  return (
    <div
      className={styles.view}
      data-time-view=""
      data-state={open ? "in" : "out"}
      data-playing={playing ? "" : undefined}
      data-covered={covered ? "" : undefined}
    >
      <div className={styles.column}>
        {/* read aloud where the playhead rests, not every year it passes while it plays */}
        <section
          className={styles.readout}
          aria-live={playing ? "off" : "polite"}
          data-trend-state={inTrend ? "" : undefined}
        >
          {inTrend ? (
            <>
              <p className={styles.kicker}>
                {tformat("time.span", { from: firstYear, to: lastYear })}
              </p>
              {word ? (
                <p
                  className={styles.big}
                  data-trend=""
                  data-long={word.includes(" ") ? "" : undefined}
                >
                  {word}
                </p>
              ) : null}
              <p className={styles.place} data-shares="">
                {sharesWords(data.shares.catchment)}
              </p>
              {steps ? (
                <p className={styles.note} data-change-timing="">
                  {steps}
                </p>
              ) : null}
            </>
          ) : (
            <>
              <p className={styles.big} data-year={year}>
                {year}
              </p>
              <p className={styles.place} data-year-place="">
                {standing ? greenWords(standing) : t("time.noValue")}
              </p>
              <p className={styles.measure}>
                {tformat("time.measure", { window: data.cube.window.label })}
              </p>
              {dry && dryStanding ? (
                <p className={styles.note} data-dry-year="">
                  <span className={styles.dryGlyph} aria-hidden="true" />
                  {dryWords(dryStanding, dry)}
                </p>
              ) : null}
            </>
          )}
        </section>

        {/* the playhead under the year it moves: the months, the driest years, the whole record at the end */}
        <section className={styles.player} aria-label={t("time.playhead")}>
          <div
            ref={track}
            className={styles.track}
            role="slider"
            tabIndex={0}
            aria-valuemin={0}
            aria-valuemax={span}
            aria-valuenow={Math.round(head * span)}
            aria-valuetext={inTrend ? t("time.trendTick") : monthOf(clock.monthId, true)}
            style={{ "--at": `${String(head * 100)}%` } as CSSProperties}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              goTo(fromPointer(e.clientX));
            }}
            onPointerMove={(e) => {
              if (e.buttons === 1) goTo(fromPointer(e.clientX));
            }}
          >
            <span className={styles.headLabel}>{inTrend ? null : monthOf(clock.monthId)}</span>
            <span className={styles.line} style={{ left: 0, width: at(last) }} />
            <span className={`${styles.line} ${styles.trendLine}`} style={{ left: at(last) }} />
            {data.driest.map((d) => (
              <span
                key={d.year}
                className={styles.dryMark}
                style={{ left: at((d.year - firstYear) * 12 + 1), width: at(10) }}
              />
            ))}
            {data.cube.seasons
              .filter((y) => y % 10 === 0)
              .map((y) => (
                <span
                  key={y}
                  className={styles.tick}
                  data-first={y === firstYear ? "" : undefined}
                  style={{ left: at((y - firstYear) * 12) }}
                >
                  {y}
                </span>
              ))}
            <span className={styles.tick} style={{ left: at(last + TREND_SPAN / 2) }}>
              {t("time.trendTick")}
            </span>
            <span className={styles.head} style={{ left: `${String(head * 100)}%` }} />
          </div>
          <div className={styles.controls}>
            <Control
              variant="quiet"
              keyHint="Space"
              keyShortcut="Space"
              onClick={() => {
                if (play.current) pause();
                else start();
              }}
            >
              {playing ? t("time.pause") : t("time.play")}
            </Control>
            {data.driest.length ? (
              <span className={styles.dryKey}>
                <span className={styles.dryGlyph} aria-hidden="true" />
                {tformat("time.dryKey", { n: data.driest.length })}
              </span>
            ) : null}
          </div>
        </section>

        {/* the land's colours, in the column with the view's other words: the land's right is the band labels' */}
        <aside className={styles.key}>
          <p className={styles.keyTitle}>{inTrend ? t("time.keyTrend") : t("time.key")}</p>
          <span
            className={styles.ramp}
            style={{
              background: `linear-gradient(to right, ${(inTrend ? trendKey : greenKey).join(", ")})`,
            }}
          />
          <span className={styles.ticks}>
            {inTrend ? (
              <>
                <span>{t("time.browner")}</span>
                <span>{t("time.greener")}</span>
              </>
            ) : (
              <>
                <span>{fmt(data.domain[0], 2)}</span>
                <span>{fmt(data.domain[1], 2)}</span>
              </>
            )}
          </span>
        </aside>
      </div>

      {limits
        ? bands.map((b, i) => {
            const p = edges[i];
            if (!p) return null;
            const share = snowAt?.[i] ?? null;
            const line = inTrend
              ? bandWords(data.shares.groups.get(b.id))
              : share !== null && share >= 0.005
                ? tformat("time.snow", { share: `${String(Math.round(share * 100))}%` })
                : null;
            return (
              <div
                key={b.id}
                className={styles.band}
                style={{ transform: `translate(${String(p.x)}px, ${String(p.y)}px)` }}
              >
                <span className={styles.bandLeader} />
                <span className={styles.bandDot} />
                <span className={styles.bandText}>
                  <span className={styles.bandName}>{labelShown(b.label)}</span>
                  {line ? <span className={styles.bandValue}>{line}</span> : null}
                </span>
              </div>
            );
          })
        : null}
    </div>
  );
}
