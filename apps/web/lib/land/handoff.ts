// What one view of the land hands the next when the land is taken apart in place: where the land
// stands on screen and how it is seen and lit, so the next view's first frame draws the same land in the same place.

import type { Texture } from "three";

/** The land's box on screen (CSS px from the viewport's top left), its camera bearing and elevation, its light. */
export interface LandPose {
  rect: { x0: number; y0: number; x1: number; y1: number };
  azimuth: number;
  elevation: number;
  /** Unit vector towards the light, model space (x east, y up, z south). */
  light: readonly [number, number, number];
  /** The land's vertical exaggeration in that view. */
  exag: number;
  /**
   * The cast shadows and open sky already baked for that light on the relief grid (R lit, G open), so the next view
   * need not bake them again; its grid size, to check it is the same grid.
   */
  lightMap?: { map: Texture; width: number; height: number };
}
