import { deflateSync, inflateSync } from "node:zlib";

/**
 * Decodes an 8-bit RGB (colorType 2), Indexed (colorType 3), Grayscale+Alpha (colorType 4),
 * or RGBA (colorType 6) PNG buffer into an RGBA Uint8Array of length width * height * 4.
 */
export function decodePngRgba(
  bytes: Uint8Array,
): { width: number; height: number; data: Uint8Array } | null {
  if (bytes.length < 33 || bytes[0] !== 137 || bytes[1] !== 80) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let width = 0;
  let height = 0;
  let bitDepth = 8;
  let colorType = 6;
  let palette: Uint8Array | null = null;
  const idatParts: Uint8Array[] = [];
  let offset = 8;

  while (offset + 8 <= bytes.length) {
    const len = view.getUint32(offset, false);
    const type = String.fromCharCode(
      bytes[offset + 4] ?? 0,
      bytes[offset + 5] ?? 0,
      bytes[offset + 6] ?? 0,
      bytes[offset + 7] ?? 0,
    );
    const dataStart = offset + 8;
    if (dataStart + len > bytes.length) break;
    if (type === "IHDR" && len >= 10) {
      width = view.getUint32(dataStart, false);
      height = view.getUint32(dataStart + 4, false);
      bitDepth = bytes[dataStart + 8] ?? 8;
      colorType = bytes[dataStart + 9] ?? 6;
    } else if (type === "PLTE") {
      palette = bytes.subarray(dataStart, dataStart + len);
    } else if (type === "IDAT") {
      idatParts.push(bytes.subarray(dataStart, dataStart + len));
    } else if (type === "IEND") {
      break;
    }
    offset = dataStart + len + 4;
  }

  if (width <= 0 || height <= 0 || bitDepth !== 8 || idatParts.length === 0) {
    return null;
  }

  const bpp =
    colorType === 6
      ? 4
      : colorType === 2
        ? 3
        : colorType === 4
          ? 2
          : colorType === 3 || colorType === 0
            ? 1
            : 0;
  if (bpp === 0) return null;

  try {
    const totalIdat = idatParts.reduce((s, p) => s + p.length, 0);
    const compressed = new Uint8Array(totalIdat);
    let pos = 0;
    for (const p of idatParts) {
      compressed.set(p, pos);
      pos += p.length;
    }
    const raw = inflateSync(compressed);
    const stride = width * bpp;
    if (raw.length < height * (1 + stride)) return null;

    const recon = new Uint8Array(height * stride);
    const paeth = (a: number, b: number, c: number): number => {
      const p = a + b - c;
      const pa = Math.abs(p - a);
      const pb = Math.abs(p - b);
      const pc = Math.abs(p - c);
      return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
    };

    for (let r = 0; r < height; r++) {
      const filter = raw[r * (1 + stride)] ?? 0;
      const srcOff = r * (1 + stride) + 1;
      const dstOff = r * stride;
      for (let i = 0; i < stride; i++) {
        const x = raw[srcOff + i] ?? 0;
        const a = i >= bpp ? (recon[dstOff + i - bpp] ?? 0) : 0;
        const b = r > 0 ? (recon[dstOff - stride + i] ?? 0) : 0;
        const c = r > 0 && i >= bpp ? (recon[dstOff - stride + i - bpp] ?? 0) : 0;
        let val = x;
        if (filter === 1) val = (x + a) & 255;
        else if (filter === 2) val = (x + b) & 255;
        else if (filter === 3) val = (x + ((a + b) >> 1)) & 255;
        else if (filter === 4) val = (x + paeth(a, b, c)) & 255;
        recon[dstOff + i] = val;
      }
    }

    const rgba = new Uint8Array(width * height * 4);
    for (let i = 0; i < width * height; i++) {
      const dst = i * 4;
      if (colorType === 6) {
        rgba[dst] = recon[i * 4] ?? 0;
        rgba[dst + 1] = recon[i * 4 + 1] ?? 0;
        rgba[dst + 2] = recon[i * 4 + 2] ?? 0;
        rgba[dst + 3] = recon[i * 4 + 3] ?? 255;
      } else if (colorType === 2) {
        rgba[dst] = recon[i * 3] ?? 0;
        rgba[dst + 1] = recon[i * 3 + 1] ?? 0;
        rgba[dst + 2] = recon[i * 3 + 2] ?? 0;
        rgba[dst + 3] = 255;
      } else if (colorType === 3 && palette) {
        const idx = (recon[i] ?? 0) * 3;
        rgba[dst] = palette[idx] ?? 0;
        rgba[dst + 1] = palette[idx + 1] ?? 0;
        rgba[dst + 2] = palette[idx + 2] ?? 0;
        rgba[dst + 3] = 255;
      } else if (colorType === 4) {
        const g = recon[i * 2] ?? 0;
        rgba[dst] = g;
        rgba[dst + 1] = g;
        rgba[dst + 2] = g;
        rgba[dst + 3] = recon[i * 2 + 1] ?? 255;
      } else {
        const g = recon[i] ?? 0;
        rgba[dst] = g;
        rgba[dst + 1] = g;
        rgba[dst + 2] = g;
        rgba[dst + 3] = 255;
      }
    }
    return { width, height, data: rgba };
  } catch {
    return null;
  }
}

/**
 * Encodes an RGBA Uint8Array into a valid PNG buffer.
 */
export function encodeRgbaPng(width: number, height: number, rgba: Uint8Array): Uint8Array {
  const crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    crcTable[n] = c;
  }
  const crc32 = (buf: Uint8Array): number => {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      c = (crcTable[(c ^ (buf[i] ?? 0)) & 0xff] ?? 0) ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
  };
  const makeChunk = (type: string, data: Uint8Array): Uint8Array => {
    const out = new Uint8Array(12 + data.length);
    const dv = new DataView(out.buffer);
    dv.setUint32(0, data.length, false);
    for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
    out.set(data, 8);
    dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)), false);
    return out;
  };

  const ihdr = new Uint8Array(13);
  const ihdrView = new DataView(ihdr.buffer);
  ihdrView.setUint32(0, width, false);
  ihdrView.setUint32(4, height, false);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4;
  const raw = new Uint8Array(height * (1 + stride));
  for (let r = 0; r < height; r++) {
    raw[r * (1 + stride)] = 0;
    raw.set(rgba.subarray(r * stride, (r + 1) * stride), r * (1 + stride) + 1);
  }
  const compressed = deflateSync(raw);

  const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const cIhdr = makeChunk("IHDR", ihdr);
  const cIdat = makeChunk("IDAT", new Uint8Array(compressed));
  const cIend = makeChunk("IEND", new Uint8Array(0));

  const total = new Uint8Array(signature.length + cIhdr.length + cIdat.length + cIend.length);
  let pos = 0;
  for (const part of [signature, cIhdr, cIdat, cIend]) {
    total.set(part, pos);
    pos += part.length;
  }
  return total;
}
