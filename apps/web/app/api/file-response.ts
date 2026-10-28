import { readFileSync } from "node:fs";
import { parseByteRange } from "./byte-range.ts";

/**
 * A verified file as an HTTP answer: 200 with the whole file, 206 for one byte range, 416 for a range
 * beyond the file. The caller passes the headers every answer carries (type, ETag, caching).
 */
export function fileResponse(
  request: Request,
  file: { absolutePath: string; size: number },
  headers: Record<string, string>,
): Response {
  const common = { ...headers, "X-Content-Type-Options": "nosniff", "Accept-Ranges": "bytes" };
  const range = parseByteRange(request.headers.get("range"), file.size);
  if (range === "unsatisfiable") {
    return new Response(null, {
      status: 416,
      headers: { ...common, "Content-Range": `bytes */${file.size}` },
    });
  }
  const bytes = readFileSync(file.absolutePath);
  if (range === null) {
    return new Response(new Uint8Array(bytes), {
      status: 200,
      headers: { ...common, "Content-Length": String(bytes.length) },
    });
  }
  const part = bytes.subarray(range.start, range.end + 1);
  return new Response(new Uint8Array(part), {
    status: 206,
    headers: {
      ...common,
      "Content-Length": String(part.length),
      "Content-Range": `bytes ${range.start}-${range.end}/${file.size}`,
    },
  });
}
