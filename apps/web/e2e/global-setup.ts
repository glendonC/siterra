import { request, type FullConfig } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

// One demo copy of the seed case for the tests that only read the arrival (demo sessions are rate
// limited per minute): its session cookie becomes the tests' storage state, its case ID a small file.
export const STATE_DIR = join(import.meta.dirname, "..", "..", "..", ".local", "playwright");
export const STORAGE = join(STATE_DIR, "demo-storage.json");
export const CASE_FILE = join(STATE_DIR, "demo-case.json");

export default async function globalSetup(config: FullConfig): Promise<void> {
  const baseURL = config.projects[0]?.use.baseURL ?? "http://127.0.0.1:4370";
  const ctx = await request.newContext({ baseURL });
  const res = await ctx.post("/api/demo-sessions", { headers: { origin: baseURL } });
  if (res.status() !== 201)
    throw new Error(`demo session: ${String(res.status())} ${await res.text()}`);
  const { caseId } = (await res.json()) as { caseId: string };
  await ctx.storageState({ path: STORAGE });
  writeFileSync(CASE_FILE, JSON.stringify({ caseId }));
  await ctx.dispose();
}
