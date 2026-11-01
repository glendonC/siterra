// Pure HUD layout and formatting helpers for ValleyOverview.

import { format } from "../copy/en";
import { metres } from "../instruments/format";
import { WORLDCOVER } from "../instruments/valley/fixtures";
import { placeCard, type Box as CardBox, type Side as CardSide } from "./card";
import type { OverviewData } from "./data";
import { directionWord, sharesWords, type Finding, type FindingId } from "./findings";
import type { LiftId, OverviewLayout, Selection } from "./scene/overview";

/** An element's box on the 1440 x 900 stage (design px), through the stage's transform. */
export function toDesignRect(
  el: Element,
  hudEl: Element | null,
  scale: number,
): { left: number; top: number; right: number; bottom: number } {
  const h = hudEl?.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  const ox = h?.left ?? 0;
  const oy = h?.top ?? 0;
  return {
    left: (r.left - ox) / scale,
    top: (r.top - oy) / scale,
    right: (r.right - ox) / scale,
    bottom: (r.bottom - oy) / scale,
  };
}

/**
 * The record as D4's nodeHud placed it: the frost around the record, the dotted line from under the record
 * to the context with its caption at the midpoint.
 */
export function placeRecordDom(
  els: {
    rec: HTMLDivElement | null;
    inst: HTMLElement | null;
    link: HTMLAnchorElement | null;
    frost: HTMLDivElement | null;
    evid: HTMLElement | null;
    connector: SVGSVGElement | null;
    hud: HTMLDivElement | null;
  },
  cc: number,
  scale: number,
): void {
  const { rec, inst, link, frost, evid, connector: svg, hud } = els;
  if (!rec || !inst) return;
  rec.style.opacity = cc.toFixed(3);
  rec.style.visibility = cc > 0.001 ? "visible" : "hidden";
  const acts = link?.parentElement;
  if (acts) acts.style.pointerEvents = cc > 0.5 ? "auto" : "none";
  const ib = toDesignRect(inst, hud, scale);
  if (frost)
    Object.assign(frost.style, {
      // wide enough that the card's own edges sit in the dark middle of the frost, over any land
      left: `${(ib.left - 170).toFixed(1)}px`,
      top: `${(ib.top - 140).toFixed(1)}px`,
      width: `${(ib.right - ib.left + 340).toFixed(1)}px`,
      height: `${(ib.bottom - ib.top + 280).toFixed(1)}px`,
    });
  const linkParent = link?.parentElement ?? null;
  if (evid?.hidden && svg) {
    svg.style.visibility = "hidden";
  } else if (evid && linkParent && svg) {
    svg.style.visibility = "";
    const eb = toDesignRect(evid, hud, scale);
    const lb = toDesignRect(linkParent, hud, scale);
    const sx = eb.left + 20;
    const sy = lb.bottom + 8;
    const ey = eb.top - 8;
    svg
      .querySelector("path")
      ?.setAttribute("d", `M${sx.toFixed(1)} ${sy.toFixed(1)} L${sx.toFixed(1)} ${ey.toFixed(1)}`);
    const [c0, c1] = svg.querySelectorAll("circle");
    c0?.setAttribute("cx", sx.toFixed(1));
    c0?.setAttribute("cy", sy.toFixed(1));
    c1?.setAttribute("cx", sx.toFixed(1));
    c1?.setAttribute("cy", ey.toFixed(1));
  }
}

/**
 * Places the opened finding's card beside its anchor in the open half of the viewport clear of the 3D terrain (decision 14).
 */
export function placeCardDom(
  els: {
    inst: HTMLElement | null;
    evid: HTMLElement | null;
  },
  layout: OverviewLayout,
  selected: Selection | null,
  prevSide: CardSide | null,
): { box: CardBox | null; side: CardSide | null } {
  const { inst, evid: ev } = els;
  if (!selected || selected === "routes" || selected === "results") {
    return { box: null, side: null };
  }
  if (!inst || !layout.anchor) {
    return { box: null, side: prevSide };
  }
  const w = inst.offsetWidth;
  const h = inst.offsetHeight;
  const avoid = {
    x0: Math.min(layout.subject.x0, layout.landBox.x0),
    y0: Math.min(layout.subject.y0, layout.landBox.y0),
    x1: Math.max(layout.subject.x1, layout.landBox.x1),
    y1: Math.max(layout.subject.y1, layout.landBox.y1),
  };
  const { box: raw, side } = placeCard(layout.anchor, w, h, avoid, prevSide);
  const isRight = side === "right" || side === "upRight" || side === "downRight";
  const x0 = isRight
    ? Math.min(1400 - w, Math.max(raw.x0, avoid.x1 + 72, w > 560 ? 640 : 680))
    : Math.max(40, Math.min(raw.x1, avoid.x0 - 72, 680) - w);
  const eh = ev && !ev.hidden ? ev.offsetHeight : 0;
  const totalH = eh > 0 ? h + 20 + eh : h;
  const y0 = Math.max(110, Math.min(836 - totalH, Math.round((900 - totalH) * 0.44)));
  const box = { x0, y0, x1: x0 + w, y1: y0 + h };
  inst.style.left = `${box.x0.toFixed(1)}px`;
  inst.style.top = `${box.y0.toFixed(1)}px`;
  if (ev) {
    ev.style.left = `${box.x0.toFixed(1)}px`;
    ev.style.top = `${(box.y1 + 20).toFixed(1)}px`;
  }
  return { box, side };
}

/** A lifted layer's status, from the record: the cells read, the finding it carries, the band limits. */
export function formatLiftStatus(
  id: LiftId,
  findings: readonly Finding[],
  data: OverviewData | null,
  limits: readonly [number, number] | null,
): string {
  const shown = (f: FindingId) => findings.find((x) => x.id === f)?.display ?? "";
  const count = (n: number) => new Intl.NumberFormat("en").format(n);
  switch (id) {
    case "trend": {
      const fdr = findings.find((x) => x.id === "fdr");
      const n = count(data?.footprints.slope?.cells.length ?? 0);
      // the season as the trend asset states it
      const window = data?.footprints.slope?.window ?? "";
      return fdr?.pair
        ? format("overview.lift.trend.pair", { n, window, shares: sharesWords(fdr) })
        : format("overview.lift.trend", {
            n,
            window,
            share: shown("fdr"),
            direction: directionWord(fdr?.direction),
          });
    }
    case "rain":
      return format("overview.lift.rain", {
        n: count(data?.footprints.rain?.length ?? 0),
        r2: shown("rain"),
      });
    case "cover":
      return format("overview.lift.cover", { year: WORLDCOVER.year });
    case "bands":
      return limits
        ? format("overview.lift.bands", { lower: metres(limits[0]), upper: metres(limits[1]) })
        : "";
  }
}
