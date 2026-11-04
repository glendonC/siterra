"use client";

// When the land splits into its evidence sheets (lib/overview/scene/overview-stack): all through the thinking, and on
// the answer whenever Map Layers is pressed, until it is pressed again or Esc (lib/overview/run-mode.ts splitOpen). It
// never splits by itself: the land arrives settled, the answer's own layer lifted. The answer column never moves for
// it. A return from a view, or reduced motion, shows the end state at once.

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { splitOpen } from "../../lib/overview/run-mode";
import type { OverviewScene } from "../../lib/overview/scene/overview";

export function useLayerStack({
  sceneRef,
  go,
  ready,
  thinking,
  answer,
  returned,
  reducedMotion,
  keysBlocked,
}: {
  sceneRef: RefObject<OverviewScene | null>;
  /** Starts the page's frame loop (it runs while the scene says the sheets still move). */
  go: () => void;
  /** The land's data is loaded (its scene mounts in the same commit, just after this hook's effects). */
  ready: boolean;
  /** The thinking's steps are the screen. */
  thinking: boolean;
  /** The answer is the screen. */
  answer: boolean;
  /** The answer came back from a view: the land shows its end state at once. */
  returned: boolean;
  reducedMotion: RefObject<boolean>;
  /** Something else holds Esc now (the Ask, Sources, Limits, a view opening). */
  keysBlocked: boolean;
}) {
  const [mapOpen, setMapOpen] = useState(false);
  /** The return from a view has been shown (at once); later presses of Map Layers move again. */
  const returnShown = useRef(false);
  /** The scene last given a goal, and that goal, so a render that changes nothing leaves a motion alone. */
  const sent = useRef<{ scene: OverviewScene; open: boolean } | null>(null);
  const open = splitOpen({ ready, steps: thinking, answer, mapLayers: mapOpen });

  // Map Layers belongs to the answer: leaving the answer settles it
  useEffect(() => {
    if (!answer) setMapOpen(false);
  }, [answer]);

  // the goal, given once the scene stands (the page mounts it after this effect, so it may take a frame), and again
  // to a scene mounted anew
  useEffect(() => {
    if (!ready) return;
    let raf = 0;
    const give = () => {
      const scene = sceneRef.current;
      if (!scene) {
        raf = requestAnimationFrame(give);
        return;
      }
      const fresh = sent.current?.scene !== scene;
      // no motion: reduced motion; the answer as it comes back from a view; the overview going under a view; a scene
      // mounted anew under a split that already stood (one still waiting for the land to arrive rises as it would)
      const back = returned && answer && !returnShown.current;
      if (!answer) returnShown.current = false;
      else if (returned) returnShown.current = true;
      const remounted =
        fresh && sent.current !== null && !(sent.current.open && sent.current.scene.stackPending());
      const still = reducedMotion.current || back || (!answer && !thinking) || remounted;
      // a split asked for while the land was still arriving waits in the scene; the land now stands, so it starts
      if (!fresh && sent.current?.open === open) {
        if (scene.stackPending()) go();
        return;
      }
      sent.current = { scene, open };
      scene.setStack({ open, instant: still });
      go();
    };
    give();
    return () => {
      cancelAnimationFrame(raf);
    };
  });

  // Esc settles the split before it does anything else on the answer
  useEffect(() => {
    if (!mapOpen || keysBlocked) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== "Escape" || ev.metaKey || ev.ctrlKey || ev.altKey) return;
      ev.preventDefault();
      ev.stopImmediatePropagation();
      setMapOpen(false);
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => {
      window.removeEventListener("keydown", onKey, { capture: true });
    };
  }, [keysBlocked, mapOpen]);

  const toggle = useCallback(() => {
    setMapOpen((v) => !v);
  }, []);

  return { open, mapOpen, toggle };
}
