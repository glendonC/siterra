import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { CaseDocument, OperationalAction, caseDefinitions } from "./case.ts";

const schemasDir = fileURLToPath(new URL("../../../schemas/", import.meta.url));
const examplesDir = `${schemasDir}examples/`;

type Json = { [key: string]: unknown };

function readJson(path: string): Json {
  return JSON.parse(readFileSync(path, "utf8")) as Json;
}

const caseExampleFiles = readdirSync(examplesDir)
  .filter((name) => name.endsWith(".json") && !name.startsWith("stac-"))
  .sort();

const source = readJson(`${schemasDir}case.schema.json`);
const sourceDefs = source["$defs"] as Record<string, Json>;

describe("contract: case examples", () => {
  it("finds the case examples", () => {
    expect(caseExampleFiles.length).toBeGreaterThanOrEqual(6);
  });

  it.each(caseExampleFiles)("%s parses with the Zod mirror", (name) => {
    const result = CaseDocument.safeParse(readJson(`${examplesDir}${name}`));
    expect(result.error?.issues ?? []).toEqual([]);
  });
});

// Reduces a JSON Schema node to the constraints both forms can state, so the Zod export and the
// source compare directly. uniqueItems and if/then/else live in refinements, which JSON Schema
// export cannot show; patterns on format strings are the exporter's own.
function canon(node: unknown, defs: Record<string, Json>): unknown {
  if (typeof node !== "object" || node === null || Array.isArray(node)) {
    return node;
  }
  const n = node as Json;
  if (typeof n["$ref"] === "string") {
    const name = n["$ref"].split("/").pop() ?? "";
    return canon(defs[name], defs);
  }
  if (Array.isArray(n["type"]) && n["type"].includes("null")) {
    const rest = (n["type"] as string[]).filter((t) => t !== "null");
    return { nullable: canon({ ...n, type: rest.length === 1 ? rest[0] : rest }, defs) };
  }
  const union = (n["anyOf"] ?? n["oneOf"]) as unknown[] | undefined;
  if (Array.isArray(union)) {
    const isNull = (b: unknown) => JSON.stringify(b) === JSON.stringify({ type: "null" });
    const rest = union.filter((b) => !isNull(b));
    if (rest.length === 1 && rest.length < union.length) {
      return { nullable: canon(rest[0], defs) };
    }
    return { union: rest.map((b) => canon(b, defs)) };
  }
  // Source.url is an http(s) URI. Zod's export keeps the regex and drops format: uri, though
  // validation applies both (tested below), so both forms reduce to one marker here.
  const pattern = typeof n["pattern"] === "string" ? new RegExp(n["pattern"]).source : null;
  if (n["type"] === "string" && pattern === new RegExp("^https?://").source) {
    return { httpUri: true };
  }
  const out: Json = {};
  if ("const" in n) {
    out["const"] = n["const"];
  } else if (Array.isArray(n["enum"])) {
    out["enum"] = n["enum"];
  } else if (n["type"] !== undefined) {
    out["type"] = n["type"];
  }
  for (const key of ["format", "minLength", "maxLength", "exclusiveMinimum"]) {
    if (key in n) out[key] = n[key];
  }
  if ("minimum" in n && n["minimum"] !== Number.MIN_SAFE_INTEGER) out["minimum"] = n["minimum"];
  if ("maximum" in n && n["maximum"] !== Number.MAX_SAFE_INTEGER) out["maximum"] = n["maximum"];
  if ("pattern" in n && !("format" in n)) out["pattern"] = n["pattern"];
  if (Array.isArray(n["prefixItems"])) {
    out["prefixItems"] = n["prefixItems"].map((p) => canon(p, defs));
  } else {
    if (typeof n["minItems"] === "number" && n["minItems"] > 0) out["minItems"] = n["minItems"];
    if ("maxItems" in n) out["maxItems"] = n["maxItems"];
    if (n["items"] !== undefined) out["items"] = canon(n["items"], defs);
  }
  if (typeof n["properties"] === "object" && n["properties"] !== null) {
    const props = n["properties"] as Json;
    out["properties"] = Object.fromEntries(
      Object.keys(props)
        .sort()
        .map((k) => [k, canon(props[k], defs)]),
    );
    out["required"] = [...((n["required"] as string[] | undefined) ?? [])].sort();
    out["additionalProperties"] = n["additionalProperties"];
  }
  return out;
}

describe("contract: Zod mirror matches case.schema.json", () => {
  it("mirrors every $defs entry and no other", () => {
    expect(Object.keys(caseDefinitions).sort()).toEqual(Object.keys(sourceDefs).sort());
  });

  it.each(Object.keys(sourceDefs))("%s has the same fields and constraints", (name) => {
    const zodSchema = caseDefinitions[name as keyof typeof caseDefinitions];
    const exported = z.toJSONSchema(zodSchema, { reused: "inline", cycles: "throw", io: "output" });
    expect(canon(exported, {})).toEqual(canon(sourceDefs[name], sourceDefs));
  });

  it("the root accepts the same four documents", () => {
    const exported = z.toJSONSchema(CaseDocument, {
      reused: "inline",
      cycles: "throw",
      io: "output",
    });
    expect(canon(exported, {})).toEqual(canon({ oneOf: source["oneOf"] }, sourceDefs));
  });
});

type Mutation = {
  name: string;
  file: string;
  mutate: (doc: Json) => void;
  code: string;
  path: (string | number)[];
};

function at(doc: Json, path: (string | number)[]): Json {
  let node: unknown = doc;
  for (const key of path) {
    node = (node as Record<string | number, unknown>)[key];
  }
  return node as Json;
}

const mutations: Mutation[] = [
  {
    name: "an identifier outside the type_slug pattern",
    file: "command-commission.json",
    mutate: (d) => {
      d["id"] = "Command-1";
    },
    code: "invalid_format",
    path: ["id"],
  },
  {
    name: "a schemaVersion other than 1.2.0",
    file: "command-commission.json",
    mutate: (d) => {
      d["schemaVersion"] = "1.1.0";
    },
    code: "invalid_value",
    path: ["schemaVersion"],
  },
  {
    name: "an event sequence of 0",
    file: "event-case-committed.json",
    mutate: (d) => {
      d["sequence"] = 0;
    },
    code: "too_small",
    path: ["sequence"],
  },
  {
    name: "a field the contract does not define",
    file: "case-snapshot.json",
    mutate: (d) => {
      at(d, ["case"])["score"] = 0.9;
    },
    code: "unrecognized_keys",
    path: ["case"],
  },
  {
    name: "a permission profile other than research and preparation",
    file: "case-snapshot.json",
    mutate: (d) => {
      at(d, ["case"])["permissionProfile"] = "full";
    },
    code: "invalid_value",
    path: ["case", "permissionProfile"],
  },
  {
    name: "a commit without events",
    file: "commit-plan.json",
    mutate: (d) => {
      d["events"] = [];
    },
    code: "too_small",
    path: ["events"],
  },
  {
    name: "an upsert of an unknown record type",
    file: "commit-plan.json",
    mutate: (d) => {
      at(d, ["upserts", 0])["recordType"] = "Score";
    },
    code: "invalid_union",
    path: ["upserts", 0, "recordType"],
  },
  {
    name: "a repeated item in a unique list",
    file: "command-commission.json",
    mutate: (d) => {
      const context = at(d, ["context"]);
      context["periodIds"] = ["period_2022-04", "period_2022-04"];
    },
    code: "custom",
    path: ["context", "periodIds"],
  },
  {
    name: "SV-04 (contract part): a missing measurement carrying 0 instead of null",
    file: "case-snapshot.json",
    mutate: (d) => {
      at(d, ["records", "measurementRecords", 0])["value"] = 0;
    },
    code: "custom",
    path: ["records", "measurementRecords", 0, "value"],
  },
  {
    name: "an available measurement without a value",
    file: "case-snapshot.json",
    mutate: (d) => {
      const m = at(d, ["records", "measurementRecords", 0]);
      m["status"] = "available";
      m["missingReason"] = null;
    },
    code: "custom",
    path: ["records", "measurementRecords", 0, "value"],
  },
];

describe("contract: invalid documents fail with the expected code", () => {
  it.each(mutations)("$name -> $code at $path", ({ file, mutate, code, path }) => {
    const doc = readJson(`${examplesDir}${file}`);
    expect(CaseDocument.safeParse(doc).success).toBe(true);
    mutate(doc);
    const result = CaseDocument.safeParse(doc);
    expect(result.success).toBe(false);
    const found = (result.error?.issues ?? []).map((issue) => ({
      code: issue.code,
      path: issue.path,
    }));
    expect(found).toContainEqual({ code, path });
  });
});

describe("SA-07: no external side effects in the action contract", () => {
  const action = {
    recordType: "OperationalAction",
    id: "act_example_field_plan",
    revision: 1,
    createdAt: "2026-10-26T16:00:00-04:00",
    updatedAt: "2026-10-26T16:00:00-04:00",
    caseId: "case_example_atlas",
    title: "Example field-validation plan",
    description: "Synthetic contract fixture.",
    kind: "field_validation_plan",
    status: "draft",
    evidenceIds: [],
    interventionIds: [],
    dependsOnActionIds: [],
    resourceRequirementIds: [],
    requiredReviewRoles: ["scientific"],
    reviewDecisionIds: [],
    authorizationMode: "demo_only",
    externalExecutionEnabled: false,
    remainingConditions: ["Community consultation outstanding"],
    preparedArtifactUri: null,
    sourceCaseRevision: 1,
  };

  it("accepts an action with externalExecutionEnabled false", () => {
    expect(OperationalAction.safeParse(action).error?.issues ?? []).toEqual([]);
  });

  it("rejects an action with externalExecutionEnabled true", () => {
    const result = OperationalAction.safeParse({ ...action, externalExecutionEnabled: true });
    expect(result.error?.issues.map((i) => ({ code: i.code, path: i.path }))).toContainEqual({
      code: "invalid_value",
      path: ["externalExecutionEnabled"],
    });
  });

  it("has no executed state", () => {
    expect(OperationalAction.safeParse({ ...action, status: "executed" }).success).toBe(false);
  });
});

describe("contract: Source.url is an absolute http or https URI", () => {
  const snapshot = readJson(`${examplesDir}commit-event-record.json`);
  const source = (snapshot["upserts"] as Json[])[0] as Json;

  it.each([
    ["https://example.org/briefs/x", true],
    ["http://example.org/x", true],
    ["ftp://example.org/x", false],
    ["https://", false],
    ["example.org/x", false],
  ])("%s -> %s", (url, valid) => {
    expect(caseDefinitions.Source.safeParse({ ...source, url }).success).toBe(valid);
  });
});
