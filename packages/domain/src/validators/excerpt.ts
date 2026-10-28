// Excerpt verification (TR-04): an excerpt must be found verbatim in the stored text of its cited
// page. Both sides are normalized the way docs/reference/evaluation.md#extraction-gold-set states,
// so the runtime and the harness agree: Unicode NFC, each run of White_Space characters collapsed
// to one space, the ends trimmed. Nothing else is folded: no case, hyphen or quote changes.

export const EXCERPT_MAX_CODE_POINTS = 300;

const WHITE_SPACE_RUN = /\p{White_Space}+/gu;

export function normalizeExcerptText(text: string): string {
  return text.normalize("NFC").replace(WHITE_SPACE_RUN, " ").trim();
}

export function codePointLength(text: string): number {
  return Array.from(text).length;
}

export type ExcerptCheck = { ok: true } | { ok: false; reason: "empty" | "too_long" | "not_found" };

export function checkExcerpt(excerpt: string, storedText: string): ExcerptCheck {
  const needle = normalizeExcerptText(excerpt);
  if (needle === "") return { ok: false, reason: "empty" };
  if (codePointLength(excerpt) > EXCERPT_MAX_CODE_POINTS) return { ok: false, reason: "too_long" };
  return normalizeExcerptText(storedText).includes(needle)
    ? { ok: true }
    : { ok: false, reason: "not_found" };
}

/**
 * Locators name the stored document and the place in it, the way the gold set does
 * (docs/reference/evaluation.md#extraction-gold-set): "<file>, page N" for a PDF (N is the 1-based
 * page of the file, not the printed label), "<file>, section <heading>" for any other file, and
 * "<file>, full text" for a file with no located headings.
 */
export type Locator =
  | { document: string; page: number }
  | { document: string; section: string }
  | { document: string; fullText: true };

export function formatLocator(locator: Locator): string {
  if ("page" in locator) return `${locator.document}, page ${locator.page}`;
  if ("section" in locator) return `${locator.document}, section ${locator.section}`;
  return `${locator.document}, full text`;
}

export function parseLocator(text: string): Locator | null {
  const value = text.trim();
  const page = /^(.+), page (\d+)$/.exec(value);
  if (page?.[1] && page[2]) {
    const n = Number(page[2]);
    return n >= 1 ? { document: page[1], page: n } : null;
  }
  const section = /^(.+?), section (.+)$/.exec(value);
  if (section?.[1] && section[2]) return { document: section[1], section: section[2] };
  const full = /^(.+), full text$/.exec(value);
  if (full?.[1]) return { document: full[1], fullText: true };
  return null;
}
