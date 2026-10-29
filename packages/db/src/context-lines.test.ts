import type { ContextFeature } from "@siterra/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createCase } from "./cases.ts";
import type { Pool } from "./client.ts";
import { applyCommit } from "./commit.ts";
import { readSnapshot } from "./snapshot.ts";
import { type TestDatabase, freshDatabase } from "./test-database.ts";
import { at, exampleCase, exampleCommit } from "./test-records.ts";

const owner = "owner_example";
const record = exampleCase("case_example_context_lines");

function feature(
  id: string,
  role: ContextFeature["role"],
  geometry: ContextFeature["geometry"],
): ContextFeature {
  return {
    recordType: "ContextFeature",
    id,
    revision: 1,
    createdAt: at,
    updatedAt: at,
    caseId: record.id,
    name: `Synthetic ${role}`,
    role,
    geometry,
    crs: "EPSG:4326",
    method: "Synthetic storage test.",
    datasetId: null,
    sourceIds: [],
    attribution: null,
    license: null,
    limitations: [],
    dataBundle: { bundleId: "bundle_example_lines", assetKey: "drainage_network" },
  };
}

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

describe("contracts 1.12 (storage part): a line feature is stored and read back as written", () => {
  const drainage = feature("ctx_example_stored_drainage", "drainage", {
    type: "MultiLineString",
    coordinates: [
      [
        [-6.43, 31.7, 2900.5],
        [-6.44, 31.68, 2400.25],
      ],
      [
        [-6.4, 31.69, 2700],
        [-6.44, 31.68, 2400.25],
      ],
    ],
  });
  const route = feature("ctx_example_stored_route", "route_proposed", {
    type: "LineString",
    coordinates: [
      [-6.41, 31.653],
      [-6.39, 31.66],
    ],
  });

  it("commits the lines and the snapshot returns the geometry and the bundle asset unchanged", async () => {
    const outcome = await applyCommit(
      pool,
      exampleCommit(record, {
        id: "commit_example_lines",
        expected: 1,
        upserts: [drainage, route],
      }),
    );
    expect(outcome.status).toBe("committed");
    const snapshot = await readSnapshot(pool, record.id, owner);
    const stored = new Map(snapshot?.records.contextFeatureRecords?.map((f) => [f.id, f]));
    expect(stored.get(drainage.id)?.geometry).toEqual(drainage.geometry);
    expect(stored.get(drainage.id)?.dataBundle).toEqual(drainage.dataBundle);
    expect(stored.get(route.id)?.geometry).toEqual(route.geometry);
  });

  it("refuses a drainage feature drawn as a point before anything is written", async () => {
    const wrong = feature("ctx_example_wrong", "drainage", {
      type: "Point",
      coordinates: [-6.43, 31.7],
    });
    await expect(
      applyCommit(
        pool,
        exampleCommit(record, { id: "commit_example_wrong", expected: 2, upserts: [wrong] }),
      ),
    ).rejects.toThrow(/A drainage feature is a LineString or MultiLineString, not a Point/);
    const snapshot = await readSnapshot(pool, record.id, owner);
    expect(snapshot?.records.contextFeatureRecords?.map((f) => f.id).sort()).toEqual([
      "ctx_example_stored_drainage",
      "ctx_example_stored_route",
    ]);
  });
});
