"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Ref,
  type SyntheticEvent,
} from "react";
import { placeHref, type OtherPlace } from "../../lib/globe/places";
import { en, format } from "../../lib/copy/en";
import { SiterraMark, ThemeIcon } from "../opening/Opening";
import {
  cardQuestion,
  formatLatLon,
  launchStatus,
  placeQuestions,
  shortNameFrom,
  startOutcome,
  type PlaceKind,
  type StartOutcome,
  type Surface,
} from "./globe-choice";
import styles from "./Journey.module.css";

export interface GlobeCase {
  id: string;
  seedCaseId?: string;
  place: string;
  region: string;
  question: string;
  lat?: number;
  lon?: number;
  isCurrentArrival?: boolean;
}

export interface CustomGlobeLocation {
  lon: number;
  lat: number;
  placeName?: string;
  regionName?: string;
  resolving?: boolean;
  /** Open water, a coast or land, from the globe's land share grid round the point. */
  surface?: Surface;
  /** False in open water: no question is asked there. */
  investigable?: boolean;
  /** Whether a source names the point; when not, its placeName is a coordinate label. */
  named?: boolean;
  /** The geocoder's shorter everyday name for the place, used inside questions. */
  shortName?: string;
  /** The kind of place from real signals only, null when they do not say. */
  placeKind?: PlaceKind | null;
  /** The geocoder's OpenStreetMap class, type and address type, when a search result brings them. */
  osmClass?: string;
  osmType?: string;
  addressType?: string;
}

interface GeocodeSuggestion {
  name: string;
  shortName?: string;
  region: string;
  lat: number;
  lon: number;
  osmClass?: string;
  osmType?: string;
  addressType?: string;
}

const STUDIED_QUESTIONS_BY_SEED: Record<string, readonly string[]> = {
  "ait-bouguemez": [
    "Is grazing changing the shared pastures of the Aït Bouguemez valley?",
    "Why can a satellite pixel get greener while its pasture does not?",
    "How much of the valley's greenness change does wet-season rainfall explain?",
  ],
  "calaveras-creek": [
    "Is grazing changing the rangeland of the Calaveras Creek catchment?",
    "How much of Calaveras Creek's rangeland trend is explained by rainfall versus grazing?",
    "Where should field teams walk transects to verify canopy versus herbaceous cover?",
  ],
  "taos-acequia": [
    "Are upper-watershed snowpack shifts or valley irrigation changes driving Taos basin trends?",
    "How do acequia-irrigated bottomlands compare against upland sagebrush slopes?",
    "Where do coarse satellite trends diverge from local ditch-parcel conditions?",
  ],
  "rio-hondo": [
    "How do mountain snowmelt timing and valley parciante irrigation shape Rio Hondo greenness?",
    "Can satellite trends separate upland conifer stress from irrigated meadow resilience?",
    "Which elevation bands require on-foot verification before water-sharing decisions?",
  ],
};

function lookupStudiedQuestions(c?: GlobeCase): readonly string[] | undefined {
  if (!c) return undefined;
  const raw = (c.seedCaseId ?? c.id)
    .toLowerCase()
    .replace(/^case_/, "")
    .replace(/_/g, "-");
  if (STUDIED_QUESTIONS_BY_SEED[raw]) return STUDIED_QUESTIONS_BY_SEED[raw];
  if (raw.includes("ait") || raw.includes("bouguemez")) {
    return STUDIED_QUESTIONS_BY_SEED["ait-bouguemez"];
  }
  if (raw.includes("calaveras")) {
    return STUDIED_QUESTIONS_BY_SEED["calaveras-creek"];
  }
  if (raw.includes("taos")) {
    return STUDIED_QUESTIONS_BY_SEED["taos-acequia"];
  }
  if (raw.includes("hondo")) {
    return STUDIED_QUESTIONS_BY_SEED["rio-hondo"];
  }
  return undefined;
}

/** A seed case was studied; a case built from a picked place was only started here before. */
function caseOrigin(c: GlobeCase): string {
  return (c.seedCaseId ?? c.id).startsWith("case_loc_") ? "Started before" : "Studied case";
}

function typing(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
}

function parseCoordinateInput(raw: string): { lat: number; lon: number } | null {
  const cleaned = raw.trim();
  const simple = /^(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)$/.exec(cleaned);
  if (simple) {
    const a = Number(simple[1]);
    const b = Number(simple[2]);
    if (Number.isFinite(a) && Number.isFinite(b)) {
      if (Math.abs(a) <= 90 && Math.abs(b) <= 180) return { lat: a, lon: b };
      if (Math.abs(b) <= 90 && Math.abs(a) <= 180) return { lat: b, lon: a };
    }
  }
  const cardinal =
    /(\d+(?:\.\d+)?)\s*°?\s*([NSns])\s*[,;\s]+\s*(\d+(?:\.\d+)?)\s*°?\s*([EWew])/.exec(cleaned);
  if (cardinal) {
    const latMag = Number(cardinal[1]);
    const latDir = cardinal[2]?.toUpperCase();
    const lonMag = Number(cardinal[3]);
    const lonDir = cardinal[4]?.toUpperCase();
    if (Number.isFinite(latMag) && Number.isFinite(lonMag) && latMag <= 90 && lonMag <= 180) {
      return {
        lat: latDir === "S" ? -latMag : latMag,
        lon: lonDir === "W" ? -lonMag : lonMag,
      };
    }
  }
  return null;
}

export { formatLatLon };

function cleanPlaceLabel(place?: string, region?: string): string {
  const p = (place ?? "").trim();
  const r = (region ?? "").trim();
  const isGenericP = !p || /^selected\b/i.test(p);
  const isGenericR = !r || /^selected\b/i.test(r) || r.includes("°");
  if (isGenericP && isGenericR) return "";
  if (isGenericP) return r;
  if (isGenericR) return p;
  if (p.toLowerCase() === r.toLowerCase()) return p;
  return `${p}, ${r}`;
}

export function GlobePage({
  cases,
  savedCases = [],
  allSavedCases = [],
  others = [],
  cardRef,
  onOpen,
  onSelectSavedCase,
  onBack,
  onBackToOpening,
  opened = false,
  selectedCaseId,
  customLocation,
  onSelectLocation,
  onLaunchCustomCase,
  registerPrimaryAction,
  onStartingChange,
  theme = "light",
  onToggleTheme,
}: {
  others?: readonly OtherPlace[];
  cases: GlobeCase[];
  savedCases?: readonly GlobeCase[];
  allSavedCases?: readonly GlobeCase[];
  cardRef: Ref<HTMLDivElement>;
  onOpen: (question?: string, targetCase?: GlobeCase, entryMode?: "run" | "briefing") => void;
  onSelectSavedCase?: (savedCase: GlobeCase) => void;
  onBack?: () => void;
  onBackToOpening?: () => void;
  opened?: boolean;
  selectedCaseId?: string;
  customLocation?: CustomGlobeLocation | null;
  onSelectLocation?: (loc: CustomGlobeLocation) => void;
  onLaunchCustomCase?: (caseId: string, question?: string) => void;
  registerPrimaryAction?: (fn: () => void) => void;
  /** Told when a start begins or ends here, so the globe takes no new point under "Starting". */
  onStartingChange?: (starting: boolean) => void;
  theme?: "light" | "obsidian";
  onToggleTheme?: () => void;
}) {
  // Progressive Detroit: Become Human sequence:
  // Step 1: ONLY 1/2 is shown on arrival.
  // Step 2: Choosing a place collapses 1/2 into a minimal "done" line and reveals 2/2 stepped to the right.
  const [activeStep, setActiveStep] = useState<1 | 2>(1);
  const [qIdx, setQIdx] = useState(0);
  const [customQuestionInput, setCustomQuestionInput] = useState("");
  const [placeQuery, setPlaceQuery] = useState("");
  const [highlightedPlaceIdx, setHighlightedPlaceIdx] = useState<number | null>(null);
  const [geocodeResults, setGeocodeResults] = useState<GeocodeSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [launchingCustom, setLaunchingCustom] = useState(false);
  // a start begun from this page: step 2 folds to its question and the large starting state says what is happening
  const [launch, setLaunch] = useState<{ question: string; status: string } | null>(null);
  const [launchError, setLaunchError] = useState<string | null>(null);

  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const customQuestionRef = useRef<HTMLInputElement | null>(null);

  const studiedCases = useMemo(() => {
    const base =
      savedCases.length > 0 ? savedCases : allSavedCases.length > 0 ? allSavedCases : cases;
    const filtered = base.filter(
      (c) => !c.id.startsWith("case_loc_selected_") && !/^selected\b/i.test(c.place.trim()),
    );
    return filtered.length > 0 ? filtered : base;
  }, [savedCases, allSavedCases, cases]);

  const activeSavedCase = useMemo(
    () =>
      studiedCases.find((c) => c.id === selectedCaseId || c.seedCaseId === selectedCaseId) ??
      cases[0] ??
      studiedCases[0],
    [studiedCases, selectedCaseId, cases],
  );

  // Clean, non-duplicated place & coordinate summary
  const activePlaceDisplay = useMemo(() => {
    if (customLocation) {
      const cleaned = cleanPlaceLabel(customLocation.placeName, customLocation.regionName);
      const coords = formatLatLon(customLocation.lat, customLocation.lon);
      const title = cleaned || coords;
      return {
        title,
        coords: title.includes("°") ? "" : coords,
        isCustom: true,
      };
    }
    if (activeSavedCase) {
      const coords =
        activeSavedCase.lat !== undefined && activeSavedCase.lon !== undefined
          ? formatLatLon(activeSavedCase.lat, activeSavedCase.lon)
          : "31.64° N, 6.54° W";
      return {
        title: `${activeSavedCase.place}, ${activeSavedCase.region}`,
        coords,
        isCustom: false,
      };
    }
    return {
      title: "Aït Bouguemez valley, Morocco",
      coords: "31.64° N, 6.54° W",
      isCustom: false,
    };
  }, [customLocation, activeSavedCase]);

  const questionsForCurrentPlace = useMemo(() => {
    if (customLocation) {
      // a point with no name is asked about by its coordinates, never by its "The land at" label
      return placeQuestions(
        {
          ...(customLocation.named && customLocation.placeName
            ? { name: customLocation.placeName }
            : {}),
          ...(customLocation.named && customLocation.shortName
            ? { shortName: customLocation.shortName }
            : {}),
          lat: customLocation.lat,
          lon: customLocation.lon,
        },
        customLocation.placeKind ?? null,
      );
    }
    const list = lookupStudiedQuestions(activeSavedCase);
    if (list && list.length > 0) return list;
    if (activeSavedCase?.question) {
      // a case started here before: its own question, then the broad ones (its kind is not known here)
      const broad = placeQuestions(
        {
          name: activeSavedCase.place,
          lat: activeSavedCase.lat ?? 0,
          lon: activeSavedCase.lon ?? 0,
        },
        null,
      );
      return [activeSavedCase.question, ...broad.filter((q) => q !== activeSavedCase.question)];
    }
    return STUDIED_QUESTIONS_BY_SEED["ait-bouguemez"] ?? [];
  }, [customLocation, activeSavedCase]);

  useEffect(() => {
    setQIdx(0);
    setCustomQuestionInput("");
  }, [activeSavedCase?.id, activeSavedCase?.seedCaseId, customLocation?.lat, customLocation?.lon]);

  // Live worldwide geocoding search
  useEffect(() => {
    const q = placeQuery.trim();
    if (q.length < 2 || parseCoordinateInput(q)) {
      setGeocodeResults([]);
      setSearching(false);
      return;
    }
    let cancelled = false;
    // read through a function: the effect's cleanup flips it while a request is out
    const stale = () => cancelled;
    setSearching(true);
    const search = async () => {
      try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
          q,
        )}&limit=5&addressdetails=1&namedetails=1`;
        const res = await fetch(url, {
          headers: { "Accept-Language": "en" },
        });
        if (!res.ok || stale()) return;
        const data = (await res.json()) as Array<{
          display_name?: string;
          name?: string;
          lat?: string;
          lon?: string;
          class?: string;
          type?: string;
          addresstype?: string;
          namedetails?: Record<string, string>;
          address?: Record<string, string>;
        }>;
        if (stale()) return;
        const parsed: GeocodeSuggestion[] = [];
        for (const item of data) {
          const lat = Number(item.lat);
          const lon = Number(item.lon);
          if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
          const parts = (item.display_name ?? "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
          const name = item.name || parts[0] || formatLatLon(lat, lon);
          const country = item.address?.country || parts[parts.length - 1] || "";
          const state = item.address?.state || item.address?.region || parts[1] || "";
          const region = [state, country].filter((x) => x && x !== name).join(", ");
          const short = shortNameFrom(item.namedetails, name);
          parsed.push({
            name,
            region,
            lat,
            lon,
            ...(short ? { shortName: short } : {}),
            ...(item.class ? { osmClass: item.class } : {}),
            ...(item.type ? { osmType: item.type } : {}),
            ...(item.addresstype ? { addressType: item.addresstype } : {}),
          });
        }
        setGeocodeResults(parsed);
      } catch {
        // Ignore network errors cleanly
      } finally {
        if (!stale()) setSearching(false);
      }
    };
    const timer = window.setTimeout(() => {
      void search();
    }, 220);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [placeQuery]);

  // a picked point goes on to step 2 once it has its name, and never from open water
  const pointReady =
    !customLocation || (!customLocation.resolving && customLocation.investigable !== false);
  const pointInWater = customLocation?.investigable === false && !customLocation.resolving;
  const [advanceWhenReady, setAdvanceWhenReady] = useState(false);

  useEffect(() => {
    if (!advanceWhenReady || !customLocation || customLocation.resolving) return;
    setAdvanceWhenReady(false);
    if (customLocation.investigable !== false) setActiveStep(2);
  }, [advanceWhenReady, customLocation]);

  useEffect(() => {
    if (customLocation?.investigable === false) setActiveStep(1);
  }, [customLocation]);

  const handleLaunchCustomLocation = useCallback(
    async (questionOverride?: string) => {
      if (!customLocation || launchingCustom || !pointReady) return;
      const chosenQ =
        questionOverride ||
        customQuestionInput.trim() ||
        questionsForCurrentPlace[qIdx] ||
        (questionsForCurrentPlace[0] ?? "");
      setLaunchingCustom(true);
      setLaunchError(null);
      setLaunch({ question: chosenQ, status: launchStatus("new") });
      let outcome: StartOutcome;
      try {
        const res = await fetch("/api/cases/from-location", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            lon: customLocation.lon,
            lat: customLocation.lat,
            placeName: customLocation.placeName,
            regionName: customLocation.regionName,
            question: chosenQ,
          }),
        });
        outcome = startOutcome(res.status, await res.json().catch(() => null));
      } catch {
        outcome = startOutcome(null, null);
      }
      if ("caseId" in outcome) {
        // the starting state stays up while the new case's page loads
        if (onLaunchCustomCase) {
          onLaunchCustomCase(outcome.caseId, chosenQ);
        } else {
          window.location.href = `/?case=${encodeURIComponent(outcome.caseId)}&dive=1&mode=run&q=${encodeURIComponent(chosenQ)}`;
        }
        return;
      }
      // never another place's case in its stead: the visitor sees that this place did not start
      setLaunchingCustom(false);
      setLaunch(null);
      setLaunchError(outcome.failure);
    },
    [
      customLocation,
      launchingCustom,
      pointReady,
      customQuestionInput,
      questionsForCurrentPlace,
      qIdx,
      onLaunchCustomCase,
    ],
  );

  const startStudiedCase = useCallback(
    (question: string) => {
      if (!activeSavedCase) return;
      setLaunchError(null);
      setLaunch({ question, status: launchStatus("studied") });
      onOpen(question, activeSavedCase, "run");
    },
    [activeSavedCase, onOpen],
  );

  const activeIdx = qIdx < questionsForCurrentPlace.length ? qIdx : 0;
  const activeQuestionText =
    customQuestionInput.trim() ||
    questionsForCurrentPlace[activeIdx] ||
    activeSavedCase?.question ||
    (questionsForCurrentPlace[0] ?? "");

  const triggerLaunch = useCallback(() => {
    if (!pointReady || launch) return;
    if (customLocation) {
      void handleLaunchCustomLocation(activeQuestionText);
    } else {
      startStudiedCase(activeQuestionText);
    }
  }, [
    pointReady,
    launch,
    customLocation,
    handleLaunchCustomLocation,
    activeQuestionText,
    startStudiedCase,
  ]);

  const handleSelectStudiedCase = useCallback(
    (sc: GlobeCase) => {
      onSelectSavedCase?.(sc);
      setPlaceQuery("");
      setHighlightedPlaceIdx(null);
      setAdvanceWhenReady(false);
      setActiveStep(2);
    },
    [onSelectSavedCase],
  );

  const handleSelectWorldLocation = useCallback(
    (loc: CustomGlobeLocation) => {
      onSelectLocation?.(loc);
      setPlaceQuery("");
      setHighlightedPlaceIdx(null);
      setAdvanceWhenReady(true);
    },
    [onSelectLocation],
  );

  const handlePrimaryKeyOrAction = useCallback(() => {
    if (activeStep === 1) {
      if (pointReady) setActiveStep(2);
    } else {
      triggerLaunch();
    }
  }, [activeStep, pointReady, triggerLaunch]);

  useEffect(() => {
    registerPrimaryAction?.(handlePrimaryKeyOrAction);
  }, [registerPrimaryAction, handlePrimaryKeyOrAction]);

  useEffect(() => {
    onStartingChange?.(launch !== null);
  }, [launch, onStartingChange]);

  // Keyboard shortcuts
  useEffect(() => {
    if (opened) return;
    const onKey = (e: KeyboardEvent) => {
      if (typing(e.target)) return;
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      // a start is under way: nothing changes the place or the question now
      if (launch) return;

      if (e.key === "/") {
        e.preventDefault();
        setActiveStep(1);
        window.setTimeout(() => searchInputRef.current?.focus(), 20);
        return;
      }

      if (e.key === "?") {
        e.preventDefault();
        if (!pointReady) return;
        setActiveStep(2);
        window.setTimeout(() => customQuestionRef.current?.focus(), 20);
        return;
      }

      if (e.key === " ") {
        e.preventDefault();
        triggerLaunch();
        return;
      }

      if (e.key === "Backspace") {
        if (activeStep === 2) {
          e.preventDefault();
          setActiveStep(1);
        }
        return;
      }

      if (e.key === "1" || e.key === "2" || e.key === "3" || e.key === "4") {
        const idx = Number(e.key) - 1;
        if (activeStep === 1) {
          const targetCase = studiedCases[idx];
          if (targetCase) {
            e.preventDefault();
            handleSelectStudiedCase(targetCase);
          }
        } else if (idx < questionsForCurrentPlace.length) {
          e.preventDefault();
          setCustomQuestionInput("");
          setQIdx(idx);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [
    opened,
    launch,
    activeStep,
    pointReady,
    studiedCases,
    questionsForCurrentPlace.length,
    handleSelectStudiedCase,
  ]);

  const parsedCoords = useMemo(() => parseCoordinateInput(placeQuery), [placeQuery]);

  const matchingStudiedCases = useMemo(() => {
    const q = placeQuery.trim().toLowerCase();
    if (!q) return [];
    return studiedCases.filter(
      (sc) => sc.place.toLowerCase().includes(q) || sc.region.toLowerCase().includes(q),
    );
  }, [studiedCases, placeQuery]);

  // Unified in-place animated list of places (zero floating dropdown box)
  const displayedPlaceItems = useMemo(() => {
    const q = placeQuery.trim();
    const items: Array<{
      key: string;
      title: string;
      detail: string;
      isSelected: boolean;
      shortcutKey: string;
      actionWord: string;
      onSelect: () => void;
    }> = [];

    if (!q) {
      if (customLocation) {
        const detailParts = customLocation.resolving
          ? [activePlaceDisplay.coords, "Finding a name for this point"]
          : pointInWater
            ? [
                activePlaceDisplay.coords,
                customLocation.surface === "unknown"
                  ? "The globe could not check this point: pick a named place"
                  : "No land here: pick a point on land or a coast",
              ]
            : [activePlaceDisplay.coords, "Picked on 3D globe"];
        items.push({
          key: `custom-pin-${customLocation.lat.toFixed(3)}-${customLocation.lon.toFixed(3)}`,
          title: activePlaceDisplay.title,
          detail: detailParts.filter(Boolean).join(" · "),
          isSelected: true,
          shortcutKey: pointReady ? "↵" : "",
          actionWord: pointReady ? "CONTINUE" : "",
          onSelect: () => {
            if (pointReady) setActiveStep(2);
          },
        });
      }

      studiedCases.slice(0, 4).forEach((sc, idx) => {
        const isSelected = !customLocation && activeSavedCase?.id === sc.id;
        const coords =
          sc.lat !== undefined && sc.lon !== undefined
            ? formatLatLon(sc.lat, sc.lon)
            : "31.64° N, 6.54° W";
        items.push({
          key: `studied-${sc.seedCaseId ?? sc.id}`,
          title: sc.place,
          detail: `${sc.region} · ${coords} · ${caseOrigin(sc)}`,
          isSelected,
          shortcutKey: isSelected ? "↵" : String(idx + 1),
          actionWord: isSelected ? "CONTINUE" : "SELECT",
          onSelect: () => {
            handleSelectStudiedCase(sc);
          },
        });
      });

      return items;
    }

    if (parsedCoords) {
      const coordLabel = formatLatLon(parsedCoords.lat, parsedCoords.lon);
      items.push({
        key: `coords-${coordLabel}`,
        title: coordLabel,
        detail: "Direct global coordinates",
        isSelected: false,
        shortcutKey: "↵",
        actionWord: "SELECT",
        onSelect: () => {
          // typed coordinates are named like a click on the globe: by the geocoder, the land grid or themselves
          handleSelectWorldLocation({ lat: parsedCoords.lat, lon: parsedCoords.lon });
        },
      });
    }

    matchingStudiedCases.forEach((sc) => {
      const coords =
        sc.lat !== undefined && sc.lon !== undefined
          ? formatLatLon(sc.lat, sc.lon)
          : "31.64° N, 6.54° W";
      items.push({
        key: `match-studied-${sc.seedCaseId ?? sc.id}`,
        title: sc.place,
        detail: `${sc.region} · ${coords} · ${caseOrigin(sc)}`,
        isSelected: false,
        shortcutKey: "↵",
        actionWord: "SELECT",
        onSelect: () => {
          handleSelectStudiedCase(sc);
        },
      });
    });

    geocodeResults.forEach((r, idx) => {
      const coords = formatLatLon(r.lat, r.lon);
      items.push({
        key: `geo-${r.name}-${r.lat.toFixed(3)}-${String(idx)}`,
        title: cleanPlaceLabel(r.name, r.region),
        detail: `${coords} · Worldwide location`,
        isSelected: false,
        shortcutKey: "↵",
        actionWord: "SELECT",
        onSelect: () => {
          handleSelectWorldLocation({
            lon: r.lon,
            lat: r.lat,
            placeName: r.name,
            regionName: r.region,
            ...(r.shortName ? { shortName: r.shortName } : {}),
            ...(r.osmClass ? { osmClass: r.osmClass } : {}),
            ...(r.osmType ? { osmType: r.osmType } : {}),
            ...(r.addressType ? { addressType: r.addressType } : {}),
          });
        },
      });
    });

    return items;
  }, [
    placeQuery,
    customLocation,
    activePlaceDisplay,
    pointInWater,
    pointReady,
    studiedCases,
    activeSavedCase?.id,
    parsedCoords,
    matchingStudiedCases,
    geocodeResults,
    handleSelectStudiedCase,
    handleSelectWorldLocation,
  ]);

  const handlePlaceSearchSubmit = useCallback(
    (e: SyntheticEvent) => {
      e.preventDefault();
      const targetIdx =
        highlightedPlaceIdx !== null && displayedPlaceItems[highlightedPlaceIdx]
          ? highlightedPlaceIdx
          : 0;
      const target = displayedPlaceItems[targetIdx];
      if (target) {
        target.onSelect();
      }
    },
    [highlightedPlaceIdx, displayedPlaceItems],
  );

  return (
    <div className={styles.page}>
      {/* Floating Spatial Tag anchored to the 3D Globe Target Point */}
      <ul className={styles.cases} aria-label={en["globe.cases"].text}>
        {cases.slice(0, 1).map((c) => {
          const coordsLabel = customLocation
            ? formatLatLon(customLocation.lat, customLocation.lon)
            : "";
          const customName = customLocation
            ? cleanPlaceLabel(customLocation.placeName, customLocation.regionName)
            : "";
          // open water reads with its coordinates, "Open water · 13.31° N, 19.35° W"
          const displayPlace = customLocation
            ? pointInWater && customName && !customName.includes("°")
              ? `${customName} · ${coordsLabel}`
              : customName || coordsLabel
            : format("globe.place", { place: c.place, region: c.region });
          // the card shows only the place while it is being chosen; the question joins it in step 2
          const shownQuestion = cardQuestion(activeStep, activeQuestionText);

          return (
            <li key={c.id}>
              <div
                ref={cardRef}
                className={styles.globeMonumentCard}
                data-case-card={c.id}
                data-diving={opened ? "" : undefined}
                onClick={() => {
                  if (!opened) handlePrimaryKeyOrAction();
                }}
              >
                <div className={styles.monumentTopRow}>
                  <span className={styles.monumentSignal}>
                    <span
                      className={styles.monumentSignalDot}
                      data-tone={customLocation ? "yellow" : "blue"}
                    />
                    <span className={styles.monumentKicker}>
                      {coordsLabel || activePlaceDisplay.coords}
                    </span>
                  </span>
                  {pointReady ? (
                    <span className={styles.monumentActionPrompt}>
                      <kbd className={styles.monumentActionKey}>{"↵"}</kbd>
                      <span>
                        {opened
                          ? "DIVING"
                          : launch
                            ? "STARTING"
                            : activeStep === 1
                              ? "SELECT"
                              : "START"}
                      </span>
                    </span>
                  ) : null}
                </div>
                <p className={styles.casePlace}>{displayPlace}</p>
                {pointInWater ? (
                  <p className={styles.caseNote} data-card-note="">
                    {customLocation.surface === "unknown"
                      ? "The globe could not check this point. Pick a named place."
                      : "Pick a point on land or a coast to ask a question here."}
                  </p>
                ) : null}
                {shownQuestion ? (
                  <p className={styles.caseQuestion} data-card-question="">
                    {shownQuestion}
                  </p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>

      <div
        className={styles.setupStage}
        data-opened={opened ? "" : undefined}
        inert={opened}
        aria-hidden={opened ? "true" : undefined}
      >
        <div className={styles.detroitAtmosphere} aria-hidden="true" />

        {/* Clean Top Bar matching Opening.tsx */}
        <header className={styles.setupTopBar}>
          <button
            type="button"
            className={styles.setupBrandBtn}
            onClick={onBack ?? onBackToOpening}
            aria-label={"Return to Siterra opening page"}
          >
            <SiterraMark className={styles.setupBrandMark} />
            <span className={styles.setupBrandName}>{en["opening.title"].text}</span>
          </button>

          <div className={styles.setupTopRight}>
            {onToggleTheme ? (
              <button
                type="button"
                className={styles.setupThemeBtn}
                onClick={onToggleTheme}
                aria-label={
                  theme === "obsidian"
                    ? "Switch to warm paper light mode"
                    : "Switch to obsidian dark mode"
                }
              >
                <ThemeIcon theme={theme} />
              </button>
            ) : null}
          </div>
        </header>

        {/* ====================================================================
              OPEN DETROIT: BECOME HUMAN FLOW (Zero Boxes, Zero Vertical Bars)
             ==================================================================== */}
        <div className={styles.dbhCanvas} data-launching={launch ? "" : undefined}>
          {/* STEP 1/2 */}
          <section
            className={styles.dbhStepOne}
            data-completed={activeStep === 2 ? "" : undefined}
            aria-label={"Step 1 of 2: Location"}
          >
            <div
              className={styles.dbhStepHeader}
              onClick={() => {
                if (activeStep === 2) setActiveStep(1);
              }}
            >
              <div className={styles.dbhFraction} aria-hidden="true">
                <span className={styles.dbhFractionNum}>{"1"}</span>
                <span className={styles.dbhFractionSlash}>{"/2"}</span>
              </div>

              <div className={styles.dbhStepHeadContent}>
                <h2 className={styles.dbhQuestion}>{"Where in the world are we investigating?"}</h2>

                {/* When Step 1 is done, collapse all options and ONLY show the selected place in smaller "done" text */}
                {activeStep === 2 ? (
                  <button
                    type="button"
                    className={styles.dbhDoneSummaryBtn}
                    onClick={() => {
                      setActiveStep(1);
                    }}
                  >
                    <span className={styles.dbhDoneAnswerRow}>
                      <span className={styles.dbhDoneAnswerPrimary}>
                        {activePlaceDisplay.title}
                      </span>
                      {activePlaceDisplay.coords ? (
                        <span className={styles.dbhDoneAnswerCoords}>
                          {activePlaceDisplay.coords}
                        </span>
                      ) : null}
                      <span className={styles.dbhDoneChangePrompt}>
                        <kbd className={styles.keycapDark}>{"⌫"}</kbd>
                        <span>{"CHANGE"}</span>
                      </span>
                    </span>
                  </button>
                ) : null}
              </div>
            </div>

            {/* Expanded Step 1 Body: Clean Input + Seamless Animated Place List Below */}
            {activeStep === 1 ? (
              <div className={styles.dbhStepOneBody}>
                <div className={styles.dbhSearchSection}>
                  <form
                    onSubmit={handlePlaceSearchSubmit}
                    className={styles.dbhUnderlineForm}
                    data-active={placeQuery.trim() ? "" : undefined}
                    data-searching={searching ? "" : undefined}
                  >
                    <kbd
                      className={placeQuery.trim() ? styles.keycapBlue : styles.keycapDark}
                      aria-hidden="true"
                    >
                      {"/"}
                    </kbd>
                    <input
                      ref={searchInputRef}
                      type="text"
                      value={placeQuery}
                      onChange={(e) => {
                        setPlaceQuery(e.target.value);
                        setHighlightedPlaceIdx(e.target.value.trim() ? 0 : null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "ArrowDown") {
                          e.preventDefault();
                          if (displayedPlaceItems.length > 0) {
                            setHighlightedPlaceIdx((prev) =>
                              prev === null ? 0 : (prev + 1) % displayedPlaceItems.length,
                            );
                          }
                        } else if (e.key === "ArrowUp") {
                          e.preventDefault();
                          if (displayedPlaceItems.length > 0) {
                            setHighlightedPlaceIdx((prev) =>
                              prev === null
                                ? displayedPlaceItems.length - 1
                                : (prev - 1 + displayedPlaceItems.length) %
                                  displayedPlaceItems.length,
                            );
                          }
                        } else if (e.key === "Escape" && placeQuery) {
                          e.preventDefault();
                          e.stopPropagation();
                          setPlaceQuery("");
                          setHighlightedPlaceIdx(null);
                        }
                      }}
                      placeholder={
                        "Search any place, valley, or coordinates (or click 3D globe)..."
                      }
                      className={styles.dbhUnderlineInput}
                      aria-label={"Search any location or coordinates in the world"}
                    />
                    {placeQuery.trim() ? (
                      <div className={styles.dbhInputRightGroup}>
                        {searching ? (
                          <span className={styles.dbhSearchingTag}>{"SEARCHING"}</span>
                        ) : null}
                        <button
                          type="button"
                          className={styles.dbhInlinePrompt}
                          onClick={() => {
                            setPlaceQuery("");
                            setHighlightedPlaceIdx(null);
                            searchInputRef.current?.focus();
                          }}
                        >
                          <kbd className={styles.keycapDark}>{"ESC"}</kbd>
                          <span>{"CLEAR"}</span>
                        </button>
                      </div>
                    ) : null}
                    <span className={styles.dbhInputTrace} aria-hidden="true" />
                  </form>

                  {/* Unified In-Place Animated List (Examples at rest, Live Worldwide Matches when typing) */}
                  <ul
                    className={styles.dbhOptionList}
                    role="listbox"
                    aria-label={"Locations"}
                    onMouseLeave={() => {
                      if (!placeQuery.trim()) {
                        setHighlightedPlaceIdx(null);
                      }
                    }}
                  >
                    {displayedPlaceItems.map((item, idx) => {
                      const isFocusedItem =
                        highlightedPlaceIdx !== null
                          ? highlightedPlaceIdx === idx
                          : placeQuery.trim() !== ""
                            ? idx === 0
                            : item.isSelected;
                      return (
                        <li
                          key={item.key}
                          className={styles.dbhPlaceListItem}
                          style={
                            {
                              "--item-idx": idx,
                            } as React.CSSProperties
                          }
                        >
                          <button
                            type="button"
                            role="option"
                            aria-selected={isFocusedItem}
                            data-selected={item.isSelected ? "" : undefined}
                            data-highlighted={isFocusedItem ? "" : undefined}
                            className={styles.dbhBareOption}
                            onMouseEnter={() => {
                              setHighlightedPlaceIdx(idx);
                            }}
                            onFocus={() => {
                              setHighlightedPlaceIdx(idx);
                            }}
                            onClick={item.onSelect}
                          >
                            <span className={styles.dbhPlaceMainRow}>
                              <span className={styles.dbhOptionLabel}>{item.title}</span>
                              {item.shortcutKey ? (
                                <span className={styles.dbhOptionAction}>
                                  <kbd
                                    className={
                                      isFocusedItem ? styles.keycapBlue : styles.keycapDark
                                    }
                                  >
                                    {item.shortcutKey}
                                  </kbd>
                                  <span className={styles.dbhActionWord}>{item.actionWord}</span>
                                </span>
                              ) : null}
                            </span>

                            {/* Hover / Highlight Indented Details Animated Below */}
                            <span className={styles.dbhPlaceDetailWrap} aria-hidden="true">
                              <span className={styles.dbhPlaceDetailInner}>{item.detail}</span>
                            </span>
                          </button>
                        </li>
                      );
                    })}

                    {placeQuery.trim().length >= 2 &&
                    displayedPlaceItems.length === 0 &&
                    searching ? (
                      <li className={styles.dbhInlineStatusRow}>
                        {"Searching worldwide locations..."}
                      </li>
                    ) : null}

                    {placeQuery.trim().length >= 2 &&
                    displayedPlaceItems.length === 0 &&
                    !searching ? (
                      <li className={styles.dbhInlineStatusRow}>
                        {
                          "No matching places found. Try coordinates (e.g. 31.64, -6.54) or click the 3D globe."
                        }
                      </li>
                    ) : null}
                  </ul>
                </div>
              </div>
            ) : null}
          </section>

          {/* STEP 2/2: Only Appears Once Step 1/2 Is Chosen! */}
          {activeStep === 2 ? (
            <section
              key="step-2-of-2"
              className={styles.dbhStepTwo}
              data-completed={launch ? "" : undefined}
              aria-label={"Step 2 of 2: Investigation Question"}
            >
              <div className={styles.dbhStepHeader}>
                <div className={styles.dbhFraction} data-tone="red" aria-hidden="true">
                  <span className={styles.dbhFractionNum}>{"2"}</span>
                  <span className={styles.dbhFractionSlash}>{"/2"}</span>
                </div>

                <div className={styles.dbhStepHeadContent}>
                  <h2 className={styles.dbhQuestion}>
                    {"Focus on a specific question, or scan the whole area:"}
                  </h2>

                  {/* once a start begins, step 2 folds to the chosen question, as step 1 folds to its place */}
                  {launch ? (
                    <p className={styles.dbhDoneAnswerRow} data-launch-question="">
                      <span className={styles.dbhDoneAnswerPrimary}>{launch.question}</span>
                    </p>
                  ) : null}
                </div>
              </div>

              {launch ? null : (
                <div className={styles.dbhStepTwoBody}>
                  {launchError ? (
                    <p className={styles.dbhLaunchError} role="alert">
                      {launchError}
                    </p>
                  ) : null}
                  <ul className={styles.dbhQuestionList} role="radiogroup">
                    {questionsForCurrentPlace.map((qText, i) => {
                      const isSelected = customQuestionInput.trim() === "" && i === activeIdx;
                      return (
                        <li key={qText}>
                          <button
                            type="button"
                            role="radio"
                            aria-checked={isSelected}
                            data-selected={isSelected ? "" : undefined}
                            className={styles.dbhBareQuestionOption}
                            onClick={() => {
                              setCustomQuestionInput("");
                              setQIdx(i);
                              if (isSelected) {
                                if (customLocation) {
                                  void handleLaunchCustomLocation(qText);
                                } else {
                                  startStudiedCase(qText);
                                }
                              }
                            }}
                            onDoubleClick={() => {
                              setCustomQuestionInput("");
                              setQIdx(i);
                              if (customLocation) {
                                void handleLaunchCustomLocation(qText);
                              } else {
                                startStudiedCase(qText);
                              }
                            }}
                          >
                            <span className={styles.dbhQuestionOptionText}>{qText}</span>
                            <span className={styles.dbhOptionAction}>
                              <kbd className={isSelected ? styles.keycapBlue : styles.keycapDark}>
                                {isSelected ? "↵" : String(i + 1)}
                              </kbd>
                              <span className={styles.dbhActionWord}>
                                {isSelected ? "START" : "SELECT"}
                              </span>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>

                  {/* Custom Question Underline Input */}
                  <div className={styles.dbhCustomQuestionWrap}>
                    <div
                      className={styles.dbhUnderlineForm}
                      data-active={customQuestionInput.trim() ? "" : undefined}
                    >
                      <kbd
                        className={
                          customQuestionInput.trim() ? styles.keycapBlue : styles.keycapDark
                        }
                        aria-hidden="true"
                      >
                        {"?"}
                      </kbd>
                      <input
                        ref={customQuestionRef}
                        type="text"
                        value={customQuestionInput}
                        onChange={(e) => {
                          setCustomQuestionInput(e.target.value);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && customQuestionInput.trim()) {
                            e.preventDefault();
                            triggerLaunch();
                          }
                        }}
                        placeholder={"Or type your own question for this landscape..."}
                        className={styles.dbhUnderlineInput}
                        aria-label={"Type a custom investigation question"}
                      />
                      <span className={styles.dbhInputTrace} aria-hidden="true" />
                    </div>
                  </div>
                </div>
              )}
            </section>
          ) : null}

          {/* the start, large and calm: what is really happening, nothing more */}
          {launch ? (
            <section className={styles.dbhLaunch} role="status" data-launch="">
              <p className={styles.dbhLaunchWord}>{"Starting"}</p>
              <p className={styles.dbhLaunchStatus}>{launch.status}</p>
            </section>
          ) : null}
        </div>

        {/* Right Stage Minimal Globe Action Prompts */}
        <div className={styles.globeContextualHud} aria-label={"3D Globe controls"}>
          <span className={styles.globeHudItem}>
            <kbd className={styles.globeHudKey}>{"DRAG"}</kbd>
            <span>{"Rotate Earth"}</span>
          </span>
          <span className={styles.globeHudItem}>
            <kbd className={styles.globeHudKey}>{"CLICK"}</kbd>
            <span>{"Pick any spot on Earth"}</span>
          </span>
        </div>

        {/* Bottom-Right Detroit Controller Bar */}
        <div className={styles.detroitBottomBar}>
          <button
            type="button"
            className={styles.detroitKeyAction}
            disabled={Boolean(launch)}
            onClick={() => {
              if (activeStep === 2) {
                setActiveStep(1);
              } else {
                (onBack ?? onBackToOpening)?.();
              }
            }}
          >
            <kbd className={styles.detroitKeyCap}>{"ESC"}</kbd>
            <span>{activeStep === 2 ? "CHANGE PLACE" : "BACK"}</span>
          </button>
          <button
            type="button"
            className={styles.detroitKeyAction}
            disabled={Boolean(launch) || !pointReady}
            onClick={triggerLaunch}
          >
            <kbd className={styles.detroitKeyCap}>{"SPACE"}</kbd>
            <span>{"SCAN WHOLE AREA"}</span>
          </button>
          <button
            type="button"
            className={styles.detroitKeyAction}
            disabled={Boolean(launch) || !pointReady}
            onClick={handlePrimaryKeyOrAction}
          >
            <kbd className={styles.detroitKeyCapPrimary}>{"↵"}</kbd>
            <span>{activeStep === 1 ? "CHOOSE FOCUS" : "START INVESTIGATION"}</span>
          </button>
        </div>

        {others.length ? (
          <nav className={styles.srOnlyOthers} aria-label={en["globe.others"].text}>
            {others.map((p) => (
              <a key={p.caseId} href={placeHref(p.caseId)} data-other-place={p.caseId}>
                {format("globe.place", { place: p.name, region: p.region })}
              </a>
            ))}
          </nav>
        ) : null}
      </div>
    </div>
  );
}
