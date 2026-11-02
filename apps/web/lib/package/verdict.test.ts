import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { CaseSnapshot } from "@siterra/contracts";
import { describe, expect, it } from "vitest";
import { seed } from "../instruments/seed-listing";
import { withSyntheticPackage, type RecordedRun } from "./fixtures/synthetic";
import { plainVerdictText, statusTextOf, verdictOf } from "./verdict";

const run28 = (
  JSON.parse(
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
        "recorded-live-run-2026-10-28-branch-merge.json",
      ),
      "utf8",
    ),
  ) as { records: RecordedRun }
).records;

const run30 = JSON.parse(
  readFileSync(join(import.meta.dirname, "..", "run", "fixtures", "recorded-run.json"), "utf8"),
) as { commandId: string; snapshot: CaseSnapshot };

describe("verdictOf", () => {
  it("maps the three branch statuses to the exact plain-English strings", () => {
    expect(statusTextOf("consistent")).toBe("Consistent with available evidence");
    expect(statusTextOf("contradicted")).toBe("Contradicted by available evidence");
    expect(statusTextOf("cannot_be_assessed")).toBe("Cannot be assessed with current data");
  });

  it("returns null when the command committed no branch merge", () => {
    expect(verdictOf(seed, "cmd_none")).toBeNull();
  });

  it("extracts all 5 tested causes with plain status, one-line reason, and prediction before looking", () => {
    const { snapshot, commandId } = withSyntheticPackage(seed, run28);
    const v = verdictOf(snapshot, commandId);
    expect(v).not.toBeNull();
    expect(v?.causes).toHaveLength(5);
    expect(v?.causes.map((c) => c.label)).toEqual([
      "Rainfall",
      "Grazing",
      "Land use",
      "Snow or terrain",
      "Data artefact",
    ]);
    for (const c of v?.causes ?? []) {
      expect([
        "Consistent with available evidence",
        "Contradicted by available evidence",
        "Cannot be assessed with current data",
      ]).toContain(c.statusText);
      expect(c.prediction.length).toBeGreaterThan(10);
      expect(c.reason.length).toBeGreaterThan(10);
      expect(c.prediction).not.toMatch(
        /\b(?:period_|season_|branch_|merge@|ndvi_departure|snow_suspected|terrain_shadow_suspected|low_scene_count|vegetation_rainfall|elevation_low|elevation_high)[A-Za-z0-9_-]*\b/,
      );
      expect(c.reason).not.toMatch(
        /\b(?:period_|season_|branch_|merge@|ndvi_departure|snow_suspected|terrain_shadow_suspected|low_scene_count|vegetation_rainfall|elevation_low|elevation_high|p[1-4])[A-Za-z0-9_-]*\b/,
      );
      expect(c.prediction).not.toMatch(/[\u2013\u2014]/);
      expect(c.reason).not.toMatch(/[\u2013\u2014]/);
    }
    expect(v?.causes.find((c) => c.id === "grazing")?.reason).toContain(
      "herd records need a field check.",
    );
    expect(v?.causes.find((c) => c.id === "land_use")?.reason).toContain(
      "orchard history needs a field check.",
    );
  });

  it("covers Consistent with available evidence, Contradicted by available evidence, and Cannot be assessed with current data on the 30 Oct recorded run", () => {
    const v = verdictOf(run30.snapshot, run30.commandId);
    expect(v).not.toBeNull();
    expect(v?.causes).toHaveLength(5);
    expect(v?.causes.map((c) => c.statusText)).toEqual([
      "Consistent with available evidence",
      "Cannot be assessed with current data",
      "Contradicted by available evidence",
      "Contradicted by available evidence",
      "Contradicted by available evidence",
    ]);
    for (const c of v?.causes ?? []) {
      expect(c.prediction).not.toMatch(
        /\b(?:period_|season_|branch_|merge@|ndvi_departure|snow_suspected|terrain_shadow_suspected|low_scene_count|vegetation_rainfall|elevation_low|elevation_high)[A-Za-z0-9_-]*\b/,
      );
      expect(c.reason).not.toMatch(
        /\b(?:period_|season_|branch_|merge@|ndvi_departure|snow_suspected|terrain_shadow_suspected|low_scene_count|vegetation_rainfall|elevation_low|elevation_high|p[1-4])[A-Za-z0-9_-]*\b/,
      );
    }
  });

  it("translates internal period, season, and flag tokens into plain English", () => {
    expect(
      plainVerdictText("Season season_2021-11_2022-04 falls in the below normal category."),
    ).toBe("The 2021 to 2022 wet season falls in the below normal category.");
    expect(
      plainVerdictText(
        "The vegetation record in period_2024-01 through period_2024-03 would show no snow_suspected flag.",
      ),
    ).toBe("The vegetation record in January to March 2024 would show no suspected snow.");
  });
});
