// The model's one job for a question typed in the Ask: given the question and the case's findings (lib/ask/findings.ts),
// each under a short id, return the ids of the ones that answer it, most direct first, at most three, or none. One call
// to the configured model endpoint over the transport the follow-up route gives it (observedFetch), a strict JSON shape,
// and a check of the reply: an id the list does not hold is dropped, and nothing else the model writes is read, kept
// or shown. The prompt's words are the model's, never the screen's.

import { en } from "../copy/en";
import type { LlmConfig } from "../live-place/llm-schema-and-prompt";
import { VIEW_LABEL } from "../overview/actions";
import type { CaseFinding, FindingPlace } from "./findings";

/** At most this many findings answer one question. */
export const MAX_CHOSEN = 3;

/** The id the model knows a finding by: its place in the list, from f1. */
export const choiceId = (i: number): string => `f${String(i + 1)}`;

/** What a finding is, for the model: where the case says it. */
function placeWords(place: FindingPlace): string {
  switch (place.kind) {
    case "answer":
      return "The case's answer";
    case "verdict":
      return "Verdict on one explanation";
    case "next":
      return "A check that would settle it";
    case "view":
      return `View: ${en[VIEW_LABEL[place.view]].text}`;
    case "source":
      return place.source ? `Source: ${place.source}` : "The case's record";
  }
}

/** The request body (Responses API): the question and the numbered findings, and the one JSON shape the reply takes. */
export function selectionRequest(
  question: string,
  placeName: string,
  findings: readonly CaseFinding[],
  model: string,
): Record<string, unknown> {
  const instructions = [
    "You choose which of a case's findings answer a visitor's question about a place.",
    `Each finding has an id. Return the ids of the findings that answer the question, the most direct first, at most ${String(MAX_CHOSEN)}.`,
    "Choose a finding only when it says what the question asks about; a finding that only shares words with the question does not answer it.",
    "When a verdict you choose says there is not enough data yet, also choose the check that would settle that explanation, if one is listed.",
    "If no finding answers the question, return an empty list.",
    "Return only the JSON object.",
  ].join("\n");
  const text = [
    `Place: ${placeName}`,
    `Question: ${question.trim()}`,
    "",
    "Findings:",
    ...findings.map((f, i) => `${choiceId(i)} [${placeWords(f.place)}] ${f.lines.join(" ")}`),
  ].join("\n");
  return {
    model,
    store: false,
    stream: false,
    instructions,
    input: [{ role: "user", content: [{ type: "input_text", text }] }],
    reasoning: { effort: "low" },
    max_output_tokens: 2048,
    text: {
      format: {
        type: "json_schema",
        name: "siterra_case_findings",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            ids: {
              type: "array",
              items: { type: "string", enum: findings.map((_, i) => choiceId(i)) },
            },
          },
          required: ["ids"],
        },
      },
    },
  };
}

/** The text of a reply: the Responses API's output text, or a chat-style message's; empty when it holds none. */
export function replyText(payload: unknown): string {
  if (typeof payload !== "object" || payload === null) return "";
  const rec = payload as Record<string, unknown>;
  if (typeof rec["output_text"] === "string") return rec["output_text"];
  if (Array.isArray(rec["output"])) {
    const parts = (rec["output"] as unknown[]).flatMap((item) => {
      const content = (item as { content?: unknown } | null)?.content;
      return Array.isArray(content)
        ? content.flatMap((part) => {
            const p = part as { type?: unknown; text?: unknown } | null;
            return (p?.type === "output_text" || p?.type === "text") && typeof p.text === "string"
              ? [p.text]
              : [];
          })
        : [];
    });
    if (parts.length) return parts.join("");
  }
  const choice = (rec["choices"] as { message?: { content?: unknown } }[] | undefined)?.[0];
  return typeof choice?.message?.content === "string" ? choice.message.content : "";
}

/**
 * The findings a reply chose, in its order: each id it names that the list holds, once, at most three. Null when the
 * reply is not the JSON object asked for.
 */
export function chosenOf(text: string, findings: readonly CaseFinding[]): CaseFinding[] | null {
  const json = /\{[\s\S]*\}/.exec(text)?.[0];
  if (json === undefined) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  const ids = (parsed as { ids?: unknown } | null)?.ids;
  if (!Array.isArray(ids)) return null;
  const byId = new Map(findings.map((f, i) => [choiceId(i), f]));
  const chosen = [...new Set(ids.filter((id): id is string => typeof id === "string"))].flatMap(
    (id) => byId.get(id) ?? [],
  );
  return chosen.slice(0, MAX_CHOSEN);
}

export interface SelectInput {
  question: string;
  placeName: string;
  findings: readonly CaseFinding[];
  config: LlmConfig;
  /** The transport, which records what it reported (lib/live-place/follow-up.ts observedFetch). */
  fetchImpl: typeof globalThis.fetch;
  timeoutMs?: number;
}

/**
 * Asks the model once which findings answer the question. Null when no reply came that this can read: the transport's
 * report says why (lib/live-place/follow-up.ts noAnswerCode). Nothing is logged, so no key or reply leaves this call.
 */
export async function selectFindings(input: SelectInput): Promise<CaseFinding[] | null> {
  const ac = new AbortController();
  const timer = setTimeout(() => {
    ac.abort();
  }, input.timeoutMs ?? 35_000);
  try {
    const res = await input.fetchImpl(`${input.config.baseUrl.replace(/\/+$/, "")}/responses`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${input.config.apiKey}`,
      },
      body: JSON.stringify(
        selectionRequest(input.question, input.placeName, input.findings, input.config.model),
      ),
      signal: ac.signal,
    });
    if (!res.ok) return null;
    return chosenOf(replyText(await res.json()), input.findings);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
