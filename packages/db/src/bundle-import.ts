// Maps the STAC bundle catalog in data/bundles/ into DataBundle, TemporalObservation and
// Measurement records (data-contracts.md, observation bundles). It never computes a value: every
// number comes from the bundle. A bundle is accepted whole or not at all; each refusal is an issue.
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import {
  DataBundle,
  type EntityVersion,
  type GeoSelection,
  Measurement,
  type Provenance,
  type Source,
  StacCollection,
  StacItem,
  TemporalObservation,
} from "@siterra/contracts";

export type ImportIssue = { bundleId: string; path: string; message: string };
export type ImportedBundle = {
  dataBundle: DataBundle;
  temporalObservations: TemporalObservation[];
  measurements: Measurement[];
};
export type ImportResult = { bundles: ImportedBundle[]; issues: ImportIssue[] };

export type ImportContext = {
  /** Folder holding catalog.json. */
  catalogDir: string;
  caseId: string;
  geoSelections: readonly GeoSelection[];
  sources: readonly Source[];
  /** Absolute URL the catalog folder is served from, ending in a slash. */
  assetBaseUri: string;
  /** Timestamp for createdAt and updatedAt of the imported records. */
  importedAt: string;
};

/** The STAC file extension checksum: a SHA-256 multihash in hex (code 0x12, length 0x20). */
export function sha256Multihash(bytes: Uint8Array): string {
  return `1220${createHash("sha256").update(bytes).digest("hex")}`;
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8")) as unknown;
}

function isRelative(href: string): boolean {
  return !/^[a-z][a-z0-9+.-]*:/i.test(href);
}

/** First and exclusive-end dates of a period_YYYY-MM month, and its inclusive STAC bounds. */
export function periodBounds(periodId: string): {
  startDate: string;
  endDateExclusive: string;
  stacStart: string;
  stacEnd: string;
} {
  const match = /^period_([0-9]{4})-([0-9]{2})$/.exec(periodId);
  if (match === null) {
    throw new Error(`Not a period ID: ${periodId}`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  const last = new Date(end.getTime() - 1000);
  const day = (d: Date) => d.toISOString().slice(0, 10);
  return {
    startDate: day(start),
    endDateExclusive: day(end),
    stacStart: `${day(start)}T00:00:00Z`,
    stacEnd: `${day(last)}T23:59:59Z`,
  };
}

function polygonOf(geojson: unknown): unknown {
  const node = geojson as {
    type?: string;
    features?: { geometry?: unknown }[];
    geometry?: unknown;
  };
  if (node.type === "FeatureCollection" && node.features?.length === 1) {
    return node.features[0]?.geometry;
  }
  if (node.type === "Feature") {
    return node.geometry;
  }
  return geojson;
}

/** Imports every child bundle of the catalog against the case's geometry and sources. */
export function importCatalog(context: ImportContext): ImportResult {
  const catalogPath = join(context.catalogDir, "catalog.json");
  const catalog = readJson(catalogPath) as {
    links?: { rel: string; href: string; "file:checksum"?: unknown }[];
  };
  const children = (catalog.links ?? []).filter((link) => link.rel === "child");
  const bundles: ImportedBundle[] = [];
  const issues: ImportIssue[] = [];
  const successors = new Set<string>();
  for (const child of children) {
    const collectionPath = resolve(context.catalogDir, child.href);
    const childId = dirname(collectionPath).split("/").pop() ?? child.href;
    if (!existsSync(collectionPath)) {
      issues.push({
        bundleId: childId,
        path: "catalog.json/links",
        message: `Collection not found: ${child.href}`,
      });
      continue;
    }
    if (child["file:checksum"] !== sha256Multihash(readFileSync(collectionPath))) {
      issues.push({
        bundleId: childId,
        path: "catalog.json/links",
        message: `file:checksum does not match ${child.href}`,
      });
      continue;
    }
    const result = importBundle(context, collectionPath);
    issues.push(...result.issues);
    if (result.bundle !== null && result.issues.length === 0) {
      bundles.push(result.bundle);
      for (const predecessor of result.predecessors) {
        successors.add(predecessor);
      }
    }
  }
  for (const bundle of bundles) {
    if (successors.has(bundle.dataBundle.id)) {
      bundle.dataBundle = { ...bundle.dataBundle, status: "superseded" };
    }
  }
  return { bundles, issues };
}

function importBundle(
  context: ImportContext,
  collectionPath: string,
): { bundle: ImportedBundle | null; issues: ImportIssue[]; predecessors: string[] } {
  const issues: ImportIssue[] = [];
  const bundleDir = dirname(collectionPath);
  const fallbackId = bundleDir.split("/").pop() ?? collectionPath;
  const collectionBytes = readFileSync(collectionPath);
  const parsed = StacCollection.safeParse(JSON.parse(collectionBytes.toString("utf8")));
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      issues.push({
        bundleId: fallbackId,
        path: `collection.json/${issue.path.join("/")}`,
        message: issue.message,
      });
    }
    return { bundle: null, issues, predecessors: [] };
  }
  const collection = parsed.data;
  const bundleId = collection.id;
  const issue = (path: string, message: string) => issues.push({ bundleId, path, message });

  const verifyChecksum = (href: string, checksum: unknown, path: string) => {
    if (!isRelative(href)) {
      issue(path, `Cannot verify the checksum of a remote file: ${href}`);
      return;
    }
    const file = resolve(bundleDir, href);
    if (!existsSync(file)) {
      issue(path, `File not found: ${href}`);
    } else if (checksum !== sha256Multihash(readFileSync(file))) {
      issue(path, `file:checksum does not match ${href}`);
    }
  };

  collection.links.forEach((link, i) => {
    if (typeof link["file:checksum"] === "string" && isRelative(link.href) && link.rel !== "item") {
      verifyChecksum(link.href, link["file:checksum"], `collection.json/links/${i}`);
    }
  });
  for (const [key, asset] of Object.entries(collection.assets)) {
    verifyChecksum(asset.href, asset["file:checksum"], `collection.json/assets/${key}`);
  }

  const geo = collection["siterra:geo_selection"];
  const geoSelection = context.geoSelections.find(
    (g) => g.id === geo.id && g.revision === geo.revision,
  );
  if (geoSelection === undefined) {
    issue(
      "collection.json/siterra:geo_selection",
      `The case has no GeoSelection ${geo.id} revision ${geo.revision}`,
    );
  } else {
    const geometryAsset = collection.assets["analysis_geometry"];
    if (geometryAsset !== undefined && isRelative(geometryAsset.href)) {
      const file = resolve(bundleDir, geometryAsset.href);
      if (
        existsSync(file) &&
        JSON.stringify(polygonOf(readJson(file))) !== JSON.stringify(geoSelection.geometry)
      ) {
        issue(
          "collection.json/assets/analysis_geometry",
          `The analysis geometry differs from ${geo.id} revision ${geo.revision}`,
        );
      }
    }
  }

  const sourceIds: string[] = [];
  const upstreamBundles: EntityVersion[] = [];
  const licenseTitles: string[] = [];
  for (const link of collection.links) {
    if (link.rel !== "derived_from" && link.rel !== "license") {
      continue;
    }
    if (link.rel === "license" && typeof link["title"] === "string") {
      licenseTitles.push(link["title"]);
    }
    if (
      link.rel === "derived_from" &&
      isRelative(link.href) &&
      link.href.endsWith("collection.json")
    ) {
      const upstream = readJson(resolve(bundleDir, link.href)) as { id?: unknown };
      if (typeof upstream.id === "string") {
        upstreamBundles.push({ entityId: upstream.id, revision: 1 });
      }
      continue;
    }
    for (const source of context.sources) {
      if (source.url === link.href && !sourceIds.includes(source.id)) {
        sourceIds.push(source.id);
      }
    }
  }
  const predecessors = collection.links
    .filter((link) => link.rel === "predecessor-version" && isRelative(link.href))
    .map((link) => (readJson(resolve(bundleDir, link.href)) as { id?: string }).id)
    .filter((id): id is string => typeof id === "string");

  const method = collection["siterra:method"];
  const checks = collection["siterra:checks"];
  const recomputed = checks.some(
    (check) => check.name === "recompute_sample_period" && check.passed,
  );
  const created =
    typeof collection["created"] === "string" ? collection["created"] : context.importedAt;
  const provenance: Provenance = {
    sourceLocators: [],
    dataBundleIds: upstreamBundles.map((b) => b.entityId),
    methodId: method.id,
    methodVersion: method.version,
    inputVersions: [{ entityId: geo.id, revision: geo.revision }, ...upstreamBundles],
    generatedByTaskId: null,
    generatedAt: created,
    verificationStatus:
      collection["siterra:status"] === "validated" && recomputed
        ? "computed_checked"
        : "unverified",
    limitations: [...new Set(collection["siterra:limitations"])],
  };
  const bundleUrl = new URL(`${bundleDir.split("/").pop() ?? bundleId}/`, context.assetBaseUri);
  const slug = bundleId.replace(/^bundle_/, "");
  const license = typeof collection["license"] === "string" ? collection["license"] : null;

  const temporalObservations: TemporalObservation[] = [];
  const measurements: Measurement[] = [];
  const itemLinks = collection.links.filter((link) => link.rel === "item");
  for (const [i, link] of itemLinks.entries()) {
    const itemPath = resolve(bundleDir, link.href);
    if (!existsSync(itemPath)) {
      issue(`collection.json/links/item/${i}`, `Item not found: ${link.href}`);
      continue;
    }
    const itemBytes = readFileSync(itemPath);
    if (link["file:checksum"] !== sha256Multihash(itemBytes)) {
      issue(`collection.json/links/item/${i}`, `file:checksum does not match ${link.href}`);
    }
    const itemParsed = StacItem.safeParse(JSON.parse(itemBytes.toString("utf8")));
    if (!itemParsed.success) {
      for (const e of itemParsed.error.issues) {
        issue(`${link.href}/${e.path.join("/")}`, e.message);
      }
      continue;
    }
    const item = itemParsed.data;
    const props = item.properties;
    const periodId = item.id;
    const bounds = periodBounds(periodId);
    if (item.collection !== bundleId) {
      issue(`${link.href}/collection`, `Item belongs to ${item.collection}, not ${bundleId}`);
    }
    if (props.start_datetime !== bounds.stacStart || props.end_datetime !== bounds.stacEnd) {
      issue(`${link.href}/properties`, `start_datetime and end_datetime do not bound ${periodId}`);
    }
    const itemDir = dirname(itemPath);
    for (const [key, asset] of Object.entries(item.assets)) {
      if (isRelative(asset.href)) {
        const file = resolve(itemDir, asset.href);
        if (!existsSync(file) || asset["file:checksum"] !== sha256Multihash(readFileSync(file))) {
          issue(`${link.href}/assets/${key}`, `Missing file or checksum mismatch: ${asset.href}`);
        }
      }
    }
    const month = periodId.slice("period_".length);
    const measurementIds: string[] = [];
    for (const entry of props["siterra:measurements"]) {
      const id = `meas_${slug}_${month}_${entry.metric}`;
      const missingReason =
        entry.status === "available"
          ? null
          : (entry.missing_reason ?? props["siterra:missing_reason"]);
      if (entry.status !== "available" && missingReason === null) {
        issue(
          `${link.href}/properties/siterra:measurements/${entry.metric}`,
          `Measurement is ${entry.status} but neither it nor its period states a reason`,
        );
        continue;
      }
      measurementIds.push(id);
      measurements.push(
        Measurement.parse({
          recordType: "Measurement",
          id,
          revision: 1,
          createdAt: context.importedAt,
          updatedAt: context.importedAt,
          caseId: context.caseId,
          metric: entry.metric,
          value: entry.value,
          unit: entry.unit,
          status: entry.status,
          missingReason,
          geoSelectionId: geo.id,
          geoRevision: geo.revision,
          periodId,
          dataBundleId: bundleId,
          aggregation: entry.aggregation,
          validPixelCount: entry.valid_pixel_count,
          totalPixelCount: entry.total_pixel_count,
          validFraction: props["siterra:area_valid_fraction"],
          spatialResolutionM:
            props["raster:spatial_resolution"] > 0 ? props["raster:spatial_resolution"] : null,
          uncertainty:
            entry.spread === null
              ? { kind: "not_quantified", lower: null, upper: null, level: null, method: null }
              : {
                  kind: "spatial_iqr",
                  lower: entry.spread.lower,
                  upper: entry.spread.upper,
                  level: null,
                  method: null,
                },
          provenance,
        }),
      );
    }
    const overview = Object.values(item.assets).find((asset) => asset.roles.includes("overview"));
    temporalObservations.push(
      TemporalObservation.parse({
        recordType: "TemporalObservation",
        id: `obs_${slug}_${month}`,
        revision: 1,
        createdAt: context.importedAt,
        updatedAt: context.importedAt,
        caseId: context.caseId,
        periodId,
        startDate: bounds.startDate,
        endDateExclusive: bounds.endDateExclusive,
        seasonDefinition: `Calendar month ${month} (UTC, start inclusive, end exclusive)`,
        geoSelectionId: geo.id,
        geoRevision: geo.revision,
        dataBundleId: bundleId,
        measurementIds,
        mapAssetUri:
          overview === undefined
            ? null
            : new URL(overview.href, new URL(`${periodId}/`, bundleUrl)).toString(),
        mapAssetHash: overview === undefined ? null : overview["file:checksum"],
        mapStatus: overview === undefined ? "missing" : "available",
        qualityFlags: props["siterra:quality_flags"],
        provenance,
      }),
    );
  }

  const dataset = collection["siterra:dataset"];
  const dataBundle = DataBundle.parse({
    recordType: "DataBundle",
    id: bundleId,
    revision: 1,
    createdAt: context.importedAt,
    updatedAt: context.importedAt,
    caseId: context.caseId,
    label:
      typeof collection["title"] === "string" && collection["title"] !== ""
        ? collection["title"]
        : bundleId,
    status: collection["siterra:status"],
    datasetId: dataset.id,
    datasetVersion: dataset.version,
    sourceIds,
    geoSelectionId: geo.id,
    geoRevision: geo.revision,
    periodIds: temporalObservations.map((o) => o.periodId),
    methodId: method.id,
    methodVersion: method.version,
    manifestUri: new URL("collection.json", bundleUrl).toString(),
    contentHash: sha256Multihash(collectionBytes),
    license: license === "other" && licenseTitles.length > 0 ? licenseTitles.join("; ") : license,
    attribution: collection["siterra:attribution"].join("; "),
    provenance,
  });
  return { bundle: { dataBundle, temporalObservations, measurements }, issues, predecessors };
}
