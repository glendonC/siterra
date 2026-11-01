"use client";

import type { CaseSnapshot, InstrumentListing } from "@siterra/contracts";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type RefObject,
} from "react";
import { instrumentOf } from "../../lib/instruments/listing";
import { VIEW_HREF, type ViewKind } from "../../lib/overview/actions";
import { buildOverviewSourceSet } from "../../lib/overview/credits";
import { loadOverviewData, type OverviewData } from "../../lib/overview/data";
import { fallbackRecordData, loadValleyOverviewData } from "../../lib/overview/terrain";
import type { Finding, FindingId } from "../../lib/overview/findings";
import {
  mountOverview,
  type LiftId,
  type OverviewLayout,
  type OverviewScene,
  type Selection,
} from "../../lib/overview/scene/overview";
import { loadRecord, type RecordData } from "../../lib/overview/record-data";
import { inBundleOrder, loadRoutesRecord } from "../../lib/overview/routes";
import { placesFrom, type Place } from "../../lib/instruments/valley/context";
import { loadScanTimingSummary, timeSourcesOf, type ScanTimingSummary } from "../../lib/time/load";
import type { RoutesLoad } from "./OverviewRoutes";
import type { Live } from "./useOverviewLayoutApply";

const ASK_R = 56;

export interface UseOverviewSceneDataArgs {
  snapshot: CaseSnapshot;
  listing: InstrumentListing;
  findings: readonly Finding[];
  findingsRef: MutableRefObject<readonly Finding[]>;
  bandLimitM: number | null;
  sel: Selection | null;
  selRef: MutableRefObject<Selection | null>;
  landRef: RefObject<HTMLCanvasElement | null>;
  arcRef: RefObject<HTMLCanvasElement | null>;
  blurRef: RefObject<HTMLCanvasElement | null>;
  rootRef: RefObject<HTMLDivElement | null>;
  sceneRef: MutableRefObject<OverviewScene | null>;
  lastLayout: MutableRefObject<OverviewLayout | null>;
  raf: MutableRefObject<number>;
  live: MutableRefObject<Live>;
  camRef: MutableRefObject<{ zoom: number; turn: number }>;
  lifeRef: MutableRefObject<{
    on: boolean;
    points: Parameters<OverviewScene["setLife"]>[0];
    focus: number | null;
    ring: number | null;
  }>;
  lifeOn: boolean;
  lifeBundle: string | null;
  liftOrder: MutableRefObject<LiftId[]>;
  offeredRef: MutableRefObject<Set<ViewKind>>;
  openRef: MutableRefObject<(href: string) => boolean>;
  onSettled: (() => void) | undefined;
  apply: (layout: OverviewLayout) => void;
  go: () => void;
}

export function useOverviewSceneData(args: UseOverviewSceneDataArgs) {
  const {
    snapshot,
    listing,
    findings,
    findingsRef,
    bandLimitM,
    sel,
    selRef,
    landRef,
    arcRef,
    blurRef,
    rootRef,
    sceneRef,
    lastLayout,
    raf,
    live,
    camRef,
    lifeRef,
    lifeOn,
    lifeBundle,
    liftOrder,
    offeredRef,
    openRef,
    onSettled,
    apply,
    go,
  } = args;

  const layers = instrumentOf(listing, "layer_stack");
  const pixel = instrumentOf(listing, "pixel_anatomy") ?? null;

  const [data, setData] = useState<OverviewData | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    liftOrder.current = data
      ? [
          ...(data.footprints.slope ? (["trend"] as const) : []),
          ...(data.footprints.rain ? (["rain"] as const) : []),
          "cover" as const,
          ...(data.bands ? (["bands"] as const) : []),
        ]
      : [];
  }, [data, liftOrder]);

  const sources = useRef({ layers, pixel, snapshot });
  sources.current = { layers, pixel, snapshot };
  const landKey = JSON.stringify([
    snapshot.case.id,
    layers?.spec.id,
    layers?.spec.revision,
    pixel?.spec.id,
    pixel?.spec.revision,
  ]);

  useEffect(() => {
    const { layers: lyr, pixel: pxl, snapshot: snap } = sources.current;
    const ac = new AbortController();
    setFailed(false);
    const isDynamicCase =
      !lyr ||
      snap.case.id.startsWith("case_loc_") ||
      snap.records.dataBundleRecords.some((b) => b.id.startsWith("bundle_loc_")) ||
      (lyr.spec.parameters.kind === "layer_stack" &&
        lyr.spec.parameters.relief.bundleId.startsWith("bundle_loc_"));
    const promise = isDynamicCase
      ? loadValleyOverviewData(snap, ac.signal)
      : loadOverviewData(lyr, pxl, snap, undefined, ac.signal).catch(() =>
          loadValleyOverviewData(snap, ac.signal),
        );
    promise.then(
      (d) => {
        if (ac.signal.aborted) return;
        setFailed(false);
        setData(d);
      },
      (e: unknown) => {
        if (ac.signal.aborted) return;
        console.error("Overview not loaded", e);
        setFailed(true);
      },
    );
    return () => {
      ac.abort();
    };
  }, [landKey]);

  const settled = useRef(onSettled);
  settled.current = onSettled;
  const timeAtArrival = useRef(false);

  useEffect(() => {
    if (!failed || timeAtArrival.current || window.location.pathname !== VIEW_HREF.time) return;
    timeAtArrival.current = true;
    window.history.replaceState(null, "", `/valley${window.location.search}`);
  }, [failed]);

  useEffect(() => {
    if (failed) settled.current?.();
  }, [failed]);

  const arcKey = findings.map((f) => `${f.id}@${String(f.clock)}`).join(" ");

  useEffect(() => {
    const land = landRef.current;
    const arc = arcRef.current;
    const blur = blurRef.current;
    if (!data || !land || !arc || !blur) return;
    let scene: OverviewScene;
    try {
      scene = mountOverview(
        { land, arc, blur },
        data,
        findingsRef.current.map((f) => ({ id: f.id, clock: f.clock })),
        bandLimitM,
      );
    } catch (e) {
      console.error("Overview not drawn", e);
      setFailed(true);
      return;
    }
    sceneRef.current = scene;
    scene.setLife(lifeRef.current.points);
    scene.onLayout(apply);
    scene.render({ ...live.current, ...camRef.current, sel: selRef.current });
    scene
      .measureGaps()
      .then((g) => {
        const root = rootRef.current;
        const at = lastLayout.current;
        if (!root || !at) return;
        root.dataset.arcGap = g.arc.toFixed(1);
        root.dataset.askGap = (g.distanceAt(at.ask) - ASK_R).toFixed(1);
        root.dataset.ready = "";
        settled.current?.();
        if (!timeAtArrival.current && window.location.pathname === VIEW_HREF.time) {
          timeAtArrival.current = true;
          if (offeredRef.current.has("time") && !selRef.current) openRef.current(VIEW_HREF.time);
          else window.history.replaceState(null, "", `/valley${window.location.search}`);
        }
      })
      .catch((e: unknown) => {
        console.error("Overview gaps not measured", e);
      });
    return () => {
      cancelAnimationFrame(raf.current);
      raf.current = 0;
      sceneRef.current = null;
      scene.dispose();
    };
  }, [data, arcKey, bandLimitM, apply]);

  useEffect(() => {
    go();
  }, [findings, go]);

  const [recordData, setRecordData] = useState<Partial<Record<FindingId, RecordData>>>({});
  useEffect(() => {
    setRecordData({});
  }, [listing.caseRevision]);

  useEffect(() => {
    if (
      !sel ||
      sel === "field" ||
      sel === "results" ||
      sel === "routes" ||
      sel === "package" ||
      sel === "time" ||
      recordData[sel]
    )
      return;
    const id = sel;
    const isDynamic =
      snapshot.case.id.startsWith("case_loc_") ||
      snapshot.records.dataBundleRecords.some((b) => b.id.startsWith("bundle_loc_"));
    if (isDynamic) {
      setRecordData((m) => ({ ...m, [id]: fallbackRecordData(id, snapshot) }));
      return;
    }
    const ac = new AbortController();
    loadRecord(id, listing, snapshot, data?.pixel?.series ?? null, undefined, ac.signal).then(
      (r) => {
        const fb = fallbackRecordData(id, snapshot);
        const hasContent = r.chart !== null || r.scatter !== null || r.context !== null;
        setRecordData((m) => ({
          ...m,
          [id]: hasContent ? { ...r, context: r.context ?? fb.context } : fb,
        }));
      },
      (e: unknown) => {
        if (ac.signal.aborted) return;
        console.error("Record not loaded", e);
        setRecordData((m) => ({ ...m, [id]: fallbackRecordData(id, snapshot) }));
      },
    );
    return () => {
      ac.abort();
    };
  }, [sel, recordData, listing, snapshot, data]);

  const [routesLoad, setRoutesLoad] = useState<RoutesLoad>({ status: "loading" });
  const [scanTiming, setScanTiming] = useState<ScanTimingSummary | null>(null);
  const caseId = snapshot.case.id;

  useEffect(() => {
    const src = timeSourcesOf(snapshot);
    if (!src) return;
    const ac = new AbortController();
    loadScanTimingSummary(caseId, src.seasons, (i, init) => fetch(i, init), ac.signal).then(
      setScanTiming,
      () => {
        if (ac.signal.aborted) return;
      },
    );
    return () => {
      ac.abort();
    };
  }, [caseId, snapshot]);

  useEffect(() => {
    if (!data?.routes.length) return;
    const ac = new AbortController();
    setRoutesLoad({ status: "loading" });
    loadRoutesRecord(caseId, data.routes, undefined, ac.signal).then(
      (record) => {
        setRoutesLoad({ status: "ready", record });
      },
      (e: unknown) => {
        if (ac.signal.aborted) return;
        console.error("Routes not loaded", e);
        setRoutesLoad({ status: "failed" });
      },
    );
    return () => {
      ac.abort();
    };
  }, [caseId, data]);

  useEffect(() => {
    go();
  }, [sel, recordData, routesLoad, scanTiming, go]);

  const origin = useMemo((): Place | null => {
    if (routesLoad.status !== "ready") return null;
    try {
      return placesFrom(snapshot, [routesLoad.record.cost.originId])[0] ?? null;
    } catch {
      return null;
    }
  }, [routesLoad, snapshot]);

  const routeNumber = useMemo(() => {
    const order = routesLoad.status === "ready" ? routesLoad.record.order : undefined;
    return new Map(inBundleOrder(data?.routes ?? [], order).map((r, i) => [r.id, i + 1]));
  }, [data, routesLoad]);

  const named = sel === "routes" ? origin : null;
  const lifeCredit =
    lifeOn && lifeBundle
      ? (snapshot.records.dataBundleRecords.find((b) => b.id === lifeBundle) ?? null)
      : null;
  const sourceSet = useMemo(
    () => buildOverviewSourceSet(snapshot, named, lifeCredit),
    [snapshot, named, lifeCredit],
  );

  return {
    layers,
    data,
    failed,
    recordData,
    routesLoad,
    scanTiming,
    origin,
    routeNumber,
    sourceSet,
  };
}
