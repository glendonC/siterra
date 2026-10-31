import { describe, expect, it } from "vitest";
import { clockAt, restOn } from "./clock";

describe("clockAt", () => {
  it("shows measured values on a month's centre outside the blend months", () => {
    const c = clockAt(17, 2000, 26); // June 2001
    expect(c.monthId).toBe("2001-06");
    expect(c.season).toBe(1);
    expect(c.blend).toBe(0);
    expect(c.measured).toBe(true);
  });

  it("is blended between month centres and over a year's last two months", () => {
    expect(clockAt(17.5, 2000, 26).measured).toBe(false);
    const nov = clockAt(22, 2000, 26); // November 2001
    expect(nov.blend).toBeGreaterThan(0);
    expect(nov.measured).toBe(false);
    expect(clockAt(23, 2000, 26).blend).toBeGreaterThan(nov.blend);
  });

  it("never blends past the last season and stops at its December", () => {
    const end = clockAt(10_000, 2000, 26);
    expect(end.monthId).toBe("2025-12");
    expect(end.blend).toBe(0);
    expect(end.next).toBe(25);
  });

  it("rests a paused playhead on the nearest month's centre", () => {
    expect(restOn(16.4)).toBe(16);
    expect(clockAt(restOn(16.6), 2000, 26).measured).toBe(true);
  });
});
