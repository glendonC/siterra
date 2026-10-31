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

// The stored GBIF occurrences are served like any bundle asset (checksum, type, byte ranges), so
// the map can draw its points from the file without a record per point.

const bundlesDir = fileURLToPath(new URL("../../../../data/bundles/", import.meta.url));
const origin = "http://127.0.0.1:4350";
const shared = globalThis as typeof globalThis & { siterraPool?: Pool };
const bundles = [
  "bundle_species_occurrences_ait_bouguemez",
  "bundle_species_occurrences_calaveras_creek",
];

let db: TestDatabase;
let route: typeof AssetRoute;
let cookie = "";

beforeAll(async () => {
  db = await freshDatabase();
  process.env["DATABASE_URL"] = db.url;
  process.env["SITERRA_BUNDLES_DIR"] = bundlesDir;
  shared.siterraPool = undefined;
  route = await import("./case-assets/[bundleId]/[contentHash]/[...assetPath]/route.ts");
  await createCase(db.pool, exampleCase("case_example_species"), "owner_example");
  for (const id of bundles) {
    const hash = sha256Multihash(readFileSync(`${bundlesDir}${id}/collection.json`));
    await db.pool.query(
      `insert into records (case_id, entity_id, revision, record_type, record, case_revision)
       values ($1, $2, 1, 'DataBundle', jsonb_build_object('recordType', 'DataBundle', 'id', $2::text, 'revision', 1, 'contentHash', $3::text), 1)`,
      ["case_example_species", id, hash],
    );
  }
  cookie = `${sessionCookieName}=${await createSession(db.pool, { ownerScopeId: "owner_example", kind: "local", ttlSeconds: 3600 })}`;
});

afterAll(async () => {
  await shared.siterraPool?.end();
  await db.drop();
});

function get(bundleId: string, path: string, headers: Record<string, string> = {}) {
  const contentHash = sha256Multihash(readFileSync(`${bundlesDir}${bundleId}/collection.json`));
  return route.GET(
    new Request(`${origin}/api/case-assets/${bundleId}/${contentHash}/${path}`, {
      headers: { cookie, ...headers },
    }),
    { params: Promise.resolve({ bundleId, contentHash, assetPath: path.split("/") }) },
  );
}

describe.each(bundles)("the occurrences asset of %s", (bundleId) => {
  const file = readFileSync(`${bundlesDir}${bundleId}/occurrences.json`);

  it("is served whole as JSON with the ETag of its checksum", async () => {
    const response = await get(bundleId, "occurrences.json");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json");
    expect(response.headers.get("accept-ranges")).toBe("bytes");
    expect(response.headers.get("etag")).toBe(`"${sha256Multihash(file)}"`);
    expect(Buffer.from(await response.arrayBuffer()).equals(file)).toBe(true);
  });

  it("answers a byte range with the exact bytes", async () => {
    const response = await get(bundleId, "occurrences.json", { range: "bytes=0-99" });
    expect(response.status).toBe(206);
    expect(response.headers.get("content-range")).toBe(`bytes 0-99/${file.length}`);
    expect(Buffer.from(await response.arrayBuffer()).equals(file.subarray(0, 100))).toBe(true);
  });

  it("is the file the bundle manifest lists under the key 'occurrences'", () => {
    const manifest = JSON.parse(
      readFileSync(`${bundlesDir}${bundleId}/collection.json`, "utf8"),
    ) as { assets: Record<string, { href: string; "file:checksum": string }> };
    expect(manifest.assets["occurrences"]?.href).toBe("./occurrences.json");
    expect(manifest.assets["occurrences"]?.["file:checksum"]).toBe(sha256Multihash(file));
  });
});
