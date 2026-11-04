"use client";

import type { CaseSnapshot, InstrumentListing } from "@siterra/contracts";
import { useCallback, useEffect, type Dispatch, type RefObject, type SetStateAction } from "react";
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
  selRef: RefObject<Selection | null>;
  nextSelRef: RefObject<{ sel: Selection; then: () => void } | null>;
  findingsRef: RefObject<readonly Finding[]>;
  bandLimitDisplay: string;
  pkgHandoff: RefObject<boolean>;
  open: (id: Selection) => void;
  /** Back on the answer at once, with everything a view moved put back. */
  answerNow: () => void;
  setRainWide: Dispatch<SetStateAction<boolean>>;
  tearRef: RefObject<TearState | null>;
  setTear: Dispatch<SetStateAction<TearState | null>>;
  reducedMotion: RefObject<boolean>;
  splitRef: RefObject<{ dir: -1 | 0 | 1; k: number }>;
  exitRef: RefObject<{ dir: -1 | 0 | 1; k: number; away: number; narrow: boolean }>;
  goal: RefObject<Live>;
  go: () => void;
  openRef: RefObject<(href: string) => boolean>;
  rootRef: RefObject<HTMLDivElement | null>;
}

export function useOverviewTearInPlace(args: UseOverviewTearInPlaceArgs) {
  const {
    rootRef,
    selRef,
    nextSelRef,
    findingsRef,
    bandLimitDisplay,
    pkgHandoff,
    open,
    answerNow,
    setRainWide,
    tearRef,
    setTear,
    reducedMotion,
    splitRef,
    exitRef,
    goal,
    go,
    openRef,
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
      // one view at a time, and none while another is still opening
      if (!kind || tearRef.current || nextSelRef.current) return false;
      // the view's own opening plays as it always has (answerNow held the chrome's fades off for the way back)
      rootRef.current?.removeAttribute("data-back");
      if (kind === "time") {
        if (selRef.current === "time") {
          goTo(href);
          return true;
        }
        // the answer steps away at once, the land turns to its resting view, then the seasons open on it
        pkgHandoff.current = true;
        const then = () => {
          open("time");
          pkgHandoff.current = false;
          goTo(href);
        };
        if (!selRef.current || reducedMotion.current) {
          selRef.current = null;
          then();
        } else {
          nextSelRef.current = { sel: "time", then };
          goal.current.s = 0;
          go();
        }
        return true;
      }
      if (kind === "rainfall" && selRef.current === "rain") {
        setRainWide(true);
        goTo(href);
        return true;
      }
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
          // a view left before it showed stays left
          const t = tearRef.current;
          if (t?.kind !== kind || t.shown) return;
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
      rootRef,
      selRef,
      nextSelRef,
      pkgHandoff,
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
    const t = tearRef.current;
    if (!t) return;
    setTear((p) => (p ? { ...p, shown: true } : p));
    goTo(VIEW_HREF[t.kind]);
  }, [setTear, tearRef]);

  const onStackStood = useCallback(() => {
    setTear((p) => (p ? { ...p, stood: true } : p));
  }, [setTear]);

  // every way back from a view (Esc, its breadcrumb, the browser's Back) lands on the answer at once: the view is
  // gone in the same frame and nothing plays back over the answer
  const backInPlace = useCallback(() => {
    if (tearRef.current) answerNow();
  }, [tearRef, answerNow]);

  useEffect(() => {
    const onPop = () => {
      const t = tearRef.current;
      const path = window.location.pathname;
      if (t) {
        if (path !== VIEW_HREF[t.kind]) answerNow();
        return;
      }
      if ((selRef.current === "time" || nextSelRef.current) && path !== VIEW_HREF.time) {
        answerNow();
        return;
      }
      if (Object.values<string>(VIEW_HREF).includes(path)) openRef.current(path);
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
    };
  }, [answerNow, tearRef, selRef, nextSelRef, openRef]);

  return {
    openInPlace,
    backInPlace,
    onStackDrawn,
    onStackStood,
    onStackBack: backInPlace,
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
  onToggleTheme,
}: {
  /** The overview's own theme switch, so switching on the view switches the overview behind it too. */
  onToggleTheme?: (() => void) | undefined;
  tear: TearState;
  snapshot: CaseSnapshot;
  listing: InstrumentListing;
  backInPlace: () => void;
  onStackDrawn: () => void;
  onStackStood: () => void;
  onStackBack: () => void;
  cellPaint: CellPaint;
  cellPaintRef: RefObject<CellPaint>;
  setCellPaint: Dispatch<SetStateAction<CellPaint>>;
  go: () => void;
  lastLayout: RefObject<OverviewLayout | null>;
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
    <div className={className} data-kind={tear.kind} data-shown={tear.shown ? "" : undefined}>
      <InstrumentShell
        current={tear.kind}
        records={{ snapshot, listing }}
        onBack={backInPlace}
        tearing={!tear.stood}
        finding={tear.crumb ?? undefined}
        {...(onToggleTheme ? { onToggleTheme } : {})}
      >
        {viewOf()}
      </InstrumentShell>
    </div>
  );
}
