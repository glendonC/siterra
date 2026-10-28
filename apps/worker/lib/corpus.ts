import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { StoredDocument, StoredPassage, StoredSource } from "@siterra/agent";

// Reads the case corpus: data/case/corpus-manifest.json (public) and the stored text it points to
// (data/interim/, ignored, never published). A PDF's text is per page (1-based page of the file);
// any other file's text is cut at its located section offsets, counted in Unicode code points, and
// is also readable whole.
// A source the manifest does not mark retrieved, or whose text file is missing, is listed but has
// no passages, so it can be named as unread and never summarized.

interface ManifestFile {
  name: string;
  kind: string;
  text_path?: string | null;
}

interface ManifestSource {
  sourceRecordId: string;
  title: string;
  accessStatus: StoredSource["accessStatus"];
  redistributionStatus: StoredSource["redistributionStatus"];
  language?: string | null;
  files?: ManifestFile[];
}

interface Manifest {
  sources: ManifestSource[];
}

interface SectionedText {
  text: string;
  sections?: { heading: string; offset: number }[];
}

export interface Corpus {
  sources: StoredSource[];
  passages: StoredPassage[];
  /** Files listed in the manifest whose stored text could not be read, by source ID. */
  missing: { sourceId: string; file: string }[];
}

const sha256 = (text: string): string => createHash("sha256").update(text, "utf8").digest("hex");

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pdfPages(raw: unknown): { page: number; text: string }[] {
  const list: unknown = Array.isArray(raw) ? raw : isRecord(raw) ? raw["pages"] : [];
  if (!Array.isArray(list)) return [];
  return list.flatMap((p: unknown) => {
    if (!isRecord(p) || typeof p["text"] !== "string") return [];
    const page = Number(p["page"]);
    return Number.isInteger(page) && page >= 1 ? [{ page, text: p["text"] }] : [];
  });
}

/** Cuts a text at its section offsets (code points); sections with no located offset are skipped. */
export function sectionPassages(stored: SectionedText): { heading: string; text: string }[] {
  const points = Array.from(stored.text);
  const located = (stored.sections ?? [])
    .filter((s) => Number.isInteger(s.offset) && s.offset >= 0 && s.offset <= points.length)
    .sort((a, b) => a.offset - b.offset);
  const seen = new Set<string>();
  const out: { heading: string; text: string }[] = [];
  located.forEach((section, i) => {
    if (seen.has(section.heading)) return;
    seen.add(section.heading);
    const end = located[i + 1]?.offset ?? points.length;
    out.push({ heading: section.heading, text: points.slice(section.offset, end).join("") });
  });
  return out;
}

/**
 * Loads the corpus for one case. `revisionOf` gives each Source record's current revision in the
 * case; a manifest source with no Source record in the case is left out.
 */
export async function loadCorpus(
  repoRoot: string,
  manifestPath: string,
  revisionOf: (sourceId: string) => number | null,
): Promise<Corpus> {
  const manifest = JSON.parse(await readFile(join(repoRoot, manifestPath), "utf8")) as Manifest;
  const sources: StoredSource[] = [];
  const passages: StoredPassage[] = [];
  const missing: Corpus["missing"] = [];
  for (const entry of manifest.sources) {
    const revision = revisionOf(entry.sourceRecordId);
    if (revision === null) continue;
    const documents: StoredDocument[] = [];
    for (const file of entry.files ?? []) {
      const isPdf = file.kind === "pdf";
      const document: StoredDocument = {
        name: file.name,
        kind: isPdf ? "pdf" : "text",
        pageCount: null,
        sections: [],
      };
      documents.push(document);
      if (entry.accessStatus !== "retrieved" || !file.text_path) continue;
      let raw: unknown;
      try {
        raw = JSON.parse(await readFile(join(repoRoot, file.text_path), "utf8")) as unknown;
      } catch {
        missing.push({ sourceId: entry.sourceRecordId, file: file.name });
        continue;
      }
      if (isPdf) {
        const pages = pdfPages(raw);
        document.pageCount = pages.length;
        for (const { page, text } of pages) {
          passages.push({
            sourceId: entry.sourceRecordId,
            locator: { document: file.name, page },
            text,
            textSha256: sha256(text),
          });
        }
      } else if (isRecord(raw) && typeof raw["text"] === "string") {
        const stored: SectionedText = {
          text: raw["text"],
          sections: Array.isArray(raw["sections"])
            ? (raw["sections"] as SectionedText["sections"])
            : [],
        };
        const cut = sectionPassages(stored);
        document.sections = cut.map((c) => c.heading);
        // The whole file is always readable too, so text before the first located heading can be cited.
        passages.push({
          sourceId: entry.sourceRecordId,
          locator: { document: file.name, fullText: true },
          text: stored.text,
          textSha256: sha256(stored.text),
        });
        for (const { heading, text } of cut) {
          passages.push({
            sourceId: entry.sourceRecordId,
            locator: { document: file.name, section: heading },
            text,
            textSha256: sha256(text),
          });
        }
      } else {
        missing.push({ sourceId: entry.sourceRecordId, file: file.name });
      }
    }
    sources.push({
      id: entry.sourceRecordId,
      revision,
      title: entry.title,
      accessStatus: entry.accessStatus,
      language: entry.language ?? null,
      redistributionStatus: entry.redistributionStatus,
      documents,
    });
  }
  return { sources, passages, missing };
}
