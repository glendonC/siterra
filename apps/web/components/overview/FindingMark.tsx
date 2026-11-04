"use client";

// What the overview says of an opened finding outside its card: its crumb, and the words it leaves on the land. The
// findings' own marks round the arc are gone: the answer took the resting land's place as the overview's home.

import { en, format, type MessageId } from "../../lib/copy/en";
import { rd } from "../../lib/copy/readout";
import { VIEW_LABEL } from "../../lib/overview/actions";
import type { OverviewData } from "../../lib/overview/data";
import { sharesWords, type Finding } from "../../lib/overview/findings";
import type { Selection } from "../../lib/overview/scene/overview";

/** What the card says of the land while a finding is open: only the trend map's rule, when its asset was read. */
export function onLandOf(sel: Selection, data: OverviewData | null): string | null {
  // The lit terrain shows its footprint and hover names it; only the trend map's statistical rule stays in words.
  if (sel === "fdr") return data?.footprints.slope ? en["overview.onLand.fdrRule"].text : null;
  return null;
}

/** The last crumb while something is open: the finding's own number with a few words, or what opened. */
export function crumbOf(sel: Selection, findings: readonly Finding[], bandLimit: string): string {
  const f = findings.find((x) => x.id === sel);
  switch (sel) {
    case "field":
      return en["overview.crumb.field"].text;
    case "routes":
      return en["overview.crumb.routes"].text;
    case "results":
      return en["overview.crumb.results"].text;
    case "package":
      return rd["readout.group.ground"].text;
    case "time":
      return en[VIEW_LABEL.time].text;
    case "band":
      return format("overview.crumb.band", { value: f?.display ?? "", limit: bandLimit });
    case "catchment":
      if (f?.missingReason) return f.display;
      return format("overview.crumb.catchment", { value: f?.display ?? "" });
    case "rain":
      if (f?.headline) return `${f.display} per decade rainfall`;
      return format("overview.crumb.rain", { value: f?.display ?? "" });
    case "fdr":
      return f ? sharesWords(f) : "";
    default:
      return format(`overview.crumb.${sel}` as MessageId, { value: f?.display ?? "" });
  }
}
