import { describe, expect, it } from "vitest";

import { CASE_ID, bundle, testStore } from "../testing/case-fixture.ts";
import { caseToolRegistry } from "./registry.ts";
import type { MemoryCaseStore, OccurrenceSet } from "./store.ts";
import { searchOccurrencesTool } from "./occurrence-tools.ts";
import type { ToolOutput } from "./tool.ts";

// SYNTHETIC occurrences: invented taxa, places and datasets. Nothing here is a record of any
// species at any place.

const signal = new AbortController().signal;

function set(overrides: Partial<OccurrenceSet> = {}): OccurrenceSet {
  return {
    caseId: CASE_ID,
    bundleId: "bundle_test_species",
    bundleRevision: 1,
    columns: {
      gbif_id: [11, 12, 13, 14, 15, 16],
      taxon: [0, 0, 1, 2, 2, 3],
      year: [2012, null, 2020, 2019, 2021, 2018],
      event_date: ["2012-04-04", null, "2020-05-01", "2019-06-02", "2021-07-09", "2018-01-01"],
      basis_of_record: [0, 0, 1, 0, 0, 0],
      lat: [31.1, 31.2, 31.3, 31.4, 31.5, 31.6],
      lon: [-6.1, -6.2, -6.3, -6.4, -6.5, -6.6],
      uncertainty_m: [null, 30, null, null, 10, null],
      dataset: [0, 0, 1, 1, 1, 0],
      license: [0, 0, 1, 1, 1, 0],
    },
    tables: {
      taxa: [
        {
          scientific_name: "Thymus testus L.",
          species: "Thymus testus",
          kingdom: "Plantae",
          class: "Magnoliopsida",
          order: "Lamiales",
          family: "Lamiaceae",
        },
        {
          scientific_name: "Alectoris examplea (Smith, 1800)",
          species: "Alectoris examplea",
          kingdom: "Animalia",
          class: "Aves",
          order: "Galliformes",
          family: "Phasianidae",
        },
        {
          scientific_name: "Boletus fictus Fr.",
          species: "Boletus fictus",
          kingdom: "Fungi",
          class: "Agaricomycetes",
          order: "Boletales",
          family: "Boletaceae",
        },
        {
          scientific_name: "Alga ocho",
          species: "Alga ocho",
          kingdom: "Chromista",
          class: "Fff",
          order: "Ddd",
          family: "Ccc",
        },
      ],
      datasets: [
        {
          key: "ds-a",
          title: "Example herbarium",
          publisher: "Example Publisher A",
          doi: "10.0000/a",
        },
        { key: "ds-b", title: "Example observations", publisher: "Example Publisher B", doi: null },
      ],
      basis_of_record: ["PRESERVED_SPECIMEN", "HUMAN_OBSERVATION"],
      license: ["CC0-1.0", "CC-BY-4.0"],
    },
    ...overrides,
  };
}

function storeWith(...sets: OccurrenceSet[]): MemoryCaseStore {
  const store = testStore();
  store.bundles.push(
    bundle({
      id: "bundle_test_species",
      revision: 1,
      methodId: "species_occurrences",
      periodIds: [],
    }),
  );
  store.occurrenceSets.push(...sets);
  return store;
}

async function search(store: MemoryCaseStore, args: unknown): Promise<ToolOutput> {
  const tool = searchOccurrencesTool(store, CASE_ID);
  const parsed = tool.parse(args);
  if (!parsed.ok) throw new Error(parsed.message);
  return tool.run(parsed.value, signal);
}

interface Out {
  label: string;
  wording: string[];
  results: {
    bundleId: string;
    bundleRevision: number;
    matchedRecords: number;
    taxa: {
      scientificName: string;
      records: number;
      firstYear: number | null;
      lastYear: number | null;
    }[];
    records: {
      gbifId: number;
      scientificName: string;
      year: number | null;
      eventDate: string | null;
      basisOfRecord: string;
      coordinateUncertaintyM: number | null;
      dataset: { key: string; title: string; publisher: string; doi: string | null };
      license: string;
    }[];
    datasets: { title: string; records: number }[];
  }[];
  note: string | null;
}

describe("search_occurrences", () => {
  it("finds a species by name and returns each record with its dataset, licence and basis", async () => {
    const out = (await search(storeWith(set()), { query: "thymus", group: null, limit: 10 }))
      .output as Out;
    expect(out.results).toHaveLength(1);
    const result = out.results[0];
    expect(result?.matchedRecords).toBe(2);
    expect(result?.taxa).toEqual([
      {
        scientificName: "Thymus testus L.",
        species: "Thymus testus",
        family: "Lamiaceae",
        records: 2,
        firstYear: 2012,
        lastYear: 2012,
      },
    ]);
    expect(result?.records.map((r) => r.gbifId)).toEqual([11, 12]);
    expect(result?.records[0]).toMatchObject({
      year: 2012,
      eventDate: "2012-04-04",
      basisOfRecord: "PRESERVED_SPECIMEN",
      dataset: { key: "ds-a", title: "Example herbarium", doi: "10.0000/a" },
      license: "CC0-1.0",
    });
    expect(result?.records[1]).toMatchObject({
      year: null,
      eventDate: null,
      coordinateUncertaintyM: 30,
    });
    expect(result?.datasets).toMatchObject([{ title: "Example herbarium", records: 2 }]);
  });

  it("matches a genus, a family or an order, ignoring case, and filters by group", async () => {
    const store = storeWith(set());
    const names = async (args: unknown) =>
      ((await search(store, args)).output as Out).results[0]?.taxa.map((t) => t.scientificName) ??
      [];
    expect(await names({ query: "LAMIACEAE", group: null, limit: 5 })).toEqual([
      "Thymus testus L.",
    ]);
    expect(await names({ query: "galliformes", group: null, limit: 5 })).toEqual([
      "Alectoris examplea (Smith, 1800)",
    ]);
    expect(await names({ query: null, group: "fungi", limit: 5 })).toEqual(["Boletus fictus Fr."]);
    expect(await names({ query: null, group: "other", limit: 5 })).toEqual(["Alga ocho"]);
    expect(await names({ query: "t", group: "animals", limit: 5 })).toEqual([
      "Alectoris examplea (Smith, 1800)",
    ]);
    expect((await names({ query: null, group: "plants", limit: 5 })).length).toBe(1);
  });

  it("returns at most the limit, newest year first with undated records last, and the same order every time", async () => {
    const store = storeWith(set());
    const ids = async () =>
      (
        (await search(store, { query: "e", group: null, limit: 2 })).output as Out
      ).results[0]?.records.map((r) => r.gbifId);
    expect(await ids()).toEqual([15, 13]);
    expect(await ids()).toEqual([15, 13]);
    const all = ((await search(store, { query: "e", group: null, limit: 25 })).output as Out)
      .results[0];
    expect(all?.records.map((r) => r.gbifId)).toEqual([15, 13, 14, 11, 12]);
    expect(all?.matchedRecords).toBe(5);
  });

  it("says plainly when nothing is stored, and never that the species is absent", async () => {
    const out = (await search(storeWith(set()), { query: "astragalus", group: null, limit: 5 }))
      .output as Out;
    expect(out.results[0]?.matchedRecords).toBe(0);
    expect(out.results[0]?.records).toEqual([]);
    expect(out.note).toBe(
      "No record of this query is stored in the bundle. That says nothing about whether the species is present or absent.",
    );
    expect(JSON.stringify(out)).not.toMatch(/absent from|does not occur|not found in the valley/i);
  });

  it("states the recorded-here wording rule with every answer", async () => {
    const out = (await search(storeWith(set()), { query: "thymus", group: null, limit: 5 }))
      .output as Out;
    expect(out.label).toBe("recorded occurrences (GBIF), stored bundle, no live GBIF call");
    expect(out.wording.join(" ")).toContain("recorded here");
    expect(out.wording.join(" ")).toMatch(/not (the )?(presence|abundance)/i);
  });

  it("refuses a search with neither a name nor a group, an unknown group and a limit out of range", async () => {
    const tool = searchOccurrencesTool(storeWith(set()), CASE_ID);
    expect(tool.parse({ query: null, group: null, limit: 5 }).ok).toBe(true);
    await expect(
      search(storeWith(set()), { query: null, group: null, limit: 5 }),
    ).rejects.toMatchObject({
      code: "empty_search",
    });
    expect(tool.parse({ query: "x", group: "birds", limit: 5 }).ok).toBe(false);
    expect(tool.parse({ query: "x", group: null, limit: 0 }).ok).toBe(false);
    expect(tool.parse({ query: "x", group: null, limit: 26 }).ok).toBe(false);
    expect(tool.parse({ query: "x".repeat(81), group: null, limit: 5 }).ok).toBe(false);
    expect(tool.parse({ query: "x", group: null, limit: 5, extra: 1 }).ok).toBe(false);
  });

  it("refuses when the case holds no occurrence bundle, and ignores the sets of another case or a bundle not validated", async () => {
    await expect(
      search(testStore(), { query: "thymus", group: null, limit: 5 }),
    ).rejects.toMatchObject({
      code: "no_occurrences",
    });
    const other = storeWith(set({ caseId: "case_other" }));
    await expect(search(other, { query: "thymus", group: null, limit: 5 })).rejects.toMatchObject({
      code: "no_occurrences",
    });
    const failed = storeWith(set());
    failed.bundles.length = 0;
    failed.bundles.push(
      bundle({
        id: "bundle_test_species",
        methodId: "species_occurrences",
        status: "failed",
        periodIds: [],
      }),
    );
    await expect(search(failed, { query: "thymus", group: null, limit: 5 })).rejects.toMatchObject({
      code: "no_occurrences",
    });
  });

  it("names the bundle it read as the entity of the result, and its summary carries no record text", async () => {
    const store = storeWith(set());
    const tool = searchOccurrencesTool(store, CASE_ID);
    const result = await search(store, { query: "thymus", group: null, limit: 5 });
    expect(result.resultEntityIds).toEqual(["bundle_test_species"]);
    expect(tool.summarize({ query: "thymus", group: null, limit: 5 })).toBe(
      "occurrences matching thymus, any group, at most 5",
    );
  });

  it("is in the tool registry a task is offered, under its name", () => {
    const tools = caseToolRegistry(storeWith(set()), CASE_ID).forTask(["search_occurrences"]);
    expect(tools.map((t) => t.name)).toEqual(["search_occurrences"]);
  });
});
