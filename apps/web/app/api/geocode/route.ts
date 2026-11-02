import { database } from "../database.ts";
import { json, problem } from "../problem.ts";

export const dynamic = "force-dynamic";

export interface GeocodePlace {
  /** The place's name; its coordinates when nothing names it (then named is false). */
  name: string;
  region: string;
  lon: number;
  lat: number;
  /** False when no source names the point; absent on older answers. */
  named?: boolean;
  /** OpenStreetMap class, type and address type of the geocoder's hit, when it gave them. */
  osmClass?: string;
  osmType?: string;
  addressType?: string;
}

/** The OpenStreetMap kind of a Nominatim hit, only the fields it gave. */
function osmKind(row: {
  class?: string;
  type?: string;
  addresstype?: string;
}): Pick<GeocodePlace, "osmClass" | "osmType" | "addressType"> {
  return {
    ...(row.class ? { osmClass: row.class } : {}),
    ...(row.type ? { osmType: row.type } : {}),
    ...(row.addresstype ? { addressType: row.addresstype } : {}),
  };
}

async function loadStoredPlaces(): Promise<GeocodePlace[]> {
  try {
    const db = database();
    const { rows } = await db.query<{
      name: string | null;
      region: string | null;
      lon: number | null;
      lat: number | null;
    }>(
      `SELECT DISTINCT ON (c.id)
         c.record->'place'->>'name' AS name,
         c.record->'place'->>'region' AS region,
         (r.record->'geometry'->'coordinates'->>0)::float8 AS lon,
         (r.record->'geometry'->'coordinates'->>1)::float8 AS lat
       FROM cases c
       JOIN records r ON r.case_id = c.id
       WHERE c.origin_case_id IS NULL
         AND r.record_type = 'ContextFeature'
         AND r.record->>'role' = 'outlet'
       ORDER BY c.id, r.revision DESC
       LIMIT 50`,
    );
    return rows
      .filter(
        (r): r is { name: string; region: string; lon: number; lat: number } =>
          typeof r.name === "string" &&
          r.name.length > 0 &&
          typeof r.region === "string" &&
          typeof r.lon === "number" &&
          Number.isFinite(r.lon) &&
          typeof r.lat === "number" &&
          Number.isFinite(r.lat),
      )
      .map((r) => ({
        name: r.name,
        region: r.region,
        lon: Number(r.lon.toFixed(5)),
        lat: Number(r.lat.toFixed(5)),
        named: true,
      }));
  } catch {
    return [];
  }
}

export function formatCoordRegion(lat: number, lon: number): string {
  const ns = lat >= 0 ? "N" : "S";
  const ew = lon >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(2)}° ${ns}, ${Math.abs(lon).toFixed(2)}° ${ew}`;
}

/**
 * Parses a raw coordinate query such as "36.1, -112.1" or "37.8651 N, 119.5383 W".
 */
function parseCoordinateQuery(q: string): GeocodePlace | null {
  const cleaned = q.trim();
  const match =
    /^([+-]?\d+(?:\.\d+)?)\s*°?\s*([NSns])?\s*[,;\s]\s*([+-]?\d+(?:\.\d+)?)\s*°?\s*([EWew])?$/.exec(
      cleaned,
    );
  if (!match) return null;
  let a = Number(match[1]);
  const dirA = match[2]?.toUpperCase();
  let b = Number(match[3]);
  const dirB = match[4]?.toUpperCase();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  if (dirA === "S") a = -Math.abs(a);
  if (dirA === "N") a = Math.abs(a);
  if (dirB === "W") b = -Math.abs(b);
  if (dirB === "E") b = Math.abs(b);

  let lat: number;
  let lon: number;
  if (Math.abs(a) <= 90 && Math.abs(b) <= 180) {
    lat = a;
    lon = b;
  } else if (Math.abs(a) <= 180 && Math.abs(b) <= 90) {
    lon = a;
    lat = b;
  } else {
    return null;
  }
  return {
    name: formatCoordRegion(lat, lon),
    region: "",
    lon: Number(lon.toFixed(5)),
    lat: Number(lat.toFixed(5)),
    named: false,
  };
}

async function searchOpenMeteo(query: string): Promise<GeocodePlace[]> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 3500);
  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
      query,
    )}&count=5&language=en&format=json`;
    const res = await fetch(url, {
      signal: ac.signal,
      headers: { Accept: "application/json", "User-Agent": "Siterra/1.0" },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      results?: Array<{
        name?: string;
        latitude?: number;
        longitude?: number;
        admin1?: string;
        admin2?: string;
        country?: string;
      }>;
    };
    const out: GeocodePlace[] = [];
    for (const item of data.results ?? []) {
      if (
        typeof item.name !== "string" ||
        typeof item.latitude !== "number" ||
        typeof item.longitude !== "number"
      ) {
        continue;
      }
      const regionParts = [item.admin1 || item.admin2, item.country].filter(
        (x): x is string => typeof x === "string" && x.trim().length > 0,
      );
      out.push({
        name: item.name.trim(),
        region:
          regionParts.join(", ") || formatCoordRegion(item.latitude, item.longitude),
        lon: Number(item.longitude.toFixed(5)),
        lat: Number(item.latitude.toFixed(5)),
        named: true,
      });
    }
    return out;
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

async function searchNominatim(query: string): Promise<GeocodePlace[]> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 3500);
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&q=${encodeURIComponent(
      query,
    )}&limit=5`;
    const res = await fetch(url, {
      signal: ac.signal,
      headers: {
        Accept: "application/json",
        "Accept-Language": "en",
        "User-Agent": "Siterra/1.0 (https://siterra.invalid)",
      },
    });
    if (!res.ok) return [];
    const rows = (await res.json()) as Array<{
      name?: string;
      display_name?: string;
      lat?: string;
      lon?: string;
      class?: string;
      type?: string;
      addresstype?: string;
      address?: Record<string, string | undefined>;
    }>;
    if (!Array.isArray(rows)) return [];
    const out: GeocodePlace[] = [];
    for (const row of rows) {
      const lat = Number(row.lat);
      const lon = Number(row.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      const parts = (row.display_name ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const given = (row.name?.trim() || parts[0] || "").slice(0, 80);
      const name = given || formatCoordRegion(lat, lon);
      const stateOrRegion =
        row.address?.["state"] ||
        row.address?.["region"] ||
        row.address?.["county"] ||
        parts[1];
      const country = row.address?.["country"] || parts[parts.length - 1];
      const region =
        [stateOrRegion, country]
          .filter((x): x is string => Boolean(x && x !== name))
          .filter((v, i, a) => a.indexOf(v) === i)
          .join(", ") || formatCoordRegion(lat, lon);
      out.push({
        name,
        region,
        lon: Number(lon.toFixed(5)),
        lat: Number(lat.toFixed(5)),
        named: Boolean(given),
        ...osmKind(row),
      });
    }
    return out;
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

function cleanLatinName(raw: string): string {
  const trimmed = raw.trim();
  const bilingualMatch = /^([A-Za-z\u00C0-\u024F0-9'’\-\s.()]+?)\s+[^\u0000-\u024F\s].*$/.exec(
    trimmed,
  );
  if (bilingualMatch?.[1]?.trim()) {
    return bilingualMatch[1].trim();
  }
  return trimmed;
}

export async function reverseGeocode(lon: number, lat: number): Promise<GeocodePlace> {
  const storedPlaces = await loadStoredPlaces();
  const nearbyKnown = storedPlaces.find(
    (p) => Math.hypot(p.lon - lon, p.lat - lat) < 0.08,
  );
  if (nearbyKnown) {
    return {
      name: nearbyKnown.name,
      region: nearbyKnown.region,
      lon: Number(lon.toFixed(5)),
      lat: Number(lat.toFixed(5)),
      named: true,
    };
  }

  // nothing names the point (Nominatim answers open sea and unclaimed land with an error): its coordinates do
  const fallback: GeocodePlace = {
    name: formatCoordRegion(lat, lon),
    region: "",
    lon: Number(lon.toFixed(5)),
    lat: Number(lat.toFixed(5)),
    named: false,
  };
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 3500);
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${encodeURIComponent(
      String(lat),
    )}&lon=${encodeURIComponent(String(lon))}&zoom=13&addressdetails=1`;
    const res = await fetch(url, {
      signal: ac.signal,
      headers: {
        Accept: "application/json",
        "Accept-Language": "en",
        "User-Agent": "Siterra/1.0 (https://siterra.invalid)",
      },
    });
    if (!res.ok) return fallback;
    const data = (await res.json()) as {
      error?: string;
      name?: string;
      display_name?: string;
      class?: string;
      type?: string;
      addresstype?: string;
      address?: Record<string, string | undefined>;
    };
    if (data.error) return fallback;
    const addr = data.address ?? {};
    const displayParts = (data.display_name ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const rawName =
      data.name?.trim() ||
      addr["valley"] ||
      addr["natural"] ||
      addr["national_park"] ||
      addr["protected_area"] ||
      addr["mountain_range"] ||
      addr["peak"] ||
      addr["water"] ||
      addr["river"] ||
      addr["town"] ||
      addr["village"] ||
      addr["municipality"] ||
      addr["city"] ||
      addr["county"] ||
      addr["state_district"] ||
      displayParts[0];
    if (!rawName) return fallback;
    const state =
      addr["state"] || addr["region"] || addr["province"] || addr["county"] || displayParts[1];
    const country = addr["country"] || displayParts[displayParts.length - 1];
    const region =
      [state, country]
        .filter((x): x is string => Boolean(x && x !== rawName))
        .filter((v, i, a) => a.indexOf(v) === i)
        .join(", ") || formatCoordRegion(lat, lon);
    return {
      name: cleanLatinName(rawName).slice(0, 80),
      region: cleanLatinName(region).slice(0, 100),
      lon: Number(lon.toFixed(5)),
      lat: Number(lat.toFixed(5)),
      named: true,
      ...osmKind(data),
    };
  } catch {
    return fallback;
  } finally {
    clearTimeout(timer);
  }
}

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();
  const lonParam = searchParams.get("lon");
  const latParam = searchParams.get("lat");

  if (q !== undefined && q !== "") {
    const coord = parseCoordinateQuery(q);
    if (coord) {
      const rev = await reverseGeocode(coord.lon, coord.lat);
      return json({ results: [{ ...rev, lon: coord.lon, lat: coord.lat }] });
    }

    const [meteo, nominatim, storedPlaces] = await Promise.all([
      searchOpenMeteo(q),
      searchNominatim(q),
      loadStoredPlaces(),
    ]);

    const qLower = q.toLowerCase();
    const storedMatches = storedPlaces.filter(
      (item) =>
        item.name.toLowerCase().includes(qLower) ||
        item.region.toLowerCase().includes(qLower),
    );

    const merged: GeocodePlace[] = [];
    for (const candidate of [...storedMatches, ...nominatim, ...meteo]) {
      const duplicate = merged.some(
        (m) => Math.hypot(m.lon - candidate.lon, m.lat - candidate.lat) < 0.08,
      );
      if (!duplicate) merged.push(candidate);
      if (merged.length >= 6) break;
    }

    return json({ results: merged.slice(0, 5) });
  }

  if (lonParam !== null && latParam !== null) {
    const lon = Number(lonParam);
    const lat = Number(latParam);
    if (!Number.isFinite(lon) || !Number.isFinite(lat) || lon < -180 || lon > 180 || lat < -90 || lat > 90) {
      return problem(400, "invalid_request", "lon and lat must be valid WGS84 coordinates");
    }
    const result = await reverseGeocode(lon, lat);
    return json({ result, results: [result] });
  }

  return problem(400, "invalid_request", "Provide ?q=<query> or ?lon=<lon>&lat=<lat>");
}
