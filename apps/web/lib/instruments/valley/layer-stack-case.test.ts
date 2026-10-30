import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { instrumentOf } from "../listing";
import { bundleFiles, seed, seedListing } from "../seed-listing";
import { catchmentSchema, rainCellsSchema, snowSchema } from "./fixtures";
import { loadLayerStackData } from "./layer-stack-data";

// The layer stack read from the case draws what the fixtures drew: the outline, the rainfall sheet's cells and the
// snow sheet's shares built from the layer stack spec's assets equal the committed fixtures.

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

describe("loadLayerStackData", () => {
  it("builds the fixtures' outline, rain cells and snow from the case", async () => {
    vi.stubGlobal("fetch", serve);
    const view = instrumentOf(seedListing, "layer_stack");
    if (view === undefined) throw new Error("no layer stack in the seed");
    const d = await loadLayerStackData(view, seed, BASE, serve);
    expect(d.catchment.ring).toEqual(catchmentSchema.parse(fixture("catchment.json")).ring);
    expect(d.rain).toEqual(rainCellsSchema.parse(fixture("rain-cells.json")));
    expect(d.snow).toEqual(snowSchema.parse(fixture("snow.json")));
    expect(d.rivers.reaches).toHaveLength(233);
  });
});
