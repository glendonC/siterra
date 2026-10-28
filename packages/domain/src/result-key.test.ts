import { describe, expect, it } from "vitest";
import { taskResultKey } from "./result-key.ts";

describe("AF-03 (key part): the task result key", () => {
  const base = {
    caseId: "case_example_key",
    commandId: "cmd_example_key",
    taskKind: "observation_analysis",
    question: "Synthetic question",
    inputVersions: [
      { entityId: "geo_example_b", revision: 1 },
      { entityId: "bundle_example_a", revision: 2 },
    ],
  };

  it("does not depend on the order of the inputs", () => {
    expect(taskResultKey(base)).toBe(
      taskResultKey({ ...base, inputVersions: [...base.inputVersions].reverse() }),
    );
    expect(taskResultKey(base)).toMatch(
      /^case_example_key:cmd_example_key:observation_analysis:[0-9a-f]{64}$/,
    );
  });

  it("changes when an input revision or the question changes", () => {
    const changed = {
      ...base,
      inputVersions: [
        { entityId: "geo_example_b", revision: 2 },
        { entityId: "bundle_example_a", revision: 2 },
      ],
    };
    expect(taskResultKey(changed)).not.toBe(taskResultKey(base));
    expect(taskResultKey({ ...base, question: "Another question" })).not.toBe(taskResultKey(base));
  });
});
