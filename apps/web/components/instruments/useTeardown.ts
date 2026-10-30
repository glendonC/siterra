"use client";

// The clock of a view opened in place over the overview's land (decisions 12 and 13): its first frame draws the land
// where the overview left it (`onDrawn`, so the overview can let go of it), then the view takes the land apart over
// `inS` seconds; with `back` it plays back over `backS` seconds and calls `onBack`. `onStood` comes once the view
// stands, so the chrome round it can come in. The scene is driven through `setIntro(k, from)`.

import { useCallback, useEffect, useRef, useState } from "react";
import type { LandPose } from "../../lib/land/handoff";

export interface Teardown {
  from: LandPose | null;
  back: boolean;
  onDrawn: () => void;
  onStood: () => void;
  onBack: () => void;
}

export interface TeardownScene {
  setIntro(k: number, from: LandPose): void;
}

/** Drives a scene's teardown; returns whether the view's own words should still wait, and a kick for a new scene. */
export function useTeardown(
  scene: { current: TeardownScene | null },
  teardown: Teardown | undefined,
  inS: number,
  backS: number,
): { tearing: boolean; kick: () => void } {
  const tearRef = useRef(teardown);
  tearRef.current = teardown;
  const k = useRef(teardown ? 0 : 1);
  const [tearing, setTearing] = useState(teardown !== undefined);
  const raf = useRef(0);
  const last = useRef(0);
  const drawn = useRef(false);
  const stood = useRef(false);
  const kick = useCallback(() => {
    if (raf.current) return;
    last.current = performance.now();
    const frame = (t: number) => {
      raf.current = 0;
      const s = scene.current;
      const T = tearRef.current;
      if (!s || !T?.from) return;
      const dt = Math.min(0.25, (t - last.current) / 1000);
      last.current = t;
      if (!drawn.current) {
        // the first frame: the land as the overview left it; then the overview can let go of it
        s.setIntro(0, T.from);
        drawn.current = true;
        T.onDrawn();
      } else if (T.back) {
        k.current = Math.max(0, k.current - dt / backS);
        s.setIntro(k.current, T.from);
        if (k.current === 0) {
          T.onBack();
          return;
        }
      } else if (k.current < 1) {
        k.current = Math.min(1, k.current + dt / inS);
        s.setIntro(k.current, T.from);
        if (k.current > 0.82 && !stood.current) {
          stood.current = true;
          setTearing(false);
          T.onStood();
        }
        if (k.current === 1) return;
      } else return;
      raf.current = requestAnimationFrame(frame);
    };
    raf.current = requestAnimationFrame(frame);
  }, [scene, inS, backS]);
  const from = teardown?.from ?? null;
  const back = teardown?.back ?? false;
  useEffect(() => {
    if (!from) return;
    if (back) {
      setTearing(true);
      stood.current = false;
    }
    kick();
  }, [from, back, kick]);
  useEffect(
    () => () => {
      cancelAnimationFrame(raf.current);
    },
    [],
  );
  return { tearing, kick };
}
