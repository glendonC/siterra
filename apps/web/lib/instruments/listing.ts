// The instruments' records: the case's instrument specs as GET /api/cases/:id/instruments returns them, checked
// against the shared contract, and each bundle asset a spec names read through the case asset route and checked
// against the checksum the listing carries. The case is the one the valley opens (lib/case/load.ts): the visitor's
// own, or a demo copy of the seed case.

import {
  type BundleAssetRef,
  type CaseSnapshot,
  type InstrumentAsset,
  InstrumentListing,
  type InstrumentSpec,
  type InstrumentView,
} from "@siterra/contracts";
import { openCase } from "../case/load";

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

export type InstrumentsLoad =
  | { status: "ready"; listing: InstrumentListing }
  | { status: "unauthenticated" }
  | { status: "not_found" }
  | { status: "invalid"; issues: string[] }
  | { status: "failed"; httpStatus: number };

/** The instrument specs of one case at its current revision, or as of a given revision. */
export async function loadInstruments(
  caseId: string,
  fetchImpl: Fetch,
  revision?: number,
): Promise<InstrumentsLoad> {
  const at = revision === undefined ? "" : `?revision=${String(revision)}`;
  const res = await fetchImpl(`/api/cases/${encodeURIComponent(caseId)}/instruments${at}`, {
    credentials: "same-origin",
    headers: { accept: "application/json" },
  });
  if (res.status === 401) return { status: "unauthenticated" };
  if (res.status === 404) return { status: "not_found" };
  if (!res.ok) return { status: "failed", httpStatus: res.status };
  const parsed = InstrumentListing.safeParse(await res.json());
  if (!parsed.success)
    return {
      status: "invalid",
      issues: parsed.error.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`),
    };
  return { status: "ready", listing: parsed.data };
}

export type CaseInstruments =
  | { status: "ready"; snapshot: CaseSnapshot; listing: InstrumentListing }
  | Exclude<InstrumentsLoad, { status: "ready" }>;

/** The case the valley would open, with its instrument specs. */
export async function openInstruments(
  caseId: string | undefined,
  fetchImpl: Fetch,
  storage: Storage | undefined,
  now: number,
): Promise<CaseInstruments> {
  const opened = await openCase(caseId, fetchImpl, storage, now);
  if (opened.status !== "ready") return opened;
  const load = await loadInstruments(opened.snapshot.case.id, fetchImpl);
  return load.status === "ready"
    ? { status: "ready", snapshot: opened.snapshot, listing: load.listing }
    : load;
}

type Kind = InstrumentSpec["parameters"]["kind"];

/** The ready instrument of a kind, or undefined when the case has none. */
export function instrumentOf<K extends Kind>(
  listing: InstrumentListing,
  kind: K,
): (InstrumentView & { spec: { parameters: { kind: K } } }) | undefined {
  return listing.instruments.find(
    (v): v is InstrumentView & { spec: { parameters: { kind: K } } } =>
      v.spec.parameters.kind === kind && v.spec.status === "ready",
  );
}

export class AssetUnavailable extends Error {
  readonly ref: BundleAssetRef;
  readonly reason: string;
  constructor(ref: BundleAssetRef, reason: string) {
    super(`${ref.bundleId} ${ref.assetKey}: ${reason}`);
    this.ref = ref;
    this.reason = reason;
  }
}

/** The listing's entry for an asset a spec names. */
export function assetOf(view: InstrumentView, ref: BundleAssetRef): InstrumentAsset {
  const found = view.assets.find((a) => a.bundleId === ref.bundleId && a.assetKey === ref.assetKey);
  if (found === undefined) throw new AssetUnavailable(ref, "not in the listing");
  return found;
}

const hex = (bytes: ArrayBuffer) =>
  Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");

/**
 * The bytes of an asset a spec names, refused unless their sha256 is the listing's checksum (a multihash:
 * 0x12 for sha256, 0x20 for 32 bytes, then the digest).
 */
export async function readAsset(
  view: InstrumentView,
  ref: BundleAssetRef,
  fetchImpl: Fetch,
  signal?: AbortSignal,
): Promise<ArrayBuffer> {
  const asset = assetOf(view, ref);
  if (asset.status !== "available" || asset.href === null || asset.checksum === null)
    throw new AssetUnavailable(ref, asset.status);
  const res = await fetchImpl(asset.href, { credentials: "same-origin", signal });
  if (!res.ok) throw new AssetUnavailable(ref, `HTTP ${String(res.status)}`);
  const bytes = await res.arrayBuffer();
  const digest = `1220${hex(await crypto.subtle.digest("SHA-256", bytes))}`;
  if (digest !== asset.checksum) throw new AssetUnavailable(ref, "checksum differs");
  return bytes;
}

/** An asset a spec names, parsed as JSON. */
export async function readJsonAsset(
  view: InstrumentView,
  ref: BundleAssetRef,
  fetchImpl: Fetch,
  signal?: AbortSignal,
): Promise<unknown> {
  return JSON.parse(new TextDecoder().decode(await readAsset(view, ref, fetchImpl, signal)));
}

/** The asset a spec draws in a role (drawnAssets, contracts 1.16.0), as a reference to read. */
export function drawnAsset(view: InstrumentView, role: string): BundleAssetRef {
  const p = view.spec.parameters;
  const found = "drawnAssets" in p ? p.drawnAssets?.find((d) => d.role === role) : undefined;
  if (found === undefined)
    throw new AssetUnavailable(
      { bundleId: "none", assetKey: "none" },
      `no drawn asset in role ${role}`,
    );
  return found.asset;
}

/**
 * Where an available asset lives in the repository's bundles and its sha256, as the recompute-tested fixture
 * builders name their sources (data/bundles/<bundle>/<file>).
 */
export function bundleSource(
  view: InstrumentView,
  ref: BundleAssetRef,
): { path: string; sha256: string } {
  const asset = assetOf(view, ref);
  if (asset.status !== "available" || asset.href === null || asset.checksum === null)
    throw new AssetUnavailable(ref, asset.status);
  // /api/case-assets/<bundle>/<content hash>/<path in the bundle>
  const file = asset.href.split("/").slice(5).join("/");
  return { path: `data/bundles/${ref.bundleId}/${file}`, sha256: asset.checksum.slice(4) };
}
