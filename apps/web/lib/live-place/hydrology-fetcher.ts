export interface NamedPeak {
  name: string;
  elevationM?: number;
  lon: number;
  lat: number;
}

export interface HydrologyResult {
  streamPaths: [number, number][][];
  namedWaterways: string[];
  namedPeaks: NamedPeak[];
  protectedAreas: string[];
}

interface OverpassGeomPoint {
  lat?: number;
  lon?: number;
}

interface OverpassElement {
  type?: string;
  id?: number;
  lat?: number;
  lon?: number;
  tags?: Record<string, string | undefined>;
  geometry?: OverpassGeomPoint[];
}

interface OverpassResponse {
  elements?: OverpassElement[];
}

function parseElevationM(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const cleaned = raw.replace(/,/g, ".").match(/-?\d+(\.\d+)?/);
  if (!cleaned?.[0]) return undefined;
  const val = Number.parseFloat(cleaned[0]);
  return Number.isFinite(val) ? Math.round(val) : undefined;
}

/**
 * Queries OpenStreetMap Overpass API inside `bbox = [minLon, minLat, maxLon, maxLat]`
 * for real river/stream/canal geometries, named peaks/springs, and protected areas.
 * Never throws on network timeout or HTTP failure; returns empty arrays on failure.
 */
export async function fetchRealHydrology(
  bbox: [number, number, number, number],
): Promise<HydrologyResult> {
  const empty: HydrologyResult = {
    streamPaths: [],
    namedWaterways: [],
    namedPeaks: [],
    protectedAreas: [],
  };

  const [minLon, minLat, maxLon, maxLat] = bbox;
  const bboxClause = `(${minLat},${minLon},${maxLat},${maxLon})`;
  const query = [
    "[out:json][timeout:4];",
    `way["waterway"~"^(river|stream|canal)$"]${bboxClause};`,
    "out geom qt 25;",
    `node["natural"~"^(peak|spring)$"]["name"]${bboxClause};`,
    "out body qt 15;",
    `way["boundary"~"^(protected_area|national_park)$"]["name"]${bboxClause};`,
    "out tags qt 10;",
  ].join("\n");

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 4500);
  try {
    const res = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      signal: ac.signal,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        Accept: "application/json",
        "User-Agent": "Siterra/1.0",
      },
      body: `data=${encodeURIComponent(query)}`,
    });
    if (!res.ok) return empty;

    const data = (await res.json()) as OverpassResponse;
    const elements = Array.isArray(data.elements) ? data.elements : [];

    const candidateWays: Array<{ pts: [number, number][]; isRiver: boolean }> = [];
    const waterwayNames = new Set<string>();
    const peakMap = new Map<string, NamedPeak>();
    const protectedSet = new Set<string>();

    for (const el of elements) {
      const tags = el.tags ?? {};
      const name = tags["name:en"]?.trim() || tags["name"]?.trim();
      const waterway = tags["waterway"];
      const natural = tags["natural"];
      const boundary = tags["boundary"];

      if (waterway || (el.type === "way" && Array.isArray(el.geometry) && !boundary)) {
        if (name) {
          waterwayNames.add(name);
        }
        if (Array.isArray(el.geometry)) {
          const pts: [number, number][] = [];
          for (const g of el.geometry) {
            if (typeof g.lon === "number" && typeof g.lat === "number") {
              pts.push([Number(g.lon.toFixed(6)), Number(g.lat.toFixed(6))]);
            }
          }
          if (pts.length >= 4) {
            candidateWays.push({
              pts,
              isRiver: waterway === "river",
            });
          }
        }
      }

      if (
        (natural === "peak" || natural === "spring" || el.type === "node") &&
        name &&
        typeof el.lon === "number" &&
        typeof el.lat === "number"
      ) {
        if (!peakMap.has(name.toLowerCase())) {
          const elevationM = parseElevationM(tags["ele"]);
          peakMap.set(name.toLowerCase(), {
            name,
            ...(elevationM !== undefined ? { elevationM } : {}),
            lon: Number(el.lon.toFixed(6)),
            lat: Number(el.lat.toFixed(6)),
          });
        }
      }

      if (
        (boundary === "protected_area" ||
          boundary === "national_park" ||
          tags["protect_class"] !== undefined) &&
        name
      ) {
        protectedSet.add(name);
      }
    }

    candidateWays.sort((a, b) => {
      if (a.isRiver !== b.isRiver) return a.isRiver ? -1 : 1;
      return b.pts.length - a.pts.length;
    });

    return {
      streamPaths: candidateWays.slice(0, 6).map((w) => w.pts),
      namedWaterways: [...waterwayNames].slice(0, 15),
      namedPeaks: [...peakMap.values()].slice(0, 15),
      protectedAreas: [...protectedSet].slice(0, 10),
    };
  } catch {
    return empty;
  } finally {
    clearTimeout(timer);
  }
}
