// Zod mirror of schemas/stac/siterra-extension.schema.json (Siterra STAC extension 1.0.0): the
// siterra: fields and the bundle profile (one Collection per bundle, one Item per period). STAC
// core fields are kept as they come (loose objects); validating them against the STAC 1.1.0
// schemas is outside this mirror.
import { z } from "zod";
import { dateTime, isoDate, periodId } from "./primitives.ts";

export const siterraExtensionId = "https://siterra.invalid/schemas/stac/siterra/1.1.0/schema.json";
/** Every extension identifier this mirror accepts; 1.1.0 adds only optional fields to 1.0.0. */
export const siterraExtensionIds = [
  "https://siterra.invalid/schemas/stac/siterra/1.0.0/schema.json",
  siterraExtensionId,
] as const;

export const bundleIdPattern = /^bundle_[A-Za-z0-9][A-Za-z0-9_-]{1,79}$/;
export const bundleId = z.string().regex(bundleIdPattern);

export const BundleStatus = z.enum(["validated", "failed"]);
export const BundleVariable = z.enum([
  "ndvi_monthly_median",
  "ndvi_departure",
  "precipitation_monthly_total",
  "precipitation_departure",
  "elevation_band",
  "aspect_class",
  "landcover_mask",
  "snow_cover_fraction",
  "drainage_network",
  "elevation_profile",
  "pixel_anatomy",
  "elevation_surface",
  "optical_clear_share",
]);
export const PeriodStatus = z.enum(["available", "insufficient", "missing"]);
export const QualityFlag = z.enum([
  "snow_suspected",
  "terrain_shadow_suspected",
  "low_scene_count",
  "qa_join_incomplete",
  "partial_month",
  "reduced_qa_fallback",
]);
export const ColorScale = z.enum([
  "ndvi-sequential",
  "ndvi-anomaly-diverging",
  "rain-sequential",
  "rain-anomaly-diverging",
  "categorical-strata",
]);
export const CheckName = z.enum([
  "recompute_sample_period",
  "nodata_not_zero",
  "units_and_scale",
  "qa_join_coverage",
  "period_alignment",
  "attribution_present",
  "visual_inspection_sample",
]);

const uniqueStrings = <T extends z.ZodType<string>>(item: T) =>
  z.array(item).refine((xs) => new Set(xs).size === xs.length, {
    error: "Array items must be unique",
  });

export const StacDataset = z.strictObject({
  id: z.string().min(1),
  version: z.string().min(1).nullable(),
  access_route: z.string().min(1),
  resolution_note: z.string().min(1).nullable(),
});

export const StacGeoSelection = z.strictObject({
  id: z.string().regex(/^geo_[A-Za-z0-9][A-Za-z0-9_-]{1,79}$/),
  revision: z.int().min(1),
  boundary_role: z.enum([
    "regional_context",
    "landscape_sample",
    "administrative_unit",
    "hydrological_unit",
    "validated_management_unit",
  ]),
  area_m2: z.number().gt(0),
  area_method: z.string().min(1),
});

export const StacMethod = z.strictObject({
  id: z.string().min(1),
  version: z.string().min(1),
  analysis_crs: z.string().regex(/^EPSG:[0-9]+$/),
  parameters: z.record(z.string(), z.unknown()),
  reference_period: z
    .strictObject({
      start: isoDate,
      end_exclusive: isoDate,
      kind: z.enum(["short_reference", "climate_normal"]),
    })
    .nullable(),
  operation_order: z.array(z.string().min(1)).min(1),
});

export const StacCheck = z.strictObject({
  name: CheckName,
  passed: z.boolean(),
  detail: z.string().min(1),
});

export const StacMeasurement = z
  .strictObject({
    metric: z.string().min(1),
    value: z.number().nullable(),
    unit: z.string().min(1),
    aggregation: z.string().min(1),
    status: z.enum(["available", "missing", "excluded", "invalid"]),
    missing_reason: z.string().min(1).nullable().optional(),
    valid_pixel_count: z.int().min(0).nullable(),
    total_pixel_count: z.int().min(0).nullable(),
    spread: z
      .strictObject({ kind: z.enum(["spatial_iqr"]), lower: z.number(), upper: z.number() })
      .nullable(),
  })
  .superRefine((m, ctx) => {
    if (m.status === "available" && m.missing_reason != null) {
      ctx.addIssue({
        code: "custom",
        path: ["missing_reason"],
        message: "An available measurement has no missing reason",
      });
    }
    if (m.status === "available" && m.value === null) {
      ctx.addIssue({
        code: "custom",
        path: ["value"],
        message: "An available measurement needs a value",
      });
    }
    if (m.status !== "available" && m.value !== null) {
      ctx.addIssue({
        code: "custom",
        path: ["value"],
        message: "A measurement that is not available has a null value, never zero",
      });
    }
  });
export type StacMeasurement = z.infer<typeof StacMeasurement>;

/** Rejects siterra: keys that the extension does not define for this object. */
function onlySiterraKeys(allowed: readonly string[]) {
  return (value: Record<string, unknown>, ctx: z.RefinementCtx) => {
    for (const key of Object.keys(value)) {
      if (key.startsWith("siterra:") && !allowed.includes(key)) {
        ctx.addIssue({ code: "custom", path: [key], message: `Unknown extension field ${key}` });
      }
    }
  };
}

export const StacLink = z
  .looseObject({
    rel: z.string().min(1),
    href: z.string().min(1),
    "siterra:retrieved_datetime": dateTime.regex(/(\+00:00|Z)$/).optional(),
  })
  .superRefine(onlySiterraKeys(["siterra:retrieved_datetime"]));
export type StacLink = z.infer<typeof StacLink>;

const assetFields = {
  "siterra:color_scale": ColorScale.optional(),
  "siterra:domain": z.tuple([z.number(), z.number()]).optional(),
};
const assetFieldKeys = Object.keys(assetFields);

export const StacAssetFields = z
  .looseObject(assetFields)
  .superRefine(onlySiterraKeys(assetFieldKeys));

export const StacAsset = z
  .looseObject({
    href: z.string().min(1),
    type: z.string().min(1),
    roles: z.array(z.string().min(1)),
    "file:checksum": z.string().min(1),
    ...assetFields,
  })
  .superRefine(onlySiterraKeys(assetFieldKeys))
  .superRefine((asset, ctx) => {
    if (asset.roles.includes("overview")) {
      for (const key of ["siterra:color_scale", "siterra:domain"] as const) {
        if (asset[key] === undefined) {
          ctx.addIssue({ code: "custom", path: [key], message: `A display raster states ${key}` });
        }
      }
    }
  });
export type StacAsset = z.infer<typeof StacAsset>;

const itemSiterraKeys = [
  "siterra:period_status",
  "siterra:missing_reason",
  "siterra:area_valid_fraction",
  "siterra:observation_dates",
  "siterra:measurements",
  "siterra:quality_flags",
];

export const StacItemProperties = z
  .looseObject({
    datetime: z.null(),
    start_datetime: z.string().regex(/^[0-9]{4}-(0[1-9]|1[0-2])-01T00:00:00Z$/),
    end_datetime: z.string().regex(/^[0-9]{4}-(0[1-9]|1[0-2])-(28|29|30|31)T23:59:59Z$/),
    "raster:spatial_resolution": z.number(),
    "siterra:period_status": PeriodStatus,
    "siterra:missing_reason": z.string().min(1).nullable(),
    "siterra:area_valid_fraction": z.number().min(0).max(1).nullable(),
    "siterra:observation_dates": uniqueStrings(isoDate),
    "siterra:measurements": z.array(StacMeasurement),
    "siterra:quality_flags": uniqueStrings(QualityFlag),
  })
  .superRefine(onlySiterraKeys(itemSiterraKeys))
  .superRefine((p, ctx) => {
    if (p["siterra:period_status"] === "available") {
      if (p["siterra:missing_reason"] !== null) {
        ctx.addIssue({
          code: "custom",
          path: ["siterra:missing_reason"],
          message: "An available period has no missing reason",
        });
      }
      if (p["siterra:area_valid_fraction"] === null) {
        ctx.addIssue({
          code: "custom",
          path: ["siterra:area_valid_fraction"],
          message: "An available period states its valid area fraction",
        });
      }
      if (p["siterra:measurements"].length === 0) {
        ctx.addIssue({
          code: "custom",
          path: ["siterra:measurements"],
          message: "An available period has at least one measurement",
        });
      }
    } else if (p["siterra:missing_reason"] === null) {
      ctx.addIssue({
        code: "custom",
        path: ["siterra:missing_reason"],
        message: "A period that is not available states its reason",
      });
    }
  });

const stacExtensions = z
  .array(z.string())
  .refine((xs) => siterraExtensionIds.some((id) => xs.includes(id)), {
    error: "stac_extensions must list the Siterra extension",
  });

export const StacItem = z
  .looseObject({
    type: z.literal("Feature"),
    stac_extensions: stacExtensions,
    id: periodId,
    collection: bundleId,
    properties: StacItemProperties,
    assets: z.record(z.string(), StacAsset),
    links: z.array(StacLink).optional(),
  })
  .superRefine((item, ctx) => {
    if (
      item.properties["siterra:period_status"] === "missing" &&
      Object.keys(item.assets).length > 0
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["assets"],
        message: "A missing period carries no assets",
      });
    }
  });
export type StacItem = z.infer<typeof StacItem>;

const collectionSiterraKeys = [
  "siterra:status",
  "siterra:variable",
  "siterra:dataset",
  "siterra:geo_selection",
  "siterra:method",
  "siterra:attribution",
  "siterra:limitations",
  "siterra:checks",
];

const ProcessorProvider = z.looseObject({
  name: z.string(),
  roles: z.array(z.string()).refine((r) => r.includes("processor")),
  "processing:software": z.record(z.string(), z.unknown()).refine((s) => Object.keys(s).length > 0),
});

export const StacCollection = z
  .looseObject({
    type: z.literal("Collection"),
    stac_extensions: stacExtensions,
    id: bundleId,
    created: z.unknown().refine((v) => v !== undefined, { error: "created is required" }),
    providers: z.array(z.unknown()),
    assets: z.record(z.string(), StacAsset),
    item_assets: z.record(z.string(), StacAssetFields).optional(),
    links: z.array(StacLink),
    summaries: z.record(z.string(), z.unknown()).optional(),
    "siterra:status": BundleStatus,
    "siterra:variable": BundleVariable,
    "siterra:dataset": StacDataset,
    "siterra:geo_selection": StacGeoSelection,
    "siterra:method": StacMethod,
    "siterra:attribution": uniqueStrings(z.string().min(1)).min(1),
    "siterra:limitations": z.array(z.string().min(1)).min(1),
    "siterra:checks": z.array(StacCheck).min(1),
  })
  .superRefine(onlySiterraKeys(collectionSiterraKeys))
  .superRefine((c, ctx) => {
    if (!c.providers.some((p) => ProcessorProvider.safeParse(p).success)) {
      ctx.addIssue({
        code: "custom",
        path: ["providers"],
        message: "A processor provider with processing:software is required",
      });
    }
    const geometry = c.assets["analysis_geometry"];
    if (geometry === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["assets", "analysis_geometry"],
        message: "analysis_geometry is required",
      });
    } else if (geometry.type !== "application/geo+json" || !geometry.roles.includes("metadata")) {
      ctx.addIssue({
        code: "custom",
        path: ["assets", "analysis_geometry"],
        message: "analysis_geometry is GeoJSON with the metadata role",
      });
    }
    if (
      !c.links.some(
        (l) => l.rel === "processing-software" && typeof l["file:checksum"] === "string",
      )
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["links"],
        message: "A processing-software link with file:checksum is required",
      });
    }
    c.links.forEach((l, i) => {
      if (l.rel === "item" && l["file:checksum"] === undefined) {
        ctx.addIssue({
          code: "custom",
          path: ["links", i, "file:checksum"],
          message: "Item links carry a checksum",
        });
      }
    });
    if (c["siterra:status"] === "validated") {
      c["siterra:checks"].forEach((check, i) => {
        if (!check.passed) {
          ctx.addIssue({
            code: "custom",
            path: ["siterra:checks", i, "passed"],
            message: "A validated bundle has passed every recorded check",
          });
        }
      });
    }
    const summaries = c.summaries ?? {};
    for (const key of Object.keys(summaries)) {
      if (
        key.startsWith("siterra:") &&
        key !== "siterra:period_status" &&
        key !== "siterra:quality_flags"
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["summaries", key],
          message: `Unknown extension field ${key}`,
        });
      }
    }
  });
export type StacCollection = z.infer<typeof StacCollection>;
