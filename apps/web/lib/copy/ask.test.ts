import { describe, expect, it } from "vitest";
import { ak, type AskMessageId } from "./ask";
import { lint } from "./lint";

// The words of a question asked from the Ask pass the same copy lint as en.ts (VC-06), with no allowlist, name no
// place, use none of the record's own vocabulary (R1) and say why a question was not answered in one grammar (R3).
describe("ask catalog", () => {
  const entries = Object.entries(ak) as [AskMessageId, (typeof ak)[AskMessageId]][];

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

  it("shows no record vocabulary, no failure code and no raw identifier", () => {
    const record =
      /merge|status|branch|stale|revision|proposed|recorded|replay|composite|claim|model estimate|false discovery|failure|code|task|command|request|_/i;
    expect(entries.filter(([, m]) => record.test(m.text)).map(([id]) => id)).toEqual([]);
  });

  it("says why a question was not answered as one sentence in one grammar", () => {
    const stopped = entries.filter(([id]) => id.startsWith("ask.stopped."));
    expect(stopped.length).toBeGreaterThan(0);
    for (const [id, m] of stopped) {
      expect(m.text, id).toMatch(/^Could not answer: [a-z][^.?!]*\.$/);
    }
  });

  it("names the key that asks again by what it does", () => {
    expect(ak["ask.key.again"]).toEqual({ text: "Ask Again", kind: "button" });
  });
});
