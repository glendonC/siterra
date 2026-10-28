// The hint rule: a key hint shows only when its key does something. The primary (↵) hint starts the
// investigation at arrival and stops it while it runs; once the request completes it hides until the next
// beat gives ↵ a job.

import type { MessageId } from "../copy/en";

export function primaryHint(s: { commissioned: boolean; running: boolean }): MessageId | undefined {
  if (!s.commissioned) return "arrival.start";
  return s.running ? "work.stop" : undefined;
}
