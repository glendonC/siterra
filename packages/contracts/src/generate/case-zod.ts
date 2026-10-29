// Generates src/case.ts, the Zod mirror of schemas/case.schema.json. It handles only the keywords
// the case contracts use and throws on anything else, so a schema change that needs new handling
// cannot pass silently. Run: node src/generate/run.ts (from packages/contracts).

type Node = { [key: string]: unknown };

const idPattern = "^[a-z][a-z0-9_]*_[A-Za-z0-9][A-Za-z0-9_-]{1,79}$";
const handled = new Set([
  "type",
  "pattern",
  "items",
  "minLength",
  "maxLength",
  "minItems",
  "maxItems",
  "uniqueItems",
  "$ref",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "enum",
  "format",
  "anyOf",
  "oneOf",
  "properties",
  "required",
  "additionalProperties",
  "const",
  "description",
  "prefixItems",
  "allOf",
]);
/** Conditional rules the schema states with if/then/else, written by hand in rules.ts. */
const refinements: Record<string, string> = {
  Measurement: "missingIsAValue",
  ContextFeature: "contextFeatureShape",
};

function asNode(value: unknown, where: string): Node {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Expected a schema object at ${where}`);
  }
  return value as Node;
}

function refName(node: Node): string {
  return String(node["$ref"]).split("/").pop() ?? "";
}

function refsOf(value: unknown, out: Set<string>): Set<string> {
  if (Array.isArray(value)) {
    for (const v of value) refsOf(v, out);
  } else if (typeof value === "object" && value !== null) {
    const node = value as Node;
    if (typeof node["$ref"] === "string") out.add(refName(node));
    for (const v of Object.values(node)) refsOf(v, out);
  }
  return out;
}

/** Definitions in dependency order, so each const is declared before it is used. */
function dependencyOrder(defs: Record<string, Node>): string[] {
  const order: string[] = [];
  const seen = new Set<string>();
  const visit = (name: string, stack: Set<string>) => {
    if (seen.has(name)) return;
    if (stack.has(name)) throw new Error(`Recursive definition: ${name}`);
    for (const dep of [...refsOf(defs[name], new Set())].sort()) {
      visit(dep, new Set([...stack, name]));
    }
    seen.add(name);
    order.push(name);
  };
  for (const name of Object.keys(defs)) visit(name, new Set());
  return order;
}

const js = (value: unknown) => JSON.stringify(value);

function stringExpr(node: Node): string {
  const format = node["format"];
  const pattern = node["pattern"];
  const min = node["minLength"] as number | undefined;
  const max = node["maxLength"] as number | undefined;
  if (pattern === idPattern && format === undefined && min === undefined && max === undefined) {
    return "entityId";
  }
  let expr: string;
  if (format === "date-time") expr = "dateTime";
  else if (format === "date") expr = "isoDate";
  else if (format === "uri") expr = "uri";
  else if (format === "uri-reference") expr = "uriReference";
  else if (format === undefined) expr = "z.string()";
  else throw new Error(`Unhandled format ${js(format)}`);
  // JSON Schema counts lengths in code points; .min(1) agrees with that, longer bounds use text().
  if (max !== undefined || (min !== undefined && min > 1)) {
    if (expr !== "z.string()") throw new Error("Length bounds on a format string");
    const bounds = [
      min === undefined ? null : `min: ${min}`,
      max === undefined ? null : `max: ${max}`,
    ]
      .filter((b) => b !== null)
      .join(", ");
    expr = `text({ ${bounds} })`;
  } else if (min !== undefined) {
    expr += `.min(${min})`;
  }
  if (typeof pattern === "string") expr += `.regex(new RegExp(${js(pattern)}))`;
  return expr;
}

function numberExpr(node: Node, integer: boolean): string {
  let expr = integer ? "z.int()" : "z.number()";
  if ("minimum" in node) expr += `.min(${String(node["minimum"])})`;
  if ("exclusiveMinimum" in node) expr += `.gt(${String(node["exclusiveMinimum"])})`;
  if ("maximum" in node) expr += `.max(${String(node["maximum"])})`;
  return expr;
}

function arrayExpr(node: Node, defs: Record<string, Node>, indent: number): string {
  if (Array.isArray(node["prefixItems"])) {
    const items = node["prefixItems"] as unknown[];
    // minItems counts the required elements, maxItems all of them; those between are optional.
    const required = node["minItems"];
    if (
      typeof required !== "number" ||
      required < 1 ||
      required > items.length ||
      node["maxItems"] !== items.length
    ) {
      throw new Error("prefixItems without a fixed length");
    }
    const elements = items.map(
      (p, i) =>
        expr(asNode(p, `prefixItems/${i}`), defs, indent) + (i < required ? "" : ".optional()"),
    );
    return `z.tuple([${elements.join(", ")}])`;
  }
  const item = expr(asNode(node["items"], "items"), defs, indent);
  let out = node["uniqueItems"] === true ? `uniqueArray(${item})` : `z.array(${item})`;
  if (typeof node["minItems"] === "number" && node["minItems"] > 0)
    out += `.min(${node["minItems"]})`;
  if ("maxItems" in node) out += `.max(${String(node["maxItems"])})`;
  return out;
}

function objectExpr(node: Node, defs: Record<string, Node>, indent: number): string {
  if (node["additionalProperties"] !== false) throw new Error("Open object");
  const props = asNode(node["properties"] ?? {}, "properties");
  const required = new Set((node["required"] as string[] | undefined) ?? []);
  const pad = "  ".repeat(indent + 1);
  const lines = Object.entries(props).map(([key, sub]) => {
    const e = expr(asNode(sub, key), defs, indent + 1) + (required.has(key) ? "" : ".optional()");
    return `${pad}${key}: ${e},`;
  });
  return `z.strictObject({\n${lines.join("\n")}\n${"  ".repeat(indent)}})`;
}

/**
 * The property every branch of a oneOf fixes with a const: the key z.discriminatedUnion switches on
 * (recordType for the records, kind for the parameters of an instrument). It must be exactly one,
 * so a union whose branches cannot be told apart by a single field cannot pass silently.
 */
function discriminatorOf(branches: Node[], defs: Record<string, Node>): string {
  const fixed = branches.map((branch, i) => {
    const target = typeof branch["$ref"] === "string" ? defs[refName(branch)] : branch;
    const props = asNode(asNode(target, `oneOf/${i}`)["properties"], `oneOf/${i}/properties`);
    return Object.keys(props).filter((key) => "const" in asNode(props[key], key));
  });
  const shared = (fixed[0] ?? []).filter((key) => fixed.every((keys) => keys.includes(key)));
  const [only, ...more] = shared;
  if (only === undefined || more.length > 0) {
    throw new Error(`oneOf branches must share exactly one const property, found ${js(shared)}`);
  }
  return only;
}

function expr(node: Node, defs: Record<string, Node>, indent = 0): string {
  const unknown = Object.keys(node).filter((k) => !handled.has(k));
  if (unknown.length > 0) throw new Error(`Unhandled keywords ${unknown.join(", ")}`);
  if (typeof node["$ref"] === "string") return refName(node);
  if ("const" in node) return `z.literal(${js(node["const"])})`;
  if (Array.isArray(node["enum"])) return `z.enum([${node["enum"].map(js).join(", ")}])`;
  if (Array.isArray(node["anyOf"])) {
    const branches = node["anyOf"].map((b, i) => asNode(b, `anyOf/${i}`));
    const isNull = (b: Node) => js(b) === js({ type: "null" });
    const rest = branches.filter((b) => !isNull(b));
    if (rest.length === 1 && rest.length < branches.length && rest[0] !== undefined) {
      return `${expr(rest[0], defs, indent)}.nullable()`;
    }
    throw new Error("Unhandled anyOf");
  }
  if (Array.isArray(node["oneOf"])) {
    const branches = node["oneOf"].map((b, i) => asNode(b, `oneOf/${i}`));
    const names = branches.map(refName);
    return `z.discriminatedUnion(${js(discriminatorOf(branches, defs))}, [${names.join(", ")}])`;
  }
  const type = node["type"];
  if (Array.isArray(type)) {
    const nonNull = type.filter((t) => t !== "null");
    if (type.length === 2 && nonNull.length === 1) {
      return `${expr({ ...node, type: nonNull[0] }, defs, indent)}.nullable()`;
    }
    throw new Error(`Unhandled type list ${js(type)}`);
  }
  switch (type) {
    case "string":
      return stringExpr(node);
    case "integer":
      return numberExpr(node, true);
    case "number":
      return numberExpr(node, false);
    case "boolean":
      return "z.boolean()";
    case "array":
      return arrayExpr(node, defs, indent);
    case "object":
      return objectExpr(node, defs, indent);
    default:
      throw new Error(`Unhandled node ${js(node)}`);
  }
}

/** The TypeScript source of src/case.ts for a case.schema.json document, before formatting. */
export function generateCaseSource(schema: unknown): string {
  const root = asNode(schema, "#");
  const defs = asNode(root["$defs"], "$defs") as Record<string, Node>;
  const body: string[] = [];
  for (const name of dependencyOrder(defs)) {
    const node = asNode(defs[name], name);
    const { allOf, ...rest } = node;
    let e = expr(rest, defs);
    if (allOf !== undefined) {
      const rule = refinements[name];
      if (rule === undefined) throw new Error(`allOf without a hand-written rule: ${name}`);
      e += `.superRefine(${rule})`;
    }
    body.push("", `export const ${name} = ${e};`, `export type ${name} = z.infer<typeof ${name}>;`);
  }
  const versions = asNode(
    asNode(asNode(defs["Command"], "Command")["properties"], "Command")["schemaVersion"],
    "v",
  )["enum"] as string[];
  const out: string[] = [
    "// Zod mirror of schemas/case.schema.json, generated by src/generate/case-zod.ts; do not edit by",
    "// hand. Regenerate with node src/generate/run.ts; case-zod.test.ts fails when this file is stale.",
    "// Conditional rules the JSON Schema states with if/then/else live in rules.ts.",
    'import { z } from "zod";',
    'import { dateTime, entityId, isoDate, text, uniqueArray, uri, uriReference } from "./primitives.ts";',
    `import { ${[...new Set(Object.values(refinements))].sort().join(", ")} } from "./rules.ts";`,
    "",
    `export const caseSchemaVersion = ${js(versions.at(-1))};`,
    "/** Every schemaVersion string this contract accepts (the earlier ones of the same MAJOR stay valid). */",
    `export const acceptedCaseSchemaVersions = ${js(versions)} as const;`,
    `export const caseSchemaId = ${js(root["$id"])};`,
  ];
  out.push(...body);
  const rootNames = (root["oneOf"] as unknown[]).map((b, i) => refName(asNode(b, `oneOf/${i}`)));
  out.push(
    "",
    "/** The root of case.schema.json: a snapshot, a command, an event or a commit. */",
    `export const CaseDocument = z.discriminatedUnion("recordType", [${rootNames.join(", ")}]);`,
    "export type CaseDocument = z.infer<typeof CaseDocument>;",
    "",
    "/** Every record type in $defs, by name, for the parity test and the importer. */",
    "export const caseDefinitions = {",
    ...Object.keys(defs).map((name) => `  ${name},`),
    "} as const;",
    "",
  );
  return out.join("\n");
}
