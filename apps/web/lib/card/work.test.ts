import { CaseSnapshot, type Event } from "@siterra/contracts";
import { describe, expect, it } from "vitest";
import seed from "../../../../packages/contracts/fixtures/case-snapshot-aitbouguemez-seed.json";
import { appendEvents, EMPTY_LOG } from "../case/events";
import { countWords, LIMITS } from "../budget/measure";
import { projectObservations } from "../projection/observations";
import { cardLines } from "./content";
import { commandRunning, workCard } from "./work";

const snapshot = CaseSnapshot.parse(seed);
// synthetic events for the shape only
const accepted = {
  sequence: 2,
  kind: "command.accepted",
  commandId: "cmd_a",
  message: "Request received",
} as unknown as Event;
const log = appendEvents(EMPTY_LOG, [accepted]);

describe("workCard", () => {
  const card = workCard(snapshot, log, "cmd_a", projectObservations(snapshot));

  it("asks the case question and says what the request is doing from its events", () => {
    expect(card.question).toBe(snapshot.case.objective);
    expect(card.working).toBe("Request received");
  });

  it("lists the committed Observations with their counts and periods", () => {
    expect(card.section?.lines).toEqual([
      "Catchment rainfall, CHIRPS v3.0 monthly: 84 of 84 months observed, Jan 2019 to Dec 2025",
      "Catchment NDVI, Sentinel-2 monthly: 68 of 84 months observed, Jan 2019 to Dec 2025",
    ]);
  });

  it("stays within the card's 45 words", () => {
    expect(cardLines(card).reduce((n, l) => n + countWords(l), 0)).toBeLessThanOrEqual(
      LIMITS.cardWords,
    );
  });
});

describe("workCard as the command runs and completes", () => {
  const taskRecord = (id: string, status: "running" | "succeeded", question: string) => ({
    ...(snapshot.records.taskRecords[0] ?? {}),
    id,
    commandId: "cmd_b",
    kind: "observation_analysis",
    status,
    question,
    createdAt: `2026-10-27T20:00:0${id.slice(-1)}Z`,
  });
  const withTasks = (status: "running" | "succeeded") =>
    ({
      ...snapshot,
      records: {
        ...snapshot.records,
        taskRecords: [
          taskRecord("task_1", status, "What did catchment NDVI show in spring 2022?"),
          taskRecord("task_2", status, "What did catchment rainfall show in spring 2022?"),
        ],
      },
    }) as unknown as CaseSnapshot;
  const ev = (sequence: number, kind: string) =>
    ({ sequence, kind, commandId: "cmd_b", message: kind }) as unknown as Event;
  const words = (c: ReturnType<typeof workCard>) =>
    cardLines(c).reduce((n, l) => n + countWords(l), 0);

  it("shows the steps while they run, and the Observations once the request completes", () => {
    const running = withTasks("running");
    const runLog = appendEvents(EMPTY_LOG, [ev(2, "command.accepted")]);
    const r = workCard(running, runLog, "cmd_b", projectObservations(running));
    expect(r.steps?.map((s) => s.text)).toEqual([
      "What did catchment NDVI show in spring 2022?",
      "What did catchment rainfall show in spring 2022?",
    ]);
    expect(r.section).toBeUndefined();
    expect(words(r)).toBeLessThanOrEqual(LIMITS.cardWords);

    const done = withTasks("succeeded");
    const doneLog = appendEvents(runLog, [ev(3, "command.completed")]);
    const d = workCard(done, doneLog, "cmd_b", projectObservations(done));
    expect(d.working).toBe("Request complete");
    expect(d.steps).toBeUndefined();
    expect(d.section?.heading).toBe("Observations");
    expect(words(d)).toBeLessThanOrEqual(LIMITS.cardWords);
  });
});

describe("commandRunning", () => {
  it("runs until the command completes", () => {
    expect(commandRunning(snapshot, log, "cmd_a")).toBe(true);
    const done = appendEvents(log, [
      {
        sequence: 3,
        kind: "command.completed",
        commandId: "cmd_a",
        message: "done",
      } as unknown as Event,
    ]);
    expect(commandRunning(snapshot, done, "cmd_a")).toBe(false);
  });
});
