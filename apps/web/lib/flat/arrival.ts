// Read flat for arrival: the same facts the land, the command line and the instruments show, as text.

import type { FlatSection } from "./types";
import { en, format } from "../copy/en";

export interface ArrivalFlatInput {
  question: string;
  areaKm2: string;
  /** Villages and the outlet from the case's ContextFeature records, and their credit line. */
  places: readonly { name: string }[];
  outlet: boolean;
  /** The credit line's addition and each point's credit in its record's words. */
  placeCredit: string;
  placeCredits: readonly { name: string; attribution: string }[];
  reliefFactor: number;
}

export function arrivalFlat(i: ArrivalFlatInput): FlatSection[] {
  return [
    {
      heading: en["flat.question"].text,
      lines: [i.question],
    },
    {
      heading: en["flat.place"].text,
      lines: [
        `${en["arrival.valleyName"].text}, ${en["arrival.region"].text}`,
        `${format("arrival.studyArea", { area: i.areaKm2 })}. ${en["arrival.studyAreaLimit"].text}`,
        ...(i.outlet ? [en["arrival.outlet"].text] : []),
        ...i.places.map((p) => p.name),
      ],
    },
    {
      heading: en["flat.notes"].text,
      lines: [format("stage.relief", { factor: i.reliefFactor }), en["stage.imagery"].text],
    },
    {
      heading: en["flat.sources"].text,
      lines: [
        en["credit.terrain"].text,
        en["credit.rainfall"].text,
        en["credit.imagery"].text,
        ...(i.placeCredit ? [i.placeCredit] : []),
        ...i.placeCredits.map((c) => `${c.name}: ${c.attribution}`),
      ],
    },
  ];
}
