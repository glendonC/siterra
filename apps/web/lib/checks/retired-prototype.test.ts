import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// The /prototype screen is retired and the instrument views replace it. These checks keep it, and the
// model-written notes that came with its map chips, from returning through a merge.

const WEB = join(import.meta.dirname, "..", "..");

function jsonFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) jsonFiles(p, out);
    else if (name.endsWith(".json")) out.push(p);
  }
  return out;
}

/** Paths of every key with this name in a parsed JSON value. */
function keyPaths(value: unknown, key: string, at = ""): string[] {
  if (Array.isArray(value)) return value.flatMap((v, i) => keyPaths(v, key, `${at}[${i}]`));
  if (value === null || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([k, v]) => [
    ...(k === key ? [`${at}.${k}`] : []),
    ...keyPaths(v, key, `${at}.${k}`),
  ]);
}

describe("retired /prototype screen", () => {
  it("leaves no route, components or modules behind", () => {
    const left = ["app/prototype", "components/prototype", "lib/prototype"].filter((d) =>
      existsSync(join(WEB, d)),
    );
    expect(left).toEqual([]);
  });

  it("leaves no model-written inspection notes in the public data", () => {
    const notes = jsonFiles(join(WEB, "public")).flatMap((p) =>
      keyPaths(JSON.parse(readFileSync(p, "utf8")), "aiInspectionNote").map(
        (k) => `${relative(WEB, p)}: ${k}`,
      ),
    );
    expect(notes).toEqual([]);
  });
});
