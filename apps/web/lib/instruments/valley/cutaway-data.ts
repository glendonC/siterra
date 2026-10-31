// The cutaway's data. From the case, through the cross section spec's assets (checksums checked): the section line
// (transect samples and the drawn transect summary, built by the recompute-tested transectFixture), the band
// trends, the snow shares and the catchment outline; the rivers and the place from the case's context features.
// The two published statements are the spec's display texts with the sources of their Evidence (contracts 1.17.0).
// The land from the drawn display assets (lib/land/terrain): the relief grid from this spec, the land cover raster
// from the first given view that draws one (the cross section spec names none yet; the layer stack's does).

import type { CaseSnapshot, InstrumentView } from "@siterra/contracts";
import { z } from "zod";
import { bundleSource, drawnAsset, readJsonAsset } from "../listing";
import { placedStatements, type PlacedStatements } from "../placed-statements";
import { placesFrom, riversFrom, type Place } from "./context";
import { seasonTrendFrom, snowFrom } from "./derive";
import { bandLimitsOf } from "../../land/record";
import { readCaseTerrain, type ReadTerrain, type ReliefRange } from "../../land/terrain";
import { type Catchment, type Figures, type Rivers, type Snow, type TerrainMeta } from "./fixtures";
import { outlineRing } from "./outline";
import { cutawayTransectSchema, transectFixture, type CutawayTransect } from "./transect";

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
  /** The UTM zone (north) of every coordinate here, from the relief's header. */
  zone: number;
  meta: TerrainMeta;
  relief: Float32Array<ArrayBuffer>;
  range: ReliefRange;
  /** The land cover mask on the analysis grid (lib/land/terrain coverMask). */
  landcover: ImageBitmap;
  /** The record's two elevation band limits (m), lowest first (lib/land/record bandLimitsOf). */
  limits: readonly [number, number];
  catchment: Pick<Catchment, "ring">;
  rivers: Rivers;
  /** The snow shares; null where the spec's snow summary records the snow recipe as not applicable (P7b-8). */
  snow: Snow | null;
  figures: Pick<Figures, "season_trend">;
  transect: CutawayTransect;
  places: { places: Place[] };
  /** Keyed by placement: "valley_floor", "upper_slope". */
  statements: PlacedStatements;
}

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

/** The section line, band trends, snow, outline and relief from the cross section spec; land cover from `landFrom`. */
export async function loadCutawayData(
  view: InstrumentView,
  snapshot: CaseSnapshot,
  landFrom: readonly InstrumentView[] = [],
  fetchImpl: Fetch = (input, init) => fetch(input, init),
  signal?: AbortSignal,
  readTerrain: ReadTerrain = readCaseTerrain,
): Promise<CutawayData> {
  const p = view.spec.parameters;
  if (p.kind !== "cross_section") throw new Error(`Not a cross section spec: ${p.kind}`);
  const member = snapshot.records.contextFeatureRecords?.find((f) => f.id === p.transectFeatureId)
    ?.dataBundle?.member;
  if (member === undefined) throw new Error(`No bundle member for ${p.transectFeatureId}`);
  const summary = drawnAsset(view, "transect_summary");
  const read = (ref: Parameters<typeof readJsonAsset>[1]) =>
    readJsonAsset(view, ref, fetchImpl, signal);
  // the snow summary the spec draws (P7b-8, role snow_summary) records whether the snow recipe applies here; a spec
  // that draws none is read as before
  const summaryRef = (() => {
    try {
      return drawnAsset(view, "snow_summary");
    } catch {
      return null;
    }
  })();
  const [land, samples, terrain, trends, snow, outline, snowSummary] = await Promise.all([
    readTerrain([view, ...landFrom], fetchImpl, signal),
    read(p.profile),
    read(summary),
    read(p.bandTrends),
    read(p.snow),
    read(drawnAsset(view, "catchment_outline")),
    summaryRef ? read(summaryRef) : Promise.resolve(null),
  ]);
  const snowApplies =
    (snowSummary as { applicability?: { decision?: string } } | null)?.applicability?.decision !==
    "not_applicable";
  const transect = cutawayTransectSchema.parse(
    transectFixture(
      samples as never,
      terrain as never,
      member,
      [bundleSource(view, p.profile), bundleSource(view, summary)],
      land.zone,
    ),
  );
  const limits = bandLimitsOf(snapshot);
  if (!limits) throw new Error("The record holds no two elevation band limits");
  return {
    zone: land.zone,
    limits,
    meta: land.meta,
    relief: land.relief,
    range: land.range,
    landcover: land.landcover,
    catchment: { ring: outlineRing(outline, land.zone) },
    rivers: riversFrom(snapshot, p.drainageFeatureIds, land.zone),
    snow: snowApplies ? snowFrom(snow) : null,
    figures: { season_trend: seasonTrendFrom(trends) },
    transect,
    places: { places: placesFrom(snapshot, p.placeFeatureIds) },
    statements: placedStatements(
      snapshot,
      p.statements.flatMap((st) => (st.display ? [{ id: st.placement, display: st.display }] : [])),
    ),
  };
}
