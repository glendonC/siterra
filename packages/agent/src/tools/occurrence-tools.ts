import { z } from "zod";

import type { CaseStore, OccurrenceSet } from "./store.ts";
import { ToolFailure } from "./tool.ts";
import type { ToolHandler } from "./tool.ts";
import { argumentSchema, parseWith } from "./zod-tool.ts";

// search_occurrences: a lookup in the stored GBIF occurrences of the case's species_occurrences
// bundle (science/pipeline/species-occurrences-bundle.py). Deterministic: no live GBIF call, no
// model, no statistics. Each record is a species recorded at a place and time, returned with its
// dataset and licence; a count of records is not abundance and no record is not absence.

const GROUPS = ["plants", "animals", "fungi", "other"] as const;
type Group = (typeof GROUPS)[number];

const MAX_TAXA = 20;

const SearchArgs = z.strictObject({
  /** A scientific name, genus, family, order or class; part of a word matches. */
  query: z.string().min(1).max(80).nullable(),
  group: z.enum(GROUPS).nullable(),
  limit: z.int().min(1).max(25),
});
type SearchArgs = z.infer<typeof SearchArgs>;

/** The same grouping as the bundle's own: a kingdom outside plants, animals and fungi is "other". */
function groupOf(kingdom: string): Group {
  return kingdom === "Animalia"
    ? "animals"
    : kingdom === "Plantae"
      ? "plants"
      : kingdom === "Fungi"
        ? "fungi"
        : "other";
}

export const OCCURRENCE_WORDING = [
  "Each record is a species recorded here: one GBIF occurrence inside the case area, at the date and place it gives.",
  "A number of records is not abundance, a record is not presence today, and years of records are not change.",
  "Say recorded here; never say present, absent, common, rare, declining or lost from these records.",
] as const;

export const NO_RECORD_NOTE =
  "No record of this query is stored in the bundle. That says nothing about whether the species is present or absent.";

function searchSet(set: OccurrenceSet, query: string | null, group: Group | null, limit: number) {
  const { columns: c, tables: t } = set;
  const needle = query?.trim().toLowerCase() ?? null;
  const taxonMatches = t.taxa.map((taxon) => {
    if (group !== null && groupOf(taxon.kingdom) !== group) return false;
    if (needle === null) return true;
    const haystack = [
      taxon.scientific_name,
      taxon.species,
      taxon.family,
      taxon.order,
      taxon.class,
      taxon.kingdom,
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(needle);
  });
  const rows: number[] = [];
  for (let i = 0; i < c.gbif_id.length; i += 1) {
    if (taxonMatches[c.taxon[i] ?? -1]) rows.push(i);
  }
  const byTaxon = new Map<number, { records: number; years: number[] }>();
  const byDataset = new Map<number, number>();
  for (const i of rows) {
    const taxon = c.taxon[i] ?? 0;
    const entry = byTaxon.get(taxon) ?? { records: 0, years: [] };
    entry.records += 1;
    const year = c.year[i];
    if (year !== null && year !== undefined) entry.years.push(year);
    byTaxon.set(taxon, entry);
    byDataset.set(c.dataset[i] ?? 0, (byDataset.get(c.dataset[i] ?? 0) ?? 0) + 1);
  }
  const taxa = [...byTaxon.entries()]
    .map(([index, entry]) => {
      const taxon = t.taxa[index];
      return {
        scientificName: taxon?.scientific_name ?? "",
        species: taxon?.species ?? "",
        family: taxon?.family ?? "",
        records: entry.records,
        firstYear: entry.years.length > 0 ? Math.min(...entry.years) : null,
        lastYear: entry.years.length > 0 ? Math.max(...entry.years) : null,
      };
    })
    .sort((a, b) => b.records - a.records || a.scientificName.localeCompare(b.scientificName))
    .slice(0, MAX_TAXA);
  const ordered = [...rows].sort((a, b) => {
    const ya = c.year[a] ?? Number.NEGATIVE_INFINITY;
    const yb = c.year[b] ?? Number.NEGATIVE_INFINITY;
    return yb - ya || (c.gbif_id[a] ?? 0) - (c.gbif_id[b] ?? 0);
  });
  const records = ordered.slice(0, limit).map((i) => {
    const taxon = t.taxa[c.taxon[i] ?? 0];
    const dataset = t.datasets[c.dataset[i] ?? 0];
    return {
      gbifId: c.gbif_id[i] ?? 0,
      scientificName: taxon?.scientific_name ?? "",
      eventDate: c.event_date[i] ?? null,
      year: c.year[i] ?? null,
      basisOfRecord: t.basis_of_record[c.basis_of_record[i] ?? 0] ?? "",
      lat: c.lat[i] ?? 0,
      lon: c.lon[i] ?? 0,
      coordinateUncertaintyM: c.uncertainty_m[i] ?? null,
      dataset: {
        key: dataset?.key ?? "",
        title: dataset?.title ?? "",
        publisher: dataset?.publisher ?? "",
        doi: dataset?.doi ?? null,
      },
      license: t.license[c.license[i] ?? 0] ?? "",
    };
  });
  const datasets = [...byDataset.entries()]
    .map(([index, count]) => ({
      key: t.datasets[index]?.key ?? "",
      title: t.datasets[index]?.title ?? "",
      publisher: t.datasets[index]?.publisher ?? "",
      doi: t.datasets[index]?.doi ?? null,
      records: count,
    }))
    .sort((a, b) => b.records - a.records || a.title.localeCompare(b.title));
  return {
    bundleId: set.bundleId,
    bundleRevision: set.bundleRevision,
    matchedRecords: rows.length,
    taxa,
    records,
    datasets,
  };
}

export function searchOccurrencesTool(store: CaseStore, caseId: string): ToolHandler<SearchArgs> {
  return {
    name: "search_occurrences",
    description:
      "Look up the species recorded in the case area in the stored GBIF occurrences, by scientific name, genus, family, order or class and/or by group (plants, animals, fungi, other). Returns the matching taxa with their number of records and years, and records with their date, place, dataset and licence. Nothing is fetched live. Say recorded here; a record count is not abundance and no record is not absence.",
    parameters: argumentSchema(SearchArgs),
    parse: (args) => parseWith(SearchArgs, args),
    summarize: (args) =>
      `occurrences matching ${args.query ?? "any name"}, ${args.group ?? "any group"}, at most ${String(args.limit)}`,
    run: async (args) => {
      if (args.query === null && args.group === null) {
        throw new ToolFailure("empty_search", "give a name, a family or a group to search for");
      }
      const bundles = await store.listBundles(caseId);
      const valid = new Set(
        bundles
          .filter((b) => b.status === "validated" && b.methodId === "species_occurrences")
          .map((b) => b.id),
      );
      const sets = (await store.listOccurrenceSets(caseId)).filter((s) => valid.has(s.bundleId));
      if (sets.length === 0) {
        throw new ToolFailure(
          "no_occurrences",
          "this case holds no validated species occurrence bundle",
        );
      }
      const results = sets.map((s) => searchSet(s, args.query, args.group, args.limit));
      const none = results.every((r) => r.matchedRecords === 0);
      return {
        output: {
          label: "recorded occurrences (GBIF), stored bundle, no live GBIF call",
          wording: [...OCCURRENCE_WORDING],
          results,
          note: none ? NO_RECORD_NOTE : null,
        },
        resultEntityIds: results.map((r) => r.bundleId),
      };
    },
  };
}
