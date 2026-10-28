// The few GeoJSON shapes the stage uses (RFC 7946), so the app needs no extra types package.

export type Position = [number, number] | [number, number, number];

export interface Polygon {
  type: "Polygon";
  coordinates: Position[][];
}

export interface MultiPolygon {
  type: "MultiPolygon";
  coordinates: Position[][][];
}

export interface Feature<G extends Polygon | MultiPolygon = Polygon | MultiPolygon> {
  type: "Feature";
  properties: Record<string, unknown> | null;
  geometry: G;
}
