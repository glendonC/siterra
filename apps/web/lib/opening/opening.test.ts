import { CaseSnapshot } from "@siterra/contracts";
import { describe, expect, it } from "vitest";
import seed from "../../../../packages/contracts/fixtures/case-snapshot-aitbouguemez-seed.json";
import { en } from "../copy/en";
import { openingCopy } from "./opening";

const snapshot = CaseSnapshot.parse(seed);

describe("openingCopy", () => {
  const c = openingCopy(snapshot.case.objective);

  it("says what Siterra is and names the Meta model its agents use", () => {
    expect(c.title).toBe("Siterra");
    expect(c.what).toBe(en["opening.what"].text);
    expect(c.how).toContain("Muse Spark");
  });

  it("names the engine's five stages in order", () => {
    expect(c.stagesLabel).toBe("Five Stages");
    expect(c.stages).toEqual([
      "Scope & Baseline",
      "Evidence",
      "Hypothesis Testing",
      "Interventions & Precedents",
      "Field Verification",
    ]);
  });

  it("asks the case's own question, from its record, under a Question label", () => {
    expect(c.questionLabel).toBe("Question");
    expect(c.question).toBe(snapshot.case.objective);
    expect(openingCopy("Is the spring line moving?").question).toBe("Is the spring line moving?");
  });

  it("names no place itself: the place comes with the case question", () => {
    for (const id of ["opening.what", "opening.how", "opening.question"] as const)
      expect(en[id].text).not.toMatch(/Bouguemez|Atlas|Morocco/);
  });

  it("offers one action into the globe and a skip link to the map", () => {
    expect(c.action).toBe(en["opening.action"].text);
    expect(c.skip).toBe(en["opening.skip"].text);
  });
});
