import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { generateCaseSource } from "./case-zod.ts";
import { formatCaseSource } from "./format.ts";

describe("contract: src/case.ts is generated from case.schema.json", () => {
  it("matches what the generator writes today", async () => {
    const schema: unknown = JSON.parse(
      readFileSync(new URL("../../../../schemas/case.schema.json", import.meta.url), "utf8"),
    );
    const expected = await formatCaseSource(generateCaseSource(schema));
    expect(readFileSync(new URL("../case.ts", import.meta.url), "utf8")).toBe(expected);
  });

  it("refuses a keyword it does not handle", () => {
    expect(() =>
      generateCaseSource({ $id: "x", oneOf: [], $defs: { A: { type: "object", not: {} } } }),
    ).toThrow(/Unhandled keywords not/);
  });
});
