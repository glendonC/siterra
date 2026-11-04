import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { CaseSnapshot, Source } from "@siterra/contracts";
import { describe, expect, it } from "vitest";
import { isVerbatimQuoteInSource, verifyLlmReasonerOutput } from "./llm-verifier.ts";

const seed = JSON.parse(
  readFileSync(
    join(
      import.meta.dirname,
      "..",
      "..",
      "..",
      "..",
      "packages",
      "contracts",
      "fixtures",
      "case-snapshot-aitbouguemez-seed.json",
    ),
    "utf8",
  ),
) as CaseSnapshot;
const SCI03 = seed.records.sourceRecords.find((s) => s.id === "src_SCI-03") as Source;

describe("the verbatim excerpt check", () => {
  it("reads a source's notes, never its title", () => {
    expect(isVerbatimQuoteInSource(SCI03.notes[0] ?? "", SCI03)).toBe(true);
    expect(isVerbatimQuoteInSource(SCI03.title, SCI03)).toBe(false);
    expect(isVerbatimQuoteInSource(SCI03.title.slice(0, 40), SCI03)).toBe(false);
  });

  it("verifies no finding whose excerpt is a fragment of its source's title", () => {
    const verified = verifyLlmReasonerOutput(
      {
        hypotheses: [],
        interventions: [],
        causes: [],
        verifiedFindings: [
          {
            statement:
              "Grazing pressure on the upper slopes doubled between 2010 and 2023, removing 45% of palatable cover.",
            sourceId: "src_SCI-03",
            exactQuote: SCI03.title.slice(0, 40),
            interpretation: "Grazing is the main driver of the change.",
          },
        ],
        briefSummary: "Summary kept so the output is not empty.",
      },
      [SCI03],
    );
    expect(verified?.verifiedFindings).toEqual([]);
  });
});
