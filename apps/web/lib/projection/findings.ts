// Accepted findings for a command, projected from the case record's Evidence, Source, Measurement, and
// DataBundle records (IU-02, TR-01, TR-04). Each finding keeps the record's exact statement and uncertainty
// sentence and carries numbered citation chips ([1], [2]) that open the cited source excerpt or measurement
// record in a single click.

import type { CaseSnapshot, Evidence } from "@siterra/contracts";

export interface FindingCitation {
  /** 1-based citation number shown in the chip ([1], [2]). */
  index: number;
  kind: "source" | "measurement";
  id: string;
  recordId: string;
  title: string;
  /** Page, section, or period locator. */
  locator: string;
  /** Verified source excerpt or formatted measurement value and method. */
  detail: string;
  verificationStatus: Evidence["provenance"]["verificationStatus"];
}

export interface FindingItem {
  evidenceId: string;
  revision: number;
  claimKind: Evidence["claimKind"];
  statement: string;
  uncertainty: string;
  citationNumbers: number[];
  recordIds: string[];
}

export interface ProjectedFindings {
  items: FindingItem[];
  citations: FindingCitation[];
}

export function projectFindings(s: CaseSnapshot, commandId: string): ProjectedFindings {
  const taskIds = new Set(
    s.records.taskRecords.filter((t) => t.commandId === commandId).map((t) => t.id),
  );
  const sources = new Map(s.records.sourceRecords.map((src) => [src.id, src]));
  const measurements = new Map(s.records.measurementRecords.map((m) => [m.id, m]));
  const bundles = new Map(s.records.dataBundleRecords.map((b) => [b.id, b]));

  const accepted = s.records.evidenceRecords.filter(
    (e) =>
      e.status === "accepted" &&
      typeof e.statement === "string" &&
      e.statement.length > 0 &&
      taskIds.has(e.provenance.generatedByTaskId ?? ""),
  );

  const citations: FindingCitation[] = [];
  const citationByKey = new Map<string, number>();

  const ensureCitation = (key: string, build: (index: number) => FindingCitation): number => {
    const existing = citationByKey.get(key);
    if (existing !== undefined) return existing;
    const index = citations.length + 1;
    citationByKey.set(key, index);
    citations.push(build(index));
    return index;
  };

  const items: FindingItem[] = accepted.map((e) => {
    const nums: number[] = [];
    const locators = Array.isArray(e.provenance.sourceLocators) ? e.provenance.sourceLocators : [];
    const measurementIds = Array.isArray(e.measurementIds) ? e.measurementIds : [];
    const bundleIds = Array.isArray(e.provenance.dataBundleIds) ? e.provenance.dataBundleIds : [];
    const periodIds = Array.isArray(e.periodIds) ? e.periodIds : [];

    for (const loc of locators) {
      const src = sources.get(loc.sourceId);
      const key = `src:${loc.sourceId}:${loc.locator}`;
      const n = ensureCitation(key, (index) => ({
        index,
        kind: "source",
        id: key,
        recordId: loc.sourceId,
        title: src?.title ?? loc.sourceId,
        locator: loc.locator,
        detail: loc.excerpt ?? src?.publisher ?? loc.locator,
        verificationStatus: e.provenance.verificationStatus,
      }));
      if (!nums.includes(n)) nums.push(n);
    }

    for (const mId of measurementIds) {
      const m = measurements.get(mId);
      const bundle = m ? bundles.get(m.dataBundleId) : undefined;
      const key = `meas:${mId}`;
      const n = ensureCitation(key, (index) => ({
        index,
        kind: "measurement",
        id: key,
        recordId: mId,
        title: bundle?.label ?? m?.metric ?? mId,
        locator: m?.periodId ?? periodIds[0] ?? "",
        detail: m
          ? `${m.metric}: ${m.value !== null ? `${String(m.value)} ${m.unit}` : m.status} (${m.aggregation})`
          : mId,
        verificationStatus: e.provenance.verificationStatus,
      }));
      if (!nums.includes(n)) nums.push(n);
    }

    if (nums.length === 0) {
      for (const bId of bundleIds) {
        const b = bundles.get(bId);
        const key = `bundle:${bId}`;
        const n = ensureCitation(key, (index) => ({
          index,
          kind: "measurement",
          id: key,
          recordId: bId,
          title: b?.label ?? bId,
          locator: b ? `${b.methodId} ${b.methodVersion}` : "",
          detail: b?.attribution ?? b?.datasetId ?? bId,
          verificationStatus: e.provenance.verificationStatus,
        }));
        if (!nums.includes(n)) nums.push(n);
      }
    }

    return {
      evidenceId: e.id,
      revision: e.revision,
      claimKind: e.claimKind,
      statement: e.statement,
      uncertainty: e.uncertainty,
      citationNumbers: nums,
      recordIds: [e.id, ...measurementIds, ...locators.map((l) => l.sourceId), ...bundleIds],
    };
  });

  return { items, citations };
}
