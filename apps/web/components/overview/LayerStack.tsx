"use client";

// The land's layer labels: one per sheet off the land, at its right edge, in the thinking trace's land label style:
// the layer's name, what it shows with the words at the two ends of its scale, and the explanation it bears on with
// the record's verdict (lib/overview/layers). While the land stands split the labels make one column right of the
// stack, each on a hairline to its sheet, the lit sheet's line in the accent; settled, the one lifted layer keeps its
// label beside the land. Placed every frame from the scene's layout in CSS px, outside the scaled stage, so the text
// keeps its size at every window size. The labels belong to the answer and the steps: none shows while a view stands
// open, in place or by its own address, and they are back at once when the answer is. Nothing here is interactive.

import { useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from "react";
import {
  labelOf,
  placeLabels,
  STACK_ORDER,
  type ExplanationVerdict,
  type LayerLabel,
  type StackLayer,
  type Theme,
} from "../../lib/overview/layers";
import { SNOW_MONTH } from "../../lib/overview/layers-data";
import type { OverviewLayout, StackLayout } from "../../lib/overview/scene/overview";
import styles from "./LayerStack.module.css";

export interface LayerStackHandle {
  /** Places the labels for one frame's layout. */
  place(layout: OverviewLayout): void;
}

/** The middle of a label's name row under its top (CSS px): its padding and half its line. */
const NAME_ROW = 7 + 17 / 2;

/**
 * Neither the answer nor the steps are the screen: a view is opening in place (the overview's root is handing its land
 * over), or one stands by its own address over the overview (Year by Year), which then holds neither.
 */
const underView = (root: Element | null): boolean =>
  root !== null &&
  (root.hasAttribute("data-tearing") ||
    (!root.hasAttribute("data-readout") && !root.hasAttribute("data-at-work")));

type Facts = StackLayout["facts"];
const factsKey = (f: Facts) =>
  `${f.trendWindow ?? ""}|${f.rain.window ?? ""}|${String(f.rain.amounts)}`;

function Label({ label }: { label: LayerLabel }) {
  const e = label.explanation;
  return (
    <>
      <b className={styles.name}>{label.name}</b>
      {label.what !== null ? <span className={styles.line}>{label.what}</span> : null}
      {label.scale ? (
        <span className={styles.line}>
          <span>{label.scale.low}</span>
          <i
            className={styles.ramp}
            style={{ background: `linear-gradient(90deg, ${label.scale.stops.join(", ")})` }}
          />
          <span>{label.scale.high}</span>
        </span>
      ) : null}
      {label.classes ? (
        <span className={styles.line}>
          {label.classes.map((c) => (
            <span key={c.word} className={styles.class}>
              <i className={styles.patch} style={{ background: c.colour }} />
              {c.word}
            </span>
          ))}
        </span>
      ) : null}
      {label.role !== null ? <span className={styles.line}>{label.role}</span> : null}
      {e ? (
        <span className={styles.line}>
          <i className={styles.dot} data-status={e.status} />
          {e.named ? <span className={styles.explanation}>{e.label}</span> : null}
          <span className={styles.verdict} data-status={e.status}>
            {e.verdict}
          </span>
        </span>
      ) : null}
    </>
  );
}

export function LayerStack({
  ref,
  theme,
  explanations,
}: {
  ref?: Ref<LayerStackHandle>;
  theme: Theme;
  /** The record's explanations with their verdicts (the answer's own rows); none while the record holds none. */
  explanations: readonly ExplanationVerdict[];
}) {
  const [facts, setFacts] = useState<Facts | null>(null);
  const factsRef = useRef("");
  const labelRefs = useRef(new Map<StackLayer, HTMLDivElement>());
  const leaderRefs = useRef(new Map<StackLayer, SVGLineElement>());
  const endRefs = useRef(new Map<StackLayer, SVGCircleElement>());
  const shownRef = useRef(new Set<StackLayer>());
  const layerRef = useRef<HTMLDivElement>(null);
  /** The last frame's layout, to put the labels back at once when the answer comes back from a view. */
  const lastLayout = useRef<OverviewLayout | null>(null);
  const placeRef = useRef<(layout: OverviewLayout) => void>(() => undefined);

  const labels = useMemo(
    () =>
      facts
        ? STACK_ORDER.map((id) =>
            labelOf(id, {
              theme,
              trendWindow: facts.trendWindow,
              rain: facts.rain,
              snowMonth: SNOW_MONTH,
              explanations,
            }),
          )
        : [],
    [explanations, facts, theme],
  );

  const hideAll = () => {
    for (const id of shownRef.current) {
      const el = labelRefs.current.get(id);
      if (el) el.style.visibility = "hidden";
      leaderRefs.current.get(id)?.style.setProperty("visibility", "hidden");
      endRefs.current.get(id)?.style.setProperty("visibility", "hidden");
    }
    shownRef.current = new Set();
  };

  // a view opening or standing hides the labels the moment the root says so, whether or not the land draws a frame;
  // the answer coming back shows them again where the last frame placed them
  useEffect(() => {
    const root = layerRef.current?.closest("[data-overview-root]") ?? null;
    if (!root) return;
    const watch = new MutationObserver(() => {
      if (underView(root)) hideAll();
      else if (lastLayout.current) placeRef.current(lastLayout.current);
    });
    watch.observe(root, {
      attributes: true,
      attributeFilter: ["data-tearing", "data-readout", "data-at-work"],
    });
    return () => {
      watch.disconnect();
    };
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      place(layout) {
        placeRef.current(layout);
      },
    }),
    [],
  );

  placeRef.current = (layout: OverviewLayout) => {
    lastLayout.current = layout;
    const st = layout.stack;
    const key = factsKey(st.facts);
    if (key !== factsRef.current) {
      factsRef.current = key;
      setFacts(st.facts);
    }
    if (underView(layerRef.current?.closest("[data-overview-root]") ?? null)) {
      hideAll();
      return;
    }
    const { fit } = layout;
    const css = (p: { x: number; y: number }) => ({
      x: fit.ox + p.x * fit.scale,
      y: fit.oy + p.y * fit.scale,
    });
    const root = labelRefs.current.values().next().value?.offsetParent;
    const vw = root instanceof HTMLElement ? root.clientWidth : window.innerWidth;
    const vh = root instanceof HTMLElement ? root.clientHeight : window.innerHeight;
    const now = st.sheets.filter((s) => s.shown > 0.001 && labelRefs.current.has(s.id));
    const keep = new Set(now.map((s) => s.id));
    for (const id of shownRef.current) {
      if (keep.has(id)) continue;
      const el = labelRefs.current.get(id);
      if (el) el.style.visibility = "hidden";
      leaderRefs.current.get(id)?.style.setProperty("visibility", "hidden");
      endRefs.current.get(id)?.style.setProperty("visibility", "hidden");
    }
    shownRef.current = keep;
    if (!now.length) return;

    const column = st.k > 0 || st.open;
    const placed = now.map((s) => {
      const el = labelRefs.current.get(s.id) as HTMLDivElement;
      return { s, el, h: el.offsetHeight, at: css(s.at) };
    });
    // one column right of the land and every sheet, each name level with its sheet's edge where it can be
    const { x, tops } = placeLabels(placed, {
      landRight: css({ x: st.box.x1, y: 0 }).x,
      width: vw,
      height: vh,
      row: NAME_ROW,
    });
    placed.forEach((p, n) => {
      const top = tops[n] ?? 0;
      p.el.style.visibility = "visible";
      p.el.style.transform = `translate(${x.toFixed(1)}px, ${top.toFixed(1)}px)`;
      p.el.style.opacity = p.s.shown.toFixed(3);
      p.el.toggleAttribute("data-lit", p.s.lit && column);
      const leader = leaderRefs.current.get(p.s.id);
      const end = endRefs.current.get(p.s.id);
      if (leader) {
        leader.setAttribute("x1", (p.at.x + 3).toFixed(1));
        leader.setAttribute("y1", p.at.y.toFixed(1));
        leader.setAttribute("x2", (x - 6).toFixed(1));
        leader.setAttribute("y2", (top + NAME_ROW).toFixed(1));
        leader.style.visibility = "visible";
        leader.style.opacity = p.s.shown.toFixed(3);
        leader.toggleAttribute("data-lit", p.s.lit && column);
      }
      if (end) {
        end.setAttribute("cx", p.at.x.toFixed(1));
        end.setAttribute("cy", p.at.y.toFixed(1));
        end.style.visibility = "visible";
        end.style.opacity = p.s.shown.toFixed(3);
        end.toggleAttribute("data-lit", p.s.lit && column);
      }
    });
  };

  // the label sits on the inverse of the page's ground (the trace's land label), so inside it the tokens of the other
  // theme give its dots and words their contrast; its own ground and ink are the page theme's, set on the layer
  return (
    <div ref={layerRef} className={styles.layer} aria-hidden="true" data-layer-stack>
      <svg className={styles.leaders}>
        {labels.map((l) => (
          <g key={l.id}>
            <line
              ref={(el) => {
                if (el) leaderRefs.current.set(l.id, el);
                else leaderRefs.current.delete(l.id);
              }}
              className={styles.leader}
            />
            <circle
              ref={(el) => {
                if (el) endRefs.current.set(l.id, el);
                else endRefs.current.delete(l.id);
              }}
              className={styles.end}
              r={2.2}
            />
          </g>
        ))}
      </svg>
      {labels.map((l) => (
        <div
          key={l.id}
          ref={(el) => {
            if (el) labelRefs.current.set(l.id, el);
            else labelRefs.current.delete(l.id);
          }}
          className={styles.label}
          data-sheet={l.id}
          data-theme={theme === "obsidian" ? "light" : "obsidian"}
        >
          <Label label={l} />
        </div>
      ))}
    </div>
  );
}
