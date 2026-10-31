"use client";

// "See It Over Time" (specimen T, UI-2), in place over the overview's own land: one playhead from the first season's
// January to the last season's December, then the trend. The land's pixels take each season's growing-season NDVI
// (painted through the overview's footprint overlay), each month's snow whitens its elevation band, the four driest
// seasons by the place's rainfall window are marked on the track, and at the end each pixel's trend spreads out from
// the outlet. A paused or dragged playhead rests on a month's centre, so what stays on screen is measured; blended
// frames are named in the key. Every value comes from the case's own bundles (lib/time); no place is written here.

import type { CaseSnapshot } from "@siterra/contracts";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { tformat, tm, type TimeMessageId } from "../../lib/copy/time";
import { lonLatToUtm } from "../../lib/instruments/valley/utm";
import { bandLimitsOf } from "../../lib/land/record";
import { slopeColour } from "../../lib/overview/footprint";
import { cssColour } from "../../lib/theme/obsidian";
import { clockAt, restOn } from "../../lib/time/clock";
import { labelShown } from "../../lib/time/data";
import { loadTimeData, timeSourcesOf, type TimeData } from "../../lib/time/load";
import { paintMoment, rampLut, spreadOrder } from "../../lib/time/paint";
import { Control } from "../controls/Control";
import styles from "./TimeView.module.css";

const t = (id: TimeMessageId) => tm[id].text;
/** Months per second while playing (26 years in about 21 s, as the specimen played). */
const RATE = 15;
/** The trend's spread, in playhead months after the last December. */
const TREND_SPAN = 30;

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
const signed = (v: number, dp: number) => (v > 0 ? `+${fmt(v, dp)}` : fmt(v, dp));
const monthName = (id: string, long = false) => {
  const [y, m] = id.split("-").map(Number);
  return new Date(Date.UTC(y ?? 2000, (m ?? 1) - 1, 15)).toLocaleString("en", {
    month: long ? "long" : "short",
    year: "numeric",
    timeZone: "UTC",
  });
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

  // each pixel's share of the farthest distance from the outlet, for the trend's spread
  const spread = useMemo(() => {
    if (!data) return [];
    const outlet = (snapshot.records.contextFeatureRecords ?? []).find((f) => f.role === "outlet");
    const g = outlet?.geometry;
    if (!g || g.type !== "Point") return data.cells.map(() => 0);
    const [lon, lat] = g.coordinates;
    const zone = Math.floor((lon + 180) / 6) + 1;
    return spreadOrder(data.cells, lonLatToUtm(lon, lat, zone));
  }, [data, snapshot]);

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

  // it plays once on arrival, after the land has come to rest
  useEffect(() => {
    if (!open || !data) return;
    draw();
    const id = window.setTimeout(start, 900);
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

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === " ") {
        if (play.current) pause();
        else start();
        e.preventDefault();
      } else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        const step = (e.shiftKey ? 12 : 1) * (e.key === "ArrowRight" ? 1 : -1);
        goTo(Math.min(restOn(pos.current) + step, last));
        e.preventDefault();
      } else if (e.key === "Home" || e.key === "End") {
        // the slider's ends: the first season's January, or the trend at the end of the track
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
  const clock = clockAt(Math.min(month, last), firstYear, years);
  const year = firstYear + clock.season;
  const catchment = data.strata.find((s) => s.id === "catchment");
  const bands = data.strata.filter((s) => s.id.startsWith("elevation_"));
  const dry = data.driest.find((d) => d.year === year);
  const inTrend = reveal !== null;
  const snowAt = data.snow?.months.get(clock.monthId);
  const trendKey = [-1, -0.5, 0, 0.5, 1].map((k) =>
    slopeColour(k * data.trendScale.domain, data.trendScale.domain, data.trendScale.neutral),
  );
  const greenKey = lut.filter((_, i) => i % 32 === 0 || i === 255).map((c) => cssColour(c));
  const head = (reveal !== null ? last + reveal * TREND_SPAN : month) / span;

  return (
    <div
      className={styles.view}
      data-time-view=""
      data-state={open ? "in" : "out"}
      data-playing={playing ? "" : undefined}
    >
      {/* the case question keeps its place under the breadcrumb, as on every view */}
      <p className={styles.question} data-chrome="">
        {snapshot.case.objective}
      </p>
      <section className={styles.readout} aria-live="polite">
        {inTrend ? (
          <>
            <p className={styles.kicker}>{tformat("time.trendKicker", { n: years })}</p>
            <p className={styles.big}>{signed(catchment?.slopePerDecade ?? 0, 4)}</p>
            <p className={styles.label}>
              {tformat("time.trendValue", {
                window: data.cube.window.label,
              })}
            </p>
            <p className={styles.timing} data-change-timing="">
              {data.changeTiming.upwardFdrPixels > 0 && data.changeTiming.medianYearUpward !== null
                ? tformat("time.changeTiming", {
                    year: data.changeTiming.medianYearUpward,
                    count: new Intl.NumberFormat("en").format(data.changeTiming.upwardFdrPixels),
                  })
                : t("time.changeTimingNone")}
            </p>
            <p className={styles.scan} data-regional-scan="">
              {tformat("time.regionalScan", {
                total: new Intl.NumberFormat("en").format(data.regionalScan.windowTestedPixels),
                inside: (data.regionalScan.inCatchment.upwardTrendFdrShare * 100).toFixed(1),
                outside: (data.regionalScan.outsideCatchment.upwardTrendFdrShare * 100).toFixed(1),
              })}
            </p>
          </>
        ) : (
          <>
            <p className={styles.big} data-year={year}>
              {year}
            </p>
            <p className={styles.value}>{fmt(catchment?.ndvi.get(year) ?? Number.NaN, 3)}</p>
            <p className={styles.label}>
              {tformat("time.value", {
                window: data.cube.window.label,
              })}
            </p>
            {dry ? (
              <p className={styles.dry}>
                {tformat("time.driest", {
                  n: data.driest.length,
                  mm: Math.round(dry.mm),
                  from: monthName(dry.from),
                  to: monthName(dry.to),
                })}
              </p>
            ) : null}
          </>
        )}
      </section>

      {limits
        ? bands.map((b, i) => {
            const p = edges[i];
            if (!p) return null;
            const share = snowAt?.[i] ?? null;
            const zone = data.regionalScan.zones.find((z) => z.group === b.id);
            return (
              <div
                key={b.id}
                className={styles.band}
                style={{ transform: `translate(${p.x}px, ${p.y}px)` }}
              >
                <span className={styles.bandLeader} />
                <span className={styles.bandDot} />
                <span className={styles.bandText}>
                  <span className={styles.bandName}>{labelShown(b.label)}</span>
                  <span className={styles.bandValue}>
                    {inTrend
                      ? signed(b.slopePerDecade ?? 0, 4)
                      : fmt(b.ndvi.get(year) ?? Number.NaN, 3)}
                    {inTrend &&
                    zone &&
                    zone.upwardChangepointFdrPixels > 0 &&
                    zone.medianChangeYear !== null ? (
                      <span
                        className={styles.bandTiming}
                        data-band-change-year={zone.medianChangeYear}
                      >
                        {" "}
                        {tformat("time.bandTiming", {
                          rank: zone.rank,
                          year: zone.medianChangeYear,
                        })}
                      </span>
                    ) : null}
                    {!inTrend && share !== null && share >= 0.005 ? (
                      <span className={styles.snow}>
                        {" "}
                        {tformat("time.snow", { share: `${String(Math.round(share * 100))}%` })}
                      </span>
                    ) : null}
                  </span>
                </span>
              </div>
            );
          })
        : null}

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
              <span>{signed(-data.trendScale.domain, 2)}</span>
              <span>{signed(data.trendScale.domain, 2)}</span>
            </>
          ) : (
            <>
              <span>{fmt(data.domain[0], 2)}</span>
              <span>{fmt(data.domain[1], 2)}</span>
            </>
          )}
        </span>
        {data.snow ? null : <p className={styles.keyNote}>{t("time.noSnow")}</p>}
        {/* only while values are blended: a playhead at rest on a month's centre shows stored values */}
        {!inTrend && (playing || !clock.measured) ? (
          <p className={styles.keyNote}>{t("time.blended")}</p>
        ) : null}
      </aside>

      {/* the playhead is a global control (the lead, 20:38): its year ticks are not counted in the text budget */}
      <section className={styles.player} aria-label={t("time.playhead")} data-chrome="">
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
        <div
          ref={track}
          className={styles.track}
          role="slider"
          tabIndex={0}
          aria-valuemin={0}
          aria-valuemax={span}
          aria-valuenow={Math.round(head * span)}
          aria-valuetext={inTrend ? t("time.trendTick") : monthName(clock.monthId)}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            goTo(fromPointer(e.clientX));
          }}
          onPointerMove={(e) => {
            if (e.buttons === 1) goTo(fromPointer(e.clientX));
          }}
        >
          {data.driest.map((d) => (
            <span
              key={d.year}
              className={styles.dryMark}
              style={{ left: `${(((d.year - firstYear) * 12 + 2) / span) * 100}%` }}
            />
          ))}
          {data.changeTiming.medianYearUpward !== null && data.changeTiming.upwardFdrPixels > 0 ? (
            <span
              className={styles.changeMark}
              data-change-year-mark={data.changeTiming.medianYearUpward}
              style={{
                left: `${(((data.changeTiming.medianYearUpward - firstYear) * 12) / span) * 100}%`,
              }}
            >
              {!inTrend && Math.abs(year - data.changeTiming.medianYearUpward) <= 3 ? null : (
                <span className={styles.changeMarkLabel}>
                  {tformat("time.changeYearMark", { year: data.changeTiming.medianYearUpward })}
                </span>
              )}
            </span>
          ) : null}
          {data.cube.seasons
            .filter((y) => y % 10 === 0)
            .map((y) => (
              <span
                key={y}
                className={styles.tick}
                style={{ left: `${(((y - firstYear) * 12) / span) * 100}%` }}
              >
                {y}
              </span>
            ))}
          <span
            className={styles.tick}
            style={{ left: `${((last + TREND_SPAN / 2) / span) * 100}%` }}
          >
            {t("time.trendTick")}
          </span>
          <span className={styles.head} style={{ left: `${head * 100}%` }}>
            <span className={styles.headLabel}>{inTrend ? null : monthName(clock.monthId)}</span>
          </span>
        </div>
      </section>
    </div>
  );
}
