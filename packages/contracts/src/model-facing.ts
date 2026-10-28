// Model-facing schemas: the structured final outputs and tool arguments sent to the Meta model.
// Exported with z.toJSONSchema under the strict subset in
// docs/architecture/02-architecture-constraints.md (model platform) and
// docs/reference/data-contracts.md: root is a plain object, no oneOf or allOf anywhere, anyOf only
// below the root, every object closed with every property required (nullable by type union), no
// recursion, depth at most 10. Length, count and pattern limits stay in host validation, because
// the subset does not promise to honor them.
import { z } from "zod";

export const maxModelSchemaDepth = 10;

type JsonSchema = { [key: string]: unknown };

function isObject(value: unknown): value is JsonSchema {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Lists every way a JSON Schema leaves the strict subset; empty when it fits. */
export function strictSubsetIssues(schema: JsonSchema): string[] {
  const issues: string[] = [];
  if (schema["type"] !== "object" || !isObject(schema["properties"])) {
    issues.push("#: the root must be a plain object with properties");
  }
  if ("anyOf" in schema) {
    issues.push("#: anyOf is not allowed at the root");
  }
  const visit = (node: unknown, path: string, depth: number): void => {
    if (!isObject(node)) {
      return;
    }
    if (depth > maxModelSchemaDepth) {
      issues.push(`${path}: deeper than ${maxModelSchemaDepth} levels`);
      return;
    }
    for (const keyword of ["oneOf", "allOf", "$ref", "$defs", "definitions", "not", "if"]) {
      if (keyword in node) {
        issues.push(`${path}: ${keyword} is not allowed`);
      }
    }
    const properties = node["properties"];
    if (node["type"] === "object" || isObject(properties)) {
      if (node["additionalProperties"] !== false) {
        issues.push(`${path}: every object must set additionalProperties to false`);
      }
      const keys = isObject(properties) ? Object.keys(properties) : [];
      const required = Array.isArray(node["required"]) ? (node["required"] as unknown[]) : [];
      for (const key of keys) {
        if (!required.includes(key)) {
          issues.push(`${path}/properties/${key}: every property must be required (use nullable)`);
        }
      }
      for (const key of keys) {
        visit((properties as JsonSchema)[key], `${path}/properties/${key}`, depth + 1);
      }
    }
    if ("items" in node) {
      visit(node["items"], `${path}/items`, depth + 1);
    }
    if (Array.isArray(node["anyOf"])) {
      (node["anyOf"] as unknown[]).forEach((branch, i) => {
        visit(branch, `${path}/anyOf/${i}`, depth);
      });
    }
  };
  visit(schema, "#", 1);
  return issues;
}

/** Drops keywords that carry no constraint for the model: the dialect and the safe-integer bounds. */
function stripNoise(node: unknown): unknown {
  if (Array.isArray(node)) {
    return node.map(stripNoise);
  }
  if (!isObject(node)) {
    return node;
  }
  const out: JsonSchema = {};
  for (const [key, value] of Object.entries(node)) {
    if (key === "$schema") continue;
    if (key === "minimum" && value === Number.MIN_SAFE_INTEGER) continue;
    if (key === "maximum" && value === Number.MAX_SAFE_INTEGER) continue;
    out[key] = stripNoise(value);
  }
  return out;
}

/** Exports a model-facing Zod schema as JSON Schema, or throws listing every strict-subset issue. */
export function toModelJsonSchema(schema: z.ZodType): JsonSchema {
  const exported = z.toJSONSchema(schema, {
    target: "draft-2020-12",
    cycles: "throw",
    reused: "inline",
    io: "output",
    unrepresentable: "throw",
  });
  const json = stripNoise(exported) as JsonSchema;
  const issues = strictSubsetIssues(json);
  if (issues.length > 0) {
    throw new Error(`Model-facing schema leaves the strict subset:\n${issues.join("\n")}`);
  }
  return json;
}

/** Task kinds the planner may propose; plan and validation tasks are created by host code. */
export const plannableTaskKinds = [
  "source_research",
  "observation_analysis",
  "livelihood_governance",
  "hypothesis_comparison",
  "intervention_feasibility",
  "brief_package",
] as const;

/**
 * propose_plan: the plan task's structured final output (docs/reference/data-contracts.md, tool
 * argument contracts). Host validation adds the limits: at most eight tasks, unique keys,
 * dependsOn naming keys in the same plan, inputRefs naming existing entity versions.
 */
export const ProposePlan = z.strictObject({
  interpretation: z.string(),
  tasks: z.array(
    z.strictObject({
      key: z.string(),
      kind: z.enum(plannableTaskKinds),
      question: z.string(),
      dependsOn: z.array(z.string()),
      inputRefs: z.array(z.strictObject({ entityId: z.string(), revision: z.int() })),
    }),
  ),
  clarifyingQuestion: z.string().nullable(),
});
export type ProposePlan = z.infer<typeof ProposePlan>;

/**
 * propose_evidence: the evidence task's structured final output (data-contracts.md, tool argument
 * contracts). The claim kind keeps all seven values so verified_outcome is refused by the claim
 * rules with a clear reason, not by the schema. Host validation adds the limits: at most 10 items,
 * a statement of at most 600 characters, an excerpt of at most 300 code points, at most 5
 * limitations; a PDF locator is "page N", the 1-based page of the stored file.
 */
export const ProposeEvidence = z.strictObject({
  items: z.array(
    z.strictObject({
      statement: z.string(),
      claimKind: z.enum([
        "observation",
        "scientific_context",
        "hypothesis",
        "model_estimate",
        "scenario",
        "field_requirement",
        "verified_outcome",
      ]),
      measurementIds: z.array(z.string()),
      sourceId: z.string().nullable(),
      locator: z.string().nullable(),
      excerpt: z.string().nullable(),
      scopeNote: z.string(),
      limitations: z.array(z.string()),
    }),
  ),
});
export type ProposeEvidence = z.infer<typeof ProposeEvidence>;
