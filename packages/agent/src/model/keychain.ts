import { spawnSync } from "node:child_process";
import { userInfo } from "node:os";

import { scrubSecrets } from "./secrets.ts";

// The Model API key on a Mac: read from the login Keychain at worker start, on the live route only
// (founder decision, 2026-10-28). The security tool writes the password to its stdout, which is
// captured into memory here and nowhere else: never into process.env, a log, a file, a stored
// event or a command line. The item is the one the founder's store script writes: service
// SITERRA_KEYCHAIN_SERVICE (default below), account the Mac user name.

export const DEFAULT_KEYCHAIN_SERVICE = "siterra-meta-model-api";
export const SECURITY_TOOL = "/usr/bin/security";

export interface SecurityResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

/** Runs the security tool with these arguments, no shell, output captured. Tests pass a fake. */
export type SecurityRunner = (args: readonly string[]) => SecurityResult;

const runSecurity: SecurityRunner = (args) => {
  const result = spawnSync(SECURITY_TOOL, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
};

export class KeychainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KeychainError";
  }
}

/**
 * The key stored for `service` under `account`. A missing item or any failure gives an error that
 * names the service and account and carries the tool's stderr with key-shaped text removed, never
 * the key.
 */
export function readKeychainKey(
  service: string,
  account: string = userInfo().username,
  run: SecurityRunner = runSecurity,
): string {
  const result = run(["find-generic-password", "-a", account, "-s", service, "-w"]);
  const key = result.stdout.replace(/\r?\n$/, "");
  if (result.status !== 0 || key.trim() === "") {
    const detail = scrubSecrets(result.stderr.trim(), [key]);
    throw new KeychainError(
      `no Model API key in the login Keychain for service ${service} and account ${account}` +
        (detail === "" ? "" : `: ${detail}`),
    );
  }
  return key;
}
