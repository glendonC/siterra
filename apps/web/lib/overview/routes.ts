// The proposed walking routes on the overview (U12). The lines are the case's route_proposed context features, as
// the snapshot holds them (the overview draws rivers the same way); each feature names its bundle line
// (dataBundle.member). Length, climb and time are the bundle's route_lines properties (length_m, climb_m, time_h),
// read through the read API (GET /api/cases/:id/bundles/:bundleId/assets/:assetKey) and checked against the
// checksum it serves, then rounded once for the screen. The cost function is the proposed_routes summary's. Every
// line is a model estimate over a 30 m surface model: proposed, access unconfirmed.

import type { CaseSnapshot } from "@siterra/contracts";
import { lonLatToUtm } from "../instruments/valley/utm";

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;
type Feature = NonNullable<CaseSnapshot["records"]["contextFeatureRecords"]>[number];

const tenth = (v: number) => Math.round(v * 10) / 10;

export interface RouteLine {
  /** The context feature's id. */
  id: string;
  /** The route's id in the bundle's route_lines (the feature's dataBundle.member). */
  member: string;
  bundleId: string;
  assetKey: string;
  /** The record's name before its parenthesis: "Proposed route to elevation band 2". */
  title: string;
  /** The record's words for the end of the line: "Candidate site chosen by a stated rule". */
  end: string;
  /** Every vertex in the zone's UTM metres to 0.1 m, with the height the record carries (m). */
  pts: [number, number, number][];
}

/** The record's name split at its parenthesis: the route, then what its end is. */
export function splitName(name: string): { title: string; end: string } {
  const m = /^(.*?)\s*\((.+)\)\s*$/.exec(name);
  if (!m) return { title: name.trim(), end: "" };
  const end = (m[2] ?? "").trim();
  return { title: (m[1] ?? "").trim(), end: end.charAt(0).toUpperCase() + end.slice(1) };
}

/** The case's proposed routes, as its route_proposed context features hold them, in the record's order. */
export function routesFrom(snapshot: CaseSnapshot, zone: number): RouteLine[] {
  const all: Feature[] = snapshot.records.contextFeatureRecords ?? [];
  return all
    .filter((f) => f.role === "route_proposed")
    .map((f) => {
      const g = f.geometry as { type: string; coordinates: number[][] };
      const b = f.dataBundle;
      if (g.type !== "LineString") throw new Error(`${f.id} is not a line`);
      if (!b?.member) throw new Error(`${f.id} names no bundle line`);
      return {
        id: f.id,
        member: b.member,
        bundleId: b.bundleId,
        assetKey: b.assetKey,
        ...splitName(f.name),
        pts: g.coordinates.map(([lon, lat, h]): [number, number, number] => {
          const [e, n] = lonLatToUtm(lon ?? Number.NaN, lat ?? Number.NaN, zone);
          return [tenth(e), tenth(n), h ?? Number.NaN];
        }),
      };
    });
}

/** One route's figures as the bundle stores them. */
export interface RouteFacts {
  lengthM: number;
  climbM: number;
  timeH: number;
}

export interface RouteCost {
  /** The cost function's name, without its source code in parentheses: "Tobler's hiking function". */
  name: string;
  /** The off-path factor on Tobler's speed (0.6). */
  offPath: number;
  /** The summary's own words for how time is counted. */
  time: string;
  /** What the summary says a route is not. */
  not: string;
  /** Where every route starts: its name, and the context feature the summary names for it. */
  origin: string;
  originId: string;
}

export interface RoutesRecord {
  facts: Map<string, RouteFacts>;
  /** The bundle's order of its lines (route ids). */
  order: string[];
  cost: RouteCost;
}

const num = (o: Record<string, unknown>, k: string, where: string): number => {
  const v = o[k];
  if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`${where}: no number ${k}`);
  return v;
};
const str = (o: Record<string, unknown>, k: string, where: string): string => {
  const v = o[k];
  if (typeof v !== "string" || !v) throw new Error(`${where}: no text ${k}`);
  return v;
};
const obj = (v: unknown, where: string): Record<string, unknown> => {
  if (typeof v !== "object" || v === null || Array.isArray(v))
    throw new Error(`${where}: not an object`);
  return v as Record<string, unknown>;
};

/** The figures of each route the case draws, from route_lines; every drawn route must be there. */
export function parseRouteLines(
  json: unknown,
  routes: readonly RouteLine[],
): Pick<RoutesRecord, "facts" | "order"> {
  const fc = obj(json, "route_lines");
  if (fc["type"] !== "FeatureCollection" || !Array.isArray(fc["features"]))
    throw new Error("route_lines: not a FeatureCollection");
  const facts = new Map<string, RouteFacts>();
  const order: string[] = [];
  for (const f of fc["features"] as unknown[]) {
    const p = obj(obj(f, "route_lines feature")["properties"], "route_lines properties");
    const id = str(p, "route_id", "route_lines");
    order.push(id);
    facts.set(id, {
      lengthM: num(p, "length_m", id),
      climbM: num(p, "climb_m", id),
      timeH: num(p, "time_h", id),
    });
  }
  for (const r of routes)
    if (!facts.has(r.member)) throw new Error(`route_lines has no line ${r.member}`);
  return { facts, order };
}

/** The cost function, the origin and what a route is not, from the proposed_routes summary. */
export function parseRouteSummary(json: unknown): RouteCost {
  const s = obj(json, "proposed_routes");
  const cf = obj(s["cost_function"], "cost_function");
  const params = obj(cf["parameters"], "cost_function.parameters");
  return {
    name: str(cf, "name", "cost_function").replace(/\s*\([^)]*\)\s*$/, ""),
    offPath: num(params, "off_path_factor", "cost_function.parameters"),
    time: str(cf, "time", "cost_function"),
    not: str(s, "not", "proposed_routes"),
    origin: str(obj(s["origin"], "origin"), "name", "origin"),
    originId: str(obj(s["origin"], "origin"), "id", "origin"),
  };
}

const hex = (bytes: ArrayBuffer) =>
  Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");

/** One bundle asset through the read API, refused unless its sha256 is the checksum the API serves as its ETag. */
async function readCaseAsset(
  caseId: string,
  bundleId: string,
  assetKey: string,
  fetchImpl: Fetch,
  signal?: AbortSignal,
): Promise<unknown> {
  const url = `/api/cases/${encodeURIComponent(caseId)}/bundles/${encodeURIComponent(bundleId)}/assets/${encodeURIComponent(assetKey)}`;
  const res = await fetchImpl(url, { credentials: "same-origin", signal });
  if (!res.ok) throw new Error(`${bundleId} ${assetKey}: HTTP ${String(res.status)}`);
  const tag = (res.headers.get("etag") ?? "").replace(/^W\//, "").replace(/"/g, "");
  const bytes = await res.arrayBuffer();
  const digest = `1220${hex(await crypto.subtle.digest("SHA-256", bytes))}`;
  if (digest !== tag) throw new Error(`${bundleId} ${assetKey}: checksum differs`);
  return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
}

/** The routes' figures and cost function, read from the bundle the case's route features name. */
export async function loadRoutesRecord(
  caseId: string,
  routes: readonly RouteLine[],
  fetchImpl: Fetch = (input, init) => fetch(input, init),
  signal?: AbortSignal,
): Promise<RoutesRecord> {
  const first = routes[0];
  if (!first) throw new Error("The case has no proposed route");
  if (routes.some((r) => r.bundleId !== first.bundleId || r.assetKey !== first.assetKey))
    throw new Error("The routes name more than one bundle asset");
  const [lines, summary] = await Promise.all([
    readCaseAsset(caseId, first.bundleId, first.assetKey, fetchImpl, signal),
    readCaseAsset(caseId, first.bundleId, "proposed_routes", fetchImpl, signal),
  ]);
  return { ...parseRouteLines(lines, routes), cost: parseRouteSummary(summary) };
}

/** Half away from zero to a multiple of `step` (one rounding of the stored figure). */
export function roundTo(v: number, step: number): number {
  return Math.sign(v) * Math.round(Math.abs(v) / step) * step;
}

const thousands = new Intl.NumberFormat("en", { maximumFractionDigits: 1 });

/**
 * A route's figures for the screen, each from its stored value rounded once: length to 10 m under a kilometre and
 * to 0.1 km above; climb to 10 m (it carries surface noise); time in minutes (time_h times 60) to the minute under
 * an hour and to 5 minutes above.
 */
export function routeFigures(f: RouteFacts): { length: string; climb: string; time: string } {
  const length =
    f.lengthM < 1000
      ? `${thousands.format(roundTo(f.lengthM, 10))} m`
      : `${(roundTo(f.lengthM, 100) / 1000).toFixed(1)} km`;
  const climb = `${thousands.format(roundTo(f.climbM, 10))} m`;
  const minutes = f.timeH * 60;
  const m = minutes < 60 ? roundTo(minutes, 1) : roundTo(minutes, 5);
  const h = Math.floor(m / 60);
  const r = m - h * 60;
  const time =
    h === 0 ? `${String(r)} min` : r === 0 ? `${String(h)} h` : `${String(h)} h ${String(r)} min`;
  return { length, climb, time };
}

/** The routes in the bundle's order (the pixel the case opens first), when the bundle has been read. */
export function inBundleOrder(
  routes: readonly RouteLine[],
  order: readonly string[] | undefined,
): RouteLine[] {
  if (!order) return [...routes];
  const at = (r: RouteLine) => {
    const i = order.indexOf(r.member);
    return i < 0 ? order.length : i;
  };
  return [...routes].sort((a, b) => at(a) - at(b));
}
