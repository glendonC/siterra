import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { instrumentOf } from "../listing";
import { bundleFiles, seed, seedListing } from "../seed-listing";
import { loadCutawayData, placesSchema } from "./cutaway-data";
import { catchmentSchema, figuresSchema, riversSchema, snowSchema } from "./fixtures";
import { cutawayTransectSchema } from "./transect";

// The cutaway read from the case draws what the fixtures drew: the section line, band trends, snow shares and
// outline built from the cross section spec's assets equal the committed fixtures.

const VALLEY = join(import.meta.dirname, "..", "..", "..", "public", "instruments", "valley");
const fixture = (name: string): unknown => JSON.parse(readFileSync(join(VALLEY, name), "utf8"));
const BASE = "/fixtures/";
const serve = (url: string) =>
  url.startsWith(BASE)
    ? Promise.resolve(new Response(readFileSync(join(VALLEY, url.slice(BASE.length)))))
    : bundleFiles(url);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("loadCutawayData", () => {
  it("builds the fixtures' section line, figures, snow and outline from the case", async () => {
    vi.stubGlobal("fetch", serve);
    const view = instrumentOf(seedListing, "cross_section");
    if (view === undefined) throw new Error("no cross section in the seed");
    const d = await loadCutawayData(view, seed, BASE, serve);
    expect(d.transect).toEqual(cutawayTransectSchema.parse(fixture("transect.json")));
    expect(d.figures.season_trend).toEqual(
      figuresSchema.parse(fixture("figures.json")).season_trend,
    );
    expect(d.snow).toEqual(snowSchema.parse(fixture("snow.json")));
    expect(d.catchment.ring).toEqual(catchmentSchema.parse(fixture("catchment.json")).ring);
    // the place is the case's own Tabant, as places.json copied it
    expect(d.places.places).toEqual(placesSchema.parse(fixture("places.json")).places);
  });

  it("draws the case's drainage features: the fixture's 233 reaches, vertex for vertex", async () => {
    vi.stubGlobal("fetch", serve);
    const view = instrumentOf(seedListing, "cross_section");
    if (view === undefined) throw new Error("no cross section in the seed");
    const d = await loadCutawayData(view, seed, BASE, serve);
    const old = riversSchema.parse(fixture("rivers.json"));
    const byOrder = (r: { reaches: { order: number }[] }) =>
      [1, 2, 3, 4, 5].map((o) => r.reaches.filter((x) => x.order === o).length);
    expect(d.rivers.reaches).toHaveLength(233);
    expect(byOrder(d.rivers)).toEqual(byOrder(old));
    // every fixture reach is a case reach of the same order, vertex for vertex within the 0.1 m both round to
    const near = (p: number[], q: number[]) =>
      p.every((v, i) => Math.abs(v - (q[i] ?? Infinity)) <= 0.1 + 1e-6);
    for (const r of old.reaches) {
      const match = d.rivers.reaches.find(
        (g) =>
          g.order === r.order &&
          g.pts.length === r.pts.length &&
          g.pts.every((q, i) => near(q, r.pts[i] ?? [])),
      );
      expect(match, JSON.stringify(r.pts[0])).toBeDefined();
    }
  });
});
