import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// run-reingest.ts runs under plain node (type stripping, no bundler), and it loads ingest.ts and everything
// ingest.ts imports. Vitest resolves extensionless imports that node refuses, so this loads both modules in a
// node child process: any value import without its .ts extension anywhere in the chain fails here. Nothing is
// fetched (fetch throws), no database is named and no model key is reachable.
const REPO_ROOT = fileURLToPath(new URL("../../../../", import.meta.url));

const LOAD = `
globalThis.fetch = () => { throw new Error("network use while loading"); };
await import("./apps/web/lib/live-place/ingest.ts");
await import("./apps/web/lib/live-place/run-reingest.ts");
console.log("loaded");
`;

describe("plain node load", () => {
  it("loads ingest.ts and run-reingest.ts the way the re-ingest script runs", () => {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      SITERRA_KEYCHAIN_SERVICE: "siterra-verify-no-such-item",
    };
    delete env["MODEL_API_KEY"];
    delete env["SITERRA_META_API_KEY"];
    delete env["DATABASE_URL"];
    const run = spawnSync(process.execPath, ["--input-type=module", "-e", LOAD], {
      cwd: REPO_ROOT,
      env,
      encoding: "utf8",
      timeout: 60_000,
    });
    const firstError = run.stderr.split("\n").find((line) => /Error/.test(line));
    expect({ status: run.status, firstError }).toEqual({ status: 0, firstError: undefined });
    expect(run.stdout.trim()).toBe("loaded");
  });
});
