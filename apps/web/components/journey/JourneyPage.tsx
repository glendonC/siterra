"use client";

// Loads the globe manifest, then runs the sequence. The valley's manifest is loaded by the stage itself.

import { useEffect, useState } from "react";
import { en } from "../../lib/copy/en";
import type { GlobeAssets } from "../../lib/globe/grids";
import { parseGlobeManifest } from "../../lib/globe/manifest";
import { Journey } from "./Journey";

export function JourneyPage({
  manifestUrl,
  globeManifestUrl,
}: {
  manifestUrl: string;
  globeManifestUrl: string;
}) {
  const [globe, setGlobe] = useState<GlobeAssets | undefined>(undefined);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetch(globeManifestUrl)
      .then((r) => r.json())
      .then((raw: unknown) => {
        setGlobe(parseGlobeManifest(raw, globeManifestUrl));
      })
      .catch((e: unknown) => {
        console.error("Journey: globe manifest failed", e);
        setFailed(true);
      });
  }, [globeManifestUrl]);

  if (failed) return <p role="alert">{en["stage.mapFailed"].text}</p>;
  if (!globe) return null;
  return <Journey manifestUrl={manifestUrl} globeAssets={globe} />;
}
