import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { CaseSnapshot, InstrumentListing } from "@siterra/contracts";
import { describe, expect, it } from "vitest";
import { AssetUnavailable, instrumentOf, loadInstruments, readJsonAsset } from "./listing";

// The listing the API would return for the seed case: its four specs, each named asset resolved to its bundle file
// with the checksum the bundle's collection lists.

const REPO = join(import.meta.dirname, "..", "..", "..", "..");
const seed = JSON.parse(
  readFileSync(
    join(
      import.meta.dirname,
      "..",
      "..",
      "..",
      "..",
      "packages",
      "contracts",
      "fixtures",
      "case-snapshot-aitbouguemez-seed.json",
    ),
    "utf8",
  ),
) as CaseSnapshot;
const BUNDLES = join(REPO, "data", "bundles");
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

const listing = {
  caseId: seed.case.id,
  caseRevision: seed.case.revision,
  instruments: (seed.records.instrumentSpecRecords ?? []).map((spec) => ({
    spec,
    components: [],
    assets: refsOf(spec.parameters).map((ref) => {
      const a = collection(ref.bundleId).assets[ref.assetKey];
      return {
        ...ref,
        status: "available",
        href: `/files/${ref.bundleId}/${a?.href.replace("./", "") ?? "?"}`,
        contentType: "application/json",
        checksum: a?.["file:checksum"] ?? null,
        size: a?.["file:size"] ?? null,
      };
    }),
  })),
} as InstrumentListing;

const reply = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status });
const files = (path: string) =>
  Promise.resolve(new Response(readFileSync(join(BUNDLES, path.replace("/files/", "")))));

describe("loadInstruments", () => {
  it("returns the seed case's specs parsed by the shared contract", async () => {
    const r = await loadInstruments(seed.case.id, (url) => {
      expect(url).toBe(`/api/cases/${seed.case.id}/instruments`);
      return Promise.resolve(reply(200, listing));
    });
    expect(r.status).toBe("ready");
    if (r.status === "ready")
      expect(r.listing.instruments.map((v) => v.spec.parameters.kind).sort()).toEqual([
        "cross_section",
        "layer_stack",
        "pixel_anatomy",
        "rainfall_scatter",
      ]);
  });

  it("refuses a body that is not a listing and names missing sessions and cases", async () => {
    expect((await loadInstruments("x", () => Promise.resolve(reply(200, {})))).status).toBe(
      "invalid",
    );
    expect((await loadInstruments("x", () => Promise.resolve(reply(401)))).status).toBe(
      "unauthenticated",
    );
    expect((await loadInstruments("x", () => Promise.resolve(reply(404)))).status).toBe(
      "not_found",
    );
  });
});

describe("readJsonAsset", () => {
  const scatter = instrumentOf(listing, "rainfall_scatter");

  it("reads an asset a spec names when its bytes match the listing's checksum", async () => {
    if (scatter === undefined) throw new Error("no rainfall scatter in the seed");
    const fit = (await readJsonAsset(scatter, scatter.spec.parameters.fit, files)) as {
      recipeId: string;
    };
    expect(fit.recipeId).toBe("restrend_long_record");
  });

  it("refuses bytes that differ from the checksum", async () => {
    if (scatter === undefined) throw new Error("no rainfall scatter in the seed");
    await expect(
      readJsonAsset(scatter, scatter.spec.parameters.fit, () =>
        Promise.resolve(new Response("{}")),
      ),
    ).rejects.toBeInstanceOf(AssetUnavailable);
  });
});
