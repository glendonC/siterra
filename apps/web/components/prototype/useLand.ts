"use client";

import type * as maplibregl from "maplibre-gl";
import { useEffect, useState } from "react";
import { landPoint, projectionType } from "./ProtoMap";

export type ScreenPt = { x: number; y: number };

/** Screen positions of points on the land, following the camera; empty on the globe. */
export function useLand(
  map: maplibregl.Map | null,
  points: { id: string; at: [number, number] }[],
): Record<string, ScreenPt> {
  const [out, setOut] = useState<Record<string, ScreenPt>>({});
  useEffect(() => {
    if (!map) return;
    let frame = 0;
    const place = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const next: Record<string, ScreenPt> = {};
        if (projectionType(map) !== "globe")
          for (const p of points) {
            const s = landPoint(map, p.at, 0);
            if (s) next[p.id] = { x: Math.round(s.x), y: Math.round(s.y) };
          }
        setOut((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
      });
    };
    place();
    map.on("render", place);
    return () => {
      cancelAnimationFrame(frame);
      map.off("render", place);
    };
  }, [map, points]);
  return out;
}
