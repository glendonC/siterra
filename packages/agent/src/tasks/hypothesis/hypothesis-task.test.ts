import { Hypothesis, Relationship } from "@siterra/contracts";
import { describe, expect, it } from "vitest";

import { MetaAdapter } from "../../model/adapter.ts";
import { strictSubsetIssues } from "../../model/strict-schema.ts";
import { AT, CASE_ID, queuedTask, testStore } from "../../testing/case-fixture.ts";
import { answerStep, syntheticTransport } from "../../testing/replay-steps.ts";
import { caseToolRegistry } from "../../tools/registry.ts";
import type { EvidenceRecord, HypothesisRecord, RelationshipRecord } from "../records.ts";
import type { TraceEventDraft } from "../trace.ts";
import { runHypothesisTask } from "./hypothesis-task.ts";
import { STATUS_LABELS, hypothesisOutputSchema, validateHypothesisProposal } from "./proposal.ts";

// Synthetic evidence and synthetic replays; nothing here is a finding about any place.

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
const CTX = evidence(
  "ev_test_ctx",
  "scientific_context",
  "A report states a seasonal closure of 3 months.",
);
const NEED = evidence("ev_test_need", "field_requirement", "Herd numbers must be checked locally.");
const RAIN = evidence(
  "ev_test_rain",
  "observation",
  "Catchment rainfall in April 2022 departed by -38.26 mm from the 1991 to 2020 April mean.",
  ["meas_test_rain_2022-04"],
);
const POOL = new Map([OBS, CTX, NEED, RAIN].map((e) => [e.id, e]));

function hyp(status: keyof typeof STATUS_LABELS, extra: Record<string, unknown> = {}) {
  const label = STATUS_LABELS[status];
  return {
    hypothesisId: null,
    statement: "Lower spring rainfall reduced vegetation greenness in the catchment.",
    status,
    supportingEvidenceIds: [],
    contradictingEvidenceIds: [],
    missingEvidence: [],
    assessment: `${label}: the cited evidence is read as stated.`,
    ...extra,
  };
}

function check(items: unknown[]) {
  const store = testStore();
  const measurements = new Map(store.measurements.map((m) => [m.id, m]));
  const ndvi = store.measurements[0];
  if (!ndvi) throw new Error("the test store has no measurement");
  measurements.set("meas_test_rain_2022-04", {
    ...ndvi,
    id: "meas_test_rain_2022-04",
    metric: "precipitation_departure_from_1991_2020_mean",
    value: -38.26,
  });
  return validateHypothesisProposal(JSON.stringify({ items }), {
    evidence: POOL,
    measurements,
    hypotheses: new Map(),
    years: { first: 2022, last: 2022 },
  });
}
const codes = (items: unknown[]) => check(items).issues.map((i) => `${i.code} ${i.path}`);

describe("propose_hypotheses validation", () => {
  it("accepts each status when the evidence matches it", () => {
    const result = check([
      hyp("consistent", { supportingEvidenceIds: ["ev_test_ctx"] }),
      hyp("inconsistent", { contradictingEvidenceIds: ["ev_test_obs"] }),
      hyp("inconclusive", { missingEvidence: ["Herd numbers by month."] }),
      hyp("untested"),
    ]);
    expect(result.issues).toEqual([]);
    expect(result.ok && result.value.length).toBe(4);
  });

  it("refuses statuses the evidence does not carry", () => {
    expect(codes([hyp("consistent")])).toEqual(["claim_kind $.items[0].status"]);
    expect(
      codes([
        hyp("consistent", {
          supportingEvidenceIds: ["ev_test_ctx"],
          contradictingEvidenceIds: ["ev_test_obs"],
        }),
      ]),
    ).toEqual(["claim_kind $.items[0].status"]);
    expect(codes([hyp("inconsistent", { contradictingEvidenceIds: ["ev_test_ctx"] })])).toEqual([
      "claim_kind $.items[0].status",
    ]);
    expect(codes([hyp("inconclusive")])).toEqual(["claim_kind $.items[0].missingEvidence"]);
    expect(codes([hyp("untested", { supportingEvidenceIds: ["ev_test_ctx"] })])).toEqual([
      "claim_kind $.items[0].status",
    ]);
  });

  it("needs the status words in the assessment", () => {
    expect(
      codes([
        hyp("inconclusive", { missingEvidence: ["Herd numbers."], assessment: "Hard to say." }),
      ]),
    ).toEqual(["claim_kind $.items[0].assessment"]);
  });

  it("refuses unknown evidence, evidence on both sides, probabilities and ranking", () => {
    expect(codes([hyp("consistent", { supportingEvidenceIds: ["ev_test_none"] })])).toEqual([
      "unknown_reference $.items[0].supportingEvidenceIds[0]",
      "claim_kind $.items[0].status",
    ]);
    expect(
      codes([
        hyp("inconsistent", {
          supportingEvidenceIds: ["ev_test_obs"],
          contradictingEvidenceIds: ["ev_test_obs"],
        }),
      ]),
    ).toContain("claim_kind $.items[0].contradictingEvidenceIds");
    expect(codes([hyp("untested", { statement: "Grazing is the most likely cause." })])).toContain(
      "prohibited_claim $.items[0].statement",
    );
    expect(
      codes([hyp("untested", { assessment: `${STATUS_LABELS.untested}; a 70% chance.` })]),
    ).toContain("prohibited_claim $.items[0].assessment");
  });

  it("keeps the causal rule for the assessment and missing evidence (a60)", () => {
    const base = { supportingEvidenceIds: ["ev_test_ctx"] };
    expect(
      codes([
        hyp("consistent", {
          ...base,
          assessment: "Consistent with available evidence: the decline is due to grazing.",
        }),
      ]),
    ).toEqual(["prohibited_claim $.items[0].assessment"]);
    expect(
      codes([
        hyp("consistent", {
          ...base,
          assessment: "Consistent with available evidence: the decline was driven by grazing.",
        }),
      ]),
    ).toEqual(["prohibited_claim $.items[0].assessment"]);
    expect(
      codes([
        hyp("inconclusive", {
          missingEvidence: ["Records of what caused the decline."],
          assessment: "Cannot be assessed with current data.",
        }),
      ]),
    ).toEqual(["prohibited_claim $.items[0].missingEvidence[0]"]);
  });

  it("refuses comparatives that rank explanations, in any hypothesis text (a60)", () => {
    for (const phrase of [
      "the stronger explanation",
      "more plausible than the drought account",
      "the main driver",
      "the primary cause",
      "the best explanation",
      "most likely",
    ]) {
      const issues = codes([hyp("untested", { assessment: `Not yet tested; ${phrase}.` })]);
      expect(issues, phrase).toContain("prohibited_claim $.items[0].assessment");
    }
    expect(
      codes([hyp("untested", { statement: "Grazing is the main driver of the decline." })]),
    ).toContain("prohibited_claim $.items[0].statement");
  });

  it("refuses the ranking forms a word list missed (b13)", () => {
    for (const phrase of [
      "it is better supported than the dry-year explanation",
      "it fits the record better than grazing does",
      "it is the most consistent of the five",
      "the dry year outweighs grazing as an explanation",
      "it is the preferred explanation",
      "it is the favoured explanation",
      "it explains more than the other hypotheses",
      "it is a better fit",
      "it is less well-founded",
    ]) {
      const issues = codes([hyp("untested", { assessment: `Not yet tested; ${phrase}.` })]);
      expect(issues, phrase).toContain("prohibited_claim $.items[0].assessment");
    }
  });

  it("refuses the ranking forms b13 still let through (b17)", () => {
    for (const phrase of [
      "it favours this hypothesis over grazing",
      "it makes a stronger case than the others",
      "it is ahead of the others",
      "it is the weaker grazing explanation",
    ]) {
      const issues = codes([hyp("untested", { assessment: `Not yet tested; ${phrase}.` })]);
      expect(issues, phrase).toContain("prohibited_claim $.items[0].assessment");
    }
  });

  it("still allows measurement comparisons with than (b13)", () => {
    for (const assessment of [
      `${STATUS_LABELS.consistent}: the cited records show more rainfall than the previous spring.`,
      `${STATUS_LABELS.consistent}: the cited evidence fits the hypothesis.`,
      `${STATUS_LABELS.consistent}: the case record holds the cited value for April.`,
    ]) {
      expect(
        codes([hyp("consistent", { supportingEvidenceIds: ["ev_test_obs"], assessment })]),
        assessment,
      ).toEqual([]);
    }
    const lower = `${STATUS_LABELS.consistent}: April rainfall was lower than the 1991 to 2020 mean, by -38.26 mm.`;
    expect(
      codes([hyp("consistent", { supportingEvidenceIds: ["ev_test_rain"], assessment: lower })]),
    ).toEqual([]);
    // The reference period comes from the cited measurement only.
    expect(
      codes([hyp("consistent", { supportingEvidenceIds: ["ev_test_obs"], assessment: lower })]),
    ).toContain("numeric_provenance $.items[0].assessment");
  });

  it("allows a cause in the statement of a hypothesis but no diagnosis, biomass or forecast", () => {
    expect(
      codes([hyp("untested", { statement: "Vegetation declined due to grazing pressure." })]),
    ).toEqual([]);
    expect(codes([hyp("untested", { statement: "Overgrazing was detected." })])).toEqual([
      "prohibited_claim $.items[0].statement",
    ]);
    expect(codes([hyp("untested", { statement: "Biomass will recover next year." })])).toContain(
      "prohibited_claim $.items[0].statement",
    );
  });

  it("takes numbers only from the cited evidence and its measurements", () => {
    const ok = hyp("consistent", {
      supportingEvidenceIds: ["ev_test_obs", "ev_test_ctx"],
      assessment: `${STATUS_LABELS.consistent}: the area median of 0.1439 and a closure of 3 months fit.`,
    });
    expect(codes([ok])).toEqual([]);
    expect(codes([{ ...ok, assessment: `${STATUS_LABELS.consistent}: about 40 herds.` }])).toEqual([
      "numeric_provenance $.items[0].assessment",
    ]);
  });

  it("the output schema fits the strict subset", () => {
    expect(strictSubsetIssues(hypothesisOutputSchema())).toEqual([]);
  });
});

describe("hypothesis_comparison task", () => {
  it("commits hypotheses and host-written relationships that parse with the contracts", async () => {
    const store = testStore();
    store.evidence.push(OBS, CTX);
    const events: TraceEventDraft[] = [];
    let n = 0;
    const items = [
      hyp("consistent", { supportingEvidenceIds: ["ev_test_ctx"] }),
      hyp("inconsistent", {
        statement: "Snow cover alone explains the April values.",
        contradictingEvidenceIds: ["ev_test_obs"],
      }),
    ];
    const { loop, commit } = await runHypothesisTask(
      {
        task: queuedTask({
          id: "task_test_hypotheses",
          kind: "hypothesis_comparison",
          inputVersions: [{ entityId: "ev_test_obs", revision: 1 }],
          allowedTools: ["read_evidence", "compare_series", "propose_hypotheses"],
        }),
        expectedCaseRevision: 3,
      },
      {
        adapter: new MetaAdapter({
          transport: syntheticTransport([answerStep(JSON.stringify({ items }))]),
          sleep: () => Promise.resolve(),
        }),
        trace: { emit: (e) => events.push(e) },
        store,
        tools: caseToolRegistry(store, CASE_ID),
        newEvidenceId: () => `ev_test_${String((n += 1))}`,
        newRecordId: (prefix) => `${prefix}_test_${String((n += 1))}`,
        committedEvidence: [CTX],
        now: () => AT,
      },
    );
    expect(loop.status).toBe("accepted");
    const hypotheses = commit.upserts.filter(
      (r): r is HypothesisRecord => r.recordType === "Hypothesis",
    );
    const relationships = commit.upserts.filter(
      (r): r is RelationshipRecord => r.recordType === "Relationship",
    );
    expect(hypotheses.map((h) => h.status)).toEqual(["consistent", "inconsistent"]);
    expect(hypotheses[0]?.alternativeHypothesisIds).toEqual([hypotheses[1]?.id]);
    expect(relationships.map((r) => `${r.fromEntityId} ${r.kind} ${r.toEntityId}`)).toEqual([
      `ev_test_ctx supports ${hypotheses[0]?.id ?? ""}`,
      `ev_test_obs contradicts ${hypotheses[1]?.id ?? ""}`,
    ]);
    for (const h of hypotheses) expect(Hypothesis.safeParse(h).success).toBe(true);
    for (const r of relationships) expect(Relationship.safeParse(r).success).toBe(true);
    expect(commit.upserts[0]).toMatchObject({
      status: "succeeded",
      outputEntityIds: hypotheses.map((h) => h.id),
    });
  });
});
