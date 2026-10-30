import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { catchmentSchema } from "../valley/fixtures";
import { instrumentOf } from "../listing";
import { bundleFiles, seedListing } from "../seed-listing";
import { loadCasePixel } from "./case";
import { pixelSchema } from "./data";

// The pixel anatomy read from the case is the page the fixture drew: the same builder on the same bundle files,
// reached through the pixel anatomy spec's assets instead of the fixture's copy.

const WEB = join(import.meta.dirname, "..", "..", "..");
const fixture = (path: string): unknown =>
  JSON.parse(readFileSync(join(WEB, "public", "instruments", path), "utf8"));

describe("loadCasePixel", () => {
  it("builds the fixture's pixel and outline from the spec's assets", async () => {
    const view = instrumentOf(seedListing, "pixel_anatomy");
    if (view === undefined) throw new Error("no pixel anatomy in the seed");
    const { pixel, ring, zone } = await loadCasePixel(view, bundleFiles);
    // the zone is the pixel cells' own CRS (EPSG:32629), not a constant
    expect(zone).toBe(29);
    expect(pixel).toEqual(pixelSchema.parse(fixture("pixel/pixel.json")));
    expect(ring).toEqual(catchmentSchema.parse(fixture("valley/catchment.json")).ring);
  });
});
