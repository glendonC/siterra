import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { ModelApiTransport } from "./model-api-transport.ts";
import { P0_JOBS, modelMap } from "./model-map.ts";
import { LIVE_APPROVAL_VALUE, RouteConfigError, chooseTransport, describeRoute } from "./route.ts";

const REPLAY = fileURLToPath(new URL("./fixtures/structured-completed.json", import.meta.url));
// Shaped like a key so the tests can check that no message repeats it; it is not a credential.
const FAKE_KEY = ["LLM", "000000", "not-a-real-key"].join("_");

describe("route selection", () => {
  it("defaults to replay and labels it as not live", () => {
    const transport = chooseTransport({ SITERRA_REPLAY_FILE: REPLAY });
    expect(describeRoute(transport)).toEqual({
      route: "replay",
      replayOrigin: "synthetic",
      label: "Replay (synthetic), not a live model call",
    });
  });

  it("refuses live without the GATE-01 approval, without falling back to replay", () => {
    const attempt = () =>
      chooseTransport({
        SITERRA_MODEL_ROUTE: "model_api",
        MODEL_API_KEY: FAKE_KEY,
        SITERRA_REPLAY_FILE: REPLAY,
      });
    expect(attempt).toThrow(RouteConfigError);
    expect(attempt).toThrow(/not approved/);
  });

  it("refuses live without a key and never echoes a key", () => {
    expect(() =>
      chooseTransport({
        SITERRA_MODEL_ROUTE: "model_api",
        SITERRA_LIVE_APPROVED: LIVE_APPROVAL_VALUE,
      }),
    ).toThrow(/MODEL_API_KEY/);
    try {
      chooseTransport({ SITERRA_MODEL_ROUTE: "model_api", MODEL_API_KEY: FAKE_KEY });
    } catch (error) {
      expect(String(error)).not.toContain(FAKE_KEY);
    }
  });

  it("sends the key only to the Meta Model API host", () => {
    const live = (url: string) => () =>
      chooseTransport({
        SITERRA_MODEL_ROUTE: "model_api",
        SITERRA_LIVE_APPROVED: LIVE_APPROVAL_VALUE,
        SITERRA_KEY_SOURCE: "env",
        MODEL_API_KEY: FAKE_KEY,
        SITERRA_MODEL_BASE_URL: url,
      });
    for (const url of [
      "https://evil.example/v1",
      "http://api.meta.ai/v1",
      "https://api.meta.ai.evil.example/v1",
      "https://user:pass@api.meta.ai/v1",
      "https://api.meta.ai:8443/v1",
      "not a url",
    ]) {
      expect(live(url)).toThrow(RouteConfigError);
      try {
        live(url)();
      } catch (error) {
        expect(String(error)).not.toContain(FAKE_KEY);
      }
    }
    expect(describeRoute(live("https://api.meta.ai/v1")())).toMatchObject({ route: "model_api" });
    expect(
      () =>
        new ModelApiTransport({
          apiKey: FAKE_KEY,
          liveApproved: true,
          baseURL: "https://evil.example/v1",
        }),
    ).toThrow(/only sent/);
  });

  it("rejects an unknown route and a replay route with no file", () => {
    expect(() => chooseTransport({ SITERRA_MODEL_ROUTE: "fallback" })).toThrow(/unknown/);
    expect(() => chooseTransport({})).toThrow(/SITERRA_REPLAY_FILE/);
  });
});

describe("model map (TR-05 path)", () => {
  it("is generated from the configured route and labels replay on every row", () => {
    const rows = modelMap(chooseTransport({ SITERRA_REPLAY_FILE: REPLAY }));
    expect(rows).toHaveLength(P0_JOBS.length);
    expect(rows.every((r) => r.route === "Replay (synthetic), not a live model call")).toBe(true);
    expect(rows.every((r) => r.model === "muse-spark-1.3")).toBe(true);
  });
});
