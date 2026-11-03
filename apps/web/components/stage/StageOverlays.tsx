"use client";

import type * as maplibregl from "maplibre-gl";
import { en, format } from "../../lib/copy/en";
import type { LandPoint } from "../../lib/projection/places";
import { ARRIVAL_EXAGGERATION } from "../../lib/stage/arrival";
import { arrivalTiming, type ArrivalPart } from "../../lib/stage/arrival-sequence";
import { FlatFrame } from "./FlatFrame";
import {
  BOX_W,
  LINE_H,
  type GroundText,
  type StageViewMode,
  type Stem,
} from "./stage-map-controller";
import styles from "./ValleyStage.module.css";

export function StageOverlays({
  labels,
  outline,
  oblique,
  show,
  stems,
  ground,
  reducedMotion,
  view,
  map,
  valleyName,
  regionName,
  areaLabel,
  areaKm2,
  outlet,
  places,
  failed,
}: {
  labels: boolean;
  outline: string;
  oblique: boolean;
  show: boolean;
  stems: readonly Stem[];
  ground: readonly GroundText[];
  reducedMotion: boolean;
  view: StageViewMode;
  map: maplibregl.Map | null;
  valleyName: string;
  regionName: string;
  areaLabel: string;
  areaKm2: string;
  outlet: LandPoint | undefined;
  places: readonly LandPoint[];
  failed: boolean;
}) {
  const land = (part: ArrivalPart): Record<string, string> => {
    const t = arrivalTiming(part, reducedMotion);
    return { "--land-delay": `${String(t.delayMs)}ms`, "--land-dur": `${String(t.durationMs)}ms` };
  };

  return (
    <>
      {labels && outline && oblique ? (
        <svg className={styles.outline} aria-hidden="true">
          <path className={styles.outlineCasing} d={outline} />
          <path className={styles.outlineInk} d={outline} />
        </svg>
      ) : null}
      {(show ? stems : []).map((s) =>
        s.id === "outlet" ? (
          <span
            key={s.id}
            className={`${styles.outletLabel ?? ""} ${styles.landing ?? ""}`}
            style={{ left: s.x, top: s.y, ...land("outlet") }}
            aria-hidden="true"
            data-budget="land-label"
          >
            {s.name}
          </span>
        ) : (
          <span
            key={s.id}
            className={`${styles.stem ?? ""} ${styles.landing ?? ""}`}
            style={{ left: s.x, top: s.y, ...land("villages") }}
            aria-hidden="true"
          >
            <span
              className={`${styles.stemName ?? ""} ${styles.landing ?? ""}`}
              style={land("villageNames")}
              data-budget="land-label"
            >
              {s.name}
            </span>
          </span>
        ),
      )}
      {(show ? ground : []).map((g) => (
        <div
          key={g.id}
          className={`${styles.groundText ?? ""} ${styles.landing ?? ""}`}
          style={{
            width: BOX_W,
            height: LINE_H * g.lines.length,
            transform: g.transform,
            ...land(g.id === "label-valley" ? "name" : "study"),
          }}
          aria-hidden="true"
          data-budget="land-label"
          data-budget-text={g.lines.map((l) => l.text).join(" ")}
          data-budget-lines={JSON.stringify(g.budget)}
        >
          {g.lines.map((l) => (
            <p
              key={l.text}
              className={styles.groundLine}
              style={{
                fontSize: l.size * LINE_H * g.lines.length,
                letterSpacing: `${String(l.tracking ?? 0)}em`,
              }}
            >
              {l.text}
            </p>
          ))}
        </div>
      ))}
      {view === "flat" && map ? <FlatFrame map={map} /> : null}
      {/* Screen-reader landmark listing when the land labels are shown */}
      {labels ? (
        <ul
          className={styles.srOnly}
          aria-label={format("arrival.valleyName", { valley: valleyName })}
        >
          <li>{format("arrival.region", { region: regionName })}</li>
          <li>
            {format("arrival.studyArea", { label: areaLabel, area: areaKm2 })}{" "}
            {en["arrival.studyAreaLimit"].text}
          </li>
          {outlet ? <li>{en["arrival.outlet"].text}</li> : null}
          {places.map((p) => (
            <li key={p.id}>{p.name}</li>
          ))}
          <li>{format("stage.relief", { factor: ARRIVAL_EXAGGERATION })}</li>
        </ul>
      ) : null}
      {failed ? (
        <p className={styles.error} role="alert">
          {en["stage.mapFailed"].text}
        </p>
      ) : null}
    </>
  );
}
