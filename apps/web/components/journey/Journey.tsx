"use client";

// The sequence as one world (decision 11, 30 Oct 2026): the opening over the globe's limb, the globe with the case's
// card, then Open: the camera zooms straight down onto the case's point while the earth sinks into the ground, and
// the case's own land, the overview's (approved specimen D4), rises out of that ground under the point while its
// camera comes down to the overview's pose without a cut; then the arc draws on and the findings come in. One palette
// (Obsidian) from the first screen; one picture of the place at a time; the case's card stays on screen until the
// land takes its place. Esc or Enter ends the arrival at once; under reduced motion Open cuts to the overview.

import { useCallback, useEffect, useRef, useState } from "react";
import { en, format } from "../../lib/copy/en";
import { crestCurve, findCrest } from "../../lib/globe/crest";
import { R_KM, globeCamera, project, unit } from "../../lib/globe/frame";
import { polygonPath, rangePath, ringPoints, ringRho } from "../../lib/globe/overlay";
import { loadGlobe, type GlobeAssets } from "../../lib/globe/grids";
import { GlobeRenderer } from "../../lib/globe/renderer";
import { KEY, globeStateAt, sunFor, type Moments } from "../../lib/globe/timeline";
import { centreOf } from "../../lib/land/geometry";
import { Opening } from "../opening/Opening";
import { GlobePage } from "./GlobePage";
import type { CaseSnapshot } from "@siterra/contracts";
import type { ReadyArrival } from "../../lib/projection/arrival";
import { InstrumentRecords } from "../instruments/InstrumentRecords";
import { ValleyOverview } from "../overview/ValleyOverview";
import { KeyLegend, SourcesLine, SourcesPanel, typing } from "../controls/ScreenChrome";
import styles from "./Journey.module.css";

export interface JourneyProps {
  /** The globe's assets, from the map bundle. */
  globeAssets: GlobeAssets;
  /** The case's arrival, projected from its record. */
  arrival: ReadyArrival;
  snapshot: CaseSnapshot;
}

/** opening, globe; zoom: Open pressed, the camera going down; land: the overview's own arrival; rest. */
type Phase = "opening" | "globe" | "zoom" | "land" | "rest";

export function Journey({ globeAssets, arrival, snapshot }: JourneyProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const ring = useRef<SVGPathElement>(null);
  const rangeLine = useRef<SVGPathElement>(null);
  const rangeText = useRef<SVGTextPathElement>(null);
  const rangeGroup = useRef<SVGTextElement>(null);
  const casePoint = useRef<HTMLDivElement>(null);
  const caseCard = useRef<HTMLDivElement>(null);
  // the case's place on the sphere: its outlet from the record, else its catchment's centre; the earth sinks into the
  // ground round the catchment's centre
  const outline = arrival.catchment.geometry.coordinates[0] ?? [];
  const centre = centreOf(outline);
  const outlet = arrival.land.outlet ?? centre;
  const outletRef = useRef(outlet);
  outletRef.current = outlet;
  const fadeRef = useRef(unit(centre.lon, centre.lat));
  fadeRef.current = unit(centre.lon, centre.lat);
  const t0 = useRef(0);
  const moments = useRef<Moments>({ beats: [] });
  const [phase, setPhase] = useState<Phase>("opening");
  // where the case's point stood on screen when the globe handed over (CSS px), and whether to end the arrival at once
  const [from, setFrom] = useState<{ x: number; y: number } | null>(null);
  const [skip, setSkip] = useState(false);
  // the overview has drawn its land at rest, out of sight: the arrival can begin
  const [landReady, setLandReady] = useState(false);
  const onLandReady = useCallback(() => {
    setLandReady(true);
  }, []);
  const onArrived = useCallback(() => {
    setPhase("rest");
  }, []);

  // the credits sit behind one Sources button (S) with the data's short names always visible (decision 5)
  const [sourcesOpen, setSourcesOpen] = useState(false);
  useEffect(() => {
    if (phase !== "opening" && phase !== "globe") return;
    const onKey = (e: KeyboardEvent) => {
      if (typing(e)) return;
      if (e.key === "s" || e.key === "S") {
        e.preventDefault();
        setSourcesOpen((o) => !o);
      } else if (e.key === "Escape") setSourcesOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [phase]);

  const now = () => (performance.now() - t0.current) / 1000;
  const reduced = useRef(false);

  const onShown = useCallback(() => {
    if (moments.current.beats.length === 0) moments.current.beats.push(now());
  }, []);
  const onOpen = useCallback(() => {
    moments.current.press ??= now();
    setPhase("globe");
  }, []);
  const onDive = useCallback(() => {
    moments.current.dive ??= now();
    setSourcesOpen(false);
    // under reduced motion Open cuts straight to the overview
    if (reduced.current) {
      setSkip(true);
      setPhase("land");
    } else setPhase("zoom");
  }, []);

  // the globe page: Enter opens the case (a focused button handles its own Enter)
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

  // while the camera goes down and the land arrives, Esc or Enter ends it at once
  useEffect(() => {
    if (phase !== "zoom" && phase !== "land") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" && e.key !== "Enter") return;
      e.preventDefault();
      setSkip(true);
      setPhase("land");
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [phase]);

  // the globe: one clock from the opening to the moment the earth has sunk into the ground under the case's point
  const globeOn = phase === "opening" || phase === "globe" || phase === "zoom";
  useEffect(() => {
    const el = canvas.current;
    if (!el || !globeOn) return;
    if (t0.current === 0) t0.current = performance.now();
    reduced.current = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let renderer: GlobeRenderer | undefined = new GlobeRenderer(el);
    let raf = 0;
    let ready = false;
    let curve: [number, number][] = [];
    loadGlobe(globeAssets)
      .then((g) => {
        renderer?.setGlobe(g);
        curve = crestCurve(findCrest(g.world, outletRef.current), outletRef.current);
        ready = true;
      })
      .catch((e: unknown) => {
        console.error("Journey: globe data failed", e);
      });

    const frame = () => {
      raf = requestAnimationFrame(frame);
      if (!ready || !renderer) return;
      const w = el.clientWidth;
      const h = el.clientHeight;
      const o = outletRef.current;
      const caseV = unit(o.lon, o.lat);
      const s = globeStateAt(now(), moments.current, reduced.current, o);
      const v = s.view;
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
      const dpr = devicePixelRatio || 1;
      renderer.resize(Math.round(w * dpr), Math.round(h * dpr));
      renderer.draw({
        ...s.uniforms,
        cam,
        sun: sunFor(cam, s.sunK),
        key: KEY,
        caseV,
        fadeC: fadeRef.current,
      });

      // the overlay: the case ring and point, the range name
      const ringD = polygonPath(cam.vp, ringPoints(caseV, o.lon, ringRho(v.distance)), w, h);
      if (ring.current) {
        ring.current.setAttribute("d", ringD ?? "");
        ring.current.style.opacity = String(s.ringOpacity);
      }
      const lifted: [number, number, number] = [
        caseV[0] * (1 + 3 / R_KM),
        caseV[1] * (1 + 3 / R_KM),
        caseV[2] * (1 + 3 / R_KM),
      ];
      const cs = project(cam.vp, lifted, w, h);
      if (casePoint.current) {
        casePoint.current.style.transform = cs
          ? `translate(${cs[0].toFixed(1)}px, ${cs[1].toFixed(1)}px)`
          : "";
        casePoint.current.style.opacity = String(cs ? s.ringOpacity : 0);
      }
      // the case's card stands beside its point (with one case it opens by itself) and goes down with it
      if (caseCard.current) {
        caseCard.current.style.transform = cs
          ? `translate(${(cs[0] + 22).toFixed(1)}px, ${(cs[1] - 28).toFixed(1)}px)`
          : "";
        caseCard.current.style.visibility = cs && s.ringOpacity > 0.05 ? "visible" : "hidden";
        caseCard.current.style.opacity = String(cs ? s.ringOpacity : 0);
      }
      const rd =
        s.rangeOpacity > 0.001 && curve.length ? rangePath(cam.vp, curve, w, h) : undefined;
      if (rd) rangeLine.current?.setAttribute("d", rd);
      if (rangeText.current) {
        const name = format("globe.range", { range: arrival.regionName });
        if (rangeText.current.textContent !== name) rangeText.current.textContent = name;
      }
      if (rangeGroup.current) rangeGroup.current.style.opacity = String(rd ? s.rangeOpacity : 0);
      // the earth has sunk into the ground under the point: the land takes over from here
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
  }, [globeOn, globeAssets, arrival.regionName]);

  // the land arrives once the globe has handed over and the overview has drawn its land
  const run = (phase === "land" || phase === "rest") && landReady;
  const landing = phase === "land" && run && !skip;
  // the overview is mounted from the globe page on, so its land is drawn by the time the camera reaches the point
  const overviewOn = phase !== "opening";

  return (
    <div
      className={styles.journey}
      data-theme="obsidian"
      data-phase={phase}
      data-landing={landing ? "" : undefined}
    >
      {globeOn || phase === "land" ? (
        // the globe lies under the overview: once disposed it keeps its last frame, the bare ground
        <canvas ref={canvas} className={styles.globe} aria-hidden="true" />
      ) : null}
      {overviewOn ? (
        <div
          id="arrival"
          className={styles.overview}
          data-shown={run ? "" : undefined}
          aria-hidden={run ? undefined : true}
          inert={!run}
        >
          <InstrumentRecords snapshot={snapshot}>
            <ValleyOverview
              onSettled={onLandReady}
              intro={{ run, skip, from, onDone: onArrived }}
            />
          </InstrumentRecords>
        </div>
      ) : null}
      {globeOn || (phase === "land" && !(run && skip)) ? (
        <>
          <svg className={styles.overlay} aria-hidden="true">
            <defs>
              <path id="range-path" ref={rangeLine} d="M0 0" />
            </defs>
            <path ref={ring} className={styles.ring} />
            <text ref={rangeGroup} className={styles.rangeText} dy="-1.5em">
              <textPath ref={rangeText} href="#range-path" startOffset="50%" textAnchor="middle" />
            </text>
          </svg>
        </>
      ) : null}
      {phase !== "opening" && phase !== "rest" && !(run && skip) ? (
        // the case's point and card: on the globe, going down with the camera, and kept over the ground until the
        // land has taken their place
        <div className={styles.handover}>
          <div ref={casePoint} className={styles.casePoint} aria-hidden="true" />
          <GlobePage
            cases={[
              {
                id: arrival.caseId,
                place: arrival.valleyName,
                region: arrival.regionName,
                question: arrival.question,
              },
            ]}
            cardRef={caseCard}
            onOpen={onDive}
            opened={phase !== "globe"}
          />
        </div>
      ) : null}
      {phase === "opening" ? <Opening onOpen={onOpen} onShown={onShown} /> : null}
      {phase === "opening" || phase === "globe" ? (
        <>
          <p className={styles.legend}>
            <i className={styles.legendSwatch} aria-hidden="true" />
            {en["globe.legend"].text}
          </p>
          <JourneySources open={sourcesOpen} onToggle={setSourcesOpen} />
        </>
      ) : null}
    </div>
  );
}

/** The globe's credits behind one Sources button, their short names always visible. */
function JourneySources({ open, onToggle }: { open: boolean; onToggle: (open: boolean) => void }) {
  const sources = {
    lines: [en["credit.globe"].text],
    short: [en["source.dem"].text],
  };
  return (
    <>
      <KeyLegend
        entries={[
          {
            chip: "S",
            shortcut: "S",
            label: en["chrome.key.sources"].text,
            onPress: () => {
              onToggle(!open);
            },
            pressed: open,
          },
        ]}
      >
        <SourcesLine sources={sources} />
      </KeyLegend>
      <SourcesPanel
        sources={sources}
        open={open}
        onClose={() => {
          onToggle(false);
        }}
      />
    </>
  );
}
