"use client";

// The sequence as one world (decision 11, 30 Oct 2026): the opening over the globe's limb, the globe with the case's
// card, then Open: the camera zooms straight down onto the case's point while the earth sinks into the ground, and
// the case's own land, the overview's (approved specimen D4), rises out of that ground under the point while its
// camera comes down to the overview's pose without a cut; then the arc draws on and the findings come in. One palette
// (Obsidian) from the first screen; one picture of the place at a time; the case's card stays on screen until the
// land takes its place. Esc or Enter ends the arrival at once; under reduced motion Open cuts to the overview.

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { en, format } from "../../lib/copy/en";
import { crestCurve, findCrest } from "../../lib/globe/crest";
import {
  R_KM,
  globeCamera,
  project,
  screenToLonLat,
  unit,
  type GlobeCamera,
} from "../../lib/globe/frame";
import { polygonPath, rangePath, ringPoints, ringRho } from "../../lib/globe/overlay";
import { loadGlobe, type GlobeAssets } from "../../lib/globe/grids";
import { GlobeRenderer, type GlobeData } from "../../lib/globe/renderer";
import { otherPlaces, placeHref, type OtherPlace } from "../../lib/globe/places";
import { KEY, globeStateAt, progress, sunFor, type Moments } from "../../lib/globe/timeline";
import { CAM } from "../../lib/globe/views";
import { centreOf } from "../../lib/land/geometry";
import { STORY_BEATS } from "../../lib/opening/beats";
import { Opening } from "../opening/Opening";
import {
  GlobePage,
  formatLatLon,
  type CustomGlobeLocation,
  type GlobeCase,
} from "./GlobePage";
import type { CaseSnapshot } from "@siterra/contracts";
import type { ReadyArrival } from "../../lib/projection/arrival";
import { InstrumentRecords } from "../instruments/InstrumentRecords";
import { ValleyOverview } from "../overview/ValleyOverview";
import { SourcesPanel, typing } from "../controls/ScreenChrome";
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

const wrapLon = (lon: number): number => ((((lon + 180) % 360) + 360) % 360) - 180;
const clampLat = (lat: number): number => Math.max(-80, Math.min(80, lat));
const shortDeltaLon = (from: number, to: number): number => ((((to - from) + 540) % 360) - 180);
const globeCenterForTarget = (lon: number, lat: number): { lon: number; lat: number } => ({
  lon: wrapLon(lon + 3.5372222),
  lat: clampLat(lat - 6.6377778),
});

function extractReverseGeocode(
  json: unknown,
  lon: number,
  lat: number,
): { name: string; region: string } {
  const fallback = formatLatLon(lat, lon);
  if (!json || typeof json !== "object") {
    return { name: fallback, region: "Selected coordinates" };
  }
  const obj = json as Record<string, unknown>;
  const firstResult =
    obj["result"] && typeof obj["result"] === "object"
      ? (obj["result"] as Record<string, unknown>)
      : Array.isArray(obj["results"]) && obj["results"][0] && typeof obj["results"][0] === "object"
        ? (obj["results"][0] as Record<string, unknown>)
        : obj;
  const placeObj =
    firstResult["place"] && typeof firstResult["place"] === "object"
      ? (firstResult["place"] as Record<string, unknown>)
      : null;

  const name =
    (typeof firstResult["name"] === "string" && firstResult["name"].trim()) ||
    (typeof firstResult["placeName"] === "string" && firstResult["placeName"].trim()) ||
    (placeObj && typeof placeObj["name"] === "string" && placeObj["name"].trim()) ||
    fallback;
  const region =
    (typeof firstResult["region"] === "string" && firstResult["region"].trim()) ||
    (typeof firstResult["regionName"] === "string" && firstResult["regionName"].trim()) ||
    (placeObj && typeof placeObj["region"] === "string" && placeObj["region"].trim()) ||
    (typeof firstResult["country"] === "string" && firstResult["country"].trim()) ||
    fallback;
  return { name, region };
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

  // the case's place on the sphere: its outlet from the record, else its catchment's centre; the earth sinks into the
  // ground round the catchment's centre
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

  // the other places the seed-case listing holds (U25, item k), each a point the visitor can open instead
  const [others, setOthers] = useState<OtherPlace[]>([]);
  const [seedSavedCases, setSeedSavedCases] = useState<GlobeCase[]>([initialCase]);
  const [selectedSavedCase, setSelectedSavedCase] = useState<GlobeCase>(initialCase);
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

  useEffect(() => {
    const ac = new AbortController();
    fetch("/api/seed-cases", { signal: ac.signal, headers: { accept: "application/json" } })
      .then((r) => (r.ok ? r.json() : null))
      .then((json: unknown) => {
        const parsedOthers = otherPlaces(json, arrival.valleyName);
        setOthers(parsedOthers);

        const rawCases =
          json &&
          typeof json === "object" &&
          Array.isArray((json as { cases?: unknown[] }).cases)
            ? ((json as { cases: unknown[] }).cases ?? [])
            : [];

        let matchedSeedId: string | undefined;
        const extraCases: GlobeCase[] = [];
        for (const item of rawCases) {
          if (!item || typeof item !== "object") continue;
          const rec = item as Record<string, unknown>;
          const cid = typeof rec["caseId"] === "string" ? rec["caseId"] : "";
          const placeObj =
            rec["place"] && typeof rec["place"] === "object"
              ? (rec["place"] as Record<string, unknown>)
              : null;
          const outletObj =
            rec["outlet"] && typeof rec["outlet"] === "object"
              ? (rec["outlet"] as Record<string, unknown>)
              : null;
          const lonLat =
            outletObj && Array.isArray(outletObj["lonLat"]) ? outletObj["lonLat"] : null;
          const pName = placeObj && typeof placeObj["name"] === "string" ? placeObj["name"] : "";
          const pRegion =
            placeObj && typeof placeObj["region"] === "string" ? placeObj["region"] : "";
          const qText =
            typeof rec["question"] === "string" && rec["question"].trim()
              ? rec["question"]
              : arrival.question;
          if (!cid || !pName) continue;
          if (cid.startsWith("case_loc_selected_") || /^selected\b/i.test(pName)) continue;
          if (pName === arrival.valleyName) {
            matchedSeedId = cid;
          } else if (
            lonLat &&
            typeof lonLat[0] === "number" &&
            typeof lonLat[1] === "number"
          ) {
            extraCases.push({
              id: cid,
              seedCaseId: cid,
              place: pName,
              region: pRegion,
              question: qText,
              lon: lonLat[0],
              lat: lonLat[1],
              isCurrentArrival: false,
            });
          }
        }

        const updatedInitial: GlobeCase = matchedSeedId
          ? { ...initialCase, seedCaseId: matchedSeedId }
          : initialCase;
        const merged = [updatedInitial, ...extraCases];
        setSeedSavedCases(merged);
        setSelectedSavedCase((prev) =>
          prev.id === initialCase.id ? updatedInitial : prev,
        );
      })
      .catch(() => {
        // without the listing the globe shows the one case
      });
    return () => {
      ac.abort();
    };
  }, [arrival.valleyName, arrival.question, initialCase]);

  const outletRef = useRef({ lon: initialOutlet.lon, lat: initialOutlet.lat });
  const fadeRef = useRef(unit(centre.lon, centre.lat));
  const rangeNameRef = useRef(arrival.regionName);
  const globeDataRef = useRef<GlobeData | null>(null);
  const curveRef = useRef<[number, number][]>([]);
  const lastCamRef = useRef<GlobeCamera | null>(null);

  const initialCenter = globeCenterForTarget(initialOutlet.lon, initialOutlet.lat);
  const camRotRef = useRef({
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

  const geocodeAbortRef = useRef<AbortController | null>(null);

  const handleSelectCustomLocation = useCallback(
    (loc: { lon: number; lat: number; placeName?: string; regionName?: string }) => {
      geocodeAbortRef.current?.abort();
      const lon = wrapLon(loc.lon);
      const lat = clampLat(loc.lat);
      const hasNames = Boolean(loc.placeName && loc.regionName);
      const initialPlace = loc.placeName ?? formatLatLon(lat, lon);
      const initialRegion = loc.regionName ?? "Resolving region...";
      updateTargetGeometry(lon, lat, initialRegion);
      setCustomLocation({
        lon,
        lat,
        placeName: initialPlace,
        regionName: initialRegion,
        resolving: !hasNames,
      });

      if (!hasNames) {
        const ac = new AbortController();
        geocodeAbortRef.current = ac;
        fetch(`/api/geocode?lon=${String(lon)}&lat=${String(lat)}`, {
          signal: ac.signal,
          headers: { accept: "application/json" },
        })
          .then((r) => (r.ok ? r.json() : null))
          .then((json: unknown) => {
            if (ac.signal.aborted) return;
            const resolved = extractReverseGeocode(json, lon, lat);
            rangeNameRef.current = resolved.region;
            setCustomLocation({
              lon,
              lat,
              placeName: resolved.name,
              regionName: resolved.region,
              resolving: false,
            });
          })
          .catch(() => {
            if (ac.signal.aborted) return;
            setCustomLocation({
              lon,
              lat,
              placeName: formatLatLon(lat, lon),
              regionName: "Selected coordinates",
              resolving: false,
            });
          });
      }
    },
    [updateTargetGeometry],
  );

  const handleSelectSavedCase = useCallback(
    (sc: GlobeCase) => {
      geocodeAbortRef.current?.abort();
      setCustomLocation(null);
      setSelectedSavedCase(sc);
      const lon = sc.lon ?? initialOutlet.lon;
      const lat = sc.lat ?? initialOutlet.lat;
      updateTargetGeometry(lon, lat, sc.region);
    },
    [initialOutlet.lon, initialOutlet.lat, updateTargetGeometry],
  );

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
    // under reduced motion Open cuts straight to the overview
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

  // the globe page: Enter opens the case (a focused button or input handles its own Enter)
  useEffect(() => {
    if (phase !== "globe") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || e.altKey || e.ctrlKey || e.metaKey) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "BUTTON" || tag === "INPUT" || tag === "TEXTAREA" || tag === "A") return;
      e.preventDefault();
      primaryActionRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [phase]);

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

  // Pointer drag + click-to-select on the globe canvas
  const dragRef = useRef<{
    id: number;
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
    travel: number;
  } | null>(null);

  const onCanvasPointerDown = useCallback(
    (e: PointerEvent<HTMLCanvasElement>) => {
      if (phase !== "globe" || e.button !== 0) return;
      dragRef.current = {
        id: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        lastX: e.clientX,
        lastY: e.clientY,
        travel: 0,
      };
      e.currentTarget.setAttribute("data-dragging", "");
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // synthetic events may not support pointer capture
      }
    },
    [phase],
  );

  const onCanvasPointerMove = useCallback(
    (e: PointerEvent<HTMLCanvasElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.id !== e.pointerId || phase !== "globe") return;
      const dx = e.clientX - drag.lastX;
      const dy = e.clientY - drag.lastY;
      drag.lastX = e.clientX;
      drag.lastY = e.clientY;
      drag.travel += Math.hypot(dx, dy);
      if (drag.travel >= 2) {
        const h = e.currentTarget.clientHeight || 810;
        const degPerPx = 140 / Math.max(320, h);
        const cur = camRotRef.current;
        const nextLon = wrapLon(cur.lon - dx * degPerPx);
        const nextLat = clampLat(cur.lat + dy * degPerPx);
        cur.active = true;
        cur.panDur = 0;
        cur.lon = nextLon;
        cur.lat = nextLat;
        cur.fromLon = nextLon;
        cur.fromLat = nextLat;
        cur.toLon = nextLon;
        cur.toLat = nextLat;
      }
    },
    [phase],
  );

  const onCanvasPointerUp = useCallback(
    (e: PointerEvent<HTMLCanvasElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.id !== e.pointerId) return;
      dragRef.current = null;
      e.currentTarget.removeAttribute("data-dragging");
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      if (phase !== "globe" || drag.travel >= 5) return;
      const cam = lastCamRef.current;
      if (!cam) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const hit = screenToLonLat(cam, x, y, rect.width, rect.height);
      if (hit) {
        handleSelectCustomLocation({ lon: hit.lon, lat: hit.lat });
      }
    },
    [phase, handleSelectCustomLocation],
  );

  const onCanvasPointerCancel = useCallback((e: PointerEvent<HTMLCanvasElement>) => {
    dragRef.current = null;
    e.currentTarget.removeAttribute("data-dragging");
  }, []);

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
    loadGlobe(globeAssets)
      .then((g) => {
        globeDataRef.current = g;
        renderer?.setGlobe(g);
        curveRef.current = crestCurve(findCrest(g.world, outletRef.current), outletRef.current);
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
      // the globe at no size (hidden under the overview) draws nothing: its projection would be NaN (U28f)
      if (w < 1 || h < 1) return;
      const t = now();
      const o = outletRef.current;
      const caseV = unit(o.lon, o.lat);
      const s = globeStateAt(t, moments.current, reduced.current, o);
      const v = { ...s.view };

      const rot = camRotRef.current;
      if (moments.current.dive === undefined) {
        const pressT = moments.current.press;
        const openingDrift = pressT === undefined && !reduced.current ? t * 2.4 : 0;
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
            const k = progress(t, rot.panStart, rot.panDur, CAM, reduced.current);
            rot.lon = wrapLon(rot.fromLon + shortDeltaLon(rot.fromLon, rot.toLon) * k);
            rot.lat = clampLat(rot.fromLat + (rot.toLat - rot.fromLat) * k);
            if (k >= 1) rot.panDur = 0;
          }
          v.lon = wrapLon(rot.lon + openingDrift);
          v.lat = rot.lat;
        }
      }

      const ringOpacity = rot.active && moments.current.dive === undefined
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
        caseV[0] * (e[0] - caseV[0]) +
          caseV[1] * (e[1] - caseV[1]) +
          caseV[2] * (e[2] - caseV[2]) >
        0;

      // the overlay: the case ring and point, the range name
      const ringD = caseFacing
        ? polygonPath(cam.vp, ringPoints(caseV, o.lon, ringRho(v.distance)), w, h)
        : undefined;
      if (ring.current) {
        ring.current.setAttribute("d", ringD ?? "");
        ring.current.style.opacity = String(caseFacing ? ringOpacity : 0);
      }
      const lifted: [number, number, number] = [
        caseV[0] * (1 + 3 / R_KM),
        caseV[1] * (1 + 3 / R_KM),
        caseV[2] * (1 + 3 / R_KM),
      ];
      const cs = caseFacing ? project(cam.vp, lifted, w, h) : undefined;
      const targetVisibleOnStage = cs ? cs[0] >= 620 || moments.current.dive !== undefined : false;
      if (ring.current) {
        ring.current.style.opacity = String(caseFacing && targetVisibleOnStage ? ringOpacity : 0);
      }
      if (casePoint.current) {
        casePoint.current.style.transform = cs
          ? `translate(${cs[0].toFixed(1)}px, ${cs[1].toFixed(1)}px)`
          : "";
        casePoint.current.style.opacity = String(cs && targetVisibleOnStage ? ringOpacity : 0);
      }

      // the case's compact target monument callout stands below-right of its point on the globe (clear of the northern crest label)
      const cx = cs ? Math.min(Math.max(cs[0] + 22, 690), w - 348) : Math.max(690, w - 360);
      const cy = cs ? Math.min(Math.max(cs[1] + 14, 96), h - 190) : Math.max(120, h / 2 - 20);
      if (caseCard.current) {
        caseCard.current.style.transform = `translate(${cx.toFixed(1)}px, ${cy.toFixed(1)}px)`;
        caseCard.current.style.visibility =
          ringOpacity > 0.05 && targetVisibleOnStage ? "visible" : "hidden";
        caseCard.current.style.opacity = String(targetVisibleOnStage ? ringOpacity : 0);
      }

      // all saved case pins on the globe's lit/front side
      const activePinId = activePinIdRef.current;
      for (const sc of savedCasesRef.current) {
        const pinKey = sc.seedCaseId ?? sc.id;
        const pinEl = otherEls.current.get(pinKey);
        if (!pinEl) continue;
        const lon = sc.lon ?? initialOutlet.lon;
        const lat = sc.lat ?? initialOutlet.lat;
        const ov = unit(lon, lat);
        const lift: [number, number, number] = [
          ov[0] * (1 + 3 / R_KM),
          ov[1] * (1 + 3 / R_KM),
          ov[2] * (1 + 3 / R_KM),
        ];
        const ps = project(cam.vp, lift, w, h);
        const facing =
          ov[0] * (e[0] - ov[0]) + ov[1] * (e[1] - ov[1]) + ov[2] * (e[2] - ov[2]) > 0;
        const isCurrentTarget = activePinId === pinKey;
        const distToTarget = cs && ps ? Math.hypot(ps[0] - cs[0], ps[1] - cs[1]) : 999;
        const overlapsMonument =
          ps !== undefined &&
          ps[0] >= cx - 70 &&
          ps[0] <= cx + 350 &&
          ps[1] >= cy - 28 &&
          ps[1] <= cy + 140;
        const tooCloseToTarget = distToTarget < 95 || overlapsMonument;
        const onRightStage =
          ps ? ps[0] >= 680 && ps[0] <= w - 40 && ps[1] >= 70 && ps[1] <= h - 110 : false;
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
      if (rd) rangeLine.current?.setAttribute("d", rd);
      if (rangeText.current) {
        const name = format("globe.range", { range: rangeNameRef.current });
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
  }, [globeOn, globeAssets, initialOutlet.lon, initialOutlet.lat]);

  // the land arrives once the globe has handed over and the overview has drawn its land
  const run = (phase === "land" || phase === "rest") && landReady;
  const landing = phase === "land" && run && !skip;
  // pre-mount the 3D valley overview while on the globe so diving into the valley has zero shader/mesh compile lag
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
          // the globe lies under the overview: once disposed it keeps its last frame, the bare ground
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
                        handleSelectSavedCase(sc);
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
