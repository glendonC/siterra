// The dive's end and the arrival view for any land: the approved arrival pose (hero approved 27 Oct 2026, measured
// on the Aït Bouguemez catchment) written relative to that land, so another catchment is arrived at the same way.
// The camera keeps its bearing to the land's long axis, its elevation and field of view; its target keeps its place
// against the outline's centre (turned with the bearing, scaled with the land); its distance scales with the land;
// its target height follows the record's elevation band limits (the journey has no relief before the case opens).

import type { OrbitPose } from "../stage/camera";
import { extentKm, longAxisBearing } from "./geometry";

type LonLat = readonly (readonly number[])[];

/** The approved pose on the valley, against that land (its centre, long axis and band limits). */
const HERO = {
  /** Bearing less the long axis as measured here (in km from the centre: 57.31 on the valley). */
  bearingOff: 75.69,
  elevationDeg: 36,
  verticalFovDeg: 22,
  /** Target against the outline's centre (km east, km north), turned back by the hero's bearing (133). */
  targetAt: [-1.0838, 0.8193] as const,
  bearing: 133,
  /** Distance (m) on a land as large as the valley (diagonal 47.9 km). */
  distanceM: 73388.7,
  extentKm: 47.9,
  /** Target height (m, true) as the upper limit plus this share of the band between the limits. */
  overUpper: 0.6792,
  /** The arrival view's vertical exaggeration, which the target height is drawn in. */
  exaggeration: 2,
} as const;

const KM_PER_DEG_LAT = 110.574;
const kmPerDegLon = (lat: number) => 111.32 * Math.cos((lat * Math.PI) / 180);

/** The outline's centre: the mean of its vertices, the first counted once when the ring closes. */
export function centreOf(ring: LonLat): { lon: number; lat: number } {
  const [first] = ring;
  const last = ring[ring.length - 1];
  const pts =
    ring.length > 1 && first && last && first[0] === last[0] && first[1] === last[1]
      ? ring.slice(0, -1)
      : ring;
  const n = pts.length || 1;
  return {
    lon: pts.reduce((s, p) => s + (p[0] ?? 0), 0) / n,
    lat: pts.reduce((s, p) => s + (p[1] ?? 0), 0) / n,
  };
}

/** (east, north) km turned by a bearing (degrees clockwise). */
function turn([e, n]: readonly [number, number], deg: number): [number, number] {
  const r = (deg * Math.PI) / 180;
  return [e * Math.cos(r) + n * Math.sin(r), -e * Math.sin(r) + n * Math.cos(r)];
}

/** The arrival pose for an outline in degrees (lon, lat) and the record's two band limits (m), when it has them. */
export function arrivalPose(ring: LonLat, limits: readonly [number, number] | null): OrbitPose {
  const c = centreOf(ring);
  const kx = kmPerDegLon(c.lat);
  const km = ring.map(([lon, lat]) => [
    ((lon ?? 0) - c.lon) * kx,
    ((lat ?? 0) - c.lat) * KM_PER_DEG_LAT,
  ]);
  const scale = extentKm(km.map(([e, n]) => [(e ?? 0) * 1000, (n ?? 0) * 1000])) / HERO.extentKm;
  const bearing = (longAxisBearing(km) + HERO.bearingOff) % 360;
  const [de, dn] = turn(turn(HERO.targetAt, -HERO.bearing), bearing);
  const [lower, upper] = limits ?? [0, 0];
  return {
    target: { lon: c.lon + (de * scale) / kx, lat: c.lat + (dn * scale) / KM_PER_DEG_LAT },
    targetHeightM: HERO.exaggeration * (upper + HERO.overUpper * (upper - lower)),
    cameraBearingFromTargetDeg: bearing,
    elevationDeg: HERO.elevationDeg,
    distanceM: HERO.distanceM * scale,
    verticalFovDeg: HERO.verticalFovDeg,
  };
}
