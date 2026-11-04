// Rain and Greenness's headline, read from the straight-line fit across the seasons: greenness rises or falls with
// rainfall from one season to the next where the 95% interval of the fit's slope lies wholly above or below zero, and
// follows it only weakly where the interval holds zero. It is about the seasons' ups and downs, not the greening over
// the years. Pure; the words are the catalog's (instrument.scatter.lead.*).

import type { MessageId } from "../../copy/en";
import type { ScatterData } from "./data";

export type RainLink = "rises" | "falls" | "weak";

export function rainLink(fit: Pick<ScatterData["fit"], "lower" | "upper">): RainLink {
  if (fit.lower > 0) return "rises";
  if (fit.upper < 0) return "falls";
  return "weak";
}

export const RAIN_LEAD: Record<RainLink, MessageId> = {
  rises: "instrument.scatter.lead.rises",
  falls: "instrument.scatter.lead.falls",
  weak: "instrument.scatter.lead.weak",
};
