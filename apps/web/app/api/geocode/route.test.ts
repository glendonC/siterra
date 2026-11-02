import { afterEach, describe, expect, it, vi } from "vitest";

// no stored places: the database is out of reach in a unit test
vi.mock("../database.ts", () => ({
  database: () => ({
    query: () => Promise.reject(new Error("no database in unit tests")),
  }),
}));

const { GET, reverseGeocode } = await import("./route");

function answer(body: unknown): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve(new Response(JSON.stringify(body), { status: 200 }))),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("reverse geocoding a picked point", () => {
  it("names a point nothing names by its coordinates, and says so", async () => {
    answer({ error: "Unable to geocode" });
    const p = await reverseGeocode(-19.35, 13.31);
    expect(p).toEqual({
      name: "13.31° N, 19.35° W",
      region: "",
      lon: -19.35,
      lat: 13.31,
      named: false,
    });
  });

  it("names it by its coordinates when the geocoder cannot be reached", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("offline"))),
    );
    const p = await reverseGeocode(33.75, 21.88);
    expect(p.name).toBe("21.88° N, 33.75° E");
    expect(p.named).toBe(false);
  });

  it("passes on the geocoder's name, region and OpenStreetMap kind", async () => {
    answer({
      class: "boundary",
      type: "administrative",
      addresstype: "suburb",
      name: "Manhattan",
      display_name: "Manhattan, New York County, New York, United States",
      address: {
        suburb: "Manhattan",
        city: "New York",
        state: "New York",
        country: "United States",
      },
    });
    const p = await reverseGeocode(-73.99, 40.76);
    expect(p).toMatchObject({
      name: "Manhattan",
      region: "New York, United States",
      named: true,
      osmClass: "boundary",
      osmType: "administrative",
      addressType: "suburb",
    });
  });

  it("passes on the geocoder's shorter everyday name", async () => {
    answer({
      class: "boundary",
      type: "administrative",
      addresstype: "city",
      name: "Kathmandu Metropolitan City",
      display_name: "Kathmandu Metropolitan City, Kathmandu, Bagamati Province, Nepal",
      namedetails: { "name:en": "Kathmandu Metropolitan City", "_place_name:en": "Kathmandu" },
      address: {
        city: "Kathmandu Metropolitan City",
        state: "Bagamati Province",
        country: "Nepal",
      },
    });
    const p = await reverseGeocode(85.32, 27.71);
    expect(p).toMatchObject({ name: "Kathmandu Metropolitan City", shortName: "Kathmandu" });
  });

  it("keeps the Latin half of a bilingual name", async () => {
    answer({
      class: "place",
      type: "village",
      name: "Aït Bou Oulli آيت بوأولى",
      display_name: "Aït Bou Oulli آيت بوأولى, Azilal Province, Morocco",
      address: { state: "Béni Mellal-Khénifra", country: "Morocco" },
    });
    const p = await reverseGeocode(-6.55, 31.63);
    expect(p.name).toBe("Aït Bou Oulli");
    expect(p.region).toBe("Béni Mellal-Khénifra, Morocco");
  });

  it("answers typed coordinates with the reverse name, never a made-up catchment", async () => {
    answer({ error: "Unable to geocode" });
    const res = await GET(new Request("http://127.0.0.1/api/geocode?q=13.31,-19.35"));
    const body = (await res.json()) as { results: { name: string; named: boolean }[] };
    expect(body.results[0]).toMatchObject({ name: "13.31° N, 19.35° W", named: false });
    expect(JSON.stringify(body)).not.toMatch(/catchment/i);
  });
});
