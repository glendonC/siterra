import type { BranchMerge } from "@siterra/contracts";

// The field plan as a minimum test cover (DF-09): from a catalog of field measurements and the
// explanation pairs each one separates, the smallest set that separates every pair the record
// leaves open. The search is exact; the catalog's `separates` lists are configured judgments, and
// nothing here reads a measurement's wording.

/** The exact search refuses more candidate measurements than this (2^20 subsets at most). */
export const MAX_COVER_CANDIDATES = 20;
const MAX_OPEN_PAIRS = 30;

type BranchStatus = BranchMerge["branches"][number]["status"];
export type PairIds = readonly [string, string];
type Pair = [string, string];

export interface CoverMeasurement {
  id: string;
  label: string;
  separates: readonly PairIds[];
}

export interface CoverChoice {
  id: string;
  label: string;
  /** The open pairs this measurement separates. */
  separates: Pair[];
  /** The open pairs no other chosen measurement separates; never empty in a minimum cover. */
  onlySeparates: Pair[];
}

export interface TestCover {
  measurements: CoverChoice[];
  /** Open pairs no measurement in the catalog separates. */
  unseparated: Pair[];
}

const canon = ([a, b]: PairIds): Pair => (a < b ? [a, b] : [b, a]);
const keyOf = (p: PairIds): string => canon(p).join("|");
const words = ([a, b]: PairIds) => `${a} and ${b}`;

function canonicalPairs(pairs: readonly PairIds[]): Pair[] {
  const byKey = new Map(pairs.map((p) => [keyOf(p), canon(p)]));
  return [...byKey.keys()].sort().map((k) => byKey.get(k) as Pair);
}

/**
 * Pairs of explanations the record leaves open for field verification: every pair of branches not
 * contradicted when two or more stand, or the single standing branch paired with each contradicted
 * branch when only one stands (since satellite records alone never confirm the remaining branch).
 */
export function openPairs(
  branches: readonly { explanationId: string; status: BranchStatus }[],
): Pair[] {
  const standing = branches.filter((b) => b.status !== "contradicted").map((b) => b.explanationId);
  if (standing.length === 0) return [];
  if (standing.length === 1) {
    const only = standing[0] as string;
    const pairs: Pair[] = [];
    for (const b of branches) {
      if (b.explanationId !== only) pairs.push([only, b.explanationId]);
    }
    return canonicalPairs(pairs);
  }
  const pairs: Pair[] = [];
  for (const [i, a] of standing.entries()) {
    for (const b of standing.slice(i + 1)) pairs.push([a, b]);
  }
  return canonicalPairs(pairs);
}

function firstCover(masks: readonly number[], target: number): number[] {
  for (let size = 1; size <= masks.length; size += 1) {
    const found = search(masks, target, size, 0, 0, []);
    if (found) return found;
  }
  return [];
}

function search(
  masks: readonly number[],
  target: number,
  size: number,
  start: number,
  covered: number,
  chosen: number[],
): number[] | null {
  if (chosen.length === size) return covered === target ? chosen : null;
  for (let i = start; i <= masks.length - (size - chosen.length); i += 1) {
    const found = search(masks, target, size, i + 1, covered | (masks[i] ?? 0), [...chosen, i]);
    if (found) return found;
  }
  return null;
}

/**
 * The smallest set of catalog measurements separating every open pair a catalog measurement can
 * separate. Ties go to the set earliest in catalog order. Each chosen measurement names its pairs.
 */
export function minimumTestCover(
  catalog: readonly CoverMeasurement[],
  open: readonly PairIds[],
): TestCover {
  const pairs = canonicalPairs(open);
  if (pairs.length > MAX_OPEN_PAIRS) {
    throw new Error(`The field plan search takes at most ${String(MAX_OPEN_PAIRS)} open pairs.`);
  }
  const bit = new Map(pairs.map((p, i) => [keyOf(p), 1 << i]));
  const maskOf = (c: CoverMeasurement) =>
    c.separates.reduce((mask, p) => mask | (bit.get(keyOf(p)) ?? 0), 0);
  const candidates = catalog.filter((c) => maskOf(c) !== 0);
  if (candidates.length > MAX_COVER_CANDIDATES) {
    throw new Error(
      `The field plan search takes at most ${String(MAX_COVER_CANDIDATES)} candidate measurements; ${String(candidates.length)} separate an open pair.`,
    );
  }
  const masks = candidates.map(maskOf);
  const coverable = masks.reduce((all, mask) => all | mask, 0);
  const chosen = coverable === 0 ? [] : firstCover(masks, coverable);
  const pairsIn = (mask: number) => pairs.filter((p) => (mask & (bit.get(keyOf(p)) ?? 0)) !== 0);
  return {
    measurements: chosen.map((i) => {
      const others = chosen.filter((j) => j !== i).reduce((all, j) => all | (masks[j] ?? 0), 0);
      const c = candidates[i] as CoverMeasurement;
      const mask = masks[i] ?? 0;
      return {
        id: c.id,
        label: c.label,
        separates: pairsIn(mask),
        onlySeparates: pairsIn(mask & ~others),
      };
    }),
    unseparated: pairs.filter((p) => (coverable & (bit.get(keyOf(p)) ?? 0)) === 0),
  };
}

/**
 * The DF-09 check, recomputed from the catalog: every claimed pair is the catalog's, every
 * separable open pair is separated, removing any one measurement leaves a named pair unseparated,
 * and no smaller cover exists. Returns one sentence per issue; empty when the cover holds.
 */
export function coverIssues(
  cover: TestCover,
  catalog: readonly CoverMeasurement[],
  open: readonly PairIds[],
): string[] {
  const pairs = canonicalPairs(open);
  const openKeys = new Set(pairs.map(keyOf));
  const catalogKeys = new Map(
    catalog.map((c) => [c.id, new Set(c.separates.map(keyOf).filter((k) => openKeys.has(k)))]),
  );
  const issues: string[] = [];
  const real: { id: string; keys: ReadonlySet<string> }[] = [];
  for (const choice of cover.measurements) {
    const keys = catalogKeys.get(choice.id);
    if (!keys) {
      issues.push(`${choice.id} is not in the catalog.`);
      continue;
    }
    for (const p of choice.separates) {
      if (!keys.has(keyOf(p)))
        issues.push(`${choice.id} does not separate ${words(p)} in the catalog.`);
    }
    real.push({ id: choice.id, keys });
  }
  const separable = new Set([...catalogKeys.values()].flatMap((keys) => [...keys]));
  const union = (items: readonly { keys: ReadonlySet<string> }[]) =>
    new Set(items.flatMap((r) => [...r.keys]));
  const covered = union(real);
  const listed = new Set(cover.unseparated.map(keyOf));
  for (const p of pairs) {
    const k = keyOf(p);
    if (separable.has(k) && !covered.has(k)) {
      issues.push(`No chosen measurement separates ${words(p)}.`);
    } else if (!separable.has(k) && !listed.has(k)) {
      issues.push(`${words(p)} is open but not listed as unseparated.`);
    }
  }
  for (const p of cover.unseparated) {
    if (separable.has(keyOf(p)))
      issues.push(`The catalog separates ${words(p)}, so it is not unseparated.`);
  }
  const othersOf = (id: string) => union(real.filter((r) => r.id !== id));
  for (const r of real) {
    const others = othersOf(r.id);
    if ([...covered].every((k) => others.has(k))) {
      issues.push(`Removing ${r.id} leaves every open pair separated.`);
    }
  }
  for (const choice of cover.measurements) {
    if (choice.onlySeparates.length === 0) {
      issues.push(`${choice.id} names no pair only it separates.`);
      continue;
    }
    const others = othersOf(choice.id);
    for (const p of choice.onlySeparates) {
      if (others.has(keyOf(p))) {
        issues.push(`${choice.id} is not the only measurement that separates ${words(p)}.`);
      }
    }
  }
  const best = minimumTestCover(catalog, pairs);
  if (best.measurements.length < cover.measurements.length) {
    issues.push(`A smaller cover exists: ${best.measurements.map((c) => c.id).join(", ")}.`);
  }
  return issues;
}
