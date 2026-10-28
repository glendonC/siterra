"use client";

// Draws the one leader from the card's anchoring line to its place on the land. The target is a screen
// point the stage projected; the leader is decoration for sighted readers (the card text says the place).

import { useLayoutEffect, useState } from "react";
import {
  LEADER_ANCHOR_DY,
  LEADER_RUN_PX,
  leaderGeometry,
  nearestOnOutline,
  type LeaderGeometry,
  type Point,
} from "../../lib/card/leader";
import styles from "./Leader.module.css";

export interface LeaderProps {
  /** A located thing: the leader ends on it with a dot. */
  target?: Point;
  /** The whole area: the leader ends on the projected outline, at the point nearest where it turns. */
  outline?: Point[];
  /** Changing the key redraws the leader after the card's arrival, for a new step. */
  stepKey: string;
}

function measure(
  target: Point | undefined,
  outline: Point[] | undefined,
): LeaderGeometry | undefined {
  const card = document.querySelector<HTMLElement>("[data-budget=card]");
  const anchor = card?.querySelector<HTMLElement>("[data-leader-anchor]");
  if (!card || !anchor) return undefined;
  const left = card.getBoundingClientRect().left;
  const top = anchor.getBoundingClientRect().top;
  if (target) return leaderGeometry(left, top, target, "dot");
  const end = outline
    ? nearestOnOutline(outline, { x: left - LEADER_RUN_PX, y: top + LEADER_ANCHOR_DY })
    : undefined;
  return end ? leaderGeometry(left, top, end, "tick") : undefined;
}

export function Leader({ target, outline, stepKey }: LeaderProps) {
  const [geo, setGeo] = useState<LeaderGeometry | undefined>(undefined);

  useLayoutEffect(() => {
    const update = () => {
      setGeo(measure(target, outline));
    };
    update();
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("resize", update);
    };
  }, [target, outline, stepKey]);

  if (!geo) return null;
  return (
    <svg className={styles.overlay} aria-hidden="true" key={stepKey} data-budget="leader">
      <path className={styles.line} d={geo.d} pathLength={1} />
      {geo.dot ? <circle className={styles.dot} cx={geo.dot.x} cy={geo.dot.y} r={3} /> : null}
      {geo.tick ? <path className={styles.tick} d={geo.tick} /> : null}
    </svg>
  );
}
