import { describe, expect, it } from "vitest";
import { en } from "../copy/en";
import { BEATS, OPENING_START, splitSentences, stepOpening } from "./beats";

describe("BEATS", () => {
  it("keeps every approved sentence word for word", () => {
    for (const b of BEATS) expect(b.parts.map((p) => p.text).join(" ")).toBe(en[b.id].text);
  });

  it("puts the claim in ink and the qualifier in grey; beat 4 leads with grey", () => {
    expect(BEATS.map((b) => b.parts.map((p) => p.tone))).toEqual([
      ["ink"],
      ["ink", "grey"],
      ["ink", "grey"],
      ["grey", "ink"],
    ]);
  });

  it("gives beats 1 to 3 a source tag and beat 4 none (it is the case)", () => {
    expect(BEATS.map((b) => b.tag ?? null)).toEqual([
      "opening.beat1.tag",
      "opening.beat2.tag",
      "opening.beat3.tag",
      null,
    ]);
  });
});

describe("splitSentences", () => {
  it("does not split inside a number or after a colon", () => {
    expect(splitSentences("A 1917 decree. The first: is it? Yes.")).toEqual([
      "A 1917 decree.",
      "The first: is it?",
      "Yes.",
    ]);
  });
});

describe("stepOpening", () => {
  it("steps through the beats, then shows the action, then opens on a person's next", () => {
    let s = OPENING_START;
    for (const expected of [1, 2, 3]) {
      const n = stepOpening(s, "next");
      if (n === "open") throw new Error("opened early");
      expect(n.beat).toBe(expected);
      s = n;
    }
    const withAction = stepOpening(s, "next");
    expect(withAction).toEqual({ beat: 3, actionShown: true });
    if (withAction === "open") throw new Error("opened early");
    expect(stepOpening(withAction, "next")).toBe("open");
  });

  it("never opens the investigation on the timer", () => {
    expect(stepOpening({ beat: 3, actionShown: true }, "timer")).toEqual({
      beat: 3,
      actionShown: true,
    });
  });

  it("goes back a beat and hides the action", () => {
    expect(stepOpening({ beat: 3, actionShown: true }, "previous")).toEqual({
      beat: 2,
      actionShown: false,
    });
    expect(stepOpening(OPENING_START, "previous")).toEqual(OPENING_START);
  });
});
