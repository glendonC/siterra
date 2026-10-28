import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { ReplayTransport, parseReplayFile } from "@siterra/agent";
import type { ModelTransport, ReplayStep } from "@siterra/agent";
import { createPool, eventsOfCommand, readSnapshot, submitCommand } from "@siterra/db";
import { freshDatabase } from "@siterra/db/testing";
import type { TestDatabase } from "@siterra/db/testing";
import { coverIssues, mergeBranches, newId, openPairs } from "@siterra/domain";
import { analysisConfigFor } from "@siterra/domain/cases";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { workerDb } from "./db.ts";
import { handlePlanJob } from "./plan-job.ts";
import { loadAnalyses } from "./recipes.ts";

// The vertical slice offline (GATE-03 path, replay only): the real case seed (data/case and
// data/bundles, loaded by PLATFORM's run-seed.ts), a commission, the plan, an observation task over
// real measurements, validated commits and the event log, on PostgreSQL. The model's outputs are
// synthetic replays written for this test; the numbers in them are the stored measurement values.

const OWNER = "scope_test_slice";
const CASE_ID = "case_aitbouguemez";
const NDVI = "bundle_s2_ndvi_monthly_ait_bouguemez";
const CHIRPS = "bundle_chirps_monthly_ait_bouguemez";
const DEPARTURE = "bundle_ndvi_departure_ait_bouguemez";
const repoDir = fileURLToPath(new URL("../../../", import.meta.url));

let db: TestDatabase;

function answer(text: string): ReplayStep {
  return {
    kind: "stream",
    requestId: "req_synthetic_slice",
    events: [
      { type: "response.output_text.delta", delta: text },
      {
        type: "response.completed",
        response: {
          id: "resp_synthetic_slice",
          status: "completed",
          output: [],
          usage: {
            input_tokens: 2000,
            output_tokens: 300,
            input_tokens_details: { cached_tokens: 0 },
            output_tokens_details: { reasoning_tokens: 80 },
          },
        },
      },
    ],
  };
}

function call(name: string, args: unknown, n: number): ReplayStep {
  const item = {
    type: "function_call",
    call_id: `call_synthetic_slice_${n}`,
    name,
    arguments: JSON.stringify(args),
  };
  return {
    kind: "stream",
    requestId: "req_synthetic_slice",
    events: [
      { type: "response.output_item.done", item },
      {
        type: "response.completed",
        response: {
          id: `resp_synthetic_slice_${n}`,
          status: "completed",
          output: [
            { type: "reasoning", summary: [], encrypted_content: "synthetic-encrypted-slice" },
            item,
          ],
          usage: {
            input_tokens: 1500,
            output_tokens: 60,
            input_tokens_details: { cached_tokens: 0 },
            output_tokens_details: { reasoning_tokens: 20 },
          },
        },
      },
    ],
  };
}

function replay(steps: ReplayStep[]): ReplayTransport {
  return new ReplayTransport(
    parseReplayFile({
      format: "siterra-model-replay@1",
      origin: "synthetic",
      model: "muse-spark-1.3",
      description: "Synthetic vertical slice test.",
      steps,
    }),
  );
}

/** Routes each request to its task's replay by the first line of the instructions. */
function routed(routes: [string, Pick<ModelTransport, "open">][]): ModelTransport {
  return {
    route: "replay",
    replayOrigin: "synthetic",
    open: (body, signal) => {
      const instructions = typeof body["instructions"] === "string" ? body["instructions"] : "";
      const target = routes.find(([prefix]) => instructions.startsWith(prefix))?.[1];
      if (!target) return Promise.reject(new Error("no route"));
      return target.open(body, signal);
    },
  };
}

beforeAll(async () => {
  db = await freshDatabase();
  execFileSync(
    process.execPath,
    [
      `${repoDir}packages/db/src/run-seed.ts`,
      "load",
      "concept",
      OWNER,
      "http://127.0.0.1:4369/assets",
    ],
    { cwd: repoDir, env: { ...process.env, DATABASE_URL: db.url }, stdio: "pipe" },
  );
}, 60_000);

afterAll(async () => {
  await db.drop();
});

describe("vertical slice on the real seed, replay only", () => {
  it(
    "a commission yields a plan, an observation task over real measurements and committed evidence",
    { timeout: 60_000 },
    async () => {
      const before = await readSnapshot(db.pool, CASE_ID, OWNER);
      if (!before) throw new Error("seed not loaded");
      const revisionOf = (id: string) =>
        before.records.dataBundleRecords.find((b) => b.id === id)?.revision ?? 0;
      const ndvi = before.records.measurementRecords.find(
        (m) =>
          m.dataBundleId === NDVI &&
          m.periodId === "period_2022-04" &&
          m.metric === "ndvi_area_median",
      );
      const rain = before.records.measurementRecords.find(
        (m) =>
          m.dataBundleId === CHIRPS &&
          m.periodId === "period_2022-04" &&
          m.metric === "precipitation_departure_from_1991_2020_mean",
      );
      if (!ndvi?.value || !rain?.value)
        throw new Error("expected April 2022 measurements in the seed");

      const submitted = await submitCommand(db.pool, {
        caseId: CASE_ID,
        ownerScopeId: OWNER,
        request: {
          text: "What did vegetation and rainfall look like in spring 2022?",
          intent: "commission",
          context: {
            caseRevision: before.case.revision,
            geoSelectionId: null,
            geoRevision: null,
            periodIds: [],
            focusedEntityIds: [],
            dataBundleIds: [NDVI, CHIRPS],
            locale: "en",
          },
          expectedCaseRevision: before.case.revision,
          idempotencyKey: "key-test-slice-0001",
        },
      });
      if (submitted.status !== "created") throw new Error(submitted.status);
      const command = submitted.command;
      const planTaskId = command.taskIds[0];
      if (!planTaskId) throw new Error("no plan task");

      const plan = {
        interpretation:
          "The command asks what the vegetation and rainfall records show for spring 2022.",
        tasks: [
          {
            key: "observations",
            kind: "observation_analysis",
            question: "What did catchment NDVI and rainfall show in April 2022?",
            dependsOn: [],
            inputRefs: [
              { entityId: NDVI, revision: revisionOf(NDVI) },
              { entityId: CHIRPS, revision: revisionOf(CHIRPS) },
            ],
          },
        ],
        clarifyingQuestion: null,
      };
      const items = [
        {
          statement: `The catchment NDVI area median was ${String(ndvi.value)} in April 2022.`,
          claimKind: "observation",
          measurementIds: [ndvi.id],
          sourceId: null,
          locator: null,
          excerpt: null,
          scopeNote: "",
          limitations: [],
        },
        {
          statement: `Catchment rainfall in April 2022 departed by ${String(rain.value)} mm from the 1991 to 2020 April mean.`,
          claimKind: "observation",
          measurementIds: [rain.id],
          sourceId: null,
          locator: null,
          excerpt: null,
          scopeNote: "",
          limitations: [],
        },
      ];
      const transport = routed([
        ["You plan one command", replay([answer(JSON.stringify(plan))])],
        [
          "You answer one question about observations",
          replay([
            call(
              "summarize_observations",
              {
                bundleId: NDVI,
                bundleRevision: revisionOf(NDVI),
                periodIds: ["period_2022-04"],
                metric: "ndvi_area_median",
              },
              1,
            ),
            call(
              "summarize_observations",
              {
                bundleId: CHIRPS,
                bundleRevision: revisionOf(CHIRPS),
                periodIds: ["period_2022-04"],
                metric: null,
              },
              2,
            ),
            answer(JSON.stringify({ items })),
          ]),
        ],
      ]);

      const result = await handlePlanJob(
        { caseId: CASE_ID, commandId: command.id, planTaskId },
        {
          db: workerDb(db.pool),
          transport,
          corpus: { sources: [], passages: [], missing: [] },
          now: () => new Date(),
          newId: (p) => newId(p),
        },
      );
      expect(result.status === "ran" && result.outcome.status).toBe("succeeded");

      const after = await readSnapshot(db.pool, CASE_ID, OWNER);
      const evidence = after?.records.evidenceRecords ?? [];
      expect(evidence.map((e) => e.measurementIds[0]).sort()).toEqual([ndvi.id, rain.id].sort());
      expect(evidence.every((e) => e.claimKind === "observation" && e.status === "accepted")).toBe(
        true,
      );
      expect(evidence.find((e) => e.measurementIds[0] === ndvi.id)?.provenance).toMatchObject({
        dataBundleIds: [NDVI],
        verificationStatus: "computed_checked",
      });

      const kinds = (await eventsOfCommand(db.pool, CASE_ID, command.id)).map((e) => e.kind);
      expect(kinds.filter((k) => k === "tool.completed")).toHaveLength(2);
      expect(kinds.at(-1)).toBe("command.completed");
    },
  );

  it(
    "DF-02 on explanation branches: a drought challenge records predictions, then loads rainfall on the same area and periods and sets each status by fixed rules",
    { timeout: 60_000 },
    async () => {
      const seeded = await readSnapshot(db.pool, CASE_ID, OWNER);
      if (!seeded) throw new Error("seed not loaded");
      const revisionOf = (id: string) =>
        seeded.records.dataBundleRecords.find((b) => b.id === id)?.revision ?? 0;
      const ndvi = seeded.records.measurementRecords.find(
        (m) =>
          m.dataBundleId === NDVI &&
          m.periodId === "period_2022-04" &&
          m.metric === "ndvi_area_median",
      );
      if (!ndvi?.value) throw new Error("expected an April 2022 NDVI measurement in the seed");
      const context = (caseRevision: number, dataBundleIds: string[], focused: string[]) => ({
        caseRevision,
        geoSelectionId: null,
        geoRevision: null,
        periodIds: [],
        focusedEntityIds: focused,
        dataBundleIds,
        locale: "en" as const,
      });
      const run = async (
        text: string,
        intent: "commission" | "investigate",
        dataBundleIds: string[],
        focused: string[],
        key: string,
        transport: ModelTransport,
      ) => {
        const now = await readSnapshot(db.pool, CASE_ID, OWNER);
        if (!now) throw new Error("no snapshot");
        const submitted = await submitCommand(db.pool, {
          caseId: CASE_ID,
          ownerScopeId: OWNER,
          request: {
            text,
            intent,
            context: context(now.case.revision, dataBundleIds, focused),
            expectedCaseRevision: now.case.revision,
            idempotencyKey: key,
          },
        });
        if (submitted.status !== "created") throw new Error(submitted.status);
        const planTaskId = submitted.command.taskIds[0];
        if (!planTaskId) throw new Error("no plan task");
        const analyses = await loadAnalyses(repoDir, now.records.dataBundleRecords);
        expect(analyses.missing).toEqual([]);
        const result = await handlePlanJob(
          { caseId: CASE_ID, commandId: submitted.command.id, planTaskId },
          {
            db: workerDb(db.pool),
            transport,
            corpus: { sources: [], passages: [], missing: [] },
            analyses,
            now: () => new Date(),
            newId: (p) => newId(p),
          },
        );
        return { command: submitted.command, revisionBefore: now.case.revision, result };
      };

      // The commission the challenge questions: one observation of April 2022 NDVI.
      const observed = await run(
        "What did vegetation look like in April 2022?",
        "commission",
        [NDVI],
        [],
        "key-test-slice-df02-commission",
        routed([
          [
            "You plan one command",
            replay([
              answer(
                JSON.stringify({
                  interpretation:
                    "The command asks what the vegetation record shows for April 2022.",
                  tasks: [
                    {
                      key: "observations",
                      kind: "observation_analysis",
                      question: "What did catchment NDVI show in April 2022?",
                      dependsOn: [],
                      inputRefs: [{ entityId: NDVI, revision: revisionOf(NDVI) }],
                    },
                  ],
                  clarifyingQuestion: null,
                }),
              ),
            ]),
          ],
          [
            "You answer one question about observations",
            replay([
              call(
                "summarize_observations",
                {
                  bundleId: NDVI,
                  bundleRevision: revisionOf(NDVI),
                  periodIds: ["period_2022-04"],
                  metric: "ndvi_area_median",
                },
                1,
              ),
              answer(
                JSON.stringify({
                  items: [
                    {
                      statement: `The catchment NDVI area median was ${String(ndvi.value)} in April 2022.`,
                      claimKind: "observation",
                      measurementIds: [ndvi.id],
                      sourceId: null,
                      locator: null,
                      excerpt: null,
                      scopeNote: "",
                      limitations: [],
                    },
                  ],
                }),
              ),
            ]),
          ],
        ]),
      );
      expect(observed.result.status === "ran" && observed.result.outcome.status).toBe("succeeded");
      const afterCommission = await readSnapshot(db.pool, CASE_ID, OWNER);
      const observation = afterCommission?.records.evidenceRecords.find(
        (e) =>
          e.measurementIds.includes(ndvi.id) &&
          afterCommission.records.taskRecords.some(
            (t) => t.id === e.provenance.generatedByTaskId && t.commandId === observed.command.id,
          ),
      );
      if (!observation) throw new Error("the commission committed no observation");

      // The challenge: explanation branches for the valley's five configured explanations. The
      // predictions are synthetic replays written for this test; host code scores them against the
      // real stored record, so the statuses below are a test of the rules, not a finding.
      const challengeAt = new Date();
      const SEASON = "season_2021-11_2022-04";
      const unused = {
        pairId: null,
        side: null,
        periodIds: [],
        windowMonths: null,
        seasonId: null,
        flag: null,
        fieldCheckId: null,
        expected: null,
      };
      const onVegetation = (kind: string, periodIds: string[], expected: string, flag = null) => ({
        ...unused,
        kind,
        pairId: "vegetation_rainfall",
        side: "a",
        periodIds,
        flag,
        expected,
      });
      const predictions: Record<string, unknown> = {
        rainfall: [
          {
            necessary: true,
            test: {
              ...unused,
              kind: "season_category",
              seasonId: SEASON,
              expected: "below_normal",
            },
            wording: `The wet season ${SEASON} is below normal.`,
          },
          {
            necessary: false,
            test: {
              ...unused,
              kind: "co_movement",
              pairId: "vegetation_rainfall",
              windowMonths: 0,
              expected: "same_sign_majority",
            },
            wording: "Most aligned months of vegetation and rainfall departures share a sign.",
          },
        ],
        grazing: [
          {
            necessary: true,
            test: onVegetation("departure_sign", ["period_2022-04"], "negative"),
            wording: "The vegetation departure in period_2022-04 is negative.",
          },
          {
            necessary: false,
            test: { ...unused, kind: "season_category", seasonId: SEASON, expected: "near_normal" },
            wording: `The wet season ${SEASON} is near normal.`,
          },
        ],
        land_use: [
          {
            necessary: true,
            test: onVegetation("departure_sign", ["period_2022-04"], "negative"),
            wording: "The vegetation departure in period_2022-04 is negative.",
          },
          {
            necessary: false,
            test: onVegetation(
              "availability",
              ["period_2022-03", "period_2022-04"],
              "all_available",
            ),
            wording: "Vegetation departures are available in period_2022-03 and period_2022-04.",
          },
        ],
        snow_terrain: [
          {
            necessary: true,
            test: {
              ...onVegetation("quality_flag", ["period_2022-04"], "present"),
              flag: "snow_suspected",
            },
            wording: "Snow is flagged in period_2022-04.",
          },
          {
            necessary: false,
            test: onVegetation("departure_sign", ["period_2022-04"], "negative"),
            wording: "The vegetation departure in period_2022-04 is negative.",
          },
        ],
        data_artefact: [
          {
            necessary: true,
            test: {
              ...onVegetation("quality_flag", ["period_2022-04"], "present"),
              flag: "low_scene_count",
            },
            wording: "A low scene count is flagged in period_2022-04.",
          },
          {
            necessary: false,
            test: onVegetation("availability", ["period_2022-04"], "some_unavailable"),
            wording: "A vegetation departure is unavailable in period_2022-04.",
          },
        ],
      };
      const byExplanation: Pick<ModelTransport, "open"> = {
        open: (body, signal) => {
          const text = JSON.stringify(body["input"]);
          const id = Object.keys(predictions).find((e) =>
            text.includes(`Explanation: {\\"id\\":\\"${e}\\"`),
          );
          if (!id) return Promise.reject(new Error("no explanation route"));
          return replay([answer(JSON.stringify({ predictions: predictions[id] }))]).open(
            body,
            signal,
          );
        },
      };
      const challenged = await run(
        "Could drought explain this instead?",
        "investigate",
        [DEPARTURE, CHIRPS],
        [observation.id],
        "key-test-slice-df02-challenge",
        routed([
          [
            "You plan one command",
            replay([
              answer(
                JSON.stringify({
                  interpretation:
                    "The command asks whether lower rainfall could explain the April 2022 vegetation record.",
                  tasks: [
                    {
                      key: "compare",
                      kind: "explanation_branches",
                      question:
                        "Which explanations of the April 2022 NDVI does the record leave standing?",
                      dependsOn: [],
                      inputRefs: [
                        { entityId: observation.id, revision: observation.revision },
                        { entityId: DEPARTURE, revision: revisionOf(DEPARTURE) },
                        { entityId: CHIRPS, revision: revisionOf(CHIRPS) },
                      ],
                    },
                  ],
                  clarifyingQuestion: null,
                }),
              ),
            ]),
          ],
          ["You write predictions", byExplanation],
        ]),
      );
      expect(challenged.result.status === "ran" && challenged.result.outcome.status).toBe(
        "succeeded",
      );

      const after = await readSnapshot(db.pool, CASE_ID, OWNER);
      if (!after) throw new Error("no snapshot");
      expect(after.case.revision).toBeGreaterThan(challenged.revisionBefore);
      const ownTasks = new Set(
        after.records.taskRecords
          .filter((t) => t.commandId === challenged.command.id)
          .map((t) => t.id),
      );
      const order = Object.keys(predictions);
      const branches = (after.records.explanationBranchRecords ?? [])
        .filter((b) => ownTasks.has(b.taskId))
        .sort((x, y) => order.indexOf(x.explanationId) - order.indexOf(y.explanationId));
      expect(branches.map((b) => b.explanationId)).toEqual(Object.keys(predictions));
      // DF-07 on the database: the predictions hold an earlier case revision than the scores.
      for (const b of branches) {
        expect(b.revision).toBe(2);
        expect(b.predictionsCaseRevision).toBeGreaterThan(challenged.revisionBefore);
        expect(b.predictionsCaseRevision).toBeLessThan(after.case.revision);
      }
      // DF-08 on the real record: the stored statuses are the fixed rules over the stored scores.
      expect(branches.map((b) => b.status)).toEqual(
        mergeBranches(
          branches.map((b) => ({
            branchId: b.id,
            explanationId: b.explanationId,
            predictions: b.predictions,
            scores: b.scores,
          })),
        ).branches.map((m) => m.status),
      );
      // Rainfall loaded for the same area and periods: compared, not refused for a mismatch.
      const coMovement = branches
        .find((b) => b.explanationId === "rainfall")
        ?.scores.find((s) => s.predictionKey === "p2");
      expect(coMovement?.reasonCode).not.toBe("area_mismatch");
      expect(coMovement?.dataBundleIds).toEqual([DEPARTURE, CHIRPS]);
      expect(coMovement?.measurementIds.length).toBeGreaterThan(0);

      const hypotheses = after.records.hypothesisRecords.filter((h) =>
        ownTasks.has(h.provenance.generatedByTaskId ?? ""),
      );
      expect(hypotheses.map((h) => h.id).sort()).toEqual(
        branches.map((b) => b.hypothesisId ?? "").sort(),
      );
      for (const h of hypotheses) expect(h.status).not.toBe("untested");

      // DF-09 on the real record: the stored field plan is the minimum cover over the valley's
      // field checks for the pairs the merge left open, recomputed here.
      const merge = (after.records.branchMergeRecords ?? []).find((m) => ownTasks.has(m.taskId));
      const valley = analysisConfigFor(CASE_ID);
      const plan = merge?.fieldPlan;
      expect(plan).toBeDefined();
      expect(
        coverIssues(
          {
            measurements: (plan?.measurements ?? []).map((m) => ({ ...m, id: m.fieldCheckId })),
            unseparated: plan?.unseparated ?? [],
          },
          valley?.fieldChecks ?? [],
          openPairs(merge?.branches ?? []),
        ),
      ).toEqual([]);

      // The trace shows the real loads, run by host code after the predictions were recorded.
      const events = await eventsOfCommand(db.pool, CASE_ID, challenged.command.id);
      const recorded = events.findIndex((e) => e.kind === "task.progress");
      expect(recorded).toBeGreaterThan(-1);
      const loads = events.filter((e) => e.kind === "tool.completed");
      expect(loads.map((e) => [e.tool?.name, e.tool?.status])).toEqual([
        ["compare_series", "succeeded"],
        ["compare_series", "succeeded"],
      ]);
      expect(loads.every((e) => events.indexOf(e) > recorded)).toBe(true);
      expect(loads[0]?.tool?.resultEntityIds.length).toBeGreaterThan(0);
      expect(
        events
          .filter((e) => e.kind.startsWith("model.") || e.kind.startsWith("tool."))
          .every((e) => Date.parse(e.occurredAt) >= challengeAt.getTime()),
      ).toBe(true);
    },
  );

  // DF-02 clauses explanation branches do not meet yet; open for the founder, not passed.
  it.todo(
    "DF-02 each branch hypothesis is linked to the challenged observation's evidence ID (founder decision: which link)",
  );
  it.todo(
    "DF-02 each unresolved branch names a discriminating field measurement (under merge@1 the seed leaves one branch standing, so no pair is open and the field plan is empty)",
  );

  it(
    "a spend guard stop aborts the call in flight and the command ends cancelled, also after reload",
    { timeout: 60_000 },
    async () => {
      const before = await readSnapshot(db.pool, CASE_ID, OWNER);
      if (!before) throw new Error("seed not loaded");
      const revisionOf = (id: string) =>
        before.records.dataBundleRecords.find((b) => b.id === id)?.revision ?? 0;
      const ndvi = before.records.measurementRecords.find(
        (m) =>
          m.dataBundleId === NDVI &&
          m.periodId === "period_2022-04" &&
          m.metric === "ndvi_area_median",
      );
      if (!ndvi?.value) throw new Error("expected an April 2022 NDVI measurement in the seed");
      const submitted = await submitCommand(db.pool, {
        caseId: CASE_ID,
        ownerScopeId: OWNER,
        request: {
          text: "What did vegetation look like in April 2022?",
          intent: "commission",
          context: {
            caseRevision: before.case.revision,
            geoSelectionId: null,
            geoRevision: null,
            periodIds: [],
            focusedEntityIds: [],
            dataBundleIds: [NDVI],
            locale: "en",
          },
          expectedCaseRevision: before.case.revision,
          idempotencyKey: "key-test-slice-guard-0001",
        },
      });
      if (submitted.status !== "created") throw new Error(submitted.status);
      const command = submitted.command;
      const planTaskId = command.taskIds[0];
      if (!planTaskId) throw new Error("no plan task");
      const plan = {
        interpretation: "The command asks what the vegetation record shows for April 2022.",
        tasks: [
          {
            key: "observations",
            kind: "observation_analysis",
            question: "What did catchment NDVI show in April 2022?",
            dependsOn: [],
            inputRefs: [{ entityId: NDVI, revision: revisionOf(NDVI) }],
          },
        ],
        clarifyingQuestion: null,
      };
      const item = {
        statement: `The catchment NDVI area median was ${String(ndvi.value)} in April 2022.`,
        claimKind: "observation",
        measurementIds: [ndvi.id],
        sourceId: null,
        locator: null,
        excerpt: null,
        scopeNote: "",
        limitations: [],
      };
      const observation = replay([
        call(
          "summarize_observations",
          {
            bundleId: NDVI,
            bundleRevision: revisionOf(NDVI),
            periodIds: ["period_2022-04"],
            metric: "ndvi_area_median",
          },
          1,
        ),
        answer(JSON.stringify({ items: [item] })),
      ]);
      // The guard stops the worker while the observation task's proposal call is in flight: the
      // call is held for 200 ms, or until its signal aborts.
      const guard = new AbortController();
      let observationCalls = 0;
      let inFlightAborted = false;
      const routes = routed([
        ["You plan one command", replay([answer(JSON.stringify(plan))])],
        ["You answer one question about observations", observation],
      ]);
      const transport: ModelTransport = {
        ...routes,
        open: async (body, signal) => {
          const instructions = typeof body["instructions"] === "string" ? body["instructions"] : "";
          if (instructions.startsWith("You answer one question about observations")) {
            observationCalls += 1;
            if (observationCalls === 2) {
              guard.abort();
              await new Promise<void>((resolve) => {
                const held = setTimeout(resolve, 200);
                signal.addEventListener("abort", () => {
                  clearTimeout(held);
                  resolve();
                });
              });
              inFlightAborted = signal.aborted;
            }
          }
          return routes.open(body, signal);
        },
      };

      const result = await handlePlanJob(
        { caseId: CASE_ID, commandId: command.id, planTaskId },
        {
          db: workerDb(db.pool),
          transport,
          corpus: { sources: [], passages: [], missing: [] },
          now: () => new Date(),
          newId: (p) => newId(p),
          spendStop: guard.signal,
        },
      );
      const outcome = result.status === "ran" ? result.outcome : null;
      expect({ inFlightAborted, status: outcome?.status, stopReason: outcome?.stopReason }).toEqual(
        { inFlightAborted: true, status: "cancelled", stopReason: "spend_guard" },
      );

      // Reload: a new connection reads the command, its tasks, evidence and events back.
      const reload = createPool(db.url);
      try {
        const after = await readSnapshot(reload, CASE_ID, OWNER);
        const tasks = (after?.records.taskRecords ?? []).filter((t) => t.commandId === command.id);
        expect(tasks.map((t) => [t.kind, t.status, t.failureCode]).sort()).toEqual([
          ["observation_analysis", "failed", "spend_guard"],
          ["plan", "succeeded", null],
        ]);
        const taskIds = new Set(tasks.map((t) => t.id));
        expect(
          (after?.records.evidenceRecords ?? []).filter((e) =>
            taskIds.has(e.provenance.generatedByTaskId ?? ""),
          ),
        ).toEqual([]);
        expect((await workerDb(reload).readCommand(command.id))?.status).toBe("cancelled");
        const events = await eventsOfCommand(reload, CASE_ID, command.id);
        expect(events.at(-1)).toMatchObject({
          kind: "command.completed",
          resultStatus: "cancelled",
        });
      } finally {
        await reload.end();
      }
    },
  );
});
