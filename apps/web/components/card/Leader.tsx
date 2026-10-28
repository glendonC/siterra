"use client";

// Draws the one leader from the card's anchoring line to its place on the land. The target is a screen
// point the stage projected; the leader is decoration for sighted readers (the card text says the place).

import { useLayoutEffect, useState } from "react";
import {
  leaderGeometry,
  type LeaderEnd,
  type LeaderGeometry,
  type Point,
} from "../../lib/card/leader";
import styles from "./Leader.module.css";

export interface LeaderProps {
  target: Point | undefined;
  end: LeaderEnd;
  /** Changing the key redraws the leader after the card's arrival, for a new step. */
  stepKey: string;
}

function measure(target: Point, end: LeaderEnd): LeaderGeometry | undefined {
  const card = document.querySelector<HTMLElement>("[data-budget=card]");
  const anchor = card?.querySelector<HTMLElement>("[data-leader-anchor]");
  if (!card || !anchor) return undefined;
  return leaderGeometry(
    card.getBoundingClientRect().left,
    anchor.getBoundingClientRect().top,
    target,
    end,
  );
}

export function Leader({ target, end, stepKey }: LeaderProps) {
  const [geo, setGeo] = useState<LeaderGeometry | undefined>(undefined);

  useLayoutEffect(() => {
    if (!target) {
      setGeo(undefined);
      return;
    }
    const update = () => {
      setGeo(measure(target, end));
    };
    update();
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("resize", update);
    };
  }, [target, end, stepKey]);

  if (!geo) return null;
  return (
    <svg className={styles.overlay} aria-hidden="true" key={stepKey} data-budget="leader">
      <path className={styles.line} d={geo.d} pathLength={1} />
      {geo.dot ? <circle className={styles.dot} cx={geo.dot.x} cy={geo.dot.y} r={3} /> : null}
      {geo.tick ? <path className={styles.tick} d={geo.tick} /> : null}
    </svg>
  );
}
