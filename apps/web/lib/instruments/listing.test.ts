import { describe, expect, it } from "vitest";
import {
  AssetUnavailable,
  instrumentOf,
  loadInstruments,
  readAsset,
  readJsonAsset,
} from "./listing";
import { bundleFiles, seed, seedListing } from "./seed-listing";

// The seed case's listing as the API would return it (seed-listing.ts).

const listing = seedListing;
const reply = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status });
const files = bundleFiles;

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

describe("instrumentOf", () => {
  it("passes over a spec that is not ready", () => {
    const stale = {
      ...listing,
      instruments: listing.instruments.map((v) =>
        v.spec.parameters.kind === "rainfall_scatter"
          ? { ...v, spec: { ...v.spec, status: "stale" as const } }
          : v,
      ),
    };
    expect(instrumentOf(stale, "rainfall_scatter")).toBeUndefined();
    expect(instrumentOf(stale, "layer_stack")).toBeDefined();
  });
});

describe("readAsset", () => {
  it("names why an asset the listing marks unavailable is not read, and fetches nothing", async () => {
    const view = instrumentOf(listing, "rainfall_scatter");
    if (view === undefined) throw new Error("no rainfall scatter in the seed");
    const ref = view.spec.parameters.fit;
    const missing = {
      ...view,
      assets: view.assets.map((a) =>
        a.assetKey === ref.assetKey
          ? {
              ...a,
              status: "file_unavailable" as const,
              href: null,
              contentType: null,
              checksum: null,
              size: null,
            }
          : a,
      ),
    };
    let fetched = 0;
    const read = readAsset(missing, ref, () => {
      fetched++;
      return Promise.resolve(new Response("{}"));
    });
    await expect(read).rejects.toMatchObject({ reason: "file_unavailable" });
    expect(fetched).toBe(0);
  });
});
