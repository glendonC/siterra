"use client";

// The full-bleed valley stage in daylight: the MapLibre map with the arrival camera, names lying on a plane
// just above the land in perspective, and the stems drawn over the map. Everything the land shows is also listed for screen readers.

import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import type { BudgetLine } from "../../lib/budget/measure";
import { en, format, isHonesty, type MessageId } from "../../lib/copy/en";
import {
  ARRIVAL_EXAGGERATION,
  ARRIVAL_PLACES,
  ARRIVAL_POSE,
  OUTLET,
} from "../../lib/stage/arrival";
import { catchmentFeature, parseManifest } from "../../lib/stage/assets";
import { orbitToMapCamera, type MapCamera } from "../../lib/stage/camera";
import { valleyStyle } from "../../lib/stage/daylight-style";
import { groundCorners, screenReadingBearing, type LabelLine } from "../../lib/stage/ground-label";
import { northEdgeAnchor, valleyNameAnchor } from "../../lib/stage/placement";
import type { Feature } from "../../lib/stage/geo";
import { drawHaze, hazeCorners } from "../../lib/stage/haze";
import { projectAt, quadMatrix3d } from "../../lib/stage/project";
import { daylight } from "../../lib/theme/daylight";
import styles from "./ValleyStage.module.css";

// MapLibre 6 is ESM-only; under Next.js and Turbopack its worker must be named by URL (MapLibre install docs,
// research/technology/stack-versions.md). Only in the browser: the module is also evaluated for server rendering.
if (typeof window !== "undefined") {
  maplibregl.setWorkerUrl(
    new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).toString(),
  );
}

/** Interface sans for names on the ground; must match the family the app loads. */
const LABEL_FAMILY = '"IBM Plex Sans Variable", "IBM Plex Sans", sans-serif';

/** Catchment area as recorded for revision 1, one decimal (fixture until the case snapshot supplies it). */
const STUDY_AREA_KM2 = "417.0";

interface Stem {
  id: string;
  name: string;
  x: number;
  y: number;
}

interface GroundText {
  id: string;
  lines: LabelLine[];
  budget: BudgetLine[];
  /** CSS transform that lays the text box on its plane above the land. */
  transform: string;
}

/** The text box the transform maps onto the land: CSS px, wide enough for the hero's ground names. */
const BOX_W = 1000;
const LINE_H = 83;
/** The plane the names lie on: this far above the land at the name's anchor, as in the hero (0.6 km). */
const PLANE_LIFT_M = 600;

export interface ValleyStageProps {
  /** URL of the asset manifest. */
  manifestUrl: string;
  /** Called once the map has drawn the arrival frame with every tile loaded. */
  onIdle?: () => void;
  /** Called once the map has loaded, so the dive can drive its camera and relief frame by frame. */
  onMap?: (map: maplibregl.Map) => void;
  /** False while the dive comes down: the land only; names and stems land at arrival. */
  labels?: boolean;
}

export function ValleyStage({ manifestUrl, onIdle, onMap, labels = true }: ValleyStageProps) {
  const container = useRef<HTMLDivElement>(null);
  const [stems, setStems] = useState<Stem[]>([]);
  const [failed, setFailed] = useState(false);
  const [idle, setIdle] = useState(false);
  const [ground, setGround] = useState<GroundText[]>([]);

  useEffect(() => {
    let map: maplibregl.Map | undefined;
    let cancelled = false;
    const stopped = () => cancelled;

    const valleyLines: LabelLine[] = [
      { text: en["arrival.valleyName"].text, size: 0.4, weight: 500, tracking: 0.022 },
      { text: en["arrival.region"].text, size: 0.28, weight: 500 },
    ];
    const studyLines: LabelLine[] = [
      { text: format("arrival.studyArea", { area: STUDY_AREA_KM2 }), size: 0.33, weight: 500 },
      { text: en["arrival.studyAreaLimit"].text, size: 0.22, weight: 500 },
    ];
    const budgetLines = (ids: MessageId[], texts: LabelLine[]): BudgetLine[] =>
      texts.map((t, i) => {
        const id = ids[i];
        return { text: t.text, honesty: id ? isHonesty(id) : false };
      });

    const onLoad = (m: maplibregl.Map, cam: MapCamera, catchment: Feature) => {
      m.jumpTo({
        center: cam.center,
        zoom: cam.zoom,
        pitch: cam.pitch,
        bearing: cam.bearing,
        elevation: cam.elevation,
      });
      const reading = screenReadingBearing(cam.bearing);
      const blocks = [
        {
          id: "label-valley",
          lines: valleyLines,
          budget: budgetLines(["arrival.valleyName", "arrival.region"], valleyLines),
          anchor: valleyNameAnchor(catchment, ARRIVAL_PLACES[1], {
            eastOfM: 2500,
            shiftM: { east: -2050, north: -2190 },
            readingBearingDeg: reading,
          }),
        },
        {
          id: "label-study-area",
          lines: studyLines,
          budget: budgetLines(["arrival.studyArea", "arrival.studyAreaLimit"], studyLines),
          anchor: northEdgeAnchor(catchment, { lonBand: [-6.45, -6.3], outM: 2400 }),
        },
      ].map((b) => {
        const widthM = 15000;
        const heightM = (widthM * LINE_H * b.lines.length) / BOX_W;
        return { ...b, heightM, corners: groundCorners({ ...b.anchor, widthM, heightM }) };
      });

      let last = "";
      const place = () => {
        const at = (lon: number, lat: number) => {
          const p = m.project([lon, lat]);
          return { x: p.x, y: p.y };
        };
        // maplibre-gl 6.14.0 keeps the camera's transform on map._camera (typed, underscored); pinned version
        const t = m._camera.transform;
        const canvas = m.getCanvas();
        const w = canvas.clientWidth;
        const h = canvas.clientHeight;
        const placedGround = blocks.flatMap((b) => {
          const elev = (m.queryTerrainElevation([b.anchor.lon, b.anchor.lat]) ?? 0) + PLANE_LIFT_M;
          const q = b.corners.map(([lon, lat]) =>
            projectAt(t.modelViewProjectionMatrix, t.worldSize, lon, lat, elev, w, h),
          );
          const [tl, tr, br, bl] = q;
          if (!tl || !tr || !br || !bl) return [];
          const transform = quadMatrix3d(BOX_W, LINE_H * b.lines.length, tl, tr, br, bl);
          return [{ id: b.id, lines: b.lines, budget: b.budget, transform }];
        });
        const nextStems = [
          { id: "outlet", name: en["arrival.outlet"].text, ...at(OUTLET.lon, OUTLET.lat) },
          ...ARRIVAL_PLACES.map((p) => ({ id: p.id, name: p.name, ...at(p.lon, p.lat) })),
        ];
        // skip React work when nothing moved (render fires every frame)
        const key = JSON.stringify([placedGround.map((g) => g.transform), nextStems]);
        if (key === last) return;
        last = key;
        setStems(nextStems);
        setGround(placedGround);
      };
      place();
      // terrain tiles arriving change the heights the names and stems stand on, so follow every render
      m.on("render", place);
      m.once("idle", () => {
        setIdle(true);
        onIdle?.();
      });
    };

    const setup = async () => {
      const manifest = parseManifest(await (await fetch(manifestUrl)).json(), manifestUrl);
      const catchment = catchmentFeature(await (await fetch(manifest.catchment)).json());
      await document.fonts.load(`500 64px ${LABEL_FAMILY}`);
      const el = container.current;
      if (cancelled || !el) return;
      // a hidden or not yet laid out frame has no height; wait for one rather than fail
      if (el.clientHeight === 0) {
        await new Promise<void>((resolve) => {
          const ro = new ResizeObserver(() => {
            if (el.clientHeight > 0) {
              ro.disconnect();
              resolve();
            }
          });
          ro.observe(el);
        });
      }
      // the effect may have been cleaned up while waiting for a size
      if (stopped()) return;

      const cam = orbitToMapCamera(ARRIVAL_POSE, el.clientHeight);
      const m = new maplibregl.Map({
        container: el,
        style: valleyStyle({
          assets: {
            ...manifest,
            haze: { url: drawHaze(daylight.paper), coordinates: hazeCorners() },
          },
          catchment,
        }),
        center: cam.center,
        zoom: cam.zoom,
        pitch: cam.pitch,
        bearing: cam.bearing,
        maxPitch: 85,
        interactive: false,
        attributionControl: false,
        // the camera centre sits at the target's height, not clamped to the terrain below it
        centerClampedToGround: false,
      });
      map = m;
      m.setVerticalFieldOfView(cam.verticalFovDeg);
      m.once("load", () => {
        onLoad(m, cam, catchment);
        onMap?.(m);
      });
    };

    setup().catch((e: unknown) => {
      console.error("Stage: map setup failed", e);
      setFailed(true);
    });

    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [manifestUrl, onIdle, onMap]);

  return (
    <div className={styles.stage} data-stage-idle={idle ? "true" : "false"}>
      <div ref={container} className={styles.map} aria-hidden="true" />
      {(labels ? stems : []).map((s) =>
        s.id === "outlet" ? (
          <span
            key={s.id}
            className={styles.outletLabel}
            style={{ left: s.x, top: s.y }}
            aria-hidden="true"
            data-budget="land-label"
          >
            {s.name}
          </span>
        ) : (
          <span
            key={s.id}
            className={styles.stem}
            style={{ left: s.x, top: s.y }}
            aria-hidden="true"
          >
            <span className={styles.stemName} data-budget="land-label">
              {s.name}
            </span>
          </span>
        ),
      )}
      {(labels ? ground : []).map((g) => (
        <div
          key={g.id}
          className={styles.groundText}
          style={{ width: BOX_W, height: LINE_H * g.lines.length, transform: g.transform }}
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
      <ul className={styles.srOnly} aria-label={en["arrival.valleyName"].text}>
        <li>{en["arrival.region"].text}</li>
        <li>
          {format("arrival.studyArea", { area: STUDY_AREA_KM2 })}{" "}
          {en["arrival.studyAreaLimit"].text}
        </li>
        <li>{en["arrival.outlet"].text}</li>
        {ARRIVAL_PLACES.map((p) => (
          <li key={p.id}>{p.name}</li>
        ))}
        <li>{format("stage.relief", { factor: ARRIVAL_EXAGGERATION })}</li>
      </ul>
      {failed ? (
        <p className={styles.error} role="alert">
          {en["stage.mapFailed"].text}
        </p>
      ) : null}
    </div>
  );
}
