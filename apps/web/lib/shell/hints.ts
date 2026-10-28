// The hint rule: a key hint shows only when its key does something. The primary (↵) hint starts the
// investigation at arrival; while a request runs ↵ has no job and Esc stops it, so Enter cannot stop a
// request by accident. Once the request completes neither shows until the next beat gives a key a job.

import type { MessageId } from "../copy/en";

export function primaryHint(s: { commissioned: boolean; running: boolean }): MessageId | undefined {
  return s.commissioned || s.running ? undefined : "arrival.start";
}

export function stopHint(s: { running: boolean }): MessageId | undefined {
  return s.running ? "work.stop" : undefined;
}
