import { Intervention, Relationship } from "@siterra/contracts";
import { describe, expect, it } from "vitest";

import { MetaAdapter } from "../../model/adapter.ts";
import { strictSubsetIssues } from "../../model/strict-schema.ts";
import { AT, CASE_ID, queuedTask, testStore } from "../../testing/case-fixture.ts";
import { answerStep, syntheticTransport } from "../../testing/replay-steps.ts";
import { caseToolRegistry } from "../../tools/registry.ts";
import type {
  EvidenceRecord,
  HypothesisRecord,
  InterventionRecord,
  RelationshipRecord,
} from "../records.ts";
import {
  DEFERRAL_TEXT,
  LEFT_OUT_NOTE,
  NO_SOURCE_NOTE,
  runInterventionTask,
} from "./intervention-task.ts";
import {
  interventionOutputSchema,
  responseTextIssues,
  validateInterventionProposal,
} from "./proposal.ts";

// Synthetic evidence, hypotheses and replays; nothing here is a finding about any place or a
// response anyone has chosen.

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

function hypothesis(id: string, status: HypothesisRecord["status"]): HypothesisRecord {
  return {
    recordType: "Hypothesis",
    id,
    revision: 1,
    createdAt: AT.toISOString(),
    updatedAt: AT.toISOString(),
    caseId: CASE_ID,
    statement: "Lower spring rainfall reduced vegetation greenness in the catchment.",
    status,
    supportingEvidenceIds: status === "consistent" ? ["ev_test_obs"] : [],
    contradictingEvidenceIds: [],
    missingEvidence: [],
    alternativeHypothesisIds: [],
    assessment: "Consistent with available evidence: the cited evidence is read as stated.",
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
const HYP = hypothesis("hyp_test_rain", "consistent");
const CONTRA = hypothesis("hyp_test_contra", "inconsistent");

function option(extra: Record<string, unknown> = {}) {
  return {
    title: "Negotiated seasonal rest within existing institutions",
    description:
      "If the field check confirms who sets rest dates, a seasonal rest could be discussed with those institutions.",
    assumptions: ["The existing institutions set rest dates."],
    ecologicalConsiderations: ["Reversible; rest timing matters more than length."],
    livelihoodConsiderations: [
      "Moves grazing in time; exposure depends on access to other pasture.",
    ],
    fieldValidationNeeded: ["Who decides pasture rest dates."],
    requiredReviewRoles: ["community_livelihood", "scientific"],
    evidenceIds: ["ev_test_obs", "ev_test_need"],
    hypothesisIds: ["hyp_test_rain"],
    ...extra,
  };
}
const OTHER = option({
  title: "Participatory monitoring before any access change",
  description:
    "Once the roles are known, the existing institutions could monitor the upper band before any access change.",
  assumptions: ["The institutions take part in monitoring."],
  fieldValidationNeeded: ["Which institutions could take part in monitoring."],
  requiredReviewRoles: ["program_coordination"],
  evidenceIds: ["ev_test_need"],
});
const MODEL_DEFER = option({
  title: "Defer until the field check",
  description: "Hold any change until the field check names who decides and when.",
});

function check(items: unknown[], noSource?: "refuse" | "mark") {
  const store = testStore();
  return validateInterventionProposal(JSON.stringify({ items }), {
    ...(noSource ? { noSource } : {}),
    evidence: new Map([OBS, NEED].map((e) => [e.id, e])),
    hypotheses: new Map([HYP, CONTRA].map((h) => [h.id, h])),
    measurements: new Map(store.measurements.map((m) => [m.id, m])),
    years: { first: 2022, last: 2022 },
  });
}
// The model gives two or three options; a single test item is checked beside a valid second one.
const codes = (items: unknown[]) =>
  check(items.length === 1 ? [...items, OTHER] : items).issues.map((i) => `${i.code} ${i.path}`);

describe("propose_interventions validation", () => {
  it("accepts conditional candidate responses with assumptions, prerequisites and roles", () => {
    const result = check([option(), OTHER]);
    expect(result.issues).toEqual([]);
    expect(result.ok && result.value.length).toBe(2);
  });

  it("needs a stated condition, an assumption, a field prerequisite and a review role", () => {
    expect(
      codes([option({ description: "A seasonal rest could be discussed with institutions." })]),
    ).toEqual(["claim_kind $.items[0].description"]);
    expect(codes([option({ assumptions: [] })])).toEqual(["claim_kind $.items[0].assumptions"]);
    expect(codes([option({ fieldValidationNeeded: [] })])).toEqual([
      "claim_kind $.items[0].fieldValidationNeeded",
    ]);
    expect(codes([option({ requiredReviewRoles: [] })])).toEqual([
      "claim_kind $.items[0].requiredReviewRoles",
    ]);
    expect(codes([option({ evidenceIds: [], hypothesisIds: [] })])).toEqual([
      "claim_kind $.items[0].evidenceIds",
    ]);
  });

  it("refuses unknown citations and a response resting on a contradicted hypothesis", () => {
    expect(codes([option({ evidenceIds: ["ev_test_none"] })])).toEqual([
      "unknown_reference $.items[0].evidenceIds[0]",
    ]);
    expect(codes([option({ hypothesisIds: ["hyp_test_contra"] })])).toEqual([
      "claim_kind $.items[0].hypothesisIds[0]",
    ]);
  });

  it("refuses recommendations, rankings, probabilities and predicted effects", () => {
    for (const [field, text] of [
      ["description", "If the check confirms it, this is the recommended response."],
      ["description", "If the check confirms it, this is the best option."],
      ["description", "If the check confirms it, this is the stronger response than the others."],
      ["description", "If the check confirms it, it is likely to fit."],
      ["description", "If the check confirms it, the rest would improve pasture cover."],
      ["ecologicalConsiderations", ["The rest will restore the pasture."]],
      ["livelihoodConsiderations", ["It could reduce herd losses."]],
    ] as const) {
      const issues = codes([option({ [field]: text })]);
      expect(
        issues.some((i) => i.startsWith(`prohibited_claim $.items[0].${field}`)),
        String(text),
      ).toBe(true);
    }
  });

  it("refuses directives, advice and present-tense effects (b34)", () => {
    for (const [field, text] of [
      ["description", "If grazing is confirmed, the community must close the upper pastures."],
      ["description", "Herders should rest the upper band if the field check confirms grazing."],
      ["description", "Once agreed, this ought to be adopted by the community."],
      ["description", "If confirmed, this approach is advisable."],
      ["description", "If confirmed, resting the upper band restores cover in the upper band."],
      ["ecologicalConsiderations", ["Resting the upper band helps vegetation recover."]],
      ["livelihoodConsiderations", ["Seasonal rest results in better forage."]],
      ["description", "If the check confirms it, this is the most effective response."],
    ] as const) {
      const issues = codes([option({ [field]: text })]);
      expect(
        issues.some((i) => i.startsWith(`prohibited_claim $.items[0].${field}`)),
        String(text),
      ).toBe(true);
    }
  });

  it("keeps roles, possibilities and aims passing (b34)", () => {
    for (const [field, text] of [
      ["livelihoodConsiderations", ["The decision belongs to the community institutions."]],
      [
        "description",
        "If the field check confirms the roles, the institutions could discuss a rest.",
      ],
      ["ecologicalConsiderations", ["The rest aims to reduce grazing during regrowth."]],
      [
        "ecologicalConsiderations",
        ["The rest is meant to keep the upper band ungrazed in spring."],
      ],
    ] as const) {
      expect(codes([option({ [field]: text })]), String(text)).toEqual([]);
    }
  });

  it("refuses benefit numbers, counts of people, names and consent claims", () => {
    expect(
      codes([option({ livelihoodConsiderations: ["Income rises by 20% under rest."] })]),
    ).toContain("numeric_provenance $.items[0].livelihoodConsiderations[0]");
    expect(
      codes([option({ livelihoodConsiderations: ["About 120 households use the pasture."] })]),
    ).toContain("prohibited_claim $.items[0].livelihoodConsiderations[0]");
    expect(codes([option({ fieldValidationNeeded: ["Ask the amghar, Moha Ouali."] })])).toContain(
      "prohibited_claim $.items[0].fieldValidationNeeded[0]",
    );
    expect(codes([option({ assumptions: ["The community consented to the rest."] })])).toContain(
      "prohibited_claim $.items[0].assumptions[0]",
    );
  });

  it("takes numbers only from the cited evidence", () => {
    expect(
      codes([
        option({
          ecologicalConsiderations: ["The April 2022 NDVI area median of 0.1439 is the baseline."],
        }),
      ]),
    ).toEqual([]);
  });

  it("takes two or three model options, refuses a model-written deferral and duplicate titles", () => {
    expect(check([option()]).issues.map((i) => `${i.code} ${i.path}`)).toEqual(["limit $.items"]);
    expect(codes([option(), OTHER, option({ title: "A" }), option({ title: "B" })])).toEqual([
      "limit $.items",
    ]);
    expect(codes([option(), MODEL_DEFER])).toEqual(["claim_kind $.items[1].title"]);
    expect(codes([OTHER, OTHER])).toEqual(["schema $.items[1].title"]);
  });

  describe("a response rests on at least one Evidence id", () => {
    const hypothesisOnly = () => option({ evidenceIds: [] });

    it("refuses a response that cites a hypothesis but no Evidence, and the batch with it, so the model repairs it", () => {
      const result = check([hypothesisOnly(), OTHER]);
      expect(result.ok).toBe(false);
      expect(result.issues.map((i) => `${i.code} ${i.path}`)).toEqual([
        "claim_kind $.items[0].evidenceIds",
      ]);
      expect(result.issues[0]?.message).toContain("hypothesis alone");
    });

    it("on the repaired turn accepts it and marks it, so the record says no source was cited", () => {
      const result = check([hypothesisOnly(), OTHER], "mark");
      expect(result.issues).toEqual([]);
      expect(result.ok && result.value.map((a) => a.noSource)).toEqual([true, false]);
    });

    it("marks nothing for a response that cites Evidence, in either turn", () => {
      for (const mode of ["refuse", "mark"] as const) {
        const result = check([option(), OTHER], mode);
        expect(result.ok && result.value.map((a) => a.noSource)).toEqual([false, false]);
      }
    });

    it("on the first turn, neither Evidence nor a hypothesis, or an id the task cannot use, is refused", () => {
      for (const extra of [
        { evidenceIds: [], hypothesisIds: [] },
        { evidenceIds: ["ev_test_not_available"] },
        { hypothesisIds: ["hyp_test_contra"] },
      ]) {
        // The other response is fine, so the batch stands without the refused one, issues named.
        const result = check([option(extra), OTHER], "refuse");
        expect(result.issues.length, JSON.stringify(extra)).toBeGreaterThan(0);
        expect(result.ok && result.value.length, JSON.stringify(extra)).toBe(1);
        // When every response is refused, the batch goes back for the repair turn.
        const none = check(
          [option(extra), option({ ...extra, title: "Second response" })],
          "refuse",
        );
        expect(none.ok, JSON.stringify(extra)).toBe(false);
      }
    });

    it("on the repaired turn leaves out an id the task cannot use and keeps the response marked", () => {
      const unusable = {
        evidenceIds: ["ev_test_not_available"],
        hypothesisIds: ["hyp_test_contra"],
      };
      const result = check([option(unusable), OTHER], "mark");
      expect(result.issues).toEqual([]);
      expect(result.ok && result.value[0]?.item.evidenceIds).toEqual([]);
      expect(result.ok && result.value[0]?.item.hypothesisIds).toEqual([]);
      expect(
        result.ok && result.value.map((a) => [a.evidence.length, a.hypotheses.length, a.noSource]),
      ).toEqual([
        [0, 0, true],
        [1, 1, false],
      ]);
      expect(result.ok && result.value[0]?.dropped).toEqual([
        "ev_test_not_available",
        "hyp_test_contra",
      ]);
    });

    it("on the repaired turn keeps the usable ids beside the left-out ones, and marks it only when no Evidence is left", () => {
      const mixed = { evidenceIds: ["ev_test_need", "ev_test_not_available"] };
      const result = check([option(mixed), OTHER], "mark");
      expect(result.issues).toEqual([]);
      expect(result.ok && result.value[0]?.item.evidenceIds).toEqual(["ev_test_need"]);
      expect(result.ok && result.value[0]?.noSource).toBe(false);
      expect(result.ok && result.value[0]?.dropped).toEqual(["ev_test_not_available"]);
    });
  });

  it("the host deferral text passes the rules it holds the model to (b39 note)", () => {
    const none = { allowed: [], periods: [], excerpts: [] };
    for (const text of [
      DEFERRAL_TEXT.description,
      ...DEFERRAL_TEXT.assumptions,
      ...DEFERRAL_TEXT.ecologicalConsiderations,
      ...DEFERRAL_TEXT.livelihoodConsiderations,
    ]) {
      expect(responseTextIssues(text, none, null), text).toEqual([]);
    }
    // The earlier wording was an imperative, and is refused now.
    for (const text of [
      "Make no change until the field check answers the open questions.",
      "Close the upper pastures if grazing is confirmed.",
      "If grazing is confirmed. Ban access to the upper band.",
    ]) {
      expect(
        responseTextIssues(text, none, null).map((i) => i.code),
        text,
      ).toEqual(["prohibited_claim"]);
    }
  });

  it("the output schema fits the strict subset", () => {
    expect(strictSubsetIssues(interventionOutputSchema())).toEqual([]);
  });
});

describe("intervention_feasibility task", () => {
  it("commits candidate responses and host-written relationships that parse with the contracts", async () => {
    const store = testStore();
    store.evidence.push(OBS, NEED);
    let n = 0;
    const { loop, commit } = await runInterventionTask(
      {
        task: queuedTask({
          id: "task_test_interventions",
          kind: "intervention_feasibility",
          inputVersions: [{ entityId: "ev_test_need", revision: 1 }],
          allowedTools: ["read_evidence", "read_source", "propose_interventions"],
        }),
        expectedCaseRevision: 4,
      },
      {
        adapter: new MetaAdapter({
          transport: syntheticTransport([answerStep(JSON.stringify({ items: [option(), OTHER] }))]),
          sleep: () => Promise.resolve(),
        }),
        trace: { emit: () => undefined },
        store,
        tools: caseToolRegistry(store, CASE_ID),
        newEvidenceId: () => `ev_test_${String((n += 1))}`,
        newRecordId: (prefix) => `${prefix}_test_${String((n += 1))}`,
        committedHypotheses: [HYP],
        now: () => AT,
      },
    );
    expect(loop.status).toBe("accepted");
    const interventions = commit.upserts.filter(
      (r): r is InterventionRecord => r.recordType === "Intervention",
    );
    const relationships = commit.upserts.filter(
      (r): r is RelationshipRecord => r.recordType === "Relationship",
    );
    expect(interventions.map((r) => [r.title, r.status])).toEqual([
      ["Negotiated seasonal rest within existing institutions", "candidate"],
      ["Participatory monitoring before any access change", "candidate"],
      ["Defer until the field check", "candidate"],
    ]);
    const [rest, monitor, defer] = interventions.map((r) => r.id);
    expect(relationships.map((r) => `${r.fromEntityId} ${r.kind} ${r.toEntityId}`)).toEqual([
      `hyp_test_rain proposes_response ${rest ?? ""}`,
      `ev_test_obs supports ${rest ?? ""}`,
      `${rest ?? ""} requires_verification ev_test_need`,
      `hyp_test_rain proposes_response ${monitor ?? ""}`,
      `${monitor ?? ""} requires_verification ev_test_need`,
      `${defer ?? ""} requires_verification ev_test_need`,
    ]);
    // Host code writes the deferral: fixed text, the options' prerequisites and roles, no model text.
    expect(interventions[2]).toMatchObject({
      description: DEFERRAL_TEXT.description,
      assumptions: DEFERRAL_TEXT.assumptions,
      evidenceIds: ["ev_test_need"],
      hypothesisIds: [],
      fieldValidationNeeded: [
        "Who decides pasture rest dates.",
        "Which institutions could take part in monitoring.",
      ],
      requiredReviewRoles: ["scientific", "community_livelihood", "program_coordination"],
    });
    for (const r of interventions) expect(Intervention.safeParse(r).success).toBe(true);
    for (const r of relationships) expect(Relationship.safeParse(r).success).toBe(true);
    expect(commit.upserts[0]).toMatchObject({
      status: "succeeded",
      outputEntityIds: interventions.map((r) => r.id),
    });
    expect(commit.events[0]?.message).toBe(
      "Intervention feasibility prepared 3 candidate responses, not ranked.",
    );
  });

  describe("a response with no Evidence id", () => {
    async function runWith(answers: unknown[]) {
      const store = testStore();
      store.evidence.push(OBS, NEED);
      let n = 0;
      return runInterventionTask(
        {
          task: queuedTask({
            id: "task_test_interventions",
            kind: "intervention_feasibility",
            inputVersions: [{ entityId: "ev_test_need", revision: 1 }],
            allowedTools: ["read_evidence", "read_source", "propose_interventions"],
          }),
          expectedCaseRevision: 4,
        },
        {
          adapter: new MetaAdapter({
            transport: syntheticTransport(
              answers.map((a) => answerStep(JSON.stringify({ items: a }))),
            ),
            sleep: () => Promise.resolve(),
          }),
          trace: { emit: () => undefined },
          store,
          tools: caseToolRegistry(store, CASE_ID),
          newEvidenceId: () => `ev_test_${String((n += 1))}`,
          newRecordId: (prefix) => `${prefix}_test_${String((n += 1))}`,
          committedHypotheses: [HYP],
          now: () => AT,
        },
      );
    }
    const titled = (title: string, extra: Record<string, unknown> = {}) =>
      option({ title, evidenceIds: [], ...extra });
    const interventionsOf = (commit: { upserts: unknown[] }) =>
      commit.upserts.filter(
        (r): r is InterventionRecord => (r as { recordType: string }).recordType === "Intervention",
      );

    it("gets one repair turn: a repaired answer that cites Evidence carries no mark", async () => {
      const { loop, commit } = await runWith([
        [titled("First hypothesis only"), OTHER],
        [option(), OTHER],
      ]);
      expect(loop.status).toBe("accepted");
      expect(loop.repaired).toBe(true);
      const rows = interventionsOf(commit).filter((r) => !/^Defer/.test(r.title));
      expect(rows.map((r) => r.evidenceIds.length > 0)).toEqual([true, true]);
      expect(rows.some((r) => r.provenance.limitations.includes(NO_SOURCE_NOTE))).toBe(false);
    });

    it("is accepted after the repair turn and marked 'no source cited' when it still cites no Evidence", async () => {
      const { loop, commit } = await runWith([
        [titled("Hypothesis only A"), OTHER],
        [titled("Hypothesis only A"), OTHER],
      ]);
      expect(loop.status).toBe("accepted");
      const rows = interventionsOf(commit).filter((r) => !/^Defer/.test(r.title));
      const marked = rows.find((r) => r.title === "Hypothesis only A");
      expect(marked?.evidenceIds).toEqual([]);
      expect(marked?.provenance.limitations).toContain(NO_SOURCE_NOTE);
      const other = rows.find((r) => r.title !== "Hypothesis only A");
      expect(other?.provenance.limitations).not.toContain(NO_SOURCE_NOTE);
      // The host's own deferral cites the field requirement and is never marked.
      const deferral = interventionsOf(commit).find((r) => /^Defer/.test(r.title));
      expect(deferral?.provenance.limitations).not.toContain(NO_SOURCE_NOTE);
    });

    it("keeps the responses when the repaired answer still cites records the task cannot use (the founder instance smoke 2)", async () => {
      const unusable = (title: string) =>
        option({ title, evidenceIds: ["ev_01M67YYTDZ1FNW68J4J9CXCPPM"], hypothesisIds: [] });
      const { loop, commit } = await runWith([
        [unusable("Unusable A"), unusable("Unusable B")],
        [unusable("Unusable A"), unusable("Unusable B")],
      ]);
      expect(loop.status).toBe("accepted");
      const rows = interventionsOf(commit).filter((r) => !/^Defer/.test(r.title));
      expect(rows.map((r) => r.title)).toEqual(["Unusable A", "Unusable B"]);
      for (const r of rows) {
        expect(r.evidenceIds).toEqual([]);
        expect(r.provenance.limitations).toContain(NO_SOURCE_NOTE);
        expect(r.provenance.limitations).toContain(LEFT_OUT_NOTE);
      }
    });

    it("the first answer that cites an unusable record is still sent back, not kept", async () => {
      const unusable = (title: string) =>
        option({ title, evidenceIds: ["ev_01M67YYTDZ1FNW68J4J9CXCPPM"], hypothesisIds: [] });
      const { loop } = await runWith([[unusable("Unusable A"), unusable("Unusable B")]]);
      expect(loop.status).not.toBe("accepted");
    });

    it("is not accepted at once: with one turn of answers it is repaired, not marked", async () => {
      const { loop } = await runWith([[titled("Hypothesis only B"), OTHER]]);
      expect(loop.status).not.toBe("accepted");
    });
  });
});
