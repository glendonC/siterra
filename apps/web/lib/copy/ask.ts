// The words of a question asked from the Ask while its steps are the screen: the key that asks it again with its words
// kept, and the one sentence that says why it was not answered, from the server's refusal or the failure code its task
// ends with (lib/overview/ask-line.ts). A sibling of en.ts with the same Message shape and the same lint (ask.test.ts
// runs it). The quota refusals keep en.ts's own words (work.quotaUsed, work.instanceLimit).

import type { Message } from "./en";

export const ak = {
  // the key bar on a question that was not answered: the Ask opens again with the question in it
  "ask.key.again": { text: "Ask Again", kind: "button" },

  // why a question was not answered, one sentence each; Ask Again and Back are in the key bar
  "ask.stopped.notAvailable": {
    text: "Could not answer: the model is not available here.",
    kind: "ui",
  },
  "ask.stopped.unreachable": {
    text: "Could not answer: the model could not be reached.",
    kind: "ui",
  },
  "ask.stopped.slow": { text: "Could not answer: the model took too long to reply.", kind: "ui" },
  "ask.stopped.busy": { text: "Could not answer: the model is busy.", kind: "ui" },
  "ask.stopped.down": {
    text: "Could not answer: the model service returned an error.",
    kind: "ui",
  },
  "ask.stopped.declined": {
    text: "Could not answer: the model declined the question.",
    kind: "ui",
  },
  "ask.stopped.unmatched": {
    text: "Could not answer: the reply did not match the sources it cited.",
    kind: "ui",
  },
  "ask.stopped.changed": {
    text: "Could not answer: a source changed while it was being read.",
    kind: "ui",
  },
  "ask.stopped.steps": {
    text: "Could not answer: the analysis reached its step limit.",
    kind: "ui",
  },
  "ask.stopped.scope": {
    text: "Could not answer: questions here are about land, water and vegetation and how land is used, not about who people are.",
    kind: "ui",
  },
  "ask.stopped.stopped": { text: "Could not answer: the question was stopped.", kind: "ui" },
  "ask.stopped.other": {
    text: "Could not answer: no step of the analysis finished.",
    kind: "ui",
  },
  // refused before any step: the question never reached the analysis
  "ask.stopped.notSent": {
    text: "Could not answer: the question did not reach the server.",
    kind: "ui",
  },
  "ask.stopped.visitEnded": {
    text: "Could not answer: this visit has ended, so reload the page to start a new one.",
    kind: "ui",
  },
} as const satisfies Record<string, Message>;

export type AskMessageId = keyof typeof ak;
