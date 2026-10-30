import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { seed } from "../instruments/seed-listing";
import {
  inBundleOrder,
  loadRoutesRecord,
  parseRouteLines,
  parseRouteSummary,
  roundTo,
  routeFigures,
  routesFrom,
  splitName,
} from "./routes";

// The routes come from the case's context features; their figures from the bundle's route_lines, rounded once.

const B = new URL(
  "../../../../data/bundles/bundle_proposed_routes_ait_bouguemez/",
  import.meta.url,
);
const linesBytes = readFileSync(new URL("proposed-routes.geojson", B));
const summaryBytes = readFileSync(new URL("proposed-routes.json", B));
const lines = JSON.parse(linesBytes.toString("utf8")) as unknown;
const summary = JSON.parse(summaryBytes.toString("utf8")) as unknown;
const tag = (b: Buffer) => `"1220${createHash("sha256").update(b).digest("hex")}"`;

describe("routesFrom", () => {
  it("reads the case's four route_proposed features with their vertices and bundle lines", () => {
    const routes = routesFrom(seed);
    expect(routes.map((r) => r.member).sort()).toEqual([
      "route_tabant_band_1",
      "route_tabant_band_2",
      "route_tabant_band_3",
      "route_tabant_pixel_h17v05r4005c2178",
    ]);
    expect(routes.map((r) => r.pts.length).sort((a, b) => a - b)).toEqual([14, 14, 107, 196]);
    for (const r of routes) {
      expect(r.bundleId).toBe("bundle_proposed_routes_ait_bouguemez");
      expect(r.assetKey).toBe("route_lines");
      expect(r.end).toBe("Candidate site chosen by a stated rule");
      // every line starts at Tabant's node; heights are the record's
      expect(r.pts[0]?.[2]).toBe(1858.1);
    }
    expect(routes.find((r) => r.member.includes("pixel"))?.title).toBe(
      "Proposed route to the pixel the case opens",
    );
    expect(routes.find((r) => r.member === "route_tabant_band_2")?.title).toBe(
      "Proposed route to elevation band 2",
    );
  });

  it("draws no route the case does not hold", () => {
    const none = {
      ...seed,
      records: {
        ...seed.records,
        contextFeatureRecords: (seed.records.contextFeatureRecords ?? []).filter(
          (f) => f.role !== "route_proposed",
        ),
      },
    };
    expect(routesFrom(none)).toEqual([]);
  });

  it("splits a name at its parenthesis", () => {
    expect(splitName("Route A (candidate site)")).toEqual({
      title: "Route A",
      end: "Candidate site",
    });
    expect(splitName("Route A")).toEqual({ title: "Route A", end: "" });
  });
});

describe("the bundle's figures", () => {
  const routes = routesFrom(seed);

  it("reads length, climb and time of every drawn route from route_lines", () => {
    const { facts, order } = parseRouteLines(lines, routes);
    expect(order[0]).toBe("route_tabant_pixel_h17v05r4005c2178");
    expect(facts.get("route_tabant_band_3")).toEqual({
      lengthM: 6558.3,
      climbM: 1057.3,
      timeH: 4.186,
    });
    expect(inBundleOrder(routes, order).map((r) => r.member)).toEqual(order);
  });

  it("refuses route_lines without a drawn route or a figure", () => {
    const fc = lines as { features: { properties: Record<string, unknown> }[] };
    const missing = { ...fc, features: fc.features.slice(1) };
    expect(() => parseRouteLines(missing, routes)).toThrow(/no line/);
    const noTime = {
      ...fc,
      features: fc.features.map((f) => ({ ...f, properties: { ...f.properties, time_h: null } })),
    };
    expect(() => parseRouteLines(noTime, routes)).toThrow(/time_h/);
  });

  it("names the cost function from the summary, without the source code", () => {
    expect(parseRouteSummary(summary)).toEqual({
      name: "Tobler's hiking function",
      offPath: 0.6,
      time: "horizontal length over speed, one way, no load, no rest",
      not: "not a surveyed path, not a track on the ground, not a safe or permitted route",
      origin: "Tabant",
      originId: "ctx_tabant",
    });
  });

  it("rounds each stored figure once", () => {
    const { facts } = parseRouteLines(lines, routes);
    const shown = (id: string) =>
      routeFigures(facts.get(id) ?? { lengthM: 0, climbM: 0, timeH: 0 });
    expect(shown("route_tabant_pixel_h17v05r4005c2178")).toEqual({
      length: "550 m",
      climb: "20 m",
      time: "12 min",
    });
    expect(shown("route_tabant_band_1")).toEqual({
      length: "500 m",
      climb: "130 m",
      time: "24 min",
    });
    expect(shown("route_tabant_band_2")).toEqual({
      length: "3.9 km",
      climb: "560 m",
      time: "2 h 20 min",
    });
    expect(shown("route_tabant_band_3")).toEqual({
      length: "6.6 km",
      climb: "1,060 m",
      time: "4 h 10 min",
    });
    expect(roundTo(125, 10)).toBe(130);
    expect(roundTo(-125, 10)).toBe(-130);
    expect(routeFigures({ lengthM: 0, climbM: 0, timeH: 1 }).time).toBe("1 h");
  });
});

describe("loadRoutesRecord", () => {
  const routes = routesFrom(seed);
  const serve =
    (over: Partial<Record<string, { bytes: Buffer; etag: string }>> = {}) =>
    (url: string) => {
      const key = url.split("/").pop() ?? "";
      const files: Record<string, { bytes: Buffer; etag: string }> = {
        route_lines: { bytes: linesBytes, etag: tag(linesBytes) },
        proposed_routes: { bytes: summaryBytes, etag: tag(summaryBytes) },
      };
      const f = over[key] ?? files[key];
      return Promise.resolve(
        f
          ? new Response(new Uint8Array(f.bytes), { headers: { etag: f.etag } })
          : new Response(null, { status: 404 }),
      );
    };

  it("reads both assets through the case's bundle asset route", async () => {
    const seen: string[] = [];
    const rec = await loadRoutesRecord("case_x", routes, (u) => {
      seen.push(u);
      return serve()(u);
    });
    expect(seen.sort()).toEqual([
      "/api/cases/case_x/bundles/bundle_proposed_routes_ait_bouguemez/assets/proposed_routes",
      "/api/cases/case_x/bundles/bundle_proposed_routes_ait_bouguemez/assets/route_lines",
    ]);
    expect(rec.facts.size).toBe(4);
    expect(rec.cost.origin).toBe("Tabant");
  });

  it("refuses bytes whose checksum is not the one served", async () => {
    await expect(
      loadRoutesRecord(
        "case_x",
        routes,
        serve({ route_lines: { bytes: linesBytes, etag: tag(summaryBytes) } }),
      ),
    ).rejects.toThrow(/checksum/);
  });

  it("refuses a case without a route", async () => {
    await expect(loadRoutesRecord("case_x", [], serve())).rejects.toThrow(/no proposed route/);
  });
});
