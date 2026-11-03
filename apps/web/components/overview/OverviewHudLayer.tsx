"use client";

import { type CaseSnapshot, type InstrumentListing } from "@siterra/contracts";
import {
  useMemo,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";
import { en, format } from "../../lib/copy/en";
import type { CellPaint } from "../../lib/instruments/pixel/paint";
import { instrumentOf } from "../../lib/instruments/listing";
import { bandLimitsOf } from "../../lib/land/record";
import { actionsFor, type Action, type Thing, type ViewKind } from "../../lib/overview/actions";
import {
  answerForCase,
  captionOf,
  outlineLabelOf,
  overviewLabelOf,
  type Finding,
  type FindingId,
} from "../../lib/overview/findings";
import { formatLiftStatus } from "../../lib/overview/hud-layout";
import { shortCitation } from "../../lib/overview/results";
import {
  EXAG,
  sideOf,
  type LiftId,
  type Selection,
} from "../../lib/overview/scene/overview";
import { fallbackRecordData } from "../../lib/overview/terrain";
import type { OverviewData } from "../../lib/overview/data";
import type { RecordData } from "../../lib/overview/record-data";
import type { packageView } from "../../lib/package/package";
import type { RunModel } from "../../lib/run/model";
import { lengthOf, type RecordedRun } from "../../lib/run/recorded";
import {
  Breadcrumb,
  KeyLegend,
  ScopeNote,
  SourcesPanel,
  type KeyEntry,
  type SourceSet,
} from "../controls/ScreenChrome";
import { LifeLayer, type LifeMount } from "../life/LifeLayer";
import { ThemeIcon } from "../opening/Opening";
import { PackageBriefing, type LandMount } from "../package/PackageBriefing";
import { TimeView, type TimeMount } from "../time/TimeView";
import { ActionList } from "./ActionList";
import { Ask } from "./Ask";
import { AtWork } from "./AtWork";
import { Arrow, FindingMark, crumbOf, onLandOf } from "./FindingMark";
import { OverviewRecord } from "./OverviewRecord";
import { OverviewResults } from "./OverviewResults";
import { OverviewRoutes } from "./OverviewRoutes";
import type { useOverviewAsk } from "./useOverviewAsk";
import { goTo } from "./useOverviewControls";
import type { RunArcState } from "./useOverviewLayoutApply";
import type { useOverviewDomRefs } from "./useOverviewRunState";
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
  canvasFindings: readonly Finding[];
  bandLimit: { value: number; display: string } | null;
  planned: boolean;
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
  liftShown: LiftId | null;
  askOpen: boolean;
  setAskOpen: Dispatch<SetStateAction<boolean>>;
  askText: string;
  setAskText: Dispatch<SetStateAction<string>>;
  setAskHover: Dispatch<SetStateAction<boolean>>;
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
  pkgLand: LandMount;
  focusTaskLayer: (task: { kind: string; sublabel?: string | null } | null) => void;
  focusLayer: (lens: "bands" | "cover" | "trend" | "rain" | "routes" | null, manual?: boolean) => void;
  focusCauseFromLedger: (explanationId: string) => void;
  hover: (id: FindingId, on: boolean) => void;
  pickRoute: (id: string | null) => void;
  open: (id: Selection) => void;
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

export function OverviewHudLayer({
  snapshot,
  listing,
  ask,
  names,
  area,
  findings,
  canvasFindings,
  bandLimit,
  planned,
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
  fallbackCommandId,
  pkgView,
  pkgShown,
  pkgOpenRef,
  openPackage,
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
  liftShown,
  askOpen,
  setAskOpen,
  askText,
  setAskText,
  setAskHover,
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
  sourceSet,
  timeMount,
  lifeMount,
  pkgLand,
  focusTaskLayer,
  focusLayer,
  focusCauseFromLedger,
  hover,
  pickRoute,
  open,
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
    questionRef,
    answerRef,
    liftRef,
    hatchRef,
    wireRefs,
    selWireRef,
    liftWireRef,
    hoverWireRef,
    fieldRef,
    fieldTagRef,
    liftLabelRef,
    hoverRef,
    hoverNameRef,
    hoverStatusRef,
    pixTagRef,
    endRefs,
    startRef,
    dotRefs,
    labelRefs,
    numeralRefs,
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
    askCircleRef,
    askBesideRef,
    askPromptsRef,
    lastLayout,
    selRef,
  } = refs;

  const selFinding =
    sel && sel !== "field" && sel !== "results" && sel !== "routes"
      ? (findings.find((f) => f.id === sel) ?? null)
      : null;
  const results = sel === "results" ? (fallbackCommandId ?? "case_verdict") : null;
  const resultsActions = pkgView
    ? cardActions.map((a) =>
        a.key === "Enter" && a.view === "field" ? { ...a, key: "F" as const } : a,
      )
    : cardActions;
  pkgOpenRef.current = sel === "results" && pkgView ? openPackage : null;
  const limits = bandLimitsOf(snapshot);
  const effectiveAreaLabel = terrainOutline
    ? outlineLabelOf(names.valleyName, terrainOutline, names.areaLabel)
    : names.areaLabel;
  const effectiveArea =
    area ??
    (terrainOutline
      ? new Intl.NumberFormat("en", { maximumFractionDigits: 1 }).format(terrainOutline.areaKm2)
      : null);
  const liftStatusText =
    liftShown && data ? formatLiftStatus(liftShown, findings, data, limits) : "";
  const caseAnswer = useMemo(() => answerForCase(ask.snapshot), [ask.snapshot]);
  const catchmentMissing = useMemo(
    () => findings.some((f) => f.id === "catchment" && Boolean(f.missingReason)),
    [findings],
  );

  return (
    <div
      ref={rootRef}
      className={styles.layer}
      data-overview-root
      data-arriving={arriving ? "" : undefined}
      data-tearing={tear !== null ? "" : undefined}
      data-at-work={atWorkShown && run && !sel ? (run.done ? "done" : "running") : undefined}
      data-covered={tear?.shown ? (tear.kind === "pixel" ? "land" : "") : undefined}
      data-case-revision={snapshot.case.revision}
    >
      <p id={descriptionId} className={styles.srOnly}>
        {en["overview.description"].text} {en["overview.keys"].text}
      </p>
      <canvas ref={landRef} className={styles.canvas} aria-hidden="true" data-land />
      <canvas ref={blurRef} className={styles.blur} aria-hidden="true" data-land />
      <canvas ref={arcRef} className={`${styles.canvas} ${styles.arcCanvas}`} aria-hidden="true" />
      <div ref={cornerRef} className={styles.cornerfade} aria-hidden="true" />
      <div ref={hudRef} className={styles.hud}>
        <div ref={questionRef} className={styles.question} data-case-question>
          <span>{effectiveQuestion ?? snapshot.case.objective}</span>
        </div>
        <div ref={answerRef} className={styles.answer} data-case-answer>
          <span className={styles.answerClaim}>{caseAnswer.claim}</span>
          {caseAnswer.limit ? (
            <>
              {" "}
              <span className={styles.answerLimit}>{caseAnswer.limit}</span>
            </>
          ) : null}
        </div>
        {atWorkShown && run && !sel && runArc ? (
          <AtWork
            run={run}
            arc={runArc.arc}
            placeName={names.valleyName}
            question={
              effectiveRecorded?.question ??
              (sentText || effectiveQuestion || snapshot.case.objective)
            }
            onFindings={() => {
              focusTaskLayer(null);
              setThinkingHidden(true);
              setAtWork(false);
              open("results");
            }}
            onFocusTask={focusTaskLayer}
            onFocusLayer={(l) => { focusLayer(l, true); }}
            onFocusCause={focusCauseFromLedger}
            paused={runPaused}
            onTogglePause={!run.done ? () => { setRunPaused((p) => !p); } : undefined}
            onStopRun={
              !run.done
                ? () => {
                    setRunPaused(false);
                    if (ask.commandId && !ask.pacing && run.replay === null) {
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
          <svg className={styles.marks} aria-hidden="true">
            {canvasFindings.map((f) => (
              <line
                key={f.id}
                className={styles.wire}
                data-wire={f.id}
                ref={(el) => {
                  if (el) wireRefs.current.set(f.id, el);
                  else wireRefs.current.delete(f.id);
                }}
              />
            ))}
            <line ref={selWireRef} className={styles.wire} />
            <line ref={liftWireRef} className={styles.liftWire} />
            <line ref={hoverWireRef} className={styles.hoverWire} />
          </svg>
          {data ? (
            <>
              {planned && (
                <button
                  ref={fieldRef}
                  type="button"
                  className={styles.field}
                  data-field-mark
                  onClick={() => { open("field"); }}
                >
                  <i className={styles.ring} aria-hidden="true" />
                  <span ref={fieldTagRef} className={styles.fieldTag}>
                    {en["overview.field"].text}
                    <Arrow deg={45} className={styles.tagArrow} />
                  </span>
                </button>
              )}
              <div
                ref={liftLabelRef}
                className={styles.liftLabel}
                data-lift={!atWorkShown && liftShown && liftStatusText ? liftShown : undefined}
                aria-hidden="true"
              >
                {!atWorkShown && liftShown && liftStatusText ? (
                  <>
                    <span className={styles.liftName}>
                      {en[`instrument.sheet.${liftShown}`].text}
                    </span>
                    <span className={styles.liftStatus}>{liftStatusText}</span>
                  </>
                ) : null}
              </div>
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
          <section className={styles.findings} aria-label={en["overview.findings"].text}>
            {data
              ? canvasFindings.map((f) => (
                  <FindingMark
                    key={f.id}
                    finding={f}
                    label={overviewLabelOf(f, bandLimit?.display ?? "", findings)}
                    bandLimit={bandLimit?.display ?? ""}
                    caption={captionOf(f, bandLimit?.display ?? "", findings)}
                    describedBy={descriptionId}
                    dotRef={(el) => {
                      if (el) dotRefs.current.set(f.id, el);
                      else dotRefs.current.delete(f.id);
                    }}
                    labelRef={(el) => {
                      if (el) labelRefs.current.set(f.id, el);
                      else labelRefs.current.delete(f.id);
                    }}
                    numeralRef={(el) => {
                      if (el) numeralRefs.current.set(f.id, el);
                      else numeralRefs.current.delete(f.id);
                    }}
                    onHover={(on) => { hover(f.id, on); }}
                    onOpen={() => { open(f.id); }}
                  />
                ))
              : null}
          </section>
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
        {sel ? (
          <>
            {results !== null ? (
              <OverviewResults
                snapshot={ask.snapshot}
                commandId={results}
                onOpen={openInPlace}
                {...(pkgView ? { onPackage: openPackage } : {})}
                onFocusCause={focusCauseFromLedger}
                actions={resultsActions}
                onBack={back}
                refs={{ root: recRef, inst: instRef, frost: frostRef, first: firstResultRef }}
              />
            ) : null}
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
            variant="arc"
            keysOff={arriving || tear !== null}
            open={askOpen}
            onOpen={onAskOpen}
            onClose={onAskClose}
            text={askText}
            onText={setAskText}
            onEnter={(text) => {
              setThinkingHidden(false);
              setAtWork(true);
              setSentText(text);
              setAskOpen(false);
              ask.send(text);
            }}
            activity={ask.activity}
            onFindings={() => { open("results"); }}
            onOpenPlan={pkgView ? openPackage : undefined}
            liveSearch={ask.liveSearch}
            onToggleLiveSearch={ask.setLiveSearch}
            onHover={setAskHover}
            disc={false}
            circleRef={askCircleRef}
            besideRef={askBesideRef}
            suggestions={(listing.suggestedQuestions ?? []).filter(
              (q) =>
                q.question.trim().toLowerCase() !== snapshot.case.objective.trim().toLowerCase(),
            )}
            showPromptsAtRest={false}
            promptsRef={askPromptsRef}
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
        brand={false}
        onBack={() => {
          if (selRef.current) back();
          else toOpening();
        }}
        crumbs={[
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
          ...(rainWide && sel === "rain" ? [{ label: en["instrument.shell.rainfall"].text }] : []),
        ]}
      />
      {data ? (
        <>
          <KeyLegend entries={keys} />
          <ScopeNote open={scope} onClose={() => { setScope(false); }} />
          <SourcesPanel
            sources={layers ? { ...sourceSet, relief: EXAG } : sourceSet}
            open={panel}
            side={sel && sideOf(sel, selFinding?.clock) === "left" ? "right" : "left"}
            onClose={() => { setPanel(false); }}
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
      {sel === "package" && pkgView && !tear ? (
        <PackageBriefing
          snapshot={ask.snapshot}
          view={pkgView}
          open={pkgShown}
          onClose={back}
          onOpen={openInPlace}
          land={pkgLand}
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
          className={styles.inPlace}
        />
      ) : null}
      <span hidden data-view-moved={moved ? "" : undefined} />
    </div>
  );
}
