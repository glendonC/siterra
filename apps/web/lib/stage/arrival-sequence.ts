// When each part of the arrival lands (seconds from the start of arrival) and how long it takes, as in the
// approved valley reel (DESIGN B valley.js T: pool 0, name 0.8, outlet 1.4, villages 2.2, study 3.0,
// command line 3.3, instruments 3.6). Under reduced motion everything cross-fades in 150 ms at once.

export type ArrivalPart =
  | "pool"
  | "name"
  | "outlet"
  | "villages"
  | "villageNames"
  | "study"
  | "command"
  | "keys"
  | "instruments";

const SEQUENCE: Record<ArrivalPart, { at: number; dur: number }> = {
  pool: { at: 0, dur: 0.8 },
  name: { at: 0.8, dur: 0.6 },
  outlet: { at: 1.4, dur: 0.4 },
  villages: { at: 2.2, dur: 0.4 },
  villageNames: { at: 2.6, dur: 0.6 },
  study: { at: 3.0, dur: 0.6 },
  command: { at: 3.3, dur: 0.3 },
  keys: { at: 3.3, dur: 0.4 },
  instruments: { at: 3.6, dur: 0.4 },
};

/** Seconds from the start of arrival until every part has landed. */
export function arrivalSettledAfter(reduced: boolean): number {
  if (reduced) return 0.15;
  return Math.max(...Object.values(SEQUENCE).map((s) => s.at + s.dur));
}

/** CSS animation timing for a part: delay and duration in ms. */
export function arrivalTiming(
  part: ArrivalPart,
  reduced: boolean,
): { delayMs: number; durationMs: number } {
  if (reduced) return { delayMs: 0, durationMs: 150 };
  const s = SEQUENCE[part];
  return { delayMs: Math.round(s.at * 1000), durationMs: Math.round(s.dur * 1000) };
}
