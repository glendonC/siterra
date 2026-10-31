import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { analysisConfigFor } from "./index.ts";

// The second place's configuration: the same schema as the first place, its own words, and a
// rival explanation drawn from the history of its dam.

const repoDir = fileURLToPath(new URL("../../../../", import.meta.url));
const bundlesDir = join(repoDir, "data/bundles");
const config = analysisConfigFor("case_calaveras_creek");

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

const bundles = readdirSync(bundlesDir)
  .filter((name) => name.endsWith("_calaveras_creek"))
  .map((name) => {
    const collection = readJson(join(bundlesDir, name, "collection.json")) as {
      id: string;
      assets: Record<string, unknown>;
      "siterra:method"?: { id: string; version: string };
    };
    return {
      id: collection.id,
      assets: Object.keys(collection.assets),
      method: collection["siterra:method"],
    };
  });

describe("the Calaveras Creek configuration", () => {
  it("is registered under its case ID and names the dam's history as a rival explanation", () => {
    expect(config).not.toBeNull();
    expect(config?.explanations.map((e) => e.id)).toEqual([
      "rainfall",
      "grazing",
      "dam_history",
      "land_cover_change",
      "data_artefact",
    ]);
    const dam = config?.explanations.find((e) => e.id === "dam_history");
    expect(dam?.label).toBe("Dam history");
    expect(dam?.statement).toContain("Calaveras Dam");
    expect(dam?.statement).toContain("replacement of the dam");
  });

  it("states in a note that its explanations were drafted without the trend values, and that they assume no direction", () => {
    expect(config?.note).toContain("did not read the Calaveras Creek bundles");
    expect(config?.note).toContain("had seen the headline");
    for (const e of config?.explanations ?? []) {
      expect(e.statement, e.id).toMatch(/raise|lower|higher|changed|shaped/);
      expect(e.statement, e.id).toMatch(
        /(raised or lowered|raising or lowering|higher or lower|or the reverse)/,
      );
    }
  });

  it("words the rainfall scatter without choosing a direction or a strength for the fit", () => {
    const rule = config?.instruments?.find((r) => r.id === "rainfall_scatter_creek");
    const ink = rule?.from === "parameters" ? rule.caption.ink : "";
    expect(ink).toBe(
      "R squared {r2} between October to April rainfall and February to May greenness.",
    );
    expect(ink).not.toMatch(/together|explain|little|strong|weak|modest/);
  });

  it("states no date of the dam's history: the retrieved sources do not support the years", () => {
    for (const e of config?.explanations ?? []) expect(e.statement).not.toMatch(/\d/);
  });

  it("has a field check for every explanation and every pair of explanations is separated by one", () => {
    const checks = config?.fieldChecks ?? [];
    expect(checks.map((c) => c.id)).toEqual([
      "local_rain_records",
      "grazing_records",
      "reservoir_records",
      "land_cover_history",
      "scene_inspection",
    ]);
    const ids = config?.explanations.map((e) => e.id) ?? [];
    const key = (a: string, b: string) => [a, b].sort().join("|");
    const separated = new Set(checks.flatMap((c) => c.separates.map(([a, b]) => key(a, b))));
    for (const [i, a] of ids.entries()) {
      for (const b of ids.slice(i + 1)) expect(separated).toContain(key(a, b));
    }
    for (const check of checks) {
      expect(check.label).toMatch(/^[A-Z][a-z]+( [A-Z][a-z]+){0,2}$/);
      expect(check.basis).toContain("no domain expert has reviewed it");
    }
  });

  it("uses the October to April rainfall window and the strata the restrend bundle holds", () => {
    expect(config?.rainfallSeason).toMatchObject({ startMonth: 10, endMonth: 4 });
    const restrend = bundles.find((b) => b.method?.id === "restrend_long_record");
    expect(config?.trendSummary?.recipe).toEqual({
      recipeId: "restrend_long_record",
      version: restrend?.method?.version,
    });
    const table = readJson(
      join(bundlesDir, "bundle_restrend_long_record_calaveras_creek/restrend-long-record.json"),
    ) as { headline: Record<string, unknown> };
    expect([...(config?.trendSummary?.strata ?? [])].sort()).toEqual(
      Object.keys(table.headline).sort(),
    );
  });

  it("opens an instrument only on bundles, assets and measurement rows of this place", () => {
    const rows = readJson(join(repoDir, "data/case/calaveras-creek/measurement-rows.json")) as {
      rows: { rowId: string }[];
    };
    const rowIds = new Set(rows.rows.map((r) => `meas_${r.rowId}`));
    for (const rule of config?.instruments ?? []) {
      if (rule.from !== "parameters") continue;
      expect(JSON.stringify(rule.parameters)).not.toMatch(/ait_bouguemez/);
      expect(rule.parameters.geoSelectionId).toBe("geo_calaveras_creek_catchment");
      for (const id of rule.caption.citationIds) expect(rowIds).toContain(id);
      const assets = [
        ...JSON.stringify(rule.parameters).matchAll(/"bundleId":"([^"]+)","assetKey":"([^"]+)"/g),
      ];
      expect(assets.length).toBeGreaterThan(0);
      for (const [, bundleId, assetKey] of assets) {
        expect(bundles.find((b) => b.id === bundleId)?.assets).toContain(assetKey);
      }
    }
  });

  it("names a vegetation series and a rainfall season this place has no bundle for: the case reports them as gaps", () => {
    const methods = new Set(bundles.map((b) => b.method?.id));
    const pair = config?.seriesPairs[0];
    expect(methods).not.toContain(pair?.a.methodId);
    expect(methods).toContain(pair?.b.methodId);
    expect(methods).not.toContain(config?.rainfallSeason.recipe.recipeId);
  });

  it("defines 3 direction-neutral suggested questions citing real Calaveras seed measurements", async () => {
    const { composeSuggestedQuestions } = await import("../instruments-compose.ts");
    expect(config?.suggestedQuestions?.length).toBe(3);
    const rows = readJson(join(repoDir, "data/case/calaveras-creek/measurement-rows.json")) as {
      rows: { rowId: string }[];
    };
    const measurements = rows.rows.map((r) => ({
      id: `meas_${r.rowId}`,
      status: "available" as const,
    }));
    const checked = composeSuggestedQuestions(
      { suggestedQuestions: config?.suggestedQuestions },
      { measurements, evidence: [] },
    );
    expect(checked.issues).toEqual([]);
    expect(checked.suggestedQuestions).toEqual(config?.suggestedQuestions);
  });
});
