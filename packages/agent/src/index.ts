export { MetaAdapter } from "./model/adapter.ts";
export type { AdapterOptions, CallOptions, SpendGuard } from "./model/adapter.ts";
export { MODEL_API_BASE_URL, ModelApiTransport } from "./model/model-api-transport.ts";
export { PRICE_TABLE, estimateCostUsd, priceFor } from "./model/pricing.ts";
export { RecordingTransport, assertNoSecrets } from "./model/recorder.ts";
export { REPLAY_FORMAT, ReplayTransport, loadReplayFile, parseReplayFile } from "./model/replay.ts";
export { DEFAULT_KEYCHAIN_SERVICE, KeychainError, readKeychainKey } from "./model/keychain.ts";
export { scrubSecrets } from "./model/secrets.ts";
export type { ReplayFile, ReplayStep } from "./model/replay.ts";
export { DEFAULT_RETRY } from "./model/retry.ts";
export { assertStrictSubset, strictSubsetIssues } from "./model/strict-schema.ts";
export { DEFAULT_DEADLINES } from "./model/timeouts.ts";
export type { ModelTransport } from "./model/transport.ts";
export type * from "./model/types.ts";
export { DEFAULT_MAX_ROUNDS, runTaskLoop } from "./tasks/loop.ts";
export type { LoopOptions, LoopResult, LoopStatus } from "./tasks/loop.ts";
export { DEFAULT_PLAN_MODEL, TOOLS_BY_KIND, runPlanTask } from "./tasks/plan/plan-task.ts";
export type { PlanTaskDeps, PlanTaskInput, PlanTaskResult } from "./tasks/plan/plan-task.ts";
export { PLAN_PROMPT_VERSION } from "./tasks/plan/prompt.ts";
export type { PlanSnapshot, SnapshotRecord } from "./tasks/plan/prompt.ts";
export {
  PLANNABLE_KINDS,
  PlanProposal,
  planOutputSchema,
  validatePlanProposal,
} from "./tasks/plan/proposal.ts";
export type { CommitDraft, EntityVersion, TaskRecord } from "./tasks/records.ts";
export type { TraceEventDraft, TraceSink } from "./tasks/trace.ts";
export type { ValidationIssue, ValidationResult } from "./tasks/validation.ts";
export { ToolFailure } from "./tools/tool.ts";
export type { ToolHandler, ToolName, ToolOutput } from "./tools/tool.ts";
export { MemoryCommitApi } from "./tasks/commit.ts";
export type { CommitApi, CommitOutcome } from "./tasks/commit.ts";
export {
  EvidenceProposal,
  evidenceOutputSchema,
  validateEvidenceProposal,
} from "./tasks/evidence/proposal.ts";
export type { AcceptedItem, EvidenceContext } from "./tasks/evidence/proposal.ts";
export {
  OBSERVATION_PROMPT_VERSION,
  runObservationTask,
} from "./tasks/observation/observation-task.ts";
export type {
  ObservationTaskDeps,
  ObservationTaskInput,
  ObservationTaskResult,
} from "./tasks/observation/observation-task.ts";
export type {
  ClaimKind,
  DataBundleRecord,
  EventRecordRowRecord,
  EvidenceRecord,
  HypothesisRecord,
  BriefRecord,
  InterventionRecord,
  MeasurementRecord,
  OperationalActionRecord,
  RelationshipRecord,
  ResourceRequirementRecord,
  ReviewDecisionRecord,
} from "./tasks/records.ts";
export {
  readCaseTool,
  readDatasetManifestTool,
  summarizeObservationsTool,
} from "./tools/read-tools.ts";
export { ToolRegistry, caseToolRegistry } from "./tools/registry.ts";
export { MemoryCaseStore } from "./tools/store.ts";
export type { CaseStore, CaseSummary, PeriodQuality } from "./tools/store.ts";
export { TRANSLATION_LABEL, runEvidenceTask } from "./tasks/evidence/evidence-task.ts";
export type {
  EvidenceTaskDeps,
  EvidenceTaskInput,
  EvidenceTaskResult,
  EvidenceTaskSpec,
} from "./tasks/evidence/evidence-task.ts";
export { OBSERVATION_SPEC } from "./tasks/observation/observation-task.ts";
export {
  LIVELIHOOD_PROMPT_VERSION,
  LIVELIHOOD_SPEC,
  SOURCE_PROMPT_VERSION,
  SOURCE_RESEARCH_SPEC,
  runLivelihoodTask,
  runSourceResearchTask,
} from "./tasks/source/source-task.ts";
export { SEARCHES_PER_COMMAND } from "./tools/registry.ts";
export { readSourceTool, searchSourcesTool } from "./tools/source-tools.ts";
export type { SearchBudget } from "./tools/source-tools.ts";
export type {
  RecipeEntry,
  RecipeResult,
  StoredDocument,
  StoredPassage,
  StoredSource,
} from "./tools/store.ts";
export { CommandSpend, P0_LIMITS, Semaphore } from "./coordinator/limits.ts";
export type { CommandLimits } from "./coordinator/limits.ts";
export { EXECUTORS, SPEND_GUARD_STOP, runCommand } from "./coordinator/run-command.ts";
export type {
  CommandOutcome,
  CommandStatus,
  RunCommandDeps,
  RunCommandInput,
  TaskExecutor,
} from "./coordinator/run-command.ts";
export type { CallGate } from "./model/adapter.ts";
export { NumberedEventSink, commandCompletedDraft, dedupeKey } from "./tasks/event-drafts.ts";
export type { EventDraftRecord } from "./tasks/event-drafts.ts";
export {
  LIVE_APPROVAL_VALUE,
  RouteConfigError,
  chooseTransport,
  describeRoute,
} from "./model/route.ts";
export type { RouteDescription, RouteEnv } from "./model/route.ts";
export { P0_JOBS, modelMap } from "./model/model-map.ts";
export type { ModelJob, ModelMapRow } from "./model/model-map.ts";
export {
  compareSeriesTool,
  listRecipesTool,
  previousPeriod,
  readEvidenceTool,
  readRecipeResultTool,
} from "./tools/analysis-tools.ts";
export {
  EVENT_TYPES,
  SEASON_RECIPE,
  compareEventsTool,
  readEventRecordTool,
  seasonFor,
} from "./tools/event-tools.ts";
export { STATUS_LABELS } from "./tasks/hypothesis/proposal.ts";
export {
  HYPOTHESIS_PROMPT_VERSION,
  runHypothesisTask,
} from "./tasks/hypothesis/hypothesis-task.ts";
export {
  INTERVENTION_PROMPT_VERSION,
  runInterventionTask,
} from "./tasks/intervention/intervention-task.ts";
export { BRIEF_PROMPT_VERSION, runBriefPackageTask } from "./tasks/brief/brief-task.ts";
