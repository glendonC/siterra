// Case assets on the application origin (07-deployment-view.md, map and observation assets;
// 06-runtime-view.md: ownership checked on every request, static case assets included). A bundle's
// files are served under a versioned, hash-addressed path, <bundle ID>/<content hash>/<path>, where
// the content hash is the SHA-256 multihash of its collection.json: only files that manifest lists,
// each checked against its own checksum, so a changed or unlisted file is never served.
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, normalize, posix, resolve, sep } from "node:path";
import type { Pool } from "./client.ts";
import { sha256Multihash } from "./bundle-import.ts";

export type CaseAssetFile = {
  absolutePath: string;
  contentType: string;
  checksum: string;
  size: number;
};

type Listing = Map<string, { contentType: string; checksum: string }>;
/** A bundle's listed files by path, and its collection-level assets by key (key -> path). */
type Listed = { listing: Listing; keys: Map<string, string> };
const listings = new Map<string, { mtimeMs: number } & Listed>();
/**
 * Files whose bytes matched their checksum, keyed by path, with the size and modification time
 * (nanoseconds) they had then: a file that keeps both is not hashed again; any change to either
 * hashes it again before it is served. A rewrite that keeps the size and the nanosecond timestamp
 * is not detected; bundles are written once, not edited in place.
 */
const verified = new Map<string, { size: bigint; mtimeNs: bigint; checksum: string }>();

function relativeHref(href: string): string | null {
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("/")) return null;
  const path = posix.normalize(href.replace(/^\.\//, ""));
  return path.startsWith("../") || path === ".." ? null : path;
}

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

type StacFile = { href?: unknown; type?: unknown; rel?: unknown; "file:checksum"?: unknown };

/**
 * Every file the bundle's collection.json lists with a checksum, by its path inside the bundle, and
 * the collection-level assets among them by their asset key.
 */
function listBundle(bundleDir: string, collectionChecksum: string): Listed {
  const listing: Listing = new Map([
    ["collection.json", { contentType: "application/json", checksum: collectionChecksum }],
  ]);
  const keys = new Map<string, string>();
  const collection = readJson(join(bundleDir, "collection.json"));
  const add = (base: string, file: StacFile, fallbackType: string): string | null => {
    if (typeof file.href !== "string" || typeof file["file:checksum"] !== "string") return null;
    const path = relativeHref(posix.join(base, file.href));
    if (path === null) return null;
    listing.set(path, {
      contentType: typeof file.type === "string" ? file.type : fallbackType,
      checksum: file["file:checksum"],
    });
    return path;
  };
  for (const [key, asset] of Object.entries(
    (collection["assets"] ?? {}) as Record<string, StacFile>,
  )) {
    const path = add("", asset, "application/octet-stream");
    if (path !== null) keys.set(key, path);
  }
  for (const link of (collection["links"] ?? []) as StacFile[]) {
    if (link.rel !== "item") continue;
    add("", link, "application/geo+json");
    const itemPath = typeof link.href === "string" ? relativeHref(link.href) : null;
    if (itemPath === null || !existsSync(join(bundleDir, itemPath))) continue;
    const item = readJson(join(bundleDir, itemPath));
    for (const asset of Object.values((item["assets"] ?? {}) as Record<string, StacFile>)) {
      add(posix.dirname(itemPath), asset, "application/octet-stream");
    }
  }
  return { listing, keys };
}

/**
 * The listing of a bundle whose collection.json hashes to `contentHash`, or null when the bundle ID
 * has another shape, the collection is missing, or its bytes hash to something else.
 */
function loadListing(
  bundlesDir: string,
  args: { bundleId: string; contentHash: string },
): (Listed & { bundleDir: string }) | null {
  if (!/^bundle_[A-Za-z0-9][A-Za-z0-9_-]{1,79}$/.test(args.bundleId)) return null;
  const bundleDir = resolve(bundlesDir, args.bundleId);
  const collectionPath = join(bundleDir, "collection.json");
  if (!existsSync(collectionPath)) return null;
  const mtimeMs = statSync(collectionPath).mtimeMs;
  let cached = listings.get(collectionPath);
  if (cached === undefined || cached.mtimeMs !== mtimeMs) {
    const checksum = sha256Multihash(readFileSync(collectionPath));
    if (checksum !== args.contentHash) return null;
    cached = { mtimeMs, ...listBundle(bundleDir, checksum) };
    listings.set(collectionPath, cached);
  }
  if (cached.listing.get("collection.json")?.checksum !== args.contentHash) return null;
  return { bundleDir, listing: cached.listing, keys: cached.keys };
}

/**
 * The file a case asset path names, or null when the bundle, the content hash or the path is not
 * one the bundle's manifest lists, or the file no longer matches its checksum.
 */
export function resolveCaseAsset(
  bundlesDir: string,
  args: { bundleId: string; contentHash: string; assetPath: string },
): CaseAssetFile | null {
  const loaded = loadListing(bundlesDir, args);
  if (loaded === null) return null;
  const { bundleDir, listing } = loaded;
  const path = relativeHref(args.assetPath);
  if (path === null) return null;
  const entry = listing.get(path);
  if (entry === undefined) return null;
  // Bundle files are read from data/bundles at run time, never bundled; the comment keeps the
  // build from tracing the whole repository into the server output.
  const absolutePath = normalize(join(/*turbopackIgnore: true*/ bundleDir, path));
  if (!absolutePath.startsWith(bundleDir + sep) || !existsSync(absolutePath)) return null;
  const stat = statSync(absolutePath, { bigint: true });
  const known = verified.get(absolutePath);
  if (
    known?.size !== stat.size ||
    known.mtimeNs !== stat.mtimeNs ||
    known.checksum !== entry.checksum
  ) {
    verified.delete(absolutePath);
    if (sha256Multihash(readFileSync(absolutePath)) !== entry.checksum) return null;
    verified.set(absolutePath, {
      size: stat.size,
      mtimeNs: stat.mtimeNs,
      checksum: entry.checksum,
    });
  }
  return {
    absolutePath,
    contentType: entry.contentType,
    checksum: entry.checksum,
    size: Number(stat.size),
  };
}

export type BundleAssetResolution =
  | { status: "available"; assetPath: string; file: CaseAssetFile }
  | { status: "asset_key_unknown" }
  | { status: "file_unavailable" };

/**
 * The file a bundle's collection lists under an asset key, checked as resolveCaseAsset checks a path:
 * the collection must hash to `contentHash` and the file to the checksum the collection lists for it.
 * Only collection-level assets have a key. An unknown key is named apart from a bundle or file that
 * cannot be read or no longer matches.
 */
export function resolveBundleAsset(
  bundlesDir: string,
  args: { bundleId: string; contentHash: string; assetKey: string },
): BundleAssetResolution {
  const loaded = loadListing(bundlesDir, args);
  if (loaded === null) return { status: "file_unavailable" };
  const assetPath = loaded.keys.get(args.assetKey);
  if (assetPath === undefined) return { status: "asset_key_unknown" };
  const file = resolveCaseAsset(bundlesDir, {
    bundleId: args.bundleId,
    contentHash: args.contentHash,
    assetPath,
  });
  return file === null ? { status: "file_unavailable" } : { status: "available", assetPath, file };
}

/** True when the owner has a case holding this bundle with this content hash (any revision). */
export async function ownsBundle(
  pool: Pool,
  args: { ownerScopeId: string; bundleId: string; contentHash: string },
): Promise<boolean> {
  const result = await pool.query(
    `select 1 from records r join cases c on c.id = r.case_id
     where c.owner_scope_id = $1 and r.record_type = 'DataBundle' and r.entity_id = $2
       and r.record ->> 'contentHash' = $3
     limit 1`,
    [args.ownerScopeId, args.bundleId, args.contentHash],
  );
  return (result.rowCount ?? 0) > 0;
}

/** The repository's data/bundles folder, found upward from a start folder (development and tests). */
export function findBundlesDir(start: string): string | null {
  let dir = resolve(start);
  for (;;) {
    if (existsSync(join(dir, "data", "bundles", "catalog.json")))
      return join(dir, "data", "bundles");
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}
