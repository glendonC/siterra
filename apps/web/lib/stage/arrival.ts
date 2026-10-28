// The approved arrival view of the Aït Bouguemez catchment (hero approved 27 Oct 2026). These are design
// values for the view, not measurements. Place positions are fixture values until the case seed carries
// context feature records (contracts 1.3, scenes reference); the outlet comes from the catchment freeze.

import type { OrbitPose } from "./camera";

/** Terrain vertical exaggeration of the arrival view; written beside the view as "Relief ×2". */
export const ARRIVAL_EXAGGERATION = 2;

/** Camera pose: from the south-east, 36 degrees above the land, the long axis on the diagonal. */
export const ARRIVAL_POSE: OrbitPose = {
  target: { lon: -6.370535, lat: 31.659089 },
  targetHeightM: 6307.4,
  cameraBearingFromTargetDeg: 133,
  elevationDeg: 36,
  distanceM: 73388.7,
  verticalFovDeg: 22,
};

/** Light from the left of the arrival view: azimuth from north and altitude above the horizon. */
export const ARRIVAL_LIGHT = { azimuthDeg: 224.1, altitudeDeg: 34.2 } as const;

/**
 * Snapped outlet of catchment revision 1 (freeze record), for the globe and the dive only, which run before
 * the case is open. The arrival draws the outlet from the case's ContextFeature record.
 */
export const OUTLET = { lon: -6.5372222, lat: 31.6377778 } as const;

/**
 * Layout reference for the valley name (the approved u07 placement): the name sits east of this point. Not
 * drawn; the villages on the land come from the case's ContextFeature records.
 */
export const VALLEY_NAME_REFERENCE = { lon: -6.338611, lat: 31.703611 } as const;
