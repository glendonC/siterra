// Loads one case revision from the API and checks it against the shared contract, so every view renders
// records, not fixtures. A visitor who names no case gets a demo session on an isolated copy of the seed
// case (POST /api/demo-sessions) before any case request, so a first visit never asks for a case it may
// not read. The session cookie is HttpOnly, so the page remembers its demo copy and when it expires.

import { CaseSnapshot } from "@siterra/contracts";

export type CaseLoad =
  // resumed: openCase read a case this visitor already had, not a demo copy it has just started
  | { status: "ready"; snapshot: CaseSnapshot; resumed?: boolean }
  | { status: "unauthenticated" }
  | { status: "not_found" }
  | { status: "invalid"; issues: string[] }
  | { status: "failed"; httpStatus: number };

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

export async function loadSnapshot(caseId: string, fetchImpl: Fetch): Promise<CaseLoad> {
  const res = await fetchImpl(`/api/cases/${encodeURIComponent(caseId)}`, {
    credentials: "same-origin",
    headers: { accept: "application/json" },
  });
  if (res.status === 401) return { status: "unauthenticated" };
  if (res.status === 404) return { status: "not_found" };
  if (!res.ok) return { status: "failed", httpStatus: res.status };
  const parsed = CaseSnapshot.safeParse(await res.json());
  if (!parsed.success)
    return {
      status: "invalid",
      issues: parsed.error.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`),
    };
  return { status: "ready", snapshot: parsed.data };
}

interface DemoCopy {
  caseId: string;
  expiresAt: string;
  /** The seed case it is a copy of, when the visitor named one (U25: a second place opens its own copy). */
  seedCaseId?: string;
}

const DEMO_KEY = "siterra.demoCase";

/**
 * Starts a demo session, on a copy of the named seed case or of the default one, and returns its case, or undefined
 * if none could start (a name that is not a seed case is refused).
 */
export async function startDemoSession(
  fetchImpl: Fetch,
  seedCaseId?: string,
): Promise<DemoCopy | undefined> {
  const res = await fetchImpl("/api/demo-sessions", {
    method: "POST",
    credentials: "same-origin",
    ...(seedCaseId === undefined
      ? {}
      : { headers: { "content-type": "application/json" }, body: JSON.stringify({ seedCaseId }) }),
  });
  if (res.status !== 201) return undefined;
  const body = (await res.json()) as { caseId?: unknown; expiresAt?: unknown };
  return typeof body.caseId === "string" && typeof body.expiresAt === "string"
    ? { caseId: body.caseId, expiresAt: body.expiresAt, ...(seedCaseId ? { seedCaseId } : {}) }
    : undefined;
}

function readDemo(storage: Storage | undefined, now: number): DemoCopy | undefined {
  try {
    const d = JSON.parse(storage?.getItem(DEMO_KEY) ?? "null") as Partial<DemoCopy> | null;
    return typeof d?.caseId === "string" &&
      typeof d.expiresAt === "string" &&
      Date.parse(d.expiresAt) > now
      ? {
          caseId: d.caseId,
          expiresAt: d.expiresAt,
          ...(typeof d.seedCaseId === "string" ? { seedCaseId: d.seedCaseId } : {}),
        }
      : undefined;
  } catch {
    return undefined;
  }
}

function writeDemo(storage: Storage | undefined, d: DemoCopy): void {
  try {
    storage?.setItem(DEMO_KEY, JSON.stringify(d));
  } catch {
    // the copy holds for this page only
  }
}

async function openDemo(
  fetchImpl: Fetch,
  storage: Storage | undefined,
  fallback: CaseLoad,
  seedCaseId?: string,
): Promise<CaseLoad> {
  const demo = await startDemoSession(fetchImpl, seedCaseId);
  if (!demo) return fallback;
  writeDemo(storage, demo);
  const load = await loadSnapshot(demo.caseId, fetchImpl);
  return load.status === "ready" ? { ...load, resumed: false } : load;
}

/**
 * The case to open. A named case (?case=) is read directly, with a demo copy when there is no session.
 * Otherwise the visitor's own unexpired demo copy, or a new one started before any case request.
 * A case read without starting a new copy is resumed: the visitor has been here.
 */
export async function openCase(
  caseId: string | undefined,
  fetchImpl: Fetch,
  storage: Storage | undefined,
  now: number,
): Promise<CaseLoad> {
  const unauthenticated: CaseLoad = { status: "unauthenticated" };
  const stored = readDemo(storage, now);
  // a seed case named in the address opens this visitor's own copy of it, while that copy lasts
  const copy = caseId !== undefined && stored?.seedCaseId === caseId ? stored.caseId : undefined;
  const named = copy ?? caseId ?? stored?.caseId;
  if (named === undefined) return openDemo(fetchImpl, storage, unauthenticated);
  const first = await loadSnapshot(named, fetchImpl);
  if (first.status === "ready") return { ...first, resumed: true };
  if (first.status !== "unauthenticated" && first.status !== "not_found") return first;
  // a named seed case gets its own copy, whether the visitor has no session (401) or a session on another copy
  // (404); a named case that is no seed case stays not found, and without a session gets the default copy
  if (caseId !== undefined) {
    const own = await openDemo(fetchImpl, storage, first, caseId);
    if (own.status === "ready") return own;
    if (first.status === "not_found") return first;
  }
  return openDemo(fetchImpl, storage, first);
}
