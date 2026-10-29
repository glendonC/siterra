// Evidence records for the statements of published sources that the instruments cite. A statement is
// what the source says, never a finding of Siterra: it is `scientific_context`, `provisional` (no
// person has reviewed it) and `source_checked` once its excerpts are found verbatim in the stored
// page text. That text is a private corpus (restricted licences), so the check runs where the text
// exists (`verifyEvidenceExcerpts`) and the seed carries the excerpts for anyone who has it.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Evidence, type GeoSelection, type Source } from "@siterra/contracts";
import { checkExcerpt } from "@siterra/domain/validators";
import { z } from "zod";
import type { ImportIssue } from "./bundle-import.ts";

const StatementLocator = z.strictObject({
  sourceId: z.string(),
  /** "<stored file>, page N" (N is the 1-based page of the file), as the gold set writes it. */
  locator: z.string().regex(/^[^,]+, page [1-9][0-9]*$/),
  excerpt: z.string().min(1),
});

export const EvidenceStatement = z.strictObject({
  id: z.string().regex(/^ev_[a-z0-9_]+$/),
  statement: z.string().min(1),
  uncertainty: z.string().min(1),
  locators: z.array(StatementLocator).min(1),
});
export type EvidenceStatement = z.infer<typeof EvidenceStatement>;

export const EvidenceStatementsFile = z.strictObject({
  evidenceStatementsVersion: z.literal(1),
  caseId: z.string(),
  description: z.string(),
  statements: z.array(EvidenceStatement),
});
export type EvidenceStatementsFile = z.infer<typeof EvidenceStatementsFile>;

export function readEvidenceStatements(args: {
  file: EvidenceStatementsFile;
  caseId: string;
  geoSelection: Pick<GeoSelection, "id">;
  sources: readonly Source[];
  importedAt: string;
}): { evidence: Evidence[]; issues: ImportIssue[] } {
  const issues: ImportIssue[] = [];
  const evidence: Evidence[] = [];
  const sources = new Map(args.sources.map((s) => [s.id, s]));
  const seen = new Set<string>();
  for (const statement of args.file.statements) {
    const issue = (message: string) =>
      issues.push({ bundleId: "case seed", path: `evidence-statements/${statement.id}`, message });
    if (seen.has(statement.id)) {
      issue("Evidence ID is used twice");
      continue;
    }
    seen.add(statement.id);
    const cited = statement.locators.map((l) => sources.get(l.sourceId));
    if (cited.some((s) => s === undefined || s.accessStatus !== "retrieved")) {
      issue("Cites a source that is not in the seed or was not retrieved");
      continue;
    }
    const parsed = Evidence.safeParse({
      recordType: "Evidence",
      id: statement.id,
      revision: 1,
      createdAt: args.importedAt,
      updatedAt: args.importedAt,
      caseId: args.caseId,
      statement: statement.statement,
      claimKind: "scientific_context",
      status: "provisional",
      geoSelectionId: args.geoSelection.id,
      periodIds: [],
      measurementIds: [],
      provenance: {
        sourceLocators: statement.locators,
        dataBundleIds: [],
        methodId: "source_excerpt",
        methodVersion: "1",
        inputVersions: [
          ...new Map(
            cited.flatMap((s) => (s === undefined ? [] : [[s.id, s.revision] as const])),
          ).entries(),
        ].map(([entityId, revision]) => ({ entityId, revision })),
        generatedByTaskId: null,
        generatedAt: args.importedAt,
        verificationStatus: "source_checked",
        limitations: [
          "Says what the cited source says; not a finding of Siterra and not reviewed by a person.",
        ],
      },
      interpretation: null,
      uncertainty: statement.uncertainty,
      reviewDecisionIds: [],
    });
    if (parsed.success) {
      evidence.push(parsed.data);
    } else {
      for (const e of parsed.error.issues) issue(`${e.path.join("/")}: ${e.message}`);
    }
  }
  return { evidence, issues };
}

/**
 * Finds every excerpt verbatim in the stored page text under `corpusTextDir` (one folder per source
 * ID, one `<stored file>.text.json` per file, as the corpus extractor writes them). A source whose
 * text is not there is listed as unavailable, not as passed.
 */
export function verifyEvidenceExcerpts(args: {
  statements: readonly EvidenceStatement[];
  corpusTextDir: string;
}): { checked: number; unavailable: string[]; issues: ImportIssue[] } {
  const issues: ImportIssue[] = [];
  const unavailable = new Set<string>();
  const pages = new Map<string, Map<number, string> | null>();
  let checked = 0;
  for (const statement of args.statements) {
    for (const l of statement.locators) {
      const [file = "", page = ""] = l.locator.split(", page ");
      const sourceFolder = l.sourceId.replace(/^src_/, "");
      const path = join(args.corpusTextDir, sourceFolder, `${file}.text.json`);
      let table = pages.get(path);
      if (table === undefined) {
        table = null;
        if (existsSync(path)) {
          const parsed = z
            .object({ pages: z.array(z.object({ page: z.int(), text: z.string() })) })
            .safeParse(JSON.parse(readFileSync(path, "utf8")));
          if (parsed.success) table = new Map(parsed.data.pages.map((p) => [p.page, p.text]));
        }
        pages.set(path, table);
      }
      if (table === null) {
        unavailable.add(`${l.sourceId} ${file}`);
        continue;
      }
      const text = table.get(Number(page));
      checked += 1;
      const check = text === undefined ? null : checkExcerpt(l.excerpt, text);
      if (check === null || !check.ok) {
        issues.push({
          bundleId: "case seed",
          path: `evidence-statements/${statement.id}`,
          message: `Excerpt not found on ${l.locator}: ${check === null ? "no such page" : check.reason}`,
        });
      }
    }
  }
  return { checked, unavailable: [...unavailable].sort(), issues };
}
