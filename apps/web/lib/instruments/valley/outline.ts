// The catchment outline as the instruments draw it: the frozen analysis geometry's outer ring (GeoJSON, WGS 84
// degrees) in the model frame's EPSG:32629 metres, to 0.1 m, as the catchment fixture holds it.

import { lonLatToUtm } from "./utm";

const ZONE = 29;
const tenth = (v: number) => Math.round(v * 10) / 10;

/** The outer ring of the analysis geometry's one polygon, in EPSG:32629 metres. */
export function outlineRing(geojson: unknown): [number, number][] {
  const g = geojson as {
    features?: { geometry?: { type?: string; coordinates?: number[][][] } }[];
  };
  const geometry = g.features?.[0]?.geometry;
  const ring = geometry?.type === "Polygon" ? geometry.coordinates?.[0] : undefined;
  if (!ring || ring.length < 4) throw new Error("The analysis geometry holds no polygon ring");
  return ring.map(([lon, lat]) => {
    const [e, n] = lonLatToUtm(lon ?? Number.NaN, lat ?? Number.NaN, ZONE);
    return [tenth(e), tenth(n)];
  });
}
