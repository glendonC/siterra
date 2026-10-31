// SYNTHETIC test and preview input for the next-steps package (UI-2 unit 1), until PLATFORM's P9 runs the
// intervention and brief tasks in the live question. Written by hand in the record shapes the brief task commits
// (packages/agent/src/tasks/brief/brief-task.ts); not a model output, not a plan anyone made, never part of the
// seed. It rests on records that exist: the recorded 28 Oct run's merge (its field checks herd_records and
// orchard_history), its hypotheses and its one observation, and the seed's own source excerpts, reused verbatim.
// Every record it adds says so in its limitations, and the brief's mode is replay.

import type {
  BranchMerge,
  Brief,
  BriefItem,
  CaseSnapshot,
  Evidence,
  ExplanationBranch,
  Hypothesis,
  Intervention,
  OperationalAction,
  ResourceRequirement,
  ReviewDecision,
  Task,
} from "@siterra/contracts";

export const SYNTHETIC_NOTE =
  "Synthetic fixture for the interface: written by hand in the brief task's record shapes, not a model output and not a plan anyone made.";
const BRIEF_DRAFT = "Draft prepared by Siterra; nothing is sent, scheduled or authorized.";
const NO_AUTHORITY =
  "Local authority and representation are not established; nothing is sent, scheduled or authorized.";
const RESOURCE = "Unknown, to be established locally.";

export interface RecordedRun {
  branchMergeRecords: BranchMerge[];
  explanationBranchRecords: ExplanationBranch[];
  hypothesisRecords: Hypothesis[];
  evidenceRecords: Evidence[];
}

export const SYNTHETIC_IDS = {
  task: "task_synthetic_brief_package",
  brief: "brief_synthetic_package",
  action: "act_synthetic_field_plan",
  needHerd: "ev_synthetic_need_herd_records",
  needOrchard: "ev_synthetic_need_orchard_history",
} as const;

/**
 * The seed with the recorded run and a synthetic package for the run's command: the brief task belongs to the
 * merge's command, so the package opens from the same results the run's findings do.
 */
export function withSyntheticPackage(
  seed: CaseSnapshot,
  run: RecordedRun,
): { snapshot: CaseSnapshot; commandId: string; briefId: string } {
  const merge = run.branchMergeRecords[0];
  const observed = run.evidenceRecords[0];
  if (!merge || !observed) throw new Error("The recorded run holds no merge or observation");
  const caseId = seed.case.id;
  const at = "2026-10-30T19:40:00.000Z";
  const commandId = merge.commandId;
  const rev = seed.case.revision + 1;
  const ev = (id: string): Evidence => {
    const e = seed.records.evidenceRecords.find((x) => x.id === id);
    if (!e) throw new Error(`The seed holds no ${id}`);
    return e;
  };
  const rangelands = ev("ev_upper_rangelands_vegetation_sci19");
  const cultivated = ev("ev_valley_bottom_cultivated_sci03");
  const herders = ev("ev_herder_reported_species_change_sci03");
  const hyp = (start: string) => {
    const h = run.hypothesisRecords.find((x) => x.statement.startsWith(start));
    if (!h) throw new Error(`The run holds no hypothesis starting "${start}"`);
    return h.id;
  };
  const grazing = hyp("Grazing");
  const landUse = hyp("A change in land use");
  const snow = hyp("Snow cover");

  const provenance = (extra: Partial<Evidence["provenance"]> = {}): Evidence["provenance"] => ({
    sourceLocators: [],
    dataBundleIds: [],
    methodId: null,
    methodVersion: null,
    inputVersions: [],
    generatedByTaskId: SYNTHETIC_IDS.task,
    generatedAt: at,
    verificationStatus: "unverified",
    limitations: [SYNTHETIC_NOTE],
    ...extra,
  });
  // two open gaps, each resting on a seed source excerpt reused verbatim
  const need = (id: string, statement: string, from: Evidence): Evidence => ({
    recordType: "Evidence",
    id,
    revision: 1,
    createdAt: at,
    updatedAt: at,
    caseId,
    statement,
    claimKind: "field_requirement",
    status: "accepted",
    geoSelectionId: null,
    periodIds: [],
    measurementIds: [],
    provenance: provenance({ sourceLocators: from.provenance.sourceLocators.slice(0, 1) }),
    interpretation: null,
    uncertainty: "Not quantified.",
    reviewDecisionIds: [],
  });
  const needHerd = need(
    SYNTHETIC_IDS.needHerd,
    "Herd numbers and routes by season on the upper rangelands must be checked locally; the record holds none.",
    rangelands,
  );
  const needOrchard = need(
    SYNTHETIC_IDS.needOrchard,
    "When the valley-bottom orchards were planted must be checked locally; the record holds no planting years.",
    cultivated,
  );

  const line = (
    text: string,
    claimKind: BriefItem["claimKind"],
    cites: readonly Evidence[],
  ): BriefItem => ({
    text,
    claimKind,
    evidenceIds: cites.map((e) => e.id),
    measurementIds: [...new Set(cites.flatMap((e) => e.measurementIds))],
  });

  const task: Task = {
    recordType: "Task",
    id: SYNTHETIC_IDS.task,
    revision: 1,
    createdAt: at,
    updatedAt: at,
    caseId,
    commandId,
    kind: "brief_package",
    question: "Prepare the next steps for the open explanations.",
    status: "awaiting_review",
    dependsOnTaskIds: [],
    inputVersions: [],
    allowedTools: ["read_case", "read_evidence", "propose_package", "request_review"],
    outputEntityIds: [SYNTHETIC_IDS.action, SYNTHETIC_IDS.brief],
    idempotencyKey: "synthetic-brief-package-1",
    attempt: 0,
    maxModelRounds: 3,
    deadlineAt: "2026-10-30T20:40:00.000Z",
    budgetMicroUsd: 0,
    spentMicroUsd: 0,
    checkpointId: null,
    failureCode: null,
    missingInputs: [],
    startedAt: at,
    finishedAt: at,
  };

  const response = (
    id: string,
    title: string,
    description: string,
    parts: Pick<
      Intervention,
      | "assumptions"
      | "fieldValidationNeeded"
      | "livelihoodConsiderations"
      | "ecologicalConsiderations"
      | "requiredReviewRoles"
      | "evidenceIds"
      | "hypothesisIds"
    >,
  ): Intervention => ({
    recordType: "Intervention",
    id,
    revision: 1,
    createdAt: at,
    updatedAt: at,
    caseId,
    title,
    description,
    status: "candidate",
    resourceRequirementIds: [],
    ...parts,
    provenance: {
      ...provenance(),
      limitations: [
        SYNTHETIC_NOTE,
        "A candidate response, not a recommendation; nothing is decided or authorized.",
        "No benefit, outcome or effect is estimated.",
      ],
    },
  });
  const interventions: Intervention[] = [
    response(
      "int_synthetic_seasonal_rest",
      "Seasonal rest set by the existing pasture institution",
      "If the herd records show heavy spring use of the upper rangelands, a seasonal rest could be discussed within the institution that already sets opening dates.",
      {
        assumptions: ["The institution that sets opening dates also covers the upper rangelands."],
        fieldValidationNeeded: ["Herd numbers and routes by season on the upper rangelands."],
        livelihoodConsiderations: [
          "A rest moves spring grazing elsewhere; who would carry that cost is not in the record.",
        ],
        ecologicalConsiderations: ["No effect of a rest is modeled in this record."],
        requiredReviewRoles: ["community_livelihood", "scientific"],
        evidenceIds: [needHerd.id, rangelands.id, herders.id],
        hypothesisIds: [grazing],
      },
    ),
    response(
      "int_synthetic_orchard_map",
      "Map orchard planting against the greening cells",
      "If landholders share planting years, orchard expansion could be set against the cells that grew greener before any rangeland response is weighed.",
      {
        assumptions: ["Planting years can be recalled or found in local records."],
        fieldValidationNeeded: ["Planting years of the valley-bottom orchards."],
        livelihoodConsiderations: [
          "Orchard records are household information; sharing them is the landholders' choice.",
        ],
        ecologicalConsiderations: [],
        requiredReviewRoles: ["community_livelihood"],
        evidenceIds: [needOrchard.id, cultivated.id],
        hypothesisIds: [landUse],
      },
    ),
    response(
      "int_synthetic_defer",
      "Defer until the field check",
      "Take no response until the field checks report.",
      {
        assumptions: ["The field checks can run within the next spring season."],
        fieldValidationNeeded: [],
        livelihoodConsiderations: [],
        ecologicalConsiderations: [],
        requiredReviewRoles: ["program_coordination"],
        evidenceIds: [needHerd.id, needOrchard.id],
        hypothesisIds: [],
      },
    ),
  ];

  const resource = (
    id: string,
    label: string,
    resourceKind: ResourceRequirement["resourceKind"],
  ): ResourceRequirement => ({
    recordType: "ResourceRequirement",
    id,
    revision: 1,
    createdAt: at,
    updatedAt: at,
    caseId,
    label,
    resourceKind,
    quantity: null,
    unit: null,
    estimateStatus: "unknown",
    assumptions: [],
    verificationNeeded: [RESOURCE],
    provenance: provenance(),
  });
  const resources: ResourceRequirement[] = [
    resource("res_synthetic_team", "A field team for herd interviews in spring", "expertise"),
    resource(
      "res_synthetic_guide",
      "A local guide who knows the upper routes",
      "local_information",
    ),
    resource("res_synthetic_season", "One spring season of field time", "time"),
    resource("res_synthetic_gps", "Handheld GPS units for the field team", "equipment"),
    resource(
      "res_synthetic_permission",
      "Permission of the pasture institution and of landholders",
      "permission",
    ),
  ];

  const reviews: ReviewDecision[] = (["community_livelihood", "scientific"] as const).map(
    (role) => ({
      recordType: "ReviewDecision",
      id: `rev_synthetic_${role}`,
      revision: 1,
      createdAt: at,
      updatedAt: at,
      caseId,
      actionId: SYNTHETIC_IDS.action,
      reviewedEntityVersions: [
        { entityId: SYNTHETIC_IDS.action, revision: 1 },
        { entityId: SYNTHETIC_IDS.brief, revision: 1 },
      ],
      caseRevisionReviewed: rev,
      role,
      actorId: null,
      authorityStatus: "not_established",
      mode: "demo",
      status: "requested",
      decisionAt: null,
      conditions: [],
      comments: "Review requested. The request grants nothing.",
      stale: false,
    }),
  );

  const permissions = [
    "Agreement of the pasture institution before any visit to the upper rangelands.",
    "Agreement of each landholder before any orchard history is recorded.",
  ];
  const consultation = ["A first meeting with the pasture institution to explain the checks."];
  const action: OperationalAction = {
    recordType: "OperationalAction",
    id: SYNTHETIC_IDS.action,
    revision: 1,
    createdAt: at,
    updatedAt: at,
    caseId,
    title: "Field check of herd records and orchard history",
    description:
      "A draft plan for the two field checks that tell the open explanations apart, by kind of place.",
    kind: "field_validation_plan",
    status: "awaiting_review",
    evidenceIds: [needHerd.id, needOrchard.id, observed.id],
    interventionIds: interventions.map((i) => i.id),
    dependsOnActionIds: [],
    resourceRequirementIds: resources.map((r) => r.id),
    requiredReviewRoles: ["community_livelihood", "scientific"],
    reviewDecisionIds: reviews.map((r) => r.id),
    authorizationMode: "demo_only",
    externalExecutionEnabled: false,
    remainingConditions: [...permissions, ...consultation, NO_AUTHORITY],
    preparedArtifactUri: null,
    sourceCaseRevision: rev,
    fieldPlan: {
      objective:
        "Tell grazing, land use and snow or terrain apart as explanations of the greening.",
      decisionInformed: "Which candidate response the reviewers weigh, or whether to defer.",
      strata: [
        {
          key: "elevation_high",
          label: "Upper elevation band",
          definition: "The high elevation band of the terrain strata: 2,815 m and above.",
          dataBundleId: "bundle_terrain_strata_ait_bouguemez",
        },
        {
          key: "valley_bottom_fields",
          label: "Valley-bottom fields and orchards",
          definition: "The cultivated valley bottom the published studies describe.",
          dataBundleId: null,
        },
      ],
      measurements: [
        {
          what: "Herd numbers and routes by season",
          method: "Interviews with herders and the pasture institution, with their own records",
          season: "Spring, before the upper pastures open",
          stratumKeys: ["elevation_high"],
          fieldRole: "Local field team with a guide",
          resolvesGapIds: [needHerd.id],
          discriminatesHypothesisIds: [grazing, snow],
          fieldCheckId: "herd_records",
        },
        {
          what: "Orchard planting years",
          method: "Interviews with landholders, set against dated satellite scenes",
          season: "Any season",
          stratumKeys: ["valley_bottom_fields"],
          fieldRole: "Local field team",
          resolvesGapIds: [needOrchard.id],
          discriminatesHypothesisIds: [landUse, snow],
          fieldCheckId: "orchard_history",
        },
      ],
      deferredGaps: [],
      permissions,
      consultationSteps: consultation,
    },
  };

  const brief: Brief = {
    recordType: "Brief",
    id: SYNTHETIC_IDS.brief,
    revision: 1,
    createdAt: at,
    updatedAt: at,
    caseId,
    title: action.title,
    status: "ready_for_review",
    sourceCaseRevision: rev,
    evidenceIds: [observed.id, rangelands.id, cultivated.id, needHerd.id, needOrchard.id],
    hypothesisIds: [grazing, landUse, snow],
    interventionIds: interventions.map((i) => i.id),
    actionIds: [action.id],
    known: [
      line(observed.statement, "observation", [observed]),
      line(rangelands.statement, "scientific_context", [rangelands]),
      line(cultivated.statement, "scientific_context", [cultivated]),
    ],
    uncertain: [
      line(
        "Whether grazing, land use or snow and terrain best fits the record is open: one season cannot tell them apart.",
        "hypothesis",
        [needHerd],
      ),
      line(needOrchard.statement, "field_requirement", [needOrchard]),
    ],
    nextMeasurements: [
      line(
        "Herd numbers and routes by season, to tell grazing apart from snow and terrain.",
        "field_requirement",
        [needHerd],
      ),
      line(
        "Orchard planting years, to tell land use apart from snow and terrain.",
        "field_requirement",
        [needOrchard],
      ),
    ],
    stakeholderRoles: [
      line(
        "Community and livelihood reviewers, for the herd and orchard records.",
        "field_requirement",
        [needHerd, needOrchard],
      ),
      line("Scientific reviewers, for the field method.", "field_requirement", [needHerd]),
    ],
    preparedActions: [
      line("A draft field plan for the two checks, by kind of place.", "field_requirement", [
        needHerd,
        needOrchard,
      ]),
      line(
        "A list of the resources the checks would need, amounts not estimated.",
        "field_requirement",
        [needHerd],
      ),
      line("Three candidate responses with their assumptions, none ranked.", "field_requirement", [
        needHerd,
        needOrchard,
      ]),
    ],
    authorizationRequired: [
      line(permissions[0] ?? "", "field_requirement", [needHerd]),
      line(permissions[1] ?? "", "field_requirement", [needOrchard]),
      line("Any field work at all: Siterra's role ends at this draft.", "field_requirement", [
        needHerd,
      ]),
    ],
    nextSteps: [
      line(
        "A reviewer reads this draft and decides whether the field checks go ahead.",
        "field_requirement",
        [needHerd],
      ),
    ],
    reviewDecisionIds: reviews.map((r) => r.id),
    limitations: [SYNTHETIC_NOTE, BRIEF_DRAFT],
    mode: "replay",
    provenance: provenance({ limitations: [SYNTHETIC_NOTE, BRIEF_DRAFT] }),
  };

  const r = seed.records;
  return {
    commandId,
    briefId: brief.id,
    snapshot: {
      ...seed,
      case: { ...seed.case, revision: rev },
      records: {
        ...r,
        taskRecords: [...r.taskRecords, task],
        evidenceRecords: [...r.evidenceRecords, ...run.evidenceRecords, needHerd, needOrchard],
        hypothesisRecords: [...r.hypothesisRecords, ...run.hypothesisRecords],
        explanationBranchRecords: [
          ...(r.explanationBranchRecords ?? []),
          ...run.explanationBranchRecords,
        ],
        branchMergeRecords: [...(r.branchMergeRecords ?? []), ...run.branchMergeRecords],
        interventionRecords: [...r.interventionRecords, ...interventions],
        resourceRequirementRecords: [...r.resourceRequirementRecords, ...resources],
        reviewDecisionRecords: [...r.reviewDecisionRecords, ...reviews],
        operationalActionRecords: [...r.operationalActionRecords, action],
        briefRecords: [...r.briefRecords, brief],
      },
    },
  };
}
