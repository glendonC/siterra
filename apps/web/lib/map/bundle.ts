// The map bundle (SCIENCE's data/map/), read from the application's own origin: GET /api/map-assets
// answers 307 to /api/map-assets/<version>/manifest.json, and every path the manifest lists is resolved
// against that versioned URL (ADR-0018 self-hosting; PLATFORM unit 20). The valley's terrain and the
// globe's grids, relief and biomes come from the layers it lists; the extent of the terrain and the globe's
// regional patches follow the tiles it actually has, so nothing asks for a tile that is not there.

import type { GlobeAssets, Region } from "../globe/grids";
import type { Corners, ValleyAssets } from "../stage/daylight-style";

/** Where the browser asks for the map bundle: the app's own origin, nothing else. */
export const MAP_BUNDLE_URL = "/api/map-assets";

export interface MapBundle {
  /** The valley's assets, without the haze picture the client draws itself. */
  valley: Omit<ValleyAssets, "haze">;
  /**
   * Where contour lines can be made: maplibre-contour builds a contour tile from the terrain tile and its 8
   * neighbours, so only zooms from `minzoom` up, inside the box where every neighbour is listed.
   */
  contours?: { minzoom: number; bounds: [number, number, number, number] };
  globe: GlobeAssets;
}

interface ListedFile {
  path: string;
}

interface Layer {
  credit?: unknown;
  files: ListedFile[];
}

/** Zooms of the globe's regional terrain patches (grids.ts): the country, then the range. */
const REGION_ZOOMS = [6, 8] as const;

const TILE = /^terrain\/(\d+)\/(\d+)\/(\d+)\.webp$/;

function layers(raw: unknown): Record<string, Layer> {
  const m = (raw ?? {}) as { bundle?: unknown; layers?: unknown };
  if (m.bundle !== "siterra-map" || !m.layers || typeof m.layers !== "object")
    throw new Error("Map bundle: not a siterra-map manifest");
  return m.layers as Record<string, Layer>;
}

function layer(all: Record<string, Layer>, id: string): Layer {
  const l = all[id];
  if (!l || !Array.isArray(l.files)) throw new Error(`Map bundle: no ${id} layer`);
  return l;
}

function file(l: Layer, pattern: RegExp, what: string): string {
  const f = l.files.find((x) => pattern.test(x.path));
  if (!f) throw new Error(`Map bundle: no ${what}`);
  return f.path;
}

const lonOf = (x: number, z: number) => (x / 2 ** z) * 360 - 180;
const latOf = (y: number, z: number) =>
  (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / 2 ** z))) * 180) / Math.PI;

/** West, south, east, north of the listed tiles at one zoom, or undefined when there are none. */
function tileBox(
  tiles: { z: number; x: number; y: number }[],
  z: number,
): [number, number, number, number] | undefined {
  const at = tiles.filter((t) => t.z === z);
  if (at.length === 0) return undefined;
  const xs = at.map((t) => t.x);
  const ys = at.map((t) => t.y);
  return [
    lonOf(Math.min(...xs), z),
    latOf(Math.max(...ys) + 1, z),
    lonOf(Math.max(...xs) + 1, z),
    latOf(Math.min(...ys), z),
  ];
}

/** The imagery picture and its corners file (valley-imagery: a .webp and a .webp.json beside it). */
export function imageryFiles(raw: unknown): { image: string; corners: string } | undefined {
  const l = layers(raw)["valley-imagery"];
  if (!l || !Array.isArray(l.files)) return undefined;
  const image = l.files.find((f) => /\.webp$/.test(f.path))?.path;
  const corners = l.files.find((f) => /\.webp\.json$/.test(f.path))?.path;
  return image && corners ? { image, corners } : undefined;
}

function isCorners(v: unknown): v is Corners {
  return (
    Array.isArray(v) &&
    v.length === 4 &&
    v.every((p) => Array.isArray(p) && p.length === 2 && p.every((n) => typeof n === "number"))
  );
}

/** Lowest zoom the contours are made at: the arrival's zoom is about 10.9. */
const CONTOUR_MINZOOM = 10;

/** The box of the listed tiles at one zoom whose 8 neighbours are all listed. */
function interiorBox(
  tiles: { z: number; x: number; y: number }[],
  z: number,
): [number, number, number, number] | undefined {
  const at = new Set(tiles.filter((t) => t.z === z).map((t) => `${String(t.x)}/${String(t.y)}`));
  const inner = tiles.filter((t) => {
    if (t.z !== z) return false;
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        if (!at.has(`${String(t.x + dx)}/${String(t.y + dy)}`)) return false;
    return true;
  });
  return tileBox(inner, z);
}

function intersect(
  a: [number, number, number, number],
  b: [number, number, number, number],
): [number, number, number, number] | undefined {
  const box: [number, number, number, number] = [
    Math.max(a[0], b[0]),
    Math.max(a[1], b[1]),
    Math.min(a[2], b[2]),
    Math.min(a[3], b[3]),
  ];
  return box[0] < box[2] && box[1] < box[3] ? box : undefined;
}

/**
 * Checks the bundle's shape and resolves its paths against the versioned manifest URL. The imagery is
 * draped only when its layer is listed and its corners file was read (`imageryCorners`).
 */
export function parseMapBundle(raw: unknown, base: string, imageryCorners?: unknown): MapBundle {
  const all = layers(raw);
  // tile templates keep their {z}/{x}/{y} braces unencoded
  const abs = (p: string) =>
    new URL(p, base).toString().replace(/%7B/gi, "{").replace(/%7D/gi, "}");

  const terrain = layer(all, "valley-terrain");
  const tiles = terrain.files.flatMap((f) => {
    const t = TILE.exec(f.path);
    return t ? [{ z: Number(t[1]), x: Number(t[2]), y: Number(t[3]) }] : [];
  });
  if (tiles.length === 0) throw new Error("Map bundle: the valley terrain lists no tiles");
  // the top zoom may cover only an inner extent (SCIENCE 22: z12 over the asset extent, a ring of z11
  // round it); then the terrain stops one zoom lower over the whole ring, so no tile is asked for that
  // the bundle lacks (MapLibre would draw it grey)
  const top = Math.max(...tiles.map((t) => t.z));
  const topBox = tileBox(tiles, top);
  const belowBox = tileBox(tiles, top - 1);
  const inner =
    topBox !== undefined &&
    belowBox !== undefined &&
    (topBox[0] > belowBox[0] ||
      topBox[1] > belowBox[1] ||
      topBox[2] < belowBox[2] ||
      topBox[3] < belowBox[3]);
  const maxzoom = inner ? top - 1 : top;
  const bounds = inner ? belowBox : topBox;

  const dots = layer(all, "globe-dots");
  const elevation = file(dots, /dots-elevation-.*\.int16le\.bin\.gz$/, "elevation grid");
  const size = /-(\d+)x(\d+)\./.exec(elevation);
  if (!size) throw new Error("Map bundle: the elevation grid's name gives no size");

  const files = imageryFiles(raw);
  const imageryLayer = all["valley-imagery"];
  const imagery =
    files && isCorners(imageryCorners)
      ? {
          image: files.image,
          corners: imageryCorners,
          attribution: typeof imageryLayer?.credit === "string" ? imageryLayer.credit : "",
        }
      : undefined;

  // the contour box: every zoom the contours read terrain at, from CONTOUR_MINZOOM to the terrain's top
  let contourBox: [number, number, number, number] | undefined = [-180, -85, 180, 85];
  for (let z = CONTOUR_MINZOOM; z <= maxzoom && contourBox; z++) {
    const box = interiorBox(tiles, z);
    contourBox = box ? intersect(contourBox, box) : undefined;
  }

  const regions: Region[] = REGION_ZOOMS.flatMap((z) => {
    const box = tileBox(tiles, z);
    return box ? [{ id: `z${String(z)}`, z, box }] : [];
  });

  return {
    valley: {
      terrain: {
        tiles: [abs("terrain/{z}/{x}/{y}.webp")],
        tileSize: 512,
        maxzoom,
        attribution: typeof terrain.credit === "string" ? terrain.credit : "",
        ...(bounds ? { bounds } : {}),
      },
      ...(imagery
        ? {
            imagery: {
              image: {
                kind: "image" as const,
                url: abs(imagery.image),
                coordinates: imagery.corners,
              },
              attribution: imagery.attribution,
            },
          }
        : {}),
    },
    ...(contourBox ? { contours: { minzoom: CONTOUR_MINZOOM, bounds: contourBox } } : {}),
    globe: {
      worldElevation: abs(elevation),
      worldLand: abs(file(dots, /dots-land-.*\.uint8\.bin\.gz$/, "land grid")),
      worldSize: [Number(size[1]), Number(size[2])],
      gzip: true,
      terrainTiles: abs("terrain/{z}/{x}/{y}.webp"),
      biomes: abs(file(layer(all, "rangeland-biomes"), /rangeland-fraction-.*\.png$/, "biomes")),
      hillshade: abs(
        file(layer(all, "globe-relief"), /relief-hillshade-8192x4096\.png$/, "relief"),
      ),
      ...(regions.length === 2 ? { regions } : {}),
    },
  };
}

/** Fetches the bundle's manifest through the app's redirect and parses it against the URL it landed on. */
export async function loadMapBundle(
  fetchImpl: (input: string) => Promise<Response>,
): Promise<MapBundle> {
  const res = await fetchImpl(MAP_BUNDLE_URL);
  if (!res.ok) throw new Error(`Map bundle: ${String(res.status)}`);
  const raw: unknown = await res.json();
  // the imagery's corners are in the file beside it; without them the land is the relief alone
  const files = imageryFiles(raw);
  let corners: unknown;
  if (files) {
    const c = await fetchImpl(new URL(files.corners, res.url).toString());
    if (c.ok) corners = ((await c.json()) as { coordinates?: unknown }).coordinates;
  }
  return parseMapBundle(raw, res.url, corners);
}
