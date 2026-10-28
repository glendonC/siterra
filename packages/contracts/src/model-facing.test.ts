import { describe, expect, it } from "vitest";
import { z } from "zod";
import { Evidence } from "./case.ts";
import {
  ProposeEvidence,
  ProposePlan,
  strictSubsetIssues,
  toModelJsonSchema,
} from "./model-facing.ts";

describe("contract: model-facing schemas fit the strict subset", () => {
  it("propose_plan exports inside the subset", () => {
    const json = toModelJsonSchema(ProposePlan);
    expect(json["type"]).toBe("object");
    expect(json["additionalProperties"]).toBe(false);
    expect(json["required"]).toEqual(["interpretation", "tasks", "clarifyingQuestion"]);
    expect(JSON.stringify(json)).not.toContain("$schema");
    expect(JSON.stringify(json)).not.toContain(String(Number.MAX_SAFE_INTEGER));
  });

  it("rejects an optional property", () => {
    expect(() => toModelJsonSchema(z.strictObject({ a: z.string().optional() }))).toThrow(
      /must be required/,
    );
  });

  it("rejects an open object", () => {
    expect(() => toModelJsonSchema(z.looseObject({ a: z.string() }))).toThrow(
      /additionalProperties/,
    );
  });

  it("rejects a union at the root", () => {
    const root = z.union([z.strictObject({ a: z.string() }), z.strictObject({ b: z.string() })]);
    expect(() => toModelJsonSchema(root)).toThrow(/root/);
  });

  it("rejects recursion", () => {
    type Node = { child: Node | null };
    const node: z.ZodType<Node> = z.lazy(() => z.strictObject({ child: node.nullable() }));
    expect(() => toModelJsonSchema(z.strictObject({ root: node }))).toThrow();
  });

  it("rejects oneOf below the root and depth over 10", () => {
    expect(
      strictSubsetIssues({
        type: "object",
        additionalProperties: false,
        required: ["a"],
        properties: { a: { oneOf: [{ type: "string" }, { type: "number" }] } },
      }),
    ).toContain("#/properties/a: oneOf is not allowed");
    let deep: z.ZodType = z.string();
    for (let i = 0; i < 11; i += 1) {
      deep = z.strictObject({ x: deep });
    }
    expect(() => toModelJsonSchema(deep)).toThrow(/deeper than 10/);
  });
});

describe("contract: propose_evidence", () => {
  it("exports inside the strict subset with every item property required", () => {
    const json = toModelJsonSchema(ProposeEvidence);
    const items = ((json["properties"] as Record<string, Record<string, unknown>>)["items"] ?? {})[
      "items"
    ] as Record<string, unknown>;
    expect(items["required"]).toEqual([
      "statement",
      "claimKind",
      "measurementIds",
      "sourceId",
      "locator",
      "excerpt",
      "scopeNote",
      "limitations",
    ]);
  });

  it("offers exactly the claim kinds of the Evidence record", () => {
    const item = ProposeEvidence.shape.items.element;
    expect(item.shape.claimKind.options).toEqual(Evidence.shape.claimKind.options);
  });
});
