import type { ContextFeature, EnvironmentalCase } from "@siterra/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createCase } from "./cases.ts";
import type { Pool } from "./client.ts";
import { startDemoSession } from "./demo-sessions.ts";
import { listSeedCases } from "./seed-cases.ts";
import { type TestDatabase, freshDatabase } from "./test-database.ts";
import { exampleCase } from "./test-records.ts";

let db: TestDatabase;
let pool: Pool;
const seedOwner = "seed";

beforeAll(async () => {
  db = await freshDatabase();
  pool = db.pool;
});

afterAll(async () => {
  await db.drop();
});

function outletOf(
  caseId: string,
  id: string,
  coordinates: [number, number],
  revision = 1,
  role: "outlet" | "settlement" = "outlet",
): ContextFeature {
  return {
    recordType: "ContextFeature",
    id,
    revision,
    createdAt: "2026-10-30T12:00:00Z",
    updatedAt: "2026-10-30T12:00:00Z",
    caseId,
    name: role === "outlet" ? "Catchment outlet" : "A settlement",
    role,
    geometry: { type: "Point", coordinates },
    crs: "EPSG:4326",
    method: "Synthetic test position.",
    datasetId: null,
    sourceIds: [],
    attribution: null,
    license: null,
    limitations: [],
  };
}

async function addRecord(caseId: string, record: ContextFeature): Promise<void> {
  await pool.query(
    `insert into records (case_id, entity_id, revision, record_type, record, case_revision)
     values ($1, $2, $3, $4, $5, 1)`,
    [caseId, record.id, record.revision, record.recordType, JSON.stringify(record)],
  );
}

function seedCase(id: string, createdAt: string, extra: Partial<EnvironmentalCase> = {}) {
  return { ...exampleCase(id), createdAt, updatedAt: createdAt, ...extra };
}

describe("listSeedCases: the seed cases a demo session can start, read from their own records", () => {
  it("lists the place, region, outlet point and question of each seed case in the order they were made", async () => {
    await createCase(
      pool,
      seedCase("case_example_zeta", "2026-10-30T10:00:00Z", {
        title: "Zeta case",
        objective: "Is zeta changing?",
        place: { name: "Zeta valley", region: "Zeta range, Zetaland" },
      }),
      seedOwner,
    );
    await addRecord(
      "case_example_zeta",
      outletOf("case_example_zeta", "ctx_zeta_outlet", [-6.5, 31.6]),
    );
    await addRecord(
      "case_example_zeta",
      outletOf("case_example_zeta", "ctx_zeta_village", [-6.4, 31.7], 1, "settlement"),
    );
    await createCase(
      pool,
      seedCase("case_example_alpha", "2026-10-30T11:00:00Z", {
        title: "Alpha case",
        objective: "Is alpha changing?",
        place: { name: "Alpha creek", region: "Alpha hills, Alphaland" },
      }),
      seedOwner,
    );
    await addRecord(
      "case_example_alpha",
      outletOf("case_example_alpha", "ctx_alpha_outlet", [-121.7, 37.4]),
    );
    expect(await listSeedCases(pool, seedOwner)).toEqual([
      {
        caseId: "case_example_zeta",
        title: "Zeta case",
        question: "Is zeta changing?",
        place: { name: "Zeta valley", region: "Zeta range, Zetaland" },
        outlet: { name: "Catchment outlet", lonLat: [-6.5, 31.6] },
      },
      {
        caseId: "case_example_alpha",
        title: "Alpha case",
        question: "Is alpha changing?",
        place: { name: "Alpha creek", region: "Alpha hills, Alphaland" },
        outlet: { name: "Catchment outlet", lonLat: [-121.7, 37.4] },
      },
    ]);
  });

  it("has no place for a case that states none and no outlet for a case without exactly one", async () => {
    await createCase(pool, seedCase("case_example_plain", "2026-10-30T12:00:00Z"), seedOwner);
    await createCase(pool, seedCase("case_example_twin", "2026-10-30T13:00:00Z"), seedOwner);
    await addRecord("case_example_twin", outletOf("case_example_twin", "ctx_twin_a", [1, 2]));
    await addRecord("case_example_twin", outletOf("case_example_twin", "ctx_twin_b", [3, 4]));
    const listed = await listSeedCases(pool, seedOwner);
    const plain = listed.find((c) => c.caseId === "case_example_plain");
    const twin = listed.find((c) => c.caseId === "case_example_twin");
    expect(plain).toMatchObject({ place: null, outlet: null });
    expect(twin).toMatchObject({ place: null, outlet: null });
  });

  it("reads the latest revision of the outlet", async () => {
    await createCase(pool, seedCase("case_example_moved", "2026-10-30T14:00:00Z"), seedOwner);
    await addRecord("case_example_moved", outletOf("case_example_moved", "ctx_moved", [10, 20]));
    await addRecord("case_example_moved", outletOf("case_example_moved", "ctx_moved", [11, 21], 2));
    const moved = (await listSeedCases(pool, seedOwner)).find(
      (c) => c.caseId === "case_example_moved",
    );
    expect(moved?.outlet?.lonLat).toEqual([11, 21]);
  });

  it("leaves out demo copies and the cases of other owners", async () => {
    await createCase(
      pool,
      seedCase("case_example_private", "2026-10-30T15:00:00Z"),
      "owner_example",
    );
    const started = await startDemoSession(pool, {
      seedCaseId: "case_example_zeta",
      seedOwnerScopeId: seedOwner,
      ttlSeconds: 3600,
      maxActiveSessions: 100,
      maxPerMinute: 1000,
    });
    expect(started.status).toBe("created");
    const ids = (await listSeedCases(pool, seedOwner)).map((c) => c.caseId);
    expect(ids).not.toContain("case_example_private");
    if (started.status === "created") expect(ids).not.toContain(started.caseId);
    expect(ids.slice(0, 2)).toEqual(["case_example_zeta", "case_example_alpha"]);
    expect(await listSeedCases(pool, "no_such_owner")).toEqual([]);
  });
});
