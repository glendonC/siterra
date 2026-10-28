"use client";

// The area Siterra understood, drawn on the land with points you can drag. Nothing runs until it is
// confirmed. Also the free-hand loop for drawing an area.

import type * as maplibregl from "maplibre-gl";
import { useMemo, useRef, useState } from "react";
import { useLand, type ScreenPt } from "./useLand";
import styles from "./Story.module.css";

type LngLat = [number, number];

export function AreaEdge({
  map,
  edge,
  onEdge,
}: {
  map: maplibregl.Map | null;
  edge: LngLat[];
  onEdge: (next: LngLat[]) => void;
}) {
  const points = useMemo(() => edge.map((at, i) => ({ id: String(i), at })), [edge]);
  const land = useLand(map, points);
  const [drag, setDrag] = useState<number | null>(null);
  const pts = edge.map((_, i) => land[String(i)]).filter((p): p is ScreenPt => Boolean(p));
  if (!map || pts.length !== edge.length) return null;
  const d = pts.map((p, i) => `${i ? "L" : "M"}${String(p.x)} ${String(p.y)}`).join("") + "Z";

  const start = (i: number) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDrag(i);
    const move = (ev: PointerEvent) => {
      const rect = map.getCanvas().getBoundingClientRect();
      const ll = map.unproject([ev.clientX - rect.left, ev.clientY - rect.top]);
      onEdge(edge.map((p, k) => (k === i ? [ll.lng, ll.lat] : p)));
    };
    const up = () => {
      setDrag(null);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <svg className={styles.edge} data-dragging={drag === null ? "false" : "true"}>
      <path className={styles.edgeFill} d={d} />
      <path className={styles.edgeCasing} d={d} />
      <path className={styles.edgeLine} d={d} />
      {pts.map((p, i) => (
        <circle
          key={i}
          className={styles.edgeHandle}
          cx={p.x}
          cy={p.y}
          r={drag === i ? 6 : 4.5}
          onPointerDown={start(i)}
        />
      ))}
    </svg>
  );
}

export function DrawLoop({ onDone }: { onDone: (screen: { x: number; y: number }[]) => void }) {
  const [pts, setPts] = useState<{ x: number; y: number }[]>([]);
  const down = useRef(false);
  return (
    <svg
      className={styles.drawLayer}
      onPointerDown={(e) => {
        down.current = true;
        (e.target as Element).setPointerCapture(e.pointerId);
        setPts([{ x: e.clientX, y: e.clientY }]);
      }}
      onPointerMove={(e) => {
        if (!down.current) return;
        const p = { x: e.clientX, y: e.clientY };
        setPts((prev) => [...prev, p]);
      }}
      onPointerUp={() => {
        down.current = false;
        onDone(pts);
        setPts([]);
      }}
    >
      {pts.length > 1 ? (
        <path
          className={styles.drawPath}
          d={pts.map((p, i) => `${i ? "L" : "M"}${String(p.x)} ${String(p.y)}`).join("") + "Z"}
        />
      ) : null}
    </svg>
  );
}
