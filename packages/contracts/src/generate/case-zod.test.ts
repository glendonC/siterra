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

describe("the generator switches a oneOf on the const field its branches share", () => {
  const record = (name: string, fixed: Record<string, string>) => ({
    type: "object",
    properties: {
      ...Object.fromEntries(Object.entries(fixed).map(([key, value]) => [key, { const: value }])),
      [`${name}Size`]: { type: "string", pattern: "^s" },
    },
    required: [...Object.keys(fixed), `${name}Size`],
    additionalProperties: false,
  });
  const schemaWith = (square: Record<string, string>, circle: Record<string, string>) => ({
    $id: "https://example.invalid/shapes.schema.json",
    oneOf: [{ $ref: "#/$defs/Command" }],
    $defs: {
      Command: {
        type: "object",
        properties: { schemaVersion: { enum: ["1.0.0"] } },
        additionalProperties: false,
      },
      Square: record("square", square),
      Circle: record("circle", circle),
      Shape: { oneOf: [{ $ref: "#/$defs/Square" }, { $ref: "#/$defs/Circle" }] },
    },
  });

  it("uses kind when kind is the shared const, and recordType when that is", () => {
    expect(generateCaseSource(schemaWith({ kind: "square" }, { kind: "circle" }))).toContain(
      'export const Shape = z.discriminatedUnion("kind", [Square, Circle]);',
    );
    expect(
      generateCaseSource(schemaWith({ recordType: "Square" }, { recordType: "Circle" })),
    ).toContain('export const Shape = z.discriminatedUnion("recordType", [Square, Circle]);');
  });

  it("ignores a const only some of the branches have", () => {
    const source = generateCaseSource(
      schemaWith({ kind: "square", sides: "four" }, { kind: "circle" }),
    );
    expect(source).toContain('z.discriminatedUnion("kind", [Square, Circle])');
  });

  it("refuses branches that share no const property", () => {
    expect(() => generateCaseSource(schemaWith({ kind: "square" }, { form: "circle" }))).toThrow(
      /share exactly one const property, found \[\]/,
    );
  });

  it("refuses branches that share more than one", () => {
    expect(() =>
      generateCaseSource(
        schemaWith({ kind: "square", unit: "cm" }, { kind: "circle", unit: "cm" }),
      ),
    ).toThrow(/share exactly one const property, found \["kind","unit"\]/);
  });
});
