import type { JsonSchema } from "./types.ts";

// Meta's strict structured-output subset (TECH-06, docs/reference/data-contracts.md): root is a
// plain object; no oneOf or allOf; anyOf only below the root; every object closed with every
// property required; no recursion; depth at most 10. A schema outside it would be a 400, which
// is never retried, so the adapter refuses to send one.

const MAX_DEPTH = 10;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Returns the subset violations, each with a JSON path. An empty list means the schema fits. */
export function strictSubsetIssues(schema: JsonSchema): string[] {
  const issues: string[] = [];
  if (schema["type"] !== "object") issues.push("$: root must be type object");
  if ("anyOf" in schema) issues.push("$: anyOf is not allowed at the root");

  const walk = (node: unknown, path: string, depth: number): void => {
    if (!isRecord(node)) return;
    if (depth > MAX_DEPTH) {
      issues.push(`${path}: deeper than ${MAX_DEPTH}`);
      return;
    }
    for (const banned of ["oneOf", "allOf", "$ref", "$defs", "definitions"]) {
      if (banned in node) issues.push(`${path}: ${banned} is not allowed`);
    }
    const type = node["type"];
    const isObject = type === "object" || (Array.isArray(type) && type.includes("object"));
    if (isObject) {
      if (node["additionalProperties"] !== false) {
        issues.push(`${path}: object must set additionalProperties false`);
      }
      const props = isRecord(node["properties"]) ? node["properties"] : {};
      const required = Array.isArray(node["required"]) ? node["required"] : [];
      for (const key of Object.keys(props)) {
        if (!required.includes(key)) issues.push(`${path}.${key}: property must be required`);
      }
      for (const [key, sub] of Object.entries(props)) walk(sub, `${path}.${key}`, depth + 1);
    }
    if ("items" in node) walk(node["items"], `${path}[]`, depth + 1);
    if (Array.isArray(node["anyOf"])) {
      node["anyOf"].forEach((sub, i) => {
        walk(sub, `${path}.anyOf[${i}]`, depth + 1);
      });
    }
  };
  walk(schema, "$", 1);
  return issues;
}

export class StrictSchemaError extends Error {
  readonly issues: string[];

  constructor(name: string, issues: string[]) {
    super(`schema ${name} is outside the strict subset: ${issues.join("; ")}`);
    this.name = "StrictSchemaError";
    this.issues = issues;
  }
}

export function assertStrictSubset(name: string, schema: JsonSchema): void {
  const issues = strictSubsetIssues(schema);
  if (issues.length > 0) throw new StrictSchemaError(name, issues);
}
