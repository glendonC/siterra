"use client";

// Inside One Pixel: one MODIS 250 m pixel opened into its 10 m Sentinel-2 cells, the light its covers reflect, its own
// season record, a mix model with movable cover boundaries (drag, or focus a boundary and use the arrow keys; Home
// returns to the measured shares) and the check a field team could make. The steps are drawn by
// lib/instruments/pixel/scene.ts on a 1440 x 900 stage scaled to fit, under a statement in plain words from the
// pixel's own data (lib/instruments/pixel/statement.ts). The pixel's data are the pixel anatomy spec's, read from the
// case (lib/instruments/pixel/case.ts); the cited statements are the spec's context display texts with the sources of
// their Evidence (contracts 1.17.0).

import { useEffect, useId, useRef, useState } from "react";
import { en } from "../../lib/copy/en";
import { loadCasePixel } from "../../lib/instruments/pixel/case";
import type { PixelData } from "../../lib/instruments/pixel/data";
import type { CellPaint } from "../../lib/instruments/pixel/paint";
import {
  PIXEL_DESIGN,
  mountPixel,
  type PixelAnchors,
  type PixelLocator,
  type PixelScene,
  type StageBox,
} from "../../lib/instruments/pixel/scene";
import { placedStatements, type PlacedStatements } from "../../lib/instruments/placed-statements";
import { drawnAsset, readJsonAsset } from "../../lib/instruments/listing";
import { bandLimitsOf } from "../../lib/land/record";
import { trendCellsFrom } from "../../lib/overview/footprint";
import styles from "./InstrumentPixelAnatomy.module.css";
import { useInstrument } from "./InstrumentRecords";
import { STAGE_MARGIN, useShellPalette } from "./ShellContext";

export function InstrumentPixelAnatomy({
  state = "measured",
  around,
}: {
  /** The model's opening shares: as measured, or the bundle's example shift. */
  state?: "measured" | "shifted";
  /**
   * Opened in place over the land: the steps stand in one list beside the pixel's risen cells, 02 chooses their
   * paint, and the open step has a leader to the pixel, wherever the overview reports it on the stage.
   */
  around?: {
    paint: CellPaint;
    onPaint: (paint: CellPaint) => void;
    pixelBox: () => StageBox | null;
    /** Where each card's leader ends, in client px: the pixel's place, its risen cells, the field check's point. */
    anchors: () => PixelAnchors | null;
  };
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<PixelScene | null>(null);
  const inPlace = around !== undefined;
  // on the view's own page there is no land: the steps stand in the same list, and the cells stand large beside it
  // (the scene's hero), painted as step 02 chooses; the open step's leader ends on them
  const [ownPaint, setOwnPaint] = useState<CellPaint>("rgb");
  const heroBox = (): StageBox | null => {
    const r = stageRef.current?.querySelector("[data-pixel-hero]")?.getBoundingClientRect();
    return r ? { x0: r.left, y0: r.top, x1: r.right, y1: r.bottom } : null;
  };
  const steps: NonNullable<typeof around> & { hero?: boolean } = around ?? {
    paint: ownPaint,
    onPaint: setOwnPaint,
    pixelBox: heroBox,
    anchors: () => {
      const b = heroBox();
      if (!b) return null;
      const ring: [number, number][] = [
        [b.x0, b.y0],
        [b.x1, b.y0],
        [b.x1, b.y1],
        [b.x0, b.y1],
      ];
      return { place: ring, cells: ring, field: ring };
    },
    hero: true,
  };
  const aroundRef = useRef(steps);
  aroundRef.current = steps;
  const [loaded, setLoaded] = useState<{
    pixel: PixelData;
    statements: PlacedStatements;
    locator: PixelLocator;
  } | null>(null);
  const [loadFailed, setFailed] = useState(false);
  const record = useInstrument("pixel_anatomy");
  // the charts are drawn in the app's theme, and drawn again when it changes
  const pal = useShellPalette();
  // the locator's trend cells: the pixel spec draws none yet, so the layer stack spec's trend_cells are read
  const stack = useInstrument("layer_stack");
  const cellsFrom = stack.status === "ready" ? stack.view : null;
  // an instrument the case holds no spec for cannot be drawn
  const failed = loadFailed || record.status === "failed" || record.status === "absent";
  const view = record.status === "ready" ? record.view : null;
  const snapshot = record.status === "ready" ? record.snapshot : null;
  // the pixel's question as the case's record states it (P7b-10, contracts 1.22.0); null where it states none
  const params = view?.spec.parameters;
  const question = params?.kind === "pixel_anatomy" ? (params.question ?? null) : null;
  const descriptionId = useId();
  // the stage's scale, in steps of 0.05 rounded down: the scene measures its words at it, and lays them out again when
  // the window brings a new one (the module's --min-type keeps every word at 12 px or more on screen)
  const [typeScale, setTypeScale] = useState(0);

  useEffect(() => {
    if (!view || !snapshot || !cellsFrom) return;
    const ac = new AbortController();
    const p = view.spec.parameters;
    const get = (input: string, init?: RequestInit) => fetch(input, init);
    Promise.all([
      loadCasePixel(view, get, ac.signal),
      readJsonAsset(cellsFrom, drawnAsset(cellsFrom, "trend_cells"), get, ac.signal).then(
        trendCellsFrom,
      ),
    ]).then(
      ([{ pixel, ring }, trend]) => {
        const display = p.kind === "pixel_anatomy" ? (p.contextDisplay ?? []) : [];
        const statements = placedStatements(
          snapshot,
          display.map((d, i) => ({ id: String(i), display: d })),
        );
        // the pixel's band is named by the record's lower limit; a record without its two limits names the band
        // alone (AUDIT's U23 advisory), the rest of the page is drawn
        const limits = bandLimitsOf(snapshot);
        setLoaded({
          pixel,
          statements,
          locator: {
            cells: trend.cells,
            ring,
            period: trend.period,
            window: trend.window ?? null,
            bandTop: limits?.[0] ?? null,
            scale: {
              domain: Math.max(...trend.display_scale.domain_per_decade.map(Math.abs)),
              neutral: trend.display_scale.neutral_per_decade,
            },
          },
        });
      },
      () => {
        if (!ac.signal.aborted) setFailed(true);
      },
    );
    return () => {
      ac.abort();
    };
  }, [view, snapshot, cellsFrom]);

  useEffect(() => {
    const stage = stageRef.current;
    const root = stage?.parentElement;
    if (!loaded || !stage || !root) return;
    const scaleOf = () =>
      Math.min(root.clientWidth / PIXEL_DESIGN.width, root.clientHeight / PIXEL_DESIGN.height);
    const step = (s: number) => Math.max(0.05, Math.floor(s * 20) / 20);
    stage.style.setProperty("--stage-scale", step(scaleOf()).toFixed(2));
    const first = aroundRef.current;
    const scene = mountPixel(
      stage,
      loaded.pixel,
      loaded.statements,
      loaded.locator,
      styles,
      {
        paint: first.paint,
        onPaint: (p) => {
          aroundRef.current.onPaint(p);
        },
        ...(first.hero ? { hero: true } : {}),
      },
      question,
      pal,
    );
    sceneRef.current = scene;
    // in place, the leaders follow the pixel on the land
    let raf = 0;
    let lastBox = "";
    const follow = () => {
      // the overview reports the pixel in client px; the stage is scaled to fit its own frame
      const cb = aroundRef.current.pixelBox();
      const sr = stage.getBoundingClientRect();
      const k = sr.width / PIXEL_DESIGN.width || 1;
      const box = cb
        ? {
            x0: (cb.x0 - sr.left) / k,
            y0: (cb.y0 - sr.top) / k,
            x1: (cb.x1 - sr.left) / k,
            y1: (cb.y1 - sr.top) / k,
          }
        : null;
      const ca = aroundRef.current.anchors();
      const toStage = (pts: readonly (readonly [number, number])[]) =>
        pts.map(([x, y]): [number, number] => [(x - sr.left) / k, (y - sr.top) / k]);
      const anchors = ca
        ? { place: toStage(ca.place), cells: toStage(ca.cells), field: toStage(ca.field) }
        : null;
      const key = box
        ? [box.x0, box.y0, box.x1, box.y1, ...(anchors?.cells[0] ?? [])]
            .map((v) => v.toFixed(0))
            .join(",")
        : "";
      if (key !== lastBox) {
        lastBox = key;
        scene.setPixelBox(box, anchors);
        // where the pixel stands on screen, for the layout checks that no card covers it
        root.dataset.pixelBox = cb
          ? [cb.x0, cb.y0, cb.x1, cb.y1].map((v) => v.toFixed(0)).join(",")
          : "";
      }
      raf = requestAnimationFrame(follow);
    };
    raf = requestAnimationFrame(follow);
    if (state === "shifted") {
      const { from, to, points } = loaded.pixel.model.shift;
      const now = scene.shares();
      scene.setShares({
        [to]: (now[to] ?? 0) + points / 100,
        [from]: (now[from] ?? 0) - points / 100,
      });
    }
    // the stage keeps its measured layout and is scaled to fit the frame, centred
    const fit = () => {
      const s = scaleOf();
      // the design's 40 px left margin on the screen's, under the breadcrumb, whatever the scale
      const left = STAGE_MARGIN * (1 - s);
      const top = (root.clientHeight - PIXEL_DESIGN.height * s) / 2;
      stage.style.transform = `translate(${left.toFixed(1)}px, ${top.toFixed(1)}px) scale(${s.toFixed(4)})`;
      setTypeScale(step(s));
    };
    const observer = new ResizeObserver(fit);
    observer.observe(root);
    fit();
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      sceneRef.current = null;
      scene.dispose();
    };
  }, [loaded, state, question, pal, typeScale]);
  const paint = steps.paint;
  useEffect(() => {
    sceneRef.current?.setPaint(paint);
  }, [paint]);

  // the rows' hover background waits for the pointer to move over the view (InstrumentPixelAnatomy.module.css)
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const moved = () => {
      stage.dataset.pointerMoved = "";
    };
    stage.addEventListener("pointermove", moved, { once: true });
    return () => {
      stage.removeEventListener("pointermove", moved);
    };
  }, []);

  return (
    <div className={styles.root} data-instrument="pixel" data-around={inPlace ? "" : undefined}>
      <p id={descriptionId} className={styles.srOnly}>
        {en["instrument.pixel.description"].text}
      </p>
      {failed && (
        <p className={styles.failed} role="status">
          {en["instrument.pixel.failed"].text}
        </p>
      )}
      <div ref={stageRef} className={styles.stage} role="group" aria-describedby={descriptionId} />
    </div>
  );
}
