import { describe, expect, it } from "vitest";
import { catchmentFeature, parseManifest } from "./assets";

const manifest = {
  terrain: {
    tiles: ["terrain/{z}/{x}/{y}.webp"],
    tileSize: 512,
    maxzoom: 11,
    attribution: "terrain notice",
  },
  imageryOuter: {
    kind: "image",
    url: "imagery/outer.png",
    coordinates: [
      [-6.8, 32],
      [-5.85, 31.98],
      [-5.88, 31.25],
      [-6.82, 31.27],
    ],
  },
  imageryInner: {
    kind: "tiles",
    tiles: ["https://example.org/i/{z}/{x}/{y}.webp"],
    tileSize: 256,
    maxzoom: 15,
  },
  imageryAttribution: "imagery notice",
  catchment: "catchment.geojson",
};

describe("parseManifest", () => {
  it("resolves relative URLs against the manifest and keeps absolute ones", () => {
    const m = parseManifest(manifest, "http://127.0.0.1:4371/assets/manifest.json");
    expect(m.terrain.tiles[0]).toBe("http://127.0.0.1:4371/assets/terrain/{z}/{x}/{y}.webp");
    expect(m.imageryOuter.kind === "image" && m.imageryOuter.url).toBe(
      "http://127.0.0.1:4371/assets/imagery/outer.png",
    );
    expect(m.imageryInner.kind === "tiles" && m.imageryInner.tiles[0]).toBe(
      "https://example.org/i/{z}/{x}/{y}.webp",
    );
    expect(m.catchment).toBe("http://127.0.0.1:4371/assets/catchment.geojson");
  });

  it("keeps the terrain's bounds, so no tile is requested outside the self-hosted extent", () => {
    const m = parseManifest(
      { ...manifest, terrain: { ...manifest.terrain, bounds: [-6.71, 31.33, -5.98, 31.92] } },
      "http://x/",
    );
    expect(m.terrain.bounds).toEqual([-6.71, 31.33, -5.98, 31.92]);
  });

  it("refuses a manifest without terrain attribution", () => {
    expect(() =>
      parseManifest({ ...manifest, terrain: { tiles: ["t/{z}/{x}/{y}.webp"] } }, "http://x/"),
    ).toThrow(/attribution/);
  });

  it("refuses an image without four corners", () => {
    expect(() =>
      parseManifest(
        { ...manifest, imageryOuter: { kind: "image", url: "a.png", coordinates: [[0, 0]] } },
        "http://x/",
      ),
    ).toThrow(/4 corners/);
  });
});

describe("catchmentFeature", () => {
  const polygon = {
    type: "Polygon",
    coordinates: [
      [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 0],
      ],
    ],
  };

  it("takes the first feature of a collection", () => {
    const f = catchmentFeature({
      type: "FeatureCollection",
      features: [{ type: "Feature", properties: {}, geometry: polygon }],
    });
    expect(f.geometry.type).toBe("Polygon");
  });

  it("refuses a point", () => {
    expect(() =>
      catchmentFeature({
        type: "Feature",
        properties: {},
        geometry: { type: "Point", coordinates: [0, 0] },
      }),
    ).toThrow();
  });
});
