import { describe, expect, it } from "vitest";

import { claimRuleIssues } from "./claim-rules.ts";
import type { ClaimRuleInput } from "./claim-rules.ts";
import { checkExcerpt, formatLocator, normalizeExcerptText, parseLocator } from "./excerpt.ts";
import { numbersIn, unprovenNumbers } from "./numeric-provenance.ts";
import { prohibitedHits } from "./prohibited-claims.ts";

describe("numeric provenance", () => {
  const allowed = [0.1439, 0.1076, 0.1937, 0.9668];
  // The case's periods run from the 1991 rainfall reference to the 2026 record.
  const SPAN = { first: 1991, last: 2026 };
  const check = (text: string, values = allowed, excerpts: string[] = []) =>
    unprovenNumbers(text, values, excerpts, SPAN);

  it("accepts values at their displayed precision, as percents, and dates and IDs", () => {
    expect(check("The area median was 0.1439 in April 2022 (period_2022-04).")).toEqual([]);
    expect(check("About 0.14, spread 0.108 to 0.194.")).toEqual([]);
    expect(check("96.7% of the catchment was valid on 2022-04-28.")).toEqual([]);
    expect(check("Between 2019 and 2025 the record holds 3 April 2022.")).toEqual([]);
  });

  it("rejects invented and computed numbers", () => {
    expect(check("NDVI fell by 0.05 from March.")).toEqual(["0.05"]);
    expect(check("The area median was 0.15.")).toEqual(["0.15"]);
    expect(check("12 months had data.")).toEqual(["12"]);
    expect(check("A 97% valid share.")).toEqual([]);
    expect(check("A 98% valid share.")).toEqual(["98%"]);
  });

  it("a number followed by a unit is never a year (a34)", () => {
    expect(check("Tabant lies at 1950 m.")).toEqual(["1950"]);
    expect(check("The ridge reaches 2040 m.")).toEqual(["2040"]);
    expect(check("In 2022 the total was 2010 mm.")).toEqual(["2010"]);
    expect(check("About 2000 ha are terraced.")).toEqual(["2000"]);
    expect(check("A 2001 % change.")).toEqual(["2001"]);
    expect(check("The ridge reaches 2040 metres.")).toEqual(["2040"]);
  });

  it("a number followed by a noun, a range with a unit, or masl is never a year (count-noun gap)", () => {
    expect(check("About 2000 sheep graze here.")).toEqual(["2000"]);
    expect(check("1995 households use the pasture.")).toEqual(["1995"]);
    expect(check("Slopes of 1950-60 m.")).toEqual(["1950", "60"]);
    expect(check("The village sits at 2000 masl.")).toEqual(["2000"]);
    expect(check("The village sits at 2000 m a.s.l.")).toEqual(["2000"]);
    expect(check("The 2022 total was low.")).toEqual(["2022"]);
  });

  it("a count after a date word is a quantity, not a year (a46)", () => {
    expect(check("Herds rose to 2000 head.")).toEqual(["2000"]);
    expect(check("The flock grew from 1995 to 2010 animals.")).toEqual(["1995", "2010"]);
    expect(check("Up to 2000 sheep graze here.")).toEqual(["2000"]);
    expect(check("In 2000 households, goats outnumber sheep.")).toEqual(["2000"]);
    expect(check("In 2022 rainfall was low.")).toEqual(["2022"]);
  });

  it("a bare 'to' never makes a year a date, and a range must run forward (a46 10c recheck)", () => {
    expect(check("The flock grew to 2000.")).toEqual(["2000"]);
    expect(check("Herds rose to 2000, then fell.")).toEqual(["2000"]);
    expect(check("Herds rose to 2000 and then fell.")).toEqual(["2000"]);
    expect(check("Numbers fell from 2010 to 1995.")).toEqual(["2010", "1995"]);
    expect(check("The record runs from 2019 to 2025.")).toEqual([]);
    expect(check("Between 2019 and 2025, the record holds.")).toEqual([]);
  });

  it("a range after a change verb is two quantities unless a month or season follows (b12, 10e)", () => {
    expect(check("Rainfall rose from 2019 to 2022.")).toEqual(["2019", "2022"]);
    expect(check("Herds rose from 2020 to 2024.")).toEqual(["2020", "2024"]);
    expect(check("Cover declined from 2019 to 2021, then held.")).toEqual(["2019", "2021"]);
    expect(check("NDVI fell from 2022.")).toEqual(["2022"]);
    expect(check("NDVI fell from 2019 to 2022 spring values.")).toEqual([]);
    expect(check("NDVI fell from 2021 to 2022 April values.")).toEqual([]);
    expect(check("Rainfall rose between 2019 and 2022.")).toEqual([]);
    expect(check("The record runs from 2019 to 2022.")).toEqual([]);
  });

  it("a citation year in brackets is refused, failing closed while the agent cites by source ID", () => {
    expect(check("Wessels et al. (2012) describe the method.")).toEqual(["2012"]);
    expect(check("The method is described.", [], ["Wessels et al. (2012)"])).toEqual([]);
  });

  it("a year counts as a date only in a date pattern or after in, since, from, to, until, between or during", () => {
    expect(check("The 2022/23 season was dry.")).toEqual([]);
    expect(check("NDVI in April 2023 was low.")).toEqual([]);
    expect(check("The flag holds since 2019.")).toEqual([]);
    expect(check("The record runs from 2019 to 2025.")).toEqual([]);
    expect(check("The rule held until 2025.")).toEqual([]);
    expect(check("Between 2019 and 2025 the record.")).toEqual([]);
    expect(check("In 2022, rainfall was low.")).toEqual([]);
    expect(check("During 2020 the rain was low.")).toEqual([]);
    expect(check("The record runs from 2019 to 2025, with gaps.")).toEqual([]);
    expect(check("In 2023 spring rain was low.")).toEqual([]);
    expect(check("By 2020 herds had grown.")).toEqual(["2020"]);
    expect(check("Rainfall was low (2022).")).toEqual(["2022"]);
  });

  it("a bare year counts as a date only inside the case's periods", () => {
    expect(check("Tabant lies at 1950.")).toEqual(["1950"]);
    expect(check("In 2040 the pastures.")).toEqual(["2040"]);
    expect(check("In April 1950 the pastures.")).toEqual(["1950"]);
    expect(check("From 1980 to 2020 the record.")).toEqual(["1980", "2020"]);
    expect(check("In 2023 the pastures.")).toEqual([]);
    expect(unprovenNumbers("In 2023 the pastures.", allowed, [], null)).toEqual(["2023"]);
  });

  it("accepts numbers inside a cited excerpt, years outside the case included", () => {
    expect(
      check(
        "The source reports 42% explained variance.",
        [],
        ["explained 42% of biomass variance"],
      ),
    ).toEqual([]);
    expect(
      check("The source dates the rule to 1950.", [], ["the rule of 1950 still holds"]),
    ).toEqual([]);
    expect(check("Tabant lies at 1950 m.", [], ["Tabant (1950 m)"])).toEqual([]);
  });

  it("reads negative values, including the minus sign character", () => {
    expect(numbersIn("\u22120.0123 and -4", null).map((n) => n.value)).toEqual([-0.0123, -4]);
    expect(check("A departure of -0.0123.", [-0.0123])).toEqual([]);
    expect(check("A departure of -0.0123.", [0.0123])).toEqual(["-0.0123"]);
    expect(check("IQR 0.1076-0.1937.", [0.1076, 0.1937])).toEqual([]);
  });
});

describe("prohibited claims", () => {
  it("flags diagnosis, cause, biomass, significance, forecasts, consent and outcomes", () => {
    const flagged = [
      "Overgrazing was detected in the catchment.",
      "NDVI declined due to grazing.",
      "Biomass is low.",
      "There is a significant decline.",
      "NDVI will recover next spring.",
      "The community consented to the closure.",
      "Restoration success is measured.",
    ];
    expect(flagged.map((t) => prohibitedHits(t)[0]?.ruleId)).toEqual([
      "diagnosis",
      "causal",
      "biomass",
      "significance",
      "forecast",
      "consent",
      "outcome",
    ]);
  });

  it('the causal rule catches "caused" on its own (a60)', () => {
    expect(prohibitedHits("Grazing caused the decline.")[0]?.ruleId).toBe("causal");
    expect(prohibitedHits("The decline was caused by grazing.")[0]?.ruleId).toBe("causal");
  });

  it("passes a plain observation", () => {
    expect(prohibitedHits("The April 2022 area median was 0.1439, with snow suspected.")).toEqual(
      [],
    );
  });
});

describe("claim rules", () => {
  const all = new Set(["observation", "scientific_context", "field_requirement", "hypothesis"]);
  const base: ClaimRuleInput = {
    claimKind: "observation",
    measurementIds: ["meas_test_2022-04"],
    sourceId: null,
    locator: null,
    excerpt: null,
    scopeNote: "",
    sourceRetrieved: null,
  };
  const fields = (input: Partial<ClaimRuleInput>, kinds = all) =>
    claimRuleIssues({ ...base, ...input }, kinds).map((i) => i.field);

  it("an observation cites measurements and no source", () => {
    expect(fields({})).toEqual([]);
    expect(fields({ measurementIds: [] })).toEqual(["measurementIds"]);
    expect(fields({ sourceId: "src_test" })).toEqual(["sourceId"]);
  });

  it("published context cites a retrieved source with locator and excerpt", () => {
    const context = {
      claimKind: "scientific_context",
      measurementIds: [],
      sourceId: "src_test",
      locator: "p. 4",
      excerpt: "text",
    };
    expect(fields({ ...context, sourceRetrieved: true })).toEqual([]);
    expect(fields({ ...context, sourceRetrieved: false })).toEqual(["sourceId"]);
    expect(fields({ ...context, excerpt: null, sourceRetrieved: true })).toEqual(["sourceId"]);
  });

  it("a field requirement states the decision it informs", () => {
    expect(fields({ claimKind: "field_requirement", measurementIds: [] })).toEqual(["scopeNote"]);
    expect(
      fields({
        claimKind: "field_requirement",
        measurementIds: [],
        scopeNote: "Informs where to sample.",
      }),
    ).toEqual([]);
  });

  it("verified_outcome is rejected in P0 and other kinds only where the task allows them", () => {
    expect(fields({ claimKind: "verified_outcome" })).toEqual(["claimKind"]);
    expect(fields({ claimKind: "hypothesis" }, new Set(["observation"]))).toEqual(["claimKind"]);
  });
});

describe("excerpt check (TR-04 rule)", () => {
  const page =
    "Le p\u00e2turage collectif est\nr\u00e9gl\u00e9 par une   fermeture saisonni\u00e8re\u00a0de 3 mois.";

  it("collapses White_Space runs, including line breaks and no-break spaces, and trims", () => {
    expect(
      checkExcerpt("  r\u00e9gl\u00e9 par une fermeture saisonni\u00e8re de 3 mois. ", page),
    ).toEqual({ ok: true });
    expect(normalizeExcerptText("a\u2003\u2028 b\u0085c")).toBe("a b c");
  });

  it("applies NFC on both sides", () => {
    expect(checkExcerpt("Le pa\u0302turage collectif", page)).toEqual({ ok: true });
  });

  it("folds nothing else: case and hyphens must match", () => {
    expect(checkExcerpt("le p\u00e2turage collectif", page)).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(checkExcerpt("fermeture-saisonni\u00e8re", page)).toEqual({
      ok: false,
      reason: "not_found",
    });
  });

  it("rejects empty and over-long excerpts", () => {
    expect(checkExcerpt("   ", page)).toEqual({ ok: false, reason: "empty" });
    expect(checkExcerpt("x".repeat(301), "x".repeat(400))).toEqual({
      ok: false,
      reason: "too_long",
    });
    expect(checkExcerpt("\u{1F600}".repeat(300), "\u{1F600}".repeat(300))).toEqual({ ok: true });
  });

  it("locators name the file and a 1-based page, a section or the full text", () => {
    expect(parseLocator("MAR_Archive.pdf, page 19")).toEqual({
      document: "MAR_Archive.pdf",
      page: 19,
    });
    expect(parseLocator("overview.html, section Data, methods")).toEqual({
      document: "overview.html",
      section: "Data, methods",
    });
    expect(parseLocator("record.json, full text")).toEqual({
      document: "record.json",
      fullText: true,
    });
    expect(parseLocator("page 2")).toBeNull();
    expect(parseLocator("MAR_Archive.pdf, page 0")).toBeNull();
    for (const l of [
      { document: "a.pdf", page: 3 },
      { document: "b.html", section: "Intro" },
      { document: "c.json", fullText: true as const },
    ]) {
      expect(parseLocator(formatLocator(l))).toEqual(l);
    }
  });
});
