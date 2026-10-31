"use client";

// The pixel anatomy (approved specimen C): one MODIS 250 m pixel opened into its 10 m Sentinel-2 cells, the measured
// class spectra, its own season record, a labelled linear mix model with movable class boundaries (drag, or focus a
// boundary and use the arrow keys; Home returns to the measured shares) and a proposed, dashed field check. The
// panels are drawn by lib/instruments/pixel/scene.ts on a 1440 x 900 stage scaled to fit. The caption and the
// pixel's data are the pixel anatomy spec's, read from the case (lib/instruments/pixel/case.ts); the cited
// statements are the spec's context display texts with the sources of their Evidence (contracts 1.17.0); the
// locator's trend cells (a GeoTIFF in the bundle) stay on their tested fixture until the bundle's display asset lands.

import type { CaseSnapshot } from "@siterra/contracts";
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
import { useShellSources } from "./ShellContext";
import styles from "./InstrumentPixelAnatomy.module.css";
import { useInstrument } from "./InstrumentRecords";

/**
 * The caption's two source notes from the record (U25): the first citation's own description of what it measures,
 * and the last one's (the mix model); none when the record holds no such measurement.
 */
function tipsOf(
  ids: readonly string[],
  snapshot: CaseSnapshot | null,
): readonly [string | null, string | null] {
  const note = (id: string | undefined) =>
    snapshot?.records.measurementRecords.find((m) => m.id === id)?.aggregation ?? null;
  return [note(ids[0]), note(ids[ids.length - 1])];
}

export function InstrumentPixelAnatomy({
  state = "measured",
  around,
}: {
  /** The model's opening shares: as measured, or the bundle's example shift. */
  state?: "measured" | "shifted";
  /**
   * Opened in place over the land (U27): the panels stand as cards round the pixel's risen cells, 02 chooses their
   * paint, and each card has a leader to the pixel, wherever the overview reports it on the stage.
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
  const aroundRef = useRef(around);
  aroundRef.current = around;
  const inPlace = around !== undefined;
  const [loaded, setLoaded] = useState<{
    pixel: PixelData;
    statements: PlacedStatements;
    locator: PixelLocator;
  } | null>(null);
  const [loadFailed, setFailed] = useState(false);
  const record = useInstrument("pixel_anatomy");
  // the locator's trend cells: the pixel spec draws none yet, so the layer stack spec's trend_cells are read
  const stack = useInstrument("layer_stack");
  const cellsFrom = stack.status === "ready" ? stack.view : null;
  // its credits sit behind the shell's S; the data's short names stay visible
  useShellSources({
    lines: [en["instrument.pixel.credit"].text, `${en["instrument.credit.dem"].text}.`],
    short: [
      en["source.sentinel"].text,
      en["source.modis"].text,
      en["source.worldcover"].text,
      en["source.dem"].text,
    ],
  });
  // an instrument the case holds no spec for cannot be drawn
  const failed = loadFailed || record.status === "failed" || record.status === "absent";
  const view = record.status === "ready" ? record.view : null;
  const snapshot = record.status === "ready" ? record.snapshot : null;
  const caption = view?.spec.caption ?? null;
  // the pixel's question as the case's record states it (P7b-10, contracts 1.22.0); null where it states none
  const params = view?.spec.parameters;
  const question = params?.kind === "pixel_anatomy" ? (params.question ?? null) : null;
  const descriptionId = useId();

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
    if (!loaded || !caption || !stage || !root) return;
    const first = aroundRef.current;
    const scene = mountPixel(
      stage,
      loaded.pixel,
      caption,
      loaded.statements,
      loaded.locator,
      styles,
      first
        ? {
            paint: first.paint,
            onPaint: (p) => {
              aroundRef.current?.onPaint(p);
            },
          }
        : null,
      tipsOf(caption.citationIds, snapshot),
      question,
    );
    sceneRef.current = scene;
    // in place, the leaders follow the pixel on the land
    let raf = 0;
    let lastBox = "";
    const follow = () => {
      // the overview reports the pixel in client px; the stage is scaled to fit its own frame
      const cb = aroundRef.current?.pixelBox() ?? null;
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
      const ca = aroundRef.current?.anchors() ?? null;
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
    if (first) raf = requestAnimationFrame(follow);
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
      const s = Math.min(
        root.clientWidth / PIXEL_DESIGN.width,
        root.clientHeight / PIXEL_DESIGN.height,
      );
      const left = (root.clientWidth - PIXEL_DESIGN.width * s) / 2;
      const top = (root.clientHeight - PIXEL_DESIGN.height * s) / 2;
      stage.style.transform = `translate(${left.toFixed(1)}px, ${top.toFixed(1)}px) scale(${s.toFixed(4)})`;
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
  }, [loaded, caption, state, snapshot, question]);
  const paint = around?.paint;
  useEffect(() => {
    if (paint) sceneRef.current?.setPaint(paint);
  }, [paint]);

  return (
    <div
      className={styles.root}
      data-theme="obsidian"
      data-instrument="pixel"
      data-around={inPlace ? "" : undefined}
    >
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
