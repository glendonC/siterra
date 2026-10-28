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

describe("contract: string lengths count Unicode code points, as JSON Schema does", () => {
  const commit = readJson(`${examplesDir}commit-event-record.json`);
  const row = (commit["upserts"] as Json[])[2] as Json;
  const locator = row["sourceLocator"] as Json;
  // U+2D30 (Tifinagh, one UTF-16 unit) and U+1F30D (outside the BMP, two UTF-16 units).
  const astral = "\u{1F30D}";

  it("accepts an excerpt of 300 code points that is 600 UTF-16 units long", () => {
    const excerpt = astral.repeat(300);
    expect(excerpt.length).toBe(600);
    const parsed = caseDefinitions.EventRecordRow.safeParse({
      ...row,
      sourceLocator: { ...locator, excerpt },
    });
    expect(parsed.error?.issues ?? []).toEqual([]);
  });

  it("rejects an excerpt of 301 code points as too_big", () => {
    const excerpt = "ⴰ".repeat(301);
    const parsed = caseDefinitions.EventRecordRow.safeParse({
      ...row,
      sourceLocator: { ...locator, excerpt },
    });
    expect(parsed.error?.issues.map((i) => [i.code, i.path.join("/")])).toEqual([
      ["too_big", "sourceLocator/excerpt"],
    ]);
  });

  it("rejects an idempotency key of 4 code points that is 8 UTF-16 units long as too_small", () => {
    const parsed = caseDefinitions.Command.safeParse({
      ...readJson(`${examplesDir}command-commission.json`),
      idempotencyKey: astral.repeat(4),
    });
    expect(parsed.error?.issues.map((i) => [i.code, i.path.join("/")])).toEqual([
      ["too_small", "idempotencyKey"],
    ]);
  });
});

describe("contracts 1.6: the context features in data/case/ form valid ContextFeature records", () => {
  const repoDir = fileURLToPath(new URL("../../../", import.meta.url));
  const file = readJson(`${repoDir}data/case/context-features.json`) as {
    caseId: string;
    features: (Record<string, unknown> & { lonLat: [number, number]; sourceIds: string[] })[];
  };
  const manifest = readJson(`${repoDir}data/case/corpus-manifest.json`) as {
    sources: { sourceRecordId: string }[];
  };
  const sourceIds = new Set(manifest.sources.map((s) => s.sourceRecordId));

  it.each(file.features.map((f) => [f["id"], f] as const))("%s", (_id, feature) => {
    const { lonLat, ...rest } = feature;
    const record = {
      ...rest,
      recordType: "ContextFeature",
      revision: 1,
      createdAt: "2026-10-27T20:00:00Z",
      updatedAt: "2026-10-27T20:00:00Z",
      caseId: file.caseId,
      geometry: { type: "Point", coordinates: lonLat },
      crs: "EPSG:4326",
    };
    expect(caseDefinitions.ContextFeature.safeParse(record).error?.issues ?? []).toEqual([]);
    for (const id of feature.sourceIds) expect(sourceIds.has(id)).toBe(true);
  });
});

describe("contracts 1.6: manifestUri and mapAssetUri take a URI reference", () => {
  const manifestUri = caseDefinitions.DataBundle.shape.manifestUri;

  it.each(["/api/case-assets/bundle_x/abc/collection.json", "https://example.org/a.json", null])(
    "accepts %s",
    (value) => {
      expect(manifestUri.safeParse(value).success).toBe(true);
    },
  );

  it.each(["", "/api/case assets/x.json"])("refuses %j", (value) => {
    expect(manifestUri.safeParse(value).success).toBe(false);
  });
});

describe("contracts 1.10: a branch merge carries its field plan (DF-09)", () => {
  const commit = readJson(`${examplesDir}commit-explanation-branches.json`);
  const merge = (commit["upserts"] as Json[]).find((u) => u["recordType"] === "BranchMerge") ?? {};
  const BranchMerge = caseDefinitions.BranchMerge;

  it("the example is 1.10.0 and names a measurement for its open pair", () => {
    expect(commit["schemaVersion"]).toBe("1.10.0");
    expect(merge["fieldPlan"]).toEqual({
      measurements: [
        {
          fieldCheckId: "soil_moisture_survey",
          label: "Soil Moisture Survey",
          separates: [["grazing", "rainfall"]],
          onlySeparates: [["grazing", "rainfall"]],
        },
      ],
      unseparated: [],
    });
  });

  it("a merge written before 1.10.0 has no field plan and stays valid", () => {
    const { fieldPlan: _plan, ...before } = merge;
    expect(BranchMerge.safeParse(before).success).toBe(true);
  });

  it("refuses a chosen measurement that names no pair only it separates", () => {
    const plan = merge["fieldPlan"] as { measurements: Json[] };
    const bad = {
      ...merge,
      fieldPlan: { ...plan, measurements: [{ ...plan.measurements[0], onlySeparates: [] }] },
    };
    expect(BranchMerge.safeParse(bad).success).toBe(false);
  });
});
