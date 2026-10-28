import { createHash } from "node:crypto";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { currentMapVersion, findMapDir, resolveMapAsset } from "./map-assets.ts";

const mapDir = fileURLToPath(new URL("../../../data/map/", import.meta.url));
const version = createHash("sha256")
  .update(readFileSync(`${mapDir}manifest.json`))
  .digest("hex");
const at = (assetPath: string, v = version) => resolveMapAsset(mapDir, { version: v, assetPath });

const scratch: string[] = [];
afterAll(() => {
  for (const dir of scratch) rmSync(dir, { recursive: true, force: true });
});

describe("map assets: only files the data/map manifest lists, each matching its size and SHA-256", () => {
  it("names the version by the SHA-256 of manifest.json", () => {
    expect(currentMapVersion(mapDir)).toBe(version);
  });

  it("serves the manifest, a globe grid, a terrain tile, tiles.json and a licence", () => {
    expect(at("manifest.json")?.sha256).toBe(version);
    expect(at("globe/dots-elevation-0p08-4500x2250.int16le.bin.gz")?.contentType).toBe(
      "application/gzip",
    );
    expect(at("terrain/0/0/0.webp")?.contentType).toBe("image/webp");
    expect(at("terrain/tiles.json")?.contentType).toBe("application/json");
    expect(at("licences/copernicus-dem-glo-90.md")?.contentType).toBe(
      "text/markdown; charset=utf-8",
    );
  });

  it("refuses another version, an unlisted file, paths out of the folder and a bad version shape", () => {
    expect(at("terrain/0/0/0.webp", "0".repeat(64))).toBeNull();
    expect(at("README.md")).toBeNull();
    expect(at("../bundles/catalog.json")).toBeNull();
    expect(at("terrain/../../bundles/catalog.json")).toBeNull();
    expect(at("/etc/hosts")).toBeNull();
    expect(at("terrain/0/0/0.webp", "../map")).toBeNull();
  });

  it("refuses a listed file whose bytes changed, at the same or a different size", () => {
    const dir = mkdtempSync(join(tmpdir(), "siterra-map-"));
    scratch.push(dir);
    cpSync(mapDir, dir, { recursive: true });
    const tile = join(dir, "terrain/0/0/0.webp");
    const original = readFileSync(tile);
    const resolveCopy = () => resolveMapAsset(dir, { version, assetPath: "terrain/0/0/0.webp" });
    expect(resolveCopy()?.size).toBe(original.length);
    const changed = Buffer.from(original);
    changed[100] = (changed[100] ?? 0) ^ 0xff;
    writeFileSync(tile, changed);
    expect(resolveCopy()).toBeNull();
    writeFileSync(tile, Buffer.concat([original, Buffer.from([0])]));
    expect(resolveCopy()).toBeNull();
    writeFileSync(tile, original);
    expect(resolveCopy()?.size).toBe(original.length);
  });

  it("moves to a new version when manifest.json changes, and the old version answers nothing", () => {
    const dir = mkdtempSync(join(tmpdir(), "siterra-map-"));
    scratch.push(dir);
    cpSync(mapDir, dir, { recursive: true });
    writeFileSync(
      join(dir, "manifest.json"),
      `${readFileSync(join(dir, "manifest.json"), "utf8")}\n`,
    );
    const next = currentMapVersion(dir);
    expect(next).not.toBe(version);
    expect(resolveMapAsset(dir, { version, assetPath: "terrain/0/0/0.webp" })).toBeNull();
    expect(
      resolveMapAsset(dir, { version: next ?? "", assetPath: "terrain/0/0/0.webp" }),
    ).not.toBeNull();
  });

  it("finds data/map upward from a folder of the repository", () => {
    expect(findMapDir(fileURLToPath(new URL(".", import.meta.url)))).toBe(
      mapDir.replace(/\/$/, ""),
    );
  });
});
