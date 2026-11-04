import { describe, expect, it } from "vitest";
import { lint } from "./lint";
import { lformat, ly, type LayersMessageId } from "./layers";

// The layers' words pass the same copy lint as en.ts (VC-06), with no allowlist, name no place and use none of the
// record's own vocabulary (R1).
describe("layers catalog", () => {
  const entries = Object.entries(ly) as [LayersMessageId, (typeof ly)[LayersMessageId]][];

  it.each(entries)("%s passes the copy lint", (_id, msg) => {
    expect(lint(msg.text, msg.kind)).toEqual([]);
  });

  it("names no place: every place word comes from a record field", () => {
    const named = entries
      .filter(([, m]) =>
        /valley|bouguemez|tabant|ouchi|aït|high atlas|atlas mountains|morocco|calaveras|california/i.test(
          m.text,
        ),
      )
      .map(([id]) => id);
    expect(named).toEqual([]);
  });

  it("shows no record vocabulary and no raw index", () => {
    const record =
      /merge|status|branch|stale|revision|proposed|recorded|replay|composite|claim|model estimate|false discovery|ndvi|per decade|vertical scale|_/i;
    expect(entries.filter(([, m]) => record.test(m.text)).map(([id]) => id)).toEqual([]);
  });

  it("says no pasture: no record names a band or a class a pasture", () => {
    expect(entries.filter(([, m]) => /pasture|grazing/i.test(m.text)).map(([id]) => id)).toEqual(
      [],
    );
  });

  it("fills placeholders and leaves a missing one visible", () => {
    expect(lformat("layers.what.trend", { window: "March to June" })).toBe(
      "Change in greenness, March to June",
    );
    expect(lformat("layers.what.snow")).toBe("Snow in {month}, by height");
  });
});
