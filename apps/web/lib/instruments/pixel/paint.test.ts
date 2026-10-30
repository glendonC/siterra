import { describe, expect, it } from "vitest";
import { pixelColours as C } from "../../theme/obsidian";
import { cellColour } from "./paint";

describe("cellColour (U27)", () => {
  const cell = { rgb: [255, 0, 51] as const, ndvi: 0.45, cls: 30 };

  it("paints the true colour composite as 0 to 1 RGB", () => {
    expect(cellColour("rgb", cell)).toEqual([1, 0, 0.2]);
  });

  it("paints NDVI in the anatomy's steps, and a cell without a value as no value", () => {
    expect(cellColour("ndvi", cell)).toBe(C.ndviSteps[4]);
    expect(cellColour("ndvi", { ...cell, ndvi: 0.05 })).toBe(C.ndviSteps[0]);
    expect(cellColour("ndvi", { ...cell, ndvi: null })).toBe(C.noValue);
  });

  it("paints the WorldCover class, and an unknown class as other", () => {
    expect(cellColour("class", cell)).toBe(C.classes[30]);
    expect(cellColour("class", { ...cell, cls: 95 })).toBe(C.otherClass);
  });
});
