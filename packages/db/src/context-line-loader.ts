// Reads the lines of the case's context features from bundle assets: the drainage lines (one
// MultiLineString per Strahler order), the transects (one LineString per transect) and the proposed
// routes (one LineString per route, labelled as a proposal with access unconfirmed, CF-04). The geometry
// is copied from the checksum-verified asset, never drawn or simplified; per-segment attributes stay
// in the asset, which the feature names in `dataBundle`.
import { readFileSync } from "node:fs";
import { ContextFeature } from "@siterra/contracts";
import { z } from "zod";
import type { ImportIssue, ImportedBundle } from "./bundle-import.ts";
import { resolveBundleAsset } from "./case-assets.ts";

const Position = z.tuple([z.number(), z.number(), z.number()]);
const LineFeature = <P extends z.ZodType>(properties: P) =>
  z.object({
    type: z.literal("Feature"),
    properties,
    geometry: z.object({ type: z.literal("LineString"), coordinates: z.array(Position).min(2) }),
  });
const Drainage = z.object({
  type: z.literal("FeatureCollection"),
  features: z.array(
    LineFeature(z.object({ segment_id: z.string(), strahler_order: z.int().min(1).max(12) })),
  ),
});
const Transects = z.object({
  type: z.literal("FeatureCollection"),
  features: z.array(LineFeature(z.object({ transect_id: z.string().min(1), label: z.string() }))),
});

const Routes = z.object({
  type: z.literal("FeatureCollection"),
  features: z.array(
    LineFeature(z.object({ route_id: z.string().min(1), target_id: z.string().min(1) })),
  ),
});
/** The result asset of the routes bundle: only the sites the routes end at are read. */
const RouteSites = z.object({
  sites: z.array(
    z.object({
      id: z.string().min(1),
      kind: z.enum(["pixel", "band"]),
      rule: z.string().min(1),
      band: z.int().optional(),
    }),
  ),
});

export const drainageMethodId = "drainage_network";
export const transectMethodId = "terrain_transects";
export const routesMethodId = "proposed_routes";

/**
 * One drainage ContextFeature per Strahler order, one transect ContextFeature per transect and one
 * route_proposed ContextFeature per proposed route, from the bundles the case holds. A bundle or asset that cannot be read or does not have the expected
 * shape is reported and gives no feature.
 */
export function readContextLines(args: {
  bundlesDir: string;
  bundles: readonly ImportedBundle[];
  caseId: string;
  importedAt: string;
}): { features: ContextFeature[]; issues: ImportIssue[] } {
  const issues: ImportIssue[] = [];
  const features: ContextFeature[] = [];

  const open = (bundle: ImportedBundle, assetKey: string): unknown => {
    const bundleId = bundle.dataBundle.id;
    const issue = (message: string) =>
      issues.push({ bundleId, path: `context-lines/${assetKey}`, message });
    if (bundle.dataBundle.contentHash === null) {
      issue("The bundle in the case has no content hash to verify the asset against");
      return null;
    }
    const resolved = resolveBundleAsset(args.bundlesDir, {
      bundleId,
      contentHash: bundle.dataBundle.contentHash,
      assetKey,
    });
    if (resolved.status !== "available") {
      issue(`Asset ${assetKey} cannot be read: ${resolved.status}`);
      return null;
    }
    try {
      return JSON.parse(readFileSync(resolved.file.absolutePath, "utf8"));
    } catch {
      issue(`Asset ${assetKey} is not JSON`);
      return null;
    }
  };

  const common = (bundle: ImportedBundle) => ({
    recordType: "ContextFeature" as const,
    revision: 1,
    createdAt: args.importedAt,
    updatedAt: args.importedAt,
    caseId: args.caseId,
    crs: "EPSG:4326" as const,
    datasetId: bundle.dataBundle.datasetId,
    sourceIds: bundle.dataBundle.sourceIds,
    attribution: bundle.dataBundle.attribution,
    license: bundle.dataBundle.license,
    limitations: bundle.dataBundle.provenance.limitations,
  });
  const keep = (bundle: ImportedBundle, assetKey: string, candidate: unknown) => {
    const parsed = ContextFeature.safeParse(candidate);
    if (parsed.success) {
      features.push(parsed.data);
      return;
    }
    for (const e of parsed.error.issues) {
      issues.push({
        bundleId: bundle.dataBundle.id,
        path: `context-lines/${assetKey}/${e.path.join("/")}`,
        message: e.message,
      });
    }
  };

  for (const bundle of args.bundles) {
    const bundleId = bundle.dataBundle.id;
    if (bundle.dataBundle.methodId === drainageMethodId) {
      const assetKey = "drainage_lines";
      const found = open(bundle, assetKey);
      if (found === null) continue;
      const parsed = Drainage.safeParse(found);
      if (!parsed.success) {
        issues.push({
          bundleId,
          path: `context-lines/${assetKey}`,
          message: "Not the expected GeoJSON lines",
        });
        continue;
      }
      const byOrder = new Map<number, [number, number, number][][]>();
      for (const f of parsed.data.features) {
        const order = f.properties.strahler_order;
        byOrder.set(order, [...(byOrder.get(order) ?? []), f.geometry.coordinates]);
      }
      for (const [order, lines] of [...byOrder].sort((a, b) => a[0] - b[0])) {
        keep(bundle, assetKey, {
          ...common(bundle),
          id: `ctx_drainage_order_${order}`,
          name: `Drainage lines, Strahler order ${order}`,
          role: "drainage",
          geometry: { type: "MultiLineString", coordinates: lines },
          method: `The ${lines.length} segments of Strahler order ${order} in the asset ${assetKey} of ${bundleId}, copied as the bundle lists them. A D8 path on a 30 m surface, a model estimate; segment attributes stay in the asset.`,
          dataBundle: { bundleId, assetKey },
          streamOrder: order,
        });
      }
    } else if (bundle.dataBundle.methodId === transectMethodId) {
      const assetKey = "transect_lines";
      const found = open(bundle, assetKey);
      if (found === null) continue;
      const parsed = Transects.safeParse(found);
      if (!parsed.success) {
        issues.push({
          bundleId,
          path: `context-lines/${assetKey}`,
          message: "Not the expected GeoJSON lines",
        });
        continue;
      }
      for (const f of parsed.data.features) {
        keep(bundle, assetKey, {
          ...common(bundle),
          id: `ctx_transect_${f.properties.transect_id}`,
          name: f.properties.label,
          role: "transect",
          geometry: f.geometry,
          method: `The line ${f.properties.transect_id} in the asset ${assetKey} of ${bundleId}, copied as the bundle lists it; heights are sampled from the 30 m surface.`,
          dataBundle: { bundleId, assetKey, member: f.properties.transect_id },
        });
      }
    } else if (bundle.dataBundle.methodId === routesMethodId) {
      const assetKey = "route_lines";
      const found = open(bundle, assetKey);
      const resultFound = open(bundle, "proposed_routes");
      if (found === null || resultFound === null) continue;
      const parsed = Routes.safeParse(found);
      const sites = RouteSites.safeParse(resultFound);
      if (!parsed.success || !sites.success) {
        issues.push({
          bundleId,
          path: `context-lines/${assetKey}`,
          message: "Not the expected GeoJSON lines and sites",
        });
        continue;
      }
      const siteById = new Map(sites.data.sites.map((s) => [s.id, s]));
      for (const f of parsed.data.features) {
        const site = siteById.get(f.properties.target_id);
        if (site === undefined) {
          issues.push({
            bundleId,
            path: `context-lines/${assetKey}/${f.properties.route_id}`,
            message: `The route ends at ${f.properties.target_id}, which the bundle lists no site for`,
          });
          continue;
        }
        const target =
          site.kind === "pixel"
            ? "the pixel the case opens"
            : `elevation band ${site.band === undefined ? site.id : String(site.band)}`;
        keep(bundle, assetKey, {
          ...common(bundle),
          id: `ctx_${f.properties.route_id}`,
          name: `Proposed route to ${target} (candidate site chosen by a stated rule)`,
          role: "route_proposed",
          geometry: f.geometry,
          method: `The line ${f.properties.route_id} in the asset ${assetKey} of ${bundleId}, copied as the bundle lists it: the least-time walk over a 30 m surface model, a model estimate and not a surveyed path. It ends at ${site.id}, a candidate site chosen by a stated rule: ${site.rule}.`,
          limitations: [
            ...bundle.dataBundle.provenance.limitations,
            `The end of the line is a candidate site chosen by a stated rule: ${site.rule}; it is not a sampling design or a management unit.`,
          ].filter((text, i, all) => all.indexOf(text) === i),
          dataBundle: { bundleId, assetKey, member: f.properties.route_id },
        });
      }
    }
  }
  return { features, issues };
}
