import { describe, expect, it } from "vitest";
import { en } from "./en";

// Decision 10 (30 Oct 2026): no place is written into the interface. Place names, regions and area labels reach the
// screen only through record fields (placeholders such as {place}); no catalog text names a place itself.

describe("the catalog", () => {
  it("names no place: every place word comes from a record field", () => {
    const named = Object.entries(en)
      .filter(([, m]) =>
        /valley|bouguemez|tabant|ouchi|aït|high atlas|atlas mountains|morocco/i.test(
          m.text.replace(/\{\w+\}/g, ""),
        ),
      )
      .map(([id]) => id);
    expect(named).toEqual([]);
  });
});
