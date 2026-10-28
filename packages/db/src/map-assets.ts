// Public map assets on the application origin (07-deployment-view.md, map and observation assets;
// ADR-0018): the data/map/ bundle under /api/map-assets/<version>/<path>, where the version is the
// SHA-256 of its manifest.json. Only files the manifest lists are served, each checked against the
// size and SHA-256 it lists, so a changed or unlisted file is never served. No ownership check: these
// are display assets every visitor sees before a case is open.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, normalize, posix, resolve, sep } from "node:path";
import { z } from "zod";

export type MapAssetFile = {
  absolutePath: string;
  contentType: string;
  sha256: string;
  size: number;
};

const ListedFile = z.object({
  path: z.string().min(1),
  bytes: z.int().min(0),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
});
const MapManifest = z.object({
  bundle: z.literal("siterra-map"),
  layers: z.record(z.string(), z.object({ files: z.array(ListedFile) })),
  licences: z.array(ListedFile),
});

const contentTypes: Record<string, string> = {
  ".png": "image/png",
  ".webp": "image/webp",
  ".json": "application/json",
  ".md": "text/markdown; charset=utf-8",
  // The globe grids are gzip streams the client inflates itself; never sent as Content-Encoding.
  ".gz": "application/gzip",
};

type Listing = {
  size: bigint;
  mtimeNs: bigint;
  version: string;
  files: Map<string, { bytes: number; sha256: string }>;
};
const listings = new Map<string, Listing>();
/** Files whose bytes matched, with the size and nanosecond mtime they had then (as case-assets.ts). */
const verified = new Map<string, { size: bigint; mtimeNs: bigint; sha256: string }>();

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** The manifest's listing, read again whenever manifest.json changes size or modification time. */
function readListing(mapDir: string): Listing | null {
  const manifestPath = join(mapDir, "manifest.json");
  if (!existsSync(manifestPath)) return null;
  const stat = statSync(manifestPath, { bigint: true });
  const cached = listings.get(manifestPath);
  if (cached?.size === stat.size && cached.mtimeNs === stat.mtimeNs) return cached;
  const bytes = readFileSync(manifestPath);
  const parsed = MapManifest.safeParse(JSON.parse(bytes.toString("utf8")));
  if (!parsed.success) return null;
  const files = new Map<string, { bytes: number; sha256: string }>();
  for (const file of [
    ...Object.values(parsed.data.layers).flatMap((layer) => layer.files),
    ...parsed.data.licences,
  ]) {
    files.set(file.path, { bytes: file.bytes, sha256: file.sha256 });
  }
  const listing = { size: stat.size, mtimeNs: stat.mtimeNs, version: sha256(bytes), files };
  listings.set(manifestPath, listing);
  return listing;
}

/** The version of the map bundle at mapDir (the SHA-256 of its manifest.json), or null. */
export function currentMapVersion(mapDir: string): string | null {
  return readListing(resolve(mapDir))?.version ?? null;
}

/**
 * The file a map asset path names, or null when the version is not the current manifest's, the
 * path is not one the manifest lists, or the file no longer matches its listed size and SHA-256.
 */
export function resolveMapAsset(
  mapDir: string,
  args: { version: string; assetPath: string },
): MapAssetFile | null {
  if (!/^[0-9a-f]{64}$/.test(args.version)) return null;
  const root = resolve(mapDir);
  const listing = readListing(root);
  if (listing?.version !== args.version) return null;
  const path = posix.normalize(args.assetPath);
  if (path.startsWith("/") || path === ".." || path.startsWith("../")) return null;
  const entry =
    path === "manifest.json"
      ? { bytes: Number(listing.size), sha256: listing.version }
      : listing.files.get(path);
  if (entry === undefined) return null;
  const absolutePath = normalize(join(root, path));
  if (!absolutePath.startsWith(root + sep) || !existsSync(absolutePath)) return null;
  const stat = statSync(absolutePath, { bigint: true });
  if (stat.size !== BigInt(entry.bytes)) return null;
  const known = verified.get(absolutePath);
  if (
    known?.size !== stat.size ||
    known.mtimeNs !== stat.mtimeNs ||
    known.sha256 !== entry.sha256
  ) {
    verified.delete(absolutePath);
    if (sha256(readFileSync(absolutePath)) !== entry.sha256) return null;
    verified.set(absolutePath, { size: stat.size, mtimeNs: stat.mtimeNs, sha256: entry.sha256 });
  }
  return {
    absolutePath,
    contentType: contentTypes[extname(path)] ?? "application/octet-stream",
    sha256: entry.sha256,
    size: entry.bytes,
  };
}

/** The repository's data/map, found upward from start (the web app runs from apps/web). */
export function findMapDir(start: string): string | null {
  let dir = resolve(start);
  for (;;) {
    if (existsSync(join(dir, "data", "map", "manifest.json"))) return join(dir, "data", "map");
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}
