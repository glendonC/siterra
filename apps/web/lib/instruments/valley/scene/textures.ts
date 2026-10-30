// Data textures for the valley scenes: the relief heights, and PNG rasters whose bytes are data (no colour
// conversion, no premultiplication), as the specimens loaded them.

import {
  DataTexture,
  FloatType,
  LinearFilter,
  LinearMipmapLinearFilter,
  NearestFilter,
  NoColorSpace,
  RedFormat,
  Texture,
} from "three";
import type { Grid } from "../frame";

export function heightTexture(H: Float32Array<ArrayBuffer>, g: Grid): DataTexture {
  const t = new DataTexture(H, g.width, g.height, RedFormat, FloatType);
  t.minFilter = NearestFilter;
  t.magFilter = NearestFilter;
  t.flipY = false;
  t.needsUpdate = true;
  return t;
}

/** A decoded raster whose bytes are data (lib/land/terrain's masks) as a texture; the bitmap stays the caller's. */
export function bitmapTexture(bitmap: ImageBitmap): Texture {
  const t = new Texture(bitmap);
  t.flipY = false;
  t.colorSpace = NoColorSpace;
  t.generateMipmaps = true;
  t.minFilter = LinearMipmapLinearFilter;
  t.magFilter = LinearFilter;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}
