import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import type * as AssetRoute from "./map-assets/[version]/[...assetPath]/route.ts";
import type * as CurrentRoute from "./map-assets/route.ts";

const mapDir = fileURLToPath(new URL("../../../../data/map/", import.meta.url));
const origin = "http://127.0.0.1:4350";

let assetRoute: typeof AssetRoute;
let currentRoute: typeof CurrentRoute;

beforeAll(async () => {
  process.env["SITERRA_MAP_DIR"] = mapDir;
  assetRoute = await import("./map-assets/[version]/[...assetPath]/route.ts");
  currentRoute = await import("./map-assets/route.ts");
});

/** GET a path under the origin with no session cookie: map assets are public. */
function get(path: string, headers: Record<string, string> = {}) {
  const url = new URL(path, origin);
  const [, , , version = "", ...assetPath] = url.pathname.split("/");
  return assetRoute.GET(new Request(url, { headers }), {
    params: Promise.resolve({ version, assetPath }),
  });
}

function currentManifestPath(): string {
  const response = currentRoute.GET();
  expect(response.status).toBe(307);
  expect(response.headers.get("cache-control")).toBe("no-cache");
  return response.headers.get("location") ?? "";
}

describe("GET /api/map-assets and /api/map-assets/:version/:path", () => {
  it("redirects to the versioned manifest, which answers 200 without a session", async () => {
    const path = currentManifestPath();
    expect(path).toMatch(/^\/api\/map-assets\/[0-9a-f]{64}\/manifest\.json$/);
    const response = await get(path);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json");
    expect(response.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("accept-ranges")).toBe("bytes");
    expect(
      Buffer.from(await response.arrayBuffer()).equals(readFileSync(`${mapDir}manifest.json`)),
    ).toBe(true);
  });

  it("serves a terrain tile the manifest names by a path relative to the manifest URL", async () => {
    const manifestUrl = new URL(currentManifestPath(), origin);
    const response = await get(new URL("terrain/0/0/0.webp", manifestUrl).pathname);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/webp");
    expect(
      Buffer.from(await response.arrayBuffer()).equals(readFileSync(`${mapDir}terrain/0/0/0.webp`)),
    ).toBe(true);
  });

  it("GATE-04 (serving part): answers a Range request on a map asset with 206 and the exact bytes", async () => {
    const manifestUrl = new URL(currentManifestPath(), origin);
    const path = new URL("globe/relief-hillshade-4096x2048.png", manifestUrl).pathname;
    const full = readFileSync(`${mapDir}globe/relief-hillshade-4096x2048.png`);
    const response = await get(path, { range: "bytes=1000-1999" });
    expect(response.status).toBe(206);
    expect(response.headers.get("content-range")).toBe(`bytes 1000-1999/${full.length}`);
    expect(response.headers.get("content-length")).toBe("1000");
    expect(Buffer.from(await response.arrayBuffer()).equals(full.subarray(1000, 2000))).toBe(true);
  });

  it("answers 416 beyond the file and 200 with the whole file for an invalid range", async () => {
    const manifestUrl = new URL(currentManifestPath(), origin);
    const path = new URL("terrain/tiles.json", manifestUrl).pathname;
    expect((await get(path, { range: "bytes=99999999-" })).status).toBe(416);
    const invalid = await get(path, { range: "bytes=5-3" });
    expect(invalid.status).toBe(200);
    expect(invalid.headers.get("content-range")).toBeNull();
  });

  it("answers 404 for an old version, an unlisted file and a path out of the folder", async () => {
    expect((await get(`/api/map-assets/${"0".repeat(64)}/manifest.json`)).status).toBe(404);
    const manifestUrl = new URL(currentManifestPath(), origin);
    expect((await get(new URL("README.md", manifestUrl).pathname)).status).toBe(404);
    const version = manifestUrl.pathname.split("/")[3] ?? "";
    const escape = await assetRoute.GET(new Request(manifestUrl), {
      params: Promise.resolve({ version, assetPath: ["..", "bundles", "catalog.json"] }),
    });
    expect(escape.status).toBe(404);
  });
});
