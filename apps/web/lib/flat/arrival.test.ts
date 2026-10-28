import { describe, expect, it } from "vitest";
import { arrivalFlat } from "./arrival";

describe("arrivalFlat", () => {
  const flat = arrivalFlat({
    question: "Is grazing changing the shared pastures of the Aït Bouguemez valley?",
    valleyName: "Aït Bouguemez valley",
    regionName: "High Atlas Mountains, Morocco",
    areaKm2: "417.0",
    places: [{ name: "Tabant" }, { name: "Aït Ouchi" }],
    outlet: true,
    placeCredit: "© OpenStreetMap contributors.",
    placeCredits: [{ name: "Tabant", attribution: "GeoNames, CC BY 4.0" }],
    reliefFactor: 2,
    imagery: true,
  });

  it("lists every fact the arrival screen shows, in reading order", () => {
    expect(flat.map((s) => s.heading)).toEqual(["Question", "Place", "Notes", "Sources"]);
    expect(flat[1]?.lines).toEqual([
      "Aït Bouguemez valley, High Atlas Mountains, Morocco",
      "Valley catchment: 417.0 km². Not a pasture, agdal, or management boundary.",
      "Outlet: the whole catchment drains here",
      "Tabant",
      "Aït Ouchi",
    ]);
    expect(flat[2]?.lines).toEqual([
      "Vertical Exaggeration ×2",
      "Imagery: Sentinel-2, summer 2025, display only",
    ]);
  });

  it("lists no outlet and no place credit the case does not record", () => {
    const bare = arrivalFlat({
      question: "Q",
      valleyName: "V",
      regionName: "R",
      areaKm2: "1.0",
      places: [],
      outlet: false,
      placeCredit: "",
      placeCredits: [],
      reliefFactor: 2,
      imagery: false,
    });
    expect(bare[1]?.lines).toHaveLength(2);
    expect(bare[3]?.lines).toHaveLength(3);
    expect(bare[2]?.lines).toEqual(["Vertical Exaggeration ×2"]);
  });

  it("states no relief and no imagery when no map is drawn", () => {
    const noMap = arrivalFlat({
      question: "Q",
      valleyName: "V",
      regionName: "R",
      areaKm2: "1.0",
      places: [],
      outlet: false,
      placeCredit: "",
      placeCredits: [],
      reliefFactor: 2,
      imagery: false,
      relief: false,
    });
    expect(noMap.map((s) => s.heading)).toEqual(["Question", "Place", "Sources"]);
  });

  it("lists the map legend after the view notes while a data layer shows", () => {
    const withLegend = arrivalFlat({
      question: "Q",
      valleyName: "V",
      regionName: "R",
      areaKm2: "1.0",
      places: [],
      outlet: false,
      placeCredit: "",
      placeCredits: [],
      reliefFactor: 2,
      imagery: false,
      legend: ["NDVI Departure · Nov 2025", "93% of area observed"],
    });
    expect(withLegend.map((s) => s.heading)).toEqual([
      "Question",
      "Place",
      "Notes",
      "Map Legend",
      "Sources",
    ]);
    expect(withLegend[3]?.lines).toEqual(["NDVI Departure · Nov 2025", "93% of area observed"]);
    expect(flat.map((s) => s.heading)).not.toContain("Map Legend");
  });

  it("leaves no placeholder unfilled", () => {
    expect(flat.flatMap((s) => s.lines).filter((l) => /\{\w+\}/.test(l))).toEqual([]);
  });
});
