import { CaseAnalysisConfig } from "@siterra/contracts";

import aitBouguemez from "./case_aitbouguemez.json" with { type: "json" };

// Case analysis configurations, one JSON file per place, each parsed against the contract when the
// module loads so a malformed configuration fails at start, not in the middle of a command. A new
// place is a new file and one line below.

export const caseAnalysisConfigs: readonly CaseAnalysisConfig[] = [aitBouguemez].map((c) =>
  CaseAnalysisConfig.parse(c),
);

const byCase = new Map(caseAnalysisConfigs.map((c) => [c.caseId, c]));

/** The configuration of a case, or null when the case has none (its analyses are then blocked). */
export function analysisConfigFor(caseId: string): CaseAnalysisConfig | null {
  return byCase.get(caseId) ?? null;
}
