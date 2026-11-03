import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
  type PointerEvent,
} from "react";
import { screenToLonLat, type GlobeCamera } from "../../lib/globe/frame";
import { otherPlaces, type OtherPlace } from "../../lib/globe/places";
import type { GlobeData } from "../../lib/globe/renderer";
import { typing } from "../controls/ScreenChrome";
import {
  classifyPlace,
  namePoint,
  rangelandShareAt,
  reliefAt,
  surfaceAt,
  type GeocodeHit,
} from "./globe-choice";
import type { CustomGlobeLocation, GlobeCase } from "./GlobePage";

/** opening, globe; zoom: Open pressed, the camera going down; land: the overview's own arrival; rest. */
export type Phase = "opening" | "globe" | "zoom" | "land" | "rest";

/** The step column's right edge on the globe page (.dbhCanvas: 88 px in, 680 px wide) and a gap: no globe pin label
 *  draws into the steps' text. */
export const STEP_COLUMN_RIGHT = 88 + 680 + 24;

export const wrapLon = (lon: number): number => ((((lon + 180) % 360) + 360) % 360) - 180;
export const clampLat = (lat: number): number => Math.max(-80, Math.min(80, lat));
export const shortDeltaLon = (from: number, to: number): number => ((to - from + 540) % 360) - 180;
export const globeCenterForTarget = (lon: number, lat: number): { lon: number; lat: number } => ({
  lon: wrapLon(lon + 3.5372222),
  lat: clampLat(lat - 6.6377778),
});

export interface CamRotationState {
  active: boolean;
  lon: number;
  lat: number;
  fromLon: number;
  fromLat: number;
  toLon: number;
  toLat: number;
  panStart: number;
  panDur: number;
}

/** The geocoder's hit from /api/geocode, or null when it named nothing there (named false, or no answer). */
export function extractReverseGeocode(json: unknown): GeocodeHit | null {
  if (!json || typeof json !== "object") return null;
  const obj = json as Record<string, unknown>;
  const first =
    obj["result"] && typeof obj["result"] === "object"
      ? (obj["result"] as Record<string, unknown>)
      : Array.isArray(obj["results"]) && obj["results"][0] && typeof obj["results"][0] === "object"
        ? (obj["results"][0] as Record<string, unknown>)
        : null;
  if (!first || first["named"] === false) return null;
  const text = (k: string): string | undefined => {
    const v = first[k];
    return typeof v === "string" && v.trim() ? v.trim() : undefined;
  };
  const name = text("name");
  if (!name) return null;
  const region = text("region");
  const shortName = text("shortName");
  const osmClass = text("osmClass");
  const osmType = text("osmType");
  const addressType = text("addressType");
  return {
    name,
    ...(region ? { region } : {}),
    ...(shortName ? { shortName } : {}),
    ...(osmClass ? { osmClass } : {}),
    ...(osmType ? { osmType } : {}),
    ...(addressType ? { addressType } : {}),
  };
}

export function useSeedCases(params: {
  valleyName: string;
  defaultQuestion: string;
  initialCase: GlobeCase;
}): {
  others: OtherPlace[];
  seedSavedCases: GlobeCase[];
  selectedSavedCase: GlobeCase;
  setSelectedSavedCase: (value: GlobeCase | ((prev: GlobeCase) => GlobeCase)) => void;
} {
  const { valleyName, defaultQuestion, initialCase } = params;
  const [others, setOthers] = useState<OtherPlace[]>([]);
  const [seedSavedCases, setSeedSavedCases] = useState<GlobeCase[]>([initialCase]);
  const [selectedSavedCase, setSelectedSavedCase] = useState<GlobeCase>(initialCase);

  useEffect(() => {
    const ac = new AbortController();
    fetch("/api/seed-cases", { signal: ac.signal, headers: { accept: "application/json" } })
      .then((r) => (r.ok ? r.json() : null))
      .then((json: unknown) => {
        const parsedOthers = otherPlaces(json, valleyName);
        setOthers(parsedOthers);

        const rawCases =
          json && typeof json === "object" && Array.isArray((json as { cases?: unknown[] }).cases)
            ? (json as { cases: unknown[] }).cases
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
              : defaultQuestion;
          if (!cid || !pName) continue;
          if (cid.startsWith("case_loc_selected_") || /^selected\b/i.test(pName)) continue;
          if (pName === valleyName) {
            matchedSeedId = cid;
          } else if (lonLat && typeof lonLat[0] === "number" && typeof lonLat[1] === "number") {
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
        setSelectedSavedCase((prev) => (prev.id === initialCase.id ? updatedInitial : prev));
      })
      .catch(() => {
        // Without the listing, the globe shows the initial case.
      });
    return () => {
      ac.abort();
    };
  }, [valleyName, defaultQuestion, initialCase]);

  return { others, seedSavedCases, selectedSavedCase, setSelectedSavedCase };
}

export function useGlobeLocationSelection(params: {
  initialOutletLon: number;
  initialOutletLat: number;
  globeDataRef: RefObject<GlobeData | null>;
  globeWaitersRef: RefObject<((g: GlobeData | null) => void)[]>;
  rangeNameRef: RefObject<string>;
  updateTargetGeometry: (lon: number, lat: number, regionName: string) => void;
  setCustomLocation: (loc: CustomGlobeLocation | null) => void;
  setSelectedSavedCase: (value: GlobeCase | ((prev: GlobeCase) => GlobeCase)) => void;
}) {
  const {
    initialOutletLon,
    initialOutletLat,
    globeDataRef,
    globeWaitersRef,
    rangeNameRef,
    updateTargetGeometry,
    setCustomLocation,
    setSelectedSavedCase,
  } = params;

  const geocodeAbortRef = useRef<AbortController | null>(null);

  const globeGrids = useCallback((): Promise<GlobeData | null> => {
    if (globeDataRef.current) return Promise.resolve(globeDataRef.current);
    return new Promise((resolve) => {
      globeWaitersRef.current.push(resolve);
      window.setTimeout(() => {
        resolve(globeDataRef.current);
      }, 10_000);
    });
  }, [globeDataRef, globeWaitersRef]);

  const handleSelectCustomLocation = useCallback(
    (loc: CustomGlobeLocation) => {
      geocodeAbortRef.current?.abort();
      const ac = new AbortController();
      geocodeAbortRef.current = ac;
      const lon = wrapLon(loc.lon);
      const lat = clampLat(loc.lat);
      updateTargetGeometry(lon, lat, "");
      setCustomLocation({ lon, lat, resolving: true });

      const given: GeocodeHit | null = loc.placeName
        ? {
            name: loc.placeName,
            ...(loc.regionName ? { region: loc.regionName } : {}),
            ...(loc.shortName ? { shortName: loc.shortName } : {}),
            ...(loc.osmClass ? { osmClass: loc.osmClass } : {}),
            ...(loc.osmType ? { osmType: loc.osmType } : {}),
            ...(loc.addressType ? { addressType: loc.addressType } : {}),
          }
        : null;
      const hit: Promise<GeocodeHit | null> = given
        ? Promise.resolve(given)
        : fetch(`/api/geocode?lon=${String(lon)}&lat=${String(lat)}`, {
            signal: ac.signal,
            headers: { accept: "application/json" },
          })
            .then((r) => (r.ok ? r.json() : null))
            .then((json: unknown) => extractReverseGeocode(json))
            .catch(() => null);
      void Promise.all([hit, globeGrids()]).then(([h, grids]) => {
        if (ac.signal.aborted) return;
        const surface = surfaceAt(grids?.world, lon, lat);
        const named = namePoint({ lon, lat, surface, hit: h });
        const placeKind = classifyPlace({
          hit: h,
          surface: named.surface,
          relief: reliefAt(grids?.world, lon, lat),
          rangelandShare: rangelandShareAt(grids?.layer, lon, lat),
        });
        rangeNameRef.current = named.region || named.title;
        setCustomLocation({
          lon,
          lat,
          placeName: named.title,
          regionName: named.region,
          named: Boolean(h?.name),
          ...(h?.shortName && named.investigable ? { shortName: h.shortName } : {}),
          resolving: false,
          surface: named.surface,
          investigable: named.investigable,
          placeKind,
        });
      });
    },
    [updateTargetGeometry, setCustomLocation, globeGrids, rangeNameRef],
  );

  const handleSelectSavedCase = useCallback(
    (sc: GlobeCase) => {
      geocodeAbortRef.current?.abort();
      setCustomLocation(null);
      setSelectedSavedCase(sc);
      const lon = sc.lon ?? initialOutletLon;
      const lat = sc.lat ?? initialOutletLat;
      updateTargetGeometry(lon, lat, sc.region);
    },
    [initialOutletLon, initialOutletLat, setCustomLocation, setSelectedSavedCase, updateTargetGeometry],
  );

  return { handleSelectCustomLocation, handleSelectSavedCase };
}

export function useJourneyKeyboardShortcuts(params: {
  phase: Phase;
  primaryActionRef: RefObject<() => void>;
  setSourcesOpen: (updater: boolean | ((prev: boolean) => boolean)) => void;
  setSkip: (skip: boolean) => void;
  setPhase: (phase: Phase) => void;
}): void {
  const { phase, primaryActionRef, setSourcesOpen, setSkip, setPhase } = params;

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
  }, [phase, setSourcesOpen]);

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
  }, [phase, primaryActionRef]);

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
  }, [phase, setSkip, setPhase]);
}

export function useGlobeCanvasPointer(params: {
  phase: Phase;
  camRotRef: RefObject<CamRotationState>;
  lastCamRef: RefObject<GlobeCamera | null>;
  startingRef: RefObject<boolean>;
  onSelectCustomLocation: (loc: CustomGlobeLocation) => void;
}) {
  const { phase, camRotRef, lastCamRef, startingRef, onSelectCustomLocation } = params;
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
        // Synthetic events may not support pointer capture.
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
    [phase, camRotRef],
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
        if (!startingRef.current) onSelectCustomLocation({ lon: hit.lon, lat: hit.lat });
      }
    },
    [phase, lastCamRef, startingRef, onSelectCustomLocation],
  );

  const onCanvasPointerCancel = useCallback((e: PointerEvent<HTMLCanvasElement>) => {
    dragRef.current = null;
    e.currentTarget.removeAttribute("data-dragging");
  }, []);

  return {
    onCanvasPointerDown,
    onCanvasPointerMove,
    onCanvasPointerUp,
    onCanvasPointerCancel,
  };
}
