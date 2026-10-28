import { describe, expect, it } from "vitest";
import { primaryHint } from "./hints";

describe("primaryHint", () => {
  it("starts the investigation at arrival and stops it while it runs", () => {
    expect(primaryHint({ commissioned: false, running: false })).toBe("arrival.start");
    expect(primaryHint({ commissioned: true, running: true })).toBe("work.stop");
  });

  it("shows no hint once the request completes, since ↵ would do nothing until the next beat", () => {
    expect(primaryHint({ commissioned: true, running: false })).toBeUndefined();
  });
});
