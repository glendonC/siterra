// The NDVI departure layer of the Observations step (storyboard scene 3): the latest period whose
// leave-one-year-out departure is available and whose bundle Item carries a display raster, bound to the
// records it shows (TemporalObservation, Measurement, DataBundle, each at its revision). The picture is
// display only; every number in the legend comes from the records. A period without a map draws nothing.

import type { CaseSnapshot } from "@siterra/contracts";
import { en, format } from "../copy/en";
import { periodLabel } from "../projection/observations";
import type { Corners } from "../stage/daylight-style";

export const DEPARTURE_METRIC = "ndvi_departure_area_median_leave_one_year_out";
/** The bundle's name for the ramp the design tokens call data.ndvi-departure. */
const COLOR_SCALE = "ndvi-anomaly-diverging";
/** MOT-04: the raster's 160 ms fade, started once its picture has loaded. */
export const DEPARTURE_FADE_MS = 160;

const MONTH_PLURALS = [
  "Januaries",
  "Februaries",
  "Marches",
  "Aprils",
  "Mays",
  "Junes",
  "Julys",
  "Augusts",
  "Septembers",
  "Octobers",
  "Novembers",
  "Decembers",
];

export interface RecordRef {
  id: string;
  revision: number;
}

export interface DepartureBinding {
  periodId: string;
  observation: RecordRef;
  measurement: RecordRef & { validFraction: number | null; spatialResolutionM: number | null };
  bundle: RecordRef & {
    contentHash: string;
    manifestUri: string;
    methodId: string;
    methodVersion: string;
  };
  imageUri: string;
  imageHash: string;
}

export function departureBinding(s: CaseSnapshot): DepartureBinding | undefined {
  const bundles = new Map(s.records.dataBundleRecords.map((b) => [b.id, b]));
  const measurements = new Map(s.records.measurementRecords.map((m) => [m.id, m]));
  let best: DepartureBinding | undefined;
  for (const o of s.records.temporalObservationRecords) {
    if (o.mapStatus !== "available" || !o.mapAssetUri || !o.mapAssetHash) continue;
    const b = bundles.get(o.dataBundleId);
    if (b?.status !== "validated" || !b.contentHash || !b.manifestUri) continue;
    // the picture must be the one this bundle revision lists, under its content hash
    if (!o.mapAssetUri.startsWith(`/api/case-assets/${b.id}/${b.contentHash}/`)) continue;
    const m = o.measurementIds
      .map((id) => measurements.get(id))
      .find((x) => x?.metric === DEPARTURE_METRIC);
    if (m?.status !== "available") continue;
    if (best && best.periodId >= o.periodId) continue;
    best = {
      periodId: o.periodId,
      observation: { id: o.id, revision: o.revision },
      measurement: {
        id: m.id,
        revision: m.revision,
        validFraction: m.validFraction,
        spatialResolutionM: m.spatialResolutionM,
      },
      bundle: {
        id: b.id,
        revision: b.revision,
        contentHash: b.contentHash,
        manifestUri: b.manifestUri,
        methodId: b.methodId,
        methodVersion: b.methodVersion,
      },
      imageUri: o.mapAssetUri,
      imageHash: o.mapAssetHash,
    };
  }
  return best;
}

export interface DepartureManifest {
  /** Top left, top right, bottom right, bottom left, as MapLibre's image source takes them. */
  corners: Corners;
  domain: [number, number];
  /** Ground size of one display cell at the middle of the box, in meters. */
  cellM: number;
  /** The mapped cropland and buildings, when the manifest lists them with a checksum. */
  excludedUri: string | undefined;
}

const R = 6378137;
const lonOf = (x: number) => (x / R) * (180 / Math.PI);
const latOf = (y: number) => (2 * Math.atan(Math.exp(y / R)) - Math.PI / 2) * (180 / Math.PI);

/** The shared display grid and the cropland layer from the bundle's collection.json. */
export function parseDepartureManifest(raw: unknown, manifestUri: string): DepartureManifest {
  const c = (raw ?? {}) as {
    item_assets?: Record<string, Record<string, unknown>>;
    assets?: Record<string, Record<string, unknown>>;
  };
  const o = c.item_assets?.["overview"];
  const box = o?.["proj:bbox"];
  const shape = o?.["proj:shape"];
  const domain = o?.["siterra:domain"];
  if (
    o?.["proj:code"] !== "EPSG:3857" ||
    o["siterra:color_scale"] !== COLOR_SCALE ||
    !Array.isArray(box) ||
    box.length !== 4 ||
    !box.every((n) => typeof n === "number") ||
    !Array.isArray(shape) ||
    shape.length !== 2 ||
    !shape.every((n) => typeof n === "number" && n > 0) ||
    !Array.isArray(domain) ||
    domain.length !== 2 ||
    !domain.every((n) => typeof n === "number")
  )
    throw new Error("Departure layer: the manifest lists no display grid on the departure scale");
  const [x0, y0, x1, y1] = box as [number, number, number, number];
  const [w, s, e, n] = [lonOf(x0), latOf(y0), lonOf(x1), latOf(y1)];
  // a Web Mercator meter is cos(latitude) meters on the ground
  const cellM =
    ((x1 - x0) / (shape as [number, number])[1]) * Math.cos((latOf((y0 + y1) / 2) * Math.PI) / 180);
  const ex = c.assets?.["excluded_land"];
  const href = ex?.["href"];
  const base = new URL(manifestUri, "http://origin.invalid");
  return {
    corners: [
      [w, n],
      [e, n],
      [e, s],
      [w, s],
    ],
    domain: domain as [number, number],
    cellM,
    excludedUri:
      typeof href === "string" && typeof ex?.["file:checksum"] === "string"
        ? new URL(href, base).pathname
        : undefined,
  };
}

export interface DepartureLegend {
  title: string;
  subtitle: string;
  low: string;
  high: string;
  coverage?: string;
  excluded?: string;
  note: string;
  method: string;
  cells: string;
}

const meters = new Intl.NumberFormat("en", { maximumFractionDigits: 1 });

/** A domain end as the key writes it: two decimals, a minus sign or a plus (VT-36). */
const tick = (v: number) => `${v < 0 ? "\u2212" : "+"}${Math.abs(v).toFixed(2)}`;

export function departureLegend(
  b: DepartureBinding,
  domain: [number, number],
  hatched: boolean,
  cellM: number,
): DepartureLegend {
  const months = MONTH_PLURALS[Number(b.periodId.slice(12, 14)) - 1] ?? "";
  const f = b.measurement.validFraction;
  const analysis = b.measurement.spatialResolutionM;
  const display = meters.format(cellM);
  return {
    title: format("legend.ndvi.title", { period: periodLabel(b.periodId), months }),
    subtitle: format("legend.ndvi.subtitle", { months }),
    low: tick(domain[0]),
    high: tick(domain[1]),
    ...(f === null
      ? {}
      : { coverage: format("legend.coverage", { percent: Math.round(f * 100) }) }),
    ...(hatched ? { excluded: en["legend.ndvi.excluded"].text } : {}),
    note: en["legend.ndvi.note"].text,
    method: format("legend.ndvi.method", {
      method: b.bundle.methodId,
      version: b.bundle.methodVersion,
    }),
    cells:
      analysis === null
        ? format("legend.ndvi.cellsDisplay", { display })
        : format("legend.ndvi.cells", { display, analysis: meters.format(analysis) }),
  };
}

/** The legend's lines in reading order, for Read flat. */
export function legendLines(l: DepartureLegend): string[] {
  return [
    l.title,
    l.subtitle,
    `${l.low} ${l.high}`,
    ...(l.coverage ? [l.coverage] : []),
    ...(l.excluded ? [l.excluded] : []),
    l.note,
    l.method,
    l.cells,
  ];
}
