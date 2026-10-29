// Daylight theme values for the map stage (design language 1.3). This file is a token definition: the only
// place in the app where these colours are written. It is replaced by the public tokens once the design
// lane moves the daylight theme into design/tokens.

export const daylight = {
  paper: "#f2efea",
  ink: "#2b2925",
  grey: "#6b6762",
  shadowTint: "#788693",
  accent: "#b5561f",
  keyLight: "#fff4e6",
  albedo: "#dcd4c9",
  /** Ink for the catchment line (the approved frame draws it near full ink). */
  outline: "rgba(43, 41, 37, 0.92)",
  /** Paper casing under the catchment line and halos under names. */
  outlineCasing: "#f2efea",
  /** Hillshade over the drape: a light warm-brown shadow and a warm highlight, so no grey sits on the land. */
  hillshadeShadow: "rgba(92, 84, 78, 0.42)",
  hillshadeHighlight: "rgba(255, 240, 220, 0.35)",
  hillshadeAccent: "rgba(120, 95, 70, 0.15)",
  /**
   * Paper laid over the land outside the catchment (design language: outside mixed toward paper); its
   * opacity depends on zoom (VEIL_OPACITY in the style).
   */
  outsideVeil: "#e8e2d8",
  /** The warm light pool inside the catchment (design language rule 2: selection is light, not paint). */
  pool: "rgba(245, 200, 140, 0.15)",
  /** Contours, 100 m and 500 m: ink at 4.5% and 9% (design system, cartography; map.contour, map.contour-index). */
  contour: "rgba(43, 41, 37, 0.045)",
  contourIndex: "rgba(43, 41, 37, 0.09)",
  /** data.excluded-hatch, light theme: 135 degree hatch, 1 px stroke, 6 px spacing. */
  excludedHatch: "#878481",
  excludedHatchEdge: "rgb(135 132 129 / 0.6)",
  sky: "#f2efea",
  horizon: "#f2efea",
  fog: "#f2efea",
} as const;

export type DaylightTokens = typeof daylight;

/** data.ndvi-departure, light theme (design/tokens); the same values as the bundle's display rasters. */
export const ndviDeparture = {
  below3: "#a26112",
  below2: "#c79150",
  below1: "#e7c293",
  reference: "#f8f6f4",
  above1: "#97d9c1",
  above2: "#4eb293",
  above3: "#16866a",
} as const;
