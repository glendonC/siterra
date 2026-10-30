// The report of one evaluation run: a JSON document and a Markdown summary. Every figure is a
// count the suites returned; the header says what the run used, so a reader can see what it was.
import type { ExtractionResult, NumericResult, ProvenanceResult } from "./suites.ts";

export type EvalHeader = {
  /** The model the run called, or null for the offline suites, which call none. */
  model: string | null;
  promptVersion: string | null;
  route: "offline" | "replay" | "model_api";
  corpusManifestSha256: string;
  goldCorpusManifestSha256: string;
  numericGoldCatalogSha256: string;
  catalogSha256: string;
  corpusTextDir: string | null;
  date: string;
};

export type EvalReport = {
  header: EvalHeader;
  extraction: ExtractionResult;
  numeric: NumericResult;
  provenance: ProvenanceResult;
  /** The bars of docs/reference/evaluation.md that this run can state, and whether each held. */
  bars: { name: string; held: boolean; detail: string }[];
};

const pct = (n: number, d: number): string => (d === 0 ? "n/a" : `${((100 * n) / d).toFixed(1)}%`);

export function bars(
  header: EvalHeader,
  extraction: ExtractionResult,
  numeric: NumericResult,
  provenance: ProvenanceResult,
): EvalReport["bars"] {
  return [
    {
      name: "Numeric provenance: a changed number is refused",
      held:
        provenance.values > 0 &&
        provenance.changedValueRefused === provenance.values &&
        provenance.trueValueAccepted === provenance.values,
      detail: `${provenance.changedValueRefused} of ${provenance.values} changed values refused, ${provenance.trueValueAccepted} of ${provenance.values} true values accepted, ${provenance.skipped} gold values skipped as not available`,
    },
    {
      name: "Numeric gold: every value equals the case's Measurement",
      held: numeric.items > 0 && numeric.matched === numeric.items,
      detail: `${numeric.matched} of ${numeric.items} items match value, unit, status and collection hash`,
    },
    {
      name: "Extraction: every gold excerpt hashes as recorded",
      held: extraction.excerptHashMismatch === 0 && extraction.excerptHashOk > 0,
      detail: `${extraction.excerptHashOk} ok, ${extraction.excerptHashMismatch} mismatched; ${extraction.items - extraction.notCheckable} of ${extraction.items} items were also compared with stored source text, ${extraction.notCheckable} were not`,
    },
    {
      name: "Extraction: every checkable gold excerpt is found at its cited page",
      held:
        extraction.located > 0 &&
        extraction.notLocated === 0 &&
        extraction.locatedOnOtherPage === 0 &&
        extraction.textChanged === 0,
      detail: `${extraction.located} of ${extraction.items - extraction.notCheckable} checkable items located, ${extraction.notLocated} not found, ${extraction.locatedOnOtherPage} on another page, ${extraction.textChanged} with changed page text; ${extraction.notCheckable} of ${extraction.items} not checkable (no stored text)`,
    },
    {
      name: "Gold sets were written against the corpus and catalog in use",
      held:
        header.goldCorpusManifestSha256 === header.corpusManifestSha256 &&
        header.numericGoldCatalogSha256 === header.catalogSha256,
      detail: `corpus manifest ${header.goldCorpusManifestSha256 === header.corpusManifestSha256 ? "same" : "differs"}, catalog ${header.numericGoldCatalogSha256 === header.catalogSha256 ? "same" : "differs"}`,
    },
  ];
}

export function markdown(report: EvalReport): string {
  const { header, extraction: e, numeric: n, provenance: p } = report;
  const lines = [
    `# Evaluation run, ${header.date}`,
    "",
    `Route ${header.route}${header.model ? `, model ${header.model}` : ", no model called"}. Corpus manifest ${header.corpusManifestSha256.slice(0, 12)}, catalog ${header.catalogSha256.slice(0, 12)}. Stored source text: ${header.corpusTextDir ?? "not found"}.`,
    "",
    "## Bars",
    "",
    ...report.bars.map((b) => `- ${b.held ? "Held" : "NOT held"}: ${b.name} (${b.detail})`),
    "",
    "## Extraction fidelity",
    "",
    `${e.items} items, ${e.signed} signed and ${e.unsigned} unsigned model drafts: the gold set is scored as drafts until a person signs it. ${e.published} excerpts published, ${e.withheld} withheld.`,
    "",
    `- Excerpt hash as recorded: ${e.excerptHashOk} ok, ${e.excerptHashMismatch} mismatched.`,
    `- Source text stored here: ${e.items - e.textUnavailable} of ${e.items} items (${e.textChanged} changed since the gold was written, ${e.textWithoutRecordedHash} with no recorded text hash to compare). Without stored text: ${e.sourcesWithoutText.join(", ") || "none"}.`,
    `- Located: ${e.located} found on the cited page or at their offsets (${pct(e.located, e.items - e.notCheckable)} of the ${e.items - e.notCheckable} checkable), ${e.notLocated} not found, ${e.locatedOnOtherPage} found on another page, ${e.notCheckable} not checkable.`,
    "",
    "## Numeric gold",
    "",
    `${n.items} items: ${n.matched} match. Missing ${n.missing.length}, value ${n.valueMismatch.length}, unit ${n.unitMismatch.length}, status ${n.statusMismatch.length}, collection hash ${n.collectionHashMismatch.length}.`,
    "",
    "## Numeric provenance validator",
    "",
    `${p.values} values: ${p.trueValueAccepted} true values accepted, ${p.changedValueRefused} changed values refused; ${p.skipped} gold values skipped as not available.`,
    "",
  ];
  return lines.join("\n");
}
