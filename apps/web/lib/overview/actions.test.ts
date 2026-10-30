import { describe, expect, it } from "vitest";
import { actionForKey, actionsFor, type ViewKind } from "./actions";

const ALL = new Set<ViewKind>(["layers", "cutaway", "pixel", "rainfall", "field"]);

describe("actionsFor (decision 15)", () => {
  it("puts the thing's own view on Enter, one lettered view after it, and Back last", () => {
    expect(actionsFor("band", ALL, true).map((a) => `${a.key} ${a.view ?? "back"}`)).toEqual([
      "Enter cutaway",
      "L layers",
      "Esc back",
    ]);
  });

  it("offers only what the record holds ready, and Enter is always the first offered view", () => {
    const noCut = new Set<ViewKind>(["layers", "pixel"]);
    expect(actionsFor("band", noCut, false).map((a) => `${a.key} ${a.view ?? "back"}`)).toEqual([
      "Enter layers",
    ]);
    expect(actionsFor("route", new Set<ViewKind>(), true).map((a) => a.key)).toEqual(["Esc"]);
  });

  it("never lists more than three actions", () => {
    for (const t of [
      "catchment",
      "fdr",
      "band",
      "pixel",
      "rain",
      "field",
      "routes",
      "results",
      "land",
      "route",
    ] as const)
      expect(actionsFor(t, ALL, true).length).toBeLessThanOrEqual(3);
  });

  it("finds an action by its key, in either case, and never Back", () => {
    const list = actionsFor("land", ALL, true);
    expect(actionForKey(list, "Enter")?.view).toBe("layers");
    expect(actionForKey(list, "c")?.view).toBe("cutaway");
    expect(actionForKey(list, "Escape")).toBeNull();
    expect(actionForKey(list, "P")).toBeNull();
  });
});
