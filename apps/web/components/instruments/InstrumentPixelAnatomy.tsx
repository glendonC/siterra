"use client";

// The pixel anatomy (approved specimen C): one MODIS 250 m pixel opened into its 10 m Sentinel-2 cells, the measured
// class spectra, its own season record, a labelled linear mix model with movable class boundaries (drag, or focus a
// boundary and use the arrow keys; Home returns to the measured shares) and a proposed, dashed field check. The
// panels are drawn by lib/instruments/pixel/scene.ts on a 1440 x 900 stage scaled to fit. The caption and the
// pixel's data are the pixel anatomy spec's, read from the case (lib/instruments/pixel/case.ts); the locator's
// trend cells (a GeoTIFF in the bundle) and the cited statements stay on their tested fixtures until the bundle's
// display asset and the Evidence wording land.

import { useEffect, useId, useRef, useState } from "react";
import { en } from "../../lib/copy/en";
import { loadCasePixel } from "../../lib/instruments/pixel/case";
import type { PixelData } from "../../lib/instruments/pixel/data";
import { PIXEL_DESIGN, mountPixel, type PixelLocator } from "../../lib/instruments/pixel/scene";
import { statementsSchema, type Statements } from "../../lib/instruments/valley/cutaway-data";
import { VALLEY_FIXTURES, json, trendCellsSchema } from "../../lib/instruments/valley/fixtures";
import styles from "./InstrumentPixelAnatomy.module.css";
import { useInstrument } from "./InstrumentRecords";

export function InstrumentPixelAnatomy({
  valley = VALLEY_FIXTURES,
  state = "measured",
}: {
  /** The valley fixtures: the statements, and the trend cells the locator draws. */
  valley?: string;
  /** The model's opening shares: as measured, or the bundle's example shift. */
  state?: "measured" | "shifted";
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState<{
    pixel: PixelData;
    statements: Statements;
    locator: PixelLocator;
  } | null>(null);
  const [loadFailed, setFailed] = useState(false);
  const record = useInstrument("pixel_anatomy");
  const failed = loadFailed || record.status === "failed";
  const view = record.status === "ready" ? record.view : null;
  const caption = view?.spec.caption ?? null;
  const descriptionId = useId();

  useEffect(() => {
    if (!view) return;
    const ac = new AbortController();
    Promise.all([
      loadCasePixel(view, (input, init) => fetch(input, init), ac.signal),
      json(`${valley}statements.json`, statementsSchema, ac.signal),
      json(`${valley}trend-cells.json`, trendCellsSchema, ac.signal),
    ]).then(
      ([{ pixel, ring }, statements, trend]) => {
        setLoaded({ pixel, statements, locator: { cells: trend.cells, ring } });
      },
      () => {
        if (!ac.signal.aborted) setFailed(true);
      },
    );
    return () => {
      ac.abort();
    };
  }, [view, valley]);

  useEffect(() => {
    const stage = stageRef.current;
    const root = stage?.parentElement;
    if (!loaded || !caption || !stage || !root) return;
    const scene = mountPixel(
      stage,
      loaded.pixel,
      caption,
      loaded.statements,
      loaded.locator,
      styles,
    );
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
      observer.disconnect();
      scene.dispose();
    };
  }, [loaded, caption, state]);

  return (
    <div className={styles.root} data-theme="obsidian" data-instrument="pixel">
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
