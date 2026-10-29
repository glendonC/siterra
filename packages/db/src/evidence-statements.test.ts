import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Source } from "@siterra/contracts";
import { afterAll, describe, expect, it } from "vitest";
import { readCaseSeed } from "./case-seed.ts";
import {
  EvidenceStatementsFile,
  readEvidenceStatements,
  verifyEvidenceExcerpts,
} from "./evidence-statements.ts";

const repoDir = fileURLToPath(new URL("../../../", import.meta.url));
const file = EvidenceStatementsFile.parse(
  JSON.parse(readFileSync(`${repoDir}data/case/evidence-statements.json`, "utf8")),
);
const { seed, issues } = readCaseSeed({
  repoDir,
  mode: "concept",
  ownerScopeId: "seed",
  importedAt: "2026-10-27T20:00:00Z",
});

describe("evidence statements of the case seed", () => {
  it("load without an issue, one Evidence record per statement", () => {
    expect(issues).toEqual([]);
    expect(seed?.evidence.map((e) => e.id)).toEqual(file.statements.map((s) => s.id));
  });

  it("are what a source says: scientific context, provisional, source checked, citing a retrieved source", () => {
    const sources = new Map((seed?.sources ?? []).map((s) => [s.id, s]));
    for (const e of seed?.evidence ?? []) {
      expect(e.claimKind).toBe("scientific_context");
      expect(e.status).toBe("provisional");
      expect(e.reviewDecisionIds).toEqual([]);
      expect(e.provenance.verificationStatus).toBe("source_checked");
      expect(e.provenance.sourceLocators.length).toBeGreaterThan(0);
      for (const l of e.provenance.sourceLocators) {
        expect(sources.get(l.sourceId)?.accessStatus, e.id).toBe("retrieved");
        expect(e.provenance.inputVersions.map((v) => v.entityId)).toContain(l.sourceId);
      }
    }
  });

  it("cover exactly the statements the specimens show, none about an irrigated share or species spectrum", () => {
    expect(file.statements.map((s) => s.id).sort()).toEqual([
      "ev_herder_reported_species_change_sci03",
      "ev_upper_rangelands_vegetation_sci19",
      "ev_valley_altitude_range_sci19",
      "ev_valley_bottom_cultivated_sci03",
      "ev_valley_villages_sci19",
    ]);
    const text = JSON.stringify(file.statements).toLowerCase();
    expect(text).not.toMatch(/80 ?%|irrigated|karst|aquifer|spectrum of/);
  });

  // The stored page text is a private corpus (CC BY-NC-ND and all rights reserved): the check runs
  // where it exists and is reported as skipped elsewhere, never as passed.
  const corpusTextDir = process.env["SITERRA_CORPUS_TEXT_DIR"] ?? "";
  it.skipIf(corpusTextDir === "")(
    "every excerpt is found verbatim in the stored page text (SITERRA_CORPUS_TEXT_DIR)",
    () => {
      const result = verifyEvidenceExcerpts({ statements: file.statements, corpusTextDir });
      expect(result.unavailable).toEqual([]);
      expect(result.issues).toEqual([]);
      expect(result.checked).toBe(file.statements.flatMap((s) => s.locators).length);
    },
  );
});

describe("verifyEvidenceExcerpts", () => {
  const dirs: string[] = [];
  afterAll(() => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
  });
  function corpus(pages: { page: number; text: string }[]) {
    const dir = mkdtempSync(join(tmpdir(), "siterra-corpus-"));
    dirs.push(dir);
    mkdirSync(join(dir, "SCI-99"));
    writeFileSync(join(dir, "SCI-99", "paper.pdf.text.json"), JSON.stringify({ pages }));
    return dir;
  }
  const statement = (excerpt: string, locator = "paper.pdf, page 2", sourceId = "src_SCI-99") => ({
    id: "ev_test_statement",
    statement: "Test.",
    uncertainty: "Test.",
    locators: [{ sourceId, locator, excerpt }],
  });

  it("passes an excerpt found on its page, ignoring line breaks and runs of white space", () => {
    const dir = corpus([{ page: 2, text: "The valley\nlies between  1800 and 2200 m." }]);
    const result = verifyEvidenceExcerpts({
      statements: [statement("valley lies between 1800 and 2200 m")],
      corpusTextDir: dir,
    });
    expect(result).toEqual({ checked: 1, unavailable: [], issues: [] });
  });

  it("refuses an excerpt that is not on the page, a page that does not exist and a changed word", () => {
    const dir = corpus([
      { page: 1, text: "Villages stretch along the valley." },
      { page: 2, text: "More than thirty villages." },
    ]);
    const run = (excerpt: string, locator: string) =>
      verifyEvidenceExcerpts({
        statements: [statement(excerpt, locator)],
        corpusTextDir: dir,
      }).issues.map((i) => i.message);
    expect(run("Villages stretch along the valley.", "paper.pdf, page 2")).toEqual([
      "Excerpt not found on paper.pdf, page 2: not_found",
    ]);
    expect(run("More than thirty villages.", "paper.pdf, page 7")).toEqual([
      "Excerpt not found on paper.pdf, page 7: no such page",
    ]);
    expect(run("More than forty villages.", "paper.pdf, page 2")).toHaveLength(1);
  });

  it("reports a source whose text is not there as unavailable, not as passed", () => {
    const dir = corpus([{ page: 2, text: "Anything." }]);
    const result = verifyEvidenceExcerpts({
      statements: [statement("Anything.", "paper.pdf, page 2", "src_SCI-98")],
      corpusTextDir: dir,
    });
    expect(result.unavailable).toEqual(["src_SCI-98 paper.pdf"]);
    expect(result.checked).toBe(0);
  });

  it("refuses an excerpt longer than the validator allows", () => {
    const long = "word ".repeat(80).trim();
    const dir = corpus([{ page: 2, text: long }]);
    expect(
      verifyEvidenceExcerpts({ statements: [statement(long)], corpusTextDir: dir }).issues[0]
        ?.message,
    ).toContain("too_long");
  });
});

describe("readEvidenceStatements: what it refuses", () => {
  const source = (id: string, accessStatus = "retrieved") =>
    ({ id, revision: 1, accessStatus }) as unknown as Source;
  const run = (statements: unknown[], sources: Source[]) =>
    readEvidenceStatements({
      file: EvidenceStatementsFile.parse({ ...file, statements }),
      caseId: "case_aitbouguemez",
      geoSelection: { id: "geo_ait_bouguemez_catchment" },
      sources,
      importedAt: "2026-10-29T12:00:00Z",
    });
  const one = file.statements[0];

  it("refuses a statement citing a source the seed does not hold or did not retrieve, and a repeated ID", () => {
    expect(run([one], []).issues[0]?.message).toContain("not in the seed or was not retrieved");
    expect(run([one], [source("src_SCI-19", "bibliography_only")]).issues[0]?.message).toContain(
      "not in the seed or was not retrieved",
    );
    expect(run([one, one], [source("src_SCI-19")]).issues.map((i) => i.message)).toEqual([
      "Evidence ID is used twice",
    ]);
  });
});
