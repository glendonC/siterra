// What the overview opens on, and when its land splits into its layers. The globe's start opens the overview in run
// mode (?mode=run), which shows analysis steps only when there is a run to show: the place's own recorded run, or a
// question sent from here. A place with neither lands on its own answer, as a plain visit does, never on its land
// waiting for steps that will not come. The land splits only while the steps are the screen (the analysis reading its
// layers) or while Map Layers is open on the answer: never by itself, on arrival or on a plain visit.

import type { AskStatus } from "./ask-line";

/** Where a question sent from here stands (AskStatus), or null when none was sent. */
export type Sent = AskStatus["state"] | null;

/**
 * Whether the overview opens on the analysis steps rather than on the place's answer: in run mode, with a recording of
 * the place's own run to play, or a question sent from here that is at work or answered. A question that could not
 * run leaves nothing to wait for.
 */
export function opensOnSteps({
  runMode,
  recording,
  sent,
}: {
  runMode: boolean;
  recording: boolean;
  sent: Sent;
}): boolean {
  return runMode && (recording || sent === "working" || sent === "answered");
}

/**
 * Whether the land stands split into its layers: while the analysis steps are the screen, or while Map Layers is open
 * on the answer, once the land is loaded.
 */
export function splitOpen({
  ready,
  steps,
  answer,
  mapLayers,
}: {
  ready: boolean;
  steps: boolean;
  answer: boolean;
  mapLayers: boolean;
}): boolean {
  return ready && (steps || (answer && mapLayers));
}
