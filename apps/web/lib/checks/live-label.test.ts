import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// No Live badge unless the record's mode is live: the Live strings may be named only where the mode
// lines are chosen from the record (lib/projection/arrival.ts), never in a component or a page.
const WEB = join(import.meta.dirname, "..", "..");
const ALLOWED = new Set(["lib/projection/arrival.ts", "lib/copy/en.ts"]);

function files(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) files(p, out);
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

describe("Live label", () => {
  it("is named only where the mode lines come from the record", () => {
    const hits = files(WEB)
      .map((p) => ({ path: relative(WEB, p), text: readFileSync(p, "utf8") }))
      .filter((f) => !ALLOWED.has(f.path) && /["']mode\.live(Detail)?["']/.test(f.text))
      .map((f) => f.path);
    expect(hits).toEqual([]);
  });
});
