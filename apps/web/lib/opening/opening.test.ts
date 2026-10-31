import { describe, expect, it } from "vitest";
import { en } from "../copy/en";
import { openingCopy } from "./opening";

describe("openingCopy", () => {
  const c = openingCopy();

  it("says what Siterra does with its subline, and offers one action: choosing a place", () => {
    expect(c.what).toBe("Environmental intelligence, put to work.");
    expect(c.subline).toBe(
      "Give an environmental problem to an AI team. It checks 25 years of satellite records, tests every cause, and hands back a field plan.",
    );
    expect(c.action).toBe("Choose a Place");
  });

  it("keeps how it works behind its button, in words that claim no person reviews the results", () => {
    expect(c.howButton).toBe("How It Works");
    expect(c.how).toBe(
      "Meta Muse Spark plans the tasks and reads published sources. Code computes every number, checks every quote against its source and marks what it could not check. Siterra sends, spends and decides nothing.",
    );
    expect(c.how).not.toMatch(/reviews?/i);
  });

  it("names no place, no case and no internal name: places come only from records", () => {
    for (const id of [
      "opening.what",
      "opening.subline",
      "opening.how",
      "opening.action",
      "opening.howButton",
    ] as const)
      expect(en[id].text).not.toMatch(
        /valley|Bouguemez|Tabant|Atlas|Morocco|Region Pack|Five Stages|Scope & Baseline/i,
      );
  });
});
