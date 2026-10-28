// The map asset manifest: where the terrain, the imagery and the catchment outline are served from, with
// their attributions. It is data served beside the assets (ADR-0018 self-hosting), so the app holds no URLs.

import type { RasterAsset, ValleyAssets } from "./daylight-style";
import type { Feature } from "./geo";

export interface AssetManifest {
  terrain: ValleyAssets["terrain"];
  imageryOuter: RasterAsset;
  imageryInner: RasterAsset;
  imageryAttribution: string;
  /** URL of the catchment outline (GeoJSON Feature or a FeatureCollection with one feature). */
  catchment: string;
}

function isString(v: unknown): v is string {
  return typeof v === "string" && v.length > 0;
}

function isRaster(v: unknown): v is RasterAsset {
  if (!v || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  if (r.kind === "tiles")
    return Array.isArray(r.tiles) && r.tiles.every(isString) && typeof r.maxzoom === "number";
  if (r.kind === "image")
    return isString(r.url) && Array.isArray(r.coordinates) && r.coordinates.length === 4;
  return false;
}

/** Checks a manifest's shape and resolves relative URLs against the manifest's own URL. */
export function parseManifest(raw: unknown, base: string): AssetManifest {
  const m = (raw ?? {}) as Record<string, unknown>;
  const terrain = m.terrain as Record<string, unknown> | undefined;
  if (
    !terrain ||
    !Array.isArray(terrain.tiles) ||
    !terrain.tiles.every(isString) ||
    !isString(terrain.attribution)
  )
    throw new Error("Asset manifest: terrain needs tiles and an attribution");
  if (!isRaster(m.imageryOuter) || !isRaster(m.imageryInner))
    throw new Error("Asset manifest: imagery needs tiles or an image with 4 corners");
  if (!isString(m.imageryAttribution) || !isString(m.catchment))
    throw new Error("Asset manifest: imagery attribution and catchment URL are required");
  // resolved against the manifest; tile templates keep their {z}/{x}/{y} braces unencoded
  const abs = (u: string) =>
    /^https?:/.test(u)
      ? u
      : new URL(u, base).toString().replace(/%7B/gi, "{").replace(/%7D/gi, "}");
  const raster = (r: RasterAsset): RasterAsset =>
    r.kind === "tiles" ? { ...r, tiles: r.tiles.map(abs) } : { ...r, url: abs(r.url) };
  return {
    terrain: {
      tiles: terrain.tiles.map(abs),
      tileSize: typeof terrain.tileSize === "number" ? terrain.tileSize : 512,
      maxzoom: typeof terrain.maxzoom === "number" ? terrain.maxzoom : 11,
      attribution: terrain.attribution,
    },
    imageryOuter: raster(m.imageryOuter),
    imageryInner: raster(m.imageryInner),
    imageryAttribution: m.imageryAttribution,
    catchment: abs(m.catchment),
  };
}

/** The first polygon feature of a GeoJSON document. */
export function catchmentFeature(doc: unknown): Feature {
  type Loose = { type?: string; features?: unknown[]; geometry?: { type?: string } };
  const d = (doc ?? {}) as Loose;
  const f = (d.type === "FeatureCollection" ? d.features?.[0] : d) as Loose | undefined;
  const t = f?.geometry?.type;
  if (t !== "Polygon" && t !== "MultiPolygon")
    throw new Error("Catchment: expected a polygon feature");
  return f as unknown as Feature;
}
