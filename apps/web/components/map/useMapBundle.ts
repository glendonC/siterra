"use client";

// Loads the map bundle once per page from the app's own origin (GET /api/map-assets), for the valley and
// the globe alike.

import { useEffect, useState } from "react";
import { loadMapBundle, type MapBundle } from "../../lib/map/bundle";

export type MapBundleState =
  { status: "loading" } | { status: "ready"; bundle: MapBundle } | { status: "failed" };

let pending: Promise<MapBundle> | undefined;

export function useMapBundle(): MapBundleState {
  const [state, setState] = useState<MapBundleState>({ status: "loading" });
  useEffect(() => {
    let live = true;
    pending ??= loadMapBundle((input) => fetch(input));
    pending
      .then((bundle) => {
        if (live) setState({ status: "ready", bundle });
      })
      .catch((e: unknown) => {
        console.error("Map bundle could not be read", e);
        pending = undefined;
        if (live) setState({ status: "failed" });
      });
    return () => {
      live = false;
    };
  }, []);
  return state;
}
