// Test support, read by tests only: the listing GET /api/cases/:id/instruments would return for the seed case
// (packages/contracts/fixtures), each asset its specs name resolved to its bundle file in data/bundles with the
// checksum the bundle's collection lists, and a fetch that serves those files at their case asset URLs.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { CaseSnapshot, InstrumentListing } from "@siterra/contracts";

const REPO = join(import.meta.dirname, "..", "..", "..", "..");
const BUNDLES = join(REPO, "data", "bundles");

export const seed = JSON.parse(
  readFileSync(
    join(REPO, "packages", "contracts", "fixtures", "case-snapshot-aitbouguemez-seed.json"),
    "utf8",
  ),
) as CaseSnapshot;

const collection = (bundleId: string) =>
  JSON.parse(readFileSync(join(BUNDLES, bundleId, "collection.json"), "utf8")) as {
    assets: Record<string, { href: string; "file:checksum": string; "file:size": number }>;
  };
const refsOf = (value: unknown): { bundleId: string; assetKey: string }[] =>
  value !== null && typeof value === "object"
    ? "bundleId" in value && "assetKey" in value
      ? [value as { bundleId: string; assetKey: string }]
      : Object.values(value).flatMap(refsOf)
    : [];

/** The content hash in a test URL; the case asset route's is the bundle's, which these tests do not need. */
const HASH = "seed";

export const seedListing = {
  caseId: seed.case.id,
  caseRevision: seed.case.revision,
  instruments: (seed.records.instrumentSpecRecords ?? []).map((spec) => ({
    spec,
    components: [],
    assets: [
      ...new Map(refsOf(spec.parameters).map((r) => [`${r.bundleId} ${r.assetKey}`, r])).values(),
    ].map((ref) => {
      const a = collection(ref.bundleId).assets[ref.assetKey];
      return {
        ...ref,
        status: "available",
        href: `/api/case-assets/${ref.bundleId}/${HASH}/${a?.href.replace("./", "") ?? "?"}`,
        contentType: "application/json",
        checksum: a?.["file:checksum"] ?? null,
        size: a?.["file:size"] ?? null,
      };
    }),
  })),
} as InstrumentListing;

/** Serves a case asset URL from data/bundles. */
export const bundleFiles = (url: string) => {
  const [, , , bundleId = "", , ...path] = url.split("/");
  return Promise.resolve(new Response(readFileSync(join(BUNDLES, bundleId, ...path))));
};
