import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { instrumentOf } from "../listing";
import { bundleFiles, seed, seedListing } from "../seed-listing";
import { loadCutawayData } from "./cutaway-data";
import { catchmentSchema, figuresSchema, snowSchema } from "./fixtures";
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
  });
});
