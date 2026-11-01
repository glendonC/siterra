"use client";

// Recorded life on the land (UI-2; the lead, 21:08): a global layer of the case's stored GBIF records, off by default
// and toggled by G where the case holds a species bundle, drawn on the overview at rest and over time. The scene
// draws one same-size dot per recorded point (never sized by a count, which follows recording effort); this layer
// adds the words: the layer's card at the edge, and for the point under the cursor one warm stem to its group's
// glyph, the ring of its stated uncertainty on the land, and a card of at most three short lines (decision 16).
// Enter steps through the point's records one by one; Esc steps back. A record says an organism was recorded here,
// never presence, abundance or change; a period is the years the records span. Fossil specimens stay off the land
// and are counted in the layer's card.

import type { CaseSnapshot } from "@siterra/contracts";
import { useEffect, useMemo, useRef, useState } from "react";
import { distanceShown, lf, lformat, lifeTerm, type LifeMessageId } from "../../lib/copy/life";
import type { LifeGroup, RecordedPoint } from "../../lib/life/data";
import { lifeSourceOf, loadLife, type LifeData } from "../../lib/life/load";
import { lifeColours } from "../../lib/theme/obsidian";
import { Control } from "../controls/Control";
import styles from "./LifeLayer.module.css";

/** One frame of the scene, in CSS px over the overview: every point, and the focused one with its ring. */
export interface LifeFrame {
  at: Float32Array | null;
  focus: {
    at: { x: number; y: number };
    behind: boolean;
    ring: { x: number; y: number }[] | null;
  } | null;
}

/** What the layer asks of the overview's scene. */
export interface LifeMount {
  /** The recorded points to draw (the zone's metres) with their tones; null takes them away. */
  set(points: readonly { e: number; n: number; tone: string }[] | null): void;
  /** The point in focus and the stated uncertainty its ring shows (m). */
  focus(index: number | null, ring: number | null): void;
  subscribe(f: (frame: LifeFrame) => void): () => void;
  /** True while a point is in focus, so the land's own hover label stands aside. */
  hot: { current: boolean };
}

/** How near the cursor must come to a dot to take it (CSS px). */
const PICK = 9;
/** The point's card width (CSS px, as LifeLayer.module.css sets it). */
const CARD_W = 320;
/** The stem from a focused dot up to its glyph (CSS px). */
const STEM = 54;

const t = (id: LifeMessageId) => lf[id].text;
const n = (v: number) => v.toLocaleString("en-US");
const yearsOf = (y: [number, number] | null) =>
  !y
    ? t("life.noYear")
    : y[0] === y[1]
      ? String(y[0])
      : lformat("life.years", { from: y[0], to: y[1] });

function Glyph({ group }: { group: LifeGroup | null }) {
  // quiet line glyphs, one per group; a point of several groups is a plain ring
  const d =
    group === "bird"
      ? "M2 9 Q5.5 4.5 9 8.5 Q12.5 4.5 16 9"
      : group === "plant"
        ? "M9 16 L9 7 M9 10 Q4 9 3.5 4 Q8 4 9 9 M9 8 Q10 3 14.5 2.5 Q14.5 7.5 9 8.5"
        : group === "insect"
          ? "M9 5 L9 15 M6.5 8 Q9 4 11.5 8 Q12 14 9 15 Q6 14 6.5 8 M6.5 9 L3 7 M11.5 9 L15 7 M6.7 12 L3 13 M11.3 12 L15 13"
          : group === "other"
            ? "M4 9 A5 5 0 1 0 14 9 A5 5 0 1 0 4 9 M7 9 L11 9"
            : "M3.5 9 A5.5 5.5 0 1 0 14.5 9 A5.5 5.5 0 1 0 3.5 9";
  return (
    <svg className={styles.glyph} viewBox="0 0 18 18" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

export function LifeLayer({
  snapshot,
  zone,
  on,
  mount,
}: {
  snapshot: CaseSnapshot;
  /** The land's UTM zone, from the overview's relief. */
  zone: number;
  on: boolean;
  mount: LifeMount;
}) {
  const bundleId = useMemo(() => lifeSourceOf(snapshot), [snapshot]);
  const caseId = snapshot.case.id;
  const [data, setData] = useState<LifeData | null>(null);
  const [failed, setFailed] = useState(false);
  // read once, the first time the layer is shown
  useEffect(() => {
    if (!on || !bundleId || data || failed) return;
    const ac = new AbortController();
    loadLife(caseId, bundleId, zone, (i, init) => fetch(i, init), ac.signal).then(
      setData,
      (e: unknown) => {
        if (ac.signal.aborted) return;
        console.error("Recorded life not read", e);
        setFailed(true);
      },
    );
    return () => {
      ac.abort();
    };
  }, [on, bundleId, caseId, zone, data, failed]);
  useEffect(() => {
    if (!data) return;
    mount.set(data.points.map((p) => ({ e: p.e, n: p.n, tone: lifeColours[p.group ?? "mixed"] })));
    return () => {
      mount.set(null);
    };
  }, [data, mount]);

  // the frame the scene hands out, and the point in focus
  // every point's place stays out of React (it changes each frame the land moves); the focused one's is state, set
  // only when it moves on screen, so a playing land does not re-render the layer each frame
  const [focusAt, setFocusAt] = useState<LifeFrame["focus"]>(null);
  const atRef = useRef<Float32Array | null>(null);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!on) return;
    return mount.subscribe((f) => {
      atRef.current = f.at;
      // the first point's place, for the layer's end-to-end test to point at
      const el = root.current;
      if (el && f.at)
        el.dataset.firstAt = `${(f.at[0] ?? 0).toFixed(1)},${(f.at[1] ?? 0).toFixed(1)}`;
      setFocusAt((p) => {
        const q = f.focus;
        if (!p || !q) return p === q ? p : q;
        const same =
          Math.abs(p.at.x - q.at.x) < 0.5 &&
          Math.abs(p.at.y - q.at.y) < 0.5 &&
          p.behind === q.behind &&
          (p.ring === null) === (q.ring === null);
        return same ? p : q;
      });
    });
  }, [on, mount]);
  const [focus, setFocus] = useState<number | null>(null);
  // reading a point's records: which one, or null on the point's own card
  const [reading, setReading] = useState<number | null>(null);
  const point: RecordedPoint | null = focus !== null ? (data?.points[focus] ?? null) : null;
  useEffect(() => {
    mount.hot.current = focus !== null;
    mount.focus(focus, point?.uncertaintyM ?? null);
  }, [focus, point, mount]);
  useEffect(() => {
    if (on) return;
    setFocus(null);
    setReading(null);
  }, [on]);

  // the cursor takes the nearest dot within reach; while its records are read the point stays
  useEffect(() => {
    if (!on || !data) return;
    const onMove = (ev: PointerEvent) => {
      if (reading !== null) return;
      const at = atRef.current;
      const r = root.current?.getBoundingClientRect();
      if (!at || !r) return;
      const x = ev.clientX - r.left;
      const y = ev.clientY - r.top;
      const target = ev.target as HTMLElement | null;
      if (target?.closest("button, a, input, textarea, [role='dialog'], [data-life-card]")) return;
      let best = -1;
      let bd = PICK * PICK;
      for (let i = 0; i < at.length / 2; i++) {
        const dx = (at[i * 2] ?? 0) - x;
        const dy = (at[i * 2 + 1] ?? 0) - y;
        const d = dx * dx + dy * dy;
        if (d < bd) {
          bd = d;
          best = i;
        }
      }
      setFocus(best === -1 ? null : best);
    };
    window.addEventListener("pointermove", onMove);
    return () => {
      window.removeEventListener("pointermove", onMove);
    };
  }, [on, data, reading]);

  // Enter reads the point's records one by one; Esc steps back (before the overview's own keys)
  useEffect(() => {
    if (!on || !point) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
      if (ev.key === "Enter") {
        ev.preventDefault();
        ev.stopPropagation();
        setReading((r) => (r === null ? 0 : (r + 1) % point.records.length));
      } else if (ev.key === "Escape") {
        ev.preventDefault();
        ev.stopPropagation();
        if (reading !== null) setReading(null);
        else setFocus(null);
      }
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => {
      window.removeEventListener("keydown", onKey, { capture: true });
    };
  }, [on, point, reading]);

  if (!on || !bundleId || !data) return null;
  const s = data.summary;
  const o = data.occurrences;
  const f = focusAt;
  const record = point && reading !== null ? o.records[point.records[reading] ?? -1] : undefined;
  const licences = point
    ? [...new Set(point.records.map((i) => o.records[i]?.license ?? ""))].map((c) =>
        lifeTerm("license", c),
      )
    : [];
  const datasets = point ? new Set(point.records.map((i) => o.records[i]?.dataset)).size : 0;
  const top = f ? { x: f.at.x, y: f.at.y - STEM } : null;
  // the card stands to the right of the glyph, stepped out past the sunlit ridge into the dark margin where possible;
  // to the left only where the right edge leaves no room
  const vw = root.current?.clientWidth ?? 1440;
  const right = f ? f.at.x + CARD_W + 140 <= vw : true;
  const shelfX = top
    ? right
      ? Math.min(vw - CARD_W - 28, Math.max(top.x + 28, Math.min(948, top.x + 124)))
      : Math.max(CARD_W + 28, Math.min(top.x - 28, Math.max(492, top.x - 124)))
    : 0;
  const cardAt = top
    ? right
      ? `translate(${shelfX}px, ${top.y - 10}px)`
      : `translate(calc(${shelfX}px - 100%), ${top.y - 10}px)`
    : "";

  return (
    <div ref={root} className={styles.layer} data-life-layer="" aria-label={t("life.region")}>
      {/* the layer's card at the edge: what is drawn, what is not, and what a record is not */}
      {/* one card at a time (decision 16): the layer's card steps back while a point's card is open */}
      <section
        className={styles.layerCard}
        data-life-card=""
        data-quiet={f && point && !f.behind ? "" : undefined}
      >
        <h2 className={styles.title}>{t("life.layer")}</h2>
        <p className={styles.line}>
          {s.years
            ? lformat("life.summary", {
                records: n(s.records),
                points: n(s.points),
                from: s.years[0],
                to: s.years[1],
              })
            : null}
        </p>
        {s.fossils > 0 ? (
          <p className={styles.line}>
            {s.fossils === 1 ? t("life.fossilOne") : lformat("life.fossils", { n: n(s.fossils) })}
          </p>
        ) : null}
        <p className={styles.limit}>{t("life.limit")}</p>
      </section>

      {f && point && top && !f.behind ? (
        <>
          <svg className={styles.marks} aria-hidden="true">
            {f.ring ? (
              <polyline
                className={styles.ring}
                points={f.ring.map((q) => `${q.x},${q.y}`).join(" ")}
              />
            ) : null}
            <line className={styles.stem} x1={f.at.x} y1={f.at.y} x2={top.x} y2={top.y + 11} />
            <line
              className={styles.stem}
              x1={right ? top.x + 11 : top.x - 11}
              y1={top.y}
              x2={right ? shelfX - 8 : shelfX + 8}
              y2={top.y}
            />
            <circle className={styles.foot} cx={f.at.x} cy={f.at.y} r={5} />
          </svg>
          <span
            className={styles.glyphAt}
            style={{ transform: `translate(${top.x - 11}px, ${top.y - 11}px)` }}
            title={t(`life.group.${point.group ?? "mixed"}`)}
          >
            <Glyph group={point.group} />
          </span>
          <section
            className={styles.card}
            data-life-card=""
            data-life-point={String(focus)}
            style={{ transform: cardAt }}
          >
            {record ? (
              <>
                <p className={styles.kicker}>
                  {lformat("life.of", { n: (reading ?? 0) + 1, total: n(point.records.length) })}
                </p>
                <h3 className={styles.species}>
                  {o.taxa[record.taxon]?.species ?? o.taxa[record.taxon]?.scientificName}
                </h3>
                <p className={styles.line}>
                  {lformat("life.when", {
                    basis: lifeTerm("basis", record.basis),
                    date:
                      record.eventDate ??
                      (record.year === null ? t("life.noYear") : String(record.year)),
                  })}
                </p>
                <p className={styles.line}>
                  {lformat("life.dataset", {
                    title: o.datasets[record.dataset]?.title ?? "",
                    publisher: o.datasets[record.dataset]?.publisher ?? "",
                  })}
                </p>
                <p className={styles.line}>
                  {lformat("life.terms", {
                    licence: lifeTerm("license", record.license),
                    location:
                      record.uncertaintyM !== null
                        ? lformat("life.within", { d: distanceShown(record.uncertaintyM) })
                        : t("life.unstated"),
                  })}
                </p>
                <div className={styles.keys}>
                  {point.records.length > 1 ? (
                    <Control
                      variant="quiet"
                      keyHint="↵"
                      keyShortcut="Enter"
                      onClick={() => {
                        setReading((r) => ((r ?? 0) + 1) % point.records.length);
                      }}
                    >
                      {t("life.next")}
                    </Control>
                  ) : null}
                  <Control
                    variant="quiet"
                    keyHint="Esc"
                    keyShortcut="Escape"
                    onClick={() => {
                      setReading(null);
                    }}
                  >
                    {t("life.close")}
                  </Control>
                </div>
              </>
            ) : (
              <>
                <p className={styles.kicker}>{t("life.kicker")}</p>
                <p className={styles.line}>
                  {point.records.length === 1
                    ? lformat("life.pointOne", { years: yearsOf(point.years) })
                    : lformat("life.point", {
                        records: n(point.records.length),
                        species: n(point.species),
                        years: yearsOf(point.years),
                      })}
                </p>
                <p className={styles.line}>
                  {point.uncertaintyM !== null
                    ? lformat("life.within", { d: distanceShown(point.uncertaintyM) })
                    : t("life.unstated")}
                </p>
                <p className={styles.line}>
                  {datasets === 1
                    ? lformat("life.datasetOne", { licences: licences.join(" and ") })
                    : lformat("life.datasets", {
                        n: n(datasets),
                        licences: licences.join(" and "),
                      })}
                </p>
                <div className={styles.keys}>
                  <Control
                    variant="quiet"
                    keyHint="↵"
                    keyShortcut="Enter"
                    onClick={() => {
                      setReading(0);
                    }}
                  >
                    {t("life.read")}
                  </Control>
                </div>
              </>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
