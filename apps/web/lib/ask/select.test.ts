import { describe, expect, it } from "vitest";
import type { LlmConfig } from "../live-place/llm-schema-and-prompt";
import type { CaseFinding } from "./findings";
import { chosenOf, replyText, selectFindings, selectionRequest } from "./select";

// The model's one job: name, by id, which of the case's findings answer the question. Everything else it writes is
// dropped here, so the only thing that leaves this module is a finding the case already holds, as the case words it.

const FINDINGS: CaseFinding[] = [
  {
    key: { entityId: "meas_share_up", revision: 1 },
    lines: ["Since 2000, 24.7% of the area has greened and 0.1% has browned."],
    place: { kind: "answer" },
  },
  {
    key: { entityId: "branch_rainfall", revision: 2 },
    lines: ["Rainfall does not fit the evidence."],
    place: { kind: "verdict" },
  },
  {
    key: { entityId: "inst_rainfall", revision: 1 },
    lines: ["Year to year, March to June greenness follows September to May rainfall only weakly."],
    place: { kind: "view", view: "rainfall" },
  },
  {
    key: { entityId: "ev_herders", revision: 1 },
    lines: ["Herders report losing palatable species."],
    place: { kind: "source", source: "El Aayadi et al. 2026" },
  },
];

const CONFIG: LlmConfig = {
  provider: "meta",
  model: "muse-spark-1.3",
  apiKey: "test-only-not-a-key",
  baseUrl: "https://model.invalid/v1/",
};

// written so it can be searched for in everything the selection returns
const PROSE = "Model prose: rainfall explains all of it, certainly.";

describe("the request", () => {
  const body = selectionRequest(
    " Does rain explain it? ",
    "Aït Bouguemez valley",
    FINDINGS,
    "muse-spark-1.3",
  );

  it("asks for one strict JSON object of ids from the list, and nothing stored", () => {
    expect(body).toMatchObject({
      model: "muse-spark-1.3",
      store: false,
      stream: false,
      text: {
        format: {
          type: "json_schema",
          name: "siterra_case_findings",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              ids: { type: "array", items: { type: "string", enum: ["f1", "f2", "f3", "f4"] } },
            },
            required: ["ids"],
          },
        },
      },
    });
    expect(String(body["instructions"])).toContain("at most 3");
    // a verdict of not enough data is answered with the check that would settle it, as the column pairs them
    expect(String(body["instructions"])).toContain(
      "also choose the check that would settle that explanation",
    );
  });

  it("lists every finding under its id with where the case says it, and the question as asked", () => {
    const input = body["input"] as { content: { text: string }[] }[];
    expect(input[0]?.content[0]?.text.split("\n")).toEqual([
      "Place: Aït Bouguemez valley",
      "Question: Does rain explain it?",
      "",
      "Findings:",
      "f1 [The case's answer] Since 2000, 24.7% of the area has greened and 0.1% has browned.",
      "f2 [Verdict on one explanation] Rainfall does not fit the evidence.",
      "f3 [View: Rain and Greenness] Year to year, March to June greenness follows September to May rainfall only weakly.",
      "f4 [Source: El Aayadi et al. 2026] Herders report losing palatable species.",
    ]);
  });
});

describe("the reply", () => {
  it("is read from the Responses API's output text or message parts, or a chat-style message", () => {
    expect(replyText({ output_text: '{"ids":[]}' })).toBe('{"ids":[]}');
    expect(
      replyText({
        output: [
          { type: "reasoning", content: [{ type: "reasoning_text", text: PROSE }] },
          {
            type: "message",
            content: [
              { type: "output_text", text: '{"ids":' },
              { type: "output_text", text: '["f2"]}' },
            ],
          },
        ],
      }),
    ).toBe('{"ids":["f2"]}');
    expect(replyText({ choices: [{ message: { content: '{"ids":["f1"]}' } }] })).toBe(
      '{"ids":["f1"]}',
    );
    expect(replyText(null)).toBe("");
    expect(replyText({ output: "no" })).toBe("");
  });

  it("names findings of the list, in its order, each once, at most three; any other id is dropped", () => {
    expect(chosenOf('{"ids":["f3","f2"]}', FINDINGS)).toEqual([FINDINGS[2], FINDINGS[1]]);
    expect(chosenOf('{"ids":["f9","f2","f2","f4","f1","f3"]}', FINDINGS)).toEqual([
      FINDINGS[1],
      FINDINGS[3],
      FINDINGS[0],
    ]);
    expect(chosenOf('{"ids":[]}', FINDINGS)).toEqual([]);
    expect(chosenOf('```json\n{"ids":["f1"]}\n```', FINDINGS)).toEqual([FINDINGS[0]]);
  });

  it("is no answer when it is not the object asked for", () => {
    for (const text of ["", "f1 and f2", '{"ids":"f1"}', '{"choice":["f1"]}', "{ids: [f1]}"])
      expect(chosenOf(text, FINDINGS), text).toBeNull();
  });

  it("lets no word the model writes out: a chosen finding is the list's own, as the case words it", () => {
    const chosen = chosenOf(
      JSON.stringify({ ids: ["f2", PROSE], answer: PROSE, statement: PROSE, lines: [PROSE] }),
      FINDINGS,
    );
    expect(chosen).toEqual([FINDINGS[1]]);
    expect(chosen?.[0]).toBe(FINDINGS[1]);
    expect(JSON.stringify(chosen)).not.toContain("Model prose");
  });
});

describe("the one call", () => {
  const reply = (body: unknown, status = 200) =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      }),
    );

  it("posts the request to the endpoint with the key, and returns the findings it chose", async () => {
    const calls: { url: string; init: RequestInit | undefined }[] = [];
    const chosen = await selectFindings({
      question: "Does rain explain it?",
      placeName: "Aït Bouguemez valley",
      findings: FINDINGS,
      config: CONFIG,
      fetchImpl: (input, init) => {
        calls.push({ url: typeof input === "string" ? input : "not a string", init });
        return reply({ output_text: JSON.stringify({ ids: ["f3", "f2"], note: PROSE }) });
      },
    });
    expect(chosen).toEqual([FINDINGS[2], FINDINGS[1]]);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://model.invalid/v1/responses");
    expect(calls[0]?.init?.method).toBe("POST");
    expect((calls[0]?.init?.headers as Record<string, string>)["Authorization"]).toBe(
      "Bearer test-only-not-a-key",
    );
    const body = calls[0]?.init?.body;
    expect(JSON.parse(typeof body === "string" ? body : "null")).toEqual(
      selectionRequest("Does rain explain it?", "Aït Bouguemez valley", FINDINGS, "muse-spark-1.3"),
    );
  });

  it("is no answer when the service refuses, the call fails or it runs out of time", async () => {
    const ask = (fetchImpl: typeof globalThis.fetch, timeoutMs?: number) =>
      selectFindings({
        question: "q",
        placeName: "p",
        findings: FINDINGS,
        config: CONFIG,
        fetchImpl,
        ...(timeoutMs ? { timeoutMs } : {}),
      });
    expect(await ask(() => reply({ error: PROSE }, 503))).toBeNull();
    expect(await ask(() => Promise.reject(new TypeError("fetch failed")))).toBeNull();
    expect(await ask(() => reply({ output_text: PROSE }))).toBeNull();
    const hung: typeof globalThis.fetch = (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("aborted", "AbortError"));
        });
      });
    expect(await ask(hung, 10)).toBeNull();
  });
});
