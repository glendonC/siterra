import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createCase } from "./cases.ts";
import type { Pool } from "./client.ts";
import { CommitRejected, applyCommit, uncoveredInstrumentCitations } from "./commit.ts";
import { readSnapshot } from "./snapshot.ts";
import { type TestDatabase, freshDatabase } from "./test-database.ts";
import {
  exampleBundle,
  exampleCase,
  exampleCommit,
  exampleComponent,
  exampleEvidence,
  exampleSpec,
} from "./test-records.ts";

const owner = "owner_example";
const record = exampleCase("case_example_instrument_guard");
const evidence = exampleEvidence(record.id, "ev_example_guard");
const cited = [
  { entityId: "geo_example_guard", revision: 1 },
  { entityId: "bundle_example_guard", revision: 1 },
  { entityId: "ev_example_guard", revision: 1 },
];

let db: TestDatabase;
let pool: Pool;

beforeAll(async () => {
  db = await freshDatabase();
  pool = db.pool;
  await createCase(pool, record, owner);
});

afterAll(async () => {
  await db.drop();
});

describe("INST-01 guard: an instrument spec cites every record it names", () => {
  it("lists the names its provenance does not cite, at any revision; other records list none", () => {
    expect(
      uncoveredInstrumentCitations(
        exampleSpec(record.id, "inst_example_lists", [
          { entityId: "bundle_example_guard", revision: 4 },
        ]),
      ),
    ).toEqual(["geo_example_guard", "ev_example_guard"]);
    expect(uncoveredInstrumentCitations(evidence)).toEqual([]);
  });

  it("refuses a commit with an uncited spec and writes nothing", async () => {
    const commit = exampleCommit(record, {
      id: "commit_example_inst_refused",
      expected: 1,
      upserts: [
        evidence,
        exampleSpec(record.id, "inst_example_uncited", [
          { entityId: "ev_example_guard", revision: 1 },
        ]),
      ],
    });
    await expect(applyCommit(pool, commit)).rejects.toBeInstanceOf(CommitRejected);
    await expect(applyCommit(pool, commit)).rejects.toMatchObject({
      code: "instrument_inputs_not_cited",
      message:
        "inst_example_uncited: provenance.inputVersions does not cite geo_example_guard, bundle_example_guard",
    });
    const snapshot = await readSnapshot(pool, record.id, owner);
    expect([snapshot?.case.revision, snapshot?.records.instrumentSpecRecords]).toEqual([1, []]);
  });

  it("refuses a layer_stack that lists a layer twice (INST-03) and writes nothing", async () => {
    const base = exampleSpec(record.id, "inst_example_twice", cited);
    const layer = {
      layer: "rainfall" as const,
      data: { bundleId: "bundle_example_guard", assetKey: "rainfall_cells" },
    };
    const twice = {
      ...base,
      parameters: {
        kind: "layer_stack" as const,
        geoSelectionId: "geo_example_guard",
        relief: { bundleId: "bundle_example_guard", assetKey: "relief" },
        layers: [layer, layer],
        drainageFeatureIds: [],
        placeFeatureIds: [],
        selectedLayer: null,
      },
    };
    await expect(
      applyCommit(
        pool,
        exampleCommit(record, {
          id: "commit_example_inst_twice",
          expected: 1,
          upserts: [evidence, twice],
        }),
      ),
    ).rejects.toMatchObject({
      code: "instrument_invalid",
      message: "inst_example_twice: the layer rainfall is listed twice",
    });
  });

  it("refuses a component whose spec is not in the case, and one of another kind", async () => {
    const spec = exampleSpec(record.id, "inst_example_bound", cited);
    const other = exampleComponent(record.id, "comp_example_orphan", spec);
    await expect(
      applyCommit(
        pool,
        exampleCommit(record, {
          id: "commit_example_inst_orphan",
          expected: 1,
          upserts: [evidence, other],
        }),
      ),
    ).rejects.toMatchObject({
      code: "instrument_invalid",
      message: "comp_example_orphan: binds no instrument spec that exists in this case",
    });
    const wrongKind = {
      ...exampleComponent(record.id, "comp_example_kind", spec),
      componentKind: "field_plan" as const,
    };
    await expect(
      applyCommit(
        pool,
        exampleCommit(record, {
          id: "commit_example_inst_kind",
          expected: 1,
          upserts: [evidence, spec, wrongKind],
        }),
      ),
    ).rejects.toMatchObject({
      code: "instrument_invalid",
      message: "comp_example_kind: a field_plan component binds a rainfall_scatter spec",
    });
  });

  it("commits a spec that cites what it names, with its component, and the snapshot returns both", async () => {
    const spec = exampleSpec(record.id, "inst_example_cited", cited);
    const outcome = await applyCommit(
      pool,
      exampleCommit(record, {
        id: "commit_example_inst_ok",
        expected: 1,
        upserts: [
          evidence,
          exampleBundle(record.id, "bundle_example_guard", 1),
          spec,
          exampleComponent(record.id, "comp_example_cited", spec),
        ],
      }),
    );
    expect(outcome.status).toBe("committed");
    const snapshot = await readSnapshot(pool, record.id, owner);
    expect(
      snapshot?.records.instrumentSpecRecords?.map((s) => [s.id, s.revision, s.status]),
    ).toEqual([["inst_example_cited", 1, "ready"]]);
    expect(snapshot?.records.canvasComponentRecords.map((c) => c.componentKind)).toEqual([
      "rainfall_scatter",
    ]);
  });

  it("binds a later component to a spec an earlier commit stored, at its current revision", async () => {
    const stored = exampleSpec(record.id, "inst_example_cited", cited);
    const outcome = await applyCommit(
      pool,
      exampleCommit(record, {
        id: "commit_example_inst_later",
        expected: 2,
        upserts: [exampleComponent(record.id, "comp_example_later", stored)],
      }),
    );
    expect(outcome.status).toBe("committed");
  });

  it("a superseded bundle marks the spec and then every component that binds it stale in the same commit", async () => {
    const outcome = await applyCommit(
      pool,
      exampleCommit(record, {
        id: "commit_example_inst_stale",
        expected: 3,
        upserts: [exampleBundle(record.id, "bundle_example_guard", 2, "superseded")],
      }),
    );
    if (outcome.status !== "committed") throw new Error(outcome.status);
    const staleEvent = outcome.commit.events.find((e) => e.kind === "entity.stale");
    expect(staleEvent?.entityIds.sort()).toEqual([
      "comp_example_cited",
      "comp_example_later",
      "inst_example_cited",
    ]);
    const snapshot = await readSnapshot(pool, record.id, owner);
    expect(snapshot?.records.instrumentSpecRecords?.map((s) => [s.revision, s.status])).toEqual([
      [2, "stale"],
    ]);
    expect(
      snapshot?.records.canvasComponentRecords.map((c) => [c.id, c.revision, c.presentationStatus]),
    ).toEqual([
      ["comp_example_cited", 2, "stale"],
      ["comp_example_later", 2, "stale"],
    ]);
    const history = await pool.query<{ revision: number; status: string }>(
      "select revision, record ->> 'status' as status from records where case_id = $1 and entity_id = 'inst_example_cited' order by revision",
      [record.id],
    );
    expect(history.rows).toEqual([
      { revision: 1, status: "ready" },
      { revision: 2, status: "stale" },
    ]);
  });

  it("refuses a new component pinned to a revision older than the stored spec", async () => {
    const old = exampleSpec(record.id, "inst_example_cited", cited);
    await expect(
      applyCommit(
        pool,
        exampleCommit(record, {
          id: "commit_example_inst_old",
          expected: 4,
          upserts: [exampleComponent(record.id, "comp_example_old", old)],
        }),
      ),
    ).rejects.toMatchObject({
      code: "instrument_invalid",
      message: "comp_example_old: binds inst_example_cited revision 1 but the spec is revision 2",
    });
  });
});
