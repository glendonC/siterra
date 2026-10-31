import { describe, expect, it } from "vitest";
import { lint } from "./lint";
import { tm, type TimeMessageId } from "./time";

describe("time catalog", () => {
  const entries = Object.entries(tm) as [TimeMessageId, (typeof tm)[TimeMessageId]][];
  it.each(entries)("%s passes the copy lint", (_id, msg) => {
    expect(lint(msg.text, msg.kind)).toEqual([]);
  });
  it("names no place and no forbidden word of the pixel seasons bundle", () => {
    for (const [, m] of entries) {
      expect(m.text).not.toMatch(/valley|bouguemez|tabant|calaveras|morocco|california/i);
      expect(m.text).not.toMatch(/drought|significant|recovery|forecast|decline|degradation/i);
    }
  });
});
