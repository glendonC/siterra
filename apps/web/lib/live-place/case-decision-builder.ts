import {
  Brief,
  type BriefItem,
  type Evidence,
  Intervention,
  OperationalAction,
  type Provenance,
  ResourceRequirement,
  ReviewDecision,
  Task,
} from "@siterra/contracts";
import type { BuiltExplanationTree } from "./case-explanation-builder.ts";
import type { SynthesizeCasePackageInput } from "./case-synthesizer.ts";

export interface BuiltDecisionPackage {
  interventions: Intervention[];
  resourceRequirements: ResourceRequirement[];
  reviewDecisions: ReviewDecision[];
  operationalAction: OperationalAction;
  brief: Brief;
  task: Task;
}

/**
 * Builds the 3 candidate Interventions, 5 ResourceRequirements, 2 ReviewDecisions,
 * OperationalAction field validation plan, Brief, and Task record for a live place.
 */
export function buildDecisionPackage(
  input: SynthesizeCasePackageInput,
  exp: BuiltExplanationTree,
  ctx: {
    commandId: string;
    taskId: string;
    actionId: string;
    briefId: string;
    baseProv: (limitations: string[]) => Provenance;
  },
): BuiltDecisionPackage {
  const {
    caseId,
    slug,
    hash6,
    placeName,
    regionName,
    question,
    now,
    bundleId,
    bandLimitM,
    terrain,
    llmResult,
  } = input;
  const {
    studyEv,
    contextEv,
    climateEv,
    needUpper,
    needValley,
    llmVerifiedEvidence,
    hypotheses,
    hypIds,
    grazingCause,
    landCause,
  } = exp;
  const { hypRainId, hypGrazingId, hypLandId, hypSnowId, hypArtefactId } = hypIds;
  const { commandId, taskId, actionId, briefId, baseProv } = ctx;

  const intStewardId = `int_steward_${slug}_${hash6}`;
  const intLandId = `int_land_${slug}_${hash6}`;
  const intDeferId = `int_defer_${slug}_${hash6}`;

  const intProv: Provenance = {
    ...baseProv([
      "A candidate response, not a recommendation; nothing is decided or authorized.",
      "No benefit, outcome or effect is estimated.",
    ]),
    verificationStatus: "unverified",
  };

  const llmStewardInt =
    llmResult?.interventions.find((i) => i.targetExplanation === "grazing") ??
    llmResult?.interventions[0];
  const llmLandInt =
    llmResult?.interventions.find((i) => i.targetExplanation === "land_use") ??
    llmResult?.interventions[1];
  const llmDeferInt = llmResult?.interventions.find((i) => i.targetExplanation === "defer");

  const nonEmptyOrDefault = (arr: string[] | undefined, fallback: string[]) =>
    arr && arr.length > 0 ? arr : fallback;

  const interventions: Intervention[] = [
    Intervention.parse({
      recordType: "Intervention",
      id: intStewardId,
      revision: 1,
      createdAt: now,
      updatedAt: now,
      caseId,
      title:
        llmStewardInt?.title ||
        `Coordinate seasonal upland stewardship above ${String(bandLimitM)} m with local institutions`,
      description:
        llmStewardInt?.description ||
        `If field checks confirm upland grazing or canopy pressure above ${String(bandLimitM)} m in ${placeName}, review seasonal rotation and conservation rules within existing local governance and stewardship frameworks.`,
      status: "candidate",
      assumptions: nonEmptyOrDefault(llmStewardInt?.assumptions, [
        `Existing local land managers and stewardship institutions cover the upland zone above ${String(bandLimitM)} m in ${placeName}.`,
      ]),
      fieldValidationNeeded: nonEmptyOrDefault(llmStewardInt?.fieldValidationNeeded, [
        `Seasonal grazing, land-cover, and stewardship schedules above ${String(bandLimitM)} m.`,
      ]),
      livelihoodConsiderations: nonEmptyOrDefault(llmStewardInt?.livelihoodConsiderations, [
        "Adjusting seasonal access shifts use across elevation bands; local livelihood costs must be weighed by community reviewers.",
      ]),
      ecologicalConsiderations: [
        "No ecological effect of a seasonal adjustment is modeled in this record.",
      ],
      resourceRequirementIds: [],
      requiredReviewRoles: ["community_livelihood", "scientific"],
      evidenceIds: [...new Set([needUpper.id, studyEv.id])],
      hypothesisIds: [hypGrazingId, hypSnowId],
      provenance: intProv,
    }),
    Intervention.parse({
      recordType: "Intervention",
      id: intLandId,
      revision: 1,
      createdAt: now,
      updatedAt: now,
      caseId,
      title:
        llmLandInt?.title ||
        `Map valley-floor water use and parcel history below ${String(bandLimitM)} m`,
      description:
        llmLandInt?.description ||
        `If landholders and local water authorities share parcel or diversion histories below ${String(bandLimitM)} m, set them beside a measured valley-floor vegetation series before weighing catchment-wide actions.`,
      status: "candidate",
      assumptions: nonEmptyOrDefault(llmLandInt?.assumptions, [
        "Valley-floor parcel, irrigation, or land-cover dates can be verified in local records.",
      ]),
      fieldValidationNeeded: nonEmptyOrDefault(llmLandInt?.fieldValidationNeeded, [
        `Parcel management and water diversion dates below ${String(bandLimitM)} m in ${placeName}.`,
      ]),
      livelihoodConsiderations: nonEmptyOrDefault(llmLandInt?.livelihoodConsiderations, [
        "Parcel and water records belong to local landholders and jurisdictions; sharing is voluntary.",
      ]),
      ecologicalConsiderations: [],
      resourceRequirementIds: [],
      requiredReviewRoles: ["community_livelihood"],
      evidenceIds: [...new Set([needValley.id, contextEv.id])],
      hypothesisIds: [hypLandId],
      provenance: intProv,
    }),
    Intervention.parse({
      recordType: "Intervention",
      id: intDeferId,
      revision: 1,
      createdAt: now,
      updatedAt: now,
      caseId,
      title:
        llmDeferInt?.title || "Defer management changes until the two field checks report",
      description:
        llmDeferInt?.description ||
        `Take no management intervention in ${placeName} until a vegetation series is measured and the upland and valley-floor field checks separate the open explanations.`,
      status: "candidate",
      assumptions: [
        "Both field checks can be completed within the next growing season.",
      ],
      fieldValidationNeeded: [],
      livelihoodConsiderations: [],
      ecologicalConsiderations: [],
      resourceRequirementIds: [],
      requiredReviewRoles: ["program_coordination"],
      evidenceIds: [needUpper.id, needValley.id],
      hypothesisIds: [],
      provenance: intProv,
    }),
  ];

  const makeRes = (
    suffix: string,
    label: string,
    resourceKind: ResourceRequirement["resourceKind"],
  ): ResourceRequirement =>
    ResourceRequirement.parse({
      recordType: "ResourceRequirement",
      id: `res_${suffix}_${slug}_${hash6}`,
      revision: 1,
      createdAt: now,
      updatedAt: now,
      caseId,
      label,
      resourceKind,
      quantity: null,
      unit: null,
      estimateStatus: "unknown",
      assumptions: [],
      verificationNeeded: ["Unknown, to be established locally."],
      provenance: intProv,
    });

  const resourceRequirements: ResourceRequirement[] = [
    makeRes("team", `Local field team for upland and valley-floor surveys in ${placeName}`, "expertise"),
    makeRes("guide", `Regional steward or watershed specialist familiar with ${placeName}`, "local_information"),
    makeRes("season", "One growing season of field observation and interviews", "time"),
    makeRes("gps", "GNSS / GPS units and dated satellite reference maps", "equipment"),
    makeRes("perm", `Permission of local landholders and governing authorities in ${regionName}`, "permission"),
  ];

  const reviewDecisions: ReviewDecision[] = (
    ["community_livelihood", "scientific"] as const
  ).map((role) =>
    ReviewDecision.parse({
      recordType: "ReviewDecision",
      id: `rev_${role}_${slug}_${hash6}`,
      revision: 1,
      createdAt: now,
      updatedAt: now,
      caseId,
      actionId,
      reviewedEntityVersions: [
        { entityId: actionId, revision: 1 },
        { entityId: briefId, revision: 1 },
      ],
      caseRevisionReviewed: 1,
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
    `Agreement of local land managers and governing authorities in ${placeName} before any upland survey above ${String(bandLimitM)} m.`,
    `Agreement of valley-floor landholders in ${placeName} before recording parcel or water history.`,
  ];
  const consultationSteps = [
    `Initial consultation with local watershed stewards and community representatives in ${placeName} (${regionName}).`,
  ];

  const operationalAction = OperationalAction.parse({
    recordType: "OperationalAction",
    id: actionId,
    revision: 1,
    createdAt: now,
    updatedAt: now,
    caseId,
    title: `Field check of upland stewardship and valley-floor land use in ${placeName}`,
    description: `Draft field validation plan to separate upland management, valley-floor land use, and topographic moisture across ${placeName}.`,
    kind: "field_validation_plan",
    status: "awaiting_review",
    evidenceIds: [needUpper.id, needValley.id, climateEv.id],
    interventionIds: interventions.map((i) => i.id),
    dependsOnActionIds: [],
    resourceRequirementIds: resourceRequirements.map((r) => r.id),
    requiredReviewRoles: ["community_livelihood", "scientific"],
    reviewDecisionIds: reviewDecisions.map((r) => r.id),
    authorizationMode: "demo_only",
    externalExecutionEnabled: false,
    remainingConditions: [
      ...permissions,
      ...consultationSteps,
      "Local authority and representation are not established; nothing is sent, scheduled or authorized.",
    ],
    preparedArtifactUri: null,
    sourceCaseRevision: 1,
    fieldPlan: {
      objective: `Separate upland stewardship, valley-floor land use, and relief moisture across ${placeName} (${terrain.minElevationM.toFixed(0)}–${terrain.maxElevationM.toFixed(0)} m).`,
      decisionInformed:
        "Which candidate response local reviewers weigh, or whether to defer intervention.",
      strata: [
        {
          key: "elevation_high",
          label: "Upland elevation band",
          definition: `Upper watershed slopes and ridges at ${String(bandLimitM)} m to ${terrain.maxElevationM.toFixed(0)} m.`,
          dataBundleId: bundleId,
        },
        {
          key: "valley_bottom_fields",
          label: "Valley floor and lower basin",
          definition: `Lower catchment corridor from ${terrain.minElevationM.toFixed(0)} m to ${String(bandLimitM)} m.`,
          dataBundleId: bundleId,
        },
      ],
      measurements: [
        {
          what: (
            grazingCause?.fieldCheck.what ||
            `Upland grazing, canopy, and stewardship schedules above ${String(bandLimitM)} m`
          ).slice(0, 290),
          method: (
            grazingCause?.fieldCheck.method ||
            "Structured interviews with local stewards and transect checks across upper elevation bands"
          ).slice(0, 390),
          season: (grazingCause?.fieldCheck.seasonWindow || "Primary growing season").slice(0, 110),
          stratumKeys: ["elevation_high"],
          fieldRole: "Local field team with regional guide",
          resolvesGapIds: [needUpper.id],
          discriminatesHypothesisIds: [hypGrazingId, hypSnowId],
          fieldCheckId: "herd_records",
        },
        {
          what: (
            landCause?.fieldCheck.what ||
            `Valley-floor parcel, irrigation, and land-use history below ${String(bandLimitM)} m`
          ).slice(0, 290),
          method: (
            landCause?.fieldCheck.method ||
            "Landholder and water-manager consultations, later set beside a measured vegetation series"
          ).slice(0, 390),
          season: (landCause?.fieldCheck.seasonWindow || "Any season").slice(0, 110),
          stratumKeys: ["valley_bottom_fields"],
          fieldRole: "Local field team",
          resolvesGapIds: [needValley.id],
          discriminatesHypothesisIds: [hypLandId, hypSnowId],
          fieldCheckId: "orchard_history",
        },
      ],
      deferredGaps: [],
      permissions,
      consultationSteps,
    },
  });

  const line = (
    text: string,
    claimKind: BriefItem["claimKind"],
    cites: readonly Evidence[],
  ): BriefItem => ({
    text: text.slice(0, 395),
    claimKind,
    evidenceIds: cites.map((e) => e.id),
    measurementIds: [...new Set(cites.flatMap((e) => e.measurementIds))],
  });

  const knownLines: BriefItem[] = [
    ...(llmResult?.briefSummary
      ? [
          line(
            llmResult.briefSummary,
            "scientific_context",
            llmVerifiedEvidence.length > 0 ? llmVerifiedEvidence : [studyEv],
          ),
        ]
      : []),
    line(climateEv.statement, climateEv.claimKind, [climateEv]),
    line(studyEv.statement, "scientific_context", [studyEv]),
    ...(contextEv.id !== studyEv.id
      ? [line(contextEv.statement, contextEv.claimKind, [contextEv])]
      : []),
    ...llmVerifiedEvidence.map((ev) => line(ev.statement, "scientific_context", [ev])),
  ];

  const brief = Brief.parse({
    recordType: "Brief",
    id: briefId,
    revision: 1,
    createdAt: now,
    updatedAt: now,
    caseId,
    title: operationalAction.title,
    status: "ready_for_review",
    sourceCaseRevision: 1,
    evidenceIds: [
      ...new Set([
        climateEv.id,
        studyEv.id,
        contextEv.id,
        needUpper.id,
        needValley.id,
        ...llmVerifiedEvidence.map((e) => e.id),
      ]),
    ],
    hypothesisIds: [hypRainId, hypGrazingId, hypLandId, hypSnowId],
    interventionIds: interventions.map((i) => i.id),
    actionIds: [operationalAction.id],
    known: knownLines,
    uncertain: [
      line(
        `Whether vegetation in ${placeName} has changed since 2000 is not measured; if it has, separating rainfall, upland management, valley-floor land use and topographic moisture needs that series and field checks.`,
        "hypothesis",
        [needUpper],
      ),
      line(needValley.statement, "field_requirement", [needValley]),
    ],
    nextMeasurements: [
      line(`A satellite vegetation series (NDVI, 2000 to 2024) across ${placeName}, to say whether vegetation changed at all.`, "field_requirement", [climateEv]),
      line(`Upland stewardship and grazing schedules above ${String(bandLimitM)} m, to separate upland management from terrain moisture.`, "field_requirement", [needUpper]),
      line(`Valley-floor parcel and water history below ${String(bandLimitM)} m, to separate land-use change from climate trends.`, "field_requirement", [needValley]),
    ],
    stakeholderRoles: [
      line(`Community and livelihood reviewers in ${placeName}, for local land-use and stewardship records.`, "field_requirement", [needUpper, needValley]),
      line("Scientific reviewers, for watershed stratification and field validation protocol.", "field_requirement", [needUpper]),
    ],
    preparedActions: [
      line(`A draft field validation plan stratified at ${String(bandLimitM)} m across ${placeName}.`, "field_requirement", [needUpper, needValley]),
      line("Five resource requirements for the field checks, quantities to be established locally.", "field_requirement", [needUpper]),
      line("Three candidate responses with stated assumptions, none ranked or authorized.", "field_requirement", [needUpper, needValley]),
    ],
    authorizationRequired: [
      line(permissions[0] ?? "", "field_requirement", [needUpper]),
      line(permissions[1] ?? "", "field_requirement", [needValley]),
      line("Any field work at all: Siterra's role ends at this draft.", "field_requirement", [needUpper]),
    ],
    nextSteps: [
      line("A reviewer inspects the competing explanations and decides whether the field checks proceed.", "field_requirement", [needUpper]),
    ],
    reviewDecisionIds: reviewDecisions.map((r) => r.id),
    limitations: [
      "Built from the Open-Meteo rainfall series (ERA5 reanalysis), the terrain elevation grid and indexed literature. No vegetation series is measured; field checks are required before any intervention.",
      "Draft prepared by Siterra; nothing is sent, scheduled or authorized.",
    ],
    mode: llmResult ? "live" : "replay",
    provenance: {
      ...intProv,
      // the brief cites every evidence, hypothesis and intervention it names, at its revision, so it
      // goes stale when any of them changes (commit.ts uncoveredBriefCitations)
      inputVersions: [
        ...new Map(
          [
            climateEv,
            studyEv,
            contextEv,
            needUpper,
            needValley,
            ...llmVerifiedEvidence,
            ...hypotheses.filter((h) => h.id !== hypArtefactId),
            ...interventions,
          ].map((r) => [r.id, { entityId: r.id, revision: r.revision }] as const),
        ).values(),
      ],
    },
  });

  const task = Task.parse({
    recordType: "Task",
    id: taskId,
    revision: 1,
    createdAt: now,
    updatedAt: now,
    caseId,
    commandId,
    kind: "brief_package",
    question,
    status: "awaiting_review",
    dependsOnTaskIds: [],
    inputVersions: [],
    allowedTools: ["read_case", "read_evidence", "propose_package", "request_review"],
    outputEntityIds: [operationalAction.id, brief.id],
    idempotencyKey: `synth-brief-${slug}-${hash6}`,
    attempt: 0,
    maxModelRounds: 3,
    deadlineAt: now,
    budgetMicroUsd: 0,
    spentMicroUsd: 0,
    checkpointId: null,
    failureCode: null,
    missingInputs: [],
    startedAt: now,
    finishedAt: now,
  });

  return {
    interventions,
    resourceRequirements,
    reviewDecisions,
    operationalAction,
    brief,
    task,
  };
}
