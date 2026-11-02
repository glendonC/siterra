import { describe, expect, it } from "vitest";
import {
  cardQuestion,
  launchFailure,
  launchStatus,
  namePoint,
  surfaceAt,
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
  it("calls open water the open ocean and asks no question there", () => {
    const n = namePoint({ lon: -19.35, lat: 13.31, surface: "water", hit: null });
    expect(n).toEqual({ title: "Open ocean", region: "", surface: "water", investigable: false });
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
    expect(n.title).toBe("Open ocean");
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
