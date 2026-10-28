import { describe, expect, it } from "vitest";
import { LINT_ALLOWLIST, en, format, type MessageId } from "./en";
import { lint } from "./lint";

// VC-06: every interface string passes the error rules; warnings are reviewed and each exception is
// allowlisted by string ID with a written reason.
describe("message catalog (VC-06)", () => {
  const entries = Object.entries(en) as [MessageId, (typeof en)[MessageId]][];

  it.each(entries)("%s passes the copy lint", (id, msg) => {
    const allowed = new Set(LINT_ALLOWLIST[id]?.rules ?? []);
    const findings = lint(msg.text, msg.kind).filter((f) => !allowed.has(f.id));
    expect(findings).toEqual([]);
  });

  it("allowlists only rules a string actually breaks, with a reason", () => {
    for (const [id, entry] of Object.entries(LINT_ALLOWLIST) as [
      MessageId,
      { rules: string[]; reason: string },
    ][]) {
      const found = new Set(lint(en[id].text, en[id].kind).map((f) => f.id));
      expect(entry.reason.length).toBeGreaterThan(20);
      for (const rule of entry.rules)
        expect(found, `${id} no longer breaks ${rule}`).toContain(rule);
    }
  });
});

describe("format", () => {
  it("fills placeholders from values", () => {
    expect(format("arrival.studyArea", { area: "417.0" })).toBe("Valley catchment: 417.0 km²");
  });

  it("leaves a missing placeholder visible", () => {
    expect(format("arrival.studyArea")).toBe("Valley catchment: {area} km²");
  });
});
