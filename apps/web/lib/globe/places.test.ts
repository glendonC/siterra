import { describe, expect, it } from "vitest";
import { otherPlaces, placeHref } from "./places";

const listing = {
  defaultCaseId: "case_aitbouguemez",
  cases: [
    {
      caseId: "case_aitbouguemez",
      place: { name: "Aït Bouguemez valley", region: "Central High Atlas, Morocco" },
      outlet: { name: "Catchment outlet", lonLat: [-6.5372222, 31.6377778] },
    },
    {
      caseId: "case_calaveras_creek",
      place: { name: "Calaveras Creek catchment", region: "Diablo Range, California" },
      outlet: { name: "Catchment outlet", lonLat: [-121.8191667, 37.5025] },
    },
  ],
};

describe("otherPlaces (U25)", () => {
  it("lists every seed case but the one being opened, by its own name, region and outlet", () => {
    expect(otherPlaces(listing, "Aït Bouguemez valley")).toEqual([
      {
        caseId: "case_calaveras_creek",
        name: "Calaveras Creek catchment",
        region: "Diablo Range, California",
        lon: -121.8191667,
        lat: 37.5025,
      },
    ]);
    expect(otherPlaces(listing, "Calaveras Creek catchment").map((p) => p.caseId)).toEqual([
      "case_aitbouguemez",
    ]);
  });

  it("shows no other place when the listing cannot be read", () => {
    expect(otherPlaces({ cases: [{ caseId: "x" }] }, "Aït Bouguemez valley")).toEqual([]);
    expect(otherPlaces(null, "Aït Bouguemez valley")).toEqual([]);
  });

  it("opens a place's own journey", () => {
    expect(placeHref("case_calaveras_creek")).toBe("/?case=case_calaveras_creek&start");
  });
});
