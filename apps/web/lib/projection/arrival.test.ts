import { CaseSnapshot } from "@siterra/contracts";
import { describe, expect, it } from "vitest";
import example from "../../../../schemas/examples/case-snapshot.json";
import { formatAreaKm2, projectArrival } from "./arrival";

const snapshot = CaseSnapshot.parse(example);

describe("projectArrival", () => {
  it("shows a missing boundary as missing, with its limitation", () => {
    const p = projectArrival(snapshot);
    expect(p.kind).toBe("boundary_not_established");
    expect(p.mode).toBe("mode.concept");
    if (p.kind === "boundary_not_established") expect(p.limitations.length).toBeGreaterThan(0);
  });

  it("projects an analysis-ready catchment with its area to one decimal", () => {
    const g = snapshot.records.geoSelectionRecords[0];
    if (!g) throw new Error("example has no geo selection");
    const ready = CaseSnapshot.parse({
      ...snapshot,
      case: { ...snapshot.case, activeGeoSelectionId: g.id, mode: "live" },
      records: {
        ...snapshot.records,
        geoSelectionRecords: [
          {
            ...g,
            geometryStatus: "analysis_ready",
            boundaryRole: "hydrological_unit",
            areaM2: 417_040_000,
            areaMethod: "geodesic",
            geometry: {
              type: "Polygon",
              coordinates: [
                [
                  [-6.6, 31.6],
                  [-6.2, 31.6],
                  [-6.2, 31.7],
                  [-6.6, 31.6],
                ],
              ],
            },
          },
        ],
      },
    });
    const p = projectArrival(ready);
    expect(p.kind).toBe("ready");
    if (p.kind !== "ready") return;
    expect(p.areaKm2).toBe("417.0");
    expect(p.mode).toBe("mode.live");
    expect(p.catchment.properties).toEqual({
      id: g.id,
      revision: g.revision,
      role: "hydrological_unit",
    });
  });
});

describe("formatAreaKm2", () => {
  it("rounds to one decimal", () => {
    expect(formatAreaKm2(417_040_000)).toBe("417.0");
    expect(formatAreaKm2(417_360_000)).toBe("417.4");
  });
});
