"use client";

// What an instrument gives the shell around it: its sources (every credit in full, and the data's short names) and,
// for a 3D view, its reset and zoom. The shell draws them in the shared controls (components/controls/ScreenChrome).

import { createContext, useContext, useEffect } from "react";
import type { SourceSet } from "../controls/ScreenChrome";

export interface ViewHandle {
  reset: () => void;
  zoomBy: (factor: number) => void;
}

export interface ShellSlots {
  setSources: (s: SourceSet | null) => void;
  setView: (v: ViewHandle | null) => void;
}

export const ShellContext = createContext<ShellSlots>({
  setSources: () => undefined,
  setView: () => undefined,
});

/** Registers an instrument's sources with its shell while it is shown. */
export function useShellSources(sources: SourceSet | null) {
  const { setSources } = useContext(ShellContext);
  const key = sources ? JSON.stringify(sources) : "";
  useEffect(() => {
    setSources(key ? (JSON.parse(key) as SourceSet) : null);
    return () => {
      setSources(null);
    };
  }, [key, setSources]);
}

/** Registers a 3D instrument's reset and zoom with its shell while it is shown. */
export function useShellView(view: ViewHandle | null) {
  const { setView } = useContext(ShellContext);
  useEffect(() => {
    setView(view);
    return () => {
      setView(null);
    };
  }, [view, setView]);
}
