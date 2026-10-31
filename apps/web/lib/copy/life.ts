// Recorded life on the land (UI-2): the layer's words, a sibling of en.ts with the same Message shape and lint
// (life.test.ts runs it). Every name, number, date, dataset and licence it shows is a field of the stored GBIF records;
// these are only the labels around them. A record says an organism was recorded here: never presence, abundance or
// change, and a period is the years the records span, never a season. No place name.

import type { Message } from "./en";

export const lf = {
  "life.layer": { text: "Recorded Life", kind: "heading" },
  "life.region": { text: "Where living things were recorded on this land", kind: "ui" },
  "life.limit": { text: "Recorded here, not presence or abundance.", kind: "ui", honesty: true },
  "life.summary": { text: "{records} records at {points} points, {from} to {to}", kind: "label" },
  "life.fossils": { text: "Not drawn: {n} fossil specimens", kind: "label", honesty: true },
  "life.fossilOne": { text: "Not drawn: 1 fossil specimen", kind: "label", honesty: true },
  "life.kicker": { text: "Recorded here", kind: "label", honesty: true },
  "life.point": { text: "{records} records, {species} species, {years}", kind: "label" },
  "life.pointOne": { text: "1 record, {years}", kind: "label" },
  "life.years": { text: "{from} to {to}", kind: "label" },
  "life.noYear": { text: "year not stated", kind: "label", honesty: true },
  "life.within": { text: "Location within about {d}", kind: "label", honesty: true },
  "life.unstated": { text: "Location uncertainty not stated", kind: "label", honesty: true },
  "life.datasets": { text: "From {n} datasets, {licences}", kind: "label" },
  "life.datasetOne": { text: "From 1 dataset, {licences}", kind: "label" },
  "life.dataset": { text: "From {title}, {publisher}", kind: "label" },
  "life.when": { text: "{basis}, {date}", kind: "label" },
  "life.terms": { text: "{licence}. {location}", kind: "label" },
  "life.of": { text: "{n} of {total}", kind: "label" },
  "life.read": { text: "Read the Records", kind: "button" },
  "life.next": { text: "Next Record", kind: "button" },
  "life.close": { text: "Back", kind: "button" },
  "life.group.bird": { text: "Bird", kind: "label" },
  "life.group.plant": { text: "Plant", kind: "label" },
  "life.group.insect": { text: "Insect", kind: "label" },
  "life.group.other": { text: "Other life", kind: "label" },
  "life.group.mixed": { text: "Several groups", kind: "label" },
  "life.basis.HUMAN_OBSERVATION": { text: "Human observation", kind: "label" },
  "life.basis.MACHINE_OBSERVATION": { text: "Machine observation", kind: "label" },
  "life.basis.PRESERVED_SPECIMEN": { text: "Preserved specimen", kind: "label" },
  "life.basis.LIVING_SPECIMEN": { text: "Living specimen", kind: "label" },
  "life.basis.MATERIAL_SAMPLE": { text: "Material sample", kind: "label" },
  "life.basis.MATERIAL_CITATION": { text: "Material citation", kind: "label" },
  "life.basis.OBSERVATION": { text: "Observation", kind: "label" },
  "life.basis.OCCURRENCE": { text: "Occurrence", kind: "label" },
  "life.license.CC-BY-4.0": { text: "CC BY 4.0", kind: "label" },
  "life.license.CC0-1.0": { text: "CC0 1.0", kind: "label" },
} as const satisfies Record<string, Message>;

export type LifeMessageId = keyof typeof lf;

export function lformat(id: LifeMessageId, values: Record<string, string | number> = {}): string {
  return lf[id].text.replace(/\{(\w+)\}/g, (whole, key: string) =>
    key in values ? String(values[key]) : whole,
  );
}

/** A record's basis of record or licence in words, else the record's own code as it stands. */
export function lifeTerm(kind: "basis" | "license", code: string): string {
  const id = `life.${kind}.${code}`;
  return id in lf ? lf[id as LifeMessageId].text : code;
}

/** A stated uncertainty in metres, as the card says it: metres under a kilometre, else km to one decimal. */
export function distanceShown(m: number): string {
  if (m < 1000) return `${String(Math.round(m))} m`;
  const km = Math.round(m / 100) / 10;
  return `${km.toLocaleString("en-US")} km`;
}
