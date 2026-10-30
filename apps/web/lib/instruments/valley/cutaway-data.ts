// The cutaway's data. From the case, through the cross section spec's assets (checksums checked): the section line
// (transect samples and the drawn transect summary, built by the recompute-tested transectFixture), the band
// trends, the snow shares and the catchment outline; the rivers and the place from the case's context features.
// The two published statements are the spec's display texts with the sources of their Evidence (contracts 1.17.0).
// Still from the valley fixtures: the relief (a GeoTIFF in the bundle, until its display asset lands).

import type { CaseSnapshot, InstrumentView } from "@siterra/contracts";
import { z } from "zod";
import { bundleSource, drawnAsset, readJsonAsset } from "../listing";
import { placedStatements, type PlacedStatements } from "../placed-statements";
import { placesFrom, riversFrom, type Place } from "./context";
import { seasonTrendFrom, snowFrom } from "./derive";
import {
  VALLEY_FIXTURES,
  json,
  loadRelief,
  terrainMetaSchema,
  type Catchment,
  type Figures,
  type Rivers,
  type Snow,
  type TerrainMeta,
} from "./fixtures";
import { outlineRing } from "./outline";
import { cutawayTransectSchema, transectFixture, type CutawayTransect } from "./transect";

/** The place the section passes through, by its case record context feature. */
export const SECTION_PLACE = "ctx_tabant";

export const placesSchema = z.object({
  source: z.literal("data/case/context-features.json"),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  places: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      role: z.string(),
      lonLat: z.tuple([z.number(), z.number()]),
      attribution: z.string(),
      license: z.string(),
    }),
  ),
});

export type Places = z.infer<typeof placesSchema>;

export interface CutawayData {
  meta: TerrainMeta;
  relief: Float32Array<ArrayBuffer>;
  catchment: Pick<Catchment, "ring">;
  rivers: Rivers;
  snow: Snow;
  figures: Pick<Figures, "season_trend">;
  transect: CutawayTransect;
  places: { places: Place[] };
  /** Keyed by placement: "valley_floor", "upper_slope". */
  statements: PlacedStatements;
}

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

/** The section line, band trends, snow and outline from the cross section spec; the rest from `base`. */
export async function loadCutawayData(
  view: InstrumentView,
  snapshot: CaseSnapshot,
  base = VALLEY_FIXTURES,
  fetchImpl: Fetch = (input, init) => fetch(input, init),
  signal?: AbortSignal,
): Promise<CutawayData> {
  const p = view.spec.parameters;
  if (p.kind !== "cross_section") throw new Error(`Not a cross section spec: ${p.kind}`);
  const member = snapshot.records.contextFeatureRecords?.find((f) => f.id === p.transectFeatureId)
    ?.dataBundle?.member;
  if (member === undefined) throw new Error(`No bundle member for ${p.transectFeatureId}`);
  const summary = drawnAsset(view, "transect_summary");
  const read = (ref: Parameters<typeof readJsonAsset>[1]) =>
    readJsonAsset(view, ref, fetchImpl, signal);
  const meta = await json(`${base}terrain-meta.json`, terrainMetaSchema, signal);
  const [relief, samples, terrain, trends, snow, outline] = await Promise.all([
    loadRelief(base, meta, signal),
    read(p.profile),
    read(summary),
    read(p.bandTrends),
    read(p.snow),
    read(drawnAsset(view, "catchment_outline")),
  ]);
  const transect = cutawayTransectSchema.parse(
    transectFixture(samples as never, terrain as never, member, [
      bundleSource(view, p.profile),
      bundleSource(view, summary),
    ]),
  );
  return {
    meta,
    relief,
    catchment: { ring: outlineRing(outline) },
    rivers: riversFrom(snapshot, p.drainageFeatureIds),
    snow: snowFrom(snow),
    figures: { season_trend: seasonTrendFrom(trends) },
    transect,
    places: { places: placesFrom(snapshot, p.placeFeatureIds) },
    statements: placedStatements(
      snapshot,
      p.statements.flatMap((st) => (st.display ? [{ id: st.placement, display: st.display }] : [])),
    ),
  };
}
