// One HTTP byte range (RFC 9110, section 14): "bytes=a-b", "bytes=a-" or "bytes=-n". Several ranges
// in one header, and an invalid one such as "bytes=5-3", are answered with the whole file, as the RFC
// allows.

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
  // A last position before the first makes the range invalid, not unsatisfiable: the header is
  // ignored and the whole file is sent (RFC 9110, sections 14.1.1 and 14.2).
  if (last !== "" && Number(last) < start) return null;
  if (start >= size) return "unsatisfiable";
  return { start, end: last === "" ? size - 1 : Math.min(Number(last), size - 1) };
}
