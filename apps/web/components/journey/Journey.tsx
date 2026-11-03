"use client";

// The journey sequence across a continuous 3D world: the opening over the globe's limb, the globe with the case's
// card, and then the camera dive straight down onto the case's point while the earth transitions into the valley
// overview without a cut. Esc or Enter ends the arrival at once; under reduced motion Open cuts to the overview.

import { useCallback, useMemo, useRef, useState } from "react";
import { en, format } from "../../lib/copy/en";
import { crestCurve, findCrest } from "../../lib/globe/crest";
import { unit, type GlobeCamera } from "../../lib/globe/frame";
import type { GlobeAssets } from "../../lib/globe/grids";
import { placeHref } from "../../lib/globe/places";
import type { GlobeData } from "../../lib/globe/renderer";
import type { Moments } from "../../lib/globe/timeline";
import { centreOf } from "../../lib/land/geometry";
import { STORY_BEATS } from "../../lib/opening/beats";
import { Opening } from "../opening/Opening";
import { GlobePage, type CustomGlobeLocation, type GlobeCase } from "./GlobePage";
import {
  globeCenterForTarget,
  useGlobeCanvasPointer,
  useGlobeLocationSelection,
  useJourneyKeyboardShortcuts,
  useSeedCases,
  type CamRotationState,
  type Phase,
} from "./useGlobeCameraAndCases";
import { useGlobeRendererLoop } from "./useGlobeRendererLoop";
import type { CaseSnapshot } from "@siterra/contracts";
import type { ReadyArrival } from "../../lib/projection/arrival";
import { InstrumentRecords } from "../instruments/InstrumentRecords";
import { ValleyOverview } from "../overview/ValleyOverview";
import { SourcesPanel } from "../controls/ScreenChrome";
import styles from "./Journey.module.css";

export interface JourneyProps {
  /** The globe's assets, from the map bundle. */
  globeAssets: GlobeAssets;
  /** The case's arrival, projected from its record. */
  arrival: ReadyArrival;
  snapshot: CaseSnapshot;
}

export function Journey({ globeAssets, arrival, snapshot }: JourneyProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const ring = useRef<SVGPathElement>(null);
  const rangeLine = useRef<SVGPathElement>(null);
  const rangeText = useRef<SVGTextPathElement>(null);
  const rangeGroup = useRef<SVGTextElement>(null);
  const casePoint = useRef<HTMLDivElement>(null);
  const caseCard = useRef<HTMLDivElement>(null);

  const studyCount = snapshot.records.sourceRecords.length;

  // The case's place on the sphere: its outlet from the record, else its catchment's centre.
  const outline = arrival.catchment.geometry.coordinates[0] ?? [];
  const centre = centreOf(outline);
  const initialOutlet = arrival.land.outlet ?? centre;

  const initialCase = useMemo<GlobeCase>(
    () => ({
      id: arrival.caseId,
      place: arrival.valleyName,
      region: arrival.regionName,
      areaLabel: arrival.areaLabel,
      areaKm2: arrival.areaKm2,
      studyCount,
      question: arrival.question,
      lon: initialOutlet.lon,
      lat: initialOutlet.lat,
      isCurrentArrival: true,
    }),
    [
      arrival.caseId,
      arrival.valleyName,
      arrival.regionName,
      arrival.areaLabel,
      arrival.areaKm2,
      studyCount,
      arrival.question,
      initialOutlet.lon,
      initialOutlet.lat,
    ],
  );

  // Other studied places from the seed-case listing that the visitor can open instead.
  const { others, seedSavedCases, selectedSavedCase, setSelectedSavedCase } = useSeedCases({
    valleyName: arrival.valleyName,
    defaultQuestion: arrival.question,
    initialCase,
  });
  const [customLocation, setCustomLocation] = useState<CustomGlobeLocation | null>(null);
  const [globeTheme, setGlobeTheme] = useState<"light" | "obsidian">(() => {
    if (typeof window !== "undefined") {
      const p = new URLSearchParams(window.location.search).get("theme");
      if (p === "dark" || p === "obsidian") return "obsidian";
    }
    return "light";
  });
  const globeThemeRef = useRef<"light" | "obsidian">(globeTheme);
  globeThemeRef.current = globeTheme;
  const toggleGlobeTheme = useCallback(() => {
    setGlobeTheme((t) => (t === "light" ? "obsidian" : "light"));
  }, []);

  const otherEls = useRef(new Map<string, HTMLAnchorElement>());
  const savedCasesRef = useRef<GlobeCase[]>([initialCase]);
  savedCasesRef.current = seedSavedCases;

  const activePinIdRef = useRef<string | null>(initialCase.seedCaseId ?? initialCase.id);
  activePinIdRef.current = customLocation
    ? null
    : (selectedSavedCase.seedCaseId ?? selectedSavedCase.id);

  const outletRef = useRef({ lon: initialOutlet.lon, lat: initialOutlet.lat });
  const fadeRef = useRef(unit(centre.lon, centre.lat));
  const rangeNameRef = useRef(arrival.regionName);
  const globeDataRef = useRef<GlobeData | null>(null);
  const globeWaitersRef = useRef<((g: GlobeData | null) => void)[]>([]);
  const curveRef = useRef<[number, number][]>([]);
  const lastCamRef = useRef<GlobeCamera | null>(null);

  const initialCenter = globeCenterForTarget(initialOutlet.lon, initialOutlet.lat);
  const camRotRef = useRef<CamRotationState>({
    active: false,
    lon: initialCenter.lon,
    lat: initialCenter.lat,
    fromLon: initialCenter.lon,
    fromLat: initialCenter.lat,
    toLon: initialCenter.lon,
    toLat: initialCenter.lat,
    panStart: 0,
    panDur: 0,
  });

  const t0 = useRef(0);
  const moments = useRef<Moments>({ beats: [] });
  const [phase, setPhase] = useState<Phase>(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("dive") === "1" || params.has("dive")) {
        moments.current = { beats: [-5], press: -3, dive: 0 };
        return "zoom";
      }
      if (params.has("case") && params.has("start")) {
        moments.current = { beats: [-3], press: -3 };
        return "globe";
      }
    }
    return "opening";
  });

  // Screen coordinates where the case's point stood when the globe handed over (CSS px), and whether to skip arrival animation.
  const [from, setFrom] = useState<{ x: number; y: number } | null>(null);
  const [skip, setSkip] = useState(false);
  const [landReady, setLandReady] = useState(false);
  const onLandReady = useCallback(() => {
    setLandReady(true);
  }, []);
  const onArrived = useCallback(() => {
    setPhase("rest");
  }, []);

  const [sourcesOpen, setSourcesOpen] = useState(false);

  const now = () => (performance.now() - t0.current) / 1000;
  const reduced = useRef(false);

  const updateTargetGeometry = useCallback((lon: number, lat: number, regionName: string) => {
    const pt = { lon, lat };
    outletRef.current = pt;
    fadeRef.current = unit(lon, lat);
    rangeNameRef.current = regionName;
    if (globeDataRef.current) {
      curveRef.current = crestCurve(findCrest(globeDataRef.current.world, pt), pt);
    }
    const dest = globeCenterForTarget(lon, lat);
    const cur = camRotRef.current;
    cur.active = true;
    cur.fromLon = cur.lon;
    cur.fromLat = cur.lat;
    cur.toLon = dest.lon;
    cur.toLat = dest.lat;
    cur.panStart = now();
    cur.panDur = reduced.current ? 0.05 : 0.65;
  }, []);

  // While a start is under way the globe takes no new point and no other place.
  const startingRef = useRef(false);
  const onStartingChange = useCallback((starting: boolean) => {
    startingRef.current = starting;
  }, []);

  const { handleSelectCustomLocation, handleSelectSavedCase } = useGlobeLocationSelection({
    initialOutletLon: initialOutlet.lon,
    initialOutletLat: initialOutlet.lat,
    globeDataRef,
    globeWaitersRef,
    rangeNameRef,
    updateTargetGeometry,
    setCustomLocation,
    setSelectedSavedCase,
  });

  const onShown = useCallback(() => {
    if (moments.current.beats.length === 0) moments.current.beats.push(now());
  }, []);
  const onBeat = useCallback((index: number) => {
    moments.current.beats.length = Math.min(moments.current.beats.length, index + 1);
    moments.current.beats[index] = now();
    const targetBeat = STORY_BEATS[index];
    if (targetBeat && moments.current.press === undefined) {
      const cur = camRotRef.current;
      cur.active = true;
      cur.fromLon = cur.lon;
      cur.fromLat = cur.lat;
      cur.toLon = targetBeat.globeLon;
      cur.toLat = targetBeat.globeLat;
      cur.panStart = now();
      cur.panDur = reduced.current ? 0.1 : 1.8;
    }
  }, []);
  const onOpen = useCallback(() => {
    camRotRef.current.active = false;
    moments.current.press = now();
    setPhase("globe");
  }, []);
  const onBack = useCallback(() => {
    setSourcesOpen(false);
    camRotRef.current.active = false;
    moments.current = { beats: [now()] };
    setPhase("opening");
  }, []);
  const onDive = useCallback(() => {
    moments.current.dive ??= now();
    setSourcesOpen(false);
    camRotRef.current.active = false;
    if (reduced.current) {
      setSkip(true);
      setPhase("land");
    } else setPhase("zoom");
  }, []);

  const [commissionMode, setCommissionMode] = useState<"run" | "briefing">(() => {
    if (typeof window !== "undefined") {
      const m = new URLSearchParams(window.location.search).get("mode");
      if (m === "briefing") return "briefing";
    }
    return "run";
  });
  const [commissionedQuestion, setCommissionedQuestion] = useState<string | undefined>(() => {
    if (typeof window !== "undefined") {
      const q = new URLSearchParams(window.location.search).get("q");
      if (q && q.trim()) return q.trim();
    }
    return undefined;
  });

  const handleOpenSavedCase = useCallback(
    (question?: string, chosen?: GlobeCase, mode: "run" | "briefing" = "run") => {
      const target = chosen ?? selectedSavedCase;
      setCommissionMode(mode);
      const cleanQ = question?.trim();
      if (cleanQ) setCommissionedQuestion(cleanQ);
      if (target.isCurrentArrival === false) {
        const targetId = target.seedCaseId ?? target.id;
        const qParam = cleanQ ? `&q=${encodeURIComponent(cleanQ)}` : "";
        window.location.assign(
          `/?case=${encodeURIComponent(targetId)}&dive=1&mode=${encodeURIComponent(mode)}${qParam}`,
        );
        return;
      }
      onDive();
    },
    [selectedSavedCase, onDive],
  );

  const primaryActionRef = useRef<() => void>(() => {
    onDive();
  });
  const registerPrimaryAction = useCallback((fn: () => void) => {
    primaryActionRef.current = fn;
  }, []);

  useJourneyKeyboardShortcuts({
    phase,
    primaryActionRef,
    setSourcesOpen,
    setSkip,
    setPhase,
  });

  const {
    onCanvasPointerDown,
    onCanvasPointerMove,
    onCanvasPointerUp,
    onCanvasPointerCancel,
  } = useGlobeCanvasPointer({
    phase,
    camRotRef,
    lastCamRef,
    startingRef,
    onSelectCustomLocation: handleSelectCustomLocation,
  });

  const globeOn = phase === "opening" || phase === "globe" || phase === "zoom";
  useGlobeRendererLoop({
    globeOn,
    globeAssets,
    initialOutletLon: initialOutlet.lon,
    initialOutletLat: initialOutlet.lat,
    canvasRef: canvas,
    ringRef: ring,
    rangeLineRef: rangeLine,
    rangeTextRef: rangeText,
    rangeGroupRef: rangeGroup,
    casePointRef: casePoint,
    caseCardRef: caseCard,
    otherElsRef: otherEls,
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
    t0Ref: t0,
    momentsRef: moments,
    reducedRef: reduced,
    setFrom,
    setPhase,
  });

  const run = (phase === "land" || phase === "rest") && landReady;
  const landing = phase === "land" && run && !skip;
  const overviewOn = phase !== "opening";
  const activeTheme = globeTheme;

  return (
    <InstrumentRecords snapshot={snapshot}>
      <div
        className={styles.journey}
        data-theme={activeTheme}
        data-phase={phase}
        data-landing={landing ? "" : undefined}
      >
        {globeOn || phase === "land" ? (
          <canvas
            ref={canvas}
            className={styles.globe}
            aria-hidden="true"
            onPointerDown={onCanvasPointerDown}
            onPointerMove={onCanvasPointerMove}
            onPointerUp={onCanvasPointerUp}
            onPointerCancel={onCanvasPointerCancel}
          />
        ) : null}
        {overviewOn ? (
          <div
            id="arrival"
            className={styles.overview}
            data-shown={run ? "" : undefined}
            aria-hidden={run ? undefined : true}
            inert={!run}
          >
            <ValleyOverview
              onSettled={onLandReady}
              intro={{ run, skip, from, onDone: onArrived }}
              theme={globeTheme}
              onToggleTheme={toggleGlobeTheme}
              initialViewMode={commissionMode}
              commissionedQuestion={commissionedQuestion}
            />
          </div>
        ) : null}
        {globeOn || (phase === "land" && !(run && skip)) ? (
          <svg className={styles.overlay} aria-hidden="true">
            <defs>
              <path id="range-path" ref={rangeLine} d="M0 0" />
            </defs>
            <path ref={ring} className={styles.ring} />
            <text ref={rangeGroup} className={styles.rangeText} dy="-1.5em">
              <textPath
                ref={rangeText}
                href="#range-path"
                startOffset="50%"
                textAnchor="middle"
              />
            </text>
          </svg>
        ) : null}
        {phase !== "opening" && phase !== "rest" && !(run && skip) ? (
          <div className={styles.handover}>
            <div ref={casePoint} className={styles.casePoint} aria-hidden="true">
              <span className={styles.casePointPulse} />
            </div>
            {phase === "globe"
              ? seedSavedCases.map((sc, idx) => {
                  const pinKey = sc.seedCaseId ?? sc.id;
                  return (
                    <a
                      key={pinKey}
                      ref={(el) => {
                        if (el) otherEls.current.set(pinKey, el);
                        else otherEls.current.delete(pinKey);
                      }}
                      className={styles.otherPlace}
                      href={placeHref(pinKey)}
                      data-globe-place={pinKey}
                      aria-label={format("globe.openPlace", { place: sc.place, region: sc.region })}
                      onClick={(e) => {
                        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                        e.preventDefault();
                        if (!startingRef.current) handleSelectSavedCase(sc);
                      }}
                    >
                      <i className={styles.otherDot} aria-hidden="true" />
                      <kbd className={styles.otherKeycap} aria-hidden="true">
                        {String(idx + 1)}
                      </kbd>
                      <span>{sc.place}</span>
                    </a>
                  );
                })
              : null}
            <GlobePage
              cases={[selectedSavedCase]}
              savedCases={seedSavedCases}
              others={others}
              customLocation={customLocation}
              cardRef={caseCard}
              onOpen={handleOpenSavedCase}
              onSelectLocation={handleSelectCustomLocation}
              onSelectSavedCase={handleSelectSavedCase}
              onBack={onBack}
              opened={phase !== "globe"}
              registerPrimaryAction={registerPrimaryAction}
              onStartingChange={onStartingChange}
              theme={globeTheme}
              onToggleTheme={toggleGlobeTheme}
            />
          </div>
        ) : null}
        {phase === "opening" ? (
          <Opening
            onOpen={onOpen}
            onShown={onShown}
            onBeat={onBeat}
            theme={globeTheme}
            onToggleTheme={toggleGlobeTheme}
          />
        ) : null}
        <SourcesPanel
          sources={{
            lines: [en["credit.globe"].text, en["credit.resolve"].text],
            short: [en["source.dem"].text, en["source.resolve"].text],
          }}
          open={sourcesOpen}
          onClose={() => {
            setSourcesOpen(false);
          }}
        />
      </div>
    </InstrumentRecords>
  );
}
