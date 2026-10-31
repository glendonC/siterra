import { describe, expect, it } from "vitest";
import { lint } from "./lint";
import { PACKAGE_LINT_ALLOWLIST, pformat, pkg, type PackageMessageId } from "./package";

// The package's words pass the same copy lint as en.ts (VC-06) and name no place (decision 10).
describe("package catalog", () => {
  const entries = Object.entries(pkg) as [PackageMessageId, (typeof pkg)[PackageMessageId]][];

  it.each(entries)("%s passes the copy lint", (id, msg) => {
    const allowed = new Set(PACKAGE_LINT_ALLOWLIST[id]?.rules ?? []);
    expect(lint(msg.text, msg.kind).filter((f) => !allowed.has(f.id))).toEqual([]);
  });

  it("allowlists only rules a string actually breaks, with a reason", () => {
    for (const [id, entry] of Object.entries(PACKAGE_LINT_ALLOWLIST) as [
      PackageMessageId,
      { rules: string[]; reason: string },
    ][]) {
      const found = new Set(lint(pkg[id].text, pkg[id].kind).map((f) => f.id));
      expect(entry.reason.length).toBeGreaterThan(20);
      for (const rule of entry.rules)
        expect(found, `${id} no longer breaks ${rule}`).toContain(rule);
    }
  });

  it("names no place: every place word comes from a record field", () => {
    const named = entries
      .filter(([, m]) =>
        /valley|bouguemez|tabant|ouchi|aït|high atlas|atlas mountains|morocco/i.test(m.text),
      )
      .map(([id]) => id);
    expect(named).toEqual([]);
  });

  it("fills placeholders and leaves a missing one visible", () => {
    expect(pformat("package.revision", { n: 3 })).toBe("Prepared on case revision 3");
    expect(pformat("package.revision")).toBe("Prepared on case revision {n}");
  });
});
