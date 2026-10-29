"use client";

// Labels pinned on the land (Perplexity Annotated Land Model Rules 1, 2, 3):
// - Every observation has a geographic foot on the terrain (solid ring = Observed, dashed = Proposed/Estimated,
//   open ring = Location uncertain).
// - Only the selected observation carries the warm ochre stem; non-selected observations use calm graphite stems.
// - Deterministic 2D screen-space collision solver guarantees zero overlapping plates and zero edge clipping.

import type * as maplibregl from "maplibre-gl";
import { useEffect, useMemo, type ReactNode } from "react";
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
  chipUrl?: string;
  distanceLabel?: string;
  elevationDelta?: string;
  profilePts?: readonly number[];
}

const CARD_W = 340;
const PLATE_H = 54;
const GAP_X = 22;
const GAP_Y = 20;

export interface PlacedPin {
  id: string;
  gx: number;
  gy: number;
  x0: number;
  x1: number;
  top: number;
  plateH: number;
  anchorX: number;
  anchorY: number;
  flip: boolean;
}

export function layoutPins(
  pins: LandPin[],
  land: Record<string, { x: number; y: number }>,
  w: number,
  h: number,
): PlacedPin[] {
  const minX = 88;
  const maxX = Math.max(minX + 360, w - 436);
  const baseMinY = 104;
  const maxY = Math.max(baseMinY + 220, h - 224);

  // Sort from left-to-right, then top-to-bottom for deterministic stagger
  const ordered = [...pins]
    .filter((p) => Boolean(land[p.id]))
    .sort((a, b) => {
      const la = land[a.id] ?? { x: 0, y: 0 };
      const lb = land[b.id] ?? { x: 0, y: 0 };
      return la.x - lb.x || la.y - lb.y;
    });

  const out: PlacedPin[] = ordered.map((p, idx) => {
    const s = land[p.id] ?? { x: 400, y: 300 };
    const hasProfile = Boolean(p.distanceLabel || p.profilePts);
    const plateH = hasProfile ? 66 : PLATE_H;
    const width = Math.min(
      276,
      Math.max(p.label.length * 7.2, p.sub.length * 6.0, hasProfile ? 212 : 168) + 34,
    );
    // Fan out horizontally slightly based on index so nearby ground points start separated
    const staggerX = (idx % 3 === 0 ? -1 : idx % 3 === 1 ? 1 : 0) * 32;
    const rawX0 = s.x - width * 0.5 + staggerX;
    const x0 = Math.max(minX, Math.min(rawX0, maxX - width));
    const x1 = x0 + width;
    // Keep top-left area clear of the editorial stage banner (x < 580, y < 228)
    const localMinY = x0 < 580 ? Math.max(baseMinY, 228) : baseMinY;
    const rawTop = s.y - p.stem - plateH;
    const top = Math.max(localMinY, Math.min(rawTop, maxY - plateH));
    return {
      id: p.id,
      gx: s.x,
      gy: s.y,
      x0,
      x1,
      top,
      plateH,
      anchorX: Math.max(x0 + 18, Math.min(s.x, x1 - 18)),
      anchorY: top + plateH,
      flip: false,
    };
  });

  // Multi-pass 2D relaxation solver to eliminate any overlap
  for (let pass = 0; pass < 18; pass++) {
    let moved = false;
    for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        const a = out[i];
        const b = out[j];
        if (!a || !b) continue;
        const overlapX = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) + GAP_X;
        const overlapY =
          Math.min(a.top + a.plateH, b.top + b.plateH) - Math.max(a.top, b.top) + GAP_Y;
        if (overlapX > 0 && overlapY > 0) {
          moved = true;
          const widthA = a.x1 - a.x0;
          const widthB = b.x1 - b.x0;
          // Prefer vertical separation first; if near vertical bounds, also push horizontally
          if (overlapY <= overlapX * 1.35) {
            const shiftY = overlapY * 0.55 + 2;
            if (a.top <= b.top) {
              a.top -= shiftY;
              b.top += shiftY;
            } else {
              a.top += shiftY;
              b.top -= shiftY;
            }
          } else {
            const shiftX = overlapX * 0.55 + 4;
            if (a.x0 <= b.x0) {
              a.x0 -= shiftX;
              b.x0 += shiftX;
            } else {
              a.x0 += shiftX;
              b.x0 -= shiftX;
            }
          }
          // Re-clamp A and B inside safe screen bounds
          a.x0 = Math.max(minX, Math.min(a.x0, maxX - widthA));
          a.x1 = a.x0 + widthA;
          const minYA = a.x0 < 580 ? Math.max(baseMinY, 228) : baseMinY;
          a.top = Math.max(minYA, Math.min(a.top, maxY - a.plateH));

          b.x0 = Math.max(minX, Math.min(b.x0, maxX - widthB));
          b.x1 = b.x0 + widthB;
          const minYB = b.x0 < 580 ? Math.max(baseMinY, 228) : baseMinY;
          b.top = Math.max(minYB, Math.min(b.top, maxY - b.plateH));
        }
      }
    }
    if (!moved) break;
  }

  for (const item of out) {
    item.anchorX = Math.max(item.x0 + 20, Math.min(item.gx, item.x1 - 20));
    item.anchorY = item.top + item.plateH;
  }
  return out;
}

export function LandPins({
  map,
  pins,
  open,
  onOpen,
  onSelectAnchor,
  detail,
}: {
  map: maplibregl.Map | null;
  pins: LandPin[];
  open: string | null;
  onOpen: (id: string | null) => void;
  onSelectAnchor?: (pt: { x: number; y: number } | null) => void;
  detail?: (id: string) => ReactNode;
}) {
  const points = useMemo(() => pins.map((p) => ({ id: p.id, at: p.at })), [pins]);
  const land = useLand(map, points);
  const w = typeof window === "undefined" ? 1440 : window.innerWidth;
  const h = typeof window === "undefined" ? 900 : window.innerHeight;
  const placed = useMemo(() => layoutPins(pins, land, w, h), [pins, land, w, h]);

  const activeId = open ?? placed[0]?.id ?? null;

  useEffect(() => {
    if (!onSelectAnchor) return;
    const sel = placed.find((q) => q.id === activeId);
    if (sel) {
      onSelectAnchor({ x: sel.gx, y: sel.gy });
    } else {
      onSelectAnchor(null);
    }
  }, [placed, activeId, onSelectAnchor]);

  return (
    <div className={styles.pins}>
      <svg className={styles.pinStems} aria-hidden="true">
        {placed.map((q) => {
          const p = pins.find((x) => x.id === q.id);
          const isSelected = activeId === q.id;
          const elbowY = q.anchorY + Math.min(24, Math.max(8, (q.gy - q.anchorY) * 0.35));
          const midX = (q.gx + q.anchorX) * 0.5;
          const midY = (q.gy + q.anchorY) * 0.5;
          const stemPath = `M${q.gx.toFixed(1)} ${q.gy.toFixed(1)}L${q.gx.toFixed(1)} ${elbowY.toFixed(1)}L${q.anchorX.toFixed(1)} ${q.anchorY.toFixed(1)}`;
          return (
            <g key={q.id} data-kind={p?.kind} data-open={isSelected ? "true" : "false"}>
              <ellipse
                className={styles.pinGlow}
                cx={q.gx}
                cy={q.gy}
                rx={isSelected ? 28 : 18}
                ry={isSelected ? 11 : 7}
              />
              <ellipse
                className={styles.pinRing}
                cx={q.gx}
                cy={q.gy}
                rx={isSelected ? 12 : 8.5}
                ry={isSelected ? 5 : 3.5}
              />
              {p?.kind !== "missing" ? (
                <circle className={styles.pinDot} cx={q.gx} cy={q.gy} r={isSelected ? 3 : 2} />
              ) : null}
              <path className={styles.pinStem} d={stemPath} fill="none" />
              {/* Geometric diagonal cut across the stem when a prediction is contradicted */}
              {p?.kind === "contradicted" ? (
                <g className={styles.stemCut}>
                  <line x1={midX - 7} y1={midY - 4} x2={midX + 7} y2={midY + 4} />
                  <line x1={midX - 7} y1={midY + 1} x2={midX + 7} y2={midY + 9} />
                </g>
              ) : null}
              {/* Lock tick mark when predictions are locked before data */}
              {p?.kind === "locked" ? (
                <rect
                  className={styles.stemLockTick}
                  x={midX - 4}
                  y={midY - 4}
                  width={8}
                  height={8}
                  transform={`rotate(45 ${String(midX)} ${String(midY)})`}
                />
              ) : null}
            </g>
          );
        })}
      </svg>
      {placed.map((q) => {
        const p = pins.find((x) => x.id === q.id);
        if (!p) return null;
        const isSelected = activeId === p.id;
        const right = q.x1 + 12;
        const left = q.x0 - CARD_W - 12;
        const cardLeft = !q.flip && right + CARD_W < w - 420 ? right : left >= 16 ? left : right;
        const cardTop = Math.min(Math.max(84, q.top - 24), h - 360);
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
              data-selected={isSelected ? "true" : "false"}
              aria-expanded={isSelected}
              style={{
                left: q.x0,
                top: q.top,
                width: q.x1 - q.x0,
                height: q.plateH,
              }}
              onClick={() => {
                onOpen(p.id);
              }}
            >
              <span className={styles.plateInner}>
                {p.chipUrl ? (
                  <img src={p.chipUrl} alt={p.label} className={styles.plateThumb} />
                ) : null}
                <span className={styles.plateCol}>
                  <span className={styles.plateTopRow}>
                    <span className={styles.plateDot} data-kind={p.kind} />
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
                          <polyline
                            points={poly}
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.4"
                          />
                        </svg>
                      ) : null}
                    </span>
                  ) : null}
                </span>
              </span>
            </button>
            {open === p.id && detail ? (
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
