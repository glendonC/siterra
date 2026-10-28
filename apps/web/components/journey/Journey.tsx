"use client";

// The sequence as one view: the opening over the globe's limb, the globe, the dive and the arrival; the
// opening's skip link goes straight to the arrival. One clock drives both renderers: the ported globe
// (WebGL2) and the MapLibre valley, which fades in at the dive's relief rise; the globe renderer is then
// disposed so only MapLibre's context runs.

import type * as maplibregl from "maplibre-gl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { en, type MessageId } from "../../lib/copy/en";
import { crestCurve, findCrest } from "../../lib/globe/crest";
import { viewToMapCamera } from "../../lib/globe/drive";
import { R_KM, globeCamera, project } from "../../lib/globe/frame";
import { polygonPath, rangePath, ringPoints, ringRho } from "../../lib/globe/overlay";
import { regionPack } from "../../lib/pack/regionPack";
import { OUTLET } from "../../lib/stage/arrival";
import { widthFitScale } from "../../lib/stage/camera";
import { loadGlobe, type GlobeAssets } from "../../lib/globe/grids";
import { GlobeRenderer } from "../../lib/globe/renderer";
import { CASE_V, FADE_V, KEY, globeStateAt, sunFor, type Moments } from "../../lib/globe/timeline";
import { Opening } from "../opening/Opening";
import { GlobePage } from "./GlobePage";
import type { CaseSnapshot } from "@siterra/contracts";
import type { MapBundle } from "../../lib/map/bundle";
import type { ReadyArrival } from "../../lib/projection/arrival";
import { ArrivalView } from "../views/ArrivalView";
import styles from "./Journey.module.css";

export interface JourneyProps {
  /** The valley's and the globe's assets, from the one map bundle. */
  valleyAssets: MapBundle["valley"];
  contourArea?: MapBundle["contours"];
  globeAssets: GlobeAssets;
  /** The case's arrival, projected from its record. */
  arrival: ReadyArrival;
  snapshot: CaseSnapshot;
}

type Phase = "opening" | "globe" | "dive" | "arrival";

const RANGE_NAMES: [MessageId, MessageId] = ["globe.range", "dive.highAtlas"];

export function Journey({
  valleyAssets,
  contourArea,
  globeAssets,
  arrival,
  snapshot,
}: JourneyProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const valley = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const ring = useRef<SVGPathElement>(null);
  const rangeLine = useRef<SVGPathElement>(null);
  const rangeText = useRef<SVGTextPathElement>(null);
  const rangeGroup = useRef<SVGTextElement>(null);
  const casePoint = useRef<HTMLDivElement>(null);
  const valleyName = useRef<HTMLDivElement>(null);
  const t0 = useRef(0);
  const moments = useRef<Moments>({ beats: [] });
  const [phase, setPhase] = useState<Phase>("opening");
  const pack = useMemo(() => regionPack(snapshot), [snapshot]);

  const now = () => (performance.now() - t0.current) / 1000;

  const onShown = useCallback(() => {
    if (moments.current.beats.length === 0) moments.current.beats.push(now());
  }, []);
  // the skip link: straight to the arrival; the frame loop stops and the valley shows at its pose
  const skipped = useRef(false);
  const onSkip = useCallback(() => {
    skipped.current = true;
    if (valley.current) valley.current.style.opacity = "1";
    setPhase("arrival");
  }, []);
  const onOpen = useCallback(() => {
    moments.current.press ??= now();
    setPhase("globe");
  }, []);
  const onMap = useCallback((m: maplibregl.Map) => {
    map.current = m;
  }, []);

  const onDive = useCallback(() => {
    moments.current.dive ??= now();
    setPhase("dive");
  }, []);

  // the globe page: Enter dives (a focused button handles its own Enter)
  useEffect(() => {
    if (phase !== "globe") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || e.altKey || e.ctrlKey || e.metaKey) return;
      if ((e.target as HTMLElement | null)?.tagName === "BUTTON") return;
      e.preventDefault();
      onDive();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [phase, onDive]);

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    t0.current = performance.now();
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let renderer: GlobeRenderer | undefined = new GlobeRenderer(el);
    let raf = 0;
    let ready = false;
    let curve: [number, number][] = [];
    loadGlobe(globeAssets)
      .then((g) => {
        renderer?.setGlobe(g);
        curve = crestCurve(findCrest(g.world), OUTLET);
        ready = true;
      })
      .catch((e: unknown) => {
        console.error("Journey: globe data failed", e);
      });

    const frame = () => {
      if (skipped.current) {
        renderer?.dispose(true);
        renderer = undefined;
        return;
      }
      raf = requestAnimationFrame(frame);
      if (!ready) return;
      const w = el.clientWidth;
      const h = el.clientHeight;
      const s = globeStateAt(now(), moments.current, reduced);
      // the same width fit as the arrival, on both renderers, so the cross-fade lines up
      const v = { ...s.view, distance: s.view.distance * widthFitScale(w, h) };

      // the valley follows the same camera from its first visible frame to the arrival pose
      const m = map.current;
      if (valley.current) valley.current.style.opacity = String(s.valleyOpacity);
      if (m && s.valleyOpacity > 0) {
        const c = viewToMapCamera(v, h);
        m.jumpTo({
          center: c.center,
          zoom: c.zoom,
          pitch: c.pitch,
          bearing: c.bearing,
          elevation: c.elevation,
        });
        m.setTerrain({ source: "terrain", exaggeration: Math.max(s.valleyExaggeration, 0.001) });
      }
      if (s.done) {
        cancelAnimationFrame(raf);
        setPhase("arrival");
        return;
      }
      if (renderer && s.globeDone) {
        // the valley covers the globe: give its context back so only MapLibre's runs
        renderer.dispose(true);
        renderer = undefined;
        el.style.opacity = "0";
      }
      const cam = globeCamera(
        {
          lon: v.lon,
          lat: v.lat,
          h: v.tz / 2,
          bearing: v.bearing,
          pitch: v.pitch,
          distance: v.distance,
          fov: v.fov,
          shiftX: v.shiftX,
          shiftY: v.shiftY,
        },
        w / h,
      );
      if (renderer) {
        const dpr = devicePixelRatio || 1;
        renderer.resize(Math.round(w * dpr), Math.round(h * dpr));
        renderer.draw({
          ...s.uniforms,
          cam,
          sun: sunFor(cam, s.sunK),
          key: KEY,
          caseV: CASE_V,
          fadeC: FADE_V,
        });
        el.style.opacity = String(1 - s.valleyOpacity);
      }

      // the overlay: the case ring and point, the range name, and the valley's name late in the dive
      const ringD = polygonPath(cam.vp, ringPoints(CASE_V, OUTLET.lon, ringRho(v.distance)), w, h);
      if (ring.current) {
        ring.current.setAttribute("d", ringD ?? "");
        ring.current.style.opacity = String(s.ringOpacity);
      }
      const lifted: [number, number, number] = [
        CASE_V[0] * (1 + 3 / R_KM),
        CASE_V[1] * (1 + 3 / R_KM),
        CASE_V[2] * (1 + 3 / R_KM),
      ];
      const cs = project(cam.vp, lifted, w, h);
      if (casePoint.current) {
        casePoint.current.style.transform = cs
          ? `translate(${cs[0].toFixed(1)}px, ${cs[1].toFixed(1)}px)`
          : "";
        casePoint.current.style.opacity = String(cs ? s.ringOpacity : 0);
      }
      if (valleyName.current) {
        valleyName.current.style.transform = cs
          ? `translate(${(cs[0] + 18).toFixed(1)}px, ${(cs[1] - 9).toFixed(1)}px)`
          : "";
        valleyName.current.style.opacity = String(cs ? s.valleyNameOpacity : 0);
      }
      const rd =
        s.rangeOpacity > 0.001 && curve.length ? rangePath(cam.vp, curve, w, h) : undefined;
      if (rd) rangeLine.current?.setAttribute("d", rd);
      if (rangeText.current) {
        const name = en[RANGE_NAMES[s.rangeName]].text;
        if (rangeText.current.textContent !== name) rangeText.current.textContent = name;
      }
      if (rangeGroup.current) rangeGroup.current.style.opacity = String(rd ? s.rangeOpacity : 0);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      renderer?.dispose();
    };
  }, [globeAssets]);

  return (
    <div className={styles.journey} data-phase={phase}>
      <div ref={valley} id="arrival" className={styles.valley} aria-hidden={phase !== "arrival"}>
        <ArrivalView
          assets={valleyAssets}
          contourArea={contourArea}
          arrival={arrival}
          snapshot={snapshot}
          chrome={phase === "arrival"}
          onMap={onMap}
        />
      </div>
      {phase !== "arrival" ? (
        <>
          <canvas ref={canvas} className={styles.globe} aria-hidden="true" />
          <svg className={styles.overlay} aria-hidden="true">
            <defs>
              <path id="range-path" ref={rangeLine} d="M0 0" />
            </defs>
            <path ref={ring} className={styles.ring} />
            <text ref={rangeGroup} className={styles.rangeText} dy="-1.5em">
              <textPath ref={rangeText} href="#range-path" startOffset="50%" textAnchor="middle" />
            </text>
          </svg>
          <div ref={casePoint} className={styles.casePoint} aria-hidden="true" />
          <div ref={valleyName} className={styles.diveName} aria-hidden="true">
            {en["arrival.valleyName"].text}
          </div>
        </>
      ) : null}
      {phase === "opening" ? (
        <Opening
          question={arrival.question}
          pack={pack}
          onOpen={onOpen}
          onSkip={onSkip}
          onShown={onShown}
        />
      ) : null}
      {phase === "globe" ? <GlobePage packName={pack.name} onDive={onDive} /> : null}
      {phase === "opening" || phase === "globe" ? (
        <p className={styles.legend}>
          <i className={styles.legendSwatch} aria-hidden="true" />
          {en["globe.legend"].text}
        </p>
      ) : null}
      {phase !== "arrival" ? (
        <p className={styles.credit}>
          {phase === "dive" ? (
            <>
              {en["credit.dive"].text}
              <br />
            </>
          ) : null}
          {en["credit.globe"].text}
        </p>
      ) : null}
    </div>
  );
}
