import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { StacCollection, StacItem } from "./stac.ts";

const repoDir = fileURLToPath(new URL("../../../", import.meta.url));
const examplesDir = `${repoDir}schemas/examples/`;
const bundlesDir = `${repoDir}data/bundles/`;

type Json = { [key: string]: unknown };

function readJson(path: string): Json {
  return JSON.parse(readFileSync(path, "utf8")) as Json;
}

function issuesOf(result: { error?: { issues: { code: string; path: PropertyKey[] }[] } }) {
  return (result.error?.issues ?? []).map((i) => ({ code: i.code, path: i.path }));
}

describe("contract: STAC examples", () => {
  it("stac-collection-ndvi.json parses as a bundle Collection", () => {
    expect(
      issuesOf(StacCollection.safeParse(readJson(`${examplesDir}stac-collection-ndvi.json`))),
    ).toEqual([]);
  });

  it("stac-item-ndvi-2022-04.json parses as a period Item", () => {
    expect(
      issuesOf(StacItem.safeParse(readJson(`${examplesDir}stac-item-ndvi-2022-04.json`))),
    ).toEqual([]);
  });
});

const bundleIds = readdirSync(bundlesDir, { withFileTypes: true })
  .filter((d) => d.isDirectory() && d.name.startsWith("bundle_"))
  .map((d) => d.name)
  .sort();

describe("contract: bundles in data/bundles", () => {
  it("finds the bundles", () => {
    expect(bundleIds.length).toBeGreaterThan(0);
  });

  it.each(bundleIds)("%s: the Collection and every Item parse", (bundleId) => {
    const collection = readJson(`${bundlesDir}${bundleId}/collection.json`);
    expect(issuesOf(StacCollection.safeParse(collection))).toEqual([]);
    const itemDirs = readdirSync(`${bundlesDir}${bundleId}`, { withFileTypes: true })
      .filter((d) => d.isDirectory() && d.name.startsWith("period_"))
      .map((d) => d.name);
    for (const period of itemDirs) {
      const item = readJson(`${bundlesDir}${bundleId}/${period}/${period}.json`);
      expect({ period, issues: issuesOf(StacItem.safeParse(item)) }).toEqual({
        period,
        issues: [],
      });
    }
  });
});

describe("contract: invalid STAC documents fail with the expected code", () => {
  it("SV-04 (contract part): an unavailable STAC measurement carrying 0", () => {
    const item = readJson(`${examplesDir}stac-item-ndvi-2022-04.json`);
    const props = item["properties"] as Json;
    const m = (props["siterra:measurements"] as Json[])[0] as Json;
    m["status"] = "missing";
    m["value"] = 0;
    expect(issuesOf(StacItem.safeParse(item))).toContainEqual({
      code: "custom",
      path: ["properties", "siterra:measurements", 0, "value"],
    });
  });

  it("a siterra: field the extension does not define", () => {
    const collection = readJson(`${examplesDir}stac-collection-ndvi.json`);
    collection["siterra:score"] = 1;
    expect(issuesOf(StacCollection.safeParse(collection))).toContainEqual({
      code: "custom",
      path: ["siterra:score"],
    });
  });

  it("a validated bundle with a failed check", () => {
    const collection = readJson(`${examplesDir}stac-collection-ndvi.json`);
    const checks = collection["siterra:checks"] as Json[];
    (checks[0] as Json)["passed"] = false;
    expect(issuesOf(StacCollection.safeParse(collection))).toContainEqual({
      code: "custom",
      path: ["siterra:checks", 0, "passed"],
    });
  });

  it("an Item id that is not a calendar month period", () => {
    const item = readJson(`${examplesDir}stac-item-ndvi-2022-04.json`);
    item["id"] = "period_2022-13";
    expect(issuesOf(StacItem.safeParse(item))).toContainEqual({
      code: "invalid_format",
      path: ["id"],
    });
  });
});

describe("STAC extension 1.1.0", () => {
  it("accepts an Item that lists the 1.1.0 identifier and a measurement entry with its own reason", () => {
    const item = readJson(`${examplesDir}stac-item-ndvi-2022-04.json`);
    item["stac_extensions"] = (item["stac_extensions"] as string[]).map((u) =>
      u.replace("/1.0.0/", "/1.1.0/"),
    );
    const m = ((item["properties"] as Json)["siterra:measurements"] as Json[])[0] as Json;
    m["status"] = "excluded";
    m["value"] = null;
    m["missing_reason"] = "Synthetic reason";
    expect(issuesOf(StacItem.safeParse(item))).toEqual([]);
  });

  it("rejects a missing reason on an available measurement entry", () => {
    const item = readJson(`${examplesDir}stac-item-ndvi-2022-04.json`);
    const m = ((item["properties"] as Json)["siterra:measurements"] as Json[])[0] as Json;
    m["missing_reason"] = "Synthetic reason";
    expect(issuesOf(StacItem.safeParse(item))).toContainEqual({
      code: "custom",
      path: ["properties", "siterra:measurements", 0, "missing_reason"],
    });
  });

  it("accepts snow_cover_fraction as a bundle variable in the JSON schema and Zod mirror", () => {
    const schema = readJson(`${repoDir}schemas/stac/siterra-extension.schema.json`);
    const defs = schema["definitions"] as Json;
    const variableDef = defs["siterra:variable"] as { enum: string[] };
    expect(variableDef.enum).toContain("snow_cover_fraction");

    const collection = readJson(`${examplesDir}stac-collection-ndvi.json`);
    collection["siterra:variable"] = "snow_cover_fraction";
    expect(issuesOf(StacCollection.safeParse(collection))).toEqual([]);
  });

  it("accepts drainage_network as a bundle variable in the JSON schema and Zod mirror", () => {
    const schema = readJson(`${repoDir}schemas/stac/siterra-extension.schema.json`);
    const defs = schema["definitions"] as Json;
    const variableDef = defs["siterra:variable"] as { enum: string[] };
    expect(variableDef.enum).toContain("drainage_network");

    const collection = readJson(`${examplesDir}stac-collection-ndvi.json`);
    collection["siterra:variable"] = "drainage_network";
    expect(issuesOf(StacCollection.safeParse(collection))).toEqual([]);
  });

  it.each(["elevation_profile", "pixel_anatomy"])(
    "accepts %s as a bundle variable in the JSON schema and Zod mirror",
    (variable) => {
      const schema = readJson(`${repoDir}schemas/stac/siterra-extension.schema.json`);
      const defs = schema["definitions"] as Json;
      const variableDef = defs["siterra:variable"] as { enum: string[] };
      expect(variableDef.enum).toContain(variable);

      const collection = readJson(`${examplesDir}stac-collection-ndvi.json`);
      collection["siterra:variable"] = variable;
      expect(issuesOf(StacCollection.safeParse(collection))).toEqual([]);
    },
  );

  it("still refuses a variable the extension does not list", () => {
    const collection = readJson(`${examplesDir}stac-collection-ndvi.json`);
    collection["siterra:variable"] = "river_depth";
    expect(issuesOf(StacCollection.safeParse(collection))).toContainEqual({
      code: "invalid_value",
      path: ["siterra:variable"],
    });
  });
});
