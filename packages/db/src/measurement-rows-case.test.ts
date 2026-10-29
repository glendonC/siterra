import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { readCaseSeed } from "./case-seed.ts";
import { MeasurementRowsFile, readPointer } from "./measurement-rows.ts";
import { resolveBundleAsset } from "./case-assets.ts";

// The case's own rows (data/case/measurement-rows.json) against the figures the project has
// printed and verified (measurement-expected.json, each naming its source). A pointer that lands on
// the wrong number fails here.
const repoDir = fileURLToPath(new URL("../../../", import.meta.url));
const rows = MeasurementRowsFile.parse(
  JSON.parse(readFileSync(`${repoDir}data/case/measurement-rows.json`, "utf8")),
);
const expected = JSON.parse(
  readFileSync(fileURLToPath(new URL("./measurement-expected.json", import.meta.url)), "utf8"),
) as {
  figures: {
    rowId: string;
    printed: number;
    decimals: number;
    part: "value" | "lower" | "upper";
    source: string;
  }[];
};
/**
 * A bundle field rounded once, half away from zero, on its decimal text (COMMON.md rule for numbers
 * on screen): 0.02675 to four decimals is 0.0268, not the 0.0267 binary arithmetic would give.
 */
function roundHalfAwayFromZero(value: number, decimals: number): number {
  const rounded = Math.round(Number(`${Math.abs(value)}e${decimals}`));
  return Math.sign(value) * Number(`${rounded}e-${decimals}`);
}

const { seed, issues } = readCaseSeed({
  repoDir,
  mode: "concept",
  ownerScopeId: "seed",
  importedAt: "2026-10-27T20:00:00Z",
});
const measurements = new Map(
  (seed?.bundles ?? []).flatMap((b) => b.measurements).map((m) => [m.id, m]),
);

describe("measurement rows of the case", () => {
  it("load without an issue", () => {
    expect(issues).toEqual([]);
    for (const row of rows.rows) expect(measurements.has(`meas_${row.rowId}`)).toBe(true);
  });

  it("give every loaded figure the value that was printed for it, at the printed precision", () => {
    expect(expected.figures.length).toBeGreaterThan(0);
    for (const figure of expected.figures) {
      const m = measurements.get(`meas_${figure.rowId}`);
      expect(m, figure.rowId).toBeDefined();
      const actual =
        figure.part === "value"
          ? m?.value
          : figure.part === "lower"
            ? m?.uncertainty.lower
            : m?.uncertainty.upper;
      expect(
        roundHalfAwayFromZero(actual ?? Number.NaN, figure.decimals),
        `${figure.rowId} ${figure.part} (${figure.source})`,
      ).toBe(figure.printed);
    }
  });

  it("name a printed figure and a use for every row, and no figure for an unknown row", () => {
    const named = new Set(expected.figures.map((f) => f.rowId));
    for (const row of rows.rows) {
      expect(named.has(row.rowId), row.rowId).toBe(true);
      expect(row.usedBy.length, row.rowId).toBeGreaterThan(0);
    }
    const known = new Set(rows.rows.map((r) => r.rowId));
    for (const figure of expected.figures) expect(known.has(figure.rowId), figure.rowId).toBe(true);
    for (const figure of expected.figures) expect(figure.source.length).toBeGreaterThan(0);
  });

  it("record where each number was read, and the asset holds that number there", () => {
    const bundlesDir = `${repoDir}data/bundles`;
    for (const bundle of seed?.bundles ?? []) {
      for (const m of bundle.measurements) {
        if (m.source === undefined) continue;
        const resolved = resolveBundleAsset(bundlesDir, {
          bundleId: bundle.dataBundle.id,
          contentHash: bundle.dataBundle.contentHash ?? "",
          assetKey: m.source.assetKey,
        });
        expect(resolved.status, m.id).toBe("available");
        if (resolved.status !== "available") continue;
        const document: unknown = JSON.parse(readFileSync(resolved.file.absolutePath, "utf8"));
        expect(readPointer(document, m.source.jsonPointer), m.id).toBe(m.value);
      }
    }
  });
});
