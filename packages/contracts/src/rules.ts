import type { z } from "zod";

/**
 * Missing is a value: an available measurement has a number and no missing reason; any other
 * status has a null value and a stated reason (case.schema.json Measurement allOf).
 */
export function missingIsAValue(
  measurement: { status: string; value: number | null; missingReason: string | null },
  ctx: z.RefinementCtx,
): void {
  if (measurement.status === "available") {
    if (measurement.value === null) {
      ctx.addIssue({
        code: "custom",
        path: ["value"],
        message: "An available measurement needs a value",
      });
    }
    if (measurement.missingReason !== null) {
      ctx.addIssue({
        code: "custom",
        path: ["missingReason"],
        message: "An available measurement has no missing reason",
      });
    }
  } else {
    if (measurement.value !== null) {
      ctx.addIssue({
        code: "custom",
        path: ["value"],
        message: "A measurement that is not available has a null value, never zero",
      });
    }
    if (measurement.missingReason === null) {
      ctx.addIssue({
        code: "custom",
        path: ["missingReason"],
        message: "A measurement that is not available states its reason",
      });
    }
  }
}

const pointRoles: readonly string[] = [
  "outlet",
  "settlement",
  "settlement_locator",
  "viewpoint",
  "summit",
];
const lineTypesByRole: Readonly<Record<string, readonly string[]>> = {
  drainage: ["LineString", "MultiLineString"],
  transect: ["LineString"],
  route_proposed: ["LineString", "MultiLineString"],
};

type Position = readonly number[];

function positionsOf(geometry: { type: string; coordinates: unknown }): Position[] {
  switch (geometry.type) {
    case "Point":
      return [geometry.coordinates as Position];
    case "LineString":
      return geometry.coordinates as Position[];
    case "MultiLineString":
      return (geometry.coordinates as Position[][]).flat();
    default:
      return [];
  }
}

/**
 * A ContextFeature's role fits its geometry (points: outlet, settlement, settlement_locator,
 * viewpoint, summit; lines: drainage and route_proposed as a line or several, transect as one
 * line), its positions carry an elevation all together or not at all, and only a drainage feature
 * has a stream order (case.schema.json ContextFeature allOf; the all-or-none part is stated in
 * Position).
 */
export function contextFeatureShape(
  feature: {
    role: string;
    geometry: { type: string; coordinates: unknown };
    streamOrder?: number | undefined;
  },
  ctx: z.RefinementCtx,
): void {
  if (feature.streamOrder !== undefined && feature.role !== "drainage") {
    ctx.addIssue({
      code: "custom",
      path: ["streamOrder"],
      message: "Only a drainage feature has a stream order",
    });
  }
  const allowed = pointRoles.includes(feature.role)
    ? ["Point"]
    : (lineTypesByRole[feature.role] ?? []);
  if (!allowed.includes(feature.geometry.type)) {
    ctx.addIssue({
      code: "custom",
      path: ["geometry", "type"],
      message: `A ${feature.role} feature is a ${allowed.join(" or ")}, not a ${feature.geometry.type}`,
    });
  }
  const positions = positionsOf(feature.geometry);
  const withElevation = positions.filter((position) => position.length === 3).length;
  if (withElevation !== 0 && withElevation !== positions.length) {
    ctx.addIssue({
      code: "custom",
      path: ["geometry", "coordinates"],
      message: "A feature has an elevation on every position or on none",
    });
  }
}
