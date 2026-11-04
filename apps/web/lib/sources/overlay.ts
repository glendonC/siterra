// The Sources and Limits overlay (S and W) from the case record alone: each dataset the case measured with, once, with
// its credits and licences whole and its link; every publication the case holds, with its link; and the limits the
// record states, in plain words under four headings (lib/sources/limits.ts), with the coverage its measurements leave
// counted from them. Nothing here is written for a place; every name, figure and credit is a record field or a count
// of records. Pure; components/controls/SourcesOverlay.tsx draws it.

import type { CaseSnapshot, Measurement } from "@siterra/contracts";
import { en } from "../copy/en";
import { DATASET_ORDER, datasetTerm, sc, sformat, type SourcesMessageId } from "../copy/sources";
import { timeSourcesOf } from "../time/load";
import { linesSaying, PLAIN, withoutIds, type SectionId, type TopicId } from "./limits";

export interface DatasetEntry {
  datasetId: string;
  /** What it measured ("Rainfall"). */
  measured: string;
  /** Its name, with the version when every one of its bundles states the same one ("CHIRPS v3.0"). */
  name: string;
  /** The resolution most of its measurements were made at and the years they span ("5 km, 2019 to 2025"). */
  detail: string | null;
  /** Its credits, then its licences, each whole and once, in the record's words; a link inside stays in place. */
  credits: string[];
  /** The case's own page for the dataset, when no credit above already links to it. */
  link: { title: string; url: string } | null;
}

export interface PublicationEntry {
  sourceId: string;
  /** The authors and the year, or the publisher and the year when the record names no author. */
  cite: string;
  title: string;
  /** Where it was published, when the cite names authors. */
  venue: string | null;
  url: string;
}

export interface LimitTopic {
  id: string;
  /** The topic's name; null for the record's own lines that no plain line says. */
  label: string | null;
  lines: string[];
}

export interface LimitSection {
  id: SectionId;
  heading: string;
  topics: LimitTopic[];
}

export interface OverlayView {
  datasets: DatasetEntry[];
  /** Credits of what the map draws that no dataset carries: a place's name, a village's point, an outlet's input. */
  mapCredits: string[];
  lead: { ink: string; grey: string };
  publications: PublicationEntry[];
  /** What Siterra does not do and what the map does not show beside; the data and the analysis in the main column. */
  limits: { side: LimitSection[]; main: LimitSection[] };
}

/** The latest revision of each record; a superseded or rejected one no longer speaks for the case. */
function current<T extends { id: string; revision: number; status?: string }>(
  rows: readonly T[],
): T[] {
  const by = new Map<string, T>();
  for (const r of rows) {
    const had = by.get(r.id);
    if (!had || had.revision < r.revision) by.set(r.id, r);
  }
  return [...by.values()].filter((r) => r.status !== "superseded" && r.status !== "rejected");
}

const t = (id: SourcesMessageId) => sc[id].text;

/** The first and last year a measurement covers: its source period, else its period ID ("period_2000-2025_mar_jun"). */
function yearsOf(m: Measurement): [number, number] | null {
  const p = m.source?.period;
  if (p) return [Number(p.start.slice(0, 4)), Number(p.end.slice(0, 4))];
  const id = /^period_(\d{4})(?:-(\d{4})|-\d{2})?(?:_[a-z]{3}_[a-z]{3})?$/.exec(m.periodId);
  if (!id?.[1]) return null;
  return [Number(id[1]), Number(id[2] ?? id[1])];
}

const span = (from: number, to: number) =>
  from === to ? String(from) : sformat("sources.period", { from, to });

/** The most frequent value; a tie goes to the smaller, the finer resolution. */
function modeOf(values: readonly number[]): number | null {
  const n = new Map<number, number>();
  for (const v of values) n.set(v, (n.get(v) ?? 0) + 1);
  let best: number | null = null;
  let most = 0;
  for (const [v, c] of n) {
    if (c > most || (c === most && best !== null && v < best)) {
      best = v;
      most = c;
    }
  }
  return best;
}

const resolutionWords = (m: number) =>
  m < 1000
    ? sformat("sources.res.m", { n: Math.round(m) })
    : sformat("sources.res.km", { n: Math.round(m / 100) / 10 });

/** The resolution and years of a dataset's available measurements, at the resolution most of them share. */
function detailOf(measurements: readonly Measurement[]): string | null {
  const ok = measurements.filter((m) => m.status === "available");
  const res = modeOf(
    ok.flatMap((m) => (m.spatialResolutionM === null ? [] : [m.spatialResolutionM])),
  );
  const years = (res === null ? ok : ok.filter((m) => m.spatialResolutionM === res)).flatMap(
    (m) => yearsOf(m) ?? [],
  );
  const period = years.length ? span(Math.min(...years), Math.max(...years)) : null;
  const r = res === null ? null : resolutionWords(res);
  if (r && period) return sformat("sources.detail", { res: r, period });
  return r ?? period;
}

/** A dataset version as the rows write it: a release number with a "v" ("v6.1"), a year or a tag as it stands. */
const versionWords = (v: string) =>
  /^\d{1,3}(\.\d+)+$/.test(v) ? sformat("sources.v", { version: v }) : v;

/** A source's venue: its publisher without the publisher's own name in closing brackets (lib/overview/record.ts). */
const venueOf = (publisher: string | null) =>
  publisher ? publisher.replace(/\s*\([^()]*\)\s*$/, "").trim() || null : null;

/** The authors as the record lists them, the first three and "et al." after them when there are more. */
function authorsOf(authors: readonly string[]): string {
  const named = authors.filter((a) => !/^et al\.?$/i.test(a.trim()));
  const shown = named.slice(0, 3).join(", ");
  const more = named.length > 3 || named.length < authors.length;
  return shown && more ? sformat("sources.etAl", { authors: shown }) : shown;
}

/** Rows grouped by a key, each group in record order. */
function groupBy<T>(rows: readonly T[], key: (row: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row);
    const list = out.get(k);
    if (list) list.push(row);
    else out.set(k, [row]);
  }
  return out;
}

const tokens = (text: string) => new Set(text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []);

/** Every word of `a` is in `b`: `a` says nothing `b` does not ("ESA WorldCover: CC BY 4.0" in its full credit). */
const within = (a: Set<string>, b: Set<string>) => [...a].every((w) => b.has(w));

/** A credit or licence field cut at the "; " the record joins credits with; a "; " inside brackets stays. */
function topLevelClauses(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let from = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "(") depth++;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    else if (ch === ";" && depth === 0 && /\s/.test(text[i + 1] ?? "")) {
      parts.push(text.slice(from, i));
      from = i + 1;
    }
  }
  parts.push(text.slice(from));
  return parts;
}

/**
 * The whole credits of a field. A clause with no name of its own continues the credit before it ("all rights
 * reserved", "see https://www.gbif.org/citation-guidelines."). What only the record reads goes: a usage label before a
 * notice ("outlet input © OpenStreetMap contributors"), a bracket naming a file, a source ID or a use in lower case
 * ("(analysis geometry)"), and a note on the case's own steps ("a private step ...; the software is not part of this
 * bundle"). A bare word such as "other" names nothing and is no credit.
 */
export function creditsIn(text: string | null): string[] {
  if (!text) return [];
  const out: string[] = [];
  for (const raw of topLevelClauses(text)) {
    const clause = raw
      .trim()
      .replace(/^(?:\p{Ll}+\s){1,3}(?=©|\p{Lu}\p{Ll}*\p{Lu})/u, "")
      .replace(
        /\s*\((?:[^()]*\.(?:md|json|pdf|zip|csv|tif)\b[^()]*|[^()]*\bSCI-\d+[^()]*|[\p{Ll}\s]+)\)/gu,
        "",
      )
      .trim();
    if (!clause) continue;
    const last = out.length - 1;
    if (last >= 0 && /^\p{Ll}+\s/u.test(clause) && !clause.includes("©"))
      out[last] = `${out[last] ?? ""}; ${clause}`;
    else out.push(clause);
  }
  return out.filter((c) => /[\p{Lu}\p{N}©]/u.test(c) && !/\b(?:bundle|private step)\b/i.test(c));
}

/** Credits once each: a copy that starts a sentence is kept, and a credit every word of which another says goes. */
function onceEach(credits: readonly string[], besides: readonly Set<string>[] = []): string[] {
  const byKey = new Map<string, string>();
  for (const c of credits) {
    const key = c.toLowerCase();
    const had = byKey.get(key);
    if (had === undefined || (/^\p{Ll}/u.test(had) && /^\p{Lu}/u.test(c))) byKey.set(key, c);
  }
  const all = [...byKey.values()];
  const words = all.map(tokens);
  return all.filter((_, i) => {
    const mine = words[i] ?? new Set<string>();
    // another says every word of this one and more, or the same words and comes first
    const elsewhere = words.some(
      (other, j) => j !== i && within(mine, other) && (j < i || !within(other, mine)),
    );
    return !elsewhere && !besides.some((other) => within(mine, other));
  });
}

/** The months of a set of monthly period IDs as a run of the calendar ("December", "March"), or null when they skip. */
function monthRun(periodIds: Iterable<string>): { from: string; to: string } | null {
  const months = new Set<number>();
  for (const p of periodIds) {
    const m = /^period_\d{4}-(\d{2})$/.exec(p);
    if (m?.[1]) months.add(Number(m[1]) - 1);
  }
  if (months.size === 0 || months.size === 12) return null;
  for (const start of months) {
    if (months.has((start + 11) % 12)) continue;
    let n = 0;
    while (months.has((start + n) % 12)) n++;
    if (n !== months.size) return null;
    const word = (i: number) => en[`month.${MONTH_KEYS[i] ?? "jan"}`].text;
    return { from: word(start), to: word((start + n - 1) % 12) };
  }
  return null;
}

const MONTH_KEYS = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
] as const;

/** The share of the area every reason states as its policy ("(policy 70%)"), when they all state the same one. */
function policyOf(reasons: readonly (string | null)[]): string | null {
  const found = new Set<string>();
  for (const r of reasons) {
    const m = /policy (\d+(?:\.\d+)?)%|(\d+(?:\.\d+)?)% coverage policy/.exec(r ?? "");
    const value = m?.[1] ?? m?.[2];
    if (!value) return null;
    found.add(value);
  }
  return found.size === 1 ? ([...found][0] ?? null) : null;
}

const BUNDLE_STATUS: Partial<Record<string, SourcesMessageId>> = {
  missing: "sources.bundle.missing",
  failed: "sources.bundle.failed",
  processing: "sources.bundle.processing",
};

/** A bundle's label without the method ID and version the record closes it with ("(pixel_seasons 1.0.0)"). */
const labelWords = (label: string) =>
  label.replace(/\s*\([a-z][a-z0-9]*(?:_[a-z0-9]+)+(?:\s+[\d.]+)?\)\s*$/, "").trim();

export function overlayView(snapshot: CaseSnapshot): OverlayView {
  const r = snapshot.records;

  // the data the case measured with: every dataset a validated bundle of the case was computed from
  const bundles = current(r.dataBundleRecords);
  const used = bundles.filter((b) => b.status === "validated");
  const byDataset = groupBy(used, (b) => b.datasetId);
  const known: readonly string[] = DATASET_ORDER;
  const order = [
    ...known.filter((id) => byDataset.has(id)),
    ...[...byDataset.keys()].filter((id) => !known.includes(id)),
  ];
  const measurementsOf = groupBy(current(r.measurementRecords), (m) => m.dataBundleId);
  const features = current(r.contextFeatureRecords ?? []);

  // each credit goes to the dataset whose name it says most of, one whose bundles carry it first among equals; with
  // no name said, to the first dataset that carries it. The map's own features carry theirs too, and a credit no
  // dataset carries or names is the map's
  const MAP = "\u0000map"; // no dataset ID: the record's IDs hold no control character
  const nameWords = new Map(order.map((id) => [id, tokens(datasetTerm("name", id))]));
  const carriers = new Map<
    string,
    { text: string; licence: boolean; by: Set<string>; feature: number }
  >();
  const carry = (text: string | null, by: string, licence: boolean, feature = -1) => {
    for (const c of creditsIn(text)) {
      const key = c.toLowerCase();
      const had = carriers.get(key);
      if (had) {
        had.by.add(by);
        if (/^\p{Ll}/u.test(had.text) && /^\p{Lu}/u.test(c)) had.text = c;
      } else carriers.set(key, { text: c, licence, by: new Set([by]), feature });
    }
  };
  for (const licence of [false, true]) {
    for (const b of used) carry(licence ? b.license : b.attribution, b.datasetId, licence);
    features.forEach((f, i) => {
      const by = f.datasetId && byDataset.has(f.datasetId) ? f.datasetId : MAP;
      carry(licence ? f.license : f.attribution, by, licence, i);
    });
  }
  const creditsOf = new Map<string, { credits: string[]; licences: string[] }>();
  const mapOwn: { text: string; licence: boolean; feature: number }[] = [];
  for (const { text, licence, by, feature } of carriers.values()) {
    const words = tokens(text);
    const scoreOf = (id: string) =>
      [...(nameWords.get(id) ?? [])].filter((w) => words.has(w)).length;
    const best = Math.max(0, ...order.map(scoreOf));
    const named = order.filter((id) => best > 0 && scoreOf(id) === best);
    const owner =
      named.find((id) => by.has(id)) ?? named[0] ?? order.find((id) => by.has(id)) ?? MAP;
    if (owner === MAP) {
      mapOwn.push({ text, licence, feature });
      continue;
    }
    const list = creditsOf.get(owner) ?? { credits: [], licences: [] };
    (licence ? list.licences : list.credits).push(text);
    creditsOf.set(owner, list);
  }

  // the case's own page for a dataset: an official dataset source whose title says the dataset's name
  const sources = current(r.sourceRecords);
  const pageOf = new Map<string, { title: string; url: string }>();
  const placed = new Set<string>();
  for (const s of sources.filter((x) => x.sourceKind === "official_dataset")) {
    const words = tokens(s.title);
    let owner: string | null = null;
    let best = 0;
    for (const id of order) {
      const score = [...(nameWords.get(id) ?? [])].filter((w) => words.has(w)).length;
      if (score > best) {
        owner = id;
        best = score;
      }
    }
    if (owner === null || pageOf.has(owner)) continue;
    pageOf.set(owner, { title: s.title, url: s.url });
    placed.add(s.id);
  }

  const datasets: DatasetEntry[] = order.map((datasetId) => {
    const own = byDataset.get(datasetId) ?? [];
    const versions = new Set(own.map((b) => b.datasetVersion));
    const version = versions.size === 1 ? ([...versions][0] ?? null) : null;
    const name = datasetTerm("name", datasetId);
    const mine = creditsOf.get(datasetId) ?? { credits: [], licences: [] };
    const credits = onceEach([...mine.credits, ...mine.licences]);
    const page = pageOf.get(datasetId) ?? null;
    return {
      datasetId,
      measured: datasetTerm("measured", datasetId),
      name: version ? sformat("sources.version", { name, version: versionWords(version) }) : name,
      detail: detailOf(own.flatMap((b) => measurementsOf.get(b.id) ?? [])),
      credits,
      link: page && !credits.some((c) => c.includes(page.url)) ? page : null,
    };
  });
  const shown = datasets.flatMap((d) => d.credits.map(tokens));
  // the map's credits feature by feature, each feature's licence after its credit ("© OpenStreetMap contributors",
  // then "ODbL-1.0 (OpenStreetMap)")
  const mapCredits = onceEach(
    mapOwn
      .sort((a, b) => a.feature - b.feature || Number(a.licence) - Number(b.licence))
      .map((e) => e.text),
    shown,
  );

  // every publication the case holds, each once with its link: those its statements cite first, most cited first,
  // then the newest; an official dataset's page that names no dataset of the case is listed here too
  const evidence = current(r.evidenceRecords);
  const briefs = current(r.briefRecords);
  const sourcesOfEvidence = new Map(
    evidence.map((e) => [e.id, new Set(e.provenance.sourceLocators.map((l) => l.sourceId))]),
  );
  const cited = new Map<string, number>();
  const cite = (ids: Iterable<string>) => {
    for (const id of ids) cited.set(id, (cited.get(id) ?? 0) + 1);
  };
  for (const ids of sourcesOfEvidence.values()) cite(ids);
  for (const b of briefs)
    for (const item of [
      ...b.known,
      ...b.uncertain,
      ...b.nextMeasurements,
      ...b.stakeholderRoles,
      ...b.preparedActions,
      ...b.authorizationRequired,
      ...b.nextSteps,
    ])
      cite(new Set(item.evidenceIds.flatMap((id) => [...(sourcesOfEvidence.get(id) ?? [])])));
  const year = (s: (typeof sources)[number]) => Number((s.publicationDate ?? "").slice(0, 4)) || 0;
  const publications: PublicationEntry[] = sources
    .filter((s) => !placed.has(s.id))
    .sort(
      (a, b) =>
        (cited.get(b.id) ?? 0) - (cited.get(a.id) ?? 0) ||
        year(b) - year(a) ||
        a.title.localeCompare(b.title),
    )
    .map((s) => {
      const venue = venueOf(s.publisher);
      const who = authorsOf(s.authors);
      const y = year(s) ? String(year(s)) : "";
      const by = who || venue || "";
      return {
        sourceId: s.id,
        cite: by && y ? sformat("sources.cite", { authors: by, year: y }) : by || y,
        title: s.title,
        venue: who ? venue : null,
        url: s.url,
      };
    });

  const lead = {
    ink:
      datasets.length === 0
        ? t("sources.lead.datasets.none")
        : datasets.length === 1
          ? t("sources.lead.datasets.one")
          : sformat("sources.lead.datasets.many", { n: datasets.length }),
    grey:
      publications.length === 0
        ? t("sources.lead.publications.none")
        : publications.length === 1
          ? t("sources.lead.publications.one")
          : sformat("sources.lead.publications.many", { n: publications.length }),
  };

  return { datasets, mapCredits, lead, publications, limits: limitsOf(snapshot, datasets) };
}

/**
 * The limits in plain words. Every limitation the case's current records state is said by the plain lines that write
 * one of its phrases; one that none says keeps the record's words without its IDs, last under the heading its record
 * belongs to. The coverage the measurements leave is counted first, and the pixel view's picture is said where the
 * case offers that view.
 */
function limitsOf(
  snapshot: CaseSnapshot,
  datasets: readonly DatasetEntry[],
): { side: LimitSection[]; main: LimitSection[] } {
  const r = snapshot.records;
  const bundles = current(r.dataBundleRecords);
  const used = bundles.filter((b) => b.status === "validated");
  const measurementsOf = groupBy(current(r.measurementRecords), (m) => m.dataBundleId);
  const observationsOf = groupBy(current(r.temporalObservationRecords), (o) => o.dataBundleId);
  const geo = current(r.geoSelectionRecords);
  const area = geo.filter((g) => g.id === snapshot.case.activeGeoSelectionId);

  const said: { text: string; section: SectionId }[] = [];
  const say = (section: SectionId, texts: readonly string[]) => {
    for (const text of texts) said.push({ text: text.trim(), section });
  };
  for (const b of current(r.briefRecords))
    say("app", [...b.limitations, ...b.provenance.limitations]);
  for (const x of current(r.interventionRecords)) say("app", x.provenance.limitations);
  for (const x of current(r.resourceRequirementRecords)) say("app", x.provenance.limitations);
  for (const x of current(r.instrumentSpecRecords ?? [])) say("app", x.provenance.limitations);
  for (const x of current(r.evidenceRecords)) say("analysis", x.provenance.limitations);
  for (const x of current(r.hypothesisRecords)) say("analysis", x.provenance.limitations);
  for (const x of current(r.explanationBranchRecords ?? []))
    say("analysis", x.provenance.limitations);
  for (const x of current(r.branchMergeRecords ?? [])) say("analysis", x.provenance.limitations);
  for (const b of used) {
    say("data", b.provenance.limitations);
    for (const m of measurementsOf.get(b.id) ?? []) say("data", m.provenance.limitations);
    for (const o of observationsOf.get(b.id) ?? []) say("data", o.provenance.limitations);
  }
  for (const g of area.length ? area : geo) say("map", g.limitations);
  for (const f of current(r.contextFeatureRecords ?? [])) say("map", f.limitations);

  const plain = new Set<SourcesMessageId>();
  const own: Record<SectionId, string[]> = { app: [], data: [], analysis: [], map: [] };
  for (const { text, section } of said) {
    const lines = linesSaying(text);
    if (lines.length) for (const l of lines) plain.add(l.id);
    else {
      const words = withoutIds(text);
      const list = own[section];
      if (words && !list.some((w) => w.toLowerCase() === words.toLowerCase())) list.push(words);
    }
  }
  if (current(r.instrumentSpecRecords ?? []).some((s) => s.parameters.kind === "pixel_anatomy"))
    plain.add("sources.limits.pixelPicture");
  // Year by Year blends between measured values while it plays; its snow plays unless the record says the snow
  // recipe was not run for the case
  const time = timeSourcesOf(snapshot);
  if (time) {
    const snow = used.find((b) => b.id === time.snow);
    const plays =
      snow !== undefined &&
      !snow.provenance.limitations.some((l) => /^Not applicable means/.test(l));
    plain.add(plays ? "sources.limits.timeBlendSnow" : "sources.limits.timeBlend");
  }

  // coverage: for each dataset, the periods its measurements leave out, and the bundles the case does not hold
  const coverage: string[] = [];
  const byDataset = groupBy(used, (b) => b.datasetId);
  for (const d of datasets) {
    const ms = (byDataset.get(d.datasetId) ?? []).flatMap((b) => measurementsOf.get(b.id) ?? []);
    const left = ms.filter((m) => m.status !== "available");
    if (!left.length) continue;
    // months are counted among the dataset's months; any other period among all of its periods
    const monthly = (p: string) => /^period_\d{4}-\d{2}$/.test(p);
    const out = new Set(left.map((m) => m.periodId));
    const inMonths = [...out].every(monthly);
    const all = new Set(ms.map((m) => m.periodId).filter((p) => !inMonths || monthly(p)));
    const values = { name: d.name, n: out.size, total: all.size };
    if (!inMonths) {
      coverage.push(sformat("sources.coverage.periods", values));
      continue;
    }
    const run = monthRun(out);
    const policy = policyOf(left.map((m) => m.missingReason));
    coverage.push(
      run && policy
        ? sformat("sources.coverage.span.policy", { ...values, ...run, policy })
        : run
          ? sformat("sources.coverage.span", { ...values, ...run })
          : policy
            ? sformat("sources.coverage.policy", { ...values, policy })
            : sformat("sources.coverage.months", values),
    );
  }
  for (const b of bundles) {
    if (b.status === "validated") continue;
    coverage.push(
      sformat(BUNDLE_STATUS[b.status] ?? "sources.bundle.missing", { label: labelWords(b.label) }),
    );
  }

  const sectionOf = (id: SectionId): LimitSection | null => {
    const topics: LimitTopic[] = [];
    const topic = (key: TopicId): LimitTopic => {
      let found = topics.find((x) => x.id === key);
      if (!found) {
        found = { id: key, label: sc[`sources.topic.${key}`].text, lines: [] };
        topics.push(found);
      }
      return found;
    };
    if (id === "data" && coverage.length) topic("coverage").lines.push(...coverage);
    for (const p of PLAIN)
      if (p.section === id && plain.has(p.id)) topic(p.topic).lines.push(sc[p.id].text);
    if (own[id].length) topics.push({ id: "record", label: null, lines: own[id] });
    return topics.length ? { id, heading: sc[`sources.section.${id}`].text, topics } : null;
  };
  const some = (ids: readonly SectionId[]) =>
    ids.map(sectionOf).filter((s): s is LimitSection => s !== null);
  return { side: some(["app", "map"]), main: some(["data", "analysis"]) };
}
