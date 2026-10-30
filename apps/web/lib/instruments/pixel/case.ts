// The pixel anatomy's data from the case: the pixel anatomy spec's assets (the anatomy, the band's season tables,
// and the drawn pixel cells, spectra and series) read through the case asset route, checksums checked, and built
// into the page's data by the same recompute-tested builder as the fixture (fixture.ts); the catchment outline
// from the drawn analysis geometry.

import type { InstrumentView } from "@siterra/contracts";
import { bundleSource, drawnAsset, readJsonAsset } from "../listing";
import { outlineRing } from "../valley/outline";
import { pixelSchema, type PixelData } from "./data";
import { pixelFixture } from "./fixture";

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

export interface CasePixel {
  pixel: PixelData;
  /** The catchment outline in EPSG:32629 metres. */
  ring: [number, number][];
}

export async function loadCasePixel(
  view: InstrumentView,
  fetchImpl: Fetch,
  signal?: AbortSignal,
): Promise<CasePixel> {
  const p = view.spec.parameters;
  if (p.kind !== "pixel_anatomy") throw new Error(`Not a pixel anatomy spec: ${p.kind}`);
  const refs = [
    p.anatomy,
    drawnAsset(view, "pixel_cells"),
    drawnAsset(view, "pixel_series"),
    drawnAsset(view, "pixel_spectra"),
    p.bandSeries,
  ];
  const outline = drawnAsset(view, "catchment_outline");
  const [bodies, geometry] = await Promise.all([
    Promise.all(refs.map((r) => readJsonAsset(view, r, fetchImpl, signal))),
    readJsonAsset(view, outline, fetchImpl, signal),
  ]);
  const sources = refs.map((r) => bundleSource(view, r));
  const src = Object.fromEntries(sources.map((s, i) => [s.path, bodies[i]]));
  return { pixel: pixelSchema.parse(pixelFixture(src, sources)), ring: outlineRing(geometry) };
}
