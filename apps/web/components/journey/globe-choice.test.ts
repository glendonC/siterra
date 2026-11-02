import { describe, expect, it } from "vitest";
import {
  cardQuestion,
  classifyPlace,
  launchFailure,
  launchStatus,
  namePoint,
  placeQuestions,
  rangelandShareAt,
  reliefAt,
  shortNameFrom,
  startOutcome,
  surfaceAt,
  type PlaceKind,
  type WorldGrid,
} from "./globe-choice";

describe("the globe card", () => {
  const q = "Is grazing changing the shared pastures of the Aït Bouguemez valley?";

  it("shows no question while the place is being chosen (step 1)", () => {
    expect(cardQuestion(1, q)).toBeNull();
  });

  it("shows the live question from step 2", () => {
    expect(cardQuestion(2, q)).toBe(q);
    expect(cardQuestion(2, "  ")).toBeNull();
  });
});

/** A world grid at the globe's 0.08 degree spacing: land share 1 east of lonEdge, 0 west of it. */
function grid(lonEdge: number): WorldGrid {
  const w = 4500;
  const h = 2250;
  const data = new Float32Array(w * h * 2);
  for (let r = 0; r < h; r++)
    for (let c = 0; c < w; c++) {
      const lon = -180 + (c + 0.5) * 0.08;
      data[(r * w + c) * 2 + 1] = lon >= lonEdge ? 1 : 0;
    }
  return { w, h, data };
}

describe("the surface under a picked point", () => {
  const world = grid(-17);

  it("is open water when the case's box holds no land", () => {
    expect(surfaceAt(world, -19.35, 13.31)).toBe("water");
  });

  it("is a coast when the box holds some land and some sea", () => {
    expect(surfaceAt(world, -17.1, 14.69)).toBe("coast");
    expect(surfaceAt(world, -16.95, 14.69)).toBe("coast");
  });

  it("is land when every cell is land", () => {
    expect(surfaceAt(world, 33.75, 21.88)).toBe("land");
  });

  it("is unknown without the globe's grid", () => {
    expect(surfaceAt(null, 33.75, 21.88)).toBe("unknown");
  });
});

describe("a true name for every point", () => {
  it("calls open water open water and asks no question there", () => {
    const n = namePoint({ lon: -19.35, lat: 13.31, surface: "water", hit: null });
    expect(n).toEqual({ title: "Open water", region: "", surface: "water", investigable: false });
  });

  it("keeps a water body's own name from the geocoder", () => {
    const n = namePoint({
      lon: -40,
      lat: 36,
      surface: "water",
      hit: { name: "North Atlantic Ocean", osmClass: "place", osmType: "ocean" },
    });
    expect(n.title).toBe("North Atlantic Ocean");
    expect(n.investigable).toBe(false);
  });

  it("does not take an administrative name in territorial waters for the water's name", () => {
    const n = namePoint({
      lon: 15.8,
      lat: 43.4,
      surface: "water",
      hit: { name: "Kanica", region: "Croatia", osmClass: "boundary", osmType: "administrative" },
    });
    expect(n.title).toBe("Open water");
  });

  it("treats a point the geocoder calls a sea as open water even on a coast", () => {
    const n = namePoint({
      lon: 0,
      lat: 0,
      surface: "coast",
      hit: { name: "Gulf of Guinea", osmClass: "place", osmType: "sea" },
    });
    expect(n).toMatchObject({ title: "Gulf of Guinea", surface: "water", investigable: false });
  });

  it("names unnamed land by its coordinates, never an invented name", () => {
    const n = namePoint({ lon: 33.75, lat: 21.88, surface: "land", hit: null });
    expect(n).toEqual({
      title: "The land at 21.88° N, 33.75° E",
      region: "",
      surface: "land",
      investigable: true,
    });
    expect(namePoint({ lon: -17.44, lat: 14.69, surface: "coast", hit: null }).title).toBe(
      "The coast at 14.69° N, 17.44° W",
    );
  });

  it("keeps the geocoder's name and region on land", () => {
    const n = namePoint({
      lon: -73.99,
      lat: 40.76,
      surface: "coast",
      hit: { name: "Manhattan", region: "New York, United States" },
    });
    expect(n).toEqual({
      title: "Manhattan",
      region: "New York, United States",
      surface: "coast",
      investigable: true,
    });
  });

  it("holds back an unnamed point the globe could not check", () => {
    const n = namePoint({ lon: 1, lat: 2, surface: "unknown", hit: null });
    expect(n).toMatchObject({ title: "The point at 2.00° N, 1.00° E", investigable: false });
  });

  it("never falls back to a made-up label", () => {
    for (const surface of ["land", "coast", "water", "unknown"] as const) {
      const { title, region } = namePoint({ lon: 10, lat: 10, surface, hit: null });
      expect(`${title} ${region}`).not.toMatch(/selected|catchment|custom global/i);
    }
  });
});

describe("the starting state", () => {
  it("says what a new place's start really does, with no progress figures", () => {
    const status = launchStatus("new");
    expect(status).toMatch(/terrain, climate records and sources/);
    expect(status).not.toMatch(/\d|%/);
  });

  it("says a studied place opens on its land", () => {
    expect(launchStatus("studied")).toBe("Going down to the land and opening the investigation");
  });

  it("names a failed start for what it is and offers no other place's case", () => {
    expect(launchFailure(500)).toBe(
      "This place could not be started (HTTP 500). Try again, or pick another place.",
    );
    expect(launchFailure(null)).toMatch(/could not be reached/);
  });
});

/** A land grid whose elevation rises east of lon 0 by metresPerDegree, so relief round a point is known. */
function slope(metresPerDegree: number): WorldGrid {
  const w = 4500;
  const h = 2250;
  const data = new Float32Array(w * h * 2);
  for (let r = 0; r < h; r++)
    for (let c = 0; c < w; c++) {
      const lon = -180 + (c + 0.5) * 0.08;
      data[(r * w + c) * 2] = Math.max(0, lon) * metresPerDegree;
      data[(r * w + c) * 2 + 1] = 1;
    }
  return { w, h, data };
}

describe("relief and rangeland round a point", () => {
  it("reads relief over about 27 km each way and where the point sits in it", () => {
    const r = reliefAt(slope(2000), 5, 0);
    expect(r?.reliefM).toBeGreaterThan(900);
    expect(r?.position).toBeGreaterThan(0.4);
    expect(r?.position).toBeLessThan(0.6);
    expect(reliefAt(null, 5, 0)).toBeNull();
  });

  it("reads the rangeland biome share of the point's cell", () => {
    const layer = { w: 1440, h: 720, data: new Uint8Array(1440 * 720).fill(204) };
    expect(rangelandShareAt(layer, 34.8, -2.3)).toBeCloseTo(0.8, 5);
    expect(rangelandShareAt(null, 34.8, -2.3)).toBeNull();
  });
});

describe("the kind of place, from real signals only", () => {
  const valley = { reliefM: 2150, position: 0.45 };
  const peak = { reliefM: 2150, position: 0.9 };
  const plain = { reliefM: 90, position: 0.5 };

  it("takes a city from the geocoder's class and type", () => {
    const hit = {
      name: "Manhattan",
      osmClass: "boundary",
      osmType: "administrative",
      addressType: "suburb",
    };
    expect(classifyPlace({ hit, surface: "coast", relief: plain })).toBe("city");
    expect(
      classifyPlace({
        hit: { name: "Denver", osmClass: "place", osmType: "city" },
        surface: "land",
        relief: { reliefM: 1015, position: 0.08 },
      }),
    ).toBe("city");
  });

  it("takes forest and farmland only when the geocoder says so", () => {
    expect(
      classifyPlace({
        hit: { name: "Białowieża Forest", osmClass: "natural", osmType: "wood" },
        surface: "land",
      }),
    ).toBe("forest");
    expect(
      classifyPlace({
        hit: { name: "Fields", osmClass: "landuse", osmType: "farmland" },
        surface: "land",
        relief: plain,
      }),
    ).toBe("farmland");
  });

  it("calls a point with sea in its box a coast", () => {
    expect(
      classifyPlace({
        hit: { name: "Dakar", osmClass: "place", osmType: "village" },
        surface: "coast",
        relief: plain,
      }),
    ).toBe("coast");
  });

  it("calls the lower part of 1000 m or more of relief a mountain valley, the upper part mountain", () => {
    expect(
      classifyPlace({
        hit: { name: "Tarhoulit", osmClass: "place", osmType: "village" },
        surface: "land",
        relief: valley,
      }),
    ).toBe("mountain-valley");
    expect(classifyPlace({ hit: null, surface: "land", relief: peak })).toBe("mountain");
    expect(
      classifyPlace({ hit: null, surface: "land", relief: { reliefM: 999, position: 0.2 } }),
    ).toBeNull();
  });

  it("calls a point mostly in the rangeland biomes rangeland", () => {
    expect(classifyPlace({ hit: null, surface: "land", relief: plain, rangelandShare: 0.8 })).toBe(
      "rangeland",
    );
    expect(
      classifyPlace({ hit: null, surface: "land", relief: plain, rangelandShare: 0.3 }),
    ).toBeNull();
  });

  it("says nothing without a signal, and nothing in open water", () => {
    expect(classifyPlace({ hit: null, surface: "land" })).toBeNull();
    expect(
      classifyPlace({ hit: { name: "x", osmClass: "place", osmType: "city" }, surface: "water" }),
    ).toBeNull();
    expect(classifyPlace({ hit: null, surface: "unknown", relief: valley })).toBeNull();
  });
});

describe("questions that fit the place", () => {
  const kinds: PlaceKind[] = [
    "city",
    "coast",
    "mountain-valley",
    "mountain",
    "rangeland",
    "farmland",
    "forest",
  ];
  const ny = { name: "New York", lat: 40.71, lon: -74.01 };

  it("asks the broad questions first, then two that fit", () => {
    for (const kind of kinds) {
      const qs = placeQuestions(ny, kind);
      expect(qs).toHaveLength(4);
      expect(qs[0]).toBe("What are the biggest land cover changes in New York since 2000?");
      expect(qs[1]).toBe("Where is the land changing fastest in New York, and what is driving it?");
      expect(new Set(qs).size).toBe(4);
    }
  });

  it("asks only the broad questions when the kind is unknown", () => {
    expect(placeQuestions(ny, null)).toEqual([
      "What are the biggest land cover changes in New York since 2000?",
      "Where is the land changing fastest in New York, and what is driving it?",
    ]);
  });

  it("asks about a point with no name by its coordinates", () => {
    const qs = placeQuestions({ lat: 21.88, lon: 33.75 }, "rangeland");
    expect(qs[0]).toBe(
      "What are the biggest land cover changes around 21.88° N, 33.75° E since 2000?",
    );
    for (const q of qs) expect(q).not.toMatch(/The land at|undefined/);
  });

  it("uses only the first part of a long name", () => {
    expect(placeQuestions({ name: "Manhattan, New York County", lat: 0, lon: 0 }, null)[0]).toBe(
      "What are the biggest land cover changes in Manhattan since 2000?",
    );
  });

  it("never presupposes a result", () => {
    // words that assume a measured direction of change before anything is measured
    const presupposing =
      /\b(greening|browning|degradation|decline|loss of|recovery|why (has|did|is))\b/i;
    for (const kind of [...kinds, null]) {
      for (const q of placeQuestions(ny, kind)) {
        expect(q, q).not.toMatch(presupposing);
        expect(q.endsWith("?"), q).toBe(true);
      }
    }
  });
});

describe("short place names inside questions", () => {
  const kathmandu = {
    name: "काठमाडौँ महानगरपालिका",
    "name:en": "Kathmandu Metropolitan City",
    "_place_name:en": "Kathmandu",
    int_name: "Kathmandu",
  };

  it("takes the geocoder's shorter everyday name for the same place", () => {
    expect(shortNameFrom(kathmandu, "Kathmandu Metropolitan City")).toBe("Kathmandu");
    expect(shortNameFrom({ short_name: "NYC" }, "New York City")).toBe("NYC");
  });

  it("gives nothing when no shorter Latin name is given", () => {
    expect(shortNameFrom(undefined, "Manhattan")).toBeUndefined();
    expect(shortNameFrom({ int_name: "Manhattan" }, "Manhattan")).toBeUndefined();
    expect(
      shortNameFrom({ "_place_name:en": "काठमाडौं" }, "Kathmandu Metropolitan City"),
    ).toBeUndefined();
  });

  it("uses the short name in every question", () => {
    const qs = placeQuestions(
      { name: "Kathmandu Metropolitan City", shortName: "Kathmandu", lat: 27.71, lon: 85.32 },
      "city",
    );
    expect(qs).toHaveLength(4);
    for (const q of qs) {
      expect(q).toContain("Kathmandu");
      expect(q).not.toContain("Metropolitan City");
    }
  });
});

describe("a new place's start", () => {
  it("opens the place's own case when the service made it", () => {
    expect(startOutcome(201, { caseId: "case_loc_new_york_ab12cd" })).toEqual({
      caseId: "case_loc_new_york_ab12cd",
    });
    expect(startOutcome(200, { caseId: "case_loc_new_york_ab12cd", created: false })).toEqual({
      caseId: "case_loc_new_york_ab12cd",
    });
  });

  it("says the place did not start, and opens no other case, on a refusal or a bad answer", () => {
    expect(startOutcome(500, {})).toEqual({ failure: launchFailure(500) });
    expect(startOutcome(422, { caseId: "case_aitbouguemez" })).toEqual({
      failure: launchFailure(422),
    });
    expect(startOutcome(200, null)).toEqual({ failure: launchFailure(200) });
    expect(startOutcome(200, { caseId: "" })).toEqual({ failure: launchFailure(200) });
  });

  it("says Siterra could not be reached when the request fails", () => {
    expect(startOutcome(null, null)).toEqual({ failure: launchFailure(null) });
  });
});
