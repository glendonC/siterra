import { describe, expect, it } from "vitest";
import { parseGlobeManifest } from "./manifest";

const raw = {
  worldElevation: "globe/e.bin",
  worldLand: "globe/l.bin",
  worldSize: [4500, 2250],
  terrainTiles: "https://tiles.example.org/{z}/{x}/{y}.webp",
  biomes: "globe/b.png",
  hillshade: "globe/h.png",
};

describe("parseGlobeManifest", () => {
  it("resolves relative URLs and keeps the tile template", () => {
    const m = parseGlobeManifest(raw, "http://127.0.0.1:4371/globe-manifest.json");
    expect(m.worldElevation).toBe("http://127.0.0.1:4371/globe/e.bin");
    expect(m.terrainTiles).toBe("https://tiles.example.org/{z}/{x}/{y}.webp");
    expect(m.worldSize).toEqual([4500, 2250]);
  });

  it("reads the gzip flag and the regional patches the tiles cover", () => {
    const m = parseGlobeManifest(
      {
        ...raw,
        gzip: true,
        regions: [{ id: "morocco", z: 6, box: [-11.25, 27.06, -5.625, 31.95] }],
      },
      "http://x/",
    );
    expect(m.gzip).toBe(true);
    expect(m.regions).toEqual([{ id: "morocco", z: 6, box: [-11.25, 27.06, -5.625, 31.95] }]);
  });

  it("refuses a manifest without the grid size", () => {
    expect(() => parseGlobeManifest({ ...raw, worldSize: [4500] }, "http://x/")).toThrow(/size/);
  });
});
