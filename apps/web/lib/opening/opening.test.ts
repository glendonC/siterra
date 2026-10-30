import { CaseSnapshot } from "@siterra/contracts";
import { describe, expect, it } from "vitest";
import seed from "../../../../packages/contracts/fixtures/case-snapshot-aitbouguemez-seed.json";
import { en } from "../copy/en";
import { openingCopy } from "./opening";

const snapshot = CaseSnapshot.parse(seed);

describe("openingCopy", () => {
  const c = openingCopy(snapshot.case.objective);

  it("asks the case's own question, from its record", () => {
    expect(c.question).toBe(snapshot.case.objective);
    expect(openingCopy("Is the spring line moving?").question).toBe("Is the spring line moving?");
  });

  it("says in one sentence what Siterra does, and offers one action into the valley", () => {
    expect(c.what.split(/(?<=\.)\s/)).toHaveLength(1);
    expect(c.action).toBe("Explore the Valley");
  });

  it("keeps how it works behind its button, in words that claim no person reviews the results", () => {
    expect(c.howButton).toBe("How It Works");
    expect(c.how).toBe(
      "Meta Muse Spark plans the tasks and reads published sources. Code computes every number, checks every quote against its source and marks what it could not check. Siterra sends, spends and decides nothing.",
    );
    expect(c.how).not.toMatch(/reviews?/i);
  });

  it("names no place and no internal name itself", () => {
    for (const id of [
      "opening.what",
      "opening.how",
      "opening.action",
      "opening.howButton",
    ] as const)
      expect(en[id].text).not.toMatch(
        /Bouguemez|Atlas|Morocco|Region Pack|Five Stages|Scope & Baseline/,
      );
  });
});
