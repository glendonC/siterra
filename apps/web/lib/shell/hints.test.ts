import { describe, expect, it } from "vitest";
import { primaryHint, stopHint } from "./hints";

describe("primaryHint", () => {
  it("starts the investigation at arrival", () => {
    expect(primaryHint({ commissioned: false, running: false })).toBe("arrival.start");
  });

  it("gives ↵ no job while a request runs, so Enter cannot stop it by accident", () => {
    expect(primaryHint({ commissioned: true, running: true })).toBeUndefined();
  });

  it("shows no hint once the request completes, since ↵ would do nothing until the next beat", () => {
    expect(primaryHint({ commissioned: true, running: false })).toBeUndefined();
  });
});

describe("stopHint", () => {
  it("offers Esc to stop only while a request runs", () => {
    expect(stopHint({ running: true })).toBe("work.stop");
    expect(stopHint({ running: false })).toBeUndefined();
  });
});
