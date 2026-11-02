import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { classifyGaps, fetchElevation, mosaicElevation } from "./elevation-sources.ts";
import { type Bbox, parseNpy } from "./planetary.ts";

// Recorded 2 Nov 2026 by wrapping fetch around fetchElevation(Honolulu 20 km box, 16 x 16): both STAC listings
// (trimmed) and one crop from each model. Expected counts below come from a separate Python reader of the same files.
const dir = "./fixtures/elevation-honolulu/";
const bytes = (name: string) => new Uint8Array(readFileSync(new URL(dir + name, import.meta.url)));
const DEP_ID = "n22w158-13";
const GLO_ID = "Copernicus_DSM_COG_10_N21_00_W158_00_DEM";
const depCrop = bytes(`${DEP_ID}.npy`);
const gloCrop = bytes(`${GLO_ID}.npy`);
const depStac = bytes("stac-3dep-seamless.json");
const gloStac = bytes("stac-cop-dem-glo-30.json");
const BBOX: Bbox = [-157.9555, 21.2171, -157.7611, 21.3967];

/** A float32 .npy with a value band and a mask band, for synthetic test inputs. */
function npyFloat32(values: Float32Array, mask: Float32Array): Uint8Array<ArrayBuffer> {
  const header = "{'descr': '<f4', 'fortran_order': False, 'shape': (2, 16, 16), }";
  const padded = header.padEnd(118, " ") + "\n";
  const out = new Uint8Array(10 + padded.length + 8 * 256);
  out.set([0x93, ...new TextEncoder().encode("NUMPY"), 1, 0], 0);
  new DataView(out.buffer).setUint16(8, padded.length, true);
  out.set(new TextEncoder().encode(padded), 10);
  const body = new Float32Array(512);
  body.set(values, 0);
  body.set(mask, 256);
  out.set(new Uint8Array(body.buffer), 10 + padded.length);
  return out;
}

function archive(
  opts: { depSearch?: Uint8Array<ArrayBuffer>; glo?: Uint8Array<ArrayBuffer> } = {},
): typeof fetch {
  const impl = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : input.toString();
    if (url.endsWith("/api/stac/v1/search")) {
      const body = JSON.parse(typeof init?.body === "string" ? init.body : "{}") as {
        collections: string[];
      };
      const isDep = body.collections[0] === "3dep-seamless";
      const page = isDep ? (opts.depSearch ?? depStac) : gloStac;
      return Promise.resolve(new Response(page, { status: 200 }));
    }
    const item = new URL(url).searchParams.get("item");
    const crop = item === DEP_ID ? depCrop : (opts.glo ?? gloCrop);
    return Promise.resolve(new Response(crop, { status: 200 }));
  };
  return impl;
}

describe("fetchElevation", () => {
  it("keeps 3DEP bare earth when its gaps are sea by GLO-30, and says so", async () => {
    const r = await fetchElevation(BBOX, 16, {
      fetchImpl: archive(),
      now: () => new Date("2026-11-02T12:00:00Z"),
    });
    if (r.status !== "measured") throw new Error(`expected elevation, got ${JSON.stringify(r)}`);
    expect(r.value.source).toBe("3dep-seamless");
    expect(r.value.surface).toBe("bare_earth");
    expect(r.value.nominalResolutionM).toBe(10);
    expect(r.value.noReadingShare).toBe(0.1875);
    expect(r.value.noReadingAtSeaShare).toBe(0.1875);
    expect(r.value.maxM).toBe(545.25);
    expect(r.value.verticalDatum).toMatch(/NAVD 88/);
    expect(r.value.tried).toEqual([{ source: "3dep-seamless", outcome: "used" }]);
    expect(r.provenance).toMatchObject({ source: "3dep-seamless", items: [DEP_ID] });
  });

  it("falls back to GLO-30 when 3DEP leaves land without a reading, and names both", async () => {
    // Synthetic GLO-30 grid at 5 m everywhere, so every 3DEP gap is land.
    const glo = npyFloat32(new Float32Array(256).fill(5), new Float32Array(256).fill(255));
    const r = await fetchElevation(BBOX, 16, { fetchImpl: archive({ glo }) });
    if (r.status !== "measured") throw new Error("expected elevation");
    expect(r.value.source).toBe("cop-dem-glo-30");
    expect(r.value.surface).toBe("surface_model");
    expect(r.value.tried).toEqual([
      { source: "3dep-seamless", outcome: "18.8% of the land in the place has no reading" },
      { source: "cop-dem-glo-30", outcome: "used" },
    ]);
    expect(r.value.attribution).toMatch(/Airbus Defence and Space/);
  });

  it("uses GLO-30 outside the United States", async () => {
    const empty = new TextEncoder().encode(JSON.stringify({ features: [] }));
    const r = await fetchElevation(BBOX, 16, { fetchImpl: archive({ depSearch: empty }) });
    if (r.status !== "measured") throw new Error("expected elevation");
    expect(r.value.source).toBe("cop-dem-glo-30");
    expect(r.value.noReadingAtSeaShare).toBeNull();
    expect(r.value.tried[0]).toEqual({
      source: "3dep-seamless",
      outcome: "no item covers the place",
    });
  });

  it("is missing, with every source tried, when neither model covers the land", async () => {
    const empty = new TextEncoder().encode(JSON.stringify({ features: [] }));
    const glo = npyFloat32(new Float32Array(256).fill(5), new Float32Array(256).fill(0));
    const r = await fetchElevation(BBOX, 16, { fetchImpl: archive({ depSearch: empty, glo }) });
    expect(r).toMatchObject({ status: "missing", reason: "outside_coverage" });
    if (r.status !== "missing") throw new Error("expected missing");
    expect(r.detail).toMatch(
      /3dep-seamless: no item covers the place; cop-dem-glo-30: 100.0% of the land/,
    );
  });
});

describe("mosaicElevation and classifyGaps", () => {
  it("takes the first reading per cell and refuses a crop of the wrong size", () => {
    const a = parseNpy(depCrop);
    const b = parseNpy(gloCrop);
    if (!a || !b) throw new Error("fixtures did not parse");
    const merged = mosaicElevation([a, b], 16, 16);
    expect(merged.every((v) => !Number.isNaN(v))).toBe(true);
    expect(() => mosaicElevation([a], 8, 8)).toThrow(/expected 2 x 8 x 8/);
  });

  it("splits gaps into sea and land by the reference model", () => {
    const gappy = Float32Array.from([Number.NaN, Number.NaN, 3, Number.NaN]);
    const ref = Float32Array.from([-0.5, 0.8, 4, 12]);
    expect(classifyGaps(gappy, ref)).toEqual({ atSea: 0.5, onLand: 0.25 });
  });
});
