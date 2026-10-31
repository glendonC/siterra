import { CaseSnapshot } from "@siterra/contracts";
import { describe, expect, it } from "vitest";
import example from "../../../../schemas/examples/case-snapshot.json";
import { formatAreaKm2, modeLines, projectArrival } from "./arrival";

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

describe("arrival from the seed case", () => {
  it("takes the question, area and mode from the records", async () => {
    const seed = CaseSnapshot.parse(
      (await import("../../../../packages/contracts/fixtures/case-snapshot-aitbouguemez-seed.json"))
        .default,
    );
    const p = projectArrival(seed);
    expect(p.kind).toBe("ready");
    if (p.kind !== "ready") return;
    expect(p.question).toBe("Is grazing changing the shared pastures of the Aït Bouguemez valley?");
    expect(p.valleyName).toBe("Aït Bouguemez valley");
    // the record's own place, not a name read out of a source's title
    expect(p.regionName).toBe("Central High Atlas, Morocco");
    expect("rangeName" in p).toBe(false);
    expect("subrangeName" in p).toBe(false);
    expect(p.areaKm2).toBe("417.0");
    expect(p.modeLines).toEqual({ label: "mode.concept", detail: "mode.conceptDetail" });
  });
});

describe("a second place's names (U25)", () => {
  it("come from the case record's place, never from the first place or the case title", async () => {
    const seed = CaseSnapshot.parse(
      (await import("../../../../packages/contracts/fixtures/case-snapshot-aitbouguemez-seed.json"))
        .default,
    );
    const second = {
      ...seed,
      case: {
        ...seed.case,
        title: "Grazing and the reservoir catchment of Calaveras Creek",
        place: { name: "Calaveras Creek catchment", region: "Diablo Range, California" },
      },
    };
    const p = projectArrival(second);
    if (p.kind !== "ready") throw new Error(p.kind);
    expect(p.valleyName).toBe("Calaveras Creek catchment");
    expect(p.regionName).toBe("Diablo Range, California");
  });
});

describe("modeLines", () => {
  it("gives a Live label only to a record whose mode is live", () => {
    expect(modeLines("live").label).toBe("mode.live");
    for (const mode of ["concept", "replay"] as const) {
      expect(modeLines(mode).label).not.toBe("mode.live");
      expect(modeLines(mode).detail).not.toBe("mode.liveDetail");
    }
  });
});
