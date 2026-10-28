// The globe's asset manifest, served beside the assets like the valley's (assets.ts).

import type { GlobeAssets } from "./grids";

const isString = (v: unknown): v is string => typeof v === "string" && v.length > 0;

export function parseGlobeManifest(raw: unknown, base: string): GlobeAssets {
  const m = (raw ?? {}) as Record<string, unknown>;
  const size = m.worldSize;
  if (
    !isString(m.worldElevation) ||
    !isString(m.worldLand) ||
    !isString(m.terrainTiles) ||
    !isString(m.biomes) ||
    !isString(m.hillshade) ||
    !Array.isArray(size) ||
    size.length !== 2 ||
    !size.every((n) => Number.isInteger(n) && (n as number) > 0)
  )
    throw new Error(
      "Globe manifest: needs world grids with their size, terrain tiles, biomes and hillshade",
    );
  // resolved against the manifest; tile templates keep their {z}/{x}/{y} braces unencoded
  const abs = (u: string) =>
    /^https?:/.test(u)
      ? u
      : new URL(u, base).toString().replace(/%7B/gi, "{").replace(/%7D/gi, "}");
  return {
    worldElevation: abs(m.worldElevation),
    worldLand: abs(m.worldLand),
    worldSize: [size[0] as number, size[1] as number],
    terrainTiles: abs(m.terrainTiles),
    biomes: abs(m.biomes),
    hillshade: abs(m.hillshade),
  };
}
