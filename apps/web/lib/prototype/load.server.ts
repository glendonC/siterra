// Reads the prototype fixture from the repository's bundles and case files (server only, at build time).
// Every value is copied as stored; nothing is computed here except unit conversions and labels.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { findBundlesDir } from "@siterra/db";
import type { Corners, LonLat } from "../stage/daylight-style";
import type { Feature } from "../stage/geo";
import { monthLabel, type Excerpt, type Fixture, type Month, type Season } from "./fixture";

const DEPARTURE = "bundle_ndvi_departure_ait_bouguemez";
const RAIN = "bundle_chirps_monthly_ait_bouguemez";
const COVERAGE = "bundle_coverage_summary_ait_bouguemez";
const SEASONS = "bundle_season_summary_ait_bouguemez";
const DEPARTURE_METRIC = "ndvi_departure_area_median_leave_one_year_out";

interface Measurement {
  metric: string;
  value: number | null;
}

type Json = Record<string, unknown>;

const read = (path: string): Json => JSON.parse(readFileSync(path, "utf8")) as Json;

const R = 6378137;
function mercatorToLonLat(x: number, y: number): LonLat {
  return [
    (x / R) * (180 / Math.PI),
    (2 * Math.atan(Math.exp(y / R)) - Math.PI / 2) * (180 / Math.PI),
  ];
}

export function bundlesRoot(): string {
  const dir = findBundlesDir(process.cwd());
  if (dir === null) throw new Error("data/bundles not found");
  return dir;
}

/** The place a case title names after its last " in the ", or the whole title. */
function placeIn(title: string): string {
  const i = title.lastIndexOf(" in the ");
  return i >= 0 ? title.slice(i + " in the ".length) : title;
}

export function loadFixture(): Fixture {
  const bundles = bundlesRoot();
  const data = dirname(bundles);
  const caseSeed = read(join(data, "case", "case.json"));
  const caseInfo = caseSeed["case"] as Json;
  const geo = caseSeed["geoSelection"] as Json;
  const catchmentFile = read(join(data, "case", "geometry", "ait-bouguemez-catchment.geojson"));
  const catchment = (catchmentFile["features"] as Feature[])[0];
  if (!catchment) throw new Error("No catchment feature");
  const context = read(join(data, "case", "context-features.json"))["features"] as {
    id: string;
    name: string;
    role: string;
    lonLat: [number, number];
  }[];
  const outletFeature = context.find((f) => f.role === "outlet");

  const coverageRows = read(join(bundles, COVERAGE, "coverage-summary.json"))["rows"] as {
    period_id: string;
    valid_fraction: number;
    quality_flags: string[];
  }[];

  const months: Month[] = [];
  const cellRain: Record<string, Record<string, number>> = {};
  let corners: Corners | undefined;
  for (let y = 2019; y <= 2025; y++)
    for (let m = 1; m <= 12; m++) {
      const id = `${String(y)}-${String(m).padStart(2, "0")}`;
      const periodId = `period_${id}`;
      const dep = read(join(bundles, DEPARTURE, periodId, `${periodId}.json`));
      const props = dep["properties"] as Json;
      const meas = (props["siterra:measurements"] as Measurement[] | null) ?? [];
      const overview = (dep["assets"] as Json)["overview"] as Json | undefined;
      const hasPicture =
        overview !== undefined && existsSync(join(bundles, DEPARTURE, periodId, "overview.webp"));
      if (hasPicture && !corners) {
        const [w, s, e, n] = overview["proj:bbox"] as [number, number, number, number];
        corners = [
          mercatorToLonLat(w, n),
          mercatorToLonLat(e, n),
          mercatorToLonLat(e, s),
          mercatorToLonLat(w, s),
        ];
      }
      const rain = read(join(bundles, RAIN, periodId, `${periodId}.json`));
      const rainMeas = (rain["properties"] as Json)["siterra:measurements"] as Measurement[];
      const cov = coverageRows.find((r) => r.period_id === periodId);
      const cells = read(join(bundles, RAIN, periodId, "cell-values.json"))["cells"] as {
        cell_id: string;
        mm: number;
      }[];
      cellRain[periodId] = Object.fromEntries(cells.map((c) => [c.cell_id, c.mm]));
      months.push({
        id,
        periodId,
        label: monthLabel(id),
        rainMm: rainMeas.find((x) => x.metric === "precipitation_catchment_total")?.value ?? NaN,
        rainVsUsualMm:
          rainMeas.find((x) => x.metric === "precipitation_departure_from_1991_2020_mean")?.value ??
          NaN,
        greenness: meas.find((x) => x.metric === DEPARTURE_METRIC)?.value ?? null,
        seenShare: cov?.valid_fraction ?? NaN,
        hasPicture,
        missingReason: (props["siterra:missing_reason"] as string | null) ?? null,
        snowSuspected: (cov?.quality_flags ?? []).includes("snow_suspected"),
      });
    }
  if (!corners) throw new Error("No departure picture");

  const seasonSummary = read(join(bundles, SEASONS, "season-summary.json"));
  const reference = seasonSummary["reference"] as Json;
  const seasons: Season[] = (
    seasonSummary["seasons"] as {
      season_id: string;
      season_total_mm: number;
      season_departure_mm: number;
      season_category: string;
    }[]
  ).map((s) => {
    const start = s.season_id.slice(7, 11);
    const end = s.season_id.slice(17, 19);
    return {
      id: s.season_id,
      label: `${start}/${end}`,
      totalMm: s.season_total_mm,
      departureMm: s.season_departure_mm,
      category: s.season_category,
    };
  });

  const rainCells = read(
    join(bundles, RAIN, "rainfall-cells.geojson"),
  ) as unknown as Fixture["rainCells"];
  rainCells.features = rainCells.features.map((f) => ({
    type: "Feature",
    geometry: f.geometry,
    properties: { cell_id: f.properties.cell_id, fraction_inside: f.properties.fraction_inside },
  }));

  const corpus = read(join(data, "case", "corpus-manifest.json"))["sources"] as Json[];
  const sources = corpus.map((s) => ({
    id: s["id"] as string,
    title: s["title"] as string,
    publisher: (s["publisher"] as string | undefined) ?? null,
    date: (s["publicationDate"] as string | null | undefined) ?? null,
    url: (s["url"] as string | undefined) ?? null,
    accessStatus: s["accessStatus"] as string,
  }));

  const excerpts: Excerpt[] = readFileSync(join(data, "case", "gold", "extraction.jsonl"), "utf8")
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l) as Json)
    .filter((r) => r["record"] === "item" && typeof r["excerpt"] === "string")
    .map((r) => ({
      id: r["id"] as string,
      sourceId: r["source_id"] as string,
      page: (r["page"] as number | null) ?? null,
      excerpt: r["excerpt"] as string,
      attribution: (r["attribution"] as string | undefined) ?? null,
      labeler: r["labeler"] as string,
    }));

  return {
    caseQuestion: caseInfo["objective"] as string,
    caseTitle: caseInfo["title"] as string,
    placeName: placeIn(caseInfo["title"] as string),
    location: caseInfo["location"] as string,
    areaLabel: ((geo["label"] as string).split(/[(,]/)[0] ?? "").trim(),
    areaKm2: Math.round((geo["areaM2"] as number) / 1e5) / 10,
    catchment,
    places: context
      .filter((f) => f.role !== "outlet")
      .map((f) => ({ id: f.id, name: f.name, role: f.role, lon: f.lonLat[0], lat: f.lonLat[1] })),
    outlet: outletFeature
      ? { lon: outletFeature.lonLat[0], lat: outletFeature.lonLat[1] }
      : { lon: NaN, lat: NaN },
    months,
    seasons,
    usualSeasonMm: reference["mean_mm"] as number,
    referenceSeasons: (reference["seasons"] as string[]).length,
    pictureCorners: corners,
    rainCells,
    cellRain,
    sources,
    excerpts,
    coverageThreshold: 0.7,
  };
}
