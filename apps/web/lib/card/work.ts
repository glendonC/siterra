// The work beat's card from the records: the question, what the request is doing now (the latest
// milestone of the command, or its planned steps), and the Observations the case has committed. Steps
// show while the request runs; once it completes, the Observations take their place, so the card stays
// within its 45 words.

import type { CaseSnapshot } from "@siterra/contracts";
import type { EventLog } from "../case/events";
import { en, format } from "../copy/en";
import type { ObservationLine } from "../projection/observations";
import { projectWork } from "../projection/work";
import type { CardContent } from "./content";

export function workCard(
  s: CaseSnapshot,
  log: EventLog,
  commandId: string,
  observations: ObservationLine[],
): CardContent {
  const work = projectWork(commandId, s.records.taskRecords, log.events);
  const latest = [...log.events].reverse().find((e) => e.commandId === commandId);
  const complete = !commandRunning(s, log, commandId);
  const showSteps = work.steps.length > 0 && !complete;
  return {
    question: s.case.objective,
    working: complete
      ? en["work.complete"].text
      : showSteps
        ? format("work.planning", { n: work.steps.length })
        : (latest?.message ?? en["work.received"].text),
    ...(showSteps ? { steps: work.steps } : {}),
    ...(!showSteps && observations.length > 0
      ? {
          section: {
            heading: en["work.observations"].text,
            lines: observations.map((o) =>
              format("work.observationLine", {
                label: o.label,
                available: o.available,
                total: o.total,
                first: o.first,
                last: o.last,
              }),
            ),
          },
        }
      : {}),
    sources: [],
    recordIds: [commandId, ...observations.map((o) => o.bundleId)],
  };
}

/** True while the command still has work queued or running. */
export function commandRunning(s: CaseSnapshot, log: EventLog, commandId: string): boolean {
  const done = log.events.some(
    (e) =>
      e.commandId === commandId && (e.kind === "command.completed" || e.kind === "task.cancelled"),
  );
  if (done) return false;
  const tasks = s.records.taskRecords.filter((t) => t.commandId === commandId);
  return tasks.length === 0 || tasks.some((t) => t.status === "queued" || t.status === "running");
}
