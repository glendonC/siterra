// An instrument's caption as its spec carries it (InstrumentCaption: one ink sentence, one grey sentence). The
// specimens set a caption that opens with its figure in the large type and the rest of the ink sentence beside it;
// a caption that opens with words is set as one sentence.

const LEADING_FIGURE = /^([+−-]?\d[\d,]*(?:\.\d+)?%?)\s+(\S.*)$/u;

/** The ink sentence's opening figure, if it opens with one, and the words after it. */
export function splitFigure(ink: string): { figure: string | null; rest: string } {
  const m = LEADING_FIGURE.exec(ink);
  return m?.[1] !== undefined && m[2] !== undefined
    ? { figure: m[1], rest: m[2] }
    : { figure: null, rest: ink };
}

const NBSP = String.fromCharCode(0xa0);
/** A figure and the unit after it ("421 mm", "0.0015 NDVI", "2,317 m"), and the term "R squared". */
const TOGETHER = /(\d)\s+(mm|m|km|NDVI|per cent)\b|\b(R)\s+(squared)\b/gu;

/**
 * The text as set on screen: each figure kept on one line with its unit, and "R squared" kept whole, by
 * non-breaking spaces. Presentation only; the record's text is not changed.
 */
export function keepTogether(text: string): string {
  return text.replace(TOGETHER, (_, d?: string, unit?: string, r?: string, sq?: string) =>
    d !== undefined && unit !== undefined ? `${d}${NBSP}${unit}` : `${r ?? ""}${NBSP}${sq ?? ""}`,
  );
}
