// `pnpm eval`: runs the offline suites and writes eval-reports/eval-<date>.json and .md. Calls no
// model. Exit code 1 when a bar the run can state is not held.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { readCaseSeed } from "@siterra/db";

import { loadExtractionGold, loadNumericGold } from "./gold.ts";
import { type EvalHeader, type EvalReport, bars, markdown } from "./report.ts";
import { extractionSuite, numericSuite, provenanceSuite } from "./suites.ts";

const repoDir = fileURLToPath(new URL("../../../", import.meta.url));
const sha = (path: string): string => createHash("sha256").update(readFileSync(path)).digest("hex");

function corpusTextDir(): string | null {
  const candidates = [
    process.env["SITERRA_CORPUS_TEXT_DIR"],
    process.env["SITERRA_CORPUS_TEXT_ROOT"] === undefined
      ? undefined
      : join(process.env["SITERRA_CORPUS_TEXT_ROOT"], "data/interim/corpus"),
    join(repoDir, "data/interim/corpus"),
  ];
  return candidates.find((c): c is string => c !== undefined && existsSync(c)) ?? null;
}

const { seed, issues } = readCaseSeed({
  repoDir,
  mode: "concept",
  ownerScopeId: "seed",
  importedAt: new Date().toISOString(),
});
if (seed === null || issues.length > 0) {
  console.error(`The case seed did not load cleanly: ${JSON.stringify(issues)}`);
  process.exit(2);
}
const extractionGold = loadExtractionGold(join(repoDir, "data/case/gold/extraction.jsonl"));
const numericGold = loadNumericGold(join(repoDir, "data/case/gold/numeric.jsonl"));
const textDir = corpusTextDir();
const now = new Date();
const header: EvalHeader = {
  model: null,
  promptVersion: null,
  route: "offline",
  corpusManifestSha256: sha(join(repoDir, "data/case/corpus-manifest.json")),
  goldCorpusManifestSha256: extractionGold.header.corpus_manifest_sha256,
  numericGoldCatalogSha256: numericGold.header.catalog_sha256,
  catalogSha256: sha(join(repoDir, "data/bundles/catalog.json")),
  corpusTextDir: textDir,
  date: now.toISOString(),
};
const extraction = extractionSuite(extractionGold.items, textDir);
const numeric = numericSuite(
  numericGold.items,
  seed.bundles.flatMap((b) => b.measurements),
  seed.bundles.map((b) => b.dataBundle),
);
const provenance = provenanceSuite(numericGold.items);
const report: EvalReport = {
  header,
  extraction,
  numeric,
  provenance,
  bars: bars(header, extraction, numeric, provenance),
};
const out = join(repoDir, "eval-reports");
mkdirSync(out, { recursive: true });
const stamp = header.date.replaceAll(":", "").replace(/\..*$/, "");
writeFileSync(join(out, `eval-${stamp}.json`), JSON.stringify(report, null, 2));
writeFileSync(join(out, `eval-${stamp}.md`), markdown(report));
console.log(markdown(report));
process.exit(report.bars.every((b) => b.held) ? 0 : 1);
