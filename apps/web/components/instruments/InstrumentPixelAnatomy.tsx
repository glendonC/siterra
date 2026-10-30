"use client";

// The pixel anatomy (approved specimen C): one MODIS 250 m pixel opened into its 10 m Sentinel-2 cells, the measured
// class spectra, its own season record, a labelled linear mix model with movable class boundaries (drag, or focus a
// boundary and use the arrow keys; Home returns to the measured shares) and a proposed, dashed field check. The
// panels are drawn by lib/instruments/pixel/scene.ts on a 1440 x 900 stage scaled to fit. The caption and the
// pixel's data are the pixel anatomy spec's, read from the case (lib/instruments/pixel/case.ts); the cited
// statements are the spec's context display texts with the sources of their Evidence (contracts 1.17.0); the
// locator's trend cells (a GeoTIFF in the bundle) stay on their tested fixture until the bundle's display asset lands.

import { useEffect, useId, useRef, useState } from "react";
import { en } from "../../lib/copy/en";
import { loadCasePixel } from "../../lib/instruments/pixel/case";
import type { PixelData } from "../../lib/instruments/pixel/data";
import { PIXEL_DESIGN, mountPixel, type PixelLocator } from "../../lib/instruments/pixel/scene";
import { placedStatements, type PlacedStatements } from "../../lib/instruments/placed-statements";
import { drawnAsset, readJsonAsset } from "../../lib/instruments/listing";
import { bandLimitsOf } from "../../lib/land/record";
import { trendCellsFrom } from "../../lib/overview/footprint";
import { useShellSources } from "./ShellContext";
import styles from "./InstrumentPixelAnatomy.module.css";
import { useInstrument } from "./InstrumentRecords";

export function InstrumentPixelAnatomy({
  state = "measured",
}: {
  /** The model's opening shares: as measured, or the bundle's example shift. */
  state?: "measured" | "shifted";
}) {
  const stageRef = useRef<HTMLDivElement>(null);
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
        // the pixel's band is named by the record's lower limit; without it the page cannot be drawn
        const limits = bandLimitsOf(snapshot);
        if (!limits) {
          console.error("The record holds no two elevation band limits");
          setFailed(true);
          return;
        }
        setLoaded({
          pixel,
          statements,
          locator: {
            cells: trend.cells,
            ring,
            period: trend.period,
            bandTop: limits[0],
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
