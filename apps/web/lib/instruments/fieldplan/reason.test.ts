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
    expect(plainReason("Prediction p1 is met but in a form nobody wrote.")).toBeNull();
  });

  it("says the recorded Demo 2 reason for Grazing and Land use plainly", () => {
    // as the 'Demo end-to-end 2' merge recorded them (ui_lane-demo2-20261030-0129.sql)
    expect(
      plainReason("Prediction p1 is not met but not necessary, so the rules set no other status."),
    ).toBe("A prediction it does not need was not met.");
    expect(
      plainReason("Prediction p2 is not met but not necessary, so the rules set no other status."),
    ).toBe("A prediction it does not need was not met.");
    expect(
      plainReason(
        "Prediction p1, p3 is not met but not necessary, so the rules set no other status.",
      ),
    ).toBe("2 predictions it does not need were not met.");
  });

  it("says an unmet optional prediction plainly, keeping the counts", () => {
    // the forms packages/domain branches.ts writes for a consistent branch with an optional prediction not met
    expect(
      plainReason("Optional prediction p3 is not met; 1 of 1 necessary predictions is met."),
    ).toBe("The prediction it needs was met; one it does not need was not.");
    expect(
      plainReason("Optional prediction p3 is not met; 2 of 2 necessary predictions are met."),
    ).toBe("2 of 2 predictions it needs were met; one it does not need was not.");
    expect(
      plainReason("Optional prediction p2, p4 are not met; 2 of 2 necessary predictions are met."),
    ).toBe("2 of 2 predictions it needs were met; 2 it does not need were not.");
  });

  it("keeps the new reasons short enough for a column's two lines", () => {
    for (const r of [
      "Prediction p1, p3 is not met but not necessary, so the rules set no other status.",
      "Optional prediction p2, p4 are not met; 2 of 2 necessary predictions are met.",
      "Optional prediction p3 is not met; 1 of 1 necessary predictions is met.",
    ])
      expect((plainReason(r) ?? "").length).toBeLessThanOrEqual(70);
  });

  it("shows no prediction id in the new forms", () => {
    for (const r of [
      "Prediction p1, p3 is not met but not necessary, so the rules set no other status.",
      "Optional prediction p2, p4 are not met; 2 of 2 necessary predictions are met.",
    ])
      expect(plainReason(r) ?? "").not.toMatch(/\bp\d\b|merge@/);
  });
});
