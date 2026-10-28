"use client";

// Arrival and the work beat: the valley at the approved pose with its chrome, Flat Map View and Sources and
// notices, from one case kept current (useCaseSession). The command line or ↵ commissions a request with
// what the viewer typed, or the case question when the line is empty; once a command is accepted the card shows its work and the committed Observations, with one
// leader to the catchment line. A reload replays the event log and comes back to the same state.

import type * as maplibregl from "maplibre-gl";
import type { CaseSnapshot } from "@siterra/contracts";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityPanel } from "../activity/ActivityPanel";
import { usePacedLog } from "../activity/usePacedLog";
import { Card } from "../card/Card";
import { Leader } from "../card/Leader";
import { useCaseSession } from "../case/useCaseSession";
import { FlatListing } from "../flat/FlatListing";
import { DepartureLegend } from "../map/DepartureLegend";
import { useDepartureLayer } from "../map/useDepartureLayer";
import { Notices } from "../notices/Notices";
import { ArrivalChrome } from "../shell/ArrivalChrome";
import { ValleyStage } from "../stage/ValleyStage";
import { projectActivity, projectTrace, replayOrigin } from "../../lib/activity/activity";
import type { Point } from "../../lib/card/leader";
import { commandRunning, workCard } from "../../lib/card/work";
import { commissionRequest, requestText, submitCommand } from "../../lib/case/command";
import { latestCommandId } from "../../lib/case/events";
import { en, type MessageId } from "../../lib/copy/en";
import type { MapBundle } from "../../lib/map/bundle";
import { legendLines } from "../../lib/map/departure";
import { arrivalFlat } from "../../lib/flat/arrival";
import { regionPack } from "../../lib/pack/regionPack";
import { projectBranches } from "../../lib/projection/branches";
import { projectObservations } from "../../lib/projection/observations";
import type { ReadyArrival } from "../../lib/projection/arrival";
import { ARRIVAL_EXAGGERATION, ARRIVAL_POSE } from "../../lib/stage/arrival";
import { primaryHint, stopHint } from "../../lib/shell/hints";
import { readSingleKeys, viewerStorage, writeSingleKeys } from "../../lib/shell/preferences";
import { orbitToMapCamera } from "../../lib/stage/camera";
import styles from "./ArrivalView.module.css";

export interface ArrivalViewProps {
  /** The valley's assets from the map bundle, or null when it could not be read. */
  assets: MapBundle["valley"] | null;
  /** Where contour lines can be made from the bundle's terrain. */
  contourArea?: MapBundle["contours"];
  /** MOT-01: settle from the regional view on a first visit (the /stage route; the hero's dive replaces it). */
  settle?: boolean;
  arrival: ReadyArrival;
  /** The case revision the arrival was projected from; the session keeps it current. */
  snapshot: CaseSnapshot;
  /** False while the dive is still coming down: the land only, no chrome. */
  chrome?: boolean;
  onMap?: (map: maplibregl.Map) => void;
  /** After a request is accepted. */
  onStart?: () => void;
  onSources?: () => void;
}

const noop = () => undefined;

export function ArrivalView({
  assets,
  contourArea,
  settle = false,
  arrival,
  snapshot: initial,
  chrome = true,
  onMap,
  onStart = noop,
  onSources = noop,
}: ArrivalViewProps) {
  // "F Flat Map View": the flat map reading (MOT-12); F again returns to the beat's view
  const [flat, setFlat] = useState(false);
  const [mapFailed, setMapFailed] = useState(false);
  const onMapFailed = useCallback(() => {
    setMapFailed(true);
  }, []);
  const imagery = assets?.imagery !== undefined;
  const [noticesOpen, setNoticesOpen] = useState(false);
  // on for the server render; the viewer's stored choice is read once the page runs
  const [singleKeys, setSingleKeys] = useState(true);
  useEffect(() => {
    setSingleKeys(readSingleKeys(viewerStorage()));
  }, []);
  const onSingleKeys = useCallback((on: boolean) => {
    setSingleKeys(on);
    writeSingleKeys(viewerStorage(), on);
  }, []);
  const [arrived, setArrived] = useState(false);
  // true when an input cut the settle short: the chrome lands at once too
  const [quick, setQuick] = useState(false);
  const onArrive = useCallback((q: boolean) => {
    setQuick(q);
    setArrived(true);
  }, []);
  const [outline, setOutline] = useState<Point[]>([]);
  const [notice, setNotice] = useState<MessageId | undefined>(undefined);
  const { snapshot, log } = useCaseSession(initial);
  const commandId = latestCommandId(log);
  const working = commandId !== undefined;
  const running = commandId !== undefined && commandRunning(snapshot, log, commandId);
  // a replayed request started in this tab plays out at reading pace (usePacedLog); a reload shows it whole
  const [startedHere, setStartedHere] = useState<string | undefined>(undefined);
  const replay = commandId ? replayOrigin(log.events, commandId) : undefined;
  const paced = usePacedLog(
    log,
    commandId,
    commandId !== undefined && commandId === startedHere && replay !== undefined,
  );
  const shown = paced.log;
  const busy = running || paced.pacing;
  const card = useMemo(
    () =>
      commandId
        ? workCard(snapshot, shown, commandId, projectObservations(snapshot), {
            pacing: paced.pacing,
          })
        : undefined,
    [snapshot, shown, commandId, paced.pacing],
  );
  const activity = useMemo(
    () =>
      commandId
        ? projectActivity(snapshot.records.taskRecords, shown.events, commandId, {
            playedOnly: paced.pacing,
          })
        : [],
    [snapshot, shown, commandId, paced.pacing],
  );
  const trace = useMemo(
    () => (commandId ? projectTrace(shown.events, commandId) : undefined),
    [shown.events, commandId],
  );
  const branches = useMemo(() => projectBranches(snapshot, commandId), [snapshot, commandId]);
  const [traceOpen, setTraceOpen] = useState(false);
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);
  // storyboard scene 3: the departure layer shows with the Observations this request produced
  const departure = useDepartureLayer(snapshot, card?.section !== undefined);
  const pack = useMemo(() => regionPack(snapshot), [snapshot]);
  const [departureShown, setDepartureShown] = useState(false);
  const legend = departureShown ? departure.legend : undefined;
  const hatched = departureShown && departure.layer?.excludedUri !== undefined;
  const placeCredit = [arrival.land.creditLine, hatched ? en["credit.worldcover"].text : ""]
    .filter(Boolean)
    .join(" ");

  // one submission in flight at a time; a request already running is stopped, not doubled
  const submitting = useRef(false);
  const commission = useCallback(
    (typed: string) => {
      if (busy || submitting.current) return;
      submitting.current = true;
      setNotice(undefined);
      const text = requestText(typed, snapshot.case.objective);
      const body = commissionRequest(snapshot, text, crypto.randomUUID());
      submitCommand(snapshot.case.id, body, (input, init) => fetch(input, init))
        .then((r) => {
          if (r.status === "refused")
            setNotice(r.code === "quota_exhausted" ? "work.quotaUsed" : "work.refused");
          else {
            setStartedHere(r.command.id);
            onStart();
          }
        })
        .catch((e: unknown) => {
          console.error("Commission failed", e);
          setNotice("work.refused");
        })
        .finally(() => {
          submitting.current = false;
        });
    },
    [busy, snapshot, onStart],
  );

  // Esc: stops a running request; a finished replay still playing at reading pace shows all its steps
  const stop = useCallback(() => {
    if (!commandId) return;
    paced.showAll();
    if (!running) return;
    fetch(`/api/commands/${encodeURIComponent(commandId)}/cancel`, {
      method: "POST",
      credentials: "same-origin",
    }).catch((e: unknown) => {
      console.error("Stop failed", e);
    });
  }, [commandId, running, paced]);
  // the initial bearing does not depend on the viewport height; user orbit updates it live
  const [bearing, setBearing] = useState(() => orbitToMapCamera(ARRIVAL_POSE, 1).bearing);
  const [cameraMoved, setCameraMoved] = useState(false);
  const [resetSeq, setResetSeq] = useState(0);
  const resetView = useCallback(() => {
    setResetSeq((s) => s + 1);
  }, []);
  const question = arrival.question;
  return (
    <>
      {/* first in the tab order: the skip link to the text listing */}
      {chrome ? (
        <FlatListing
          shown={mapFailed}
          sections={arrivalFlat({
            question,
            valleyName: arrival.valleyName,
            regionName: arrival.regionName,
            areaKm2: arrival.areaKm2,
            places: arrival.land.places,
            outlet: arrival.land.outlet !== undefined,
            placeCredit,
            placeCredits: arrival.land.credits,
            reliefFactor: ARRIVAL_EXAGGERATION,
            imagery: imagery && !mapFailed,
            relief: !mapFailed,
            ...(legend && !mapFailed ? { legend: legendLines(legend) } : {}),
          })}
        />
      ) : null}
      <ValleyStage
        assets={assets}
        contourArea={contourArea}
        settleKey={settle ? `siterra.settled.${arrival.caseId}` : undefined}
        catchment={arrival.catchment}
        valleyName={arrival.valleyName}
        regionName={arrival.regionName}
        areaKm2={arrival.areaKm2}
        places={arrival.land.places}
        outlet={arrival.land.outlet}
        onMap={onMap}
        labels={chrome}
        names={!working}
        onArrive={onArrive}
        onOutline={setOutline}
        flat={flat}
        onFailed={onMapFailed}
        departure={departure.layer}
        onDeparture={setDepartureShown}
        resetSeq={resetSeq}
        onMoved={setCameraMoved}
        onBearing={setBearing}
        branches={branches?.branches ?? []}
        selectedBranchId={selectedBranchId}
        onSelectBranch={setSelectedBranchId}
      />
      {chrome && card && commandId ? (
        <>
          <div className={styles.work}>
            <Card content={card} stepKey={commandId} anchor="working" />
            <ActivityPanel
              rows={activity}
              replay={replay}
              pacing={paced.pacing}
              stop={stopHint({ running, pacing: paced.pacing })}
              onStop={stop}
              trace={trace}
              traceOpen={traceOpen}
              onToggleTrace={() => {
                setTraceOpen((v) => !v);
              }}
              branches={branches}
              selectedBranchId={selectedBranchId}
              onSelectBranch={setSelectedBranchId}
            />
          </div>
          <Leader outline={outline} stepKey={commandId} />
        </>
      ) : null}
      {chrome && legend && departure.binding && !mapFailed ? (
        <DepartureLegend legend={legend} binding={departure.binding} />
      ) : null}
      {chrome ? (
        <>
          <ArrivalChrome
            question={question}
            areaName={arrival.valleyName}
            mode={arrival.modeLines}
            pack={pack}
            reliefFactor={ARRIVAL_EXAGGERATION}
            imagery={imagery}
            placeCredit={placeCredit}
            singleKeys={singleKeys}
            // with no map there is no arrival to wait for: the command line and ↵ land at once
            arrived={arrived || mapFailed}
            mapDrawn={!mapFailed}
            instant={quick}
            bearingDeg={bearing}
            primary={primaryHint({ commissioned: working, running })}
            onStart={commission}
            stop={stopHint({ running, pacing: paced.pacing })}
            onStop={stop}
            notice={notice}
            flat={flat}
            onReadFlat={() => {
              setFlat((f) => !f);
            }}
            cameraMoved={cameraMoved}
            onResetView={resetView}
            onTrace={() => {
              setTraceOpen((v) => !v);
            }}
            onBrief={() => {
              document
                .querySelector("[data-field-plan], [data-stage=field_verification]")
                ?.scrollIntoView({ block: "nearest" });
            }}
            onAsk={commission}
            onSources={() => {
              setNoticesOpen(true);
              onSources();
            }}
          />
          <Notices
            open={noticesOpen}
            dataCredits={arrival.dataCredits}
            placeCredits={arrival.land.credits}
            imagery={imagery}
            singleKeys={singleKeys}
            onSingleKeys={onSingleKeys}
            onClose={() => {
              setNoticesOpen(false);
            }}
          />
        </>
      ) : null}
    </>
  );
}
