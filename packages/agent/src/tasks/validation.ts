// Mirrors ValidationResult in schemas/case.schema.json 1.2 until packages/contracts exports it.

export type IssueCode =
  | "schema"
  | "unknown_reference"
  | "stale_reference"
  | "ownership"
  | "claim_kind"
  | "numeric_provenance"
  | "unit"
  | "coverage"
  | "authority"
  | "prohibited_claim"
  | "transition"
  | "limit"
  | "catalog_mismatch"
  | "focus_not_permitted"
  | "excerpt_mismatch";

export interface ValidationIssue {
  code: IssueCode;
  path: string;
  message: string;
}

export interface ValidationResult {
  outcome: "accepted" | "partial" | "rejected";
  issues: ValidationIssue[];
}

/** `ok` with issues is a partial result: the value holds only the items that validated. */
export type Checked<T> =
  { ok: true; value: T; issues: ValidationIssue[] } | { ok: false; issues: ValidationIssue[] };

/** Formats a parser path as `$.tasks[0].kind`. */
export function jsonPath(path: readonly PropertyKey[]): string {
  let out = "$";
  for (const part of path) {
    out += typeof part === "number" ? `[${part}]` : `.${String(part)}`;
  }
  return out;
}

export function issue(code: IssueCode, path: string, message: string): ValidationIssue {
  return { code, path, message };
}
