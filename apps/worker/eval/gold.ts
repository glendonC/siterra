// Readers for the gold sets in data/case/gold (docs/reference/evaluation.md, gold sets): JSON Lines,
// a header record and then one record per item. Fields the harness does not score are not read.
// The fields it does read are checked here, so a gold file in another shape stops the run.
import { readFileSync } from "node:fs";

type Json = Record<string, unknown>;

function record(value: unknown, where: string): Json {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${where}: not a JSON object`);
  }
  return value as Json;
}

function text(r: Json, key: string, where: string): string {
  const v = r[key];
  if (typeof v !== "string") throw new Error(`${where}: ${key} is not text`);
  return v;
}

function textOrNull(r: Json, key: string, where: string): string | null {
  const v = r[key];
  if (v === null || v === undefined) return null;
  if (typeof v !== "string") throw new Error(`${where}: ${key} is not text or null`);
  return v;
}

function numberOrNull(r: Json, key: string, where: string): number | null {
  const v = r[key];
  if (v === null || v === undefined) return null;
  if (typeof v !== "number") throw new Error(`${where}: ${key} is not a number or null`);
  return v;
}

export type ExtractionItem = {
  id: string;
  source_id: string;
  /** The 1-based page of a PDF file; null for another kind of source. */
  page: number | null;
  snapshot_sha256: string | null;
  text_sha256: string | null;
  char_offset: number | null;
  char_length: number | null;
  excerpt: string | null;
  excerpt_sha256: string;
  claim_kind: string;
  /** The model-drafted sentence for the excerpt; the input of the claim typing suite. */
  statement: string;
  scope: string;
  file: string;
  signed_by: string | null;
};

export type NumericItem = {
  id: string;
  bundle_id: string;
  collection_sha256: string;
  period_id: string;
  metric: string;
  value: number;
  unit: string;
  period_status: string;
};

function lines(path: string): Json[] {
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line, i) => record(JSON.parse(line) as unknown, `${path} line ${String(i + 1)}`));
}

export function loadExtractionGold(path: string) {
  const [head, ...rows] = lines(path);
  if (head === undefined || head["record"] !== "header") throw new Error(`${path}: no header`);
  const items = rows.map((r): ExtractionItem => {
    const where = `${path} ${String(r["id"])}`;
    const page = r["page"];
    return {
      id: text(r, "id", where),
      source_id: text(r, "source_id", where),
      page: page === null || page === undefined ? null : Number(page),
      snapshot_sha256: textOrNull(r, "snapshot_sha256", where),
      text_sha256: textOrNull(r, "text_sha256", where),
      char_offset: numberOrNull(r, "char_offset", where),
      char_length: numberOrNull(r, "char_length", where),
      excerpt: textOrNull(r, "excerpt", where),
      excerpt_sha256: text(r, "excerpt_sha256", where),
      claim_kind: text(r, "claim_kind", where),
      statement: text(r, "statement", where),
      scope: text(r, "scope", where),
      file: text(r, "file", where),
      signed_by: textOrNull(r, "signed_by", where),
    };
  });
  return {
    header: {
      corpus_manifest_sha256: text(head, "corpus_manifest_sha256", path),
      text_extractor: text(head, "text_extractor", path),
    },
    items,
  };
}

export function loadNumericGold(path: string) {
  const [head, ...rows] = lines(path);
  if (head === undefined || head["record"] !== "header") throw new Error(`${path}: no header`);
  const items = rows.map((r): NumericItem => {
    const where = `${path} ${String(r["id"])}`;
    const value = r["value"];
    if (typeof value !== "number") throw new Error(`${where}: value is not a number`);
    return {
      id: text(r, "id", where),
      bundle_id: text(r, "bundle_id", where),
      collection_sha256: text(r, "collection_sha256", where),
      period_id: text(r, "period_id", where),
      metric: text(r, "metric", where),
      value,
      unit: text(r, "unit", where),
      period_status: text(r, "period_status", where),
    };
  });
  return { header: { catalog_sha256: text(head, "catalog_sha256", path) }, items };
}
