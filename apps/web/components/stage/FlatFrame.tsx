"use client";

// The frame of the flat reading: graticule ticks at the four edges and a scale bar, from the map's own
// projection, following every render. Shown once the camera has reached the top-down view.

import type * as maplibregl from "maplibre-gl";
import { useEffect, useState } from "react";
import { format } from "../../lib/copy/en";
import { graticuleTicks, metresPerPx, scaleBar } from "../../lib/stage/flat";
import styles from "./ValleyStage.module.css";

interface Tick {
  key: string;
  at: number;
  label: string;
}

interface Frame {
  lon: Tick[];
  lat: Tick[];
  bar: { px: number; label: string };
}

function degrees(v: number, decimals: number, id: "flat.lonW" | "flat.latN"): string {
  return format(id, { deg: Math.abs(v).toFixed(decimals) });
}

/** Labels stay clear of the corners, the mode line at the top centre, and the hints and credit below. */
const CLEAR = { side: 140, modeHalf: 130, top: 70, bottom: 150 };

const between = (v: number, lo: number, hi: number) =>
  Math.min(Math.max(v, lo), hi) === v && v !== lo && v !== hi;

function measure(m: maplibregl.Map): Frame {
  const canvas = m.getCanvas();
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  const nw = m.unproject([0, 0]);
  const se = m.unproject([w, h]);
  const lonT = graticuleTicks(nw.lng, se.lng, 8);
  const latT = graticuleTicks(se.lat, nw.lat, 6);
  const mid = m.getCenter();
  const bar = scaleBar(metresPerPx(mid.lat, m.getZoom()), 160);
  return {
    lon: lonT.values
      .map((v) => ({
        key: v.toFixed(lonT.decimals),
        at: m.project([v, mid.lat]).x,
        label: degrees(v, lonT.decimals, "flat.lonW"),
      }))
      .filter(
        (t) => between(t.at, CLEAR.side, w - CLEAR.side) && Math.abs(t.at - w / 2) > CLEAR.modeHalf,
      ),
    lat: latT.values
      .map((v) => ({
        key: v.toFixed(latT.decimals),
        at: m.project([mid.lng, v]).y,
        label: degrees(v, latT.decimals, "flat.latN"),
      }))
      .filter((t) => between(t.at, CLEAR.top, h - CLEAR.bottom)),
    bar: {
      px: bar.px,
      label:
        bar.metres >= 1000
          ? format("flat.km", { n: bar.metres / 1000 })
          : format("flat.m", { n: bar.metres }),
    },
  };
}

export function FlatFrame({ map }: { map: maplibregl.Map }) {
  const [frame, setFrame] = useState<Frame>(() => measure(map));
  useEffect(() => {
    const update = () => {
      setFrame(measure(map));
    };
    map.on("render", update);
    window.addEventListener("resize", update);
    return () => {
      map.off("render", update);
      window.removeEventListener("resize", update);
    };
  }, [map]);
  return (
    <div className={styles.flatFrame} aria-hidden="true" data-flat-frame="true">
      {frame.lon.map((t) => (
        <span key={`lon-${t.key}`} className={styles.tickTop} style={{ left: t.at }}>
          {t.label}
        </span>
      ))}
      {frame.lon.map((t) => (
        <span key={`lonb-${t.key}`} className={styles.tickBottom} style={{ left: t.at }} />
      ))}
      {frame.lat.map((t) => (
        <span key={`lat-${t.key}`} className={styles.tickLeft} style={{ top: t.at }}>
          {t.label}
        </span>
      ))}
      {frame.lat.map((t) => (
        <span key={`latr-${t.key}`} className={styles.tickRight} style={{ top: t.at }} />
      ))}
      <div className={styles.scaleBar} data-scale-bar={frame.bar.label}>
        <span className={styles.scaleLine} style={{ width: frame.bar.px }} />
        <span>{frame.bar.label}</span>
      </div>
    </div>
  );
}
