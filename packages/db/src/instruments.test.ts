import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { type InstrumentSpec, InstrumentListing } from "@siterra/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sha256Multihash } from "./bundle-import.ts";
import { createCase } from "./cases.ts";
import type { Pool } from "./client.ts";
import { applyCommit } from "./commit.ts";
import { findCaseBundleAsset, readInstruments } from "./instruments.ts";
import { type TestDatabase, freshDatabase } from "./test-database.ts";
import {
  exampleBundle,
  exampleCase,
  exampleCommit,
  exampleComponent,
  exampleEvidence,
  exampleSpec,
} from "./test-records.ts";

const bundlesDir = fileURLToPath(new URL("../../../data/bundles/", import.meta.url));
const bundleId = "bundle_restrend_long_record_ait_bouguemez";
const bundleDir = `${bundlesDir}${bundleId}/`;
const contentHash = sha256Multihash(readFileSync(`${bundleDir}collection.json`));
const owner = "owner_example";
const record = exampleCase("case_example_instrument_read");
const evidence = exampleEvidence(record.id, "ev_example_guard");

const cited = (...ids: string[]) => ids.map((entityId) => ({ entityId, revision: 1 }));

/** A rainfall_scatter spec that reads the two assets of the real restrend bundle (or others). */
function spec(
  id: string,
  assets: { bundle?: string; seasons?: string; fit?: string } = {},
): InstrumentSpec {
  const bundle = assets.bundle ?? bundleId;
  return {
    ...exampleSpec(record.id, id, cited("geo_example_guard", bundle, "ev_example_guard")),
    parameters: {
      kind: "rainfall_scatter",
      geoSelectionId: "geo_example_guard",
      seasons: { bundleId: bundle, assetKey: assets.seasons ?? "restrend_tables" },
      fit: { bundleId: bundle, assetKey: assets.fit ?? "restrend_long_record" },
    },
  };
}

const realBundle = (revision = 1, status: "validated" | "superseded" = "validated") => ({
  ...exampleBundle(record.id, bundleId, revision, status),
  contentHash,
});

let db: TestDatabase;
let pool: Pool;

async function commit(
  id: string,
  expected: number,
  upserts: Parameters<typeof exampleCommit>[1]["upserts"],
) {
  const outcome = await applyCommit(pool, exampleCommit(record, { id, expected, upserts }));
  if (outcome.status !== "committed") throw new Error(`${id}: ${outcome.status}`);
}

beforeAll(async () => {
  db = await freshDatabase();
  pool = db.pool;
  await createCase(pool, record, owner);
  const good = spec("inst_example_read_good");
  await commit("commit_example_read_1", 1, [
    evidence,
    realBundle(),
    good,
    exampleComponent(record.id, "comp_example_read_good", good),
  ]);
  await commit("commit_example_read_2", 2, [spec("inst_example_read_second")]);
});

afterAll(async () => {
  await db.drop();
});

const read = (extra: Partial<Parameters<typeof readInstruments>[1]> = {}) =>
  readInstruments(pool, { caseId: record.id, ownerScopeId: owner, bundlesDir, ...extra });

describe("INST-04 (read part): the instruments of a case, each asset resolved against its bundle", () => {
  it("lists the specs with the components that bind them, and the listing parses as its contract", async () => {
    const listing = await read();
    expect(InstrumentListing.safeParse(listing).error?.issues ?? []).toEqual([]);
    expect(listing?.caseRevision).toBe(3);
    expect(listing?.instruments.map((i) => i.spec.id)).toEqual([
      "inst_example_read_good",
      "inst_example_read_second",
    ]);
    expect(listing?.instruments[0]?.components.map((c) => c.id)).toEqual([
      "comp_example_read_good",
    ]);
    expect(listing?.instruments[1]?.components).toEqual([]);
    // A case with no analysis configuration has no rules to open or block
    expect(listing).not.toHaveProperty("blocked");
  });

  it("resolves an asset key to the immutable URL, type, checksum and size of the file the collection lists", async () => {
    const good = (await read())?.instruments.find((i) => i.spec.id === "inst_example_read_good");
    const tables = readFileSync(`${bundleDir}restrend-long-record-tables.json`);
    expect(good?.assets).toEqual([
      {
        bundleId,
        assetKey: "restrend_tables",
        status: "available",
        href: `/api/case-assets/${bundleId}/${contentHash}/restrend-long-record-tables.json`,
        contentType: "application/json",
        checksum: sha256Multihash(tables),
        size: tables.length,
      },
      expect.objectContaining({
        assetKey: "restrend_long_record",
        status: "available",
        href: `/api/case-assets/${bundleId}/${contentHash}/restrend-long-record.json`,
      }),
    ]);
  });

  it("reads the case as of an earlier revision, and refuses a revision it has not reached", async () => {
    expect((await read({ revision: 2 }))?.instruments.map((i) => i.spec.id)).toEqual([
      "inst_example_read_good",
    ]);
    expect((await read({ revision: 2 }))?.caseRevision).toBe(2);
    expect((await read({ revision: 1 }))?.instruments).toEqual([]);
    expect(await read({ revision: 4 })).toBeNull();
  });

  it("answers null for a case that is not the owner's, and for no case at all", async () => {
    expect(await read({ ownerScopeId: "owner_example_other" })).toBeNull();
    expect(await read({ caseId: "case_example_missing" })).toBeNull();
  });

  it("names why an asset is not available instead of leaving it out", async () => {
    const missingKey = spec("inst_example_read_key", { seasons: "no_such_asset" });
    const absent = spec("inst_example_read_absent", { bundle: "bundle_example_not_in_case" });
    const wrongHash = spec("inst_example_read_hash", { bundle: "bundle_example_moved_on" });
    const superseded = spec("inst_example_read_superseded", {
      bundle: "bundle_example_superseded",
    });
    const moved = {
      ...exampleBundle(record.id, "bundle_example_moved_on", 1),
      contentHash: `1220${"0".repeat(64)}`,
    };
    const old = exampleBundle(record.id, "bundle_example_superseded", 1, "superseded");
    await commit("commit_example_read_3", 3, [
      missingKey,
      absent,
      wrongHash,
      superseded,
      moved,
      old,
    ]);

    const byId = new Map((await read())?.instruments.map((i) => [i.spec.id, i.assets]));
    expect(byId.get("inst_example_read_key")?.map((a) => [a.assetKey, a.status, a.href])).toEqual([
      ["no_such_asset", "asset_key_unknown", null],
      ["restrend_long_record", "available", expect.stringContaining("/api/case-assets/")],
    ]);
    expect(byId.get("inst_example_read_absent")?.map((a) => a.status)).toEqual([
      "bundle_not_in_case",
      "bundle_not_in_case",
    ]);
    expect(byId.get("inst_example_read_hash")?.map((a) => a.status)).toEqual([
      "file_unavailable",
      "file_unavailable",
    ]);
    expect(byId.get("inst_example_read_superseded")?.map((a) => a.status)).toEqual([
      "bundle_not_validated",
      "bundle_not_validated",
    ]);
  });

  it("reports every asset file_unavailable when the server has no bundles folder", async () => {
    const good = (await read({ bundlesDir: null }))?.instruments.find(
      (i) => i.spec.id === "inst_example_read_good",
    );
    expect(good?.assets.map((a) => a.status)).toEqual(["file_unavailable", "file_unavailable"]);
  });
});

describe("a bundle asset by its key", () => {
  const find = (extra: Partial<Parameters<typeof findCaseBundleAsset>[1]> = {}) =>
    findCaseBundleAsset(pool, {
      caseId: record.id,
      ownerScopeId: owner,
      bundleId,
      assetKey: "restrend_long_record",
      bundlesDir,
      ...extra,
    });

  it("finds the file the collection lists under that key, verified against its checksum", async () => {
    const file = await find();
    const bytes = readFileSync(`${bundleDir}restrend-long-record.json`);
    expect(file?.absolutePath).toBe(`${bundleDir}restrend-long-record.json`);
    expect(file?.checksum).toBe(sha256Multihash(bytes));
    expect(file?.size).toBe(bytes.length);
  });

  it("finds nothing for another owner, another case, an unknown bundle or key, or a bundle that is not validated", async () => {
    expect(await find({ ownerScopeId: "owner_example_other" })).toBeNull();
    expect(await find({ caseId: "case_example_missing" })).toBeNull();
    expect(await find({ bundleId: "bundle_example_not_in_case" })).toBeNull();
    expect(await find({ assetKey: "no_such_asset" })).toBeNull();
    expect(await find({ bundleId: "bundle_example_superseded" })).toBeNull();
    expect(await find({ bundlesDir: null })).toBeNull();
  });

  it("finds nothing once the case holds a newer revision of the bundle that is not validated", async () => {
    await commit("commit_example_read_4", 4, [realBundle(2, "superseded")]);
    expect(await find()).toBeNull();
  });
});
