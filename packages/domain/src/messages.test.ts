import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { eventMessages } from "./messages.ts";

const microcopy = readFileSync(
  new URL("../../../docs/reference/microcopy.md", import.meta.url),
  "utf8",
);

describe("VC-06 (event part): event texts use the approved microcopy", () => {
  it.each([
    ["scientific", "approved"],
    ["scientific", "deferred"],
    ["community_livelihood", "deferred"],
    ["program_coordination", "approved"],
  ] as const)("review.recorded for %s %s is an approved row", (role, status) => {
    expect(microcopy).toContain(`| ${eventMessages.reviewRecorded(role, status)} |`);
  });

  it("command.accepted is the approved director status", () => {
    expect(microcopy).toContain(`| ${eventMessages.commandAccepted()} |`);
  });
});
