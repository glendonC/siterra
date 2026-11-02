import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CANOPY_ATTRIBUTION,
  cachedCanopyHeight,
  canopyTileKey,
  decodeTiffLzw,
  fetchCanopyHeight,
} from "./canopy.ts";

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "canopy-central-park");

/** Encodes uncompressed bytes with TIFF LZW (MSB-first bit packing, clear code 256, EOI 257, 9-bit symbols). */
function encodeSimpleTiffLzw(raw: Uint8Array): Uint8Array {
  const out: number[] = [];
  let bitBuf = 0;
  let bitCnt = 0;
  const emit = (code: number) => {
    bitBuf = (bitBuf << 9) | (code & 0x1ff);
    bitCnt += 9;
    while (bitCnt >= 8) {
      bitCnt -= 8;
      out.push((bitBuf >>> bitCnt) & 0xff);
    }
  };
  emit(256);
  for (let i = 0; i < raw.length; i++) {
    // Emit a clear code every 250 literals so the code width stays at 9 bits in the test helper.
    if (i > 0 && i % 250 === 0) emit(256);
    emit(raw[i] ?? 0);
  }
  emit(257);
  if (bitCnt > 0) out.push((bitBuf << (8 - bitCnt)) & 0xff);
  return new Uint8Array(out);
}

/** Builds a classic little-endian TIFF header + strip table with two populated strips at `row0` and `row0 + 1`. */
function buildSyntheticTile(
  row0: number,
  strip0: Uint8Array,
  strip1: Uint8Array,
): { header: Uint8Array; stripOffset0: number; stripsPayload: Uint8Array } {
  const height = 40000;
  const ifdOff = 8;
  const numTags = 9;
  const sbOff = 218;
  const soOff = sbOff + height * 4;
  const headerSize = soOff + height * 4;
  const header = new Uint8Array(headerSize);
  const dv = new DataView(header.buffer);
  header[0] = 0x49;
  header[1] = 0x49;
  dv.setUint16(2, 42, true);
  dv.setUint32(4, ifdOff, true);
  dv.setUint16(ifdOff, numTags, true);

  const tags: [number, number, number, number][] = [
    [256, 3, 1, 40000],
    [257, 3, 1, height],
    [258, 3, 1, 16],
    [259, 3, 1, 5],
    [273, 4, height, soOff],
    [277, 3, 1, 1],
    [278, 3, 1, 1],
    [279, 4, height, sbOff],
    [317, 3, 1, 1],
  ];
  tags.forEach(([tag, typ, cnt, val], i) => {
    const p = ifdOff + 2 + i * 12;
    dv.setUint16(p, tag, true);
    dv.setUint16(p + 2, typ, true);
    dv.setUint32(p + 4, cnt, true);
    if (typ === 3 && cnt === 1) dv.setUint16(p + 8, val, true);
    else dv.setUint32(p + 8, val, true);
  });

  const stripOffset0 = 500_000;
  dv.setUint32(soOff + row0 * 4, stripOffset0, true);
  dv.setUint32(sbOff + row0 * 4, strip0.byteLength, true);
  dv.setUint32(soOff + (row0 + 1) * 4, stripOffset0 + strip0.byteLength, true);
  dv.setUint32(sbOff + (row0 + 1) * 4, strip1.byteLength, true);

  const stripsPayload = new Uint8Array(strip0.byteLength + strip1.byteLength);
  stripsPayload.set(strip0, 0);
  stripsPayload.set(strip1, strip0.byteLength);
  return { header, stripOffset0, stripsPayload };
}

describe("Meta and WRI canopy height reader", () => {
  it("decodes the recorded Central Park LZW strip (row 36880) and matches prefix decoding", () => {
    const strip = new Uint8Array(readFileSync(join(FIXTURES, "strip-r36880.lzw")));
    const fullRow = new Uint8Array(40000 * 2);
    const decodedBytes = decodeTiffLzw(strip, fullRow);
    expect(decodedBytes).toBe(80000);

    const view = new DataView(fullRow.buffer);
    const cpFirst10: number[] = [];
    let maxCm = 0;
    for (let c = 24080; c < 24200; c++) {
      const cm = view.getUint16(c * 2, true);
      expect(cm).not.toBe(65535);
      if (c < 24090) cpFirst10.push(cm);
      if (cm > maxCm) maxCm = cm;
    }
    expect(cpFirst10).toEqual([0, 135, 76, 92, 118, 158, 86, 49, 316, 231]);
    expect(maxCm).toBe(1518);

    const partialRow = new Uint8Array(24200 * 2);
    const partialBytes = decodeTiffLzw(strip, partialRow);
    expect(partialBytes).toBeGreaterThanOrEqual(partialRow.length);
    expect(Buffer.compare(partialRow, fullRow.subarray(0, partialRow.length))).toBe(0);
  });

  it("reads a Central Park bbox from a TIFF strip table into metres with NaN for 65535 nodata and Maxar 2016 credit", async () => {
    const strip0 = new Uint8Array(readFileSync(join(FIXTURES, "strip-r36880.lzw")));
    // Build row 36881 with nodata (65535) at col 24080 and 850 cm (8.5 m) across cols 24081..24199.
    const rawRow1 = new Uint8Array(24200 * 2);
    const rv1 = new DataView(rawRow1.buffer);
    rv1.setUint16(24080 * 2, 65535, true);
    for (let c = 24081; c < 24200; c++) {
      rv1.setUint16(c * 2, 850, true);
    }
    const strip1 = encodeSimpleTiffLzw(rawRow1);
    const { header, stripOffset0, stripsPayload } = buildSyntheticTile(36880, strip0, strip1);

    const fetchImpl: typeof fetch = (_input, init) => {
      const range = new Headers(init?.headers).get("Range") ?? "";
      const m = /^bytes=(\d+)-(\d+)$/.exec(range);
      if (!m) return Promise.resolve(new Response("missing Range", { status: 400 }));
      const start = Number(m[1]);
      const end = Number(m[2]);
      if (start === 0) {
        return Promise.resolve(
          new Response(Buffer.from(header.subarray(0, Math.min(header.length, end + 1))), {
            status: 206,
          }),
        );
      }
      const relStart = start - stripOffset0;
      const relEnd = end - stripOffset0 + 1;
      return Promise.resolve(
        new Response(Buffer.from(stripsPayload.subarray(relStart, relEnd)), { status: 206 }),
      );
    };

    // Bbox covering rows 36880..36881 (lat 40.7795..40.78) and cols 24080..24199 (lon -73.98..-73.95).
    const res = await fetchCanopyHeight([-73.98, 40.7795, -73.95, 40.78], { fetchImpl });
    expect(res.status).toBe("measured");
    if (res.status !== "measured") return;

    expect(res.value.product).toBe("meta_chm_v1_avg_1_4000_deg");
    expect(res.value.width).toBe(120);
    expect(res.value.height).toBe(2);
    expect(res.value.tileKeys).toEqual(["meta_chm_lat=50.0_lon=-80.0_avg.tif"]);
    expect(res.value.attribution).toBe(CANOPY_ATTRIBUTION);
    expect(res.value.attribution).toContain("© 2016 Maxar");

    // Row 0: recorded Central Park centimetres turned into metres.
    expect(res.value.meanHeightM[0]).toBeCloseTo(0, 5);
    expect(res.value.meanHeightM[1]).toBeCloseTo(1.35, 5);
    expect(res.value.meanHeightM[2]).toBeCloseTo(0.76, 5);
    expect(res.value.maxHeightM).toBeCloseTo(15.18, 2);

    // Row 1 col 0: 65535 nodata becomes NaN; col 1 is 8.5 m.
    expect(Number.isNaN(res.value.meanHeightM[120])).toBe(true);
    expect(res.value.meanHeightM[121]).toBeCloseTo(8.5, 5);
    expect(res.value.noReadingShare).toBeCloseTo(1 / 240, 4);
  });

  it("formats 10-degree S3 tile keys including equatorial lat=-0.0 and caches measured results per place", async () => {
    expect(canopyTileKey(50, -80)).toBe("meta_chm_lat=50.0_lon=-80.0_avg.tif");
    expect(canopyTileKey(-40, 160)).toBe("meta_chm_lat=-40.0_lon=160.0_avg.tif");
    expect(canopyTileKey(0, -100)).toBe("meta_chm_lat=-0.0_lon=-100.0_avg.tif");
    expect(canopyTileKey(10, 0)).toBe("meta_chm_lat=10.0_lon=0.0_avg.tif");

    const strip0 = new Uint8Array(readFileSync(join(FIXTURES, "strip-r36880.lzw")));
    const { header, stripOffset0, stripsPayload } = buildSyntheticTile(36880, strip0, strip0);
    let calls = 0;
    const fetchImpl: typeof fetch = (_input, init) => {
      calls++;
      const range = new Headers(init?.headers).get("Range") ?? "";
      const m = /^bytes=(\d+)-(\d+)$/.exec(range);
      const start = Number(m?.[1] ?? 0);
      const end = Number(m?.[2] ?? 0);
      if (start === 0) {
        return Promise.resolve(
          new Response(Buffer.from(header.subarray(0, Math.min(header.length, end + 1))), {
            status: 206,
          }),
        );
      }
      return Promise.resolve(
        new Response(
          Buffer.from(stripsPayload.subarray(start - stripOffset0, end - stripOffset0 + 1)),
          { status: 206 },
        ),
      );
    };

    const tmp = mkdtempSync(join(tmpdir(), "siterra-canopy-cache-"));
    try {
      const bbox: [number, number, number, number] = [-73.98, 40.7795, -73.95, 40.78];
      const first = await cachedCanopyHeight(bbox, { fetchImpl, cacheDir: tmp });
      expect(first.status).toBe("measured");
      const callsAfterFirst = calls;
      expect(callsAfterFirst).toBeGreaterThan(0);

      const second = await cachedCanopyHeight(bbox, { fetchImpl, cacheDir: tmp });
      expect(second.status).toBe("measured");
      expect(calls).toBe(callsAfterFirst);
      if (first.status === "measured" && second.status === "measured") {
        expect(second.value.meanHeightM).toBeInstanceOf(Float32Array);
        expect(second.value.meanHeightM.length).toBe(first.value.meanHeightM.length);
        expect(second.value.meanHeightM[1]).toBeCloseTo(1.35, 5);
      }
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("returns status missing with reason outside_coverage when S3 returns 404 for an ocean tile", async () => {
    const fetchImpl: typeof fetch = () =>
      Promise.resolve(new Response("Not Found", { status: 404 }));
    const res = await fetchCanopyHeight([-145.1, 4.9, -144.9, 5.1], { fetchImpl });
    expect(res.status).toBe("missing");
    if (res.status !== "missing") return;
    expect(res.reason).toBe("outside_coverage");
  });
});
