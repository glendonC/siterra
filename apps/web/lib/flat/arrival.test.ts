import { describe, expect, it } from "vitest";
import { arrivalFlat } from "./arrival";

describe("arrivalFlat", () => {
  const flat = arrivalFlat({
    question: "Is grazing changing the shared pastures of the Aït Bouguemez valley?",
    areaKm2: "417.0",
    places: [{ name: "Tabant" }, { name: "Aït Ouchi" }],
    reliefFactor: 2,
  });

  it("lists every fact the arrival screen shows, in reading order", () => {
    expect(flat.map((s) => s.heading)).toEqual(["Question", "Place", "View notes", "Sources"]);
    expect(flat[1]?.lines).toEqual([
      "Aït Bouguemez valley, High Atlas Mountains, Morocco",
      "Valley catchment: 417.0 km². Not a pasture, agdal, or management boundary.",
      "Outlet: the whole catchment drains here",
      "Tabant",
      "Aït Ouchi",
    ]);
    expect(flat[2]?.lines).toEqual(["Relief ×2", "Imagery: Sentinel-2, summer 2025, display only"]);
  });

  it("leaves no placeholder unfilled", () => {
    expect(flat.flatMap((s) => s.lines).filter((l) => /\{\w+\}/.test(l))).toEqual([]);
  });
});
