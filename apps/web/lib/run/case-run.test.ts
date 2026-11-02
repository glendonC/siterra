import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { CaseSnapshot } from "@siterra/contracts";
import { describe, expect, it } from "vitest";
import { buildRecordedRunForCase } from "./case-run";
import { runModel } from "./model";
import { lengthOf, revealed } from "./recorded";

// Which thinking a case may show (HUD-3, A4 and A5): only its own run. The Aït Bouguemez case has the RECORDED run of
// 30 Oct with its own question and length; any other case, a live place included, has none.
const raw = JSON.parse(
  readFileSync(join(import.meta.dirname, "fixtures", "recorded-run.json"), "utf8"),
) as { question: string; snapshot: CaseSnapshot };
const aitBouguemez = raw.snapshot;
const elsewhere = (id: string, title: string): CaseSnapshot => ({
  ...aitBouguemez,
  case: { ...aitBouguemez.case, id, title },
});

describe("buildRecordedRunForCase", () => {
  it("gives the Aït Bouguemez case its recording, with the recording's own question", () => {
    const run = buildRecordedRunForCase(aitBouguemez, 3.5, false);
    expect(run?.question).toBe("Why is the valley floor greener?");
    expect(run?.at).toBeNull();
  });

  it("holds a settled recording at its own measured length, not a replay cap", () => {
    const run = buildRecordedRunForCase(aitBouguemez, 3.5, true);
    if (!run) throw new Error("no recording");
    expect(run.at).toBe(101_121);
    expect(run.at).toBe(lengthOf(run));
    const model = runModel(run.snapshot, revealed(run, run.at ?? 0), run.commandId);
    expect(model.done).toBe(true);
    expect(model.nowMs).toBe(101_121);
  });

  it("gives a demo copy of the seed case the same recording", () => {
    expect(
      buildRecordedRunForCase(
        elsewhere(
          "case_01M6EE0GN385Z5AR87EB468ZCN",
          "Grazing and livelihoods in the Aït Bouguemez valley",
        ),
        3.5,
        true,
      ),
    ).not.toBeNull();
  });

  it("gives another seeded place and a live place no run at all", () => {
    expect(
      buildRecordedRunForCase(
        elsewhere("case_calaveras_creek", "Grazing and rangeland in the Calaveras Creek catchment"),
        3.5,
        true,
      ),
    ).toBeNull();
    expect(
      buildRecordedRunForCase(elsewhere("case_loc_queenstown_7e0699", "Queenstown"), 3.5, false),
    ).toBeNull();
  });
});
