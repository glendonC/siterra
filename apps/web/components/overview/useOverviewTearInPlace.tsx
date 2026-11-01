"use client";

import type { CaseSnapshot, InstrumentListing } from "@siterra/contracts";
import {
  useCallback,
  useEffect,
  type Dispatch,
  type MutableRefObject,
  type RefObject,
  type SetStateAction,
} from "react";
import type { LandPose } from "../../lib/land/handoff";
import { InstrumentLayerStack } from "../instruments/InstrumentLayerStack";
import { InstrumentCutaway } from "../instruments/InstrumentCutaway";
import { InstrumentFieldPlan } from "../instruments/InstrumentFieldPlan";
import { InstrumentPixelAnatomy } from "../instruments/InstrumentPixelAnatomy";
import { InstrumentRainfallScatter } from "../instruments/InstrumentRainfallScatter";
import { InstrumentShell } from "../instruments/InstrumentShell";
import { VIEW_HREF, type ViewKind } from "../../lib/overview/actions";
import type { Finding } from "../../lib/overview/findings";
import type { OverviewLayout, Point, Selection } from "../../lib/overview/scene/overview";
import type { CellPaint } from "../../lib/instruments/pixel/paint";
import { crumbOf } from "./FindingMark";
import { goTo } from "./useOverviewControls";
import type { Live } from "./useOverviewLayoutApply";

export interface TearState {
  kind: Exclude<ViewKind, "time">;
  crumb: string | null;
  from: LandPose | null;
  shown: boolean;
  back: boolean;
  stood: boolean;
  cut: boolean;
}

export interface UseOverviewTearInPlaceArgs {
  selRef: MutableRefObject<Selection | null>;
  findingsRef: MutableRefObject<readonly Finding[]>;
  bandLimitDisplay: string;
  pkgHandoff: MutableRefObject<boolean>;
  back: () => void;
  open: (id: Selection) => void;
  setRainWide: Dispatch<SetStateAction<boolean>>;
  tearRef: MutableRefObject<TearState | null>;
  setTear: Dispatch<SetStateAction<TearState | null>>;
  reducedMotion: MutableRefObject<boolean>;
  splitRef: MutableRefObject<{ dir: -1 | 0 | 1; k: number }>;
  exitRef: MutableRefObject<{ dir: -1 | 0 | 1; k: number; away: number; narrow: boolean }>;
  goal: MutableRefObject<Live>;
  go: () => void;
  openRef: MutableRefObject<(href: string) => boolean>;
  backRef: MutableRefObject<() => void>;
}

export function useOverviewTearInPlace(args: UseOverviewTearInPlaceArgs) {
  const {
    selRef,
    findingsRef,
    bandLimitDisplay,
    pkgHandoff,
    back,
    open,
    setRainWide,
    tearRef,
    setTear,
    reducedMotion,
    splitRef,
    exitRef,
    goal,
    go,
    openRef,
    backRef,
  } = args;

  const crumbNow = useCallback(
    (): string | null =>
      selRef.current ? crumbOf(selRef.current, findingsRef.current, bandLimitDisplay) : null,
    [selRef, findingsRef, bandLimitDisplay],
  );

  const openInPlace = useCallback(
    (href: string): boolean => {
      const kind =
        (Object.keys(VIEW_HREF) as ViewKind[]).find((k) => VIEW_HREF[k] === href) ?? null;
      if (kind === "time") {
        const fromSel = selRef.current;
        pkgHandoff.current = true;
        if (fromSel && fromSel !== "time") back();
        const tryOpen = () => {
          if (selRef.current) {
            window.setTimeout(tryOpen, 60);
            return;
          }
          open("time");
          pkgHandoff.current = false;
          goTo(href);
        };
        tryOpen();
        return true;
      }
      if (kind === "rainfall" && selRef.current === "rain") {
        setRainWide(true);
        goTo(href);
        return true;
      }
      if (!kind || tearRef.current) return false;
      if (reducedMotion.current) {
        setTear({
          kind,
          crumb: crumbNow(),
          from: null,
          shown: true,
          back: false,
          stood: true,
          cut: true,
        });
        goTo(href);
        return true;
      }
      if (kind === "pixel") {
        setTear({
          kind,
          crumb: crumbNow(),
          from: null,
          shown: false,
          back: false,
          stood: true,
          cut: false,
        });
        splitRef.current = { dir: 1, k: 0 };
        go();
        return true;
      }
      if (kind === "rainfall" || kind === "field") {
        setTear({
          kind,
          crumb: crumbNow(),
          from: null,
          shown: false,
          back: false,
          stood: true,
          cut: false,
        });
        window.setTimeout(() => {
          setTear((p) => (p ? { ...p, shown: true } : p));
          goTo(href);
        }, 260);
        go();
        return true;
      }
      setTear({
        kind,
        crumb: crumbNow(),
        from: null,
        shown: false,
        back: false,
        stood: false,
        cut: false,
      });
      exitRef.current = { dir: 1, k: 0, away: exitRef.current.away, narrow: kind === "layers" };
      goal.current.s = 0;
      go();
      return true;
    },
    [
      selRef,
      pkgHandoff,
      back,
      open,
      setRainWide,
      tearRef,
      reducedMotion,
      setTear,
      crumbNow,
      splitRef,
      go,
      exitRef,
      goal,
    ],
  );

  openRef.current = openInPlace;

  const onStackDrawn = useCallback(() => {
    setTear((p) => (p ? { ...p, shown: true } : p));
    const t = tearRef.current;
    goTo(t ? VIEW_HREF[t.kind] : VIEW_HREF.layers);
  }, [setTear, tearRef]);

  const onStackStood = useCallback(() => {
    setTear((p) => (p ? { ...p, stood: true } : p));
  }, [setTear]);

  const backInPlace = useCallback(() => {
    const t = tearRef.current;
    if (!t) return;
    if (t.cut) {
      setTear(null);
      goTo("/valley");
      return;
    }
    if (t.kind === "rainfall" || t.kind === "field") {
      setTear({ ...t, shown: false, back: true });
      window.setTimeout(() => {
        setTear(null);
        goTo("/valley");
        go();
      }, 450);
      return;
    }
    if (t.kind === "pixel") {
      setTear({ ...t, shown: false, back: true });
      window.setTimeout(() => {
        splitRef.current = { dir: -1, k: splitRef.current.k };
        go();
      }, 450);
      return;
    }
    setTear({ ...t, back: true, stood: false });
  }, [tearRef, setTear, go, splitRef]);

  const onStackBack = useCallback(() => {
    exitRef.current = { ...exitRef.current, dir: -1, k: 1 };
    setTear(null);
    goTo("/valley");
    go();
  }, [exitRef, setTear, go]);

  useEffect(() => {
    const onPop = () => {
      const t = tearRef.current;
      const path = window.location.pathname;
      if (t) {
        if (path !== VIEW_HREF[t.kind]) backInPlace();
        return;
      }
      if (selRef.current === "time" && path !== VIEW_HREF.time) {
        backRef.current();
        return;
      }
      if (Object.values<string>(VIEW_HREF).includes(path)) openRef.current(path);
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
    };
  }, [backInPlace, tearRef, selRef, backRef, openRef]);

  return {
    openInPlace,
    backInPlace,
    onStackDrawn,
    onStackStood,
    onStackBack,
  };
}

export function OverviewInPlaceInstrument({
  tear,
  snapshot,
  listing,
  backInPlace,
  onStackDrawn,
  onStackStood,
  onStackBack,
  cellPaint,
  cellPaintRef,
  setCellPaint,
  go,
  lastLayout,
  hudRef,
  className,
}: {
  tear: TearState;
  snapshot: CaseSnapshot;
  listing: InstrumentListing;
  backInPlace: () => void;
  onStackDrawn: () => void;
  onStackStood: () => void;
  onStackBack: () => void;
  cellPaint: CellPaint;
  cellPaintRef: MutableRefObject<CellPaint>;
  setCellPaint: Dispatch<SetStateAction<CellPaint>>;
  go: () => void;
  lastLayout: MutableRefObject<OverviewLayout | null>;
  hudRef: RefObject<HTMLDivElement | null>;
  className: string | undefined;
}) {
  const td = tear.cut
    ? {}
    : {
        teardown: {
          from: tear.from,
          back: tear.back,
          onDrawn: onStackDrawn,
          onStood: onStackStood,
          onBack: onStackBack,
        },
      };

  const viewOf = () => {
    switch (tear.kind) {
      case "layers":
        return <InstrumentLayerStack {...td} />;
      case "cutaway":
        return <InstrumentCutaway {...td} />;
      case "pixel":
        return tear.cut ? (
          <InstrumentPixelAnatomy />
        ) : (
          <InstrumentPixelAnatomy
            around={{
              paint: cellPaint,
              onPaint: (p) => {
                cellPaintRef.current = p;
                setCellPaint(p);
                go();
              },
              pixelBox: () => {
                const L = lastLayout.current;
                const h = hudRef.current?.getBoundingClientRect();
                const b = L?.pixelBox;
                if (!L || !h || !b) return null;
                const k = L.fit.scale;
                return {
                  x0: h.left + b.x0 * k,
                  y0: h.top + b.y0 * k,
                  x1: h.left + b.x1 * k,
                  y1: h.top + b.y1 * k,
                };
              },
              anchors: () => {
                const L = lastLayout.current;
                const h = hudRef.current?.getBoundingClientRect();
                if (!L?.pixelPlace || !L.pixelCells || !h) return null;
                const k = L.fit.scale;
                const at = (p: Point): [number, number] => [h.left + p.x * k, h.top + p.y * k];
                return {
                  place: L.pixelPlace.map(at),
                  cells: L.pixelCells.map(at),
                  field: L.field ? [at(L.field)] : L.pixelPlace.map(at),
                };
              },
            }}
          />
        );
      case "rainfall":
        return <InstrumentRainfallScatter />;
      default:
        return <InstrumentFieldPlan />;
    }
  };

  return (
    <div
      className={className}
      data-kind={tear.kind}
      data-shown={tear.shown ? "" : undefined}
    >
      <InstrumentShell
        current={tear.kind}
        records={{ snapshot, listing }}
        onBack={backInPlace}
        tearing={!tear.stood}
        finding={tear.crumb ?? undefined}
      >
        {viewOf()}
      </InstrumentShell>
    </div>
  );
}
