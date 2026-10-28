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
  /** Hillshade over imagery: cool shadow, warm highlight, both partly transparent so the imagery shows. */
  hillshadeShadow: "rgba(90, 100, 112, 0.85)",
  hillshadeHighlight: "rgba(255, 244, 230, 0.55)",
  hillshadeAccent: "rgba(120, 134, 147, 0.25)",
  /** Paper laid over the land outside the catchment (design language: outside mixed toward paper). */
  outsideVeil: "rgba(232, 226, 216, 0.82)",
  /** The warm light pool inside the catchment (design language rule 2: selection is light, not paint). */
  pool: "rgba(245, 200, 140, 0.25)",
  sky: "#f2efea",
  horizon: "#f2efea",
  fog: "#f2efea",
} as const;

export type DaylightTokens = typeof daylight;
