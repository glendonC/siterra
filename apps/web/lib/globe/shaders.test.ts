import { describe, expect, it } from "vitest";
import { GLOBE_FS, vec3 } from "./shaders";

describe("globe palette", () => {
  it("turns tokens into the same vec3 values the approved study wrote by hand", () => {
    expect(vec3("#f2efea")).toBe("vec3(0.949, 0.937, 0.918)");
    expect(vec3("#2b2925")).toBe("vec3(0.169, 0.161, 0.145)");
    expect(vec3("#6b6762")).toBe("vec3(0.420, 0.404, 0.384)");
    expect(vec3("#788693")).toBe("vec3(0.471, 0.525, 0.576)");
    expect(vec3("#dcd4c9")).toBe("vec3(0.863, 0.831, 0.788)");
  });

  it("puts the palette into the globe shader", () => {
    expect(GLOBE_FS).toContain("const vec3 PAPER = vec3(0.949, 0.937, 0.918)");
    expect(GLOBE_FS.startsWith("#version 300 es")).toBe(true);
  });

  it("refuses a colour that is not #rrggbb", () => {
    expect(() => vec3("rgba(0, 0, 0, 1)")).toThrow();
  });
});
