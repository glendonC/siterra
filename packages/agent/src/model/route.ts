import { DEFAULT_KEYCHAIN_SERVICE } from "./keychain.ts";
import { MODEL_API_HOST, ModelApiTransport, isModelApiUrl } from "./model-api-transport.ts";
import type { ModelApiTransportOptions } from "./model-api-transport.ts";
import { ReplayTransport, loadReplayFile } from "./replay.ts";
import type { ModelTransport } from "./transport.ts";
import type { ModelRoute, ReplayOrigin } from "./types.ts";

// Which transport the worker uses. Replay is the default. The live route needs three things at
// once: SITERRA_MODEL_ROUTE=model_api, SITERRA_LIVE_APPROVED=gate01-passed (set only after the lead
// records GATE-01 and a spend cap) and the key. The key is read from the macOS login Keychain into
// memory (founder decision, 2026-10-28) unless a hosted deployment sets SITERRA_KEY_SOURCE=env, and
// only then is it read from MODEL_API_KEY. An environment key without that flag is refused, so a
// stray MODEL_API_KEY on a laptop never becomes the key; and with the flag the Keychain is never
// read. The key never goes into process.env here, a log, a file or a stored event. Asking for live
// without them is an error, never a quiet fall back to replay, and no message here ever contains
// the key. The key only goes to https://api.meta.ai: any other SITERRA_MODEL_BASE_URL is refused.
// The replay route never reads the key.

export const LIVE_APPROVAL_VALUE = "gate01-passed";

export interface RouteEnv {
  SITERRA_MODEL_ROUTE?: string | undefined;
  SITERRA_LIVE_APPROVED?: string | undefined;
  SITERRA_REPLAY_FILE?: string | undefined;
  SITERRA_MODEL_BASE_URL?: string | undefined;
  MODEL_API_KEY?: string | undefined;
  /** "keychain" (the default) or "env": the hosted flag that lets MODEL_API_KEY be the key. */
  SITERRA_KEY_SOURCE?: string | undefined;
  SITERRA_KEYCHAIN_SERVICE?: string | undefined;
}

/**
 * The Keychain reader and the client's fetch. There is no default reader: only the worker passes
 * the real one (readKeychainKey), so no test or other caller can reach the Keychain by accident.
 */
export interface RouteDeps {
  readKeychain?: (service: string) => string;
  fetch?: ModelApiTransportOptions["fetch"];
}

export class RouteConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RouteConfigError";
  }
}

export interface RouteDescription {
  route: ModelRoute;
  replayOrigin: ReplayOrigin | null;
  /** What every screen and the model map show for this route. */
  label: string;
}

export function describeRoute(transport: ModelTransport): RouteDescription {
  if (transport.route === "replay") {
    const origin = transport.replayOrigin ?? "synthetic";
    return {
      route: "replay",
      replayOrigin: origin,
      label: `Replay (${origin}), not a live model call`,
    };
  }
  return { route: "model_api", replayOrigin: null, label: "Live, Meta Model API" };
}

export function chooseTransport(env: RouteEnv, deps: RouteDeps = {}): ModelTransport {
  const route = env.SITERRA_MODEL_ROUTE ?? "replay";
  if (route === "replay") {
    if (!env.SITERRA_REPLAY_FILE) {
      throw new RouteConfigError(
        "replay route needs SITERRA_REPLAY_FILE (a siterra-model-replay@1 file)",
      );
    }
    return new ReplayTransport(loadReplayFile(env.SITERRA_REPLAY_FILE));
  }
  if (route !== "model_api") {
    throw new RouteConfigError(
      `unknown SITERRA_MODEL_ROUTE ${JSON.stringify(route)}; use replay or model_api`,
    );
  }
  if (env.SITERRA_LIVE_APPROVED !== LIVE_APPROVAL_VALUE) {
    throw new RouteConfigError(
      "live route is not approved: GATE-01 has not been recorded as passed",
    );
  }
  const baseURL = env.SITERRA_MODEL_BASE_URL;
  if (baseURL !== undefined && baseURL !== "" && !isModelApiUrl(baseURL)) {
    throw new RouteConfigError(`SITERRA_MODEL_BASE_URL must be an https URL on ${MODEL_API_HOST}`);
  }
  const keySource = env.SITERRA_KEY_SOURCE ?? "keychain";
  if (keySource !== "keychain" && keySource !== "env") {
    throw new RouteConfigError(
      `unknown SITERRA_KEY_SOURCE ${JSON.stringify(keySource)}; use keychain or env`,
    );
  }
  let key: string;
  if (keySource === "env") {
    key = env.MODEL_API_KEY ?? "";
    if (key.trim() === "") {
      throw new RouteConfigError("SITERRA_KEY_SOURCE=env needs MODEL_API_KEY in the environment");
    }
  } else {
    if ((env.MODEL_API_KEY ?? "").trim() !== "") {
      throw new RouteConfigError(
        "MODEL_API_KEY in the environment is refused: set SITERRA_KEY_SOURCE=env on a hosted deployment, or remove it to use the Keychain",
      );
    }
    if (!deps.readKeychain) {
      throw new RouteConfigError(
        "live route needs the worker's Keychain reader (or SITERRA_KEY_SOURCE=env with MODEL_API_KEY on a host)",
      );
    }
    key = deps.readKeychain(env.SITERRA_KEYCHAIN_SERVICE || DEFAULT_KEYCHAIN_SERVICE);
  }
  return new ModelApiTransport({
    apiKey: key,
    liveApproved: true,
    ...(baseURL ? { baseURL } : {}),
    ...(deps.fetch ? { fetch: deps.fetch } : {}),
  });
}
