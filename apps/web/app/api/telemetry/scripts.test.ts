import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// No usage data leaves the machine: every script that runs the Next.js CLI turns its telemetry off.
const pkg = JSON.parse(readFileSync(new URL("../../../package.json", import.meta.url), "utf8")) as {
  scripts: Record<string, string>;
};

describe("telemetry is off in every Next.js script", () => {
  const nextScripts = Object.entries(pkg.scripts).filter(([, command]) => /\bnext\b/.test(command));

  it("finds the dev, build, start and start:deploy scripts", () => {
    expect(nextScripts.map(([name]) => name).sort()).toEqual([
      "build",
      "dev",
      "start",
      "start:deploy",
    ]);
  });

  it.each(nextScripts)("%s sets NEXT_TELEMETRY_DISABLED=1 and DO_NOT_TRACK=1", (_, command) => {
    expect(command).toMatch(/^NEXT_TELEMETRY_DISABLED=1 DO_NOT_TRACK=1 next /);
  });
});
