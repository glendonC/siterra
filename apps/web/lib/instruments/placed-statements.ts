// The published statements an instrument places beside what they describe, from the case record (contracts 1.17.0):
// each display text the spec carries (cross_section statements[].display, pixel_anatomy contextDisplay) with the
// sources of its Evidence. A statement cites each source once, with the pages its Evidence locators name ("7 to 8"
// for a run, "2, 5" otherwise); the sources are numbered by publication date. A source's short id is the Source
// record's id without its "src_" prefix (src_SCI-19 is SCI-19); its citation is the overview's short reference.

import type { CaseSnapshot, DisplayText } from "@siterra/contracts";
import { reference } from "../overview/record";

type Source = CaseSnapshot["records"]["sourceRecords"][number];

export interface PlacedStatement {
  id: string;
  text: string;
  /** One entry per source, in the order the Evidence cites them; page null when no locator names one. */
  cites: { sourceId: string; page: string | null }[];
}

export interface PlacedStatements {
  /** Every cited source once, oldest publication first. */
  sources: { id: string; citation: string }[];
  statements: PlacedStatement[];
}

/** "src_SCI-19" as "SCI-19". */
export const shortSourceId = (id: string) => id.replace(/^src_/, "");

/** Pages as a statement cites them: one page, a run "7 to 8", or a list "2, 5". */
export function pagesText(pages: readonly number[]): string | null {
  const p = [...new Set(pages)].sort((a, b) => a - b);
  const [first] = p;
  const last = p[p.length - 1];
  if (first === undefined || last === undefined) return null;
  if (p.length === 1) return String(first);
  return last - first === p.length - 1 ? `${String(first)} to ${String(last)}` : p.join(", ");
}

/** The statements of the given display texts, each with the sources of its Evidence. */
export function placedStatements(
  snapshot: CaseSnapshot,
  displays: readonly { id: string; display: DisplayText }[],
): PlacedStatements {
  const cited = new Map<string, Source>();
  const statements = displays.map(({ id, display }) => {
    const pages = new Map<string, number[]>();
    for (const evidenceId of display.evidenceIds) {
      const e = snapshot.records.evidenceRecords.find((x) => x.id === evidenceId);
      if (!e) throw new Error(`The case has no Evidence ${evidenceId}`);
      for (const loc of e.provenance.sourceLocators) {
        const src = snapshot.records.sourceRecords.find((s) => s.id === loc.sourceId);
        if (!src) throw new Error(`The case has no Source ${loc.sourceId}`);
        cited.set(src.id, src);
        const list = pages.get(src.id) ?? [];
        pages.set(src.id, list);
        const page = /\bpages?\s+(\d+)/i.exec(loc.locator)?.[1];
        if (page !== undefined) list.push(Number(page));
      }
    }
    if (pages.size === 0) throw new Error(`${id} cites no source`);
    return {
      id,
      text: display.text,
      cites: [...pages].map(([sourceId, p]) => ({
        sourceId: shortSourceId(sourceId),
        page: pagesText(p),
      })),
    };
  });
  const sources = [...cited.values()]
    .sort(
      (a, b) =>
        (a.publicationDate ?? "").localeCompare(b.publicationDate ?? "") ||
        a.id.localeCompare(b.id),
    )
    .map((src) => ({ id: shortSourceId(src.id), citation: reference(src, []) }));
  return { sources, statements };
}
