import { CaseSnapshot } from "@siterra/contracts";
import { describe, expect, it } from "vitest";
import seed from "../../../../packages/contracts/fixtures/case-snapshot-aitbouguemez-seed.json";
import { en } from "../copy/en";
import { openingCopy } from "./opening";

const snapshot = CaseSnapshot.parse(seed);

describe("openingCopy", () => {
  const c = openingCopy(snapshot.case.objective);

  it("says what Siterra does and names the Meta model its agents use", () => {
    expect(c.what).toBe(en["opening.what"].text);
    expect(c.how).toContain("Muse Spark");
  });

  it("asks the case's own question, from its record", () => {
    expect(c.caseLine).toBe(`This case: ${snapshot.case.objective}`);
    expect(openingCopy("Is the spring line moving?").caseLine).toBe(
      "This case: Is the spring line moving?",
    );
  });

  it("names no place itself: the place comes with the case question", () => {
    for (const id of ["opening.what", "opening.how", "opening.case"] as const)
      expect(en[id].text).not.toMatch(/Bouguemez|Atlas|Morocco/);
  });

  it("offers one action into the globe and a skip link to the map", () => {
    expect(c.action).toBe(en["opening.action"].text);
    expect(c.skip).toBe(en["opening.skip"].text);
  });
});
