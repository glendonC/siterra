// Which answer the overview's home shows, carried in its address: a plain /valley shows the case's own answer, and
// /valley?run=<command id> the answer of the run the analysis steps handed over to. A view opened from the answer keeps
// the address's query (goTo), so coming back, a reload or the browser's Back land on the same answer.

/** The run the address names, or null for the case's own answer. */
export function runOfSearch(search: string): string | null {
  const id = new URLSearchParams(search).get("run")?.trim();
  return id ? id : null;
}

/** The address's query naming the run (or naming none for null), with every other parameter kept as it was. */
export function searchWithRun(search: string, run: string | null): string {
  const p = new URLSearchParams(search);
  if (run) p.set("run", run);
  else p.delete("run");
  const s = p.toString();
  return s ? `?${s}` : "";
}

/**
 * The address to put in place of this one when the answer changes, or null when it already names it. When steps hand
 * over to their run's answer, the answer's own address is /valley with the place (?case=) and the run, wherever the
 * overview stands: the journey's page (/) hosts it too, and its own parameters (start, dive, mode, q, theme) would
 * replay the journey or the steps on a reload. Otherwise only the run is named, or dropped, where the address is.
 */
export function answerAddress(
  pathname: string,
  search: string,
  run: string | null,
  handedOver: boolean,
): string | null {
  const now = pathname + search;
  if (run !== null && handedOver && !pathname.startsWith("/instruments/")) {
    const q = new URLSearchParams();
    const place = new URLSearchParams(search).get("case");
    if (place) q.set("case", place);
    q.set("run", run);
    const next = `/valley?${q.toString()}`;
    return next === now ? null : next;
  }
  const next = pathname + searchWithRun(search, run);
  return next === now ? null : next;
}
