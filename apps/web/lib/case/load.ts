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
}

const DEMO_KEY = "siterra.demoCase";

/** Starts a demo session and returns its case, or undefined if none could start. */
export async function startDemoSession(fetchImpl: Fetch): Promise<DemoCopy | undefined> {
  const res = await fetchImpl("/api/demo-sessions", { method: "POST", credentials: "same-origin" });
  if (res.status !== 201) return undefined;
  const body = (await res.json()) as { caseId?: unknown; expiresAt?: unknown };
  return typeof body.caseId === "string" && typeof body.expiresAt === "string"
    ? { caseId: body.caseId, expiresAt: body.expiresAt }
    : undefined;
}

function readDemo(storage: Storage | undefined, now: number): DemoCopy | undefined {
  try {
    const d = JSON.parse(storage?.getItem(DEMO_KEY) ?? "null") as Partial<DemoCopy> | null;
    return typeof d?.caseId === "string" &&
      typeof d.expiresAt === "string" &&
      Date.parse(d.expiresAt) > now
      ? { caseId: d.caseId, expiresAt: d.expiresAt }
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
): Promise<CaseLoad> {
  const demo = await startDemoSession(fetchImpl);
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
  const named = caseId ?? readDemo(storage, now)?.caseId;
  if (named === undefined) return openDemo(fetchImpl, storage, unauthenticated);
  const first = await loadSnapshot(named, fetchImpl);
  if (first.status === "ready") return { ...first, resumed: true };
  if (first.status !== "unauthenticated" && !(caseId === undefined && first.status === "not_found"))
    return first;
  return openDemo(fetchImpl, storage, first);
}
