"use client";

// Arrival: the valley at the approved pose with its chrome and Read flat. Actions are wired by the case
// shell; until the case snapshot is bound, the question comes from the catalog and the mode line says
// fixture data.

import type * as maplibregl from "maplibre-gl";
import { useState } from "react";
import { ReadFlat } from "../flat/ReadFlat";
import { ArrivalChrome } from "../shell/ArrivalChrome";
import { ValleyStage } from "../stage/ValleyStage";
import { en } from "../../lib/copy/en";
import { arrivalFlat } from "../../lib/flat/arrival";
import { ARRIVAL_EXAGGERATION, ARRIVAL_PLACES, ARRIVAL_POSE } from "../../lib/stage/arrival";
import { orbitToMapCamera } from "../../lib/stage/camera";

export interface ArrivalViewProps {
  manifestUrl: string;
  /** False while the dive is still coming down: the land only, no chrome. */
  chrome?: boolean;
  onMap?: (map: maplibregl.Map) => void;
  onStart?: () => void;
  onAsk?: (text: string) => void;
  onSources?: () => void;
}

const noop = () => undefined;

/** Fixture until the case snapshot is bound (projectArrival). */
const AREA_KM2 = "417.0";

export function ArrivalView({
  manifestUrl,
  chrome = true,
  onMap,
  onStart = noop,
  onAsk = noop,
  onSources = noop,
}: ArrivalViewProps) {
  const [flatOpen, setFlatOpen] = useState(false);
  // the bearing does not depend on the viewport height
  const bearing = orbitToMapCamera(ARRIVAL_POSE, 1).bearing;
  const question = en["arrival.question"].text;
  return (
    <>
      <ValleyStage manifestUrl={manifestUrl} onMap={onMap} labels={chrome} />
      {chrome ? (
        <>
          <ArrivalChrome
            question={question}
            mode="mode.fixture"
            reliefFactor={ARRIVAL_EXAGGERATION}
            keysEnabled={!flatOpen}
            bearingDeg={bearing}
            onStart={onStart}
            onReadFlat={() => {
              setFlatOpen(true);
            }}
            onAsk={onAsk}
            onSources={onSources}
          />
          <ReadFlat
            open={flatOpen}
            sections={arrivalFlat({
              question,
              areaKm2: AREA_KM2,
              places: ARRIVAL_PLACES,
              reliefFactor: ARRIVAL_EXAGGERATION,
            })}
            onClose={() => {
              setFlatOpen(false);
            }}
          />
        </>
      ) : null}
    </>
  );
}
