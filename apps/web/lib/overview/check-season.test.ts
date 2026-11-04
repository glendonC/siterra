import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { CaseSnapshot } from "@siterra/contracts";
import { describe, expect, it } from "vitest";
import { seed } from "../instruments/seed-listing";
import { withSyntheticPackage, type RecordedRun } from "../package/fixtures/synthetic";
import { checkSeasonOf } from "./check-season";

// On the demo case, as the readout's tests build it (the seed with the recorded 28 Oct run and the synthetic
// package): its plan's checks carry their own seasons.
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
const demo: CaseSnapshot = withSyntheticPackage(seed, run28).snapshot;

describe("checkSeasonOf", () => {
  const measurements = demo.records.operationalActionRecords.flatMap(
    (a) => a.fieldPlan?.measurements ?? [],
  );

  it("reads the season the plan gives a check, as written", () => {
    const named = measurements.filter((m) => m.fieldCheckId);
    expect(named.length).toBeGreaterThan(0);
    for (const m of named) expect(checkSeasonOf(demo, m.fieldCheckId ?? null)).toBe(m.season);
  });

  it("says nothing for no check, or a check no plan names", () => {
    expect(checkSeasonOf(demo, null)).toBeNull();
    expect(checkSeasonOf(demo, "no_such_check")).toBeNull();
  });

  it("takes the latest plan that names the check", () => {
    const [first] = demo.records.operationalActionRecords.filter((a) =>
      a.fieldPlan?.measurements.some((m) => m.fieldCheckId),
    );
    if (!first?.fieldPlan) throw new Error("the demo case holds no field plan");
    const m = first.fieldPlan.measurements.find((x) => x.fieldCheckId);
    if (!m?.fieldCheckId) throw new Error("the demo plan names no check");
    const later = {
      ...first,
      id: `${first.id}_later`,
      createdAt: "2099-01-01T00:00:00.000Z",
      fieldPlan: {
        ...first.fieldPlan,
        measurements: first.fieldPlan.measurements.map((x) =>
          x.fieldCheckId === m.fieldCheckId ? { ...x, season: "Late autumn" } : x,
        ),
      },
    };
    const snapshot: CaseSnapshot = {
      ...demo,
      records: {
        ...demo.records,
        operationalActionRecords: [...demo.records.operationalActionRecords, later],
      },
    };
    expect(checkSeasonOf(snapshot, m.fieldCheckId)).toBe("Late autumn");
  });
});
