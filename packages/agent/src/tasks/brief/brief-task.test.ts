import {
  Brief,
  OperationalAction,
  Relationship,
  ResourceRequirement,
  ReviewDecision,
} from "@siterra/contracts";
import { eventMessages, fieldPlanIssues } from "@siterra/domain";
import { describe, expect, it } from "vitest";

import { MetaAdapter } from "../../model/adapter.ts";
import { strictSubsetIssues } from "../../model/strict-schema.ts";
import type { ModelTransport } from "../../model/transport.ts";
import { AT, CASE_ID, bundle, queuedTask, testStore } from "../../testing/case-fixture.ts";
import { answerStep, syntheticTransport } from "../../testing/replay-steps.ts";
import type { MemoryCaseStore } from "../../tools/store.ts";
import { caseToolRegistry } from "../../tools/registry.ts";
import type {
  BranchMergeRecord,
  EvidenceRecord,
  HypothesisRecord,
  InterventionRecord,
} from "../records.ts";
import { hypothesisIdFor } from "../branches/branch-task.ts";
import { PACKAGE_TEXT, runBriefPackageTask } from "./brief-task.ts";
import { packageOutputSchema, validatePackageProposal } from "./proposal.ts";
import type { PackageContext } from "./proposal.ts";

// Synthetic evidence, a synthetic candidate response and synthetic replays; nothing here is a plan
// anyone has made or a review anyone has asked for.

function evidence(
  id: string,
  claimKind: EvidenceRecord["claimKind"],
  statement: string,
  measurementIds: string[] = [],
): EvidenceRecord {
  return {
    recordType: "Evidence",
    id,
    revision: 1,
    createdAt: AT.toISOString(),
    updatedAt: AT.toISOString(),
    caseId: CASE_ID,
    statement,
    claimKind,
    status: "accepted",
    geoSelectionId: null,
    periodIds: [],
    measurementIds,
    provenance: {
      sourceLocators: [],
      dataBundleIds: [],
      methodId: null,
      methodVersion: null,
      inputVersions: [],
      generatedByTaskId: null,
      generatedAt: AT.toISOString(),
      verificationStatus: "computed_checked",
      limitations: [],
    },
    interpretation: null,
    uncertainty: "Not quantified.",
    reviewDecisionIds: [],
  };
}

const OBS = evidence(
  "ev_test_obs",
  "observation",
  "The catchment NDVI area median was 0.1439 in April 2022.",
  ["meas_test_2022-04"],
);
const NEED = evidence(
  "ev_test_need",
  "field_requirement",
  "Who decides pasture rest dates must be checked locally.",
);
const GAP2 = evidence(
  "ev_test_gap2",
  "field_requirement",
  "Current herd routes in spring must be checked locally.",
);
const REST: InterventionRecord = {
  recordType: "Intervention",
  id: "int_test_rest",
  revision: 1,
  createdAt: AT.toISOString(),
  updatedAt: AT.toISOString(),
  caseId: CASE_ID,
  title: "Negotiated seasonal rest within existing institutions",
  description: "If the field check confirms who sets rest dates, a rest could be discussed.",
  status: "candidate",
  evidenceIds: ["ev_test_obs", "ev_test_need"],
  hypothesisIds: [],
  assumptions: ["The existing institutions set rest dates."],
  ecologicalConsiderations: [],
  livelihoodConsiderations: [],
  resourceRequirementIds: [],
  fieldValidationNeeded: ["Who decides pasture rest dates."],
  requiredReviewRoles: ["community_livelihood"],
  provenance: {
    sourceLocators: [],
    dataBundleIds: [],
    methodId: null,
    methodVersion: null,
    inputVersions: [],
    generatedByTaskId: null,
    generatedAt: AT.toISOString(),
    verificationStatus: "unverified",
    limitations: [],
  },
};

const line = (text: string, claimKind: string, evidenceIds: string[]) => ({
  text,
  claimKind,
  evidenceIds,
});

function plan(extra: Record<string, unknown> = {}) {
  return {
    objective: "Find out who sets pasture rest dates in the upper band.",
    decisionInformed: "Which candidate response the reviewers consider.",
    strata: [
      {
        key: "upper_band",
        label: "Upper grazing band",
        definition: "Pasture above the summer settlements, used in late spring.",
      },
    ],
    measurements: [
      {
        what: "Who sets rest dates",
        method: "Interviews with institution roles",
        season: "Spring",
        stratumKeys: ["upper_band"],
        fieldRole: "Local field team",
        resolvesGapIds: ["ev_test_need"],
        discriminatesHypothesisIds: [],
        fieldCheckId: null,
      },
    ],
    deferredGaps: [],
    permissions: ["Agreement of the local pasture institution before any visit."],
    consultationSteps: ["Consultation with the local pasture institution."],
    ...extra,
  };
}

function proposal(
  extra: {
    action?: Record<string, unknown>;
    brief?: Record<string, unknown>;
    reviewRoles?: unknown;
  } = {},
) {
  return {
    action: {
      kind: "field_validation_plan",
      title: "Field check of pasture rest roles",
      description:
        "Find out who sets pasture rest dates in the upper band, to inform which candidate response the reviewers consider.",
      fieldPlan: plan(),
      resources: [{ kind: "local_information", label: "Who sets rest dates" }],
      evidenceIds: ["ev_test_need"],
      interventionIds: ["int_test_rest"],
      ...extra.action,
    },
    brief: {
      known: [
        line("The catchment NDVI area median was 0.1439 in April 2022.", "observation", [
          "ev_test_obs",
        ]),
      ],
      uncertain: [
        line("Whether lower spring rainfall explains the April values.", "hypothesis", [
          "ev_test_obs",
        ]),
      ],
      nextMeasurements: [
        line(
          "Who sets rest dates; interviews with institution roles; spring; upper band; local team; resolves the open role question.",
          "field_requirement",
          ["ev_test_need"],
        ),
      ],
      stakeholderRoles: [
        line("The local pasture institution and the program team.", "field_requirement", [
          "ev_test_need",
        ]),
      ],
      preparedActions: [],
      authorizationRequired: [
        line("Any visit waits for the local institution's own decision.", "field_requirement", [
          "ev_test_need",
        ]),
      ],
      nextSteps: [],
      ...extra.brief,
    },
    reviewRoles: extra.reviewRoles ?? ["scientific", "community_livelihood"],
  };
}

function check(
  value: unknown,
  openGapIds: string[] = ["ev_test_need"],
  extra: Partial<PackageContext> = {},
) {
  const store = testStore();
  return validatePackageProposal(JSON.stringify(value), {
    evidence: new Map([OBS, NEED, GAP2].map((e) => [e.id, e])),
    interventions: new Map([[REST.id, REST]]),
    openGapIds: new Set(openGapIds),
    hypothesisIds: new Set(["hyp_test_rain"]),
    measurements: new Map(store.measurements.map((m) => [m.id, m])),
    years: { first: 2022, last: 2022 },
    ...extra,
  });
}
const codes = (value: unknown, openGapIds?: string[], extra?: Partial<PackageContext>) =>
  check(value, openGapIds, extra).issues.map((i) => `${i.code} ${i.path}`);

describe("propose_package validation", () => {
  it("accepts a draft plan and a brief whose lines cite matching evidence", () => {
    expect(check(proposal()).issues).toEqual([]);
  });

  it("needs permissions, review roles, cited evidence and a next measurement", () => {
    expect(
      codes(proposal({ action: { fieldPlan: plan({ permissions: [], consultationSteps: [] }) } })),
    ).toEqual(["claim_kind $.action.fieldPlan.permissions"]);
    expect(codes(proposal({ reviewRoles: [] }))).toEqual(["claim_kind $.reviewRoles"]);
    expect(
      codes(
        proposal({
          brief: {
            stakeholderRoles: [line("The local pasture institution.", "field_requirement", [])],
          },
        }),
      ),
    ).toEqual(["claim_kind $.brief.stakeholderRoles[0].evidenceIds"]);
    expect(codes(proposal({ brief: { nextMeasurements: [] } }))).toEqual([
      "claim_kind $.brief.nextMeasurements",
    ]);
  });

  it("checks each line's claim kind against its section and its evidence", () => {
    expect(
      codes(
        proposal({
          brief: {
            known: [line("Who sets dates must be checked.", "field_requirement", ["ev_test_need"])],
          },
        }),
      ),
    ).toContain("claim_kind $.brief.known[0].claimKind");
    expect(
      codes(
        proposal({
          brief: {
            known: [line("A published closure applies.", "scientific_context", ["ev_test_obs"])],
          },
        }),
      ),
    ).toEqual(["claim_kind $.brief.known[0].claimKind"]);
    expect(
      codes(
        proposal({
          brief: { nextSteps: [line("The rest worked.", "verified_outcome", ["ev_test_obs"])] },
        }),
      ),
    ).toContain("claim_kind $.brief.nextSteps[0].claimKind");
    expect(
      codes(
        proposal({
          brief: {
            known: [
              {
                ...line("The NDVI area median was 0.1439 in April 2022.", "observation", [
                  "ev_test_obs",
                ]),
                measurementIds: ["meas_test_2022-04"],
              },
            ],
          },
        }),
      ),
    ).toEqual(["schema $.brief.known[0]"]);
  });

  it("refuses outreach, directives, people counts and unknown references", () => {
    expect(
      codes(
        proposal({
          action: {
            description: "The plan has been sent to the association for the decision it informs.",
          },
        }),
      ),
    ).toContain("authority $.action.description");
    expect(
      codes(
        proposal({
          brief: {
            nextSteps: [
              line("Schedule the visit with the institution.", "field_requirement", [
                "ev_test_need",
              ]),
            ],
          },
        }),
      ),
    ).toContain("authority $.brief.nextSteps[0].text");
    expect(
      codes(
        proposal({
          action: { fieldPlan: plan({ permissions: ["Herders must agree before any visit."] }) },
        }),
      ),
    ).toContain("prohibited_claim $.action.fieldPlan.permissions[0]");
    expect(
      codes(
        proposal({
          brief: {
            stakeholderRoles: [
              line("About 120 households use the band.", "field_requirement", ["ev_test_need"]),
            ],
          },
        }),
      ),
    ).toContain("prohibited_claim $.brief.stakeholderRoles[0].text");
    expect(codes(proposal({ action: { interventionIds: ["int_test_none"] } }))).toEqual([
      "unknown_reference $.action.interventionIds[0]",
    ]);
  });

  it("refuses active outreach and agreement claims, and keeps permission nouns (b48)", () => {
    for (const text of [
      "Siterra contacted the commune about the agdal dates.",
      "A letter went to the caidat last week.",
      "The association agreed to the field visit.",
      "Permission from the commune is granted.",
    ]) {
      expect(
        codes(proposal({ action: { fieldPlan: plan({ permissions: [text] }) } })),
        text,
      ).toContain("authority $.action.fieldPlan.permissions[0]");
    }
    expect(
      codes(
        proposal({
          action: {
            fieldPlan: plan({ permissions: ["Permission from the commune, to be established."] }),
          },
        }),
      ),
    ).toEqual([]);
  });

  it("binds the outreach and agreement verbs to an actor after any word, so neutral wording passes (18f, b49)", () => {
    for (const definition of [
      "Accepted evidence shows the upper band is grazed in late spring.",
      "The upper pasture, called the agdal, rests in spring.",
      "Slopes not visited by the field survey, above the summer settlements.",
      "The upper band was not visited by the field survey.",
      "Pasture that rests until the association agrees on dates.",
    ]) {
      const fieldPlan = plan({ strata: [{ ...plan().strata[0], definition }] });
      expect(codes(proposal({ action: { fieldPlan } })), definition).toEqual([]);
    }
    for (const text of [
      "The report states the commune agreed to the dates.",
      "Siterra has already sent the plan to the council.",
      "The plan was formally approved by the council.",
      "The record suggests the commune agreed to the dates.",
      "Notes imply the council approved the plan.",
      "It appears the association consented.",
      // Claim forms with no actor (18f): at a sentence start, or after a comma or a semicolon.
      "Contacted the commune about the agdal dates.",
      "Approved by the commune council.",
      "Signed by the association on 2 May.",
      "Sent to the caidat last week.",
      "Agreed with the association on the dates.",
      "Has consented to the dates.",
      "Visited the upper pasture in May.",
      "The plan, approved by the council, closes the upper band.",
      "The grazing calendar, agreed with the association, starts in May.",
      "Dates set; approved by the council.",
    ]) {
      expect(
        codes(proposal({ action: { fieldPlan: plan({ permissions: [text] }) } })),
        text,
      ).toContain("authority $.action.fieldPlan.permissions[0]");
    }
  });

  it("refuses a consultation step written as a command and suggests a noun phrase (b48 note)", () => {
    const found = check(
      proposal({
        action: { fieldPlan: plan({ consultationSteps: ["Consult the commune council."] }) },
      }),
    ).issues;
    expect(found.map((i) => `${i.code} ${i.path}`)).toEqual([
      "prohibited_claim $.action.fieldPlan.consultationSteps[0]",
    ]);
    expect(found[0]?.message).toContain(
      '"Consultation with the commune council on the access calendar"',
    );
  });

  it("covers every open gap of the case: measured, or deferred with a reason (DF-06)", () => {
    // ev_test_gap2 is open and in no measurement: refused until it is deferred with a reason.
    const both = ["ev_test_need", "ev_test_gap2"];
    expect(codes(proposal(), both)).toEqual(["coverage $.action.fieldPlan"]);
    const deferred = plan({
      deferredGaps: [{ gapId: "ev_test_gap2", reason: "Waits for the spring access window." }],
    });
    expect(codes(proposal({ action: { fieldPlan: deferred } }), both)).toEqual([]);
    const undefinedStratum = plan({
      measurements: [{ ...plan().measurements[0], stratumKeys: ["lower_band"] }],
    });
    expect(codes(proposal({ action: { fieldPlan: undefinedStratum } }))).toEqual([
      "coverage $.action.fieldPlan",
    ]);
    const resolvesNothing = plan({
      measurements: [{ ...plan().measurements[0], resolvesGapIds: [] }],
      deferredGaps: [{ gapId: "ev_test_need", reason: "Waits for the spring access window." }],
    });
    expect(codes(proposal({ action: { fieldPlan: resolvesNothing } }))).toEqual([
      "coverage $.action.fieldPlan",
    ]);
    const badKey = plan({ strata: [{ ...plan().strata[0], key: "Upper Band" }] });
    expect(codes(proposal({ action: { fieldPlan: badKey } }))).toContain(
      "schema $.action.fieldPlan.strata[0].key",
    );
  });

  it("runs the livelihood rules on strata and measurement text (b46)", () => {
    const counted = plan({
      strata: [{ ...plan().strata[0], definition: "Pasture used by about 120 households." }],
    });
    expect(codes(proposal({ action: { fieldPlan: counted } }))).toContain(
      "prohibited_claim $.action.fieldPlan.strata[0].definition",
    );
    const named = plan({
      measurements: [{ ...plan().measurements[0], fieldRole: "The amghar, Moha Ouali" }],
    });
    expect(codes(proposal({ action: { fieldPlan: named } }))).toContain(
      "prohibited_claim $.action.fieldPlan.measurements[0].fieldRole",
    );
    const contact = plan({
      measurements: [{ ...plan().measurements[0], method: "Call 0612345678 for interviews" }],
    });
    expect(codes(proposal({ action: { fieldPlan: contact } }))).toContain(
      "prohibited_claim $.action.fieldPlan.measurements[0].method",
    );
  });

  it("the output schema fits the strict subset", () => {
    expect(strictSubsetIssues(packageOutputSchema())).toEqual([]);
  });
});

// The plan ties to the land: strata keys come from the case's strata bundle and a measurement
// names the field check of the explanation merge it serves.
describe("the strata and field checks of the plan", () => {
  const STRATA = {
    bundleId: "bundle_test_strata",
    keys: new Set(["elevation_high", "elevation_low"]),
  };
  const onBand = (extra: Record<string, unknown> = {}) =>
    plan({
      strata: [{ key: "elevation_high", label: "Upper third", definition: "The highest third." }],
      measurements: [
        {
          ...plan().measurements[0],
          stratumKeys: ["elevation_high"],
          fieldCheckId: "herd_records",
          ...extra,
        },
      ],
    });
  const withPlan = (fieldPlan: unknown) => proposal({ action: { fieldPlan } });
  const merged: Partial<PackageContext> = {
    strata: STRATA,
    fieldCheckIds: new Set(["herd_records", "local_rain_records"]),
  };

  it("accepts a stratum key of the strata bundle and a field check of the merge", () => {
    expect(codes(withPlan(onBand()), undefined, merged)).toEqual([]);
  });

  it("refuses a stratum key the strata bundle does not list, and names the keys it does", () => {
    const found = check(withPlan(plan()), undefined, merged).issues;
    expect(found.map((i) => `${i.code} ${i.path}`)).toContain(
      "unknown_reference $.action.fieldPlan.strata[0].key",
    );
    expect(found.find((i) => i.path.endsWith("strata[0].key"))?.message).toContain(
      "elevation_high",
    );
  });

  it("refuses a field check the merge does not hold, and accepts none: a measurement may serve no check", () => {
    const path = "unknown_reference $.action.fieldPlan.measurements[0].fieldCheckId";
    expect(codes(withPlan(onBand({ fieldCheckId: "soil_survey" })), undefined, merged)).toEqual([
      path,
    ]);
    expect(codes(withPlan(onBand({ fieldCheckId: null })), undefined, merged)).toEqual([]);
  });

  describe("a field check stands only when it fits the measurement (P9d)", () => {
    // The checks and hypotheses of a run: each hypothesis belongs to an explanation, each check
    // separates pairs of explanations. A measurement tells apart the explanations of the
    // hypotheses it discriminates.
    const fit = (mode: "refuse" | "clear"): NonNullable<PackageContext["checkFit"]> => ({
      mode,
      explanationOfHypothesis: new Map([
        ["hyp_rain", "rainfall"],
        ["hyp_graze", "grazing"],
        ["hyp_land", "land_use"],
        ["hyp_snow", "snow_terrain"],
      ]),
      separates: new Map<string, readonly (readonly [string, string])[]>([
        [
          "local_rain_records",
          [
            ["land_use", "rainfall"],
            ["rainfall", "snow_terrain"],
          ],
        ],
        [
          "orchard_history",
          [
            ["land_use", "rainfall"],
            ["land_use", "snow_terrain"],
          ],
        ],
      ]),
    });
    const ctx = (mode: "refuse" | "clear"): Partial<PackageContext> => ({
      strata: STRATA,
      fieldCheckIds: new Set(["local_rain_records", "orchard_history"]),
      checkFit: fit(mode),
    });
    const measuring = (hypotheses: string[], fieldCheckId: string | null) =>
      withPlan(onBand({ fieldCheckId, discriminatesHypothesisIds: hypotheses }));
    const fieldPath = "coverage $.action.fieldPlan.measurements[0].fieldCheckId";
    // hypothesisIds must exist in the case to pass the plan rule (DF-06): give the context them.
    const withHyps = (mode: "refuse" | "clear"): Partial<PackageContext> => ({
      ...ctx(mode),
      hypothesisIds: new Set(["hyp_rain", "hyp_graze", "hyp_land", "hyp_snow"]),
    });

    it("stands when the explanations the measurement tells apart include a pair the check separates", () => {
      expect(
        codes(
          measuring(["hyp_land", "hyp_rain"], "orchard_history"),
          undefined,
          withHyps("refuse"),
        ),
      ).toEqual([]);
      expect(
        codes(
          measuring(["hyp_rain", "hyp_snow"], "local_rain_records"),
          undefined,
          withHyps("refuse"),
        ),
      ).toEqual([]);
    });

    it("stands for a measurement on one explanation that the check separates from another", () => {
      expect(
        codes(measuring(["hyp_rain"], "local_rain_records"), undefined, withHyps("refuse")),
      ).toEqual([]);
      expect(
        codes(measuring(["hyp_land"], "orchard_history"), undefined, withHyps("refuse")),
      ).toEqual([]);
    });

    it("is refused, first turn, when no pair the measurement tells apart is one the check separates", () => {
      expect(
        codes(measuring(["hyp_graze"], "local_rain_records"), undefined, withHyps("refuse")),
      ).toEqual([fieldPath]);
      expect(
        codes(
          measuring(["hyp_rain", "hyp_snow"], "orchard_history"),
          undefined,
          withHyps("refuse"),
        ),
      ).toEqual([fieldPath]);
      expect(codes(measuring([], "local_rain_records"), undefined, withHyps("refuse"))).toEqual([
        fieldPath,
      ]);
    });

    it("is set to null on the repaired turn, with no issue, and the rest of the plan is kept", () => {
      const result = check(
        measuring(["hyp_graze"], "local_rain_records"),
        undefined,
        withHyps("clear"),
      );
      expect(result.issues).toEqual([]);
      expect(
        result.ok && result.value.value.action.fieldPlan.measurements[0]?.fieldCheckId,
      ).toBeNull();
      expect(result.ok && result.value.value.action.fieldPlan.measurements[0]?.stratumKeys).toEqual(
        ["elevation_high"],
      );
    });

    it("leaves a fitting check alone on the repaired turn, and a null as it is", () => {
      const fitting = check(
        measuring(["hyp_land", "hyp_rain"], "orchard_history"),
        undefined,
        withHyps("clear"),
      );
      expect(fitting.ok && fitting.value.value.action.fieldPlan.measurements[0]?.fieldCheckId).toBe(
        "orchard_history",
      );
      const none = check(measuring(["hyp_graze"], null), undefined, withHyps("refuse"));
      expect(none.issues).toEqual([]);
    });

    it("asks nothing of fit without the merge's data", () => {
      expect(
        codes(withPlan(onBand({ discriminatesHypothesisIds: [] })), undefined, merged),
      ).toEqual([]);
    });
  });

  it("allows no field check when no merge is in the command, and refuses one then", () => {
    const noMerge = { strata: STRATA };
    expect(codes(withPlan(onBand({ fieldCheckId: null })), undefined, noMerge)).toEqual([]);
    expect(codes(withPlan(onBand()), undefined, noMerge)).toEqual([
      "unknown_reference $.action.fieldPlan.measurements[0].fieldCheckId",
    ]);
  });

  it("leaves a case without a strata bundle with its own stratum keys", () => {
    expect(codes(withPlan(plan()), undefined, {})).toEqual([]);
  });
});

async function run(
  store: MemoryCaseStore,
  answer: unknown,
  committedInterventions = [REST],
  sentOutputLimits: unknown[] = [],
  missingInputs: string[] = [],
  extraDeps: {
    committedBranchMerges?: BranchMergeRecord[];
    sentTexts?: string[];
    moreAnswers?: unknown[];
  } = {},
) {
  const replay = syntheticTransport(
    [answer, ...(extraDeps.moreAnswers ?? [])].map((a) => answerStep(JSON.stringify(a))),
  );
  const transport: ModelTransport = {
    route: replay.route,
    replayOrigin: replay.replayOrigin,
    open: (body, signal) => {
      sentOutputLimits.push(body.max_output_tokens);
      extraDeps.sentTexts?.push(JSON.stringify(body.input));
      return replay.open(body, signal);
    },
  };
  let n = 0;
  return runBriefPackageTask(
    {
      task: queuedTask({
        id: "task_test_brief",
        kind: "brief_package",
        inputVersions: [
          { entityId: "ev_test_obs", revision: 1 },
          { entityId: "ev_test_need", revision: 1 },
        ],
        allowedTools: ["read_case", "propose_package", "request_review", "propose_layout"],
        missingInputs,
      }),
      expectedCaseRevision: 5,
    },
    {
      adapter: new MetaAdapter({
        transport,
        sleep: () => Promise.resolve(),
      }),
      trace: { emit: () => undefined },
      store,
      tools: caseToolRegistry(store, CASE_ID),
      newEvidenceId: () => `ev_test_${String((n += 1))}`,
      newRecordId: (prefix) => `${prefix}_test_${String((n += 1))}`,
      committedInterventions,
      ...(extraDeps.committedBranchMerges
        ? { committedBranchMerges: extraDeps.committedBranchMerges }
        : {}),
      now: () => AT,
    },
  );
}

describe("brief_package task", () => {
  it("asks for up to 8,000 output tokens: two of three live briefs stopped at 6,000 (28 Oct 2026)", async () => {
    const store = testStore();
    store.evidence.push(OBS, NEED);
    const sent: unknown[] = [];
    await run(store, proposal(), [REST], sent);
    expect(sent).toEqual([8_000]);
  });

  it("commits a draft plan, a brief, resources and host-written review requests that parse with the contracts", async () => {
    const store = testStore();
    store.evidence.push(OBS, NEED);
    const { loop, commit } = await run(store, proposal());
    expect(loop.status).toBe("accepted");
    const byType = (t: string) => commit.upserts.filter((r) => r.recordType === t);
    const [action] = byType("OperationalAction");
    const [brief] = byType("Brief");
    expect(action).toMatchObject({
      status: "awaiting_review",
      externalExecutionEnabled: false,
      authorizationMode: "demo_only",
      interventionIds: ["int_test_rest"],
      requiredReviewRoles: ["scientific", "community_livelihood"],
      fieldPlan: {
        objective: plan().objective,
        strata: [{ key: "upper_band", dataBundleId: null }],
        deferredGaps: [],
      },
    });
    // The stored plan holds the rule the commit enforces.
    if (action?.recordType !== "OperationalAction") throw new Error("no action");
    expect(
      fieldPlanIssues(action, { openGapIds: new Set(["ev_test_need"]), hypothesisIds: new Set() }),
    ).toEqual([]);
    expect(action.remainingConditions).toEqual([
      "Agreement of the local pasture institution before any visit.",
      "Consultation with the local pasture institution.",
      PACKAGE_TEXT.noAuthority,
    ]);
    expect(brief).toMatchObject({
      status: "ready_for_review",
      actionIds: [action.id],
      interventionIds: ["int_test_rest"],
    });
    expect(byType("ResourceRequirement")).toMatchObject([
      {
        resourceKind: "local_information",
        quantity: null,
        estimateStatus: "unknown",
        verificationNeeded: [PACKAGE_TEXT.resource],
      },
    ]);
    // Each request is exactly what PLATFORM's commit accepts as a request (isReviewRequest).
    const requests = byType("ReviewDecision");
    expect(requests.map((r) => r.recordType === "ReviewDecision" && [r.role, r.comments])).toEqual([
      ["scientific", eventMessages.reviewRequested("scientific")],
      ["community_livelihood", eventMessages.reviewRequested("community_livelihood")],
    ]);
    for (const r of requests) {
      expect(r).toMatchObject({
        revision: 1,
        status: "requested",
        mode: "demo",
        authorityStatus: "not_established",
        actorId: null,
        decisionAt: null,
        conditions: [],
        stale: false,
        actionId: action.id,
        caseRevisionReviewed: 5,
      });
    }
    expect(
      byType("Relationship").map(
        (r) => r.recordType === "Relationship" && `${r.fromEntityId} ${r.kind}`,
      ),
    ).toEqual([`${action.id} requires_authorization`, `${action.id} requires_authorization`]);
    const parsers: Record<string, { safeParse: (v: unknown) => { success: boolean } }> = {
      OperationalAction,
      Brief,
      ResourceRequirement,
      ReviewDecision,
      Relationship,
    };
    for (const r of commit.upserts.slice(1)) {
      expect(parsers[r.recordType]?.safeParse(r).success, r.id).toBe(true);
    }
    expect(commit.events[0]?.message).toBe(
      "Brief package prepared a draft plan and brief; reviews requested.",
    );
  });

  it("code fills each brief line's measurement IDs from its cited evidence; the model writes none (live run of 28 Oct 2026)", async () => {
    expect(JSON.stringify(packageOutputSchema())).not.toContain("measurementIds");
    const store = testStore();
    store.evidence.push(OBS, NEED);
    const { loop, commit } = await run(store, proposal());
    expect(loop.status).toBe("accepted");
    expect(commit.upserts.find((r) => r.recordType === "Brief")).toMatchObject({
      known: [{ evidenceIds: ["ev_test_obs"], measurementIds: ["meas_test_2022-04"] }],
      nextMeasurements: [{ evidenceIds: ["ev_test_need"], measurementIds: [] }],
    });
  });

  it("RL-02 a failed dependency named by the coordinator keeps the package a draft and says so", async () => {
    const store = testStore();
    store.evidence.push(OBS, NEED);
    const failed = "Dependency task_test_obs (observation analysis) ended failed: executor error.";
    const { loop, commit } = await run(store, proposal(), [REST], [], [failed]);
    expect(loop.status).toBe("accepted");
    const action = commit.upserts.find((r) => r.recordType === "OperationalAction");
    const brief = commit.upserts.find((r) => r.recordType === "Brief");
    expect(action).toMatchObject({ status: "blocked", reviewDecisionIds: [] });
    expect(action?.recordType === "OperationalAction" && action.remainingConditions).toContain(
      failed,
    );
    expect(brief).toMatchObject({ status: "draft", reviewDecisionIds: [] });
    expect(brief?.recordType === "Brief" && brief.limitations).toContain(failed);
    expect(commit.upserts.some((r) => r.recordType === "ReviewDecision")).toBe(false);
    expect(commit.upserts[0]).toMatchObject({ status: "succeeded", missingInputs: [failed] });
  });

  it("blocks ready for review and requests nothing while a critical dependency is missing", async () => {
    const store = testStore();
    store.evidence.push(OBS, NEED);
    const { commit } = await run(store, proposal({ action: { interventionIds: [] } }), []);
    const action = commit.upserts.find((r) => r.recordType === "OperationalAction");
    const brief = commit.upserts.find((r) => r.recordType === "Brief");
    expect(action).toMatchObject({ status: "blocked", reviewDecisionIds: [] });
    expect(action?.recordType === "OperationalAction" && action.remainingConditions).toContain(
      PACKAGE_TEXT.missingIntervention,
    );
    expect(brief).toMatchObject({ status: "draft", reviewDecisionIds: [] });
    expect(commit.upserts.some((r) => r.recordType === "ReviewDecision")).toBe(false);
  });
});

describe("brief_package task: the plan tied to the land", () => {
  const MERGE: BranchMergeRecord = {
    recordType: "BranchMerge",
    id: "merge_test_one",
    revision: 1,
    createdAt: AT.toISOString(),
    updatedAt: AT.toISOString(),
    caseId: CASE_ID,
    commandId: "cmd_test_commission",
    taskId: "task_test_branches",
    rulesVersion: "merge@2",
    predictionsCaseRevision: 3,
    branches: [
      {
        branchId: "branch_test_rain",
        branchRevision: 1,
        explanationId: "rainfall",
        status: "consistent",
        reason: "Every necessary prediction was met.",
      },
      {
        branchId: "branch_test_land",
        branchRevision: 1,
        explanationId: "land_use",
        status: "cannot_be_assessed",
        reason: "A necessary prediction could not be assessed.",
      },
    ],
    conflicts: [],
    fieldPlan: {
      measurements: [
        {
          fieldCheckId: "grazing_exclosure",
          label: "Grazing Exclosure",
          separates: [["grazing", "rainfall"]],
          onlySeparates: [["grazing", "rainfall"]],
        },
      ],
      unseparated: [],
    },
    provenance: {
      sourceLocators: [],
      dataBundleIds: [],
      methodId: null,
      methodVersion: null,
      inputVersions: [],
      generatedByTaskId: "task_test_branches",
      generatedAt: AT.toISOString(),
      verificationStatus: "computed_checked",
      limitations: [],
    },
  };
  const tied = () =>
    proposal({
      action: {
        fieldPlan: plan({
          strata: [
            { key: "elevation_high", label: "Upper third", definition: "The highest third." },
          ],
          measurements: [
            {
              ...plan().measurements[0],
              stratumKeys: ["elevation_high"],
              discriminatesHypothesisIds: [hypothesisIdFor(MERGE.taskId, "rainfall")],
              fieldCheckId: "grazing_exclosure",
            },
          ],
        }),
      },
    });
  const hypothesisOf = (explanation = "rainfall"): HypothesisRecord => ({
    recordType: "Hypothesis",
    id: hypothesisIdFor(MERGE.taskId, explanation),
    revision: 1,
    createdAt: AT.toISOString(),
    updatedAt: AT.toISOString(),
    caseId: CASE_ID,
    statement: "Lower rainfall lowered greenness.",
    status: "consistent",
    supportingEvidenceIds: ["ev_test_obs"],
    contradictingEvidenceIds: [],
    missingEvidence: [],
    alternativeHypothesisIds: [],
    assessment: "Consistent with available evidence.",
    provenance: MERGE.provenance,
  });
  function tiedStore(): MemoryCaseStore {
    const store = testStore();
    store.evidence.push(OBS, NEED);
    store.hypotheses.push(hypothesisOf(), hypothesisOf("land_use"));
    store.bundles.push(
      bundle({ id: "bundle_test_strata", methodId: "terrain_strata", methodVersion: "1.1.0" }),
    );
    const config = store.analysisConfigs.get(CASE_ID);
    if (!config) throw new Error("the test store has no configuration");
    store.analysisConfigs.set(CASE_ID, {
      ...config,
      trendSummary: {
        recipe: { recipeId: "restrend_long_record", version: "1.0.0" },
        strata: ["catchment", "elevation_high", "elevation_low"],
      },
    });
    return store;
  }

  it("shows the model the strata keys and the field checks, and stores the bundle and the check on the plan", async () => {
    const sent: string[] = [];
    const { loop, commit } = await run(tiedStore(), tied(), [REST], [], [], {
      committedBranchMerges: [MERGE],
      sentTexts: sent,
    });
    expect(loop.status).toBe("accepted");
    const [action] = commit.upserts.filter((r) => r.recordType === "OperationalAction");
    if (action?.recordType !== "OperationalAction") throw new Error("no action");
    expect(action.fieldPlan?.strata).toMatchObject([
      { key: "elevation_high", dataBundleId: "bundle_test_strata" },
    ]);
    expect(action.fieldPlan?.measurements[0]?.fieldCheckId).toBe("grazing_exclosure");
    const shown = sent.join("");
    expect(shown).toContain("elevation_low");
    expect(shown).toContain("grazing_exclosure");
    expect(shown).toContain("bundle_test_strata");
  });

  it("repairs a plan that names a stratum or a field check outside those lists, then fails it when it repeats", async () => {
    const { loop, commit } = await run(tiedStore(), proposal(), [REST], [], [], {
      committedBranchMerges: [MERGE],
    });
    expect(loop.status).not.toBe("accepted");
    expect(commit.upserts.some((r) => r.recordType === "OperationalAction")).toBe(false);
  });

  const unfit = () =>
    proposal({
      action: {
        fieldPlan: plan({
          strata: [
            { key: "elevation_high", label: "Upper third", definition: "The highest third." },
          ],
          measurements: [
            {
              ...plan().measurements[0],
              stratumKeys: ["elevation_high"],
              discriminatesHypothesisIds: [],
              fieldCheckId: "grazing_exclosure",
            },
          ],
        }),
      },
    });
  const checkOf = (commit: { upserts: unknown[] }) => {
    const action = commit.upserts.find(
      (
        r,
      ): r is {
        recordType: "OperationalAction";
        fieldPlan?: { measurements: { fieldCheckId?: string }[] };
      } => (r as { recordType: string }).recordType === "OperationalAction",
    );
    return action?.fieldPlan?.measurements[0]?.fieldCheckId;
  };

  it("sends a check that does not fit back for one repair turn, and keeps the repaired one", async () => {
    const { loop, commit } = await run(tiedStore(), unfit(), [REST], [], [], {
      committedBranchMerges: [MERGE],
      moreAnswers: [tied()],
    });
    expect(loop.status).toBe("accepted");
    expect(loop.repaired).toBe(true);
    expect(checkOf(commit)).toBe("grazing_exclosure");
  });

  it("reads the explanation of each hypothesis from the merge: a land use measurement does not fit the grazing check", async () => {
    const onLand = () =>
      proposal({
        action: {
          fieldPlan: plan({
            strata: [
              { key: "elevation_high", label: "Upper third", definition: "The highest third." },
            ],
            measurements: [
              {
                ...plan().measurements[0],
                stratumKeys: ["elevation_high"],
                discriminatesHypothesisIds: [hypothesisIdFor(MERGE.taskId, "land_use")],
                fieldCheckId: "grazing_exclosure",
              },
            ],
          }),
        },
      });
    const { loop, commit } = await run(tiedStore(), onLand(), [REST], [], [], {
      committedBranchMerges: [MERGE],
      moreAnswers: [onLand()],
    });
    expect(loop.status).toBe("accepted");
    expect(loop.repaired).toBe(true);
    expect(checkOf(commit)).toBeUndefined();
  });

  it("sets a check that still does not fit to null after the repair turn: the plan is kept, the check is not", async () => {
    const { loop, commit } = await run(tiedStore(), unfit(), [REST], [], [], {
      committedBranchMerges: [MERGE],
      moreAnswers: [unfit()],
    });
    expect(loop.status).toBe("accepted");
    expect(loop.repaired).toBe(true);
    expect(checkOf(commit)).toBeUndefined();
    const [action] = commit.upserts.filter((r) => r.recordType === "OperationalAction");
    if (action?.recordType !== "OperationalAction") throw new Error("no action");
    expect(action.fieldPlan?.measurements[0]?.stratumKeys).toEqual(["elevation_high"]);
  });

  it("reads the field checks of the latest merge when the command holds two", async () => {
    const older: BranchMergeRecord = {
      ...MERGE,
      id: "merge_test_old",
      createdAt: "2026-10-27T19:00:00.000Z",
      fieldPlan: {
        measurements: [
          {
            fieldCheckId: "old_check",
            label: "Old Check",
            separates: [["grazing", "rainfall"]],
            onlySeparates: [["grazing", "rainfall"]],
          },
        ],
        unseparated: [],
      },
    };
    for (const merges of [
      [older, MERGE],
      [MERGE, older],
    ]) {
      const sent: string[] = [];
      const { loop, commit } = await run(tiedStore(), tied(), [REST], [], [], {
        committedBranchMerges: merges,
        sentTexts: sent,
      });
      expect(loop.status).toBe("accepted");
      expect(checkOf(commit)).toBe("grazing_exclosure");
      expect(sent.join("")).not.toContain("old_check");
    }
  });

  it("binds the first of two validated strata bundles by ID, whatever their order", async () => {
    for (const order of [
      ["a", "b"],
      ["b", "a"],
    ]) {
      const store = tiedStore();
      store.bundles.length = 0;
      for (const k of order) {
        store.bundles.push(
          bundle({
            id: `bundle_test_strata_${k}`,
            methodId: "terrain_strata",
            methodVersion: "1.1.0",
          }),
        );
      }
      const { commit } = await run(store, tied(), [REST], [], [], {
        committedBranchMerges: [MERGE],
      });
      const [action] = commit.upserts.filter((r) => r.recordType === "OperationalAction");
      if (action?.recordType !== "OperationalAction") throw new Error("no action");
      expect(action.fieldPlan?.strata[0]?.dataBundleId).toBe("bundle_test_strata_a");
    }
  });

  it("leaves the plan's own stratum keys and no bundle when the configuration lists no strata for the case", async () => {
    const store = tiedStore();
    const config = store.analysisConfigs.get(CASE_ID);
    if (!config) throw new Error("no configuration");
    const { trendSummary: _dropped, ...withoutTrend } = config;
    store.analysisConfigs.set(CASE_ID, withoutTrend);
    const { loop, commit } = await run(store, proposal(), [REST]);
    expect(loop.status).toBe("accepted");
    const [action] = commit.upserts.filter((r) => r.recordType === "OperationalAction");
    if (action?.recordType !== "OperationalAction") throw new Error("no action");
    expect(action.fieldPlan?.strata[0]).toMatchObject({ key: "upper_band", dataBundleId: null });
  });

  it("ties the plan only to a validated strata bundle: a failed or superseded one binds nothing", async () => {
    for (const status of ["failed", "superseded", "processing"] as const) {
      const store = tiedStore();
      store.bundles.length = 0;
      store.bundles.push(bundle({ id: "bundle_test_strata", methodId: "terrain_strata", status }));
      const { commit } = await run(store, proposal());
      const [action] = commit.upserts.filter((r) => r.recordType === "OperationalAction");
      if (action?.recordType !== "OperationalAction") throw new Error("no action");
      expect(action.fieldPlan?.strata[0], status).toMatchObject({
        key: "upper_band",
        dataBundleId: null,
      });
    }
  });

  it("stores no check and no bundle for a case without a strata bundle or a merge", async () => {
    const store = testStore();
    store.evidence.push(OBS, NEED);
    const { commit } = await run(store, proposal());
    const [action] = commit.upserts.filter((r) => r.recordType === "OperationalAction");
    if (action?.recordType !== "OperationalAction") throw new Error("no action");
    expect(action.fieldPlan?.strata[0]?.dataBundleId).toBeNull();
    expect(action.fieldPlan?.measurements[0]).not.toHaveProperty("fieldCheckId");
  });
});
