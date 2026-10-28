import { ProposePlan, plannableTaskKinds, toModelJsonSchema } from "@siterra/contracts";

import type { JsonSchema } from "../../model/types.ts";
import { issue, jsonPath } from "../validation.ts";
import type { Checked, ValidationIssue } from "../validation.ts";

// propose_plan (docs/reference/data-contracts.md#tool-argument-contracts): the schema is
// ProposePlan from packages/contracts. The model-facing schema holds types, enums and required
// fields only; every limit below is enforced by host code, because Meta does not document support
// for length, count or pattern keywords in its strict subset.

/** Task kinds a plan may contain. `plan` and `validation` are host-run and never planned. */
export const PLANNABLE_KINDS = plannableTaskKinds;

export type PlannableKind = (typeof PLANNABLE_KINDS)[number];

export const LIMITS = {
  maxTasks: 8,
  interpretationChars: 300,
  questionChars: 500,
  clarifyingChars: 300,
  maxDependsOn: 7,
  maxInputRefs: 20,
} as const;

const KEY_PATTERN = /^[a-z][a-z0-9_]{0,39}$/;

/**
 * Task kinds that can commit field_requirement Evidence (their specs' claim kinds). A brief package
 * runs after every one of them in its command, so its field plan sees every open gap the command
 * adds; host code adds the missing dependencies (lead decision after AGENT 18).
 */
export const FIELD_REQUIREMENT_KINDS: readonly PlannableKind[] = [
  "observation_analysis",
  "source_research",
  "livelihood_governance",
];

/** The plan with every brief_package task depending on every task that can commit a gap. */
function withBriefDependencies(plan: PlanProposal): PlanProposal {
  const gapKeys = plan.tasks
    .filter((t) => FIELD_REQUIREMENT_KINDS.includes(t.kind))
    .map((t) => t.key);
  return {
    ...plan,
    tasks: plan.tasks.map((t) =>
      t.kind === "brief_package"
        ? { ...t, dependsOn: [...new Set([...t.dependsOn, ...gapKeys])] }
        : t,
    ),
  };
}

export const PlanProposal = ProposePlan;

export type PlanProposal = ProposePlan;

/** The model-facing JSON Schema, exported by the contracts package under the strict-subset rules. */
export function planOutputSchema(): JsonSchema {
  return toModelJsonSchema(ProposePlan);
}

function sentenceCount(text: string): number {
  return text
    .trim()
    .split(/[.!?](?:\s+|$)/)
    .filter((part) => part.trim() !== "").length;
}

/** Finds a dependency cycle by depth-first search; returns the keys on it, or null. */
function findCycle(
  tasks: readonly { key: string; dependsOn: readonly string[] }[],
): string[] | null {
  const deps = new Map(tasks.map((t) => [t.key, t.dependsOn]));
  const state = new Map<string, "visiting" | "done">();
  const stack: string[] = [];
  const visit = (key: string): string[] | null => {
    if (state.get(key) === "done") return null;
    if (state.get(key) === "visiting") return [...stack.slice(stack.indexOf(key)), key];
    state.set(key, "visiting");
    stack.push(key);
    for (const dep of deps.get(key) ?? []) {
      if (!deps.has(dep)) continue;
      const cycle = visit(dep);
      if (cycle) return cycle;
    }
    stack.pop();
    state.set(key, "done");
    return null;
  };
  for (const key of deps.keys()) {
    const cycle = visit(key);
    if (cycle) return cycle;
  }
  return null;
}

export interface PlanContext {
  /** Entity IDs in the context snapshot with their current revisions; inputRefs must be among them. */
  knownEntities: ReadonlyMap<string, number>;
  maxTasks?: number;
}

/** Validates a plan proposal: completion is the caller's; this checks schema, limits and references. */
export function validatePlanProposal(
  outputText: string,
  context: PlanContext,
): Checked<PlanProposal> {
  let raw: unknown;
  try {
    raw = JSON.parse(outputText) as unknown;
  } catch {
    return { ok: false, issues: [issue("schema", "$", "Output is not JSON.")] };
  }
  const parsed = PlanProposal.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((i) => issue("schema", jsonPath(i.path), i.message)),
    };
  }
  const plan = parsed.data;
  const issues: ValidationIssue[] = [];
  const maxTasks = context.maxTasks ?? LIMITS.maxTasks;

  const interpretation = plan.interpretation.trim();
  if (interpretation === "") {
    issues.push(issue("schema", "$.interpretation", "Interpretation is empty."));
  } else {
    if (interpretation.length > LIMITS.interpretationChars) {
      issues.push(
        issue(
          "limit",
          "$.interpretation",
          `Interpretation exceeds ${LIMITS.interpretationChars} characters.`,
        ),
      );
    }
    if (sentenceCount(interpretation) > 1) {
      issues.push(issue("limit", "$.interpretation", "Interpretation must be one sentence."));
    }
  }
  if (plan.clarifyingQuestion !== null) {
    const q = plan.clarifyingQuestion.trim();
    if (q === "")
      issues.push(
        issue("schema", "$.clarifyingQuestion", "Use null instead of an empty question."),
      );
    if (q.length > LIMITS.clarifyingChars) {
      issues.push(
        issue(
          "limit",
          "$.clarifyingQuestion",
          `Question exceeds ${LIMITS.clarifyingChars} characters.`,
        ),
      );
    }
  }

  if (plan.tasks.length === 0 && plan.clarifyingQuestion === null) {
    issues.push(issue("limit", "$.tasks", "A plan with no tasks must ask a clarifying question."));
  }
  if (plan.tasks.length > maxTasks) {
    issues.push(issue("limit", "$.tasks", `A plan holds at most ${maxTasks} tasks.`));
  }

  const keys = new Set<string>();
  plan.tasks.forEach((task, i) => {
    const at = `$.tasks[${i}]`;
    if (!KEY_PATTERN.test(task.key)) {
      issues.push(
        issue("schema", `${at}.key`, "Key must be lowercase letters, digits and underscores."),
      );
    } else if (keys.has(task.key)) {
      issues.push(issue("schema", `${at}.key`, `Key ${task.key} is used twice.`));
    }
    keys.add(task.key);
    const question = task.question.trim();
    if (question === "") issues.push(issue("schema", `${at}.question`, "Question is empty."));
    if (question.length > LIMITS.questionChars) {
      issues.push(
        issue("limit", `${at}.question`, `Question exceeds ${LIMITS.questionChars} characters.`),
      );
    }
    if (task.dependsOn.length > LIMITS.maxDependsOn) {
      issues.push(
        issue("limit", `${at}.dependsOn`, `At most ${LIMITS.maxDependsOn} dependencies.`),
      );
    }
    if (task.inputRefs.length > LIMITS.maxInputRefs) {
      issues.push(
        issue("limit", `${at}.inputRefs`, `At most ${LIMITS.maxInputRefs} input references.`),
      );
    }
    task.inputRefs.forEach((ref, j) => {
      const known = context.knownEntities.get(ref.entityId);
      if (known === undefined) {
        issues.push(
          issue(
            "unknown_reference",
            `${at}.inputRefs[${j}]`,
            `${ref.entityId} is not in the context snapshot.`,
          ),
        );
      } else if (ref.revision !== known) {
        issues.push(
          issue(
            "stale_reference",
            `${at}.inputRefs[${j}].revision`,
            `${ref.entityId} is at revision ${known} in the snapshot, not ${ref.revision}.`,
          ),
        );
      }
    });
  });
  plan.tasks.forEach((task, i) => {
    task.dependsOn.forEach((dep, j) => {
      const at = `$.tasks[${i}].dependsOn[${j}]`;
      if (dep === task.key)
        issues.push(issue("unknown_reference", at, "A task cannot depend on itself."));
      else if (!keys.has(dep))
        issues.push(issue("unknown_reference", at, `No task has key ${dep}.`));
    });
  });
  const cycle = findCycle(
    plan.tasks.map((t) => ({ key: t.key, dependsOn: t.dependsOn.filter((d) => d !== t.key) })),
  );
  if (cycle) issues.push(issue("limit", "$.tasks", `Dependency cycle: ${cycle.join(" -> ")}.`));
  if (issues.length > 0) return { ok: false, issues };

  const ordered = withBriefDependencies(plan);
  const after = findCycle(ordered.tasks);
  if (after) {
    return {
      ok: false,
      issues: [
        issue(
          "limit",
          "$.tasks",
          `A brief package runs after every task that can add a field requirement, so none of them may depend on it: ${after.join(" -> ")}.`,
        ),
      ],
    };
  }
  return { ok: true, value: ordered, issues: [] };
}
