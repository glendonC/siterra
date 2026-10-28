import { describe, expect, it } from "vitest";

import { strictSubsetIssues } from "../model/strict-schema.ts";
import { CASE_ID, bundle, testStore } from "../testing/case-fixture.ts";
import { readCaseTool, readDatasetManifestTool, summarizeObservationsTool } from "./read-tools.ts";
import { ToolRegistry, caseToolRegistry } from "./registry.ts";
import { ToolFailure } from "./tool.ts";
import type { ParsedArgs, ToolHandler, ToolOutput } from "./tool.ts";

const signal = new AbortController().signal;

/** Any handler, whatever its argument type: parse, then run with the parsed value. */
interface Runnable {
  parse(args: unknown): ParsedArgs<unknown>;
  run(args: never, signal: AbortSignal): Promise<ToolOutput>;
}

function run(tool: Runnable, args: unknown): Promise<ToolOutput> {
  const parsed = tool.parse(args);
  if (!parsed.ok) throw new Error(parsed.message);
  return tool.run(parsed.value as never, signal);
}

describe("summarize_observations", () => {
  it("returns stored values per period with counts, spread and quality flags", async () => {
    const tool = summarizeObservationsTool(testStore(), CASE_ID);
    const result = await run(tool, {
      bundleId: "bundle_test_ndvi",
      bundleRevision: 2,
      periodIds: ["period_2022-03", "period_2022-04", "period_2022-05"],
      metric: "ndvi_area_median",
    });
    const output = result.output as {
      rows: { value: number | null; status: string; qualityFlags: string[] }[];
      counts: Record<string, number>;
      label: string;
    };
    expect(output.rows.map((r) => r.value)).toEqual([0.1211, 0.1439, null]);
    expect(output.rows.map((r) => r.status)).toEqual(["available", "available", "missing"]);
    expect(output.rows[1]?.qualityFlags).toEqual(["snow_suspected"]);
    expect(output.counts).toEqual({
      available: 2,
      missing: 1,
      excluded: 0,
      invalid: 0,
      no_record: 0,
    });
    expect(output.label).toBe("precomputed observation");
    expect(result.resultEntityIds).toEqual([
      "meas_test_2022-03",
      "meas_test_2022-04",
      "meas_test_2022-05",
    ]);
  });

  it("rejects a stale bundle revision", async () => {
    const tool = summarizeObservationsTool(testStore(), CASE_ID);
    await expect(
      run(tool, {
        bundleId: "bundle_test_ndvi",
        bundleRevision: 1,
        periodIds: ["period_2022-04"],
        metric: null,
      }),
    ).rejects.toMatchObject({ code: "stale_reference" });
  });

  it("rejects a bundle that is not validated", async () => {
    const store = testStore();
    store.bundles.splice(0, 1, bundle({ status: "failed" }));
    const tool = summarizeObservationsTool(store, CASE_ID);
    await expect(
      run(tool, {
        bundleId: "bundle_test_ndvi",
        bundleRevision: 2,
        periodIds: ["period_2022-04"],
        metric: null,
      }),
    ).rejects.toBeInstanceOf(ToolFailure);
  });

  it("rejects periods outside the bundle and more than 24 periods", async () => {
    const tool = summarizeObservationsTool(testStore(), CASE_ID);
    await expect(
      run(tool, {
        bundleId: "bundle_test_ndvi",
        bundleRevision: 2,
        periodIds: ["period_2019-01"],
        metric: null,
      }),
    ).rejects.toMatchObject({ code: "unknown_period" });
    const many = Array.from(
      { length: 25 },
      (_, i) => `period_20${10 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`,
    );
    expect(
      tool.parse({ bundleId: "bundle_test_ndvi", bundleRevision: 2, periodIds: many, metric: null })
        .ok,
    ).toBe(false);
    expect(
      tool.parse({
        bundleId: "bundle_test_ndvi",
        bundleRevision: 2,
        periodIds: ["2022-04"],
        metric: null,
      }).ok,
    ).toBe(false);
  });

  it("marks a period with no stored measurement as no_record, never zero", async () => {
    const store = testStore();
    store.measurements.splice(0, 1);
    const tool = summarizeObservationsTool(store, CASE_ID);
    const result = await run(tool, {
      bundleId: "bundle_test_ndvi",
      bundleRevision: 2,
      periodIds: ["period_2022-03"],
      metric: null,
    });
    expect(
      (result.output as { rows: { status: string; value: number | null }[] }).rows,
    ).toMatchObject([{ status: "no_record", value: null }]);
  });
});

describe("read tools", () => {
  it("read_dataset_manifest returns the bundle manifest fields", async () => {
    const result = await run(readDatasetManifestTool(testStore(), CASE_ID), {
      bundleId: "bundle_test_ndvi",
    });
    expect(result.output).toMatchObject({
      bundleRevision: 2,
      methodId: "test_ndvi_monthly",
      license: "test-license",
    });
  });

  it("read_case returns the case summary", async () => {
    const result = await run(readCaseTool(testStore(), CASE_ID), {});
    expect(result.resultEntityIds).toEqual([CASE_ID]);
  });

  it("every argument schema fits the strict subset", () => {
    const store = testStore();
    for (const tool of [
      readCaseTool(store, CASE_ID),
      readDatasetManifestTool(store, CASE_ID),
      summarizeObservationsTool(store, CASE_ID),
    ]) {
      expect(strictSubsetIssues(tool.parameters)).toEqual([]);
    }
  });

  it("the registry offers only built function tools and refuses proposals as tools", () => {
    const registry = caseToolRegistry(testStore(), CASE_ID);
    expect(
      registry
        .forTask(["read_dataset_manifest", "summarize_observations", "propose_evidence"])
        .map((t) => t.name),
    ).toEqual(["read_dataset_manifest", "summarize_observations"]);
    const fake = {
      ...readCaseTool(testStore(), CASE_ID),
      name: "propose_plan" as const,
    } as ToolHandler<never>;
    expect(() => new ToolRegistry([fake])).toThrow(/proposal/);
  });
});
