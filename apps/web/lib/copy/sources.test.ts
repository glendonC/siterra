import { describe, expect, it } from "vitest";
import { lint } from "./lint";
import { SOURCES_LINT_ALLOWLIST, datasetTerm, sc, sformat, type SourcesMessageId } from "./sources";

// The overlay's words pass the same copy lint as en.ts (VC-06) and name no place (decision 10).
describe("sources catalog", () => {
  const entries = Object.entries(sc) as [SourcesMessageId, (typeof sc)[SourcesMessageId]][];

  it.each(entries)("%s passes the copy lint", (id, msg) => {
    const allowed = new Set(SOURCES_LINT_ALLOWLIST[id]?.rules ?? []);
    expect(lint(msg.text, msg.kind).filter((f) => !allowed.has(f.id))).toEqual([]);
  });

  it("allowlists only rules a string actually breaks, with a reason", () => {
    for (const [id, entry] of Object.entries(SOURCES_LINT_ALLOWLIST) as [
      SourcesMessageId,
      { rules: string[]; reason: string },
    ][]) {
      const found = new Set(lint(sc[id].text, sc[id].kind).map((f) => f.id));
      expect(entry.reason.length).toBeGreaterThan(20);
      for (const rule of entry.rules)
        expect(found, `${id} no longer breaks ${rule}`).toContain(rule);
    }
  });

  it("names no place: every place word comes from a record field", () => {
    const named = entries
      .filter(([, m]) =>
        /valley|bouguemez|tabant|ouchi|aït|high atlas|atlas mountains|morocco|calaveras|diablo|california/i.test(
          m.text,
        ),
      )
      .map(([id]) => id);
    expect(named).toEqual([]);
  });

  it("fills placeholders and leaves a missing one visible", () => {
    expect(sformat("sources.lead.publications.many", { n: 4 })).toBe(
      "Context from 4 publications.",
    );
    expect(sformat("sources.lead.publications.many")).toBe("Context from {n} publications.");
  });

  // the owner, 3 Nov 2026: plain English a first-time visitor reads, none of the record's own words
  it("says the limits with none of the record's vocabulary, IDs or change logs", () => {
    const record =
      /\b(?:merge|status|branch|stale|revision|proposed|recorded|replay|composites?|claim kind|model estimates?|false discovery rate|host|fixture|synthetic)\b|SCI-\d|@\d|\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/i;
    const used = entries.filter(([id, m]) => id.startsWith("sources.") && record.test(m.text));
    expect(used.map(([id]) => id)).toEqual([]);
  });

  it("names a known dataset and keeps an unknown one as the record writes it", () => {
    expect(datasetTerm("name", "copernicus-dem-glo-30")).toBe("Copernicus DEM GLO-30");
    expect(datasetTerm("measured", "CHIRPS-3.0-monthly-final")).toBe("Rainfall");
    expect(datasetTerm("name", "AWS Terrain Tiles (Terrarium)")).toBe(
      "AWS Terrain Tiles (Terrarium)",
    );
    expect(datasetTerm("measured", "AWS Terrain Tiles (Terrarium)")).toBe("Data");
  });
});
