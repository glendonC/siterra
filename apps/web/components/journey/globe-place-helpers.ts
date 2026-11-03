import { useEffect, useState } from "react";
import {
  formatLatLon,
  placeQuestions,
  shortNameFrom,
  type PlaceKind,
  type Surface,
} from "./globe-choice";

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

export interface GeocodeSuggestion {
  name: string;
  shortName?: string;
  region: string;
  lat: number;
  lon: number;
  osmClass?: string;
  osmType?: string;
  addressType?: string;
}

export interface DisplayedPlaceItem {
  key: string;
  title: string;
  detail: string;
  isSelected: boolean;
  shortcutKey: string;
  actionWord: string;
  onSelect: () => void;
}

export interface ActivePlaceDisplay {
  title: string;
  coords: string;
  isCustom: boolean;
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

export function lookupStudiedQuestions(c?: GlobeCase): readonly string[] | undefined {
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
export function caseOrigin(c: GlobeCase): string {
  return (c.seedCaseId ?? c.id).startsWith("case_loc_") ? "Started before" : "Studied case";
}

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
}

export function parseCoordinateInput(raw: string): { lat: number; lon: number } | null {
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

export function cleanPlaceLabel(place?: string, region?: string): string {
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

export function resolveActivePlaceDisplay(
  customLocation: CustomGlobeLocation | null | undefined,
  activeSavedCase: GlobeCase | undefined,
): ActivePlaceDisplay {
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
}

export function resolveQuestionsForCurrentPlace(
  customLocation: CustomGlobeLocation | null | undefined,
  activeSavedCase: GlobeCase | undefined,
): readonly string[] {
  if (customLocation) {
    // A point with no name is asked about by its coordinates, never by its "The land at" label.
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
    // A case started here before: its own question, then the broad ones (its kind is not known here).
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
}

export function useWorldwideGeocodeSearch(placeQuery: string): {
  geocodeResults: GeocodeSuggestion[];
  searching: boolean;
} {
  const [geocodeResults, setGeocodeResults] = useState<GeocodeSuggestion[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const q = placeQuery.trim();
    if (q.length < 2 || parseCoordinateInput(q)) {
      setGeocodeResults([]);
      setSearching(false);
      return;
    }
    let cancelled = false;
    // Read through a function so the effect cleanup flips it while a request is in flight.
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

  return { geocodeResults, searching };
}

export function buildDisplayedPlaceItems(params: {
  placeQuery: string;
  customLocation: CustomGlobeLocation | null | undefined;
  activePlaceDisplay: ActivePlaceDisplay;
  pointInWater: boolean;
  pointReady: boolean;
  studiedCases: readonly GlobeCase[];
  activeSavedCaseId: string | undefined;
  parsedCoords: { lat: number; lon: number } | null;
  matchingStudiedCases: readonly GlobeCase[];
  geocodeResults: readonly GeocodeSuggestion[];
  onContinueCustomPoint: () => void;
  onSelectStudiedCase: (sc: GlobeCase) => void;
  onSelectWorldLocation: (loc: CustomGlobeLocation) => void;
}): DisplayedPlaceItem[] {
  const {
    placeQuery,
    customLocation,
    activePlaceDisplay,
    pointInWater,
    pointReady,
    studiedCases,
    activeSavedCaseId,
    parsedCoords,
    matchingStudiedCases,
    geocodeResults,
    onContinueCustomPoint,
    onSelectStudiedCase,
    onSelectWorldLocation,
  } = params;

  const q = placeQuery.trim();
  const items: DisplayedPlaceItem[] = [];

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
        onSelect: onContinueCustomPoint,
      });
    }

    studiedCases.slice(0, 4).forEach((sc, idx) => {
      const isSelected = !customLocation && activeSavedCaseId === sc.id;
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
          onSelectStudiedCase(sc);
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
        // Typed coordinates are named like a click on the globe: by the geocoder, the land grid or themselves.
        onSelectWorldLocation({ lat: parsedCoords.lat, lon: parsedCoords.lon });
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
        onSelectStudiedCase(sc);
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
        onSelectWorldLocation({
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
}
