import { ProposeInstruments, toModelJsonSchema } from "@siterra/contracts";
import { captionBannedWords, prohibitedHitsIn } from "@siterra/domain";
import { unprovenNumbers } from "@siterra/domain/validators";
import type { YearSpan } from "@siterra/domain/validators";

import type { JsonSchema } from "../../model/types.ts";
import type { EvidenceRecord, InstrumentSpecRecord, MeasurementRecord } from "../records.ts";
import { issue, jsonPath } from "../validation.ts";
import type { Checked, ValidationIssue } from "../validation.ts";

// propose_instruments (contracts 1.15.0, INST-05 to INST-07): the model orders the instruments the
// composer returned, by spec ID, and may rewrite the two caption sentences of each. It names no
// kind, parameter, record or number to add. Host code refuses an ID the composer did not return,
// a list that drops or repeats one, a sentence that is not one sentence within its limit, one that
// makes a prohibited claim or uses a banned word, and any number that no cited record, no cited
// excerpt and no sentence the composer wrote accounts for.

export const INK_MAX = 200;
export const GREY_MAX = 240;

export function instrumentOutputSchema(): JsonSchema {
  return toModelJsonSchema(ProposeInstruments);
}

export interface InstrumentContext {
  /** The composer's specs by ID: the registry the model may order. */
  specs: ReadonlyMap<string, InstrumentSpecRecord>;
  measurements: ReadonlyMap<string, MeasurementRecord>;
  evidence: ReadonlyMap<string, EvidenceRecord>;
  years: YearSpan | null;
}

export interface AcceptedInstruments {
  order: string[];
  /** Only the specs whose sentences the model changed. */
  rewrites: Map<string, { ink: string; grey: string }>;
}

/** Everything a sentence may state: the cited Measurements' parts and the cited Evidence's own words. */
function allowedFor(spec: InstrumentSpecRecord, context: InstrumentContext) {
  const values: number[] = [];
  const excerpts: string[] = [spec.caption.ink, spec.caption.grey];
  for (const id of spec.caption.citationIds) {
    const m = context.measurements.get(id);
    if (m) {
      values.push(
        ...[
          m.value,
          m.uncertainty.lower,
          m.uncertainty.upper,
          m.uncertainty.level,
          m.spatialResolutionM,
        ].flatMap((v) => (v === null ? [] : [v])),
      );
    }
    const e = context.evidence.get(id);
    if (e) {
      excerpts.push(
        e.statement,
        ...e.provenance.sourceLocators.flatMap((l) => (l.excerpt ? [l.excerpt] : [])),
      );
    }
  }
  return { values, excerpts };
}

const SENTENCE_END = /[.!?](?=\s+\S)/;

export function validateInstrumentProposal(
  outputText: string,
  context: InstrumentContext,
): Checked<AcceptedInstruments> {
  let raw: unknown;
  try {
    raw = JSON.parse(outputText) as unknown;
  } catch {
    return { ok: false, issues: [issue("schema", "$", "Output is not JSON.")] };
  }
  const parsed = ProposeInstruments.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((i) => issue("schema", jsonPath(i.path), i.message)),
    };
  }
  const { order, captions } = parsed.data;
  const issues: ValidationIssue[] = [];
  const add = (code: Parameters<typeof issue>[0], path: string, message: string): void => {
    issues.push(issue(code, path, message));
  };

  // INST-07 and the registry: only IDs the composer returned, each exactly once.
  const seen = new Set<string>();
  order.forEach((id, i) => {
    if (!context.specs.has(id)) {
      add(
        "unknown_reference",
        `$.order[${i}]`,
        `${id} is not an instrument the composer returned.`,
      );
    } else if (seen.has(id)) {
      add("schema", `$.order[${i}]`, `${id} is listed twice.`);
    }
    seen.add(id);
  });
  for (const id of context.specs.keys()) {
    if (!order.includes(id)) add("catalog_mismatch", "$.order", `${id} is missing from the order.`);
  }

  const rewrites = new Map<string, { ink: string; grey: string }>();
  const captioned = new Set<string>();
  captions.forEach((caption, i) => {
    const path = `$.captions[${i}]`;
    const spec = context.specs.get(caption.specId);
    if (!spec) {
      add(
        "unknown_reference",
        `${path}.specId`,
        `${caption.specId} is not an instrument the composer returned.`,
      );
      return;
    }
    if (captioned.has(spec.id)) {
      add("schema", `${path}.specId`, `${spec.id} has two captions.`);
      return;
    }
    captioned.add(spec.id);
    const { values, excerpts } = allowedFor(spec, context);
    for (const [field, max] of [
      ["ink", INK_MAX],
      ["grey", GREY_MAX],
    ] as const) {
      const text = caption[field].trim();
      const at = `${path}.${field}`;
      if (text === "") {
        add("schema", at, "The sentence is empty.");
        continue;
      }
      if (Array.from(text).length > max) add("limit", at, `At most ${String(max)} characters.`);
      if (SENTENCE_END.test(text)) add("limit", at, "One sentence only.");
      for (const hit of prohibitedHitsIn(text)) {
        add("prohibited_claim", at, `"${hit}" is a prohibited claim.`);
      }
      const banned = captionBannedWords.exec(text);
      if (banned) add("prohibited_claim", at, `"${banned[0]}" is a word the case does not use.`);
      const unproven = unprovenNumbers(text, values, excerpts, context.years);
      if (unproven.length > 0) {
        add(
          "numeric_provenance",
          at,
          `${unproven.join(", ")} appear in no record this instrument cites.`,
        );
      }
    }
    if (caption.ink.trim() !== spec.caption.ink || caption.grey.trim() !== spec.caption.grey) {
      rewrites.set(spec.id, { ink: caption.ink.trim(), grey: caption.grey.trim() });
    }
  });
  for (const id of context.specs.keys()) {
    if (!captioned.has(id)) add("catalog_mismatch", "$.captions", `${id} has no caption.`);
  }

  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, value: { order, rewrites }, issues };
}
