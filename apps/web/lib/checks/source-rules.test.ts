import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// Source checks over apps/web: VC-01 (colours only in token definitions) and I18N-01 (no visible copy
// outside the message catalogs). Heuristics with named exceptions, run as unit tests.

const WEB = join(import.meta.dirname, "..", "..");
const SKIP_DIRS = new Set(["node_modules", ".next", "test-results", "playwright-report"]);

function files(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) files(p, out);
    else if (/\.(tsx?|css)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

const all = files(WEB).map((p) => ({ path: relative(WEB, p), text: readFileSync(p, "utf8") }));

/** Files that define tokens: the only places a colour value may be written. */
const TOKEN_FILES = new Set([
  "app/daylight.css",
  "lib/theme/daylight.ts",
  "app/obsidian.css",
  "lib/theme/obsidian.ts",
]);

const COLOUR = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab|lab|lch)\(/g;

describe("VC-01 tokens only", () => {
  it("writes colour values only in the token files", () => {
    const hits = all
      .filter((f) => !TOKEN_FILES.has(f.path))
      .flatMap((f) => (f.text.match(COLOUR) ?? []).map((m) => `${f.path}: ${m}`));
    expect(hits).toEqual([]);
  });
});

/** JSX text between tags that contains a letter, outside expressions: `>Start<` (not an arrow `=>`). */
const JSX_TEXT = /(?<!=)>\s*([^<>{}\n]*\p{L}[^<>{}\n]*)\s*</gu;

/** Glyphs and marks that are not words a translator would change. */
const ALLOWED_TEXT = new Set(["↵", "F", "H", "Esc", "/"]);

describe("I18N-01 no hard-coded copy", () => {
  it("keeps visible words out of JSX; they come from the catalog", () => {
    const hits = all
      .filter((f) => f.path.endsWith(".tsx"))
      .flatMap((f) =>
        [...f.text.matchAll(JSX_TEXT)]
          .map((m) => (m[1] ?? "").trim())
          .filter((t) => t.length > 0 && !ALLOWED_TEXT.has(t))
          .map((t) => `${f.path}: ${t}`),
      );
    expect(hits).toEqual([]);
  });
});
