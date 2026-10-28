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
import { validateEvidenceProposal } from "../evidence/proposal.ts";
import {
  LIVELIHOOD_RULES,
  LIVELIHOOD_SPEC,
  SOURCE_RESEARCH_SPEC,
  runSourceResearchTask,
} from "./source-task.ts";

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
  it("the first message lists each readable document's kind, pages and sections", async () => {
    const task = queuedTask({ kind: "source_research", question: "What do sources say?" });
    const text = await SOURCE_RESEARCH_SPEC.firstMessage(task, testStore());
    expect(text.split("\n")).toEqual([
      "Question: What do sources say?",
      `Readable sources: ${JSON.stringify([
        {
          sourceId: "src_test_report",
          title: "Synthetic French report",
          language: "fr",
          documents: [{ name: "report.pdf", kind: "pdf", pageCount: 3, sections: [] }],
        },
        {
          sourceId: "src_test_page",
          title: "Synthetic web page",
          language: "not recorded",
          documents: [
            { name: "notes.html", kind: "text", pageCount: null, sections: ["Closures"] },
          ],
        },
      ])}`,
      `Sources that cannot be read: ${JSON.stringify([
        { sourceId: "src_test_paywalled", status: "unavailable" },
      ])}`,
    ]);
    expect(await LIVELIHOOD_SPEC.firstMessage(task, testStore())).toBe(text);
  });

  it("the shared rules name the cause words code refuses and keep limitations to excerpt numbers (live run of 28 Oct 2026)", () => {
    for (const spec of [SOURCE_RESEARCH_SPEC, LIVELIHOOD_SPEC]) {
      expect(spec.instructions).toContain(
        '- Write no cause, even one the excerpt states: never "caused", "because of", "due to", "driven by", "attributable to", "as a result of", "led to", "leads to" or "results from". The cited excerpt carries what the source says.',
      );
      expect(spec.instructions).toContain(
        "- Numbers in the statement and in limitations must appear in the excerpt.",
      );
    }
    expect(SOURCE_RESEARCH_SPEC.promptVersion).toBe("source_research@3");
    expect(LIVELIHOOD_SPEC.promptVersion).toBe("livelihood_governance@3");
  });

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

describe("livelihood and governance rules (16)", () => {
  const need = (statement: string, scopeNote = "Informs which roles review a closure option.") => ({
    statement,
    claimKind: "field_requirement",
    measurementIds: [],
    sourceId: null,
    locator: null,
    excerpt: null,
    scopeNote,
    limitations: [],
  });
  const check = async (items: unknown[], store = testStore()) =>
    (
      await validateEvidenceProposal(JSON.stringify({ items }), {
        caseId: CASE_ID,
        store,
        allowedClaimKinds: new Set(["scientific_context", "field_requirement"]),
        textRules: LIVELIHOOD_RULES,
      })
    ).issues.map((i) => `${i.code} ${i.path}`);

  it("accepts field requirements that name a role and a decision", async () => {
    expect(
      await check([need("Who decides the closure dates in the valley must be checked locally.")]),
    ).toEqual([]);
  });

  it("refuses counts of households or people, even when the excerpt states them", async () => {
    const store = testStore();
    store.passages.push({
      caseId: CASE_ID,
      sourceId: "src_test_report",
      locator: { document: "report.pdf", page: 3 },
      text: "Synthetic: 120 households use the high pasture.",
      textSha256: "test",
    });
    const counted = {
      ...need("The report states that 120 households use the high pasture."),
      claimKind: "scientific_context",
      sourceId: "src_test_report",
      locator: "report.pdf, page 3",
      excerpt: "120 households use the high pasture.",
      scopeNote: "",
    };
    expect(await check([counted], store)).toEqual(["prohibited_claim $.items[0].statement"]);
    expect(await check([need("About 30 herding families move up in May 2022.")])).toContain(
      "prohibited_claim $.items[0].statement",
    );
  });

  it("refuses contact details and named people, and consent claims", async () => {
    expect(
      await check([need("Ask the association at office@example.org about closures.")]),
    ).toEqual(["prohibited_claim $.items[0].statement"]);
    expect(await check([need("Call +212 600 000 000 about closures.")])).toContain(
      "prohibited_claim $.items[0].statement",
    );
    expect(await check([need("Caid Ahmed decides the closure dates.")])).toEqual([
      "prohibited_claim $.items[0].statement",
    ]);
    expect(await check([need("The community consented to the closure.")])).toEqual([
      "prohibited_claim $.items[0].statement",
    ]);
  });

  const messages = async (statement: string) =>
    (
      await validateEvidenceProposal(JSON.stringify({ items: [need(statement)] }), {
        caseId: CASE_ID,
        store: testStore(),
        allowedClaimKinds: new Set(["scientific_context", "field_requirement"]),
        textRules: LIVELIHOOD_RULES,
      })
    ).issues.map((i) => i.message);

  it("refuses counts of people in words or after the noun (b20)", async () => {
    for (const statement of [
      "About two hundred households use the agdal.",
      "Thirty herding families move to the azib in summer.",
      "Several hundred people live in Tabant.",
      "Dozens of herders share the pasture.",
      "Households in the valley: 1,200.",
      "Twenty-five shepherds use the high pasture.",
    ]) {
      const found = await messages(statement);
      expect(
        found.some((m) =>
          m.endsWith("counts households or people; state it as a field requirement instead."),
        ),
        statement,
      ).toBe(true);
    }
  });

  it("reads a dated year before a people noun as a date, not a count (b20)", async () => {
    expect(
      await check([need("In 2022, herders moved earlier than usual, according to the source.")]),
    ).toEqual([]);
    expect(await check([need("Since May 2022 herders move up earlier.")])).toEqual([]);
  });

  it("refuses titles in any case or after a comma when a name follows (b20)", async () => {
    for (const statement of [
      "The amghar, Moha Ouali, sets the closure dates.",
      "The caid Ahmed decides the closure dates.",
      "Dr. Smith described the pasture rules.",
      "Si Mohamed sets the closure dates.",
      "Sidi Ali keeps the pasture rules.",
      "Lalla Fatima leads the association.",
      "Hajj Brahim decides the dates.",
      "The rules come from Hadj Omar.",
    ]) {
      const found = await messages(statement);
      expect(
        found.some((m) => m.endsWith("names a person; describe the role instead.")),
        statement,
      ).toBe(true);
    }
    expect(
      await check([need("Whether the amghar sets the closure dates must be checked locally.")]),
    ).toEqual([]);
    expect(await check([need("Who the amghar is. Herders know the rules.")])).toEqual([]);
  });

  it("refuses local and international phone numbers and spelled-out emails (b20)", async () => {
    for (const statement of [
      "Call 0612345678 about closures.",
      "Call 06 12 34 56 78 about closures.",
      "Call 212 612 345 678 about closures.",
      "Call 00212 612 345 678 about closures.",
      "Write to office at example dot com about closures.",
      "Write to office [at] example [dot] org about closures.",
    ]) {
      const found = await messages(statement);
      expect(
        found.some((m) => m.endsWith("is contact information, which is never recorded.")),
        statement,
      ).toBe(true);
    }
  });
});
