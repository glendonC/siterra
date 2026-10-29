import { describe, expect, it } from "vitest";
import { carryQuestion, takeQuestion } from "./handoff";

class MemoryStore {
  private m = new Map<string, string>();
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
}

describe("the question carried from an instrument to the valley", () => {
  it("is taken once, trimmed, and then gone", () => {
    const store = new MemoryStore();
    carryQuestion("  Is the valley floor greener?  ", store);
    expect(takeQuestion(store)).toBe("Is the valley floor greener?");
    expect(takeQuestion(store)).toBeNull();
  });

  it("carries nothing for an empty line", () => {
    const store = new MemoryStore();
    carryQuestion("   ", store);
    expect(takeQuestion(store)).toBeNull();
  });

  it("does nothing when the browser keeps no storage", () => {
    expect(() => {
      carryQuestion("x", null);
    }).not.toThrow();
    expect(takeQuestion(null)).toBeNull();
  });
});
