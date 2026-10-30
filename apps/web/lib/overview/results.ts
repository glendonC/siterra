// The results of the ask's request, from the case record (U11b): the Evidence that the request's tasks committed
// and accepted (the same rule as the work card's "Findings: N"), the request's latest BranchMerge, and an answer
// caption in catalog words with the merge's own counts. Each finding carries a numbered source chip: numbered by
// source record, or by data bundle (else measurement) for computed evidence, in the order the list first cites
// them; a chip opens the cited locator and excerpt. Each finding states its verification state as its record
// holds it. Nothing here is inferred beyond the records' own fields.

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

const WORDS: MessageId[] = [
  "results.n0",
  "results.n1",
  "results.n2",
  "results.n3",
  "results.n4",
  "results.n5",
];

/** A count as the catalog writes it in a sentence: a word up to five, else the numeral. */
function count(n: number, start: boolean): string {
  const id = WORDS[n];
  if (id === undefined) return String(n);
  const w = en[id].text;
  return start ? w.charAt(0).toUpperCase() + w.slice(1) : w;
}

type Status = BranchMerge["branches"][number]["status"];
const ORDER: Status[] = ["contradicted", "consistent", "cannot_be_assessed"];
const CLAUSE: Record<Status, { first: [MessageId, MessageId]; then: [MessageId, MessageId] }> = {
  contradicted: {
    first: ["results.first.contradicted.one", "results.first.contradicted.many"],
    then: ["results.then.contradicted.one", "results.then.contradicted.many"],
  },
  consistent: {
    first: ["results.first.consistent.one", "results.first.consistent.many"],
    then: ["results.then.consistent.one", "results.then.consistent.many"],
  },
  cannot_be_assessed: {
    first: ["results.first.cannot.one", "results.first.cannot.many"],
    then: ["results.then.cannot.one", "results.then.cannot.many"],
  },
};

export interface Caption {
  ink: string;
  grey: string | null;
}

/**
 * The answer caption: the merge's branch counts by status in one sentence, and the field plan's check count; with
 * no merge, the findings count only.
 */
export function resultsCaption(merge: BranchMerge | undefined, findings: number): Caption {
  if (!merge)
    return {
      ink: format(findings === 1 ? "results.only.one" : "results.only.many", {
        n: findings,
      }),
      grey: null,
    };
  const clauses = ORDER.map((s) => ({ s, n: merge.branches.filter((b) => b.status === s).length }))
    .filter((c) => c.n > 0)
    .map(({ s, n }, i) => {
      const [one, many] = i === 0 ? CLAUSE[s].first : CLAUSE[s].then;
      return format(n === 1 ? one : many, { n: count(n, i === 0) });
    });
  const [a = "", b, c] = clauses;
  const ink =
    c !== undefined
      ? format("results.join3", { a, b: b ?? "", c })
      : b !== undefined
        ? format("results.join2", { a, b })
        : format("results.join1", { a });
  const checks = merge.fieldPlan?.measurements.length ?? 0;
  const unseparated = merge.fieldPlan?.unseparated.length ?? 0;
  const open = merge.branches.filter((x) => x.status !== "contradicted").length;
  // never more than the plan says: when pairs of open explanations are left apart, say how many
  const plan =
    unseparated === 0
      ? format(checks === 1 ? "results.plan.one" : "results.plan.many", { n: checks })
      : format("results.plan.partial", {
          checks: format(checks === 1 ? "results.count.check.one" : "results.count.check.many", {
            n: checks,
          }),
          pairs: format(unseparated === 1 ? "results.count.pair.one" : "results.count.pair.many", {
            n: unseparated,
          }),
        });
  const grey = open < 2 ? null : checks === 0 ? en["results.plan.none"].text : plan;
  return { ink, grey };
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

/** The chip number of each finding (null for none), by source, in the order the list first cites them. */
export function chipNumbers(findings: readonly Evidence[]): (number | null)[] {
  const seen: string[] = [];
  return findings.map((e) => {
    const k = sourceKey(e);
    if (k === null) return null;
    if (!seen.includes(k)) seen.push(k);
    return seen.indexOf(k) + 1;
  });
}

/** The chip's note: the source's title, locator and excerpt, or the bundle and the measurements it computed. */
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

export function sourceNote(snapshot: CaseSnapshot, e: Evidence): string {
  const loc = e.provenance.sourceLocators[0];
  if (loc && e.provenance.verificationStatus !== "computed_checked") {
    const src = snapshot.records.sourceRecords.find((s) => s.id === loc.sourceId);
    return loc.excerpt
      ? format("results.excerpt", {
          title: src?.title ?? en["results.unknownSource"].text,
          locator: loc.locator,
          excerpt: loc.excerpt,
        })
      : format("results.locator", {
          title: src?.title ?? en["results.unknownSource"].text,
          locator: loc.locator,
        });
  }
  const bundleId = e.provenance.dataBundleIds[0];
  const bundle = snapshot.records.dataBundleRecords.find((b) => b.id === bundleId);
  // the measurements are counted, never named by their ids
  const n = e.measurementIds.length;
  const id =
    n === 0 ? "results.computed.none" : n === 1 ? "results.computed.one" : "results.computed.many";
  return format(id, {
    bundle: bundle?.label ?? en["results.unknownBundle"].text,
    n: String(n),
  });
}
