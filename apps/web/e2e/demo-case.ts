import type { APIRequestContext } from "@playwright/test";
import { readFileSync } from "node:fs";
import { CASE_FILE } from "./global-setup";

/** The run's shared demo copy (global-setup.ts), for tests that only read the arrival. */
export function sharedCase(): string {
  return (JSON.parse(readFileSync(CASE_FILE, "utf8")) as { caseId: string }).caseId;
}

/** A fresh demo copy of the seed case, for a test that changes the case (it commissions). */
export async function demoCase(
  request: APIRequestContext,
  baseURL: string | undefined,
): Promise<string> {
  const res = await request.post("/api/demo-sessions", { headers: { origin: baseURL ?? "" } });
  if (res.status() !== 201)
    throw new Error(`demo session: ${String(res.status())} ${await res.text()}`);
  return ((await res.json()) as { caseId: string }).caseId;
}
