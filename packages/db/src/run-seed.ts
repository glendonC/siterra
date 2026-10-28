// Loads the case seed, or writes the UI fixture of its snapshot, from the repository root:
//   node packages/db/src/run-seed.ts load <mode> <owner scope>
//   node packages/db/src/run-seed.ts fixture <mode> <output path>
// Asset URIs in the records are paths on the application origin (/api/case-assets/...).
// <mode> is concept until GATE-01 is recorded; live is refused without SITERRA_LIVE_APPROVED.
// It refuses when any source or bundle is refused, and lists why.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { EnvironmentalCase } from "@siterra/contracts";
import { readCaseSeed, seedSnapshot } from "./case-seed.ts";
import { createPool } from "./client.ts";
import { loadSeedCase } from "./seed.ts";

const [action, modeArg, target] = process.argv.slice(2);
const mode = EnvironmentalCase.shape.mode.parse(modeArg);
if ((action !== "load" && action !== "fixture") || target === undefined) {
  console.error("usage: run-seed.ts load|fixture <mode> <owner scope or output path>");
  process.exit(2);
}
const repoDir = fileURLToPath(new URL("../../../", import.meta.url));
const { seed, issues } = readCaseSeed({
  repoDir,
  mode,
  ownerScopeId: action === "load" ? target : "seed",
  importedAt: new Date().toISOString(),
});
if (seed === null || issues.length > 0) {
  for (const issue of issues) console.error(`${issue.bundleId}: ${issue.path}: ${issue.message}`);
  console.error("Seed refused");
  process.exit(1);
}
if (action === "fixture") {
  writeFileSync(target, `${JSON.stringify(seedSnapshot(seed), null, 2)}\n`);
  console.log(`Wrote ${target}`);
} else {
  const pool = createPool();
  try {
    const { records } = await loadSeedCase(pool, seed, target);
    console.log(`Loaded ${seed.caseRecord.id} with ${records} records for ${target}`);
  } finally {
    await pool.end();
  }
}
