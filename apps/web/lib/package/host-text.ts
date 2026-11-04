// The fixed sentences host code writes into a package's records, never model text: copies of the brief task's
// PACKAGE_TEXT (packages/agent/src/tasks/brief/brief-task.ts) and of replayLimitation
// (packages/agent/src/tasks/trace.ts), which the web app does not import, and the synthetic package's own note
// (fixtures/synthetic.ts writes it from here). The brief shows each in its catalog words (package.ts, plainLine).

export const HOST_TEXT = {
  briefDraft: "Draft prepared by Siterra; nothing is sent, scheduled or authorized.",
  noAuthority:
    "Local authority and representation are not established; nothing is sent, scheduled or authorized.",
  synthetic:
    "Synthetic fixture for the interface: written by hand in the brief task's record shapes, not a model output and not a plan anyone made.",
  replaySynthetic: "Written from a synthetic replay, not a model output or a live model call.",
  replayRecorded: "Written from a recorded replay of an earlier model call, not a live model call.",
} as const;
