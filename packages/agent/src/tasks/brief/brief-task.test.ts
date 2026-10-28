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
import { AT, CASE_ID, queuedTask, testStore } from "../../testing/case-fixture.ts";
import { answerStep, syntheticTransport } from "../../testing/replay-steps.ts";
import type { MemoryCaseStore } from "../../tools/store.ts";
import { caseToolRegistry } from "../../tools/registry.ts";
import type { EvidenceRecord, InterventionRecord } from "../records.ts";
import { PACKAGE_TEXT, runBriefPackageTask } from "./brief-task.ts";
import { packageOutputSchema, validatePackageProposal } from "./proposal.ts";

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

const line = (
  text: string,
  claimKind: string,
  evidenceIds: string[],
  measurementIds: string[] = [],
) => ({
  text,
  claimKind,
  evidenceIds,
  measurementIds,
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
        line(
          "The catchment NDVI area median was 0.1439 in April 2022.",
          "observation",
          ["ev_test_obs"],
          ["meas_test_2022-04"],
        ),
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

function check(value: unknown, openGapIds: string[] = ["ev_test_need"]) {
  const store = testStore();
  return validatePackageProposal(JSON.stringify(value), {
    evidence: new Map([OBS, NEED, GAP2].map((e) => [e.id, e])),
    interventions: new Map([[REST.id, REST]]),
    openGapIds: new Set(openGapIds),
    hypothesisIds: new Set(["hyp_test_rain"]),
    measurements: new Map(store.measurements.map((m) => [m.id, m])),
    years: { first: 2022, last: 2022 },
  });
}
const codes = (value: unknown, openGapIds?: string[]) =>
  check(value, openGapIds).issues.map((i) => `${i.code} ${i.path}`);

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
              line(
                "The NDVI area median was 0.1439 in April 2022.",
                "observation",
                ["ev_test_obs"],
                ["meas_test_none"],
              ),
            ],
          },
        }),
      ),
    ).toEqual(["unknown_reference $.brief.known[0].measurementIds[0]"]);
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

async function run(store: MemoryCaseStore, answer: unknown, committedInterventions = [REST]) {
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
      }),
      expectedCaseRevision: 5,
    },
    {
      adapter: new MetaAdapter({
        transport: syntheticTransport([answerStep(JSON.stringify(answer))]),
        sleep: () => Promise.resolve(),
      }),
      trace: { emit: () => undefined },
      store,
      tools: caseToolRegistry(store, CASE_ID),
      newEvidenceId: () => `ev_test_${String((n += 1))}`,
      newRecordId: (prefix) => `${prefix}_test_${String((n += 1))}`,
      committedInterventions,
      now: () => AT,
    },
  );
}

describe("brief_package task", () => {
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
