// Test support, read by tests only: the listing GET /api/cases/:id/instruments would return for the seed case
// (packages/contracts/fixtures), each asset its specs name resolved to its bundle file in data/bundles with the
// checksum the bundle's collection lists, and a fetch that serves those files at their case asset URLs.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { CaseSnapshot, InstrumentListing } from "@siterra/contracts";
import type { CaseTerrain } from "../land/terrain";

const REPO = join(import.meta.dirname, "..", "..", "..", "..");
const BUNDLES = join(REPO, "data", "bundles");

export const seed = JSON.parse(
  readFileSync(
    join(REPO, "packages", "contracts", "fixtures", "case-snapshot-aitbouguemez-seed.json"),
    "utf8",
  ),
) as CaseSnapshot;

const seedConfig = JSON.parse(
  readFileSync(join(REPO, "packages", "domain", "src", "cases", "case_aitbouguemez.json"), "utf8"),
) as { suggestedQuestions?: InstrumentListing["suggestedQuestions"] };

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
  suggestedQuestions: seedConfig.suggestedQuestions ?? [],
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

/**
 * A stand-in for readCaseTerrain in Node (no image decoder): the seed's relief and land cover headers and its relief
 * grid as the loader reads them, with empty images. Enough for the loaders' tests, which check what they build
 * around the land, not the land's pixels.
 */
export const seedTerrain = async (): Promise<CaseTerrain> => {
  const { fillRelief, rasterHeader, terrainMeta } = await import("../land/terrain");
  const rh = rasterHeader(
    JSON.parse(
      readFileSync(
        join(BUNDLES, "bundle_relief_ait_bouguemez", "elevation-surface.bin.json"),
        "utf8",
      ),
    ),
  );
  const ch = rasterHeader(
    JSON.parse(
      readFileSync(join(BUNDLES, "bundle_land_cover_ait_bouguemez", "land-cover.png.json"), "utf8"),
    ),
  );
  const bytes = readFileSync(join(BUNDLES, "bundle_relief_ait_bouguemez", "elevation-surface.bin"));
  const v = new Float32Array(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  );
  const { heights, range } = fillRelief(v, rh.grid.width, rh.grid.height, rh.nodata);
  const empty = { width: 0, height: 0, close: () => undefined } as unknown as ImageBitmap;
  return {
    zone: rh.zone,
    meta: terrainMeta(rh.grid, ch.grid),
    relief: heights,
    range,
    landcover: empty,
    bands: null,
  };
};
