"use client";

import { Fragment } from "react";
import { en } from "../../lib/copy/en";
import type { BriefText, Coverage, Flow, StageId } from "../../lib/prototype/flow";
import { protoCopy, type CaseSpec } from "../../lib/prototype/proto-copy";
import { PIXEL_TREND_SUMMARY, type StratumRecord } from "../../lib/prototype/restrend-data";
import { Cite } from "./Cite";
import styles from "./Story.module.css";

export const MIREYE_LAYERS = [
  {
    id: "dem_strata",
    idx: 1,
    n: protoCopy.layer01N,
    title: protoCopy.layer01Title,
    sub: protoCopy.layer01Sub,
    tag: protoCopy.layer01Tag,
    detail: protoCopy.layer01Detail,
  },
  {
    id: "modis_ndvi",
    idx: 2,
    n: protoCopy.layer02N,
    title: protoCopy.layer02Title,
    sub: protoCopy.layer02Sub,
    tag: protoCopy.layer02Tag,
    detail: protoCopy.layer02Detail,
  },
  {
    id: "chirps_rain",
    idx: 3,
    n: protoCopy.layer03N,
    title: protoCopy.layer03Title,
    sub: protoCopy.layer03Sub,
    tag: protoCopy.layer03Tag,
    detail: protoCopy.layer03Detail,
  },
  {
    id: "modis_snow",
    idx: 4,
    n: protoCopy.layer04N,
    title: protoCopy.layer04Title,
    sub: protoCopy.layer04Sub,
    tag: protoCopy.layer04Tag,
    detail: protoCopy.layer04Detail,
  },
  {
    id: "s2_ndvi",
    idx: 5,
    n: protoCopy.layer05N,
    title: protoCopy.layer05Title,
    sub: protoCopy.layer05Sub,
    tag: protoCopy.layer05Tag,
    detail: protoCopy.layer05Detail,
  },
] as const;

export function CoverageNote({ c }: { c: Coverage }) {
  return (
    <div className={styles.coverage}>
      <span className={styles.covBadge} data-badge={c.badge}>
        {c.badge === "required" ? en["flow.cov.required"].text : en["flow.cov.notLoaded"].text}
      </span>
      <span className={styles.covDetail}>{c.detail}</span>
    </div>
  );
}

export function StatusBadges() {
  return (
    <span className={styles.status}>
      <span>{protoCopy.realDataBadge}</span>
      <span>{protoCopy.fieldUnverifiedBadge}</span>
    </span>
  );
}

/**
 * Mireye-Inspired 5-Layer Isometric Breakdown Stage (Stage 2 / Layer Stack).
 * Renders a crystal-clear isometric square stack where each translucent diamond glass sheet
 * floats with 62px vertical separation over the satellite terrain base slab, draws ONLY its own
 * distinct colour-coded spatial feature inside the square, and connects from its right corner
 * via a short dot-and-hairline to a large 22px Sans-Serif label on the right.
 */
export function MireyeLayerStack({
  activeSheetId,
  onSelectSheet,
}: {
  activeSheetId: string | null;
  onSelectSheet: (id: string | null) => void;
}) {
  // Isometric helper: maps (u, v) in [0..1]^2 around center (cx, cy) with half-width rx, half-height ry
  const cx = 258;
  const rx = 168;
  const ry = 66;
  const isoPt = (u: number, v: number, cy: number): [number, number] => {
    const x = cx + (u - v) * rx;
    const y = cy + (u + v - 1) * ry;
    return [x, y];
  };
  const isoPoly = (pts: [number, number][], cy: number) =>
    pts
      .map(([u, v], i) => {
        const [x, y] = isoPt(u, v, cy);
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(" ") + " Z";
  const isoLine = (pts: [number, number][], cy: number) =>
    pts
      .map(([u, v], i) => {
        const [x, y] = isoPt(u, v, cy);
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(" ");

  const sheetCenters = [104, 168, 232, 296, 360] as const;
  const baseCy = 434;

  return (
    <div className={styles.isoStageWrap}>
      <svg
        className={styles.isoSvg}
        viewBox="0 0 860 540"
        role="img"
        aria-label={protoCopy.stage2Headline}
      >
        <defs>
          <filter id="isoDropShadow" x="-20%" y="-20%" width="140%" height="150%">
            <feDropShadow dx="0" dy="18" stdDeviation="16" floodColor="var(--iso-shadow)" />
          </filter>
        </defs>

        {/* Soft ambient shadow under the base terrain tile */}
        <ellipse
          cx={cx}
          cy={baseCy + 24}
          rx={rx * 0.96}
          ry={ry * 0.92}
          fill="var(--iso-shadow)"
          opacity="0.55"
        />

        {/* Base Isometric Satellite Terrain Tile at y = 434 */}
        <g filter="url(#isoDropShadow)">
          {/* Extruded 3D side walls of the terrain block */}
          <path
            d={`M ${(cx - rx).toFixed(1)} ${baseCy.toFixed(1)} L ${cx.toFixed(1)} ${(baseCy + ry).toFixed(1)} L ${cx.toFixed(1)} ${(baseCy + ry + 14).toFixed(1)} L ${(cx - rx).toFixed(1)} ${(baseCy + 14).toFixed(1)} Z`}
            fill="var(--iso-base-side)"
          />
          <path
            d={`M ${cx.toFixed(1)} ${(baseCy + ry).toFixed(1)} L ${(cx + rx).toFixed(1)} ${baseCy.toFixed(1)} L ${(cx + rx).toFixed(1)} ${(baseCy + 14).toFixed(1)} L ${cx.toFixed(1)} ${(baseCy + ry + 14).toFixed(1)} Z`}
            fill="var(--iso-base-side)"
            opacity="0.82"
          />
          {/* Top surface of terrain base */}
          <path
            d={isoPoly(
              [
                [0, 0],
                [1, 0],
                [1, 1],
                [0, 1],
              ],
              baseCy,
            )}
            fill="var(--iso-base-top)"
            stroke="var(--iso-sheet-stroke)"
            strokeWidth="1.5"
          />
          {/* Topographic contour rings on the base tile */}
          <path
            d={isoPoly(
              [
                [0.08, 0.12],
                [0.92, 0.08],
                [0.9, 0.88],
                [0.12, 0.92],
              ],
              baseCy,
            )}
            fill="var(--layer-2-soft)"
            stroke="var(--iso-sheet-grid)"
            strokeWidth="1"
          />
          <path
            d={isoPoly(
              [
                [0.18, 0.22],
                [0.84, 0.18],
                [0.8, 0.78],
                [0.62, 0.84],
                [0.2, 0.76],
              ],
              baseCy,
            )}
            fill="none"
            stroke="var(--iso-base-outline)"
            strokeWidth="3"
            strokeLinejoin="round"
          />
        </g>

        {/* Render sheets from bottom (05) to top (01) so upper glass sheets overlap cleanly */}
        {[...MIREYE_LAYERS].reverse().map((layer) => {
          const idxZero = layer.idx - 1;
          const cy = sheetCenters[idxZero] ?? 200;
          const isSelected = activeSheetId === layer.id;
          const isDimmed = activeSheetId !== null && !isSelected;
          const liftY = isSelected ? cy - 6 : cy;
          const rightCornerX = cx + rx;
          const rightCornerY = liftY;
          const labelX = rightCornerX + 54;

          return (
            <g
              key={layer.id}
              className={styles.isoSheetGroup}
              data-active={isSelected ? "true" : "false"}
              data-dim={isDimmed ? "true" : "false"}
              onClick={() => {
                onSelectSheet(isSelected ? null : layer.id);
              }}
            >
              {/* Translucent Isometric Square Sheet */}
              <path
                className={styles.isoSheetPlate}
                data-layer={String(layer.idx)}
                data-active={isSelected ? "true" : "false"}
                d={isoPoly(
                  [
                    [0, 0],
                    [1, 0],
                    [1, 1],
                    [0, 1],
                  ],
                  liftY,
                )}
              />

              {/* Subtle 4x4 internal isometric reference grid inside each sheet */}
              {[0.25, 0.5, 0.75].map((g) => (
                <Fragment key={g}>
                  <path
                    d={isoLine(
                      [
                        [g, 0],
                        [g, 1],
                      ],
                      liftY,
                    )}
                    stroke="var(--iso-sheet-grid)"
                    strokeWidth="0.8"
                    fill="none"
                  />
                  <path
                    d={isoLine(
                      [
                        [0, g],
                        [1, g],
                      ],
                      liftY,
                    )}
                    stroke="var(--iso-sheet-grid)"
                    strokeWidth="0.8"
                    fill="none"
                  />
                </Fragment>
              ))}

              {/* Distinct Layer-Specific Vector Artwork Inside Each Isometric Sheet */}
              {layer.idx === 1 ? (
                /* 01 Blue: Valley Zones (3 nested elevation strata polygons, like Mireye 01 Ownership) */
                <g>
                  <path
                    d={isoPoly(
                      [
                        [0.14, 0.18],
                        [0.86, 0.14],
                        [0.84, 0.82],
                        [0.18, 0.86],
                      ],
                      liftY,
                    )}
                    fill="var(--layer-1-soft)"
                    stroke="var(--layer-1-fg)"
                    strokeWidth="1.8"
                  />
                  <path
                    d={isoPoly(
                      [
                        [0.26, 0.28],
                        [0.76, 0.24],
                        [0.72, 0.72],
                        [0.28, 0.74],
                      ],
                      liftY,
                    )}
                    fill="var(--layer-1-fill)"
                    stroke="var(--layer-1-fg)"
                    strokeWidth="1.6"
                  />
                  <path
                    d={isoPoly(
                      [
                        [0.38, 0.38],
                        [0.64, 0.36],
                        [0.62, 0.62],
                        [0.38, 0.64],
                      ],
                      liftY,
                    )}
                    fill="var(--layer-1-fill)"
                    stroke="var(--layer-1-fg)"
                    strokeWidth="1.4"
                    strokeDasharray="4 3"
                  />
                </g>
              ) : null}

              {layer.idx === 2 ? (
                /* 02 Green: 26-Year Greenery (Broad green vegetation zone + high-growth patches, like Mireye 02 Zoning) */
                <g>
                  <path
                    d={isoPoly(
                      [
                        [0.12, 0.2],
                        [0.88, 0.15],
                        [0.82, 0.78],
                        [0.16, 0.84],
                      ],
                      liftY,
                    )}
                    fill="var(--layer-2-fill)"
                    stroke="var(--layer-2-fg)"
                    strokeWidth="1.8"
                    strokeDasharray="5 3"
                  />
                  <path
                    d={isoPoly(
                      [
                        [0.24, 0.34],
                        [0.68, 0.28],
                        [0.64, 0.68],
                        [0.28, 0.7],
                      ],
                      liftY,
                    )}
                    fill="var(--layer-2-fill)"
                    stroke="var(--layer-2-fg)"
                    strokeWidth="1.8"
                  />
                </g>
              ) : null}

              {layer.idx === 3 ? (
                /* 03 Orange: Rainfall & Droughts (5 km cells + station axis line with circular nodes, like Mireye 03 Power) */
                <g>
                  <path
                    d={isoPoly(
                      [
                        [0.18, 0.25],
                        [0.48, 0.25],
                        [0.48, 0.55],
                        [0.18, 0.55],
                      ],
                      liftY,
                    )}
                    fill="var(--layer-3-soft)"
                    stroke="var(--layer-3-fg)"
                    strokeWidth="1.3"
                  />
                  <path
                    d={isoPoly(
                      [
                        [0.48, 0.25],
                        [0.78, 0.25],
                        [0.78, 0.55],
                        [0.48, 0.55],
                      ],
                      liftY,
                    )}
                    fill="var(--layer-3-fill)"
                    stroke="var(--layer-3-fg)"
                    strokeWidth="1.3"
                  />
                  <path
                    d={isoLine(
                      [
                        [0.15, 0.68],
                        [0.36, 0.62],
                        [0.58, 0.54],
                        [0.84, 0.46],
                      ],
                      liftY,
                    )}
                    fill="none"
                    stroke="var(--layer-3-fg)"
                    strokeWidth="2.2"
                  />
                  {(
                    [
                      [0.15, 0.68],
                      [0.36, 0.62],
                      [0.58, 0.54],
                      [0.84, 0.46],
                    ] as const
                  ).map(([u, v], nIdx) => {
                    const [nx, ny] = isoPt(u, v, liftY);
                    return (
                      <circle
                        key={nIdx}
                        cx={nx}
                        cy={ny}
                        r={4}
                        fill="var(--bg-surface)"
                        stroke="var(--layer-3-fg)"
                        strokeWidth="2"
                      />
                    );
                  })}
                </g>
              ) : null}

              {layer.idx === 4 ? (
                /* 04 Teal: Snowmelt & Rivers (Stream channel + high-altitude snowmelt basin, like Mireye 04 Water) */
                <g>
                  <path
                    d={isoPoly(
                      [
                        [0.56, 0.18],
                        [0.86, 0.22],
                        [0.82, 0.52],
                        [0.54, 0.46],
                      ],
                      liftY,
                    )}
                    fill="var(--layer-4-fill)"
                    stroke="var(--layer-4-fg)"
                    strokeWidth="1.6"
                  />
                  <path
                    d={isoLine(
                      [
                        [0.82, 0.28],
                        [0.64, 0.42],
                        [0.44, 0.54],
                        [0.16, 0.72],
                      ],
                      liftY,
                    )}
                    fill="none"
                    stroke="var(--layer-4-fg)"
                    strokeWidth="2.8"
                    strokeLinecap="round"
                  />
                  <path
                    d={isoLine(
                      [
                        [0.68, 0.72],
                        [0.44, 0.54],
                      ],
                      liftY,
                    )}
                    fill="none"
                    stroke="var(--layer-4-fg)"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </g>
              ) : null}

              {layer.idx === 5 ? (
                /* 05 Coral: Village Farms (Valley-floor irrigated orchard corridor plume, like Mireye 05 Environmental risk) */
                <g>
                  <path
                    d={isoPoly(
                      [
                        [0.18, 0.54],
                        [0.66, 0.34],
                        [0.76, 0.52],
                        [0.54, 0.76],
                        [0.24, 0.78],
                      ],
                      liftY,
                    )}
                    fill="var(--layer-5-fill)"
                    stroke="var(--layer-5-fg)"
                    strokeWidth="1.8"
                  />
                  <path
                    d={isoPoly(
                      [
                        [0.28, 0.58],
                        [0.56, 0.44],
                        [0.62, 0.56],
                        [0.36, 0.7],
                      ],
                      liftY,
                    )}
                    fill="var(--layer-5-fill)"
                    stroke="var(--layer-5-fg)"
                    strokeWidth="1.4"
                  />
                </g>
              ) : null}

              {/* Right-hand Mireye Leader Line (●─── 01 ■ Title) */}
              <circle cx={rightCornerX + 8} cy={rightCornerY} r={3.5} fill="var(--text-primary)" />
              <line
                x1={rightCornerX + 8}
                y1={rightCornerY}
                x2={labelX - 8}
                y2={rightCornerY}
                stroke="var(--text-secondary)"
                strokeWidth="1.3"
              />

              {/* Number 01..05 */}
              <text
                x={labelX}
                y={rightCornerY + 1}
                dominantBaseline="middle"
                className={styles.isoLabelNum}
              >
                {layer.n}
              </text>

              {/* Rounded Colour Square */}
              <rect
                x={labelX + 26}
                y={rightCornerY - 6}
                width={12}
                height={12}
                rx={3}
                className={styles.isoSwatch}
                data-layer={String(layer.idx)}
              />

              {/* Large 22px Sans-Serif Title & Subtitle */}
              <text
                x={labelX + 46}
                y={rightCornerY - 2}
                dominantBaseline="middle"
                className={styles.isoLabelTitle}
              >
                {layer.title}
              </text>
              <text
                x={labelX + 46}
                y={rightCornerY + 17}
                dominantBaseline="middle"
                className={styles.isoLabelSub}
              >
                {layer.sub}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/**
 * High-Detail Visual Preview Header inside the Right-Hand Opaque Evidence Inspector Card
 * (Perplexity Rule 3 & Founder Request: "in annotations show a real image thats detailed").
 */
export function VisualEvidenceHeader({
  stage,
  activeCase,
  strata,
  seasonYear,
  selectedPinId,
  selectedLabel,
  selectedSub,
}: {
  stage: StageId;
  activeCase: CaseSpec;
  strata: readonly StratumRecord[];
  seasonYear: number;
  selectedPinId?: string;
  selectedLabel?: string;
  selectedSub?: string;
}) {
  const catchment = strata[0];
  const seasons = catchment?.seasons ?? [];
  const minN = seasons.length ? Math.min(...seasons.map((s) => s.ndvi)) : 0.18;
  const maxN = seasons.length ? Math.max(...seasons.map((s) => s.ndvi)) : 0.24;
  const span = Math.max(0.01, maxN - minN);

  const chipSrc = (() => {
    if (selectedPinId === "zone-low" || selectedPinId === "farms" || selectedPinId === "fields") {
      return "/map/chips/chip-valley-floor-orchards.png";
    }
    if (selectedPinId === "zone-high" || selectedPinId === "snow" || selectedPinId === "high") {
      return "/map/chips/chip-upper-snow-band.png";
    }
    if (selectedPinId === "rainfall" || selectedPinId === "dry-year") {
      return "/map/chips/chip-drought-comparison.png";
    }
    if (selectedPinId === "low") {
      return "/map/chips/chip-outlet-hydrology.png";
    }
    if (stage === "hypotheses") {
      return "/map/chips/chip-drought-comparison.png";
    }
    if (stage === "field") {
      return "/map/chips/chip-outlet-hydrology.png";
    }
    if (stage === "interventions") {
      return "/map/chips/chip-valley-floor-orchards.png";
    }
    return "/map/chips/chip-mid-slope-rangeland.png";
  })();

  return (
    <div className={styles.visualPreview}>
      {/* Real Satellite Imagery & Spectral Backdrop from /map/chips/*.png */}
      <div className={styles.visualPreviewMedia}>
        <img src={chipSrc} alt={activeCase.regionLabel} className={styles.visualPreviewImg} />
        <div className={styles.visualPreviewOverlay} />

        {/* Stage-specific high-craft SVG telemetry graphic over the satellite still */}
        <svg className={styles.visualPreviewSvg} viewBox="0 0 340 88" aria-hidden="true">
          {stage === "interventions" ? (
            /* 1964 Aerial vs 2002 SPOT Agdal Canopy Comparison Graphic */
            <g>
              <line
                x1="170"
                y1="6"
                x2="170"
                y2="82"
                stroke="var(--accent)"
                strokeWidth="1.8"
                strokeDasharray="3 3"
              />
              <path
                d="M 16 68 Q 52 28, 96 34 T 164 26 L 164 78 L 16 78 Z"
                fill="var(--layer-2-fill)"
                stroke="var(--layer-2-fg)"
                strokeWidth="1.5"
              />
              <path
                d="M 176 38 Q 220 56, 268 62 T 326 68 L 326 78 L 176 78 Z"
                fill="var(--layer-5-soft)"
                stroke="var(--layer-5-fg)"
                strokeWidth="1.5"
              />
              <circle cx="92" cy="34" r="4" fill="var(--layer-2-fg)" />
              <circle cx="254" cy="60" r="4" fill="var(--layer-5-fg)" />
            </g>
          ) : stage === "field" ? (
            /* 50m Field Route Elevation Cross-Section (1,855 m to 2,980 m) */
            <g>
              <path
                d="M 14 74 L 68 68 L 138 52 L 224 30 L 318 14 L 318 80 L 14 80 Z"
                fill="var(--survey-light)"
              />
              <path
                d="M 14 74 L 68 68 L 138 52 L 224 30 L 318 14"
                fill="none"
                stroke="var(--accent)"
                strokeWidth="2.2"
              />
              {(
                [
                  [24, 72],
                  [88, 63],
                  [178, 42],
                  [296, 18],
                ] as const
              ).map(([cx, cy], idx) => (
                <g key={idx}>
                  <circle
                    cx={cx}
                    cy={cy}
                    r="4.5"
                    fill="var(--bg-surface)"
                    stroke="var(--accent)"
                    strokeWidth="2"
                  />
                </g>
              ))}
            </g>
          ) : (
            /* 26-Year MODIS + Sentinel-2 Sparkline & Elevation Band Profile */
            <g>
              <line
                x1="10"
                y1="46"
                x2="330"
                y2="30"
                stroke="var(--layer-2-fg)"
                strokeWidth="1.4"
                strokeDasharray="4 3"
              />
              {seasons.map((s, idx) => {
                const x = 12 + idx * 12.2;
                const h = Math.max(5, Math.round(((s.ndvi - minN) / span) * 48));
                const y = 76 - h;
                const isCur = s.year === seasonYear;
                return (
                  <rect
                    key={s.year}
                    x={x}
                    y={y}
                    width={isCur ? 8.5 : 7}
                    height={h}
                    rx={1.5}
                    fill={
                      s.dryPulse
                        ? "var(--rain-dry)"
                        : isCur
                          ? "var(--ndvi-up-strong)"
                          : "var(--ndvi-up-mod)"
                    }
                    opacity={isCur ? 1 : 0.85}
                  />
                );
              })}
            </g>
          )}
        </svg>

        <div className={styles.visualPreviewTopBar}>
          <span className={styles.visualPreviewTag}>
            {stage === "interventions"
              ? protoCopy.previewPrecedentTag
              : stage === "field"
                ? protoCopy.previewRouteTag
                : protoCopy.previewOpticalTag}
          </span>
          <span className={styles.visualPreviewCoord}>{activeCase.coordLabel}</span>
        </div>

        <div className={styles.visualPreviewBottomBar}>
          <span className={styles.visualPreviewFocusTitle}>
            {selectedLabel ?? activeCase.shortName}
          </span>
          <span className={styles.visualPreviewFocusSub}>
            {selectedSub ?? activeCase.windowLabel}
          </span>
        </div>
      </div>
    </div>
  );
}

export function SplitOverlay({ mode }: { mode: 1 | 2 | 3 }) {
  const leftText =
    mode === 1
      ? protoCopy.splitLeftLabel1
      : mode === 2
        ? protoCopy.splitLeftLabel2
        : protoCopy.splitLeftLabel3;
  const rightText =
    mode === 1
      ? protoCopy.splitRightLabel1
      : mode === 2
        ? protoCopy.splitRightLabel2
        : protoCopy.splitRightLabel3;
  return (
    <>
      <div className={styles.splitLine} aria-hidden="true" />
      <div className={styles.splitBadgeLeft}>{leftText}</div>
      <div className={styles.splitBadgeRight}>{rightText}</div>
    </>
  );
}

export function TechProofModal({ flow, onClose }: { flow: Flow; onClose: () => void }) {
  return (
    <div
      className={styles.briefScrim}
      role="dialog"
      aria-modal="true"
      aria-label={protoCopy.s3ProofTitle}
    >
      <article className={styles.proofModal}>
        <header className={styles.briefBar}>
          <div>
            <span className={styles.panelKey}>{protoCopy.techProofBtn}</span>
            <h2 className={styles.cardTitle}>{protoCopy.s3ProofTitle}</h2>
          </div>
          <button type="button" className={styles.secondary} onClick={onClose}>
            {protoCopy.techProofClose}
          </button>
        </header>
        <p className={styles.cardGrey}>
          {PIXEL_TREND_SUMMARY.bundleId}
          {" · "}
          {PIXEL_TREND_SUMMARY.medianTheilSenPerDecade}
        </p>
        <div className={styles.traceBox}>
          {flow.traceRecords.map((tr) => (
            <div key={tr.id} className={styles.traceRow}>
              <div className={styles.traceHead}>
                <span>{tr.stepTitle}</span>
                <span className={styles.demoTag}>{tr.status}</span>
              </div>
              <span className={styles.traceMeta}>
                {tr.actor}
                {" · "}
                {String(tr.durationMs)}
                {" ms · "}
                {tr.validatorRule}
              </span>
              <span className={styles.traceCode}>{tr.excerptOrPayload}</span>
            </div>
          ))}
        </div>
      </article>
    </div>
  );
}

export function BriefModal({
  brief,
  briefText,
  flow,
  onSelectLang,
  onClose,
}: {
  brief: "en" | "fr";
  briefText: BriefText;
  flow: Flow;
  onSelectLang: (l: "en" | "fr") => void;
  onClose: () => void;
}) {
  return (
    <div className={styles.briefScrim} role="dialog" aria-modal="true" aria-label={briefText.title}>
      <article className={styles.brief} lang={briefText.lang}>
        <header className={styles.briefBar}>
          <div className={styles.langs} role="radiogroup" aria-label={en["flow.lang"].text}>
            <button
              type="button"
              role="radio"
              aria-checked={brief === "en"}
              className={styles.lang}
              onClick={() => {
                onSelectLang("en");
              }}
            >
              {en["flow.lang.en"].text}
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={brief === "fr"}
              className={styles.lang}
              onClick={() => {
                onSelectLang("fr");
              }}
            >
              {en["flow.lang.fr"].text}
            </button>
          </div>
          <button type="button" className={styles.secondary} onClick={onClose}>
            {en["flow.close"].text}
          </button>
        </header>
        <div className={styles.page} data-dir="2">
          <div className={styles.pageTags}>
            <StatusBadges />
            <span className={styles.demoTag}>{briefText.status}</span>
            <Cite ns={[1, 2, 3]} chips={flow.sources} down />
          </div>
          <h2 className={styles.pageTitle}>{briefText.title}</h2>
          <dl className={styles.pageMeta}>
            {briefText.meta.map((m) => (
              <Fragment key={m.key}>
                <dt>{m.key}</dt>
                <dd>{m.value}</dd>
              </Fragment>
            ))}
          </dl>
          <div className={styles.pageCols}>
            {briefText.sections.map((sec) => (
              <section key={sec.head} className={styles.pageSection}>
                <h3>{sec.head}</h3>
                <ul>
                  {sec.lines.map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
          <section className={styles.pageSources}>
            <h3>{en["flow.sources"].text}</h3>
            {briefText.sources.map((s) => (
              <p key={s}>{s}</p>
            ))}
          </section>
          <p className={styles.pageFooter}>{briefText.footer}</p>
        </div>
      </article>
    </div>
  );
}
