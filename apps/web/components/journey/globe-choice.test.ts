import { describe, expect, it } from "vitest";
import { cardQuestion } from "./globe-choice";

describe("the globe card", () => {
  const q = "Is grazing changing the shared pastures of the Aït Bouguemez valley?";

  it("shows no question while the place is being chosen (step 1)", () => {
    expect(cardQuestion(1, q)).toBeNull();
  });

  it("shows the live question from step 2", () => {
    expect(cardQuestion(2, q)).toBe(q);
    expect(cardQuestion(2, "  ")).toBeNull();
  });
});
