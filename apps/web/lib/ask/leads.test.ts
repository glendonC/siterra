import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { seed, seedListing } from "../instruments/seed-listing";
import { leadSourcesOf, loadViewLeads } from "./leads";

// Each view's lead, read from the seed's own bundle files through the read API's two addresses (a case asset by its
// URL, a bundle asset by its key with its checksum as the ETag), checksums checked as the page checks them. The lines
// are the ones the views show for the place (shots of Elevation Bands, Inside One Pixel, Rain and Greenness and Year by
// Year, fix round 1103).

const BUNDLES = join(import.meta.dirname, "..", "..", "..", "..", "data", "bundles");

const collection = (bundleId: string) =>
  JSON.parse(readFileSync(join(BUNDLES, bundleId, "collection.json"), "utf8")) as {
    assets: Record<string, { href: string; "file:checksum": string }>;
  };

/** The read API over data/bundles; `refuse` names bundles it answers 404 for. */
const files =
  (refuse: readonly string[] = []) =>
  (input: string): Promise<Response> => {
    const path = new URL(input, "http://read.invalid").pathname.split("/").slice(1);
    const caseAsset = path[1] === "case-assets";
    const bundleId = (caseAsset ? path[2] : path[4]) ?? "";
    if (refuse.includes(bundleId)) return Promise.resolve(new Response(null, { status: 404 }));
    if (caseAsset)
      return Promise.resolve(new Response(readFileSync(join(BUNDLES, bundleId, ...path.slice(4)))));
    const asset = collection(bundleId).assets[path[6] ?? ""];
    return Promise.resolve(
      asset
        ? new Response(readFileSync(join(BUNDLES, bundleId, asset.href.replace("./", ""))), {
            headers: { ETag: `"${asset["file:checksum"]}"` },
          })
        : new Response(null, { status: 404 }),
    );
  };

describe("the views' leads", () => {
  it("says what each view says first, in its own words, from the place's own data", async () => {
    expect(await loadViewLeads(leadSourcesOf(seed), seedListing, files())).toEqual({
      cutaway: [
        "Greenness (NDVI) rose most below 2,317 m",
        "Averaged over the whole catchment, all three bands got greener, each by more than its margin of error.",
      ],
      pixel: [
        "This pixel got greener from 2000 to 2025.",
        "Trees and fields cover 46% of it. More trees or fields alone would make it look greener, even if its grassland did not change.",
      ],
      rainfall: [
        "Year to year, March to June greenness follows September to May rainfall only weakly.",
      ],
      time: ["Of the pixels that stepped up to greener, half did so by 2011."],
    });
  });

  it("reads only the views asked for", async () => {
    const read: string[] = [];
    const leads = await loadViewLeads(
      leadSourcesOf(seed),
      seedListing,
      (input) => {
        read.push(input);
        return files()(input);
      },
      ["rainfall"],
    );
    expect(Object.keys(leads)).toEqual(["rainfall"]);
    expect(read.every((u) => u.includes("bundle_restrend_long_record_ait_bouguemez"))).toBe(true);
  });

  it("leaves out a view whose data cannot be read, or whose record lacks what it needs, and never guesses", async () => {
    const refused = await loadViewLeads(
      leadSourcesOf(seed),
      seedListing,
      files(["bundle_restrend_long_record_ait_bouguemez", "bundle_pixel_seasons_ait_bouguemez"]),
    );
    expect(Object.keys(refused).sort()).toEqual(["cutaway", "pixel"]);
    const bare = await loadViewLeads(
      { caseId: seed.case.id, limits: null, seasons: null },
      seedListing,
      files(),
      ["cutaway", "time"],
    );
    expect(bare).toEqual({});
    const none = await loadViewLeads(
      leadSourcesOf(seed),
      { ...seedListing, instruments: [] },
      files(),
      ["cutaway", "pixel", "rainfall"],
    );
    expect(none).toEqual({});
  });

  it("refuses a file whose bytes are not the listing's", async () => {
    const tampered = await loadViewLeads(
      leadSourcesOf(seed),
      seedListing,
      (input) =>
        input.includes("bundle_restrend_long_record_ait_bouguemez")
          ? Promise.resolve(new Response('{"tampered":true}'))
          : files()(input),
      ["rainfall"],
    );
    expect(tampered).toEqual({});
  });
});
