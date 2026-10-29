import { cpSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { sha256Multihash } from "./bundle-import.ts";
import { findBundlesDir, resolveBundleAsset, resolveCaseAsset } from "./case-assets.ts";

const bundlesDir = fileURLToPath(new URL("../../../data/bundles/", import.meta.url));
const bundleId = "bundle_chirps_monthly_ait_bouguemez";
const contentHash = sha256Multihash(readFileSync(`${bundlesDir}${bundleId}/collection.json`));
const at = (assetPath: string, hash = contentHash) =>
  resolveCaseAsset(bundlesDir, { bundleId, contentHash: hash, assetPath });

describe("case assets: only files the bundle manifest lists, each matching its checksum", () => {
  it("serves the rainfall cells, a period Item and its cell values, and the manifest itself", () => {
    expect(at("rainfall-cells.geojson")?.contentType).toBe("application/geo+json");
    expect(at("period_2022-04/period_2022-04.json")?.size).toBeGreaterThan(0);
    expect(at("period_2022-04/cell-values.json")?.contentType).toBe("application/json");
    expect(at("collection.json")?.checksum).toBe(contentHash);
  });

  it("refuses a stale content hash, an unlisted file, a path out of the bundle and another bundle ID shape", () => {
    expect(at("rainfall-cells.geojson", `1220${"0".repeat(64)}`)).toBeNull();
    expect(at("uv-missing.lock")).toBeNull();
    expect(at("../catalog.json")).toBeNull();
    expect(
      at("period_2022-04/../../bundle_s2_ndvi_monthly_ait_bouguemez/collection.json"),
    ).toBeNull();
    expect(
      resolveCaseAsset(bundlesDir, {
        bundleId: "../data",
        contentHash,
        assetPath: "collection.json",
      }),
    ).toBeNull();
  });

  it("finds data/bundles upward from a folder of the repository", () => {
    expect(findBundlesDir(fileURLToPath(new URL(".", import.meta.url)))).toBe(
      bundlesDir.replace(/\/$/, ""),
    );
  });
});

describe("case assets: a verified file is hashed again when its size or modification time changes", () => {
  it("serves an unchanged copy, then refuses it once its bytes change", () => {
    const dir = mkdtempSync(join(tmpdir(), "siterra-assets-"));
    try {
      cpSync(`${bundlesDir}${bundleId}`, join(dir, bundleId), { recursive: true });
      const path = join(dir, bundleId, "period_2022-04/cell-values.json");
      const resolveCopy = () =>
        resolveCaseAsset(dir, {
          bundleId,
          contentHash,
          assetPath: "period_2022-04/cell-values.json",
        });
      const original = readFileSync(path);
      expect(resolveCopy()?.size).toBe(original.length);
      expect(resolveCopy()?.size).toBe(original.length);
      const changed = Buffer.from(original);
      changed[0] = changed[0] === 0x20 ? 0x0a : 0x20;
      writeFileSync(path, changed);
      utimesSync(path, new Date("2026-01-01T00:00:00Z"), new Date("2026-01-01T00:00:00Z"));
      expect(resolveCopy()).toBeNull();
      writeFileSync(path, Buffer.concat([original, Buffer.from(" ")]));
      expect(resolveCopy()).toBeNull();
      writeFileSync(path, original);
      expect(resolveCopy()?.size).toBe(original.length);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("does not hash a file again while its size and modification time stay the same", () => {
    const dir = mkdtempSync(join(tmpdir(), "siterra-assets-"));
    try {
      cpSync(`${bundlesDir}${bundleId}`, join(dir, bundleId), { recursive: true });
      const path = join(dir, bundleId, "period_2022-04/cell-values.json");
      const fixed = new Date("2026-02-01T00:00:00Z");
      utimesSync(path, fixed, fixed);
      const resolveCopy = () =>
        resolveCaseAsset(dir, {
          bundleId,
          contentHash,
          assetPath: "period_2022-04/cell-values.json",
        });
      expect(resolveCopy()).not.toBeNull();
      const changed = readFileSync(path);
      changed[0] = changed[0] === 0x20 ? 0x0a : 0x20;
      writeFileSync(path, changed);
      utimesSync(path, fixed, fixed);
      // The documented limit: same size and same timestamp, so the cached verification stands.
      expect(resolveCopy()).not.toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("case assets: a bundle asset by its key", () => {
  const byKey = (assetKey: string, hash = contentHash, id = bundleId) =>
    resolveBundleAsset(bundlesDir, { bundleId: id, contentHash: hash, assetKey });

  it("finds the file the collection lists under the key, and checks it as the path route does", () => {
    const found = byKey("rainfall_cells");
    expect(found.status).toBe("available");
    if (found.status !== "available") return;
    expect(found.assetPath).toBe("rainfall-cells.geojson");
    expect(found.file.contentType).toBe("application/geo+json");
    expect(found.file.absolutePath).toBe(at("rainfall-cells.geojson")?.absolutePath);
    expect(found.file.checksum).toBe(at("rainfall-cells.geojson")?.checksum);
  });

  it("finds the frozen geometry under its key", () => {
    const found = byKey("analysis_geometry");
    expect(found.status === "available" && found.assetPath).toBe("analysis-geometry.geojson");
  });

  it("names an unknown key, and refuses a key the collection does not list at its top level", () => {
    expect(byKey("no_such_asset")).toEqual({ status: "asset_key_unknown" });
    expect(byKey("period_2022-04")).toEqual({ status: "asset_key_unknown" });
    expect(byKey("__proto__")).toEqual({ status: "asset_key_unknown" });
  });

  it("is file_unavailable for a stale content hash, an unknown bundle or a bundle ID of another shape", () => {
    expect(byKey("rainfall_cells", `1220${"0".repeat(64)}`)).toEqual({
      status: "file_unavailable",
    });
    expect(byKey("rainfall_cells", contentHash, "bundle_example_none")).toEqual({
      status: "file_unavailable",
    });
    expect(byKey("rainfall_cells", contentHash, "../data")).toEqual({ status: "file_unavailable" });
  });

  it("is file_unavailable when the listed file no longer matches its checksum", () => {
    const dir = mkdtempSync(join(tmpdir(), "siterra-assets-key-"));
    try {
      cpSync(`${bundlesDir}${bundleId}`, join(dir, bundleId), { recursive: true });
      const path = join(dir, bundleId, "rainfall-cells.geojson");
      const read = () =>
        resolveBundleAsset(dir, { bundleId, contentHash, assetKey: "rainfall_cells" }).status;
      expect(read()).toBe("available");
      writeFileSync(path, `${readFileSync(path, "utf8")} `);
      expect(read()).toBe("file_unavailable");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
