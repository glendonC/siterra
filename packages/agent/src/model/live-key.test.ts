import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it, vi } from "vitest";

import { runObservationTask } from "../tasks/observation/observation-task.ts";
import type { TraceEventDraft } from "../tasks/trace.ts";
import { AT, CASE_ID, queuedTask, testStore } from "../testing/case-fixture.ts";
import { caseToolRegistry } from "../tools/registry.ts";
import { MetaAdapter } from "./adapter.ts";
import { KeychainError, readKeychainKey } from "./keychain.ts";
import type { SecurityRunner } from "./keychain.ts";
import { LIVE_APPROVAL_VALUE, RouteConfigError, chooseTransport } from "./route.ts";
import { inspect } from "node:util";

import { KEY_REMOVED, scrubError, scrubSecrets } from "./secrets.ts";

// Fake keys and a fake security tool only. No test here runs the real security tool, reads a real
// key or reaches the network: the client's fetch is a fake that records the request.

const FAKE_KEY = "LLM_424242_fakeKeyForTestsOnly-not-real";
const LIVE = { SITERRA_MODEL_ROUTE: "model_api", SITERRA_LIVE_APPROVED: LIVE_APPROVAL_VALUE };

afterEach(() => {
  vi.restoreAllMocks();
});

describe("secret scrub", () => {
  it("removes the key and anything shaped like a Model API key", () => {
    const text = `Incorrect API key provided: ${FAKE_KEY}; also LLM_9_other-key`;
    const out = scrubSecrets(text, [FAKE_KEY]);
    expect(out).not.toContain("LLM_");
    expect(out).toBe(`Incorrect API key provided: ${KEY_REMOVED}; also ${KEY_REMOVED}`);
  });
});

describe("error scrub (b63 note)", () => {
  it("removes the key from the message and the stack, even after the stack was read", () => {
    const error = new TypeError(`bad header "Bearer ${FAKE_KEY}"`);
    expect(error.stack).toContain(FAKE_KEY);
    scrubError(error, [FAKE_KEY]);
    expect(error.message).not.toContain(FAKE_KEY);
    expect(String(error.stack)).not.toContain(FAKE_KEY);
    expect(inspect(error)).not.toContain(FAKE_KEY);
  });
});

describe("Keychain reader", () => {
  it("asks the security tool for the item by account and service, and keeps stdout in memory", () => {
    const calls: (readonly string[])[] = [];
    const run: SecurityRunner = (args) => {
      calls.push(args);
      return { status: 0, stdout: `${FAKE_KEY}\n`, stderr: "" };
    };
    expect(readKeychainKey("siterra-meta-model-api", "founder", run)).toBe(FAKE_KEY);
    expect(calls).toEqual([
      ["find-generic-password", "-a", "founder", "-s", "siterra-meta-model-api", "-w"],
    ]);
  });

  it("a missing item names the service and account and never carries a key", () => {
    const run: SecurityRunner = () => ({
      status: 44,
      stdout: "",
      stderr: `security: The specified item could not be found in the keychain. ${FAKE_KEY}`,
    });
    let caught: unknown;
    try {
      readKeychainKey("siterra-meta-model-api", "founder", run);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(KeychainError);
    const message = (caught as Error).message;
    expect(message).toContain("service siterra-meta-model-api and account founder");
    expect(message).not.toContain("LLM_");
  });
});

describe("route key source", () => {
  it("the replay route never reads the key", () => {
    const readKeychain = vi.fn(() => FAKE_KEY);
    expect(() => chooseTransport({ SITERRA_MODEL_ROUTE: "replay" }, { readKeychain })).toThrow(
      /SITERRA_REPLAY_FILE/,
    );
    expect(readKeychain).not.toHaveBeenCalled();
  });

  it("live without MODEL_API_KEY reads the Keychain service, default or configured", () => {
    const readKeychain = vi.fn(() => FAKE_KEY);
    chooseTransport(LIVE, { readKeychain });
    chooseTransport({ ...LIVE, SITERRA_KEYCHAIN_SERVICE: "other-service" }, { readKeychain });
    expect(readKeychain.mock.calls).toEqual([["siterra-meta-model-api"], ["other-service"]]);
  });

  it("refuses an environment key unless the hosted flag SITERRA_KEY_SOURCE=env is set", () => {
    const readKeychain = vi.fn(() => FAKE_KEY);
    for (const env of [
      { ...LIVE, MODEL_API_KEY: FAKE_KEY },
      { ...LIVE, MODEL_API_KEY: FAKE_KEY, SITERRA_KEY_SOURCE: "keychain" },
    ]) {
      let caught: unknown;
      try {
        chooseTransport(env, { readKeychain });
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(RouteConfigError);
      expect(String(caught)).toMatch(/SITERRA_KEY_SOURCE=env/);
      expect(String(caught)).not.toContain(FAKE_KEY);
    }
    expect(readKeychain).not.toHaveBeenCalled();
  });

  it("with SITERRA_KEY_SOURCE=env the key comes from the environment alone, never the Keychain", () => {
    const readKeychain = vi.fn(() => FAKE_KEY);
    const hosted = { ...LIVE, SITERRA_KEY_SOURCE: "env" };
    expect(chooseTransport({ ...hosted, MODEL_API_KEY: FAKE_KEY }, { readKeychain })).toBeDefined();
    expect(readKeychain).not.toHaveBeenCalled();
    for (const env of [hosted, { ...hosted, MODEL_API_KEY: "  " }]) {
      expect(() => chooseTransport(env, { readKeychain })).toThrow(/MODEL_API_KEY/);
    }
    expect(readKeychain).not.toHaveBeenCalled();
  });

  it("refuses a key source it does not know", () => {
    const readKeychain = vi.fn(() => FAKE_KEY);
    expect(() =>
      chooseTransport({ ...LIVE, SITERRA_KEY_SOURCE: "file" }, { readKeychain }),
    ).toThrow(/unknown SITERRA_KEY_SOURCE/);
    expect(readKeychain).not.toHaveBeenCalled();
  });

  it("the replay route ignores the key source and the environment key alike", () => {
    expect(
      chooseTransport({
        SITERRA_MODEL_ROUTE: "replay",
        SITERRA_REPLAY_FILE: fileURLToPath(
          new URL("./fixtures/structured-completed.json", import.meta.url),
        ),
        MODEL_API_KEY: FAKE_KEY,
      }),
    ).toBeDefined();
  });

  it("OPENAI_LOG=debug cannot make the client log a failed request (b63 note)", async () => {
    vi.stubEnv("OPENAI_LOG", "debug");
    const logged: unknown[] = [];
    for (const method of ["log", "error", "warn", "info", "debug"] as const) {
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
        logged.push(args);
      });
    }
    const transport = chooseTransport(LIVE, {
      readKeychain: () => FAKE_KEY,
      fetch: () => Promise.reject(new TypeError(`network down near ${FAKE_KEY}`)),
    });
    await expect(
      transport.open({ model: "muse-spark-1.3", input: [] }, new AbortController().signal),
    ).rejects.toBeDefined();
    expect(logged).toEqual([]);
    vi.unstubAllEnvs();
  });

  it("the key reaches the Authorization header and no environment, log, error or stored event", async () => {
    const authorization: (string | null)[] = [];
    const fakeFetch = (_url: unknown, init?: RequestInit) => {
      authorization.push(new Headers(init?.headers).get("authorization"));
      const body = JSON.stringify({
        error: { message: `Incorrect API key provided: ${FAKE_KEY}`, code: `bad ${FAKE_KEY}` },
      });
      return Promise.resolve(
        new Response(body, { status: 401, headers: { "content-type": "application/json" } }),
      );
    };
    const logged: unknown[] = [];
    for (const method of ["log", "error", "warn", "info", "debug"] as const) {
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
        logged.push(args);
      });
    }
    const transport = chooseTransport(LIVE, {
      readKeychain: () => FAKE_KEY,
      fetch: fakeFetch,
    });

    const store = testStore();
    const events: TraceEventDraft[] = [];
    const { loop, commit } = await runObservationTask(
      { task: queuedTask(), expectedCaseRevision: 3 },
      {
        adapter: new MetaAdapter({ transport, sleep: () => Promise.resolve() }),
        trace: { emit: (e) => events.push(e) },
        store,
        tools: caseToolRegistry(store, CASE_ID),
        newEvidenceId: () => "ev_test_01",
        now: () => AT,
      },
    );

    expect(authorization.length).toBeGreaterThan(0);
    expect(authorization.every((a) => a === `Bearer ${FAKE_KEY}`)).toBe(true);
    expect(loop.status).not.toBe("accepted");
    const elsewhere = JSON.stringify([process.env, logged, events, commit, loop]);
    expect(elsewhere).not.toContain(FAKE_KEY);
    expect(elsewhere).not.toContain("LLM_424242");
  });
});
