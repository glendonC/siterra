"use client";

// What an instrument gives the shell around it: its sources (the drawn relief's exaggeration, said with the case's
// sources) and, for a 3D view, its reset and zoom. The shell draws them in the shared controls
// (components/controls/ScreenChrome). What the shell gives each instrument: the app's theme, for the colours a view
// draws itself (lib/theme/instruments.ts).

import { createContext, useContext, useEffect } from "react";
import {
  instrumentPalette,
  type AppTheme,
  type InstrumentPalette,
} from "../../lib/theme/instruments";
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

/** A view's 1440 x 900 stage keeps this left margin on the screen's own, so its words start under the breadcrumb. */
export const STAGE_MARGIN = 40;

/** The app's theme around the instrument: the overview's where it opened in place, else the visitor's saved one. */
export const ShellTheme = createContext<AppTheme>("light");

/** The colours a view draws itself (SVG, canvas, the 3D scene), in the shell's theme. */
export function useShellPalette(): InstrumentPalette {
  return instrumentPalette(useContext(ShellTheme));
}

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
