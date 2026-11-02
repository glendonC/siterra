/**
 * Per-place cache of measured live data under `.local/cache/live-data/<kind>/<key>.json` (gitignored, like the
 * terrain cache). Only measured results are stored: a missing value is fetched again next time. Typed arrays are kept
 * as base64 of their bytes so grids survive the round trip, while an image with a PNG buffer is stored as a `.png`
 * file beside a small `.json` metadata file.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { Bbox, LiveResult, Measured, Ring } from "./planetary.ts";
import { decodePngRgba } from "./satellite-fetcher.ts";

const REPO_ROOT = process.cwd().endsWith("/apps/web")
  ? resolve(process.cwd(), "..", "..")
  : process.cwd();

export const LIVE_CACHE_DIR = join(REPO_ROOT, ".local", "cache", "live-data");

type TypedName = "Float32Array" | "Uint8Array" | "Int16Array" | "Uint16Array";
const TYPED = { Float32Array, Uint8Array, Int16Array, Uint16Array } as const;

interface EncodedTyped {
  $typed: TypedName;
  b64: string;
}

function encode(_key: string, value: unknown): unknown {
  for (const name of Object.keys(TYPED) as TypedName[]) {
    if (value instanceof TYPED[name]) {
      const bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
      return { $typed: name, b64: Buffer.from(bytes).toString("base64") } satisfies EncodedTyped;
    }
  }
  return value;
}

function decode(_key: string, value: unknown): unknown {
  if (value && typeof value === "object" && "$typed" in value && "b64" in value) {
    const v = value as EncodedTyped;
    const ctor = TYPED[v.$typed];
    const bytes = Buffer.from(v.b64, "base64");
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    return new ctor(copy.buffer, 0, copy.byteLength / ctor.BYTES_PER_ELEMENT);
  }
  return value;
}

/** A key from the place geometry and the method version, so a new method never reads an old result. */
export function liveCacheKey(bbox: Bbox, ring: Ring | undefined, methodVersion: string): string {
  const round = (n: number) => Number(n.toFixed(6));
  const payload = JSON.stringify({
    bbox: bbox.map(round),
    ring: ring?.map(([x, y]) => [round(x), round(y)]) ?? null,
    methodVersion,
  });
  return createHash("sha256").update(payload).digest("hex").slice(0, 24);
}

export function liveCachePath(kind: string, key: string, dir = LIVE_CACHE_DIR): string {
  return join(dir, kind.replace(/[^a-z0-9-]/gi, "_"), `${key}.json`);
}

interface PngSidecarValue {
  png?: unknown;
  rgba?: unknown;
  pngFile?: unknown;
  width?: unknown;
  height?: unknown;
}

function hasPngSidecar(
  v: unknown,
): v is Record<string, unknown> & { png: Uint8Array; rgba: Uint8Array } {
  if (!v || typeof v !== "object") return false;
  const c = v as PngSidecarValue;
  return c.png instanceof Uint8Array && c.rgba instanceof Uint8Array;
}

export function readLiveCache<T>(kind: string, key: string, dir?: string): Measured<T> | null {
  const path = liveCachePath(kind, key, dir);
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"), decode) as {
      status?: unknown;
      value?: unknown;
    };
    if (parsed.status !== "measured") return null;
    if (parsed.value && typeof parsed.value === "object" && "pngFile" in parsed.value) {
      const val = parsed.value as Record<string, unknown> & PngSidecarValue;
      if (typeof val.pngFile !== "string") return null;
      const pngPath = join(dirname(path), val.pngFile);
      if (!existsSync(pngPath)) return null;
      const png = new Uint8Array(readFileSync(pngPath));
      const decoded = decodePngRgba(png);
      if (
        !decoded ||
        (typeof val.width === "number" && decoded.width !== val.width) ||
        (typeof val.height === "number" && decoded.height !== val.height)
      ) {
        return null;
      }
      delete val.pngFile;
      val.png = png;
      val.rgba = decoded.data;
    }
    return parsed as Measured<T>;
  } catch {
    return null;
  }
}

export function writeLiveCache<T>(
  kind: string,
  key: string,
  value: Measured<T>,
  dir?: string,
): void {
  const path = liveCachePath(kind, key, dir);
  mkdirSync(dirname(path), { recursive: true });
  let toWrite: unknown = value;
  if (hasPngSidecar(value.value)) {
    const pngFile = `${key}.png`;
    const pngPath = join(dirname(path), pngFile);
    const pngTmp = `${pngPath}.${process.pid}.tmp`;
    writeFileSync(pngTmp, value.value.png);
    renameSync(pngTmp, pngPath);
    const meta: Record<string, unknown> = { ...value.value, pngFile };
    delete meta.png;
    delete meta.rgba;
    toWrite = { ...value, value: meta };
  }
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(toWrite, encode));
  renameSync(tmp, path);
}

/** Returns the cached measured result, or fetches, caches a measured result and returns whatever came back. */
export async function cachedLive<T>(
  kind: string,
  key: string,
  fetcher: () => Promise<LiveResult<T>>,
  dir?: string,
): Promise<LiveResult<T>> {
  const hit = readLiveCache<T>(kind, key, dir);
  if (hit) return hit;
  const result = await fetcher();
  if (result.status === "measured") {
    try {
      writeLiveCache(kind, key, result, dir);
    } catch {
      // A cache that cannot be written only costs the next start a fetch.
    }
  }
  return result;
}
