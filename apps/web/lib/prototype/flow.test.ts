import { describe, expect, it } from "vitest";
import { en } from "../copy/en";
import { lint } from "../copy/lint";
import { buildFlow, FORMAL, inside, matchPlace, resolvePlace, ringOf, type Coverage } from "./flow";
import { loadFixture } from "./load.server";
import { buildStory } from "./story";

const fixture = loadFixture();
const story = buildStory(fixture);
const flow = buildFlow(fixture, story);
const ring = ringOf(fixture);

function strings(v: unknown): string[] {
  if (typeof v === "string") return [v];
  if (Array.isArray(v)) return v.flatMap(strings);
  if (v && typeof v === "object") return Object.values(v).flatMap(strings);
  return [];
}

const english = strings({ ...flow, brief: flow.brief.filter((b) => b.lang === "en") });
const flowCatalog = Object.entries(en)
  .filter(([id]) => id.startsWith("flow."))
  .map(([, m]) => m.text);

function coverages(): Coverage[] {
  return [
    ...flow.otherPacks.flatMap((p) => (p.coverage ? [p.coverage] : [])),
    ...flow.questions.flatMap((q) => (q.coverage ? [q.coverage] : [])),
    ...flow.measures.flatMap((m) => (m.coverage ? [m.coverage] : [])),
    ...flow.pins.flatMap((p) => (p.coverage ? [p.coverage] : [])),
    ...flow.timeStops.flatMap((s) => (s.coverage ? [s.coverage] : [])),
  ];
}

describe("the five-stage flow on /prototype", () => {
  it("keeps every English string free of copy-lint errors", () => {
    const errors = english.flatMap((s) =>
      lint(s, "ui")
        .filter((f) => f.sev === "error")
        .map((f) => `${f.id}: ${s}`),
    );
    expect(errors).toEqual([]);
  });

  it("uses none of the founder's banned words, no first person and no 'you'", () => {
    const banned =
      /\b(?:telemetry|validated|verified|attribution|autonomous(?:ly)?|I|I'm|I've|my|you|your|we|our)\b/i;
    const hits = [...english, ...flowCatalog].filter(
      (s) => banned.test(s) && !/^Field (?:Unverified|Verification)$/.test(s),
    );
    expect(hits).toEqual([]);
    expect([...english, ...flowCatalog].join(" ")).not.toMatch(/\u2014/);
  });

  it("writes every coverage boundary as two sentences: what is missing, then what is required", () => {
    const all = coverages();
    expect(all.length).toBeGreaterThanOrEqual(6);
    for (const c of all) {
      const sentences = c.detail.split(/(?<=\.)\s+/);
      expect(sentences, c.detail).toHaveLength(2);
      expect(sentences[1], c.detail).toMatch(/required|Select a supported region/);
    }
  });

  it("names questions, packs and hypotheses in 1 to 3 Title Case words", () => {
    const names = [
      ...flow.questions.map((q) => q.text),
      flow.pack.name,
      ...flow.otherPacks.map((p) => p.name),
      ...flow.hypotheses.map((h) => h.name),
      ...flow.steps.map((s) => s.title),
    ];
    for (const n of names) {
      const words = n.split(/\s+/);
      expect(words.length, n).toBeLessThanOrEqual(3);
      for (const w of words) expect(w, n).toMatch(/^[\p{Lu}0-9]/u);
    }
  });

  it("marks a typed city or an unloaded theme as a coverage boundary, never a result", () => {
    expect(resolvePlace(fixture.placeName, fixture, flow).kind).toBe("match");
    const heat = resolvePlace("Marrakech urban heat", fixture, flow);
    expect(heat.kind === "pack" && heat.pack.id).toBe("urban-heat");
    const city = resolvePlace("Casablanca", fixture, flow);
    expect(city.kind).toBe("outside");
    expect(flow.otherPacks.every((p) => !p.loaded && p.coverage?.badge === "notLoaded")).toBe(true);
  });

  it("pins every finding and ground check inside the catchment", () => {
    for (const p of [...flow.pins, ...flow.groundChecks])
      if (p.at) expect(inside(p.at, ring), p.id).toBe(true);
  });

  it("shows the formal verdicts that match the hypotheses", () => {
    expect(FORMAL).toEqual({
      possible: "consistent",
      nofit: "contradicted",
      satellite: "cannot",
      unknown: "cannot",
    });
    for (const b of flow.pins.flatMap((p) => p.bears)) {
      const lane = story.lanes.find((l) => l.id === b.lane);
      expect(lane && FORMAL[lane.verdict], b.lane).toBe(b.verdict);
    }
  });

  it("uses only the models named in ADR-0041, or none for a tool", () => {
    for (const s of flow.steps)
      expect([null, "muse-spark-1.3", "Muse Glimmer 30B"]).toContain(s.model);
    expect(flow.steps.find((s) => s.model === null)).toBeDefined();
  });

  it("states snow cover and green-up timing as coverage boundaries, not values", () => {
    const snow = flow.measures.find((m) => m.id === "snow");
    const greenup = flow.measures.find((m) => m.id === "greenup");
    expect(snow?.text).toBeUndefined();
    expect(greenup?.text).toBeUndefined();
    expect(snow?.coverage?.detail).toContain(
      `${String(story.numbers.winterMeasured)} of ${String(story.numbers.winterMonths)}`,
    );
  });

  it("loads no imagery for 1985 or 2005", () => {
    for (const id of ["1985", "2005"]) {
      const s = flow.timeStops.find((x) => x.id === id);
      expect(s?.kind).toBe("missing");
      expect(s?.coverage?.badge).toBe("notLoaded");
    }
  });

  it("matches the place by its name and rejects other places", () => {
    expect(matchPlace(fixture.placeName, fixture)).toBe(true);
    expect(matchPlace(fixture.placeName.toUpperCase(), fixture)).toBe(true);
    expect(matchPlace("Reykjavik", fixture)).toBe(false);
    expect(matchPlace("", fixture)).toBe(false);
  });

  it("includes the 26-season MODIS long record, 5 layer sheets, 5 branches, and trace log", () => {
    expect(flow.layerStack).toHaveLength(5);
    expect(flow.restrendStrata[0]?.seasons).toHaveLength(26);
    expect(flow.driestYears).toEqual([2001, 2016, 2023, 2024]);
    expect(flow.branchNodes).toHaveLength(5);
    expect(flow.traceRecords.length).toBeGreaterThanOrEqual(6);
  });
});
