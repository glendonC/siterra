import { describe, expect, it } from "vitest";
import { type CaseRecord, isMaterialChange, propagateStaleness } from "./staleness.ts";

const at = "2026-10-27T20:00:00Z";
const later = "2026-10-27T21:00:00Z";

function record(
  recordType: string,
  id: string,
  fields: Record<string, unknown>,
  revision = 1,
): CaseRecord {
  return { recordType, id, revision, updatedAt: at, ...fields };
}
const cites = (...refs: [string, number][]) => ({
  provenance: { inputVersions: refs.map(([entityId, revision]) => ({ entityId, revision })) },
});

describe("DF-03 (domain part): exactly the dependents go stale", () => {
  const evidence = record("Evidence", "ev_example_a", {
    status: "accepted",
    ...cites(["meas_example_a", 1]),
  });
  const unrelated = record("Evidence", "ev_example_b", {
    status: "accepted",
    ...cites(["meas_example_b", 1]),
  });
  const hypothesis = record("Hypothesis", "hyp_example_a", {
    status: "consistent",
    ...cites(["ev_example_a", 1]),
  });
  const brief = record("Brief", "brief_example_a", {
    status: "ready_for_review",
    ...cites(["hyp_example_a", 1]),
  });
  const review = record("ReviewDecision", "rev_example_a", {
    stale: false,
    reviewedEntityVersions: [{ entityId: "brief_example_a", revision: 1 }],
  });
  const relationship = record("Relationship", "rel_example_a", {
    status: "accepted",
    fromEntityId: "ev_example_a",
    fromEntityRevision: 1,
    toEntityId: "hyp_example_a",
    toEntityRevision: 1,
  });
  const measurement = record("Measurement", "meas_example_c", { ...cites(["meas_example_a", 1]) });
  const current = [evidence, unrelated, hypothesis, brief, review, relationship, measurement];

  it("follows citations from a changed measurement to evidence, hypothesis, brief, review and relationship", () => {
    const stale = propagateStaleness(current, new Map([["meas_example_a", 2]]), later);
    expect(stale.map((r) => [r.id, r.revision]).sort()).toEqual([
      ["brief_example_a", 2],
      ["ev_example_a", 2],
      ["hyp_example_a", 2],
      ["rel_example_a", 2],
      ["rev_example_a", 2],
    ]);
    const byId = new Map(stale.map((r) => [r.id, r as unknown as Record<string, unknown>]));
    expect(byId.get("ev_example_a")?.["status"]).toBe("stale");
    expect(byId.get("rev_example_a")?.["stale"]).toBe(true);
    expect(byId.get("brief_example_a")?.["updatedAt"]).toBe(later);
  });

  it("leaves records that cite only unchanged or current versions", () => {
    expect(propagateStaleness(current, new Map([["meas_example_z", 2]]), later)).toEqual([]);
    expect(propagateStaleness(current, new Map([["meas_example_a", 1]]), later)).toEqual([]);
  });

  it("never marks a record the commit itself wrote, one already stale, or one without a stale state", () => {
    const stale = propagateStaleness(
      current,
      new Map([
        ["meas_example_a", 2],
        ["ev_example_a", 2],
      ]),
      later,
    );
    expect(stale.map((r) => r.id)).not.toContain("ev_example_a");
    const alreadyStale = record("Hypothesis", "hyp_example_b", {
      status: "stale",
      ...cites(["meas_example_a", 1]),
    });
    expect(
      propagateStaleness([alreadyStale, measurement], new Map([["meas_example_a", 2]]), later),
    ).toEqual([]);
  });

  it("keeps a provisional statement as it is, since provisional cannot move to stale", () => {
    const provisional = record("Evidence", "ev_example_p", {
      status: "provisional",
      ...cites(["meas_example_a", 1]),
    });
    expect(propagateStaleness([provisional], new Map([["meas_example_a", 2]]), later)).toEqual([]);
  });
});

describe("only a material change stales dependents", () => {
  const action = record("OperationalAction", "act_example_a", {
    status: "awaiting_review",
    title: "Example plan",
    remainingConditions: [],
    reviewDecisionIds: [],
  });

  it("a change of status, conditions or review IDs alone is not material", () => {
    const prepared = {
      ...action,
      revision: 2,
      updatedAt: later,
      status: "prepared",
      remainingConditions: ["Community consultation outstanding"],
      reviewDecisionIds: ["rev_example_a"],
    } as CaseRecord;
    expect(isMaterialChange(action, prepared)).toBe(false);
  });

  it("a change of content is material, and so is a first revision", () => {
    expect(
      isMaterialChange(action, { ...action, revision: 2, title: "Another plan" } as CaseRecord),
    ).toBe(true);
    expect(isMaterialChange(undefined, action)).toBe(true);
  });
});

describe("a51: a data record withdrawn by a change of state stales what rests on it", () => {
  const evidence = record("Evidence", "ev_example_w", {
    status: "accepted",
    ...cites(["meas_example_w", 1], ["bundle_example_w", 1]),
  });

  it.each([
    ["Measurement", "meas_example_w", "available", "invalid"],
    ["DataBundle", "bundle_example_w", "validated", "superseded"],
  ])("%s %s from %s to %s is material and stales the evidence", (recordType, id, from, to) => {
    const previous = record(recordType, id, { status: from });
    const next = { ...previous, revision: 2, updatedAt: later, status: to } as CaseRecord;
    expect(isMaterialChange(previous, next)).toBe(true);
    expect(propagateStaleness([evidence], new Map([[id, 2]]), later).map((r) => r.id)).toEqual([
      "ev_example_w",
    ]);
  });

  it("a move that withdraws nothing (provisional to accepted) is not material", () => {
    const previous = record("Evidence", "ev_example_p2", { status: "provisional" });
    expect(
      isMaterialChange(previous, { ...previous, revision: 2, status: "accepted" } as CaseRecord),
    ).toBe(false);
  });

  it("a change of a hypothesis status is material", () => {
    const previous = record("Hypothesis", "hyp_example_m", { status: "consistent" });
    expect(
      isMaterialChange(previous, {
        ...previous,
        revision: 2,
        status: "inconsistent",
      } as CaseRecord),
    ).toBe(true);
  });
});
