import { describe, expect, it } from "vitest";
import { distanceShown, lf, lifeTerm, type LifeMessageId } from "./life";
import { lint } from "./lint";

describe("life catalog", () => {
  const entries = Object.entries(lf) as [LifeMessageId, (typeof lf)[LifeMessageId]][];
  it.each(entries)("%s passes the copy lint", (_id, msg) => {
    expect(lint(msg.text, msg.kind)).toEqual([]);
  });
  it("names no place and never claims presence, abundance, change or a season", () => {
    for (const [id, m] of entries) {
      expect(m.text).not.toMatch(/valley|bouguemez|tabant|calaveras|morocco|california/i);
      expect(m.text).not.toMatch(/decline|increase|trend|season|common|rare|abundant/i);
      if (id !== "life.limit") expect(m.text).not.toMatch(/presence|abundance/i);
    }
  });
  it("says a record's basis and licence in words, keeping an unknown code as the record gives it", () => {
    expect(lifeTerm("basis", "HUMAN_OBSERVATION")).toBe("Human observation");
    expect(lifeTerm("license", "CC0-1.0")).toBe("CC0 1.0");
    expect(lifeTerm("basis", "SOMETHING_NEW")).toBe("SOMETHING_NEW");
  });
  it("says a stated uncertainty in metres under a kilometre, else km to one decimal", () => {
    expect(distanceShown(30)).toBe("30 m");
    expect(distanceShown(1500)).toBe("1.5 km");
    expect(distanceShown(12_000)).toBe("12 km");
  });
});
