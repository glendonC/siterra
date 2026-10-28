import { describe, expect, it } from "vitest";
import { lint } from "../copy/lint";
import { loadFixture } from "./load.server";
import { buildStory, VERDICT_NOT, VERDICT_TEXT } from "./story";

const fixture = loadFixture();
const story = buildStory(fixture);

describe("prototype story numbers come from the bundles", () => {
  it("counts the months as the departure and coverage bundles store them", () => {
    expect(story.numbers.months).toBe(84);
    expect(story.numbers.measured).toBe(56);
    expect(fixture.months.filter((m) => m.hasPicture)).toHaveLength(56);
  });

  it("finds every measured month from May 2022 to Apr 2023 below usual", () => {
    expect(story.numbers.browner).toBe(8);
    expect(story.numbers.lowest.id).toBe("2022-06");
    expect(story.numbers.lowest.greenness).toBe(-0.013);
    expect(story.numbers.minSeenPercent).toBe(89);
  });

  it("reads the rain from the CHIRPS and season-summary bundles", () => {
    expect(story.numbers.dry.totalMm).toBe(349.33);
    expect(story.numbers.usualMm).toBe(562);
    expect(story.numbers.lateRain.rainMm).toBe(282.4);
    expect(story.numbers.rainCells).toBe(fixture.rainCells.features.length);
  });

  it("counts winter gaps, snow flags and sources from the records", () => {
    expect(story.numbers.winterMonths).toBe(28);
    expect(story.numbers.winterMeasured).toBe(0);
    expect(story.numbers.snowInBrowner).toBe(1);
    expect(story.numbers.sources).toBe(14);
    expect(story.numbers.opened).toBe(12);
  });

  it("quotes excerpts word for word from the evaluation set", () => {
    for (const chip of story.chips.filter((c) => c.quote))
      expect(fixture.excerpts.some((e) => e.excerpt === chip.quote)).toBe(true);
  });
});

describe("prototype copy", () => {
  const strings = [
    story.headline,
    story.limit,
    story.sourcesLine,
    story.nextNote,
    story.meaning,
    story.optionsNote,
    story.planNote,
    ...story.sheets.map((s) => s.label),
    ...story.observations.map((o) => o.text),
    ...story.options.flatMap((o) => [o.title, o.what, o.tradeoff, o.decides, o.size]),
    ...story.plan.flatMap((p) => [p.what, p.who, p.when]),
    ...story.segments.map((s) => s.text),
    ...story.beats.map((b) => b.status),
    ...story.lanes.flatMap((l) => [
      l.name,
      l.detail,
      l.caveat ?? "",
      ...l.steps.flatMap((s) => [s.running, s.done]),
    ]),
    ...story.chips.flatMap((c) => [c.label, c.title, c.body ?? "", c.note]),
    ...story.next,
    ...story.method,
    ...Object.values(VERDICT_TEXT),
    ...Object.values(VERDICT_NOT),
  ].filter(Boolean);

  it("has no em dash and no causal wording", () => {
    for (const s of strings) {
      expect(s).not.toMatch(/\u2014/);
      expect(s).not.toMatch(/\b(caused by|due to grazing|overgraz|degrad)/i);
    }
  });

  it("passes the copy lint, except the founder's contractions", () => {
    const errors = strings.flatMap((s) =>
      lint(s, "ui")
        .filter((f) => f.sev === "error")
        .filter((f) => !f.hits.every((h) => /\b\w+n't\b/i.test(h)))
        .map((f) => `${f.id}: ${s}`),
    );
    expect(errors).toEqual([]);
  });
});

describe("prototype investigation arc", () => {
  it("ties every explanation to observations that exist", () => {
    const ids = new Set(story.observations.map((o) => o.id));
    for (const l of story.lanes) {
      expect(l.links.length).toBeGreaterThan(0);
      for (const k of l.links) expect(ids.has(k.obs)).toBe(true);
    }
  });

  it("names who decides each option and points it at an explanation", () => {
    const lanes = new Set(story.lanes.map((l) => l.id));
    for (const o of story.options) {
      expect(o.decides.length).toBeGreaterThan(0);
      expect(o.tradeoff.length).toBeGreaterThan(0);
      for (const a of o.addresses) expect(lanes.has(a)).toBe(true);
    }
  });

  it("places located observations inside the study area's box", () => {
    const g = fixture.catchment.geometry;
    const ring = ((g.type === "Polygon" ? g.coordinates[0] : g.coordinates[0]?.[0]) ??
      []) as number[][];
    const lons = ring.map((p) => p[0] ?? 0);
    const lats = ring.map((p) => p[1] ?? 0);
    for (const o of story.observations.filter((x) => x.at)) {
      const [lon, lat] = o.at as [number, number];
      expect(lon).toBeGreaterThanOrEqual(Math.min(...lons));
      expect(lon).toBeLessThanOrEqual(Math.max(...lons));
      expect(lat).toBeGreaterThanOrEqual(Math.min(...lats));
      expect(lat).toBeLessThanOrEqual(Math.max(...lats));
    }
  });

  it("reads the place from the case record", () => {
    expect(story.question).toContain(story.place.name);
    expect(story.place.area).toMatch(/km²$/);
  });
});

describe("prototype follows the design language budgets", () => {
  const words = (s: string) => s.split(/\s+/).filter(Boolean).length;

  it("keeps the answer card within 45 words, honesty lines exempt", () => {
    const counted = [story.headline, ...story.segments.map((s) => s.text)].join(" ");
    expect(words(counted)).toBeLessThanOrEqual(45);
  });

  it("keeps sheet labels on the land to 6 words", () => {
    for (const s of story.sheets) expect(words(s.label)).toBeLessThanOrEqual(6);
  });

  it("never says a saved result is being measured now", () => {
    for (const b of story.beats) expect(b.status).not.toMatch(/\bmeasuring\b/i);
  });

  it("lands each sheet before the run ends, in plan order", () => {
    const downs = story.sheets.map((s) => s.downAt);
    expect([...downs].sort((a, b) => a - b)).toEqual(downs);
    for (const s of story.sheets) {
      expect(s.liftAt + 0.6).toBeLessThan(s.downAt);
      expect(s.downAt).toBeLessThan(story.endsAt);
    }
  });
});
