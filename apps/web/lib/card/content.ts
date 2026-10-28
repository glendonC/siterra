// What the one card says, in reading order (design language 1.3, rule 5): the question in grey, a working
// line while work runs, the two-tone statement (claim in ink, its limit in grey), at most one figure,
// source and period in mono, the Meaning line, then one action. Every text comes from a record or the
// catalog; the card never writes its own words.

export interface CardFigure {
  /** What the number is, for example "Wet season 2022/23". */
  label: string;
  value: string;
  unit: string;
  /** Where the number sits, for example "Lower third of 1991 to 2020". */
  context?: string;
}

export type StepState =
  "queued" | "running" | "needs_input" | "done" | "partial" | "failed" | "cancelled";

/** One numbered line of the work beat. */
export interface CardStep {
  n: number;
  text: string;
  state: StepState;
  taskId: string;
}

export interface CardContent {
  /** The case question, one line, grey. */
  question?: string;
  /** A question the viewer asked that branches from the case question. */
  branch?: string;
  /** Present-tense line while a step runs. */
  working?: string;
  /** Numbered steps of the plan, joined by a thin rule. */
  steps?: CardStep[];
  /** "Simulated answer." until the hypothesis task runs live. */
  status?: string;
  statement?: { claim: string; limit?: string };
  figure?: CardFigure;
  /** Source and period lines, set in mono. */
  sources: string[];
  meaning?: string;
  /** Items stated as missing or open, each with an open ring. */
  open?: string[];
  /** IDs of the records the card binds, so the case record stays authoritative. */
  recordIds: string[];
}

/** The text a reader sees on the card, in order, for counting and for "Read flat". */
export function cardLines(c: CardContent): string[] {
  return [
    c.question,
    c.branch,
    c.working,
    ...(c.steps ?? []).map((s) => `${s.n} ${s.text}`),
    c.status,
    c.statement ? [c.statement.claim, c.statement.limit].filter(Boolean).join(" ") : undefined,
    c.figure
      ? [c.figure.label, `${c.figure.value} ${c.figure.unit}`, c.figure.context]
          .filter(Boolean)
          .join(" ")
      : undefined,
    ...c.sources,
    c.meaning,
    ...(c.open ?? []),
  ].filter((l): l is string => typeof l === "string" && l.length > 0);
}
