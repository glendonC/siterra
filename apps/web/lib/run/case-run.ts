import { Event, type CaseSnapshot } from "@siterra/contracts";
import recordedRunRaw from "./fixtures/recorded-run.json";
import { lengthOf, type RecordedRun } from "./recorded";

const parsedBaseEvents: Event[] = (recordedRunRaw.events as unknown[]).map((e) => Event.parse(e));
const baseSnapshot = recordedRunRaw.snapshot as unknown as CaseSnapshot;

/** Whether a case is the one the recording was made on (its seed, or a visitor's demo copy of it). */
function isRecordedCase(snapshot: CaseSnapshot): boolean {
  return (
    snapshot.case.id === "case_aitbouguemez" ||
    snapshot.case.id === baseSnapshot.case.id ||
    snapshot.case.title.toLowerCase().includes("bouguemez")
  );
}

/**
 * The recorded run a case may show as its thinking, or null. Only the Aït Bouguemez case has one (the RECORDED run of
 * 30 Oct, "Founder instance smoke 1"); every other case, a newly ingested place included, has none, and another
 * place's recording is never mapped onto it. The run keeps its own question and its own events, so its length is the
 * one it ran for. `settled` holds it at its last event, for a run shown already done; otherwise it plays from the
 * start.
 */
export function buildRecordedRunForCase(
  snapshot: CaseSnapshot,
  speed: number,
  settled: boolean,
): RecordedRun | null {
  if (!isRecordedCase(snapshot)) return null;
  const run: RecordedRun = {
    commandId: recordedRunRaw.commandId,
    question: recordedRunRaw.question,
    snapshot: baseSnapshot,
    events: parsedBaseEvents,
    speed,
    at: null,
  };
  return settled ? { ...run, at: lengthOf(run) } : run;
}
