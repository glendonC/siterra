"use client";

// Labels pinned on the land: a ring on the ground, a thin stem (dashed when locked or proposed, solid when
// consistent, solid with a geometric diagonal cut when contradicted), and a tactical plate above the place.
// Supports Death Stranding-style distance, elevation delta, and mini elevation profile callouts.

import type * as maplibregl from "maplibre-gl";
import { useMemo, type ReactNode } from "react";
import { useLand } from "./useLand";
import styles from "./Story.module.css";

export interface LandPin {
  id: string;
  at: [number, number];
  label: string;
  sub: string;
  stem: number;
  kind: "seen" | "missing" | "proposed" | "locked" | "contradicted";
  badge?: string;
  distanceLabel?: string;
  elevationDelta?: string;
  profilePts?: readonly number[];
}

const CARD_W = 340;
const PLATE_H = 48;
const GAP = 10;

interface Placed {
  id: string;
  gx: number;
  gy: number;
  x0: number;
  x1: number;
  top: number;
  flip: boolean;
}

function layout(pins: LandPin[], land: Record<string, { x: number; y: number }>, w: number) {
  const out: Placed[] = [];
  const nearestFirst = [...pins].sort((a, b) => (land[b.id]?.y ?? 0) - (land[a.id]?.y ?? 0));
  const minX = 336;
  const maxX = Math.max(minX + 260, w - 432);
  for (const p of nearestFirst) {
    const s = land[p.id];
    if (!s) continue;
    const hasProfile = Boolean(p.distanceLabel || p.profilePts);
    const plateH = hasProfile ? 62 : PLATE_H;
    const width = Math.max(p.label.length * 7.5, p.sub.length * 6.5, hasProfile ? 204 : 148) + 28;
    const flip = s.x + width > maxX;
    const x0 = Math.max(minX, Math.min(flip ? s.x - width : s.x, maxX - width));
    const x1 = x0 + width;
    let top = Math.max(112, Math.min(s.y - p.stem - plateH, 680 - plateH));
    for (let i = 0; i < 8; i++) {
      const hit = out.find(
        (o) =>
          x0 < o.x1 + GAP &&
          x1 > o.x0 - GAP &&
          top < o.top + plateH + GAP &&
          top + plateH > o.top - GAP,
      );
      if (!hit) break;
      top = Math.max(108, hit.top - plateH - GAP);
    }
    out.push({ id: p.id, gx: s.x, gy: s.y, x0, x1, top, flip });
  }
  return out;
}

export function LandPins({
  map,
  pins,
  open,
  onOpen,
  detail,
}: {
  map: maplibregl.Map | null;
  pins: LandPin[];
  open: string | null;
  onOpen: (id: string | null) => void;
  detail?: (id: string) => ReactNode;
}) {
  const points = useMemo(() => pins.map((p) => ({ id: p.id, at: p.at })), [pins]);
  const land = useLand(map, points);
  const w = typeof window === "undefined" ? 1440 : window.innerWidth;
  const h = typeof window === "undefined" ? 900 : window.innerHeight;
  const placed = useMemo(() => layout(pins, land, w), [pins, land, w]);

  return (
    <div className={styles.pins}>
      <svg className={styles.pinStems} aria-hidden="true">
        {placed.map((q) => {
          const p = pins.find((x) => x.id === q.id);
          const midY = (q.gy + q.top + PLATE_H) / 2;
          return (
            <g key={q.id} data-kind={p?.kind} data-open={open === q.id ? "true" : "false"}>
              <ellipse className={styles.pinGlow} cx={q.gx} cy={q.gy} rx={24} ry={9} />
              <ellipse className={styles.pinRing} cx={q.gx} cy={q.gy} rx={10} ry={4} />
              <circle className={styles.pinDot} cx={q.gx} cy={q.gy} r={2} />
              <line className={styles.pinStem} x1={q.gx} y1={q.gy} x2={q.gx} y2={q.top + PLATE_H} />
              {/* Geometric diagonal cut across the stem when a prediction is contradicted */}
              {p?.kind === "contradicted" ? (
                <g className={styles.stemCut}>
                  <line x1={q.gx - 8} y1={midY - 5} x2={q.gx + 8} y2={midY + 5} />
                  <line x1={q.gx - 8} y1={midY + 1} x2={q.gx + 8} y2={midY + 11} />
                </g>
              ) : null}
              {/* Lock tick mark when predictions are locked before data */}
              {p?.kind === "locked" ? (
                <rect
                  className={styles.stemLockTick}
                  x={q.gx - 4}
                  y={midY - 4}
                  width={8}
                  height={8}
                  transform={`rotate(45 ${String(q.gx)} ${String(midY)})`}
                />
              ) : null}
            </g>
          );
        })}
      </svg>
      {placed.map((q) => {
        const p = pins.find((x) => x.id === q.id);
        if (!p) return null;
        const isOpen = open === p.id;
        const right = q.x1 + 12;
        const left = q.x0 - CARD_W - 12;
        const cardLeft = !q.flip && right + CARD_W < w - 420 ? right : left >= 16 ? left : right;
        const cardTop = Math.min(Math.max(76, q.top - 30), h - 360);
        const poly =
          p.profilePts && p.profilePts.length > 1
            ? p.profilePts
                .map(
                  (v, i) =>
                    `${((i / ((p.profilePts?.length ?? 2) - 1)) * 56).toFixed(1)},${((1 - v) * 14 + 2).toFixed(1)}`,
                )
                .join(" ")
            : null;
        return (
          <div key={p.id}>
            <button
              type="button"
              className={styles.plate}
              data-kind={p.kind}
              data-flip={q.flip ? "true" : "false"}
              aria-expanded={isOpen}
              style={{
                left: q.x0,
                top: q.top,
                width: q.x1 - q.x0,
                height: p.distanceLabel ? 62 : PLATE_H,
              }}
              onClick={() => {
                onOpen(isOpen ? null : p.id);
              }}
            >
              <span className={styles.plateTopRow}>
                <span className={styles.plateLabel}>{p.label}</span>
                {p.badge ? <span className={styles.plateBadge}>{p.badge}</span> : null}
              </span>
              <span className={styles.plateSub}>{p.sub}</span>
              {p.distanceLabel ? (
                <span className={styles.plateTelemetry}>
                  <span>{p.distanceLabel}</span>
                  {p.elevationDelta ? <span>{p.elevationDelta}</span> : null}
                  {poly ? (
                    <svg className={styles.miniProfile} viewBox="0 0 56 18" aria-hidden="true">
                      <polyline points={poly} fill="none" stroke="currentColor" strokeWidth="1.3" />
                    </svg>
                  ) : null}
                </span>
              ) : null}
            </button>
            {isOpen && detail ? (
              <div
                className={styles.pinCard}
                style={{ left: cardLeft, top: cardTop, width: CARD_W }}
                role="dialog"
                aria-label={p.label}
              >
                {detail(p.id)}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
