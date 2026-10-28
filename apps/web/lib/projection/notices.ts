// The data credits for "Sources and notices", taken from the case record: every DataBundle's attribution,
// split into its credits and listed once, in the order the bundles first name them. The text is the
// record's own wording (citations are not rewritten).

import type { CaseSnapshot } from "@siterra/contracts";

export function dataCredits(s: CaseSnapshot): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const b of s.records.dataBundleRecords) {
    // credits are separated by "; ", but a notice may carry its own "; all rights reserved": a part that
    // starts in lower case continues the credit before it
    const credits: string[] = [];
    for (const part of (b.attribution ?? "").split(/;\s+/)) {
      const text = part.trim().replace(/\.$/, "");
      const prev = credits.length - 1;
      if (/^[a-z]/.test(text) && prev >= 0) credits[prev] = `${credits[prev] ?? ""}; ${text}`;
      else if (text) credits.push(text);
    }
    for (const c of credits)
      if (!seen.has(c)) {
        seen.add(c);
        out.push(c);
      }
  }
  return out;
}
