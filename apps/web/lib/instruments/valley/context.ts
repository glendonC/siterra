// The valley instruments' rivers and named places from the case's context features, as the specs name them
// (drainageFeatureIds, placeFeatureIds): drainage lines by stream order with the heights they carry, and the
// settlements, in the model frame's UTM metres (the case's zone) to 0.1 m.

import type { CaseSnapshot } from "@siterra/contracts";
import type { Rivers } from "./fixtures";
import { lonLatToUtm } from "./utm";

const tenth = (v: number) => Math.round(v * 10) / 10;

type Feature = NonNullable<CaseSnapshot["records"]["contextFeatureRecords"]>[number];

function features(snapshot: CaseSnapshot, ids: readonly string[]): Feature[] {
  const all = snapshot.records.contextFeatureRecords ?? [];
  return ids.map((id) => {
    const f = all.find((x) => x.id === id);
    if (!f) throw new Error(`The case has no context feature ${id}`);
    return f;
  });
}

/** Each drainage feature's lines as reaches of its stream order, every vertex with its height (m). */
export function riversFrom(snapshot: CaseSnapshot, ids: readonly string[], zone: number): Rivers {
  const reaches = features(snapshot, ids).flatMap((f) => {
    const order = f.streamOrder;
    const g = f.geometry as { type: string; coordinates: number[][][] };
    if (order === undefined || g.type !== "MultiLineString")
      throw new Error(`${f.id} is not a drainage line with a stream order`);
    return g.coordinates.map((line) => ({
      order,
      pts: line.map(([lon, lat, h]): [number, number, number] => {
        const [e, n] = lonLatToUtm(lon ?? Number.NaN, lat ?? Number.NaN, zone);
        return [tenth(e), tenth(n), h ?? Number.NaN];
      }),
    }));
  });
  return { reaches };
}

export interface Place {
  id: string;
  name: string;
  role: string;
  lonLat: [number, number];
  attribution: string;
  license: string;
}

/** The settlements among the named features, with the attribution their source requires. */
export function placesFrom(snapshot: CaseSnapshot, ids: readonly string[]): Place[] {
  return features(snapshot, ids)
    .filter((f) => f.role === "settlement" && f.geometry.type === "Point")
    .map((f) => {
      const [lon, lat] = f.geometry.coordinates as number[];
      // a named place is shown only with the credit its source requires
      if (f.attribution === null || f.license === null)
        throw new Error(`${f.id} has no attribution or licence`);
      return {
        id: f.id,
        name: f.name,
        role: f.role,
        lonLat: [lon ?? Number.NaN, lat ?? Number.NaN],
        attribution: f.attribution,
        license: f.license,
      };
    });
}
