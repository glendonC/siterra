import { describe, expect, it } from "vitest";

import { MetaAdapter } from "../../model/adapter.ts";
import type { ReplayStep } from "../../model/replay.ts";
import { AT, CASE_ID, queuedTask, testStore } from "../../testing/case-fixture.ts";
import { answerStep, syntheticTransport, toolCallStep } from "../../testing/replay-steps.ts";
import { caseToolRegistry } from "../../tools/registry.ts";
import { readSourceTool, searchSourcesTool } from "../../tools/source-tools.ts";
import { MemoryCommitApi } from "../commit.ts";
import type { EvidenceRecord, TaskRecord } from "../records.ts";
import type { TraceEventDraft } from "../trace.ts";
import { runSourceResearchTask } from "./source-task.ts";

// Synthetic replays over a synthetic corpus: the French page text below is invented for the test.

const EXCERPT = "réglé par une fermeture saisonnière de 3 mois.";

function context(
  statement: string,
  excerpt: string,
  locator = "report.pdf, page 2",
  sourceId = "src_test_report",
) {
  return {
    statement,
    claimKind: "scientific_context",
    measurementIds: [],
    sourceId,
    locator,
    excerpt,
    scopeNote: "",
    limitations: [],
  };
}

const GOOD = {
  items: [
    context(
      "The report states that collective grazing is regulated by a seasonal closure of 3 months.",
      EXCERPT,
    ),
  ],
};

function sourceTask(): TaskRecord {
  return queuedTask({
    id: "task_test_sources",
    kind: "source_research",
    question: "What do sources say about seasonal pasture closures?",
    inputVersions: [],
    allowedTools: ["search_sources", "read_source", "propose_evidence"],
  });
}

function harness(steps: ReplayStep[], searches = 10) {
  const store = testStore();
  const events: TraceEventDraft[] = [];
  let n = 0;
  return {
    events,
    deps: {
      adapter: new MetaAdapter({
        transport: syntheticTransport(steps),
        sleep: () => Promise.resolve(),
      }),
      trace: { emit: (e: TraceEventDraft) => events.push(e) },
      store,
      tools: caseToolRegistry(store, CASE_ID, { remaining: searches }),
      newEvidenceId: () => `ev_test_${String((n += 1)).padStart(2, "0")}`,
      now: () => AT,
    },
  };
}

const SEARCH = toolCallStep("search_sources", { query: "fermeture saisonnière" });
const READ = toolCallStep("read_source", {
  sourceId: "src_test_report",
  document: null,
  pages: [2],
  sections: [],
});

describe("source research, synthetic replay, memory commit", () => {
  it("TR-04 path: search, read, a verified excerpt on its page, committed with its locator", async () => {
    const { deps, events } = harness([SEARCH, READ, answerStep(JSON.stringify(GOOD))]);
    const { loop, commit } = await runSourceResearchTask(
      { task: sourceTask(), expectedCaseRevision: 3 },
      deps,
    );
    expect(loop.status).toBe("accepted");
    const api = new MemoryCommitApi(3);
    expect(await api.commit(commit)).toMatchObject({ status: "committed" });
    const evidence = api.evidence.get("ev_test_01") as EvidenceRecord;
    expect(evidence).toMatchObject({
      claimKind: "scientific_context",
      measurementIds: [],
      periodIds: [],
      geoSelectionId: null,
    });
    expect(evidence.provenance).toMatchObject({
      sourceLocators: [
        { sourceId: "src_test_report", locator: "report.pdf, page 2", excerpt: EXCERPT },
      ],
      verificationStatus: "source_checked",
      inputVersions: [{ entityId: "src_test_report", revision: 1 }],
    });
    expect(evidence.provenance.limitations[0]).toBe(
      "Machine-drafted translation from fr; the original excerpt is shown.",
    );
    const tools = events.filter((e) => e.kind === "tool.completed").map((e) => e.tool?.name);
    expect(tools).toEqual(["search_sources", "read_source"]);
  });

  it("a section excerpt of a file with no recorded language carries the translation caveat", async () => {
    const fromPage = {
      items: [
        context(
          "The page states that closures last for 3 months.",
          "Closures last for 3 months",
          "notes.html, section Closures",
          "src_test_page",
        ),
      ],
    };
    const { deps } = harness([answerStep(JSON.stringify(fromPage))]);
    const { commit } = await runSourceResearchTask(
      { task: sourceTask(), expectedCaseRevision: 3 },
      deps,
    );
    const evidence = commit.upserts.find((r) => r.recordType === "Evidence") as EvidenceRecord;
    expect(evidence.provenance.limitations[0]).toBe(
      "Source language not recorded; if the source is not in English, this statement is a machine-drafted translation.",
    );
  });

  it("an excerpt cited on the wrong page is rejected with excerpt_mismatch, then repaired", async () => {
    const wrongPage = {
      items: [context("The report regulates grazing.", EXCERPT, "report.pdf, page 1")],
    };
    const { deps } = harness([
      READ,
      answerStep(JSON.stringify(wrongPage)),
      answerStep(JSON.stringify(GOOD)),
    ]);
    const { loop } = await runSourceResearchTask(
      { task: sourceTask(), expectedCaseRevision: 3 },
      deps,
    );
    expect(loop.repaired).toBe(true);
    expect(loop.status).toBe("accepted");
  });

  it("rejects an altered excerpt, an unavailable source and a number the excerpt lacks", async () => {
    const bad = {
      items: [
        context("The report regulates grazing.", "réglé par une fermeture annuelle"),
        context(
          "The article says closures work.",
          "Not readable.",
          "article.pdf, page 1",
          "src_test_paywalled",
        ),
        context("The report states a seasonal closure of 4 months.", EXCERPT),
      ],
    };
    const { deps } = harness([answerStep(JSON.stringify(bad)), answerStep(JSON.stringify(bad))]);
    const { loop, commit } = await runSourceResearchTask(
      { task: sourceTask(), expectedCaseRevision: 3 },
      deps,
    );
    expect(loop.status).toBe("rejected");
    expect(loop.validation?.issues.map((i) => `${i.code} ${i.path}`)).toEqual([
      "excerpt_mismatch $.items[0].excerpt",
      "claim_kind $.items[1].sourceId",
      "numeric_provenance $.items[2].statement",
    ]);
    expect(commit.upserts).toHaveLength(1);
  });
});

describe("source tools", () => {
  const signal = new AbortController().signal;

  it("read_source refuses a source that was not retrieved", async () => {
    const tool = readSourceTool(testStore(), CASE_ID);
    const parsed = tool.parse({
      sourceId: "src_test_paywalled",
      document: null,
      pages: [1],
      sections: [],
    });
    if (!parsed.ok) throw new Error(parsed.message);
    await expect(tool.run(parsed.value, signal)).rejects.toMatchObject({
      code: "source_unavailable",
    });
  });

  it("read_source returns passages with copyable locators and lists unread ones", async () => {
    const tool = readSourceTool(testStore(), CASE_ID);
    const parsed = tool.parse({
      sourceId: "src_test_report",
      document: null,
      pages: [2, 3],
      sections: [],
    });
    if (!parsed.ok) throw new Error(parsed.message);
    const result = await tool.run(parsed.value, signal);
    expect(result.output).toMatchObject({
      language: "fr",
      passages: [{ locator: "report.pdf, page 2" }],
      unread: ["report.pdf, page 3"],
    });
  });

  it("read_source reads a section of a non-PDF file and reports an unrecorded language", async () => {
    const tool = readSourceTool(testStore(), CASE_ID);
    const parsed = tool.parse({
      sourceId: "src_test_page",
      document: "notes.html",
      pages: [],
      sections: ["Closures"],
    });
    if (!parsed.ok) throw new Error(parsed.message);
    const result = await tool.run(parsed.value, signal);
    expect(result.output).toMatchObject({
      language: "not recorded",
      passages: [{ locator: "notes.html, section Closures" }],
      unread: [],
    });
  });

  it("search_sources searches retrieved sources only and spends the shared budget", async () => {
    const budget = { remaining: 1 };
    const tool = searchSourcesTool(testStore(), CASE_ID, budget);
    const parsed = tool.parse({ query: "fermeture readable" });
    if (!parsed.ok) throw new Error(parsed.message);
    const result = await tool.run(parsed.value, signal);
    expect(
      (result.output as { results: { sourceId: string; locator: string }[] }).results,
    ).toMatchObject([{ sourceId: "src_test_report", locator: "report.pdf, page 2" }]);
    expect(budget.remaining).toBe(0);
    await expect(tool.run(parsed.value, signal)).rejects.toMatchObject({
      code: "search_budget_exhausted",
    });
  });
});
