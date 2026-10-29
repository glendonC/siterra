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
