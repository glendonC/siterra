import { toModelJsonSchema } from "@siterra/contracts";
import { fieldPlanIssues } from "@siterra/domain";
import type { YearSpan } from "@siterra/domain/validators";
import { z } from "zod";

import type { JsonSchema } from "../../model/types.ts";
import { REVIEW_ROLES, citedNumbers, responseTextIssues } from "../intervention/proposal.ts";
import type {
  ClaimKind,
  EvidenceRecord,
  InterventionRecord,
  MeasurementRecord,
} from "../records.ts";
import { issue, jsonPath } from "../validation.ts";
import type { Checked, ValidationIssue } from "../validation.ts";

// propose_package with request_review (docs/reference/data-contracts.md#tool-argument-contracts,
// components.md CMP-13 and CMP-14): a draft field-validation plan, a decision brief whose every
// line carries a claim kind and evidence IDs, and the review roles to request. Local mirror until
// packages/contracts adds it. The plan is the action's fieldPlan (contracts 1.8.0): strata as kinds
// of place, never sampling points; every measurement names a gap or hypothesis it would resolve;
// every open gap of the case is measured or deferred with a reason (fieldPlanIssues, the rule the
// commit enforces). The model names roles to request; host code writes each request with the
// catalog comment. Nothing is sent, scheduled or authorized.

export const ACTION_KINDS = ["field_validation_plan"] as const;
export const RESOURCE_KINDS = [
  "expertise",
  "time",
  "equipment",
  "funding",
  "local_information",
  "permission",
] as const;
export const BRIEF_SECTIONS = [
  "known",
  "uncertain",
  "nextMeasurements",
  "stakeholderRoles",
  "preparedActions",
  "authorizationRequired",
  "nextSteps",
] as const;
export type BriefSection = (typeof BRIEF_SECTIONS)[number];

/** Field plan limits of contracts 1.8.0 (FieldPlan, FieldStratum, FieldMeasurement, DeferredGap). */
const PLAN_CHARS = {
  objective: 600,
  decisionInformed: 600,
  label: 120,
  definition: 400,
  what: 300,
  method: 400,
  season: 120,
  fieldRole: 120,
  reason: 400,
  step: 300,
} as const;
const STRATUM_KEY = /^[a-z][a-z0-9_]{0,39}$/;

export const PACKAGE_LIMITS = {
  titleChars: 120,
  descriptionChars: 800,
  listItems: 8,
  listItemChars: 300,
  maxResources: 12,
  sectionItems: 6,
  itemChars: 400,
} as const;

const BriefLine = z.strictObject({
  text: z.string(),
  claimKind: z.enum([
    "observation",
    "scientific_context",
    "hypothesis",
    "model_estimate",
    "scenario",
    "field_requirement",
    "verified_outcome",
  ]),
  evidenceIds: z.array(z.string()),
  measurementIds: z.array(z.string()),
});

export const ProposePackage = z.strictObject({
  action: z.strictObject({
    kind: z.enum(ACTION_KINDS),
    title: z.string(),
    description: z.string(),
    fieldPlan: z.strictObject({
      objective: z.string(),
      decisionInformed: z.string(),
      strata: z.array(
        z.strictObject({ key: z.string(), label: z.string(), definition: z.string() }),
      ),
      measurements: z.array(
        z.strictObject({
          what: z.string(),
          method: z.string(),
          season: z.string(),
          stratumKeys: z.array(z.string()),
          fieldRole: z.string(),
          resolvesGapIds: z.array(z.string()),
          discriminatesHypothesisIds: z.array(z.string()),
        }),
      ),
      deferredGaps: z.array(z.strictObject({ gapId: z.string(), reason: z.string() })),
      permissions: z.array(z.string()),
      consultationSteps: z.array(z.string()),
    }),
    resources: z.array(z.strictObject({ kind: z.enum(RESOURCE_KINDS), label: z.string() })),
    evidenceIds: z.array(z.string()),
    interventionIds: z.array(z.string()),
  }),
  brief: z.strictObject(
    Object.fromEntries(BRIEF_SECTIONS.map((s) => [s, z.array(BriefLine)])) as Record<
      BriefSection,
      z.ZodArray<typeof BriefLine>
    >,
  ),
  reviewRoles: z.array(z.enum(REVIEW_ROLES)),
});
export type ProposePackage = z.infer<typeof ProposePackage>;
export type BriefLine = z.infer<typeof BriefLine>;

export function packageOutputSchema(): JsonSchema {
  return toModelJsonSchema(ProposePackage);
}

/**
 * Claim kinds a section's lines may carry. Known lines are observations or published context;
 * measurements and authorization lines are field requirements. Every line must also match the
 * claim kind of evidence it cites, except a hypothesis line among the uncertain ones.
 */
const SECTION_KINDS: Readonly<Record<BriefSection, readonly ClaimKind[]>> = {
  known: ["observation", "scientific_context"],
  uncertain: ["hypothesis", "observation", "scientific_context", "field_requirement"],
  nextMeasurements: ["field_requirement"],
  stakeholderRoles: ["field_requirement", "scientific_context"],
  preparedActions: ["field_requirement", "scientific_context"],
  authorizationRequired: ["field_requirement"],
  nextSteps: ["field_requirement", "scientific_context"],
};

/** Outreach and agreement verbs in every form, used after an auxiliary ("has sent", "will agree"). */
const CLAIM_VERB = String.raw`(?:contact(?:s|ed|ing)?|wr(?:ite|ites|ote|itten|iting)\s+to|call(?:s|ed|ing)?|phon(?:e|es|ed|ing)|e-?mail(?:s|ed|ing)?|messag(?:e|es|ed|ing)|m(?:eet|eets|et|eeting)\s+with|visit(?:s|ed|ing)?|s(?:end|ends|ent|ending)|mail(?:s|ed|ing)?|agree(?:s|d|ing)?|consent(?:s|ed|ing)?|approv(?:e|es|ed|ing)|grant(?:s|ed|ing)?|authori[sz](?:e|es|ed|ing)|permit(?:s|ted|ting)?|accept(?:s|ed|ing)?|sign(?:s|ed|ing)?)`;

/**
 * The forms that are a claim straight after a subject ("Siterra contacted", "The association
 * agrees"): past forms, and present forms that are never nouns. "visit", "permits" or "signs"
 * alone can be nouns ("Any visit waits ...").
 */
const CLAIM_FINITE = String.raw`(?:contacted|wrote\s+to|called|phoned|e-?mailed|messaged|met\s+with|visited|sent|mailed|agreed|agrees|consented|consents|approved|approves|granted|authori[sz](?:ed|es)|permitted|accepted|signed)`;

/** The participles a passive claim uses ("is granted", "has been sent"). */
const CLAIM_PARTICIPLE = String.raw`(?:contacted|written\s+to|called|phoned|e-?mailed|messaged|met\s+with|visited|sent|mailed|agreed|consented|approved|granted|authori[sz]ed|permitted|accepted|signed|scheduled|booked|published|posted|notified|delivered)`;

/**
 * A word that can be part of a clause subject: never an auxiliary, a negation, a preposition or a
 * conjunction that opens a condition ("until the association agrees" is not a claim),
 * so a subject cannot swallow "was not" or reach across "in the pasture".
 */
const SUBJECT_WORD = String.raw`(?!(?:is|are|was|were|be|been|being|has|have|had|will|would|shall|may|might|can|could|did|does|do|not|never|no|in|on|at|of|from|for|with|by|to|into|near|above|below|under|over|about|than|as|if|unless|until|once|while|whether|before|after|when)\b)[\w-]+`;

/**
 * A clause subject: up to four subject words (Siterra, a pronoun, a determiner phrase, a name)
 * right before the verb, after any word (18e: "The record suggests the commune agreed"), unless
 * the subject sits in a condition ("until the association agrees", "if the council approves").
 */
const ACTOR = String.raw`(?<![\w-])(?<!\b(?:if|unless|until|once|whether|provided)\s+(?:${SUBJECT_WORD}\s+){0,4})(?:${SUBJECT_WORD}\s+){0,3}${SUBJECT_WORD}\s+`;

/**
 * A claim form with no actor that names an agent or recipient ("Approved by the council", "Sent to
 * the caidat", "agreed with the association"), unless not or never comes before it ("not visited by
 * the field survey") (18f).
 */
const AGENTLESS_CLAIM = String.raw`(?<!\b(?:not|never)\s+)\b(?:(?:contacted|called|phoned|e-?mailed|messaged|visited|sent|mailed|agreed|consented|approved|granted|authori[sz]ed|permitted|accepted|signed|scheduled|booked|published|posted|notified|delivered)\s+(?:by|with|to)|wr(?:ote|itten)\s+to|met\s+with)\b`;

/**
 * A claim form that opens a sentence, line or clause after a semicolon and takes an object
 * ("Contacted the commune ...", "Visited the upper pasture ...", "Has consented ..."). The object
 * starts with a determiner, so an adjective use passes ("Accepted evidence shows ..."); a comma
 * clause is left to AGENTLESS_CLAIM, so naming passes ("The upper pasture, called the agdal, ...").
 */
const OPENING_CLAIM = String.raw`(?:^|[.;:!?]\s+|\n\s*)(?:(?:has|have|had|was|were|is|are)\s+(?:(?:already|now|also|just)\s+)?(?:been\s+)?)?${CLAIM_FINITE}\s+(?:the|a|an|this|that|these|those|our|their|its|his|her|each|every|all|both|to|with)\b`;

/**
 * Outreach, agreement or authorization the plan claims or asks for; a case command implies none
 * (AGENTS.md). The verbs count only when bound to an actor (18d, after b49): a subject that
 * contacted, wrote, visited, agreed, granted or signed ("Siterra contacted the commune", "The
 * association agreed"), a passive claim ("Permission from the commune is granted", "has been
 * sent"), or something that went or was delivered to someone (b48). The same words without an
 * actor pass: "Accepted evidence shows ...", "a pasture called the agdal", "not visited by the
 * field survey", and the nouns ("Permission from the commune, to be established").
 */
const OUTREACH = new RegExp(
  [
    String.raw`${ACTOR}${CLAIM_FINITE}\b`,
    String.raw`${AGENTLESS_CLAIM}`,
    String.raw`${OPENING_CLAIM}`,
    String.raw`${ACTOR}(?:has|have|had|will|would|shall|may|might|can|could|is|are|was|were|did|does|do)\s+(?:(?:already|now|also|then|just)\s+)?(?:been\s+)?${CLAIM_VERB}\b`,
    String.raw`\b(?:is|are|was|were|be|been|being)\s+(?:(?:already|now|also|then|just|formally|officially)\s+)?${CLAIM_PARTICIPLE}\b`,
    String.raw`\b(?:send|email|schedule|book|publish|post|sign)\s+(?:it|this|the|a|an|them)\b`,
    String.raw`\bwent\s+to\b|\b(?:was|were|been)\s+delivered\s+to\b`,
  ].join("|"),
  "i",
);

export interface AcceptedPackage {
  value: ProposePackage;
  evidence: EvidenceRecord[];
  interventions: InterventionRecord[];
}

export interface PackageContext {
  evidence: ReadonlyMap<string, EvidenceRecord>;
  interventions: ReadonlyMap<string, InterventionRecord>;
  /** The case's current accepted field_requirement Evidence IDs: the gaps the plan must cover. */
  openGapIds: ReadonlySet<string>;
  /** The case's current hypothesis IDs, which a measurement may discriminate. */
  hypothesisIds: ReadonlySet<string>;
  measurements: ReadonlyMap<string, MeasurementRecord>;
  years: YearSpan | null;
}

export function validatePackageProposal(
  outputText: string,
  context: PackageContext,
): Checked<AcceptedPackage> {
  let raw: unknown;
  try {
    raw = JSON.parse(outputText) as unknown;
  } catch {
    return { ok: false, issues: [issue("schema", "$", "Output is not JSON.")] };
  }
  const parsed = ProposePackage.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((i) => issue("schema", jsonPath(i.path), i.message)),
    };
  }
  const value = parsed.data;
  const { action, brief } = value;
  const issues: ValidationIssue[] = [];
  const add = (code: Parameters<typeof issue>[0], path: string, message: string): void => {
    issues.push(issue(code, path, message));
  };
  const resolveEvidence = (ids: readonly string[], path: string): EvidenceRecord[] =>
    ids.flatMap((id, j) => {
      const e = context.evidence.get(id);
      if (!e) {
        add(
          "unknown_reference",
          `${path}[${j}]`,
          `${id} is not accepted evidence available to this task.`,
        );
        return [];
      }
      return [e];
    });

  // The action.
  if (action.title.trim() === "") add("schema", "$.action.title", "Title is empty.");
  if (action.title.length > PACKAGE_LIMITS.titleChars)
    add("limit", "$.action.title", `At most ${PACKAGE_LIMITS.titleChars} characters.`);
  if (action.description.trim() === "")
    add("schema", "$.action.description", "Description is empty.");
  if (action.description.length > PACKAGE_LIMITS.descriptionChars)
    add("limit", "$.action.description", `At most ${PACKAGE_LIMITS.descriptionChars} characters.`);
  const plan = action.fieldPlan;
  const tooLong = (path: string, value: string, max: number): void => {
    if (value.trim() === "") add("schema", path, "Text is empty.");
    if (value.length > max) add("limit", path, `At most ${String(max)} characters.`);
  };
  tooLong("$.action.fieldPlan.objective", plan.objective, PLAN_CHARS.objective);
  tooLong(
    "$.action.fieldPlan.decisionInformed",
    plan.decisionInformed,
    PLAN_CHARS.decisionInformed,
  );
  plan.strata.forEach((st, j) => {
    const at = `$.action.fieldPlan.strata[${j}]`;
    if (!STRATUM_KEY.test(st.key))
      add("schema", `${at}.key`, "A stratum key is lower case letters, digits and _, at most 40.");
    tooLong(`${at}.label`, st.label, PLAN_CHARS.label);
    tooLong(`${at}.definition`, st.definition, PLAN_CHARS.definition);
  });
  plan.measurements.forEach((m, j) => {
    const at = `$.action.fieldPlan.measurements[${j}]`;
    tooLong(`${at}.what`, m.what, PLAN_CHARS.what);
    tooLong(`${at}.method`, m.method, PLAN_CHARS.method);
    tooLong(`${at}.season`, m.season, PLAN_CHARS.season);
    tooLong(`${at}.fieldRole`, m.fieldRole, PLAN_CHARS.fieldRole);
  });
  plan.deferredGaps.forEach((g, j) => {
    tooLong(`$.action.fieldPlan.deferredGaps[${j}].reason`, g.reason, PLAN_CHARS.reason);
  });
  for (const list of ["permissions", "consultationSteps"] as const) {
    plan[list].forEach((v, j) => {
      tooLong(`$.action.fieldPlan.${list}[${j}]`, v, PLAN_CHARS.step);
    });
  }
  if (plan.strata.length === 0)
    add("claim_kind", "$.action.fieldPlan.strata", "Define at least one stratum, a kind of place.");
  if (plan.measurements.length === 0)
    add("claim_kind", "$.action.fieldPlan.measurements", "Name at least one measurement.");
  if (plan.permissions.length + plan.consultationSteps.length === 0) {
    add(
      "claim_kind",
      "$.action.fieldPlan.permissions",
      "Name at least one permission or consultation step before any field work.",
    );
  }
  // The rule the commit enforces (DF-06), run here so the repair turn sees it.
  for (const problem of fieldPlanIssues(
    {
      id: "action",
      kind: action.kind,
      fieldPlan: {
        ...plan,
        strata: plan.strata.map((st) => ({ ...st, dataBundleId: null })),
      },
    },
    { openGapIds: context.openGapIds, hypothesisIds: context.hypothesisIds },
  )) {
    add("coverage", "$.action.fieldPlan", problem);
  }
  if (action.resources.length > PACKAGE_LIMITS.maxResources)
    add("limit", "$.action.resources", `At most ${PACKAGE_LIMITS.maxResources} resources.`);
  const actionEvidence = resolveEvidence(action.evidenceIds, "$.action.evidenceIds");
  if (action.evidenceIds.length === 0)
    add("claim_kind", "$.action.evidenceIds", "Cite the evidence the plan rests on.");
  const interventions = action.interventionIds.flatMap((id, j) => {
    const r = context.interventions.get(id);
    if (!r) {
      add(
        "unknown_reference",
        `$.action.interventionIds[${j}]`,
        `${id} is not a candidate response available to this task.`,
      );
      return [];
    }
    return [r];
  });
  if (value.reviewRoles.length === 0)
    add("claim_kind", "$.reviewRoles", "Name at least one review role to request.");
  if (new Set(value.reviewRoles).size !== value.reviewRoles.length)
    add("schema", "$.reviewRoles", "Each review role appears once.");

  // The brief.
  const briefEvidence: EvidenceRecord[] = [];
  for (const section of BRIEF_SECTIONS) {
    const lines = brief[section];
    if (lines.length > PACKAGE_LIMITS.sectionItems)
      add("limit", `$.brief.${section}`, `At most ${PACKAGE_LIMITS.sectionItems} lines.`);
    lines.forEach((line, j) => {
      const at = `$.brief.${section}[${j}]`;
      if (line.text.trim() === "") add("schema", `${at}.text`, "Line is empty.");
      if (line.text.length > PACKAGE_LIMITS.itemChars)
        add("limit", `${at}.text`, `At most ${PACKAGE_LIMITS.itemChars} characters.`);
      const cited = resolveEvidence(line.evidenceIds, `${at}.evidenceIds`);
      briefEvidence.push(...cited);
      if (line.evidenceIds.length === 0)
        add("claim_kind", `${at}.evidenceIds`, "Every brief line cites evidence.");
      if (line.claimKind === "verified_outcome") {
        add("claim_kind", `${at}.claimKind`, "No outcome is verified in P0.");
      } else if (!SECTION_KINDS[section].includes(line.claimKind)) {
        add(
          "claim_kind",
          `${at}.claimKind`,
          `A ${section} line is ${SECTION_KINDS[section].join(" or ")}, not ${line.claimKind}.`,
        );
      } else if (
        cited.length > 0 &&
        !(section === "uncertain" && line.claimKind === "hypothesis") &&
        !cited.some((e) => e.claimKind === line.claimKind)
      ) {
        add(
          "claim_kind",
          `${at}.claimKind`,
          `${line.claimKind} matches none of the cited evidence (${[...new Set(cited.map((e) => e.claimKind))].join(", ")}).`,
        );
      }
      const own = new Set(cited.flatMap((e) => e.measurementIds));
      line.measurementIds.forEach((m, k) => {
        if (!own.has(m)) {
          add(
            "unknown_reference",
            `${at}.measurementIds[${k}]`,
            `${m} is not a measurement of the cited evidence.`,
          );
        }
      });
    });
  }
  if (brief.nextMeasurements.length === 0) {
    add(
      "claim_kind",
      "$.brief.nextMeasurements",
      "Name what is to be measured next, with the field requirement it resolves.",
    );
  }

  // Every model-written text.
  const numbers = citedNumbers([...actionEvidence, ...briefEvidence], context.measurements);
  const texts: [string, string][] = [
    ["$.action.title", action.title],
    ["$.action.description", action.description],
    ["$.action.fieldPlan.objective", plan.objective],
    ["$.action.fieldPlan.decisionInformed", plan.decisionInformed],
    ...plan.strata.flatMap((st, j): [string, string][] => [
      [`$.action.fieldPlan.strata[${j}].label`, st.label],
      [`$.action.fieldPlan.strata[${j}].definition`, st.definition],
    ]),
    ...plan.measurements.flatMap((m, j): [string, string][] =>
      (["what", "method", "season", "fieldRole"] as const).map((f): [string, string] => [
        `$.action.fieldPlan.measurements[${j}].${f}`,
        m[f],
      ]),
    ),
    ...plan.deferredGaps.map((g, j): [string, string] => [
      `$.action.fieldPlan.deferredGaps[${j}].reason`,
      g.reason,
    ]),
    ...plan.permissions.map((p, j): [string, string] => [
      `$.action.fieldPlan.permissions[${j}]`,
      p,
    ]),
    ...plan.consultationSteps.map((p, j): [string, string] => [
      `$.action.fieldPlan.consultationSteps[${j}]`,
      p,
    ]),
    ...action.resources.map((r, j): [string, string] => [
      `$.action.resources[${j}].label`,
      r.label,
    ]),
    ...BRIEF_SECTIONS.flatMap((section) =>
      brief[section].map((line, j): [string, string] => [
        `$.brief.${section}[${j}].text`,
        line.text,
      ]),
    ),
  ];
  for (const [path, text] of texts) {
    for (const found of responseTextIssues(text, numbers, context.years))
      add(found.code, path, found.message);
    const outreach = OUTREACH.exec(text);
    if (outreach) {
      add(
        "authority",
        path,
        `"${outreach[0]}" claims or asks for outreach or authorization; Siterra prepares drafts only.`,
      );
    }
  }

  // One package per task: any issue rejects it, so the repair turn sees every issue at once.
  return issues.length === 0
    ? {
        ok: true,
        value: {
          value,
          evidence: [
            ...new Map([...actionEvidence, ...briefEvidence].map((e) => [e.id, e])).values(),
          ],
          interventions,
        },
        issues,
      }
    : { ok: false, issues };
}
