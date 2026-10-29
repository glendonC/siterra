import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { InstrumentListing } from "@siterra/contracts";
import {
  type Pool,
  applyCommit,
  createCase,
  createSession,
  sessionCookieName,
  sha256Multihash,
} from "@siterra/db";
import {
  type TestDatabase,
  exampleBundle,
  exampleCase,
  exampleCommit,
  exampleComponent,
  exampleEvidence,
  exampleSpec,
  freshDatabase,
} from "@siterra/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type * as AssetRoute from "./cases/[caseId]/bundles/[bundleId]/assets/[assetKey]/route.ts";
import type * as InstrumentsRoute from "./cases/[caseId]/instruments/route.ts";

const bundlesDir = fileURLToPath(new URL("../../../../data/bundles/", import.meta.url));
const bundleId = "bundle_restrend_long_record_ait_bouguemez";
const bundleDir = `${bundlesDir}${bundleId}/`;
const contentHash = sha256Multihash(readFileSync(`${bundleDir}collection.json`));
const origin = "http://127.0.0.1:4350";
const caseId = "case_example_instrument_routes";
const shared = globalThis as typeof globalThis & {
  siterraPool?: Pool;
  siterraHub?: { close: () => Promise<void> };
};

let db: TestDatabase;
let instruments: typeof InstrumentsRoute;
let assets: typeof AssetRoute;
let cookie = "";
let otherCookie = "";

beforeAll(async () => {
  db = await freshDatabase();
  process.env["DATABASE_URL"] = db.url;
  process.env["SITERRA_BUNDLES_DIR"] = bundlesDir;
  shared.siterraPool = undefined;
  instruments = await import("./cases/[caseId]/instruments/route.ts");
  assets = await import("./cases/[caseId]/bundles/[bundleId]/assets/[assetKey]/route.ts");
  const record = exampleCase(caseId);
  await createCase(db.pool, record, "owner_example");
  const spec = {
    ...exampleSpec(caseId, "inst_example_route", [
      { entityId: "geo_example_guard", revision: 1 },
      { entityId: bundleId, revision: 1 },
      { entityId: "ev_example_guard", revision: 1 },
    ]),
    parameters: {
      kind: "rainfall_scatter" as const,
      geoSelectionId: "geo_example_guard",
      seasons: { bundleId, assetKey: "restrend_tables" },
      fit: { bundleId, assetKey: "restrend_long_record" },
    },
  };
  const outcome = await applyCommit(
    db.pool,
    exampleCommit(record, {
      id: "commit_example_routes",
      expected: 1,
      upserts: [
        exampleEvidence(caseId, "ev_example_guard"),
        { ...exampleBundle(caseId, bundleId, 1), contentHash },
        spec,
        exampleComponent(caseId, "comp_example_route", spec),
      ],
    }),
  );
  if (outcome.status !== "committed") throw new Error(outcome.status);
  cookie = `${sessionCookieName}=${await createSession(db.pool, { ownerScopeId: "owner_example", kind: "local", ttlSeconds: 3600 })}`;
  otherCookie = `${sessionCookieName}=${await createSession(db.pool, { ownerScopeId: "owner_example_other", kind: "local", ttlSeconds: 3600 })}`;
});

afterAll(async () => {
  await shared.siterraPool?.end();
  await db.drop();
});

function listing(query = "", headers: Record<string, string> = { cookie }, id = caseId) {
  return instruments.GET(
    new Request(`${origin}/api/cases/${id}/instruments${query}`, { headers }),
    {
      params: Promise.resolve({ caseId: id }),
    },
  );
}

function asset(
  assetKey: string,
  headers: Record<string, string> = {},
  id = caseId,
  bundle = bundleId,
) {
  return assets.GET(
    new Request(`${origin}/api/cases/${id}/bundles/${bundle}/assets/${assetKey}`, {
      headers: { cookie, ...headers },
    }),
    { params: Promise.resolve({ caseId: id, bundleId: bundle, assetKey }) },
  );
}

describe("GET /api/cases/:caseId/instruments", () => {
  it("answers 200 with the specs, their components and each asset resolved, never cached", async () => {
    const response = await listing();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = InstrumentListing.parse(await response.json());
    expect(body.caseId).toBe(caseId);
    expect(body.caseRevision).toBe(2);
    expect(body.instruments.map((i) => i.spec.id)).toEqual(["inst_example_route"]);
    expect(body.instruments[0]?.components.map((c) => c.id)).toEqual(["comp_example_route"]);
    expect(body.instruments[0]?.assets.map((a) => [a.assetKey, a.status])).toEqual([
      ["restrend_tables", "available"],
      ["restrend_long_record", "available"],
    ]);
  });

  it("the URL an asset names serves the file the checksum describes", async () => {
    const body = InstrumentListing.parse(await (await listing()).json());
    const tables = body.instruments[0]?.assets[0];
    expect(tables?.href).toBe(
      `/api/case-assets/${bundleId}/${contentHash}/restrend-long-record-tables.json`,
    );
    const bytes = readFileSync(`${bundleDir}restrend-long-record-tables.json`);
    expect(tables?.checksum).toBe(sha256Multihash(bytes));
    expect(tables?.size).toBe(bytes.length);
  });

  it("reads the case as of an earlier revision", async () => {
    const body = InstrumentListing.parse(await (await listing("?revision=1")).json());
    expect([body.caseRevision, body.instruments]).toEqual([1, []]);
  });

  it("answers 400 to a revision that is not a whole number of one or more, and 404 to one not reached", async () => {
    for (const bad of ["0", "-1", "abc", "1.5", ""]) {
      expect((await listing(`?revision=${bad}`)).status, bad).toBe(400);
    }
    expect((await listing("?revision=9")).status).toBe(404);
  });

  it("answers 401 without a session, and 404 to another owner and for a missing case", async () => {
    expect((await listing("", { cookie: "" })).status).toBe(401);
    expect((await listing("", { cookie: otherCookie })).status).toBe(404);
    expect((await listing("", { cookie }, "case_example_missing")).status).toBe(404);
  });
});

describe("GET /api/cases/:caseId/bundles/:bundleId/assets/:assetKey", () => {
  it("serves the file the collection lists under the key, with its type and an ETag of its checksum", async () => {
    const response = await asset("restrend_long_record");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("accept-ranges")).toBe("bytes");
    const body = Buffer.from(await response.arrayBuffer());
    expect(body.equals(readFileSync(`${bundleDir}restrend-long-record.json`))).toBe(true);
    expect(response.headers.get("etag")).toBe(`"${sha256Multihash(body)}"`);
  });

  it("is revalidated, not cached as immutable, because the key names whatever revision the case holds", async () => {
    const response = await asset("restrend_long_record");
    expect(response.headers.get("cache-control")).toBe("private, no-cache");
  });

  it("answers a Range request with 206 and the exact bytes, and 416 beyond the file", async () => {
    const full = readFileSync(`${bundleDir}restrend-long-record.json`);
    const part = await asset("restrend_long_record", { range: "bytes=0-99" });
    expect(part.status).toBe(206);
    expect(part.headers.get("content-range")).toBe(`bytes 0-99/${full.length}`);
    expect(Buffer.from(await part.arrayBuffer()).equals(full.subarray(0, 100))).toBe(true);
    expect((await asset("restrend_long_record", { range: "bytes=99999999-" })).status).toBe(416);
  });

  it("answers 404 for an unknown key, a key of another shape, an unknown bundle and a missing case", async () => {
    expect((await asset("no_such_asset")).status).toBe(404);
    expect((await asset("../collection.json")).status).toBe(404);
    expect((await asset("Restrend Tables")).status).toBe(404);
    expect((await asset("restrend_long_record", {}, caseId, "bundle_example_none")).status).toBe(
      404,
    );
    expect((await asset("restrend_long_record", {}, "case_example_missing")).status).toBe(404);
  });

  it("answers 401 without a session and 404 to another owner", async () => {
    expect((await asset("restrend_long_record", { cookie: "" })).status).toBe(401);
    expect((await asset("restrend_long_record", { cookie: otherCookie })).status).toBe(404);
  });
});
