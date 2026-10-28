import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  type Pool,
  createCase,
  createSession,
  sessionCookieName,
  sha256Multihash,
} from "@siterra/db";
import { type TestDatabase, exampleCase, freshDatabase } from "@siterra/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type * as AssetRoute from "./case-assets/[bundleId]/[contentHash]/[...assetPath]/route.ts";
import { parseByteRange } from "./byte-range.ts";

const bundlesDir = fileURLToPath(new URL("../../../../data/bundles/", import.meta.url));
const bundleId = "bundle_chirps_monthly_ait_bouguemez";
const collection = readFileSync(`${bundlesDir}${bundleId}/collection.json`);
const contentHash = sha256Multihash(collection);
const origin = "http://127.0.0.1:4350";
const caseId = "case_example_assets";
const shared = globalThis as typeof globalThis & {
  siterraPool?: Pool;
  siterraHub?: { close: () => Promise<void> };
};

let db: TestDatabase;
let route: typeof AssetRoute;
let cookie = "";
let otherCookie = "";

beforeAll(async () => {
  db = await freshDatabase();
  process.env["DATABASE_URL"] = db.url;
  process.env["SITERRA_BUNDLES_DIR"] = bundlesDir;
  shared.siterraPool = undefined;
  route = await import("./case-assets/[bundleId]/[contentHash]/[...assetPath]/route.ts");
  await createCase(db.pool, exampleCase(caseId), "owner_example");
  const bundle = JSON.parse(collection.toString("utf8")) as { id: string };
  await db.pool.query(
    `insert into records (case_id, entity_id, revision, record_type, record, case_revision)
     values ($1, $2, 1, 'DataBundle', jsonb_build_object('recordType', 'DataBundle', 'id', $2::text, 'revision', 1, 'contentHash', $3::text), 1)`,
    [caseId, bundle.id, contentHash],
  );
  cookie = `${sessionCookieName}=${await createSession(db.pool, { ownerScopeId: "owner_example", kind: "local", ttlSeconds: 3600 })}`;
  otherCookie = `${sessionCookieName}=${await createSession(db.pool, { ownerScopeId: "owner_example_other", kind: "local", ttlSeconds: 3600 })}`;
});

afterAll(async () => {
  await shared.siterraPool?.end();
  await db.drop();
});

function get(path: string, headers: Record<string, string> = {}) {
  const parts = path.split("/");
  const request = new Request(`${origin}/api/case-assets/${bundleId}/${contentHash}/${path}`, {
    headers: { cookie, ...headers },
  });
  return route.GET(request, {
    params: Promise.resolve({ bundleId, contentHash, assetPath: parts }),
  });
}

describe("GET /api/case-assets/:bundleId/:contentHash/:path", () => {
  it("answers 200 with the file, its type, Accept-Ranges and an ETag of its checksum", async () => {
    const response = await get("rainfall-cells.geojson");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/geo+json");
    expect(response.headers.get("accept-ranges")).toBe("bytes");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    const body = Buffer.from(await response.arrayBuffer());
    expect(body.equals(readFileSync(`${bundlesDir}${bundleId}/rainfall-cells.geojson`))).toBe(true);
    expect(response.headers.get("etag")).toBe(`"${sha256Multihash(body)}"`);
  });

  it("GATE-04 (serving part): answers a Range request with 206 and the exact bytes", async () => {
    const response = await get("period_2022-04/cell-values.json", { range: "bytes=0-99" });
    expect(response.status).toBe(206);
    const full = readFileSync(`${bundlesDir}${bundleId}/period_2022-04/cell-values.json`);
    expect(response.headers.get("content-range")).toBe(`bytes 0-99/${full.length}`);
    expect(Buffer.from(await response.arrayBuffer()).equals(full.subarray(0, 100))).toBe(true);
  });

  it("answers 416 for a range beyond the file", async () => {
    const response = await get("period_2022-04/cell-values.json", { range: "bytes=999999-" });
    expect(response.status).toBe(416);
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("answers an invalid range such as bytes=5-3 with 200 and the whole file (RFC 9110)", async () => {
    const full = readFileSync(`${bundlesDir}${bundleId}/period_2022-04/cell-values.json`);
    const response = await get("period_2022-04/cell-values.json", { range: "bytes=5-3" });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-range")).toBeNull();
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(Buffer.from(await response.arrayBuffer()).equals(full)).toBe(true);
  });

  it("answers 404 to an owner whose cases do not hold the bundle, and 401 without a session", async () => {
    expect((await get("rainfall-cells.geojson", { cookie: otherCookie })).status).toBe(404);
    expect((await get("rainfall-cells.geojson", { cookie: "" })).status).toBe(401);
    expect((await get("not-listed.json")).status).toBe(404);
  });
});

describe("the records point at this route", () => {
  it("the fixture's manifestUri for the CHIRPS bundle is answered with its collection.json", async () => {
    const fixture = JSON.parse(
      readFileSync(
        fileURLToPath(
          new URL(
            "../../../../packages/contracts/fixtures/case-snapshot-aitbouguemez-seed.json",
            import.meta.url,
          ),
        ),
        "utf8",
      ),
    ) as { records: { dataBundleRecords: { id: string; manifestUri: string }[] } };
    const uri = fixture.records.dataBundleRecords.find((b) => b.id === bundleId)?.manifestUri ?? "";
    expect(uri.startsWith("/api/case-assets/")).toBe(true);
    const [, , , id, hash, ...rest] = uri.split("/");
    expect([id, hash, rest.join("/")]).toEqual([bundleId, contentHash, "collection.json"]);
    const response = await get("collection.json");
    expect(response.status).toBe(200);
    expect(Buffer.from(await response.arrayBuffer()).equals(collection)).toBe(true);
  });
});

describe("byte ranges", () => {
  it.each([
    ["bytes=0-9", { start: 0, end: 9 }],
    ["bytes=5-", { start: 5, end: 99 }],
    ["bytes=-10", { start: 90, end: 99 }],
    ["bytes=90-200", { start: 90, end: 99 }],
  ])("%s on 100 bytes", (header, expected) => {
    expect(parseByteRange(header, 100)).toEqual(expected);
  });

  it("answers unsatisfiable or the whole file where it should", () => {
    expect(parseByteRange("bytes=100-", 100)).toBe("unsatisfiable");
    expect(parseByteRange("bytes=-0", 100)).toBe("unsatisfiable");
    expect(parseByteRange("bytes=0-1,5-6", 100)).toBeNull();
    expect(parseByteRange("bytes=5-3", 100)).toBeNull();
    expect(parseByteRange("bytes=150-120", 100)).toBeNull();
    expect(parseByteRange("bytes=5-5", 100)).toEqual({ start: 5, end: 5 });
    expect(parseByteRange(null, 100)).toBeNull();
  });
});
