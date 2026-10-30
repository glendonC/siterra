import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { defaultSeedDir, readCaseSeed } from "./case-seed.ts";

// The seed folder is a parameter: a second place keeps its seed files beside the first place's
// under the same names.

const repoDir = fileURLToPath(new URL("../../../", import.meta.url));
const args = { repoDir, ownerScopeId: "seed", importedAt: "2026-10-30T12:00:00Z" };
const scratch: string[] = [];
afterAll(() => {
  for (const dir of scratch) rmSync(dir, { recursive: true, force: true });
});

function copiedSeedDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "siterra-seeddir-"));
  scratch.push(dir);
  for (const name of [
    "case.json",
    "context-features.json",
    "measurement-rows.json",
    "evidence-statements.json",
  ]) {
    cpSync(join(repoDir, defaultSeedDir, name), join(dir, name));
  }
  return dir;
}

describe("readCaseSeed seedDir", () => {
  it("reads data/case by default and the same seed from a copy of its folder", () => {
    expect(defaultSeedDir).toBe("data/case");
    const base = readCaseSeed(args);
    const copy = readCaseSeed({ ...args, seedDir: copiedSeedDir() });
    expect(copy.issues).toEqual([]);
    expect(copy.seed).toEqual(base.seed);
  });

  it("reads each seed file from the chosen folder and names that folder in an issue", () => {
    const dir = copiedSeedDir();
    const path = join(dir, "context-features.json");
    const file = JSON.parse(readFileSync(path, "utf8")) as { caseId: string };
    writeFileSync(path, JSON.stringify({ ...file, caseId: "case_other" }));
    const result = readCaseSeed({ ...args, seedDir: dir });
    expect(result.issues.map((i) => i.path)).toContain(`${dir}/context-features.json`);
  });

  it("reads the measurement rows and the evidence statements from the chosen folder", () => {
    for (const name of ["measurement-rows.json", "evidence-statements.json"]) {
      const dir = copiedSeedDir();
      const path = join(dir, name);
      const file = JSON.parse(readFileSync(path, "utf8")) as { caseId: string };
      writeFileSync(path, JSON.stringify({ ...file, caseId: "case_other" }));
      const result = readCaseSeed({ ...args, seedDir: dir });
      expect(result.issues.map((i) => i.path)).toContain(`${dir}/${name}`);
    }
  });

  it("run-seed reads the folder --seed-dir names: a tampered copy is refused", () => {
    const dir = copiedSeedDir();
    const path = join(dir, "measurement-rows.json");
    const file = JSON.parse(readFileSync(path, "utf8")) as { caseId: string };
    writeFileSync(path, JSON.stringify({ ...file, caseId: "case_other" }));
    expect(() =>
      execFileSync(
        process.execPath,
        [
          join(repoDir, "packages/db/src/run-seed.ts"),
          "fixture",
          "concept",
          join(dir, "out.json"),
          "--seed-dir",
          dir,
        ],
        { cwd: repoDir, stdio: "pipe" },
      ),
    ).toThrow();
  });

  it("fails plainly when the folder has no case.json", () => {
    expect(() => readCaseSeed({ ...args, seedDir: "data/no-such-place" })).toThrow(/case\.json/);
  });

  it("run-seed writes the same fixture with --seed-dir as without, and ignores a stray fourth argument", () => {
    const out = (name: string, extra: string[]) => {
      const path = join(copiedSeedDir(), name);
      execFileSync(
        process.execPath,
        [join(repoDir, "packages/db/src/run-seed.ts"), "fixture", "concept", path, ...extra],
        { cwd: repoDir, stdio: "pipe" },
      );
      // The import time is the time of the run, so it is blanked.
      return readFileSync(path, "utf8").replace(/\d{4}-\d\d-\d\dT[\d:.]+Z/g, "T");
    };
    expect(out("chosen.json", ["--seed-dir", defaultSeedDir])).toBe(
      out("plain.json", ["http://127.0.0.1:1/assets"]),
    );
  }, 30_000);
});
