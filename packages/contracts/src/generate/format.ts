import { format, resolveConfig } from "prettier";

/** Formats generated source with the repository's Prettier settings, to a fixed point. */
export async function formatCaseSource(source: string): Promise<string> {
  const filepath = new URL("../case.ts", import.meta.url).pathname;
  const options = { ...(await resolveConfig(filepath)), filepath };
  let current = source;
  for (let pass = 0; pass < 3; pass += 1) {
    const next = await format(current, options);
    if (next === current) return next;
    current = next;
  }
  return current;
}
