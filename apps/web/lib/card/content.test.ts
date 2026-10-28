import { describe, expect, it } from "vitest";
import { countWords, LIMITS } from "../budget/measure";
import { cardLines, type CardContent } from "./content";

// The challenge card of the approved hero (DESIGN B u07), as a shape test. Values are the hero's, from the
// validated season summary (650 mm and 349 mm for 2021/22 and 2022/23).
const challenge: CardContent = {
  question: "Is grazing changing the shared pastures of the Aït Bouguemez valley?",
  branch: "Could drought explain this instead?",
  status: "Simulated answer.",
  statement: { claim: "Rainfall fell from the upper third, 650 mm, to the lower third, 349 mm." },
  sources: ["CHIRPS v3.0, 1991 to 2020"],
  meaning: "Meaning: a dry season. Not evidence about grazing.",
  recordIds: ["fixture"],
};

describe("cardLines", () => {
  it("lists what the reader sees in card order", () => {
    expect(cardLines(challenge)).toEqual([
      "Is grazing changing the shared pastures of the Aït Bouguemez valley?",
      "Could drought explain this instead?",
      "Simulated answer.",
      "Rainfall fell from the upper third, 650 mm, to the lower third, 349 mm.",
      "CHIRPS v3.0, 1991 to 2020",
      "Meaning: a dry season. Not evidence about grazing.",
    ]);
  });

  it("joins the two tones and the figure into single lines", () => {
    const lines = cardLines({
      statement: {
        claim: "Grazing: cannot be assessed with current data.",
        limit: "April vegetation stayed close.",
      },
      figure: {
        label: "Wet season 2022/23",
        value: "349",
        unit: "mm",
        context: "Lower third of 1991 to 2020",
      },
      sources: [],
      recordIds: [],
    });
    expect(lines).toEqual([
      "Grazing: cannot be assessed with current data. April vegetation stayed close.",
      "Wet season 2022/23 349 mm Lower third of 1991 to 2020",
    ]);
  });

  it("keeps the hero's challenge card within 45 words, as DESIGN B counted it", () => {
    const words = cardLines(challenge).reduce((s, l) => s + countWords(l), 0);
    expect(words).toBe(45);
    expect(words).toBeLessThanOrEqual(LIMITS.cardWords);
  });
});
