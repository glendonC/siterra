// The catchment outline as the instruments draw it: the frozen analysis geometry's outer ring (GeoJSON, WGS 84
// degrees) in the model frame's UTM metres (the case's zone), to 0.1 m, as the catchment fixture holds it.

import { lonLatToUtm } from "./utm";

const tenth = (v: number) => Math.round(v * 10) / 10;

/** The outer ring of the analysis geometry's one polygon, in metres of UTM zone `zone` north. */
export function outlineRing(geojson: unknown, zone: number): [number, number][] {
  const g = geojson as {
    features?: { geometry?: { type?: string; coordinates?: number[][][] } }[];
  };
  const geometry = g.features?.[0]?.geometry;
  const ring = geometry?.type === "Polygon" ? geometry.coordinates?.[0] : undefined;
  if (!ring || ring.length < 4) throw new Error("The analysis geometry holds no polygon ring");
  return ring.map(([lon, lat]) => {
    const [e, n] = lonLatToUtm(lon ?? Number.NaN, lat ?? Number.NaN, zone);
    return [tenth(e), tenth(n)];
  });
}
