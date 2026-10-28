"use client";

// Arrival and the work beat: the valley at the approved pose with its chrome, Read flat and Sources and
// notices, from one case kept current (useCaseSession). ↵ commissions the investigation with the case's
// question; once a command is accepted the card shows its work and the committed Observations, with one
// leader to the catchment line. A reload replays the event log and comes back to the same state.

import type * as maplibregl from "maplibre-gl";
import type { CaseSnapshot } from "@siterra/contracts";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Card } from "../card/Card";
import { Leader } from "../card/Leader";
import { useCaseSession } from "../case/useCaseSession";
import { FlatListing } from "../flat/FlatListing";
import { Notices } from "../notices/Notices";
import { ArrivalChrome } from "../shell/ArrivalChrome";
import { ValleyStage } from "../stage/ValleyStage";
import type { Point } from "../../lib/card/leader";
import { commandRunning, workCard } from "../../lib/card/work";
import { commissionRequest, submitCommand } from "../../lib/case/command";
import { latestCommandId } from "../../lib/case/events";
import type { MessageId } from "../../lib/copy/en";
import type { MapBundle } from "../../lib/map/bundle";
import { arrivalFlat } from "../../lib/flat/arrival";
import { projectObservations } from "../../lib/projection/observations";
import type { ReadyArrival } from "../../lib/projection/arrival";
import { ARRIVAL_EXAGGERATION, ARRIVAL_POSE } from "../../lib/stage/arrival";
import { primaryHint } from "../../lib/shell/hints";
import { readSingleKeys, viewerStorage, writeSingleKeys } from "../../lib/shell/preferences";
import { orbitToMapCamera } from "../../lib/stage/camera";

export interface ArrivalViewProps {
  /** The valley's assets from the map bundle, or null when it could not be read. */
  assets: MapBundle["valley"] | null;
  /** Where contour lines can be made from the bundle's terrain. */
  contourArea?: MapBundle["contours"];
  arrival: ReadyArrival;
  /** The case revision the arrival was projected from; the session keeps it current. */
  snapshot: CaseSnapshot;
  /** False while the dive is still coming down: the land only, no chrome. */
  chrome?: boolean;
  onMap?: (map: maplibregl.Map) => void;
  onStart?: () => void;
  onAsk?: (text: string) => void;
  onSources?: () => void;
}

const noop = () => undefined;

export function ArrivalView({
  assets,
  contourArea,
  arrival,
  snapshot: initial,
  chrome = true,
  onMap,
  onStart = noop,
  onAsk = noop,
  onSources = noop,
}: ArrivalViewProps) {
  // "F Read flat": the flat map reading (MOT-12); F again returns to the beat's view
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
  const onArrive = useCallback(() => {
    setArrived(true);
  }, []);
  const [outline, setOutline] = useState<Point[]>([]);
  const [notice, setNotice] = useState<MessageId | undefined>(undefined);
  const { snapshot, log } = useCaseSession(initial);
  const commandId = latestCommandId(log);
  const working = commandId !== undefined;
  const running = commandId !== undefined && commandRunning(snapshot, log, commandId);
  const card = useMemo(
    () =>
      commandId ? workCard(snapshot, log, commandId, projectObservations(snapshot)) : undefined,
    [snapshot, log, commandId],
  );

  const commission = useCallback(() => {
    if (working) return;
    setNotice(undefined);
    const body = commissionRequest(snapshot, snapshot.case.objective, crypto.randomUUID());
    submitCommand(snapshot.case.id, body, (input, init) => fetch(input, init))
      .then((r) => {
        if (r.status === "refused")
          setNotice(r.code === "quota_exhausted" ? "work.quotaUsed" : "work.refused");
        else onStart();
      })
      .catch((e: unknown) => {
        console.error("Commission failed", e);
        setNotice("work.refused");
      });
  }, [working, snapshot, onStart]);

  const stop = useCallback(() => {
    if (!commandId) return;
    fetch(`/api/commands/${encodeURIComponent(commandId)}/cancel`, {
      method: "POST",
      credentials: "same-origin",
    }).catch((e: unknown) => {
      console.error("Stop failed", e);
    });
  }, [commandId]);
  // the bearing does not depend on the viewport height
  const bearing = orbitToMapCamera(ARRIVAL_POSE, 1).bearing;
  const question = arrival.question;
  return (
    <>
      {/* first in the tab order: the skip link to the text listing */}
      {chrome ? (
        <FlatListing
          shown={mapFailed}
          sections={arrivalFlat({
            question,
            areaKm2: arrival.areaKm2,
            places: arrival.land.places,
            outlet: arrival.land.outlet !== undefined,
            placeCredit: arrival.land.creditLine,
            placeCredits: arrival.land.credits,
            reliefFactor: ARRIVAL_EXAGGERATION,
            imagery: imagery && !mapFailed,
            relief: !mapFailed,
          })}
        />
      ) : null}
      <ValleyStage
        assets={assets}
        contourArea={contourArea}
        catchment={arrival.catchment}
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
      />
      {chrome && card && commandId ? (
        <>
          <Card content={card} stepKey={commandId} anchor="working" />
          <Leader outline={outline} stepKey={commandId} />
        </>
      ) : null}
      {chrome ? (
        <>
          <ArrivalChrome
            question={question}
            mode={arrival.modeLines}
            reliefFactor={ARRIVAL_EXAGGERATION}
            imagery={imagery}
            placeCredit={arrival.land.creditLine}
            singleKeys={singleKeys}
            // with no map there is no arrival to wait for: the command line and ↵ land at once
            arrived={arrived || mapFailed}
            mapDrawn={!mapFailed}
            bearingDeg={bearing}
            primary={primaryHint({ commissioned: working, running })}
            onStart={running ? stop : commission}
            notice={notice}
            flat={flat}
            onReadFlat={() => {
              setFlat((f) => !f);
            }}
            onAsk={onAsk}
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
