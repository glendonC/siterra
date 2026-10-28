import type { Locator } from "@siterra/domain/validators";
import { formatLocator } from "@siterra/domain/validators";
import type { DataBundleRecord, MeasurementRecord } from "../tasks/records.ts";

// Read access the tools need, scoped to one authorized case. PLATFORM's packages/db implements it
// over the case record; tests use the in-memory version below. Tools never write through it.

export interface CaseSummary {
  id: string;
  revision: number;
  title: string;
  objective: string;
  mode: "live" | "replay" | "concept";
  activeGeoSelectionId: string | null;
  unresolvedQuestions: string[];
}

/** Monthly quality flags of one bundle period, from the STAC Item (`siterra:quality_flags`). */
export interface PeriodQuality {
  periodId: string;
  qualityFlags: string[];
}

/** One stored file of a source: a PDF with page texts, or another file with section texts. */
export interface StoredDocument {
  name: string;
  kind: "pdf" | "text";
  /** Pages with stored text, for a PDF; null otherwise. */
  pageCount: number | null;
  /** Located section headings in order, for a non-PDF file; empty when none were located. */
  sections: string[];
}

/** A corpus source with what reading it needs; the stored text lives outside Git (corpus manifest). */
export interface StoredSource {
  id: string;
  revision: number;
  title: string;
  accessStatus: "discovered" | "retrieved" | "unavailable";
  /** BCP 47 tag of the source text, or null where the corpus manifest does not record it. */
  language: string | null;
  redistributionStatus: "permitted" | "restricted" | "unknown";
  documents: StoredDocument[];
}

/** Stored text at one locator: a PDF page, a section, or a whole file. */
export interface StoredPassage {
  sourceId: string;
  locator: Locator;
  text: string;
  textSha256: string;
}

export interface CaseStore {
  readCase(caseId: string): Promise<CaseSummary | null>;
  readBundle(caseId: string, bundleId: string): Promise<DataBundleRecord | null>;
  /** The latest revision of every bundle in the case. */
  listBundles(caseId: string): Promise<DataBundleRecord[]>;
  /** Current measurements of a bundle revision for the given periods. */
  readMeasurements(
    caseId: string,
    bundleId: string,
    bundleRevision: number,
    periodIds: readonly string[],
  ): Promise<MeasurementRecord[]>;
  readPeriodQuality(
    caseId: string,
    bundleId: string,
    periodIds: readonly string[],
  ): Promise<PeriodQuality[]>;
  /** Current revisions of the given measurements; unknown IDs are absent from the result. */
  readMeasurementsById(caseId: string, ids: readonly string[]): Promise<MeasurementRecord[]>;
  listSources(caseId: string): Promise<StoredSource[]>;
  readSource(caseId: string, sourceId: string): Promise<StoredSource | null>;
  /** Stored text at a locator of a retrieved source; null when nothing is stored there. */
  passageAt(caseId: string, sourceId: string, locator: Locator): Promise<StoredPassage | null>;
  /** Stored passages of retrieved sources whose text contains any of the lowercase terms. */
  passagesContaining(caseId: string, terms: readonly string[]): Promise<StoredPassage[]>;
}

export class MemoryCaseStore implements CaseStore {
  readonly cases = new Map<string, CaseSummary>();
  readonly bundles: DataBundleRecord[] = [];
  readonly measurements: MeasurementRecord[] = [];
  readonly quality: (PeriodQuality & { caseId: string; bundleId: string })[] = [];
  readonly sources: (StoredSource & { caseId: string })[] = [];
  readonly passages: (StoredPassage & { caseId: string })[] = [];

  listSources(caseId: string): Promise<StoredSource[]> {
    return Promise.resolve(this.sources.filter((s) => s.caseId === caseId));
  }

  readSource(caseId: string, sourceId: string): Promise<StoredSource | null> {
    return Promise.resolve(
      this.sources.find((s) => s.caseId === caseId && s.id === sourceId) ?? null,
    );
  }

  passageAt(caseId: string, sourceId: string, locator: Locator): Promise<StoredPassage | null> {
    const key = formatLocator(locator);
    const found = this.passages.find(
      (p) => p.caseId === caseId && p.sourceId === sourceId && formatLocator(p.locator) === key,
    );
    return Promise.resolve(
      found
        ? { sourceId, locator: found.locator, text: found.text, textSha256: found.textSha256 }
        : null,
    );
  }

  passagesContaining(caseId: string, terms: readonly string[]): Promise<StoredPassage[]> {
    const retrieved = new Set(
      this.sources
        .filter((s) => s.caseId === caseId && s.accessStatus === "retrieved")
        .map((s) => s.id),
    );
    return Promise.resolve(
      this.passages
        .filter((p) => p.caseId === caseId && retrieved.has(p.sourceId))
        .filter((p) => terms.some((t) => p.text.toLowerCase().includes(t)))
        .map((p) => ({
          sourceId: p.sourceId,
          locator: p.locator,
          text: p.text,
          textSha256: p.textSha256,
        })),
    );
  }

  readCase(caseId: string): Promise<CaseSummary | null> {
    return Promise.resolve(this.cases.get(caseId) ?? null);
  }

  listBundles(caseId: string): Promise<DataBundleRecord[]> {
    const latest = new Map<string, DataBundleRecord>();
    for (const b of this.bundles) {
      if (b.caseId !== caseId) continue;
      const seen = latest.get(b.id);
      if (!seen || seen.revision < b.revision) latest.set(b.id, b);
    }
    return Promise.resolve([...latest.values()]);
  }

  readBundle(caseId: string, bundleId: string): Promise<DataBundleRecord | null> {
    const found = this.bundles.filter((b) => b.caseId === caseId && b.id === bundleId);
    const latest = found.sort((a, b) => b.revision - a.revision)[0];
    return Promise.resolve(latest ?? null);
  }

  readMeasurements(
    caseId: string,
    bundleId: string,
    _bundleRevision: number,
    periodIds: readonly string[],
  ): Promise<MeasurementRecord[]> {
    const wanted = new Set(periodIds);
    return Promise.resolve(
      this.measurements.filter(
        (m) => m.caseId === caseId && m.dataBundleId === bundleId && wanted.has(m.periodId),
      ),
    );
  }

  readMeasurementsById(caseId: string, ids: readonly string[]): Promise<MeasurementRecord[]> {
    const wanted = new Set(ids);
    return Promise.resolve(
      this.measurements.filter((m) => m.caseId === caseId && wanted.has(m.id)),
    );
  }

  readPeriodQuality(
    caseId: string,
    bundleId: string,
    periodIds: readonly string[],
  ): Promise<PeriodQuality[]> {
    const wanted = new Set(periodIds);
    return Promise.resolve(
      this.quality
        .filter((q) => q.caseId === caseId && q.bundleId === bundleId && wanted.has(q.periodId))
        .map((q) => ({ periodId: q.periodId, qualityFlags: q.qualityFlags })),
    );
  }
}
