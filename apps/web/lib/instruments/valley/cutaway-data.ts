// The cutaway's data until the case record API serves it: the valley fixtures it shares with the layer stack, the
// section line (S2 transect bundle), the place it names (case record context features) and the two published
// statements it places on the model (a marked stand-in for the Evidence records).

import { z } from "zod";
import {
  VALLEY_FIXTURES,
  catchmentSchema,
  figuresSchema,
  json,
  loadRelief,
  riversSchema,
  snowSchema,
  terrainMetaSchema,
  type Catchment,
  type Figures,
  type Rivers,
  type Snow,
  type TerrainMeta,
} from "./fixtures";
import { cutawayTransectSchema, type CutawayTransect } from "./transect";

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

export const statementsSchema = z.object({
  /** Says what the fixture stands in for; a fixture without it is not accepted. */
  fixture: z.string().min(1),
  sources: z.array(z.object({ id: z.string(), citation: z.string() })),
  statements: z.array(
    z.object({
      id: z.string(),
      text: z.string(),
      /** How the text renders its sources: in its own words, or quoting a verbatim excerpt. */
      wording: z.enum(["paraphrase", "quotation"]),
      cites: z
        .array(
          z.object({
            sourceId: z.string(),
            page: z.string().nullable(),
            excerpt: z.string(),
            kind: z.enum(["verbatim", "register_note", "stored_text"]),
          }),
        )
        .min(1),
    }),
  ),
});

export type Places = z.infer<typeof placesSchema>;
export type Statements = z.infer<typeof statementsSchema>;

export interface CutawayData {
  meta: TerrainMeta;
  relief: Float32Array<ArrayBuffer>;
  catchment: Catchment;
  rivers: Rivers;
  snow: Snow;
  figures: Figures;
  transect: CutawayTransect;
  places: Places;
  statements: Statements;
}

/** The fixtures specimen B reads; `transect` is the section line's URL. */
export async function loadCutawayData(
  base = VALLEY_FIXTURES,
  transect = `${base}transect.json`,
  signal?: AbortSignal,
): Promise<CutawayData> {
  const meta = await json(`${base}terrain-meta.json`, terrainMetaSchema, signal);
  const [relief, catchment, rivers, snow, figures, line, places, statements] = await Promise.all([
    loadRelief(base, meta, signal),
    json(`${base}catchment.json`, catchmentSchema, signal),
    json(`${base}rivers.json`, riversSchema, signal),
    json(`${base}snow.json`, snowSchema, signal),
    json(`${base}figures.json`, figuresSchema, signal),
    json(transect, cutawayTransectSchema, signal),
    json(`${base}places.json`, placesSchema, signal),
    json(`${base}statements.json`, statementsSchema, signal),
  ]);
  return { meta, relief, catchment, rivers, snow, figures, transect: line, places, statements };
}
