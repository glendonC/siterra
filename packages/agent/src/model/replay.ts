import { readFileSync } from "node:fs";

import { TransportError, parseRetryAfter } from "./transport.ts";
import type { ModelTransport, ResponsesBody, TransportStream } from "./transport.ts";
import type { ReplayOrigin } from "./types.ts";

// A replay file holds the steps one or more calls see, in order. `synthetic` files are written by
// hand from Meta's documented event shapes; `recorded` files come from the recorder on a real call.
// Neither is ever shown as live work: results carry route "replay" and the file's origin.
//
// Steps play in order, one per call. A step may instead carry `match`: then it answers any request
// whose instructions start with the prefix, whose input contains the text, and which is at that turn
// (the number of tool outputs already in the input). Matched steps are not used up, so concurrent
// tasks and repeated commands each get their own answer, as a local slice or UI test needs.

/** Which requests a matched step answers. */
export interface ReplayMatch {
  instructionsPrefix: string | null;
  inputIncludes: string | null;
  turn: number;
}

export const REPLAY_FORMAT = "siterra-model-replay@1";

export type ReplayStep = (
  | { kind: "stream"; requestId: string | null; events: unknown[] }
  | { kind: "http_error"; status: number; code: string | null; retryAfter: string | null }
  /** Sends `events`, then nothing more until the request is aborted. */
  | { kind: "stall"; requestId: string | null; events: unknown[] }
) & { match?: ReplayMatch };

export interface ReplayFile {
  format: typeof REPLAY_FORMAT;
  origin: ReplayOrigin;
  model: string;
  description: string;
  steps: ReplayStep[];
}

export class ReplayError extends Error {
  readonly code: "replay_exhausted" | "replay_model_mismatch" | "replay_invalid";

  constructor(
    code: "replay_exhausted" | "replay_model_mismatch" | "replay_invalid",
    detail: string,
  ) {
    super(`${code}: ${detail}`);
    this.name = "ReplayError";
    this.code = code;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseMatch(raw: unknown, index: number): ReplayMatch | undefined {
  if (raw === undefined) return undefined;
  if (
    !isRecord(raw) ||
    typeof raw["turn"] !== "number" ||
    !Number.isInteger(raw["turn"]) ||
    raw["turn"] < 0
  ) {
    throw new ReplayError(
      "replay_invalid",
      `step ${index} has a match without a whole turn number`,
    );
  }
  return {
    instructionsPrefix:
      typeof raw["instructionsPrefix"] === "string" ? raw["instructionsPrefix"] : null,
    inputIncludes: typeof raw["inputIncludes"] === "string" ? raw["inputIncludes"] : null,
    turn: raw["turn"],
  };
}

function parseStep(raw: unknown, index: number): ReplayStep {
  if (!isRecord(raw)) throw new ReplayError("replay_invalid", `step ${index} is not an object`);
  const requestId = typeof raw["requestId"] === "string" ? raw["requestId"] : null;
  const match = parseMatch(raw["match"], index);
  const withMatch = match ? { match } : {};
  switch (raw["kind"]) {
    case "stream":
    case "stall":
      if (!Array.isArray(raw["events"])) {
        throw new ReplayError("replay_invalid", `step ${index} has no events array`);
      }
      return { kind: raw["kind"], requestId, events: raw["events"], ...withMatch };
    case "http_error":
      if (typeof raw["status"] !== "number") {
        throw new ReplayError("replay_invalid", `step ${index} has no status`);
      }
      return {
        kind: "http_error",
        status: raw["status"],
        code: typeof raw["code"] === "string" ? raw["code"] : null,
        retryAfter: typeof raw["retryAfter"] === "string" ? raw["retryAfter"] : null,
        ...withMatch,
      };
    default:
      throw new ReplayError("replay_invalid", `step ${index} has an unknown kind`);
  }
}

/** The number of tool outputs already in a request's input: 0 on a task's first turn. */
function turnOf(body: ResponsesBody): number {
  const input = Array.isArray(body["input"]) ? (body["input"] as unknown[]) : [];
  return input.filter((item) => isRecord(item) && item["type"] === "function_call_output").length;
}

function matches(match: ReplayMatch, body: ResponsesBody): boolean {
  const instructions = typeof body["instructions"] === "string" ? body["instructions"] : "";
  if (match.instructionsPrefix !== null && !instructions.startsWith(match.instructionsPrefix))
    return false;
  if (
    match.inputIncludes !== null &&
    !JSON.stringify(body["input"] ?? null).includes(match.inputIncludes)
  ) {
    return false;
  }
  return match.turn === turnOf(body);
}

export function parseReplayFile(raw: unknown): ReplayFile {
  if (!isRecord(raw) || raw["format"] !== REPLAY_FORMAT) {
    throw new ReplayError("replay_invalid", `format must be ${REPLAY_FORMAT}`);
  }
  const origin = raw["origin"];
  if (origin !== "synthetic" && origin !== "recorded") {
    throw new ReplayError("replay_invalid", "origin must be synthetic or recorded");
  }
  if (typeof raw["model"] !== "string" || !Array.isArray(raw["steps"])) {
    throw new ReplayError("replay_invalid", "model and steps are required");
  }
  return {
    format: REPLAY_FORMAT,
    origin,
    model: raw["model"],
    description: typeof raw["description"] === "string" ? raw["description"] : "",
    steps: raw["steps"].map(parseStep),
  };
}

export function loadReplayFile(path: string | URL): ReplayFile {
  return parseReplayFile(JSON.parse(readFileSync(path, "utf8")) as unknown);
}

async function* play(events: unknown[], stall: boolean, signal: AbortSignal): AsyncGenerator {
  for (const event of events) {
    await Promise.resolve();
    yield event;
  }
  if (stall) {
    await new Promise<void>((resolve) => {
      if (signal.aborted) resolve();
      signal.addEventListener("abort", () => {
        resolve();
      });
    });
  }
}

/** Plays a replay file's steps, one per `open`, and refuses a request for a different model. */
export class ReplayTransport implements ModelTransport {
  readonly route = "replay" as const;
  readonly replayOrigin: ReplayOrigin;
  readonly opened: ResponsesBody[] = [];
  readonly #file: ReplayFile;
  #next = 0;

  constructor(file: ReplayFile) {
    this.#file = file;
    this.replayOrigin = file.origin;
  }

  get remaining(): number {
    return this.#file.steps.length - this.#next;
  }

  open(body: ResponsesBody, signal: AbortSignal): Promise<TransportStream> {
    if (body["model"] !== this.#file.model) {
      return Promise.reject(
        new ReplayError(
          "replay_model_mismatch",
          `request model ${String(body["model"])} but the replay holds ${this.#file.model}`,
        ),
      );
    }
    let step: ReplayStep | undefined;
    if (this.#file.steps.some((s) => s.match)) {
      step = this.#file.steps.find((s) => s.match !== undefined && matches(s.match, body));
      if (!step) {
        return Promise.reject(
          new ReplayError(
            "replay_exhausted",
            `no step matches turn ${turnOf(body)} of this request`,
          ),
        );
      }
    } else {
      step = this.#file.steps[this.#next];
      if (!step) {
        return Promise.reject(new ReplayError("replay_exhausted", `${this.#next} steps played`));
      }
      this.#next += 1;
    }
    this.opened.push(body);
    if (step.kind === "http_error") {
      return Promise.reject(
        new TransportError(step.status, step.code, parseRetryAfter(step.retryAfter, Date.now())),
      );
    }
    return Promise.resolve({
      requestId: step.requestId,
      events: play(step.events, step.kind === "stall", signal),
    });
  }
}
