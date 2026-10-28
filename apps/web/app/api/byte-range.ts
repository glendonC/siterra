// One HTTP byte range (RFC 9110, section 14): "bytes=a-b", "bytes=a-" or "bytes=-n". Several ranges
// in one header are answered with the whole file, as the RFC allows.

export type ByteRange = { start: number; end: number };

/** The range to send, null for the whole file, or "unsatisfiable" (416). */
export function parseByteRange(
  header: string | null,
  size: number,
): ByteRange | null | "unsatisfiable" {
  if (header === null) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (match === null) return null;
  const [, first = "", last = ""] = match;
  if (first === "" && last === "") return null;
  if (first === "") {
    const length = Number(last);
    if (length === 0) return "unsatisfiable";
    return { start: Math.max(0, size - length), end: size - 1 };
  }
  const start = Number(first);
  const end = last === "" ? size - 1 : Math.min(Number(last), size - 1);
  if (start >= size || end < start) return "unsatisfiable";
  return { start, end };
}
