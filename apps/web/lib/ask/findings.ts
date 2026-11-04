// The case's findings a question typed in the Ask is answered from (UI-2): one entry for each thing the case can say,
// worded as the answer column or its view words it, each keyed by the one record it is built from. The answer
// sentence is keyed by the Measurement it reads first (the merge, for an answer made of verdicts); an explanation's
// verdict by its branch; a check to make next by the gap or explanation its plan says it settles; a view's lead by
// the view's spec (Year by Year by its seasons bundle); a published study's statement, as a view places it, by its
// Evidence; and the case's own accepted observations and study statements by their Evidence. No two entries share a
// key, so the model picks among them by their place in the list (lib/ask/select.ts), the follow-up's task records the
// keys it picked, in order, as the records its answer rests on (lib/live-place/follow-up.ts), and the answer column
// shows those entries again from the same records (lib/readout/readout.ts). Pure; no number is computed here.

import type { CaseSnapshot, EntityVersion, InstrumentSpec } from "@siterra/contracts";
import { placedStatements } from "../instruments/placed-statements";
import { readableStatement, shortCitation } from "../overview/results";
import type { GroundCheck, ReadoutAnswer, Verdict } from "../readout/readout";
import { datedText, nextWords, verdictWords } from "../readout/words";
import { timeSourcesOf } from "../time/load";
import { isFollowUpTaskId } from "./task";

/** The views whose lead can answer a question. */
export type LeadView = "cutaway" | "pixel" | "rainfall" | "time";

/** Where a finding is shown: the answer, a verdict, a check to make next, a view, or a source's statement. */
export type FindingPlace =
  | { kind: "answer" }
  | { kind: "verdict" }
  | { kind: "next" }
  | { kind: "view"; view: LeadView }
  | { kind: "source"; source: string | null };

export interface CaseFinding {
  /** The one record the finding is built from, at the revision read. */
  key: EntityVersion;
  /** Its words: one sentence, or a view's lead lines as the view shows them. */
  lines: readonly string[];
  place: FindingPlace;
}

/** Each view's lead lines (lib/ask/leads.ts); a view the case does not offer, or whose data was not read, is absent. */
export type ViewLeads = Partial<Record<LeadView, readonly string[]>>;

/** The parts of the answer column the findings are worded from (lib/readout/readout.ts readoutOf). */
export interface ColumnParts {
  answer: ReadoutAnswer;
  verdicts: readonly Verdict[];
  checks: readonly GroundCheck[];
  /** The merge the verdicts come from; null without one. */
  mergeId: string | null;
}

/** The views in the order the list offers their leads. */
export const LEAD_VIEWS: readonly LeadView[] = ["cutaway", "pixel", "rainfall", "time"];

const SPEC_KIND: Record<Exclude<LeadView, "time">, InstrumentSpec["parameters"]["kind"]> = {
  cutaway: "cross_section",
  pixel: "pixel_anatomy",
  rainfall: "rainfall_scatter",
};

/** The case's ready spec of a kind. */
function readySpec(
  snapshot: CaseSnapshot,
  kind: InstrumentSpec["parameters"]["kind"],
): InstrumentSpec | undefined {
  return snapshot.records.instrumentSpecRecords?.find(
    (s) => s.parameters.kind === kind && s.status === "ready",
  );
}

/** The record with this id at the revision the case holds now, whatever its type; null when the case holds none. */
export function versionOf(snapshot: CaseSnapshot, id: string): EntityVersion | null {
  for (const list of Object.values(snapshot.records)) {
    if (!Array.isArray(list)) continue;
    for (const r of list as readonly { id?: unknown; revision?: unknown }[]) {
      if (r.id === id && typeof r.revision === "number")
        return { entityId: id, revision: r.revision };
    }
  }
  return null;
}

/** The record a view's lead is keyed by: its spec, or for Year by Year its seasons bundle; null when not offered. */
export function viewKeyOf(snapshot: CaseSnapshot, view: LeadView): string | null {
  if (view === "time") return timeSourcesOf(snapshot)?.seasons ?? null;
  return readySpec(snapshot, SPEC_KIND[view])?.id ?? null;
}

/** The view whose lead a record keys, if any. */
export function viewOfKey(snapshot: CaseSnapshot, id: string): LeadView | null {
  return LEAD_VIEWS.find((v) => viewKeyOf(snapshot, v) === id) ?? null;
}

/** The text of a published statement a view places, with the short citations of its sources; null when unreadable. */
function placed(
  snapshot: CaseSnapshot,
  display: { text: string; evidenceIds: string[] },
): { text: string; source: string } | null {
  try {
    const [st] = placedStatements(snapshot, [{ id: "follow-up", display }]).statements;
    return st
      ? { text: st.text, source: [...new Set(st.cites.map((c) => c.name))].join("; ") }
      : null;
  } catch {
    // a display text whose Evidence or Source the case does not hold is not offered
    return null;
  }
}

/** The display texts the views place, the cross section's first, then the pixel's. */
function displaysOf(snapshot: CaseSnapshot): { text: string; evidenceIds: string[] }[] {
  const cut = readySpec(snapshot, "cross_section")?.parameters;
  const pixel = readySpec(snapshot, "pixel_anatomy")?.parameters;
  return [
    ...(cut?.kind === "cross_section"
      ? cut.statements.flatMap((s) => (s.display ? [s.display] : []))
      : []),
    ...(pixel?.kind === "pixel_anatomy" ? (pixel.contextDisplay ?? []) : []),
  ];
}

/** An accepted statement's source as a reader names it: a study's short citation, a measurement's dataset. */
function sourceOf(
  snapshot: CaseSnapshot,
  e: CaseSnapshot["records"]["evidenceRecords"][number],
): string | null {
  const sourceId = e.provenance.sourceLocators[0]?.sourceId;
  const src = snapshot.records.sourceRecords.find((s) => s.id === sourceId);
  if (src) return shortCitation(src);
  const bundleId = e.provenance.dataBundleIds[0];
  return snapshot.records.dataBundleRecords.find((b) => b.id === bundleId)?.label ?? null;
}

/**
 * Every finding of the case, in the column's order: the answer, the verdicts, the checks to make next, the views'
 * leads, the statements of published studies the views place, then the case's accepted observations and study
 * statements. A finding keeps the first of its candidate records no earlier finding took, and one with none left, or
 * with the words of an earlier one, is left out. Follow-ups' own Evidence is never offered.
 */
export function caseFindings(
  snapshot: CaseSnapshot,
  column: ColumnParts,
  leads: ViewLeads,
): CaseFinding[] {
  const out: CaseFinding[] = [];
  const used = new Set<string>();
  const said = new Set<string>();
  const add = (
    candidates: readonly (string | null | undefined)[],
    lines: readonly string[],
    place: FindingPlace,
  ) => {
    const text = lines.join(" ");
    if (!lines.length || said.has(text)) return;
    for (const id of candidates) {
      if (!id || used.has(id)) continue;
      const key = versionOf(snapshot, id);
      if (!key) continue;
      used.add(id);
      said.add(text);
      out.push({ key, lines, place });
      return;
    }
  };

  const { answer } = column;
  if (answer.claim && answer.claimKind !== null)
    add(
      [answer.claimKind === "measurement" ? answer.claimIds[0] : column.mergeId],
      [answer.claim],
      { kind: "answer" },
    );
  for (const v of column.verdicts)
    for (const row of v.rows) add([row.branchId], [verdictWords(row)], { kind: "verdict" });
  for (const c of column.checks) add(c.rests, [nextWords(c)], { kind: "next" });
  for (const view of LEAD_VIEWS)
    add([viewKeyOf(snapshot, view)], leads[view] ?? [], { kind: "view", view });
  for (const display of displaysOf(snapshot)) {
    const st = placed(snapshot, display);
    if (st) add(display.evidenceIds, [st.text], { kind: "source", source: st.source });
  }
  const accepted = snapshot.records.evidenceRecords
    .filter(
      (e) =>
        e.status === "accepted" &&
        (e.claimKind === "observation" || e.claimKind === "scientific_context") &&
        !isFollowUpTaskId(e.provenance.generatedByTaskId),
    )
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  for (const e of accepted)
    add([e.id], [datedText(readableStatement(snapshot, e.statement))], {
      kind: "source",
      source: sourceOf(snapshot, e),
    });
  return out;
}

/** A finding a follow-up chose; a view's lead comes with no lines until its view's data is read (lib/ask/leads.ts). */
export interface ChosenFinding {
  key: EntityVersion;
  lines: readonly string[] | null;
  place: FindingPlace;
}

/**
 * The findings a follow-up's task chose, in its order, from the records its task names (Task.inputVersions): each
 * record that keys one of the case's findings at the revision it was chosen at. A record that has moved on since, or
 * that keys no finding, is left out, so nothing is shown that the case no longer says.
 */
export function chosenFindings(
  snapshot: CaseSnapshot,
  column: ColumnParts,
  chosen: readonly EntityVersion[],
): ChosenFinding[] {
  const all = caseFindings(snapshot, column, {});
  return chosen.flatMap((k): ChosenFinding[] => {
    const found = all.find((f) => f.key.entityId === k.entityId);
    if (found) return found.key.revision === k.revision ? [found] : [];
    const view = viewOfKey(snapshot, k.entityId);
    return view && versionOf(snapshot, k.entityId)?.revision === k.revision
      ? [{ key: k, lines: null, place: { kind: "view", view } }]
      : [];
  });
}
