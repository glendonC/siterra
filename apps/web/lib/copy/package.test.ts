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
    expect(pformat("brief.state", { state: pkg["package.status.ready_for_review"].text })).toBe(
      "Ready for review. Nothing has been sent, scheduled or authorized.",
    );
    expect(pformat("brief.state")).toBe("{state}. Nothing has been sent, scheduled or authorized.");
  });

  it("says nothing is sent, scheduled or authorized in one string only, the brief's head", () => {
    const saying = entries
      .filter(([, m]) => /\b(?:sent|scheduled|authori[sz]ed)\b/i.test(m.text))
      .map(([id]) => id);
    expect(saying).toEqual(["brief.state"]);
  });

  it("shows no record vocabulary: no revision, package, claim kind or file name", () => {
    const internal = entries
      .filter(([, m]) =>
        /\b(?:revision|package|fixture|replay|recorded|claim kind|model estimate)\b|\.pdf\b/i.test(
          m.text,
        ),
      )
      .map(([id]) => id);
    expect(internal).toEqual([]);
  });
});
