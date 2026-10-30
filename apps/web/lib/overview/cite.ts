// How a citation names its authors: one surname, two joined by "and", or the first with "et al." for three or more.
// A source may record "et al." as an author entry ("Aakairi, M.", "et al."): that stands for further authors, not a
// second name, so it reads as "Aakairi et al.".

import { format } from "../copy/en";

const ET_AL = /^et\.?\s*al\.?$/i;

/** The author part of a short citation; empty when the source names no author. */
export function citedAuthors(authors: readonly string[]): string {
  const surname = (a: string | undefined) =>
    a === undefined ? "" : a.split(",", 1).join("").trim();
  const named = authors.filter((a) => !ET_AL.test(a.trim()));
  const more = named.length < authors.length;
  if (named.length > 2 || (more && named.length > 0))
    return format("overview.cite.etAl", { name: surname(named[0]) });
  if (named.length === 2)
    return format("overview.cite.two", { a: surname(named[0]), b: surname(named[1]) });
  return surname(named[0]);
}
