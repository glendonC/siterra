// The offline suites of the evaluation harness (docs/reference/evaluation.md, what is measured):
// extraction fidelity of the gold excerpts against the stored source text, the numeric gold
// against the case's Measurements, and the numeric provenance validator against the same values.
// No model is called. Each suite returns counts, never a verdict the reader has to take on trust,
// and anything it could not check (a source whose text is not stored here) is counted as such.
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { DataBundle, Measurement } from "@siterra/contracts";
import { checkExcerpt, normalizeExcerptText, unprovenNumbers } from "@siterra/domain/validators";

import type { ExtractionItem, NumericItem } from "./gold.ts";

const sha256 = (text: string): string => createHash("sha256").update(text, "utf8").digest("hex");

/** The stored text file of the corpus extractor: `pages` for a PDF, `text` for another kind. */
function storedFrom(raw: unknown): Stored {
  if (typeof raw !== "object" || raw === null) return null;
  const file = raw as { pages?: unknown; text?: unknown };
  if (Array.isArray(file.pages)) {
    const pages = new Map<number, string>();
    for (const p of file.pages as { page?: unknown; text?: unknown }[]) {
      if (typeof p.page === "number" && typeof p.text === "string") pages.set(p.page, p.text);
    }
    return { kind: "pdf", pages };
  }
  return typeof file.text === "string" ? { kind: "text", text: file.text } : null;
}

type Stored = { kind: "pdf"; pages: Map<number, string> } | { kind: "text"; text: string } | null;

function loadStored(corpusTextDir: string, item: ExtractionItem): Stored {
  const path = join(corpusTextDir, item.source_id, `${item.file}.text.json`);
  if (!existsSync(path)) return null;
  return storedFrom(JSON.parse(readFileSync(path, "utf8")) as unknown);
}

export type ExtractionRow = {
  id: string;
  sourceId: string;
  signed: boolean;
  excerpt: "published" | "withheld";
  /** The excerpt, normalised, hashes to excerpt_sha256 (a withheld one is checked in the text). */
  excerptHash: "ok" | "mismatch" | "not_checkable";
  text: "unavailable" | "unchanged" | "changed" | "no_recorded_hash";
  /** Found verbatim on the page it cites (a PDF), in the text (another kind), or at its offsets. */
  located: "yes" | "no" | "elsewhere_on_other_page" | "not_checkable";
};

export type ExtractionResult = {
  suite: "extraction_fidelity";
  items: number;
  signed: number;
  unsigned: number;
  published: number;
  withheld: number;
  excerptHashOk: number;
  excerptHashMismatch: number;
  textUnavailable: number;
  textChanged: number;
  /** Text is stored but the gold records no hash of it, so nothing was compared. */
  textWithoutRecordedHash: number;
  located: number;
  notLocated: number;
  locatedOnOtherPage: number;
  notCheckable: number;
  sourcesWithoutText: string[];
  rows: ExtractionRow[];
};

export function extractionSuite(
  items: readonly ExtractionItem[],
  corpusTextDir: string | null,
): ExtractionResult {
  const rows: ExtractionRow[] = items.map((item) => {
    const published = item.excerpt !== null;
    const stored = corpusTextDir === null ? null : loadStored(corpusTextDir, item);
    const row: ExtractionRow = {
      id: item.id,
      sourceId: item.source_id,
      signed: item.signed_by !== null,
      excerpt: published ? "published" : "withheld",
      excerptHash: "not_checkable",
      text: "unavailable",
      located: "not_checkable",
    };
    if (item.excerpt !== null) {
      row.excerptHash =
        sha256(normalizeExcerptText(item.excerpt)) === item.excerpt_sha256 ? "ok" : "mismatch";
    }
    if (stored === null) return row;
    const page = item.page;
    const pageText = stored.kind === "pdf" && page !== null ? stored.pages.get(page) : undefined;
    const whole = stored.kind === "text" ? stored.text : pageText;
    if (whole === undefined) {
      row.text = "changed";
      return row;
    }
    const expected = stored.kind === "pdf" ? item.text_sha256 : item.snapshot_sha256;
    row.text =
      expected === null ? "no_recorded_hash" : sha256(whole) === expected ? "unchanged" : "changed";
    if (item.excerpt !== null) {
      if (checkExcerpt(item.excerpt, whole).ok) {
        row.located = "yes";
      } else if (stored.kind === "pdf") {
        const other = [...stored.pages.values()].some(
          (t) => checkExcerpt(item.excerpt ?? "", t).ok,
        );
        row.located = other ? "elsewhere_on_other_page" : "no";
      } else {
        row.located = "no";
      }
    } else if (item.char_offset !== null && item.char_length !== null) {
      const slice = Array.from(whole)
        .slice(item.char_offset, item.char_offset + item.char_length)
        .join("");
      const ok = sha256(normalizeExcerptText(slice)) === item.excerpt_sha256;
      row.excerptHash = ok ? "ok" : "mismatch";
      row.located = ok ? "yes" : "no";
    }
    return row;
  });
  const count = (f: (r: ExtractionRow) => boolean) => rows.filter(f).length;
  return {
    suite: "extraction_fidelity",
    items: rows.length,
    signed: count((r) => r.signed),
    unsigned: count((r) => !r.signed),
    published: count((r) => r.excerpt === "published"),
    withheld: count((r) => r.excerpt === "withheld"),
    excerptHashOk: count((r) => r.excerptHash === "ok"),
    excerptHashMismatch: count((r) => r.excerptHash === "mismatch"),
    textUnavailable: count((r) => r.text === "unavailable"),
    textChanged: count((r) => r.text === "changed"),
    textWithoutRecordedHash: count((r) => r.text === "no_recorded_hash"),
    located: count((r) => r.located === "yes"),
    notLocated: count((r) => r.located === "no"),
    locatedOnOtherPage: count((r) => r.located === "elsewhere_on_other_page"),
    notCheckable: count((r) => r.located === "not_checkable"),
    sourcesWithoutText: [
      ...new Set(rows.filter((r) => r.text === "unavailable").map((r) => r.sourceId)),
    ].sort(),
    rows,
  };
}

export type NumericResult = {
  suite: "numeric_gold";
  items: number;
  matched: number;
  missing: string[];
  valueMismatch: string[];
  unitMismatch: string[];
  collectionHashMismatch: string[];
  statusMismatch: string[];
};

/** The 1220 prefix of a multihash, then the SHA-256 digest. */
const digestOf = (contentHash: string | null): string | null =>
  contentHash === null ? null : contentHash.replace(/^1220/, "");

export function numericSuite(
  items: readonly NumericItem[],
  measurements: readonly Measurement[],
  bundles: readonly DataBundle[],
): NumericResult {
  const byKey = new Map(
    measurements.map((m) => [`${m.dataBundleId}|${m.periodId}|${m.metric}`, m]),
  );
  const hashOf = new Map(bundles.map((b) => [b.id, digestOf(b.contentHash)]));
  const result: NumericResult = {
    suite: "numeric_gold",
    items: items.length,
    matched: 0,
    missing: [],
    valueMismatch: [],
    unitMismatch: [],
    collectionHashMismatch: [],
    statusMismatch: [],
  };
  for (const item of items) {
    const m = byKey.get(`${item.bundle_id}|${item.period_id}|${item.metric}`);
    if (m === undefined) {
      result.missing.push(item.id);
      continue;
    }
    let ok = true;
    if (m.value !== item.value) {
      result.valueMismatch.push(item.id);
      ok = false;
    }
    if (m.unit !== item.unit) {
      result.unitMismatch.push(item.id);
      ok = false;
    }
    if (m.status !== item.period_status) {
      result.statusMismatch.push(item.id);
      ok = false;
    }
    if (hashOf.get(item.bundle_id) !== item.collection_sha256) {
      result.collectionHashMismatch.push(item.id);
      ok = false;
    }
    if (ok) result.matched += 1;
  }
  return result;
}

export type ProvenanceResult = {
  suite: "numeric_provenance_validator";
  values: number;
  /** Gold values left out because they are not available or not finite numbers. */
  skipped: number;
  trueValueAccepted: number;
  changedValueRefused: number;
  trueValueRefused: string[];
  changedValueAccepted: string[];
};

/** The value as text with its last digit moved on by one (9 wraps to 0): a different number. */
function changedDigit(value: number): string {
  const text = String(value);
  const index = text.search(/\d(?!.*\d)/);
  const digit = Number(text[index]);
  return `${text.slice(0, index)}${String((digit + 1) % 10)}${text.slice(index + 1)}`;
}

export function provenanceSuite(items: readonly NumericItem[]): ProvenanceResult {
  const result: ProvenanceResult = {
    suite: "numeric_provenance_validator",
    values: 0,
    skipped: 0,
    trueValueAccepted: 0,
    changedValueRefused: 0,
    trueValueRefused: [],
    changedValueAccepted: [],
  };
  for (const item of items) {
    if (item.period_status !== "available" || !Number.isFinite(item.value)) {
      result.skipped += 1;
      continue;
    }
    result.values += 1;
    const sentence = (text: string) => `The value was ${text}.`;
    if (unprovenNumbers(sentence(String(item.value)), [item.value], [], null).length === 0) {
      result.trueValueAccepted += 1;
    } else {
      result.trueValueRefused.push(item.id);
    }
    if (unprovenNumbers(sentence(changedDigit(item.value)), [item.value], [], null).length > 0) {
      result.changedValueRefused += 1;
    } else {
      result.changedValueAccepted.push(item.id);
    }
  }
  return result;
}
