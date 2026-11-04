// The results of the ask's request, from the case record (U11b): the Evidence that the request's tasks committed
// and accepted (the same rule as the work card's "Findings: N") and the request's latest BranchMerge. A finding's
// source chip is keyed by source record, or by data bundle (else measurement) for computed evidence. Each finding
// states its verification state as its record holds it. Nothing here is inferred beyond the records' own fields.

import type { BranchMerge, CaseSnapshot, Evidence } from "@siterra/contracts";
import { en, format, type MessageId } from "../copy/en";
import { citedAuthors } from "./cite";

/** The accepted Evidence the command's tasks generated, oldest first. */
export function commandFindings(snapshot: CaseSnapshot, commandId: string): Evidence[] {
  const tasks = new Set(
    snapshot.records.taskRecords.filter((t) => t.commandId === commandId).map((t) => t.id),
  );
  return snapshot.records.evidenceRecords
    .filter((e) => e.status === "accepted" && tasks.has(e.provenance.generatedByTaskId ?? ""))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

/** The command's latest BranchMerge, if it merged branches. */
export function commandMerge(snapshot: CaseSnapshot, commandId: string): BranchMerge | undefined {
  return (snapshot.records.branchMergeRecords ?? [])
    .filter((m) => m.commandId === commandId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.revision - b.revision)
    .at(-1);
}

/**
 * A finding's verification state in catalog words, never shown as checked unless its record says so: checked
 * against the source, computed from the record's measurements, or not yet checked against the source.
 */
export function verificationOf(e: Evidence): MessageId {
  const v = e.provenance.verificationStatus;
  return v === "source_checked"
    ? "results.checked"
    : v === "computed_checked"
      ? "results.computed.state"
      : "results.unchecked";
}

/**
 * What a finding's chip numbers: its source record when a source locator is attached; for computed evidence, its
 * data bundle (else its first measurement); none when neither is attached.
 */
export function sourceKey(e: Evidence): string | null {
  const src = e.provenance.sourceLocators[0]?.sourceId;
  if (e.provenance.verificationStatus === "computed_checked")
    return e.provenance.dataBundleIds[0] ?? e.measurementIds[0] ?? src ?? null;
  return src ?? null;
}

/** A Source as a reader names it: the first author's surname (with "et al." for three or more) and the year. */
export function shortCitation(src: CaseSnapshot["records"]["sourceRecords"][number]): string {
  const who = citedAuthors(src.authors);
  const year = (src.publicationDate ?? "").slice(0, 4);
  if (!who) return src.title;
  return year ? format("results.cite", { authors: who, year }) : who;
}

/**
 * A recorded statement as it is shown: a Source id written into its text ("Reading src_SCI-19 is required ...")
 * reads as that Source's short citation, and an id the case holds no Source for reads as an unnamed source. The
 * record keeps its own text; only the words on screen change.
 */
export function readableStatement(snapshot: CaseSnapshot, text: string): string {
  return text.replace(/\bsrc_[A-Za-z0-9][A-Za-z0-9_.-]*[A-Za-z0-9]/g, (id) => {
    const src = snapshot.records.sourceRecords.find((x) => x.id === id);
    return src ? shortCitation(src) : en["results.unknownSource"].text;
  });
}
