import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

// The stage places names and the outline with map._camera.transform (modelViewProjectionMatrix and
// worldSize): typed in maplibre-gl 6.14.0 but underscored, so not a promise across versions. This test
// fails, with a message saying what to recheck, when the pinned version or those declarations change.
const require = createRequire(import.meta.url);
const pkgPath = require.resolve("maplibre-gl/package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { version: string };
const dts = readFileSync(join(dirname(pkgPath), "dist", "maplibre-gl.d.ts"), "utf8");

/** The body of a declared class, up to the next top-level declaration. */
function classBody(name: string): string {
  const start = dts.indexOf(`declare class ${name} `);
  if (start < 0) return "";
  const next = dts.indexOf("\ndeclare ", start + 1);
  return dts.slice(start, next < 0 ? undefined : next);
}

describe("maplibre-gl internals the stage relies on", () => {
  it("is the pinned version", () => {
    expect(
      pkg.version,
      "maplibre-gl is no longer 6.14.0: recheck map._camera.transform in components/stage/ValleyStage.tsx and lib/stage/project.ts, then update this pin",
    ).toBe("6.14.0");
  });

  it("declares map._camera as the Camera", () => {
    expect(classBody("Map$1"), "Map no longer declares _camera: Camera").toContain(
      "_camera: Camera;",
    );
  });

  it("declares the camera's transform", () => {
    expect(classBody("Camera"), "Camera no longer declares transform: ITransform").toContain(
      "transform: ITransform;",
    );
  });

  it("declares the matrix and world size the projection reads", () => {
    expect(dts, "transform.modelViewProjectionMatrix is gone").toContain(
      "get modelViewProjectionMatrix(): mat4;",
    );
    expect(dts, "transform.worldSize is gone").toContain("get worldSize(): number;");
  });
});
