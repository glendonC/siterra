import { describe, expect, it } from "vitest";
import { lint } from "../copy/lint";
import { seed } from "./seed-listing";
import { pagesText, placedStatements } from "./placed-statements";

// The statements the cutaway and the pixel anatomy place come from the case record's display texts and Evidence.

const spec = (kind: string) => {
  const p = (seed.records.instrumentSpecRecords ?? []).find(
    (r) => r.parameters.kind === kind,
  )?.parameters;
  if (!p) throw new Error(kind);
  return p;
};

describe("placedStatements", () => {
  it("gives the cutaway its two statements with the sources of their Evidence, oldest source first", () => {
    const p = spec("cross_section");
    if (p.kind !== "cross_section") throw new Error("kind");
    const placed = placedStatements(
      seed,
      p.statements.flatMap((s) => (s.display ? [{ id: s.placement, display: s.display }] : [])),
    );
    expect(placed.sources).toEqual([
      { id: "SCI-19", citation: "Auclair et al. 2011, Ecology and Society 16(4): 24" },
      { id: "SCI-03", citation: "El Aayadi et al. 2026, Sustainable Earth Reviews 9, article 7" },
    ]);
    expect(placed.statements.map((s) => [s.id, s.text, s.cites.map((c) => c.sourceId)])).toEqual([
      [
        "valley_floor",
        "Irrigated valley floor, about 1,800 to 2,200 m, with more than thirty villages.",
        ["SCI-03", "SCI-19"],
      ],
      [
        "upper_slope",
        "Upper rangelands: mainly spiny xerophytic vegetation and reduced areas of short grasslands.",
        ["SCI-19"],
      ],
    ]);
  });

  it("gives the pixel its context statements with the pages their locators name", () => {
    const p = spec("pixel_anatomy");
    if (p.kind !== "pixel_anatomy") throw new Error("kind");
    const placed = placedStatements(
      seed,
      (p.contextDisplay ?? []).map((display, i) => ({ id: String(i), display })),
    );
    expect(placed.statements.map((s) => s.cites)).toEqual([
      [{ sourceId: "SCI-03", page: "7 to 8" }],
      [{ sourceId: "SCI-19", page: "2" }],
    ]);
    expect(placed.statements[0]?.text).toMatch(/^Herders report losing palatable species/);
  });

  it("puts on screen no number its Evidence excerpts do not give, and passes the copy lint", () => {
    const xs = spec("cross_section");
    const px = spec("pixel_anatomy");
    const displays = [
      ...(xs.kind === "cross_section"
        ? xs.statements.flatMap((s) => (s.display ? [s.display] : []))
        : []),
      ...(px.kind === "pixel_anatomy" ? (px.contextDisplay ?? []) : []),
    ];
    expect(displays).toHaveLength(4);
    for (const d of displays) {
      const excerpts = d.evidenceIds
        .flatMap(
          (id) =>
            seed.records.evidenceRecords.find((e) => e.id === id)?.provenance.sourceLocators ?? [],
        )
        .map((l) => l.excerpt)
        .join(" ");
      const numbers = d.text.replace(/(\d),(\d)/g, "$1$2").match(/\d+/g) ?? [];
      for (const n of numbers) expect(excerpts).toMatch(new RegExp(`\\b${n}\\b`));
      expect(lint(d.text, "ui").filter((f) => f.sev === "error")).toEqual([]);
    }
  });

  it("refuses a display text whose Evidence the case does not hold", () => {
    expect(() =>
      placedStatements(seed, [
        { id: "x", display: { text: "Something.", evidenceIds: ["ev_not_in_the_case"] } },
      ]),
    ).toThrow(/no Evidence/);
  });
});

describe("pagesText", () => {
  it("says one page, a run, or a list", () => {
    expect(pagesText([7, 7, 8])).toBe("7 to 8");
    expect(pagesText([2])).toBe("2");
    expect(pagesText([5, 2])).toBe("2, 5");
    expect(pagesText([])).toBeNull();
  });
});
