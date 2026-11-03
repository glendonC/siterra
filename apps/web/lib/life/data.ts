// Recorded life on the land (UI-2): the species occurrence bundle's stored records (species_occurrences 1.0.0,
// occurrences.json), read as the asset gives them: columns of equal length, one entry per kept record, indexing the
// bundle's tables. Records stack on a few points, so the land shows one mark per recorded point, never one per
// record, and every mark is the same: a count of records follows recording effort, not the organisms. A record says
// an organism was recorded here; it is never presence, abundance or change. Pure.

import { lonLatToUtm } from "../instruments/valley/utm";

export type LifeGroup = "bird" | "plant" | "insect" | "other";

export interface Taxon {
  scientificName: string;
  species: string | null;
  kingdom: string | null;
  className: string | null;
  group: LifeGroup;
}

export interface Dataset {
  title: string;
  publisher: string;
  doi: string | null;
}

export interface LifeRecord {
  gbifId: number;
  taxon: number;
  year: number | null;
  eventDate: string | null;
  basis: string;
  lat: number;
  lon: number;
  uncertaintyM: number | null;
  dataset: number;
  license: string;
}

export interface Occurrences {
  computed: string;
  taxa: Taxon[];
  datasets: Dataset[];
  records: LifeRecord[];
}

/** A taxon's group for its glyph, from the record's own kingdom and class. */
export function groupOf(kingdom: string | null, className: string | null): LifeGroup {
  if (kingdom === "Plantae") return "plant";
  if (className === "Aves") return "bird";
  if (className === "Insecta") return "insect";
  return "other";
}

const FOSSIL = "FOSSIL_SPECIMEN";
export const isFossil = (r: LifeRecord): boolean => r.basis === FOSSIL;

type Json = Record<string, unknown>;
const arr = (v: unknown, name: string): unknown[] => {
  if (!Array.isArray(v)) throw new Error(`occurrences: ${name} is not a list`);
  return v;
};
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** The asset read as records, refused unless its recipe, its columns' lengths and its record count agree. */
export function occurrencesFrom(raw: unknown): Occurrences {
  const d = raw as Json;
  if (d.recipeId !== "species_occurrences") throw new Error("occurrences: not species_occurrences");
  const t = (d.tables ?? {}) as Json;
  const c = (d.columns ?? {}) as Json;
  const taxa = arr(t.taxa, "taxa").map((x): Taxon => {
    const o = x as Json;
    const kingdom = str(o.kingdom);
    const className = str(o.class);
    return {
      scientificName: str(o.scientific_name) ?? "",
      species: str(o.species),
      kingdom,
      className,
      group: groupOf(kingdom, className),
    };
  });
  const datasets = arr(t.datasets, "datasets").map((x): Dataset => {
    const o = x as Json;
    return { title: str(o.title) ?? "", publisher: str(o.publisher) ?? "", doi: str(o.doi) };
  });
  const basis = arr(t.basis_of_record, "basis_of_record").map((x) => str(x) ?? "");
  const license = arr(t.license, "license").map((x) => str(x) ?? "");
  const names = [
    "gbif_id",
    "taxon",
    "year",
    "event_date",
    "basis_of_record",
    "lat",
    "lon",
    "uncertainty_m",
    "dataset",
    "license",
  ] as const;
  const col = Object.fromEntries(names.map((n) => [n, arr(c[n], n)])) as Record<
    (typeof names)[number],
    unknown[]
  >;
  const n = num(d.records);
  if (n === null || names.some((k) => col[k].length !== n))
    throw new Error("occurrences: columns and record count differ");
  const at = <T>(table: readonly T[], i: unknown, name: string): T => {
    const v = typeof i === "number" ? table[i] : undefined;
    if (v === undefined) throw new Error(`occurrences: ${name} index out of its table`);
    return v;
  };
  const records = Array.from({ length: n }, (_, i): LifeRecord => {
    const lat = num(col.lat[i]);
    const lon = num(col.lon[i]);
    if (lat === null || lon === null) throw new Error("occurrences: a kept record has no point");
    const taxon = num(col.taxon[i]);
    const dataset = num(col.dataset[i]);
    at(taxa, taxon, "taxon");
    at(datasets, dataset, "dataset");
    return {
      gbifId: num(col.gbif_id[i]) ?? 0,
      taxon: taxon ?? 0,
      year: num(col.year[i]),
      eventDate: str(col.event_date[i]),
      basis: at(basis, col.basis_of_record[i], "basis_of_record"),
      lat,
      lon,
      uncertaintyM: num(col.uncertainty_m[i]),
      dataset: dataset ?? 0,
      license: at(license, col.license[i], "license"),
    };
  });
  return { computed: str(d.computed) ?? "", taxa, datasets, records };
}

/** One recorded point on the land: every kept record at one coordinate. */
export interface RecordedPoint {
  /** The point in the zone's UTM metres. */
  e: number;
  n: number;
  /** Indices into Occurrences.records, in the asset's order. */
  records: number[];
  /** The point's group when all its records share one, else null (a mixed point). */
  group: LifeGroup | null;
  species: number;
  years: [number, number] | null;
  /** The largest stated uncertainty (m), and how many records state none. */
  uncertaintyM: number | null;
  unstated: number;
}

/**
 * The records drawn on the land, grouped by their recorded coordinate, in the order each point first appears. A
 * fossil the referenceecords an organism of an earlier age, not a living one: it stays off the land (the lead, 21:08)
 * and is counted in the layer's card instead.
 */
export function pointsOf(o: Occurrences, zone: number): RecordedPoint[] {
  const by = new Map<string, number[]>();
  o.records.forEach((r, i) => {
    if (isFossil(r)) return;
    const k = `${String(r.lat)},${String(r.lon)}`;
    const list = by.get(k);
    if (list) list.push(i);
    else by.set(k, [i]);
  });
  return [...by.values()].map((idx) => {
    const rs = idx.map((i) => o.records[i]).filter((r): r is LifeRecord => r !== undefined);
    const first = rs[0];
    if (!first) throw new Error("occurrences: an empty point");
    const [e, n] = lonLatToUtm(first.lon, first.lat, zone);
    const groups = new Set(rs.map((r) => o.taxa[r.taxon]?.group));
    const ys = rs.flatMap((r) => (r.year === null ? [] : [r.year]));
    const us = rs.flatMap((r) => (r.uncertaintyM === null ? [] : [r.uncertaintyM]));
    return {
      e,
      n,
      records: idx,
      group: groups.size === 1 ? (o.taxa[first.taxon]?.group ?? null) : null,
      species: new Set(rs.map((r) => o.taxa[r.taxon]?.species ?? o.taxa[r.taxon]?.scientificName))
        .size,
      years: ys.length
        ? [ys.reduce((a, b) => Math.min(a, b)), ys.reduce((a, b) => Math.max(a, b))]
        : null,
      uncertaintyM: us.length ? us.reduce((a, b) => Math.max(a, b)) : null,
      unstated: rs.length - us.length,
    };
  });
}

export interface LifeSummary {
  /** Records drawn on the land (every kept record but the fossil specimens), and the points they stand on. */
  records: number;
  points: number;
  fossils: number;
  /** The years the drawn records span, where they state one. */
  years: [number, number] | null;
}

export function summaryOf(o: Occurrences, points: readonly RecordedPoint[]): LifeSummary {
  const drawn = o.records.filter((r) => !isFossil(r));
  const ys = drawn.flatMap((r) => (r.year === null ? [] : [r.year]));
  return {
    records: drawn.length,
    points: points.length,
    fossils: o.records.length - drawn.length,
    years: ys.length
      ? [ys.reduce((a, b) => Math.min(a, b)), ys.reduce((a, b) => Math.max(a, b))]
      : null,
  };
}
