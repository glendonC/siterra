// What can be done with a thing on the land (decision 15): a short list beside it, on the same hairline leader as its
// card, each action with its key chip and also clickable. The list comes from what the record offers (the views its
// listing holds ready), at most three actions, Enter always the primary one, and the same letter for the same verb
// everywhere (L layers, P pixel, C cut, F field plan; E is the brief's export, which these views do not offer); Esc
// goes back where there is somewhere to go back from.

import type { MessageId } from "../copy/en";

export type ViewKind = "layers" | "cutaway" | "pixel" | "rainfall" | "field" | "time";

/** The instrument kind in the record's listing behind each view. */
export const VIEW_INSTRUMENT: Record<ViewKind, string> = {
  layers: "layer_stack",
  cutaway: "cross_section",
  pixel: "pixel_anatomy",
  rainfall: "rainfall_scatter",
  field: "field_plan",
  // See It Over Time (UI-2) is offered where the case holds a pixel seasons bundle, not by an instrument spec
  time: "",
};

export const VIEW_HREF: Record<ViewKind, string> = {
  layers: "/instruments/layers",
  cutaway: "/instruments/cutaway",
  pixel: "/instruments/pixel",
  rainfall: "/instruments/rainfall",
  field: "/instruments/field",
  time: "/instruments/time",
};

/** Each view's action, named by what the visitor will see (decision 13). */
export const VIEW_LABEL: Record<ViewKind, MessageId> = {
  layers: "overview.open.layers",
  cutaway: "overview.open.cutaway",
  pixel: "overview.open.pixel",
  rainfall: "overview.open.rainfall",
  field: "overview.open.field",
  time: "overview.open.time",
};

/** The letter for each view's verb, the same everywhere; a view without one is offered only as the primary. */
export const VIEW_KEY: Record<ViewKind, "L" | "C" | "P" | "F" | "T" | null> = {
  layers: "L",
  cutaway: "C",
  pixel: "P",
  rainfall: null,
  field: "F",
  time: "T",
};

/** A thing on the land: an opened finding's record, or a part under the cursor. */
export type Thing =
  | "catchment"
  | "fdr"
  | "band"
  | "pixel"
  | "rain"
  | "field"
  | "routes"
  | "results"
  | "land"
  | "route";

/** The views a thing leads to, its own first, then the next nearest. */
const LEADS: Record<Thing, readonly ViewKind[]> = {
  // the trend findings also lead to See It Over Time (UI-2, key T), second after their own view
  catchment: ["layers", "time", "cutaway"],
  fdr: ["layers", "time", "cutaway"],
  band: ["cutaway", "time", "layers"],
  pixel: ["pixel", "layers"],
  rain: ["rainfall", "layers"],
  field: ["field"],
  routes: ["field"],
  results: ["field"],
  land: ["layers", "cutaway"],
  route: ["field"],
};

export interface Action {
  /** The key chip: Enter for the primary action, the verb's letter, or Esc. */
  key: "Enter" | "L" | "C" | "P" | "F" | "T" | "Esc";
  /** The view it opens; null for Back. */
  view: ViewKind | null;
  label: MessageId;
}

/**
 * The actions for a thing: the first view the record offers as Enter, then one more offered view that has a letter,
 * then Back when `back` is set; at most three.
 */
export function actionsFor(thing: Thing, offered: ReadonlySet<ViewKind>, back: boolean): Action[] {
  const views = LEADS[thing].filter((v) => offered.has(v));
  const out: Action[] = [];
  const [first, ...rest] = views;
  if (first) out.push({ key: "Enter", view: first, label: VIEW_LABEL[first] });
  for (const v of rest) {
    const k = VIEW_KEY[v];
    if (k && out.length < 2) out.push({ key: k, view: v, label: VIEW_LABEL[v] });
  }
  if (back) out.push({ key: "Esc", view: null, label: "chrome.back" });
  return out.slice(0, 3);
}

/** The action a key press runs from a list, if any (Enter, or a letter in either case). */
export function actionForKey(actions: readonly Action[], key: string): Action | null {
  const k = key === "Enter" ? "Enter" : key.length === 1 ? key.toUpperCase() : key;
  return actions.find((a) => a.key === k && a.view !== null) ?? null;
}
