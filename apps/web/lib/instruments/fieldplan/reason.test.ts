import { describe, expect, it } from "vitest";
import { plainReason } from "./reason";

// The recorded merge's reasons, and the other forms branches.ts writes, said without codes.

describe("plainReason", () => {
  it("says the recorded merge's two reasons plainly, keeping the numbers", () => {
    expect(plainReason("Necessary prediction p2 is not met on adequate data.")).toBe(
      "A prediction it needs failed on adequate data.",
    );
    expect(
      plainReason(
        "Necessary prediction p1 is not met over 1 period; merge@2 needs 3 periods to contradict.",
      ),
    ).toBe("Not enough data yet: 1 period of data, 3 are needed to rule it out.");
    expect(
      plainReason(
        "Necessary prediction p1 is not met over 2 periods; merge@2 needs 3 periods to contradict.",
      ),
    ).toBe("Not enough data yet: 2 periods of data, 3 are needed to rule it out.");
  });

  it("never shows a prediction id or rule name, and shows nothing for a form it does not know", () => {
    for (const r of [
      "Necessary prediction p2 is not met on adequate data.",
      "Necessary prediction p1 is not met over 1 period; merge@2 needs 3 periods to contradict.",
      "No predictions were recorded.",
      "No prediction is testable with the record.",
      "Every testable prediction is met (2 of 3 testable).",
    ])
      expect(plainReason(r) ?? "").not.toMatch(/\bp\d\b|merge@/);
    expect(
      plainReason("Optional prediction p3 is not met; 1 of 2 necessary predictions are met."),
    ).toBeNull();
  });
});
