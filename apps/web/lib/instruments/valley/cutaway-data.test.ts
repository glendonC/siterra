import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { lint } from "../../copy/lint";
import { SECTION_PLACE, placesSchema, statementsSchema } from "./cutaway-data";
import { SEASON_TREND_YEARS, figuresSchema, snowSchema } from "./fixtures";
import { PLACE_ON_LINE_M, cutawayTransectSchema, nearestSample, transectFixture } from "./transect";
import { lonLatToUtm } from "./utm";

// The cutaway's own fixtures against their sources: the place against the case record's context features, the
// statements against the source register (until PLATFORM's Evidence records replace them).

const WEB = join(import.meta.dirname, "..", "..", "..");
const REPO = join(WEB, "..", "..");
const FIXTURES = join(WEB, "public", "instruments", "valley");
const read = (path: string): unknown => JSON.parse(readFileSync(path, "utf8"));

const places = placesSchema.parse(read(join(FIXTURES, "places.json")));
const statements = statementsSchema.parse(read(join(FIXTURES, "statements.json")));
const register = readFileSync(join(REPO, "research", "science", "source-register.md"), "utf8");
const registerRow = (id: string) =>
  register.split("\n").find((l) => l.startsWith(`| ${id} |`)) ?? "";
const studyArea = readFileSync(join(REPO, "research", "geospatial", "study-area.md"), "utf8").split(
  "\n",
);

describe("places.json", () => {
  const caseFile = join(REPO, places.source);
  const record = read(caseFile) as { features: Record<string, unknown>[] };

  it("is the case record file it names, unchanged", () => {
    expect(createHash("sha256").update(readFileSync(caseFile)).digest("hex")).toBe(places.sha256);
  });

  it("copies the section's place from the case record exactly", () => {
    const place = places.places.find((p) => p.id === SECTION_PLACE);
    const feature = record.features.find((f) => f["id"] === SECTION_PLACE);
    expect(place).toBeDefined();
    expect(feature).toMatchObject(place ?? {});
  });
});

describe("statements.json", () => {
  const cites = statements.statements.flatMap((s) => s.cites.map((c) => ({ s, c })));

  it("cites only sources it lists, each listed with its register entry's first author and year", () => {
    for (const { c } of cites) expect(statements.sources.map((s) => s.id)).toContain(c.sourceId);
    for (const src of statements.sources) {
      const [, author, year] = /^(.+?) et al\. (\d{4}),/.exec(src.citation) ?? [];
      expect(registerRow(src.id)).toContain(`| ${author ?? "?"}, `);
      expect(registerRow(src.id)).toContain(`(${year ?? "?"}`);
    }
  });

  it("holds stored-text phrases on a study area line that gives their source and page", () => {
    for (const { c } of cites.filter((x) => x.c.kind === "stored_text")) {
      const ref = `${c.sourceId}, p. ${c.page ?? "?"}`;
      expect(studyArea.some((l) => l.includes(c.excerpt) && l.includes(ref))).toBe(true);
    }
  });

  it("holds excerpts found in the register entry, verbatim ones inside its quotation marks", () => {
    for (const { c } of cites.filter((x) => x.c.kind !== "stored_text")) {
      const row = registerRow(c.sourceId);
      if (c.kind === "verbatim") expect(row).toContain(`"${c.excerpt}`);
      else expect(row).toContain(c.excerpt);
      // the register gives the page range of the passage; a page or the first page of a range must be in it
      const first = c.page?.split(" ")[0];
      if (first) expect(row).toMatch(new RegExp(`pp?\\. [^|]*\\b${first}\\b`));
    }
  });

  it("quotes only verbatim excerpts, word for word", () => {
    for (const s of statements.statements.filter((x) => x.wording === "quotation"))
      for (const c of s.cites) {
        expect(c.kind).toBe("verbatim");
        expect(s.text).toContain(c.excerpt);
      }
  });

  it("puts on screen no number that its excerpts do not give", () => {
    for (const s of statements.statements) {
      const numbers = s.text.replace(/(\d),(\d)/g, "$1$2").match(/\d+/g) ?? [];
      const excerpts = s.cites.map((c) => c.excerpt).join(" ");
      for (const n of numbers) expect(excerpts).toMatch(new RegExp(`\\b${n}\\b`));
    }
  });

  it("passes the copy lint", () => {
    for (const s of statements.statements)
      expect(lint(s.text, "ui").filter((f) => f.sev === "error")).toEqual([]);
  });
});

describe("the cutaway's figures", () => {
  const figures = figuresSchema.parse(read(join(FIXTURES, "figures.json")));
  const snow = snowSchema.parse(read(join(FIXTURES, "snow.json")));
  const bands = ["elevation_low", "elevation_mid", "elevation_high"] as const;

  it("support 'every 95% interval lies above zero' for the three bands", () => {
    for (const b of bands) expect(figures.season_trend[b].lower).toBeGreaterThan(0);
  });

  it("cover the season trend bundle's first to last season", () => {
    const raw = read(join(FIXTURES, "figures.json")) as { season_trend: { source: string } };
    const bundle = read(join(REPO, raw.season_trend.source)) as {
      period: { first_season: number; last_season: number };
    };
    expect(SEASON_TREND_YEARS).toEqual([bundle.period.first_season, bundle.period.last_season]);
  });

  it("have twelve monthly snow shares for each band", () => {
    for (const b of bands) expect(snow.bands[b]?.monthly_mean).toHaveLength(12);
  });
});

// The section line: the S2 bundle's samples, projected, recomputed here from the bundle's two files (whose
// checksums fixtures.test.ts checks), and passing the case record's place.
describe("transect.json", () => {
  const t = cutawayTransectSchema.parse(read(join(FIXTURES, "transect.json")));

  it("is the S2 bundle's line, recomputed from its two files", () => {
    const [samples, terrain] = t.sources.map((s) => read(join(REPO, s.path)));
    expect(t).toEqual(transectFixture(samples as never, terrain as never, t.transect, t.sources));
  });

  it("passes the section's place, as the case record places it, within PLACE_ON_LINE_M", () => {
    const place = places.places.find((p) => p.id === SECTION_PLACE);
    const [E, N] = lonLatToUtm(place?.lonLat[0] ?? 0, place?.lonLat[1] ?? 0, 29);
    expect(nearestSample(t, E, N).offset_m).toBeLessThanOrEqual(PLACE_ON_LINE_M);
  });
});
