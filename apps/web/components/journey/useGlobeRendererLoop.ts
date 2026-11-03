import { useEffect, type RefObject } from "react";
import { format } from "../../lib/copy/en";
import { crestCurve, findCrest } from "../../lib/globe/crest";
import {
  R_KM,
  globeCamera,
  project,
  unit,
  type GlobeCamera,
} from "../../lib/globe/frame";
import { loadGlobe, type GlobeAssets } from "../../lib/globe/grids";
import { polygonPath, rangePath, ringPoints, ringRho } from "../../lib/globe/overlay";
import { GlobeRenderer, type GlobeData } from "../../lib/globe/renderer";
import { KEY, globeStateAt, progress, sunFor, type Moments } from "../../lib/globe/timeline";
import { CAM } from "../../lib/globe/views";
import type { GlobeCase } from "./GlobePage";
import {
  STEP_COLUMN_RIGHT,
  clampLat,
  shortDeltaLon,
  wrapLon,
  type CamRotationState,
  type Phase,
} from "./useGlobeCameraAndCases";

export function useGlobeRendererLoop(params: {
  globeOn: boolean;
  globeAssets: GlobeAssets;
  initialOutletLon: number;
  initialOutletLat: number;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  ringRef: RefObject<SVGPathElement | null>;
  rangeLineRef: RefObject<SVGPathElement | null>;
  rangeTextRef: RefObject<SVGTextPathElement | null>;
  rangeGroupRef: RefObject<SVGTextElement | null>;
  casePointRef: RefObject<HTMLDivElement | null>;
  caseCardRef: RefObject<HTMLDivElement | null>;
  otherElsRef: RefObject<Map<string, HTMLAnchorElement>>;
  savedCasesRef: RefObject<GlobeCase[]>;
  activePinIdRef: RefObject<string | null>;
  outletRef: RefObject<{ lon: number; lat: number }>;
  fadeRef: RefObject<[number, number, number]>;
  rangeNameRef: RefObject<string>;
  globeDataRef: RefObject<GlobeData | null>;
  globeWaitersRef: RefObject<((g: GlobeData | null) => void)[]>;
  curveRef: RefObject<[number, number][]>;
  lastCamRef: RefObject<GlobeCamera | null>;
  camRotRef: RefObject<CamRotationState>;
  globeThemeRef: RefObject<"light" | "obsidian">;
  t0Ref: RefObject<number>;
  momentsRef: RefObject<Moments>;
  reducedRef: RefObject<boolean>;
  setFrom: (pt: { x: number; y: number }) => void;
  setPhase: (updater: (prev: Phase) => Phase) => void;
}): void {
  const {
    globeOn,
    globeAssets,
    initialOutletLon,
    initialOutletLat,
    canvasRef,
    ringRef,
    rangeLineRef,
    rangeTextRef,
    rangeGroupRef,
    casePointRef,
    caseCardRef,
    otherElsRef,
    savedCasesRef,
    activePinIdRef,
    outletRef,
    fadeRef,
    rangeNameRef,
    globeDataRef,
    globeWaitersRef,
    curveRef,
    lastCamRef,
    camRotRef,
    globeThemeRef,
    t0Ref,
    momentsRef,
    reducedRef,
    setFrom,
    setPhase,
  } = params;

  useEffect(() => {
    const el = canvasRef.current;
    if (!el || !globeOn) return;
    if (t0Ref.current === 0) t0Ref.current = performance.now();
    reducedRef.current = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let renderer: GlobeRenderer | undefined = new GlobeRenderer(el);
    let raf = 0;
    let ready = false;
    loadGlobe(globeAssets)
      .then((g) => {
        globeDataRef.current = g;
        for (const resolve of globeWaitersRef.current.splice(0)) resolve(g);
        renderer?.setGlobe(g);
        curveRef.current = crestCurve(findCrest(g.world, outletRef.current), outletRef.current);
        ready = true;
      })
      .catch((e: unknown) => {
        for (const resolve of globeWaitersRef.current.splice(0)) resolve(null);
        console.error("Journey: globe data failed", e);
      });

    const frame = () => {
      raf = requestAnimationFrame(frame);
      if (!ready || !renderer) return;
      const w = el.clientWidth;
      const h = el.clientHeight;
      // When the canvas has zero size (hidden under the overview), skip drawing to avoid NaN projections.
      if (w < 1 || h < 1) return;
      const t = (performance.now() - t0Ref.current) / 1000;
      const o = outletRef.current;
      const caseV = unit(o.lon, o.lat);
      const s = globeStateAt(t, momentsRef.current, reducedRef.current, o);
      const v = { ...s.view };

      const rot = camRotRef.current;
      if (momentsRef.current.dive === undefined) {
        const pressT = momentsRef.current.press;
        const openingDrift = pressT === undefined && !reducedRef.current ? t * 2.4 : 0;
        if (!rot.active) {
          v.lon = wrapLon(v.lon + openingDrift);
          rot.lon = v.lon;
          rot.lat = v.lat;
          rot.fromLon = v.lon;
          rot.fromLat = v.lat;
          rot.toLon = v.lon;
          rot.toLat = v.lat;
        } else {
          if (rot.panDur > 0) {
            const k = progress(t, rot.panStart, rot.panDur, CAM, reducedRef.current);
            rot.lon = wrapLon(rot.fromLon + shortDeltaLon(rot.fromLon, rot.toLon) * k);
            rot.lat = clampLat(rot.fromLat + (rot.toLat - rot.fromLat) * k);
            if (k >= 1) rot.panDur = 0;
          }
          v.lon = wrapLon(rot.lon + openingDrift);
          v.lat = rot.lat;
        }
      }

      const ringOpacity =
        rot.active && momentsRef.current.dive === undefined
          ? Math.max(s.ringOpacity, 1)
          : s.ringOpacity;

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
      lastCamRef.current = cam;

      const dpr = devicePixelRatio || 1;
      renderer.resize(Math.round(w * dpr), Math.round(h * dpr));
      const lightK = globeThemeRef.current === "light" ? 1 : 0;
      renderer.draw({
        ...s.uniforms,
        cam,
        sun: sunFor(cam, s.sunK),
        key: KEY,
        caseV,
        fadeC: fadeRef.current,
        light: lightK,
      });

      const e = cam.eye;
      const caseFacing =
        caseV[0] * (e[0] - caseV[0]) + caseV[1] * (e[1] - caseV[1]) + caseV[2] * (e[2] - caseV[2]) >
        0;

      // Project the case ring, point, and range crest label.
      const ringD = caseFacing
        ? polygonPath(cam.vp, ringPoints(caseV, o.lon, ringRho(v.distance)), w, h)
        : undefined;
      if (ringRef.current) {
        ringRef.current.setAttribute("d", ringD ?? "");
        ringRef.current.style.opacity = String(caseFacing ? ringOpacity : 0);
      }
      const lifted: [number, number, number] = [
        caseV[0] * (1 + 3 / R_KM),
        caseV[1] * (1 + 3 / R_KM),
        caseV[2] * (1 + 3 / R_KM),
      ];
      const cs = caseFacing ? project(cam.vp, lifted, w, h) : undefined;
      const targetVisibleOnStage = cs
        ? cs[0] >= 620 || momentsRef.current.dive !== undefined
        : false;
      if (ringRef.current) {
        ringRef.current.style.opacity = String(caseFacing && targetVisibleOnStage ? ringOpacity : 0);
      }
      if (casePointRef.current) {
        casePointRef.current.style.transform = cs
          ? `translate(${cs[0].toFixed(1)}px, ${cs[1].toFixed(1)}px)`
          : "";
        casePointRef.current.style.opacity = String(cs && targetVisibleOnStage ? ringOpacity : 0);
      }

      // Position the monument callout below-right of the target point on the globe.
      const cx = cs ? Math.min(Math.max(cs[0] + 22, 690), w - 348) : Math.max(690, w - 360);
      const cy = cs ? Math.min(Math.max(cs[1] + 14, 96), h - 190) : Math.max(120, h / 2 - 20);
      if (caseCardRef.current) {
        caseCardRef.current.style.transform = `translate(${cx.toFixed(1)}px, ${cy.toFixed(1)}px)`;
        caseCardRef.current.style.visibility =
          ringOpacity > 0.05 && targetVisibleOnStage ? "visible" : "hidden";
        caseCardRef.current.style.opacity = String(targetVisibleOnStage ? ringOpacity : 0);
      }

      // Project secondary saved case pins on the front-facing hemisphere.
      const activePinId = activePinIdRef.current;
      for (const sc of savedCasesRef.current) {
        const pinKey = sc.seedCaseId ?? sc.id;
        const pinEl = otherElsRef.current.get(pinKey);
        if (!pinEl) continue;
        const lon = sc.lon ?? initialOutletLon;
        const lat = sc.lat ?? initialOutletLat;
        const ov = unit(lon, lat);
        const lift: [number, number, number] = [
          ov[0] * (1 + 3 / R_KM),
          ov[1] * (1 + 3 / R_KM),
          ov[2] * (1 + 3 / R_KM),
        ];
        const ps = project(cam.vp, lift, w, h);
        const facing = ov[0] * (e[0] - ov[0]) + ov[1] * (e[1] - ov[1]) + ov[2] * (e[2] - ov[2]) > 0;
        const isCurrentTarget = activePinId === pinKey;
        const distToTarget = cs && ps ? Math.hypot(ps[0] - cs[0], ps[1] - cs[1]) : 999;
        const overlapsMonument =
          ps !== undefined &&
          ps[0] >= cx - 70 &&
          ps[0] <= cx + 350 &&
          ps[1] >= cy - 28 &&
          ps[1] <= cy + 140;
        const tooCloseToTarget = distToTarget < 95 || overlapsMonument;
        const onRightStage = ps
          ? ps[0] >= STEP_COLUMN_RIGHT && ps[0] <= w - 40 && ps[1] >= 70 && ps[1] <= h - 110
          : false;
        const shown =
          ps && facing && !isCurrentTarget && !tooCloseToTarget && onRightStage ? ringOpacity : 0;
        pinEl.style.transform = ps ? `translate(${ps[0].toFixed(1)}px, ${ps[1].toFixed(1)}px)` : "";
        pinEl.style.opacity = shown.toFixed(3);
        pinEl.style.visibility = shown > 0.05 ? "visible" : "hidden";
      }

      const curve = curveRef.current;
      const rd =
        s.rangeOpacity > 0.001 && curve.length && caseFacing && targetVisibleOnStage
          ? rangePath(cam.vp, curve, w, h)
          : undefined;
      if (rd) rangeLineRef.current?.setAttribute("d", rd);
      if (rangeTextRef.current) {
        const name = format("globe.range", { range: rangeNameRef.current });
        if (rangeTextRef.current.textContent !== name) rangeTextRef.current.textContent = name;
      }
      if (rangeGroupRef.current) rangeGroupRef.current.style.opacity = String(rd ? s.rangeOpacity : 0);

      // Once the globe dive finishes, hand over to the valley overview.
      if (s.done) {
        setFrom(cs ? { x: cs[0], y: cs[1] } : { x: w / 2, y: h / 2 });
        setPhase((p) => (p === "zoom" ? "land" : p));
      }
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      renderer?.dispose();
      renderer = undefined;
    };
  }, [
    globeOn,
    globeAssets,
    initialOutletLon,
    initialOutletLat,
    canvasRef,
    ringRef,
    rangeLineRef,
    rangeTextRef,
    rangeGroupRef,
    casePointRef,
    caseCardRef,
    otherElsRef,
    savedCasesRef,
    activePinIdRef,
    outletRef,
    fadeRef,
    rangeNameRef,
    globeDataRef,
    globeWaitersRef,
    curveRef,
    lastCamRef,
    camRotRef,
    globeThemeRef,
    t0Ref,
    momentsRef,
    reducedRef,
    setFrom,
    setPhase,
  ]);
}
