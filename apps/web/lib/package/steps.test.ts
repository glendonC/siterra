import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { seed } from "../instruments/seed-listing";
import { withSyntheticPackage, type RecordedRun } from "./fixtures/synthetic";
import { packageView } from "./package";
import { CARD_LINES, CARD_WORDS, nextOf, pagesOf, previousOf, stepsOf, words } from "./steps";

const run = (
  JSON.parse(
    readFileSync(
      join(
        import.meta.dirname,
        "..",
        "..",
        "..",
        "..",
        "packages",
        "contracts",
        "fixtures",
        "recorded-live-run-2026-10-28-branch-merge.json",
      ),
      "utf8",
    ),
  ) as { records: RecordedRun }
).records;
const fx = withSyntheticPackage(seed, run);
const view = packageView(fx.snapshot, fx.briefId);
if (!view) throw new Error("no view");

const line = (n: number) => ({
  text: Array.from({ length: n }, (_, i) => `w${String(i)}`).join(" "),
  chips: [],
});

describe("pagesOf", () => {
  it("packs lines under the card's budget, in order", () => {
    // three lines fit a card when their words do; a fourth starts the next page
    const n = Math.floor(CARD_WORDS / 3);
    const pages = pagesOf([line(n), line(n), line(n), line(n)]);
    expect(pages.map((p) => (p.kind === "lines" ? p.lines.length : 0))).toEqual([3, 1]);
  });

  it("starts a new page when the words would pass the budget", () => {
    const pages = pagesOf([line(CARD_WORDS - 4), line(8)]);
    expect(pages).toHaveLength(2);
  });

  it("keeps a line longer than the budget whole, on its own page", () => {
    const pages = pagesOf([line(5), line(50), line(5)]);
    expect(pages.map((p) => (p.kind === "lines" ? p.lines.map((l) => words(l.text)) : []))).toEqual(
      [[5], [50], [5]],
    );
  });
});

describe("stepsOf", () => {
  const steps = stepsOf(view);

  it("gives the five steps in the briefing's order", () => {
    expect(steps.map((s) => s.id)).toEqual(["known", "open", "checks", "responses", "approve"]);
  });

  it("keeps every lines page within three lines and the word budget, unless one line is longer alone", () => {
    for (const s of steps)
      for (const p of s.pages)
        if (p.kind === "lines") {
          expect(p.lines.length).toBeLessThanOrEqual(CARD_LINES);
          const n = p.lines.reduce((a, l) => a + words(l.text), 0);
          if (p.lines.length > 1) expect(n).toBeLessThanOrEqual(CARD_WORDS);
        }
  });

  it("gives each field check its own page and the responses side by side", () => {
    const checks = steps.find((s) => s.id === "checks");
    expect(checks?.pages.map((p) => (p.kind === "check" ? p.measure : -1))).toEqual([0, 1]);
    const r = steps.find((s) => s.id === "responses")?.pages[0];
    expect(r?.kind === "responses" ? r.responses.length : 0).toBe(3);
  });

  it("loses no record line: every known, open and approval line is on some page", () => {
    const shown = steps.flatMap((s) =>
      s.pages.flatMap((p) => (p.kind === "lines" ? p.lines.map((l) => l.text) : [])),
    );
    for (const l of [...view.known, ...view.uncertain, ...view.authorization])
      expect(shown).toContain(l.text);
  });
});

describe("the stepper", () => {
  const steps = stepsOf(view);
  it("walks every page forward and back to where it began", () => {
    let c = { step: 0, page: 0 };
    let n = 1;
    for (;;) {
      const d = nextOf(steps, c);
      if (d.step === c.step && d.page === c.page) break;
      c = d;
      n++;
    }
    expect(n).toBe(steps.reduce((a, s) => a + s.pages.length, 0));
    for (let i = 1; i < n; i++) c = previousOf(steps, c);
    expect(c).toEqual({ step: 0, page: 0 });
    expect(previousOf(steps, c)).toEqual(c);
  });
});
