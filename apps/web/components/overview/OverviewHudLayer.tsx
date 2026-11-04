"use client";

import { type CaseSnapshot, type InstrumentListing } from "@siterra/contracts";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";
import { chosenCount } from "../../lib/ask/task";
import { ak } from "../../lib/copy/ask";
import { en, format } from "../../lib/copy/en";
import { rd } from "../../lib/copy/readout";
import type { CellPaint } from "../../lib/instruments/pixel/paint";
import { instrumentOf } from "../../lib/instruments/listing";
import { bandLimitsOf } from "../../lib/land/record";
import {
  actionsFor,
  VIEW_HREF,
  VIEW_LABEL,
  type Action,
  type Thing,
  type ViewKind,
} from "../../lib/overview/actions";
import {
  captionOf,
  findingsFrom,
  outlineLabelOf,
  type Finding,
  type FindingId,
} from "../../lib/overview/findings";
import { checkSeasonOf } from "../../lib/overview/check-season";
import { answerLayer, runVerdicts, type ExplanationVerdict } from "../../lib/overview/layers";
import { shortCitation } from "../../lib/overview/results";
import { EXAG, sideOf, type LiftId, type Selection } from "../../lib/overview/scene/overview";
import { fallbackRecordData } from "../../lib/overview/terrain";
import type { OverviewData } from "../../lib/overview/data";
import type { RecordData } from "../../lib/overview/record-data";
import type { packageView } from "../../lib/package/package";
import { proofSheet } from "../../lib/readout/proof";
import { readoutOf, type GroundCheck } from "../../lib/readout/readout";
import type { RunModel } from "../../lib/run/model";
import { lengthOf, type RecordedRun } from "../../lib/run/recorded";
import { Breadcrumb, KeyLegend, type KeyEntry, type SourceSet } from "../controls/ScreenChrome";
import { LifeLayer, type LifeMount } from "../life/LifeLayer";
import { SourcesOverlay } from "../controls/SourcesOverlay";
import { ThemeIcon } from "../opening/Opening";
import { TimeView, type TimeMount } from "../time/TimeView";
import { ActionList } from "./ActionList";
import { Ask } from "./Ask";
import { AtWork } from "./AtWork";
import type { StepTask } from "./AtWorkCursors";
import { crumbOf, onLandOf } from "./FindingMark";
import { LayerStack } from "./LayerStack";
import { OverviewRecord } from "./OverviewRecord";
import { OverviewRoutes } from "./OverviewRoutes";
import { Readout } from "./Readout";
import readoutStyles from "./Readout.module.css";
import { useLayerStack } from "./useLayerStack";
import type { useOverviewAsk } from "./useOverviewAsk";
import { goTo } from "./useOverviewControls";
import type { RunArcState, Stands } from "./useOverviewLayoutApply";
import type { AnswerOf, useOverviewDomRefs } from "./useOverviewRunState";
import type { useOverviewSceneData } from "./useOverviewSceneData";
import { OverviewInPlaceInstrument, type TearState } from "./useOverviewTearInPlace";
import styles from "./ValleyOverview.module.css";

export interface OverviewHudLayerProps {
  snapshot: CaseSnapshot;
  listing: InstrumentListing;
  ask: ReturnType<typeof useOverviewAsk>;
  names: { valleyName: string; areaLabel: string };
  area: string | null;
  findings: readonly Finding[];
  bandLimit: { value: number; display: string } | null;
  offered: ReadonlySet<ViewKind>;
  reasons: string[];
  descriptionId: string;
  theme: "light" | "obsidian";
  onToggleTheme?: () => void;
  effectiveQuestion?: string;
  sentText: string;
  setSentText: Dispatch<SetStateAction<string>>;
  atWorkShown: boolean;
  setAtWork: Dispatch<SetStateAction<boolean>>;
  setThinkingHidden: Dispatch<SetStateAction<boolean>>;
  run: RunModel | null;
  runArc: RunArcState | null;
  runPaused: boolean;
  setRunPaused: Dispatch<SetStateAction<boolean>>;
  effectiveRecorded: RecordedRun | null;
  effectiveRecClock: number;
  fallbackCommandId: string | null;
  pkgView: ReturnType<typeof packageView>;
  pkgShown: boolean;
  pkgOpenRef: RefObject<(() => void) | null>;
  openPackage: () => void;
  sel: Selection | null;
  cardActions: readonly Action[];
  hoverThing: Thing | null;
  arriving: boolean;
  tear: TearState | null;
  rainWide: boolean;
  setRainWide: Dispatch<SetStateAction<boolean>>;
  cellPaint: CellPaint;
  cellPaintRef: RefObject<CellPaint>;
  setCellPaint: Dispatch<SetStateAction<CellPaint>>;
  moved: boolean;
  askOpen: boolean;
  setAskOpen: Dispatch<SetStateAction<boolean>>;
  askText: string;
  setAskText: Dispatch<SetStateAction<string>>;
  /** The record the answer reads: the run the steps handed over to, or the case's own. */
  answer: AnswerOf;
  /** The steps hand over to the answer. */
  seeFindings: () => void;
  /** The steps take the screen from the answer at once. */
  showSteps: () => void;
  /** Back on the answer at once, as from a view: the land at its end state, nothing eased in between. */
  answerNow?: () => void;
  /** True for the moment after a way back from a view: the land shows its end state at once. */
  returned?: boolean;
  onAskOpen: () => void;
  onAskClose: () => void;
  panel: boolean;
  setPanel: Dispatch<SetStateAction<boolean>>;
  scope: boolean;
  setScope: Dispatch<SetStateAction<boolean>>;
  lifeBundle: unknown;
  lifeOn: boolean;
  keys: KeyEntry[];
  layers: ReturnType<typeof useOverviewSceneData>["layers"];
  data: OverviewData | null;
  terrainOutline: ReturnType<typeof useOverviewSceneData>["terrainOutline"];
  failed: boolean;
  recordData: Partial<Record<FindingId, RecordData>>;
  routesLoad: ReturnType<typeof useOverviewSceneData>["routesLoad"];
  scanTiming: ReturnType<typeof useOverviewSceneData>["scanTiming"];
  origin: ReturnType<typeof useOverviewSceneData>["origin"];
  routeNumber: ReadonlyMap<string, number>;
  sourceSet: SourceSet;
  timeMount: TimeMount;
  lifeMount: LifeMount;
  focusTaskLayer: (task: StepTask | null) => void;
  focusLayer: (
    lens: "bands" | "cover" | "trend" | "rain" | "routes" | null,
    manual?: boolean,
  ) => void;
  focusStrata: (keys: readonly string[] | null) => void;
  showResult: (layer: LiftId | null, keys: readonly string[]) => void;
  subscribeStands: (f: (s: Stands) => void) => () => void;
  pickRoute: (id: string | null) => void;
  back: () => void;
  toOpening: () => void;
  openInPlace: (href: string) => boolean;
  backInPlace: () => void;
  onStackDrawn: () => void;
  onStackStood: () => void;
  onStackBack: () => void;
  go: () => void;
  refs: ReturnType<typeof useOverviewDomRefs>;
}

/** The answer kept in the page: in its own place (no box of the wrapper's own), and out of sight under the steps. */
const KEPT = { display: "contents" } as const;
const KEPT_OUT_OF_SIGHT = { display: "contents", visibility: "hidden" } as const;

/** The steps of a question the server has not taken yet, or refused: none yet, the clock counting from Enter. */
function noStepYet(done: boolean): RunModel {
  return {
    commandId: "",
    acceptedAt: null,
    nowMs: 0,
    done,
    replay: null,
    sourceKnown: false,
    tasks: [],
    findings: [],
    branches: [],
    merge: null,
    checks: [],
    totalCostMicroUsd: null,
    needsReview: false,
  };
}

export function OverviewHudLayer({
  snapshot,
  listing,
  ask,
  names,
  area,
  findings,
  bandLimit,
  offered,
  reasons,
  descriptionId,
  theme,
  onToggleTheme,
  effectiveQuestion,
  sentText,
  setSentText,
  atWorkShown,
  setAtWork,
  setThinkingHidden,
  run,
  runArc,
  runPaused,
  setRunPaused,
  effectiveRecorded,
  effectiveRecClock,
  pkgOpenRef,
  sel,
  cardActions,
  hoverThing,
  arriving,
  tear,
  rainWide,
  setRainWide,
  cellPaint,
  cellPaintRef,
  setCellPaint,
  moved,
  askOpen,
  setAskOpen,
  askText,
  setAskText,
  answer,
  seeFindings,
  showSteps,
  answerNow,
  returned = false,
  onAskOpen,
  onAskClose,
  panel,
  setPanel,
  scope,
  setScope,
  lifeBundle,
  lifeOn,
  keys,
  layers,
  data,
  terrainOutline,
  failed,
  recordData,
  routesLoad,
  scanTiming,
  origin,
  routeNumber,
  timeMount,
  lifeMount,
  focusTaskLayer,
  focusLayer,
  focusStrata,
  showResult,
  subscribeStands,
  pickRoute,
  back,
  toOpening,
  openInPlace,
  backInPlace,
  onStackDrawn,
  onStackStood,
  onStackBack,
  go,
  refs,
}: OverviewHudLayerProps) {
  const {
    rootRef,
    landRef,
    blurRef,
    arcRef,
    cornerRef,
    hudRef,
    liftRef,
    hatchRef,
    selWireRef,
    hoverWireRef,
    hoverRef,
    hoverNameRef,
    hoverStatusRef,
    pixTagRef,
    endRefs,
    startRef,
    placeTextRef,
    recRef,
    instRef,
    bigRef,
    linkRef,
    evidRef,
    frostRef,
    connectorRef,
    midcapRef,
    firstResultRef,
    askBesideRef,
    lastLayout,
  } = refs;

  const selFinding =
    sel && sel !== "field" && sel !== "results" && sel !== "routes"
      ? (findings.find((f) => f.id === sel) ?? null)
      : null;
  // the answer shows the field plan itself; no key opens a separate plan view any more
  pkgOpenRef.current = null;
  const effectiveAreaLabel = terrainOutline
    ? outlineLabelOf(names.valleyName, terrainOutline, names.areaLabel)
    : names.areaLabel;
  const effectiveArea =
    area ??
    (terrainOutline
      ? new Intl.NumberFormat("en", { maximumFractionDigits: 1 }).format(terrainOutline.areaKm2)
      : null);
  const readoutShown = sel === "results" || sel === "package";
  // the answer stays in the page under See It Over Time, as it does under a view in place (the selection stays the
  // answer's then), so coming back shows it as it was, at once, with nothing replayed
  const readoutKept = readoutShown || sel === "time";
  // the answer reads one record, the one the address names (useOverviewRunState): a recorded run's own, the case's
  // with a question the visitor sent at its head, or the case's
  const recordSnap = answer.kind === "recording" ? answer.recording.snapshot : ask.snapshot;
  const askedId = answer.kind === "asked" ? answer.commandId : null;
  const readout = useMemo(() => {
    const own = findingsFrom(recordSnap, listing);
    return readoutOf(recordSnap, own.findings, own.bandLimit?.display ?? "", {
      commandId: askedId,
      limits: bandLimitsOf(recordSnap),
    });
  }, [askedId, listing, recordSnap]);
  // the steps' last row says Needs You only when the run's own record asks the visitor for a review, as the run's
  // answer then does (the same record: a recording's own, else the case's)
  const stepsSnap = effectiveRecorded?.snapshot ?? ask.snapshot;
  const stepsReview = useMemo(
    () =>
      ((stepsSnap === recordSnap ? readout : readoutOf(stepsSnap, [], "")).ground?.reviews.length ??
        0) > 0,
    [readout, recordSnap, stepsSnap],
  );
  // the land splits into its evidence sheets in place (lib/overview/scene): through the steps, and on the answer whenever
  // Map Layers is pressed, never by itself; a way back from a view shows its end state at once
  const layerStack = useLayerStack({
    sceneRef: refs.sceneRef,
    go,
    ready: data !== null,
    thinking: atWorkShown && !sel,
    // a view opened from the answer (it stays selected under the view) starts from the settled land
    answer: readoutShown && tear === null,
    returned,
    reducedMotion: refs.reducedMotion,
    keysBlocked: askOpen || panel || scope || tear !== null,
  });
  // the views the place offers, each a door the answer names with its number key: the findings' own views first,
  // then the field plan and the view over time; Map Layers splits the land in place, beside the answer
  const views = useMemo(() => {
    const kinds: ViewKind[] = [];
    for (const f of findings) {
      const v = actionsFor(f.id, offered, false)[0]?.view;
      if (v && !kinds.includes(v)) kinds.push(v);
    }
    for (const v of ["time", "field"] as const)
      if (offered.has(v) && !kinds.includes(v)) kinds.push(v);
    return kinds.map((v) =>
      v === "layers"
        ? // the split stands open on the answer itself: its row shows it pressed while it does
          { label: en[VIEW_LABEL[v]].text, onOpen: layerStack.toggle, pressed: layerStack.mapOpen }
        : {
            label: en[VIEW_LABEL[v]].text,
            onOpen: () => {
              openInPlace(VIEW_HREF[v]);
            },
          },
    );
  }, [findings, layerStack.mapOpen, layerStack.toggle, offered, openInPlace]);
  const [focusedCheck, setFocusedCheck] = useState<GroundCheck | null>(null);
  // when the lit check is done, from the plan the answer's checks come from
  const checkSeason = focusedCheck ? checkSeasonOf(recordSnap, focusedCheck.fieldCheckId) : null;
  // the record's explanations with their verdicts, as the answer lists them
  const rows = useMemo<readonly ExplanationVerdict[]>(
    () =>
      (readout.explanations?.rows ?? []).map((r) => ({
        explanationId: r.explanationId,
        label: r.label,
        status: r.status,
      })),
    [readout.explanations],
  );
  // the answer on the land: the sheet its claim reads, or the sheet of the explanation that fits
  const proof = useMemo(
    () => answerLayer(proofSheet(recordSnap, readout.answer), readout.answer.claimKind, rows),
    [readout.answer, recordSnap, rows],
  );
  // one thing on the land at a time: the answer's proof, or a selected check's band with its label on the place
  useEffect(() => {
    if (readoutShown) showResult(proof, []);
  }, [proof, readoutShown, showResult]);
  const onCheck = useCallback(
    (check: GroundCheck | null) => {
      setFocusedCheck(check);
      if (check) focusStrata(check.stratumKeys);
      else showResult(proof, []);
    },
    [focusStrata, proof, showResult],
  );
  const placeRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!readoutShown || !focusedCheck) return;
    return subscribeStands((s) => {
      const el = placeRef.current;
      const p = s.points[0];
      if (!el) return;
      if (!p) {
        el.style.visibility = "hidden";
        return;
      }
      // a place behind a ridge from this view is still named; its ring goes hollow to say the place is out of sight
      el.style.visibility = "visible";
      if (p.behind) el.dataset.behind = "";
      else delete el.dataset.behind;
      el.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`;
    });
  }, [focusedCheck, readoutShown, subscribeStands]);
  // the brief opens only for one the case record itself holds; it is the one the review route reviews: the highest
  // revision, ties by id (packages/db/src/reviews.ts)
  const recordBrief =
    recordSnap === ask.snapshot
      ? ([...ask.snapshot.records.briefRecords].sort(
          (a, b) => b.revision - a.revision || b.id.localeCompare(a.id),
        )[0] ?? null)
      : null;
  const openBrief = useMemo(
    () =>
      recordBrief
        ? () => {
            window.open(
              `/brief?case=${encodeURIComponent(ask.snapshot.case.id)}&brief=${encodeURIComponent(recordBrief.id)}`,
              "_blank",
              "noopener",
            );
          }
        : null,
    [ask.snapshot.case.id, recordBrief],
  );
  const legendKeys = useMemo(() => {
    if (!readoutShown) return keys;
    const rest = keys.filter((k) => k.chip !== "E");
    const brief = openBrief
      ? [{ chip: "E", shortcut: "E", label: rd["readout.key.brief"].text, onPress: openBrief }]
      : [];
    const doors = views.length
      ? [
          {
            chip: views.length > 1 ? `1 to ${String(views.length)}` : "1",
            shortcut: views.map((_, n) => String(n + 1)).join(" "),
            label: rd["readout.key.views"].text,
            onPress: () => views[0]?.onOpen(),
          },
        ]
      : [];
    // the answer is home: Reset View has nothing to reset to here
    const kept = rest.filter((k) => k.chip !== "R");
    const slash = kept.findIndex((k) => k.chip === "/");
    return [
      ...doors,
      ...kept.slice(0, Math.max(0, slash)),
      ...brief,
      ...kept.slice(Math.max(0, slash)),
    ];
  }, [keys, openBrief, readoutShown, views]);
  const catchmentMissing = useMemo(
    () => findings.some((f) => f.id === "catchment" && Boolean(f.missingReason)),
    [findings],
  );

  // a question asked from the Ask (useOverviewAsk): its steps are the screen from Enter, before the server answers; the
  // run they show is its own once the server has taken it, until then (or when it refused) one with no step yet
  const asking = ask.status;
  const askingState = asking?.state ?? null;
  const ownRun =
    asking !== null && asking.commandId !== null && run?.commandId === asking.commandId;
  const pendingRun = useMemo<RunModel | null>(
    () => (askingState === null || ownRun ? null : noStepYet(askingState === "stopped")),
    [askingState, ownRun],
  );
  const stepsRun = pendingRun ?? run;
  const askSteps = asking !== null && atWorkShown && !sel;
  // the answer stays under the steps while the question holds them (at work, or not answered), so Esc finds it as it was
  const keepAnswer = askSteps && askingState !== "answered";
  const leaveRef = useRef<() => void>(() => undefined);
  // Esc, its key, or Stop on a question asked from the Ask that is at work or was not answered: back on the answer as it
  // was before the question, at once, as from a view; one still at work is asked to stop, and the answer says nothing
  // about it. An answered question hands over to its own answer, as the steps' last row does.
  leaveRef.current =
    asking?.state === "answered"
      ? seeFindings
      : () => {
          setRunPaused(false);
          ask.reset();
          setSentText("");
          focusTaskLayer(null);
          setThinkingHidden(true);
          setAtWork(false);
          answerNow?.();
          // the camera and the answer's lifted sheet stand at once too: the camera as every hand-over to the answer
          // resets it (ValleyOverview's open), the sheet as it stands again after See It Over Time
          refs.camTargetRef.current = null;
          refs.camRef.current = { zoom: 1, turn: 0, pitch: 0, panX: 0, panY: 0 };
          refs.movedRef.current = false;
          refs.idle.current.k = 1;
        };
  const leaveQuestion = useCallback(() => {
    leaveRef.current();
  }, []);
  // a question that was not answered is asked again from the Ask with its words kept
  const askAgain = asking?.state === "stopped" && askSteps;
  const onAskOpenHere = useCallback(() => {
    if (!askAgain) {
      onAskOpen();
      return;
    }
    setAskText(sentText);
    setAskOpen(true);
  }, [askAgain, onAskOpen, sentText, setAskOpen, setAskText]);
  const keyBar = useMemo(
    () =>
      askSteps
        ? legendKeys.map((k) =>
            k.chip === "Esc"
              ? { ...k, onPress: leaveQuestion }
              : k.chip === "/" && askAgain
                ? { ...k, label: ak["ask.key.again"].text, onPress: onAskOpenHere }
                : k,
          )
        : legendKeys,
    [askAgain, askSteps, leaveQuestion, legendKeys, onAskOpenHere],
  );

  return (
    <div
      ref={rootRef}
      className={styles.layer}
      data-overview-root
      data-arriving={arriving ? "" : undefined}
      data-tearing={tear !== null ? "" : undefined}
      data-at-work={
        atWorkShown && stepsRun && !sel ? (stepsRun.done ? "done" : "running") : undefined
      }
      data-covered={tear?.shown ? (tear.kind === "pixel" ? "land" : "") : undefined}
      data-case-revision={snapshot.case.revision}
      data-readout={readoutShown ? "" : undefined}
    >
      <p id={descriptionId} className={styles.srOnly}>
        {en["overview.description"].text} {en["overview.keys"].text}
      </p>
      <canvas ref={landRef} className={styles.canvas} aria-hidden="true" data-land />
      <canvas ref={blurRef} className={styles.blur} aria-hidden="true" data-land />
      <canvas ref={arcRef} className={`${styles.canvas} ${styles.arcCanvas}`} aria-hidden="true" />
      <div ref={cornerRef} className={styles.cornerfade} aria-hidden="true" />
      {/* the land's layer labels, outside the scaled stage so their words keep their size; the steps' verdicts as
          they stand while the steps are the screen, the answer's otherwise */}
      <LayerStack
        ref={refs.stackLabelsRef}
        theme={theme}
        explanations={
          atWorkShown && run && effectiveRecorded
            ? runVerdicts(effectiveRecorded.snapshot, run.branches)
            : rows
        }
      />
      <div ref={hudRef} className={styles.hud}>
        {atWorkShown && stepsRun && !sel && runArc ? (
          <AtWork
            // each question asked from the Ask starts its steps afresh
            key={asking !== null && ask.sentAt !== null ? `asked-${String(ask.sentAt)}` : "run"}
            run={stepsRun}
            arc={runArc.arc}
            placeName={names.valleyName}
            question={
              effectiveRecorded?.question ??
              (sentText || effectiveQuestion || snapshot.case.objective)
            }
            onFindings={seeFindings}
            onFocusTask={focusTaskLayer}
            onFocusLayer={(l) => {
              focusLayer(l, true);
            }}
            paused={runPaused}
            onTogglePause={
              !stepsRun.done && pendingRun === null
                ? () => {
                    setRunPaused((p) => !p);
                  }
                : undefined
            }
            onStopRun={
              !stepsRun.done
                ? asking !== null
                  ? leaveQuestion
                  : () => {
                      setRunPaused(false);
                      if (ask.commandId && !ask.pacing && stepsRun.replay === null) {
                        ask.cancel();
                      }
                      focusTaskLayer(null);
                      setThinkingHidden(true);
                      setAtWork(false);
                      if (sentText) setAskText(sentText);
                    }
                : undefined
            }
            rimLeft={runArc.rimLeft}
            sheets={runArc.sheets}
            reviewRequested={stepsReview}
            {...(asking !== null && ask.sentAt !== null
              ? {
                  startedAt: ask.sentAt,
                  stopped: asking.state === "stopped" ? asking.text : null,
                  chosen: chosenCount(ask.snapshot.records.taskRecords, asking.commandId),
                  onBack: askOpen || panel || scope ? undefined : leaveQuestion,
                }
              : {})}
            {...(effectiveRecorded
              ? {
                  nowMs: effectiveRecClock,
                  recording: {
                    speed: effectiveRecorded.speed,
                    length: lengthOf(effectiveRecorded),
                  },
                }
              : {})}
            sourceName={(id) => {
              const src = (effectiveRecorded?.snapshot ?? ask.snapshot).records.sourceRecords.find(
                (x) => x.id === id,
              );
              return src ? shortCitation(src) : en["results.unknownSource"].text;
            }}
          />
        ) : null}
        <div ref={liftRef} className={styles.lift}>
          {catchmentMissing ? (
            <div
              ref={hatchRef}
              className={styles.missingHatch}
              data-missing-hatch
              aria-hidden="true"
            />
          ) : null}
          {/* the resting land's finding labels, their wires and the field check's tag are gone: the answer took
              their place as the overview's home, so nothing of them fades over or under it */}
          <svg className={styles.marks} aria-hidden="true">
            <line ref={selWireRef} className={styles.wire} />
            <line ref={hoverWireRef} className={styles.hoverWire} />
          </svg>
          {data ? (
            <>
              <div ref={hoverRef} className={styles.hover} aria-hidden="true" data-hover-label>
                <span ref={hoverNameRef} className={styles.liftName} />
                <span ref={hoverStatusRef} className={styles.hoverStatus} />
                {hoverThing ? (
                  <ActionList still actions={actionsFor(hoverThing, offered, false)} />
                ) : null}
              </div>
              {data.pixel ? (
                <div ref={pixTagRef} className={styles.pixTag}>
                  <span>{en["overview.pixel"].text}</span>
                </div>
              ) : null}
              {data.routes.map((r) => (
                <span
                  key={r.id}
                  className={styles.site}
                  data-route-end={r.member}
                  aria-hidden="true"
                  ref={(el) => {
                    if (el) endRefs.current.set(r.id, el);
                    else endRefs.current.delete(r.id);
                  }}
                >
                  <i className={styles.siteRing} />
                  <span className={styles.siteNum}>{routeNumber.get(r.id)}</span>
                </span>
              ))}
              {origin ? (
                <div ref={startRef} className={styles.startTag} data-route-start>
                  <span>{origin.name}</span>
                </div>
              ) : null}
            </>
          ) : null}
        </div>
        <footer className={styles.place}>
          <div ref={placeTextRef} data-place-text>
            <div className={styles.name}>{names.valleyName}</div>
            {effectiveArea !== null ? (
              <div className={styles.sub}>
                {format("arrival.studyArea", { label: effectiveAreaLabel, area: effectiveArea })}
              </div>
            ) : null}
          </div>
        </footer>
        {failed ? (
          <p className={styles.failed} role="status" data-overview-failed>
            {en[layers === undefined ? "overview.noLand" : "overview.failed"].text}
          </p>
        ) : null}
        {/* the answer stays in the page under See It Over Time and, out of sight, under the steps of a question asked
            from the Ask, so coming back shows it as it was, at once; a new answer (the question's own, handed over to)
            arrives afresh */}
        {readoutKept || keepAnswer ? (
          <div style={keepAnswer ? KEPT_OUT_OF_SIGHT : KEPT}>
            <Readout
              key={answer.kind === "case" ? "case" : answer.commandId}
              readout={readout}
              // the question the answer is to: a recording's own, else the case's, as a plain visit shows it (a place
              // the globe started with another question has no run that answered it)
              question={
                answer.kind === "recording" ? answer.recording.question : snapshot.case.objective
              }
              asked={askedId !== null && askedId === ask.commandId && sentText ? sentText : null}
              views={views}
              onCheck={onCheck}
              onBrief={openBrief}
              keysOff={askOpen || tear !== null || !readoutShown || atWorkShown}
            />
          </div>
        ) : null}
        {sel ? (
          <>
            {sel === "routes" && data ? (
              <OverviewRoutes
                routes={data.routes}
                load={routesLoad}
                onPick={pickRoute}
                onOpen={openInPlace}
                actions={cardActions}
                onBack={back}
                refs={{ root: recRef, inst: instRef, frost: frostRef, first: firstResultRef }}
              />
            ) : null}
            {sel !== "results" && sel !== "routes" && sel !== "package" && sel !== "time" ? (
              <OverviewRecord
                sel={sel}
                finding={selFinding}
                allFindings={findings}
                caption={
                  selFinding ? captionOf(selFinding, bandLimit?.display ?? "", findings) : []
                }
                bandLimit={bandLimit?.display ?? ""}
                data={
                  sel === "field" ? null : (recordData[sel] ?? fallbackRecordData(sel, snapshot))
                }
                reasons={reasons}
                fieldCaption={instrumentOf(listing, "field_plan")?.spec.caption ?? null}
                pixelNote={data?.pixel?.note ?? null}
                areaLabel={effectiveAreaLabel}
                side={sideOf(sel, selFinding?.clock)}
                onLand={onLandOf(sel, data)}
                slopeKey={
                  sel === "fdr" && data?.footprints.slope
                    ? { domain: data.footprints.slope.domain }
                    : null
                }
                scanTiming={sel === "band" || sel === "fdr" ? scanTiming : null}
                wide={rainWide && sel === "rain"}
                actions={cardActions}
                onOpen={openInPlace}
                onBack={back}
                onContextToggle={go}
                refs={{
                  root: recRef,
                  inst: instRef,
                  big: bigRef,
                  link: linkRef,
                  evid: evidRef,
                  frost: frostRef,
                  connector: connectorRef,
                  midcap: midcapRef,
                }}
              />
            ) : null}
          </>
        ) : null}
        {data ? (
          <Ask
            keysOff={arriving || tear !== null}
            open={askOpen}
            onOpen={onAskOpenHere}
            onClose={onAskClose}
            text={askText}
            onText={setAskText}
            onEnter={(text) => {
              // the steps of the question take the screen at once, as T shows them, its status line at work before the
              // server answers; from Year by Year, back on the answer first (showSteps opens them only from the answer)
              if (sel === "time") back();
              showSteps();
              setRunPaused(false);
              setSentText(text);
              setAskOpen(false);
              ask.send(text);
            }}
            // the question's steps say where it stands, so the Ask itself shows no line of its own
            activity={null}
            besideRef={askBesideRef}
            suggestions={(listing.suggestedQuestions ?? []).filter(
              (q) =>
                q.question.trim().toLowerCase() !== snapshot.case.objective.trim().toLowerCase(),
            )}
          />
        ) : null}
      </div>
      {onToggleTheme ? (
        <button
          type="button"
          className={styles.overviewThemeBtn}
          onClick={onToggleTheme}
          aria-label={theme === "obsidian" ? "Switch to light theme" : "Switch to dark theme"}
          title={theme === "obsidian" ? "Switch to light theme" : "Switch to dark theme"}
        >
          <ThemeIcon theme={theme} />
        </button>
      ) : null}
      <Breadcrumb
        crumbs={
          readoutShown
            ? // the answer is the place's home: its place crumb leaves for the place's opening, as Esc does
              [
                { label: names.valleyName, onSelect: toOpening },
                { label: crumbOf("results", findings, bandLimit?.display ?? "") },
              ]
            : sel === "time"
              ? // See It Over Time trails from the place through the answer, like every view
                [
                  { label: names.valleyName, onSelect: back },
                  { label: crumbOf("results", findings, bandLimit?.display ?? ""), onSelect: back },
                  { label: crumbOf("time", findings, bandLimit?.display ?? "") },
                ]
              : atWorkShown && stepsRun && !sel
                ? // the steps, by the name the key bar gives them (T)
                  [{ label: names.valleyName }, { label: en["chrome.key.thinking"].text }]
                : [
                    sel ? { label: names.valleyName, onSelect: back } : { label: names.valleyName },
                    ...(sel
                      ? [
                          rainWide && sel === "rain"
                            ? {
                                label: crumbOf(sel, findings, bandLimit?.display ?? ""),
                                onSelect: () => {
                                  setRainWide(false);
                                  goTo("/valley");
                                },
                              }
                            : { label: crumbOf(sel, findings, bandLimit?.display ?? "") },
                        ]
                      : []),
                    ...(rainWide && sel === "rain"
                      ? [{ label: en["overview.open.rainfall"].text }]
                      : []),
                  ]
        }
      />
      {data ? (
        <>
          <KeyLegend entries={keyBar} />
          <SourcesOverlay
            snapshot={ask.snapshot}
            runAt={answer.kind === "case" ? null : answer.acceptedAt}
            tab={panel ? "sources" : scope ? "limits" : null}
            onTab={(t) => {
              setPanel(t === "sources");
              setScope(t === "limits");
            }}
            onClose={() => {
              setPanel(false);
              setScope(false);
            }}
            relief={layers ? EXAG : undefined}
          />
        </>
      ) : null}
      {sel === "time" && !tear ? <TimeView snapshot={snapshot} open mount={timeMount} /> : null}
      {Boolean(lifeBundle) && data ? (
        <LifeLayer
          snapshot={snapshot}
          zone={data.zone}
          on={lifeOn && (!sel || sel === "time") && !tear && !atWorkShown}
          mount={lifeMount}
        />
      ) : null}
      {tear ? (
        <OverviewInPlaceInstrument
          tear={tear}
          snapshot={snapshot}
          listing={listing}
          backInPlace={backInPlace}
          onStackDrawn={onStackDrawn}
          onStackStood={onStackStood}
          onStackBack={onStackBack}
          cellPaint={cellPaint}
          cellPaintRef={cellPaintRef}
          setCellPaint={setCellPaint}
          go={go}
          lastLayout={lastLayout}
          hudRef={hudRef}
          onToggleTheme={onToggleTheme}
          className={styles.inPlace}
        />
      ) : null}
      {readoutShown && focusedCheck ? (
        <div
          ref={placeRef}
          className={readoutStyles.place}
          data-readout-place
          aria-hidden="true"
          style={{ visibility: "hidden" }}
        >
          <span className={readoutStyles.placeDot} />
          {/* the place and when, in the plan's own words; the column names the check, so no number here */}
          <span className={readoutStyles.placeTip}>
            <b>{focusedCheck.place ?? focusedCheck.what}</b>
            {checkSeason ? <span>{checkSeason}</span> : null}
          </span>
        </div>
      ) : null}
      <span hidden data-view-moved={moved ? "" : undefined} />
    </div>
  );
}
