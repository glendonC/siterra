"use client";

// The departure layer for the case as its records stand: the binding from the snapshot, then the display
// grid and the cropland layer from that bundle revision's own manifest (served under its content hash).

import type { CaseSnapshot } from "@siterra/contracts";
import { useEffect, useMemo, useState } from "react";
import {
  departureBinding,
  departureLegend,
  parseDepartureManifest,
  type DepartureManifest,
} from "../../lib/map/departure";
import type { DepartureMapLayer } from "../../lib/stage/departure-layers";

export function useDepartureLayer(snapshot: CaseSnapshot, on: boolean) {
  const binding = useMemo(() => (on ? departureBinding(snapshot) : undefined), [snapshot, on]);
  const manifestUri = binding?.bundle.manifestUri;
  const [read, setRead] = useState<{ uri: string; manifest: DepartureManifest }>();
  useEffect(() => {
    if (!manifestUri) return;
    let live = true;
    fetch(manifestUri, { credentials: "same-origin" })
      .then((r) => {
        if (!r.ok) throw new Error(`Departure manifest: ${String(r.status)}`);
        return r.json() as Promise<unknown>;
      })
      .then((raw) => {
        if (live) setRead({ uri: manifestUri, manifest: parseDepartureManifest(raw, manifestUri) });
      })
      .catch((e: unknown) => {
        console.error("The departure layer's manifest could not be read", e);
      });
    return () => {
      live = false;
    };
  }, [manifestUri]);
  const manifest = read?.uri === manifestUri ? read?.manifest : undefined;
  const imageUri = binding?.imageUri;
  const layer = useMemo<DepartureMapLayer | undefined>(
    () =>
      imageUri && manifest
        ? { imageUri, corners: manifest.corners, excludedUri: manifest.excludedUri }
        : undefined,
    [imageUri, manifest],
  );
  const legend = useMemo(
    () =>
      binding && manifest
        ? departureLegend(
            binding,
            manifest.domain,
            manifest.excludedUri !== undefined,
            manifest.cellM,
            manifest.minReferenceYears,
          )
        : undefined,
    [binding, manifest],
  );
  return { binding, layer, legend };
}
