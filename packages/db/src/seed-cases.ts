import { ContextFeature, type EnvironmentalCase } from "@siterra/contracts";
import type { Pool } from "./client.ts";

/** One seed case as the interface lists it: every word and position is read from the case's own records. */
export interface SeedCaseSummary {
  caseId: string;
  title: string;
  /** The case's objective: the question the case asks. */
  question: string;
  /** The place and region the case states; null when its record states none. */
  place: { name: string; region: string } | null;
  /** The case's outlet context feature; null unless the case has exactly one. */
  outlet: { name: string; lonLat: [number, number] } | null;
}

/**
 * The seed cases a demo session can start (startDemoSession copies one of them), in the order they
 * were made. Only the cases of the seed owner scope are listed (a demo copy has an owner scope of
 * its own, so no copy is). The outlet is the latest revision of the case's one outlet
 * ContextFeature; a case with none or with several has none listed, since which of several is the
 * outlet is not for this listing to guess.
 */
export async function listSeedCases(
  pool: Pool,
  seedOwnerScopeId: string,
): Promise<SeedCaseSummary[]> {
  const rows = await pool.query<{ record: EnvironmentalCase; outlets: unknown[] | null }>(
    `select c.record,
            (select jsonb_agg(f.record) from (
               select distinct on (entity_id) entity_id, record from records
               where case_id = c.id and record_type = 'ContextFeature'
               order by entity_id, revision desc
             ) f where f.record->>'role' = 'outlet') as outlets
     from cases c
     where c.owner_scope_id = $1
     order by (c.record->>'createdAt')::timestamptz, c.id`,
    [seedOwnerScopeId],
  );
  return rows.rows.map(({ record, outlets }) => ({
    caseId: record.id,
    title: record.title,
    question: record.objective,
    place:
      record.place === undefined ? null : { name: record.place.name, region: record.place.region },
    outlet: outletOf(outlets ?? []),
  }));
}

function outletOf(outlets: readonly unknown[]): SeedCaseSummary["outlet"] {
  if (outlets.length !== 1) return null;
  const feature = ContextFeature.safeParse(outlets[0]);
  if (!feature.success || feature.data.geometry.type !== "Point") return null;
  const [lon, lat] = feature.data.geometry.coordinates;
  return { name: feature.data.name, lonLat: [lon, lat] };
}
