"use client";

// Stems and marks on the land (docs/reference/components.md, "Stems and marks on the land"):
// - Outlet beam: 1.6 px accent vertical stem up from the outlet with a soft 22% column and 0.32 km foot
//   focus ring (white casing 3.2 px under dark core 1.2 px), label in IBM Plex Sans Medium 13/16 on a
//   2 px paper halo.
// - Village / Evidence stems: 1 px ink stem (1.8 px accent when selected) with a small 1.4 px ring at the
//   foot; label in IBM Plex Sans Medium 13/16, tracking 0.02em, ink on a 2 px paper halo,
//   NEVER inside a box.

import type * as maplibregl from "maplibre-gl";
import { useEffect, useMemo } from "react";
import { useLand } from "./useLand";
import styles from "./Story.module.css";

export interface LandPin {
  id: string;
  at: [number, number];
  label: string;
  stem: number;
  kind: "outlet" | "village" | "selected" | "locked";
}

export function LandPins({
  map,
  pins,
  selectedId,
  onSelect,
  onSelectAnchor,
}: {
  map: maplibregl.Map | null;
  pins: LandPin[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  onSelectAnchor?: (pt: { x: number; y: number } | null) => void;
}) {
  const points = useMemo(() => pins.map((p) => ({ id: p.id, at: p.at })), [pins]);
  const land = useLand(map, points);

  useEffect(() => {
    if (!onSelectAnchor) return;
    const sel = pins.find((p) => p.id === selectedId || p.kind === "selected");
    if (!sel) {
      onSelectAnchor(null);
      return;
    }
    const pt = land[sel.id];
    if (pt) {
      onSelectAnchor({ x: pt.x, y: pt.y - sel.stem });
    } else {
      onSelectAnchor(null);
    }
  }, [pins, selectedId, land, onSelectAnchor]);

  return (
    <div className={styles.pins}>
      <svg className={styles.pinStems} aria-hidden="true">
        {pins.map((p) => {
          const s = land[p.id];
          if (!s) return null;
          const isOutlet = p.kind === "outlet";
          const isSelected = p.id === selectedId || p.kind === "selected";
          const topY = s.y - p.stem;
          return (
            <g key={p.id} data-kind={p.kind} data-selected={isSelected ? "true" : "false"}>
              {isOutlet ? (
                <>
                  {/* Soft 22% column around the outlet beam */}
                  <rect
                    className={styles.outletColumn}
                    x={s.x - 4}
                    y={topY}
                    width={8}
                    height={p.stem}
                  />
                  {/* 0.32 km foot focus ring: white casing 3.2 px under dark core 1.2 px */}
                  <ellipse className={styles.outletRingCasing} cx={s.x} cy={s.y} rx={9} ry={4} />
                  <ellipse className={styles.outletRingCore} cx={s.x} cy={s.y} rx={9} ry={4} />
                  {/* 1.6 px accent vertical stem */}
                  <line className={styles.outletStem} x1={s.x} y1={s.y} x2={s.x} y2={topY} />
                </>
              ) : (
                <>
                  {/* Small 1.4 px foot ring */}
                  <ellipse className={styles.villageRing} cx={s.x} cy={s.y} rx={4.5} ry={2.2} />
                  {/* 1 px ink stem (1.8 px accent when selected, dashed when locked) */}
                  <line className={styles.villageStem} x1={s.x} y1={s.y} x2={s.x} y2={topY} />
                </>
              )}
            </g>
          );
        })}
      </svg>
      {pins.map((p) => {
        const s = land[p.id];
        if (!s) return null;
        const topY = s.y - p.stem;
        return (
          <button
            key={p.id}
            type="button"
            className={styles.stemTextBtn}
            style={{
              left: s.x + (p.kind === "outlet" ? 10 : 5),
              top: topY - 12,
            }}
            onClick={() => {
              onSelect?.(p.id);
            }}
          >
            {p.label}
          </button>
        );
      })}
    </div>
  );
}
