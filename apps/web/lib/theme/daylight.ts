// Daylight theme values for the map stage (design language 1.3), plus the three switchable visual
// directions on /prototype: 1 SHD Obsidian Table, 2 Mireye Daylight Model, 3 Dune Nocturnal Volume.
// This file and app/daylight.css are the only token definition files where colour literals are written (VC-01).

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
  /** Edges of the rain squares in the /prototype run: ink at 55%. */
  rainLine: "rgba(43, 41, 37, 0.55)",
} as const;

/** data.rain-total, light theme (design/tokens): three display classes, not the 1991 to 2020 thirds. */
export const rainTotal = {
  class1: "#a0cff7",
  class2: "#6ba1dc",
  class3: "#4273bb",
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

export type DirectionId = "1" | "2" | "3";

export interface DirectionMapPalette {
  paper: string;
  ink: string;
  accent: string;
  keyLight: string;
  outline: string;
  outlineCasing: string;
  hillshadeShadow: string;
  hillshadeHighlight: string;
  hillshadeAccent: string;
  outsideVeil: string;
  outsideVeilOpacity: number;
  pool: string;
  contour: string;
  contourIndex: string;
  excludedHatch: string;
  sky: string;
  horizon: string;
  fog: string;
  rainLine: string;
  rainDryPulse: string;
  imagerySaturation: number;
  imageryBrightnessMin: number;
  imageryBrightnessMax: number;
  imageryContrast: number;
  bandLower: string;
  bandMiddle: string;
  bandUpper: string;
  bandLimit: string;
  trendUpStrong: string;
  trendUpMod: string;
  trendNeutral: string;
}

export const directionPalettes: Record<DirectionId, DirectionMapPalette> = {
  "1": {
    paper: "#0b1012",
    ink: "#ebf0f1",
    accent: "#e07a3a",
    keyLight: "#ffdcb8",
    outline: "#e07a3a",
    outlineCasing: "#070b0d",
    hillshadeShadow: "rgba(3, 6, 8, 0.78)",
    hillshadeHighlight: "rgba(155, 195, 210, 0.34)",
    hillshadeAccent: "rgba(224, 122, 58, 0.22)",
    outsideVeil: "#090e10",
    outsideVeilOpacity: 0.56,
    pool: "rgba(224, 122, 58, 0.14)",
    contour: "rgba(183, 196, 200, 0.14)",
    contourIndex: "rgba(224, 122, 58, 0.32)",
    excludedHatch: "#96a0a3",
    sky: "#0b1012",
    horizon: "#131c20",
    fog: "#0e1518",
    rainLine: "rgba(183, 196, 200, 0.48)",
    rainDryPulse: "#e07a3a",
    imagerySaturation: -0.35,
    imageryBrightnessMin: 0.04,
    imageryBrightnessMax: 0.62,
    imageryContrast: 0.28,
    bandLower: "rgba(55, 157, 127, 0.16)",
    bandMiddle: "rgba(99, 188, 208, 0.18)",
    bandUpper: "rgba(141, 194, 250, 0.22)",
    bandLimit: "rgba(235, 240, 241, 0.52)",
    trendUpStrong: "#57d4ae",
    trendUpMod: "#379d7f",
    trendNeutral: "#2d3132",
  },
  "2": {
    paper: "#f2efea",
    ink: "#2b2925",
    accent: "#b5561f",
    keyLight: "#fff4e6",
    outline: "#2b2925",
    outlineCasing: "#f2efea",
    hillshadeShadow: "rgba(74, 82, 92, 0.48)",
    hillshadeHighlight: "rgba(255, 246, 230, 0.42)",
    hillshadeAccent: "rgba(140, 105, 75, 0.2)",
    outsideVeil: "#e8e2d8",
    outsideVeilOpacity: 0.48,
    pool: "rgba(245, 200, 140, 0.18)",
    contour: "rgba(43, 41, 37, 0.08)",
    contourIndex: "rgba(43, 41, 37, 0.18)",
    excludedHatch: "#6b6762",
    sky: "#f2efea",
    horizon: "#f7f5f0",
    fog: "#f2efea",
    rainLine: "rgba(43, 41, 37, 0.48)",
    rainDryPulse: "#b5561f",
    imagerySaturation: 0.18,
    imageryBrightnessMin: 0.06,
    imageryBrightnessMax: 0.96,
    imageryContrast: 0.16,
    bandLower: "rgba(22, 134, 106, 0.14)",
    bandMiddle: "rgba(66, 115, 187, 0.16)",
    bandUpper: "rgba(120, 134, 147, 0.24)",
    bandLimit: "rgba(43, 41, 37, 0.62)",
    trendUpStrong: "#16866a",
    trendUpMod: "#4eb293",
    trendNeutral: "#f8f6f4",
  },
  "3": {
    paper: "#120f0c",
    ink: "#f2ece1",
    accent: "#d49b4b",
    keyLight: "#ffe6bd",
    outline: "#d49b4b",
    outlineCasing: "#0b0907",
    hillshadeShadow: "rgba(5, 4, 2, 0.82)",
    hillshadeHighlight: "rgba(218, 186, 136, 0.36)",
    hillshadeAccent: "rgba(212, 155, 75, 0.25)",
    outsideVeil: "#0f0c09",
    outsideVeilOpacity: 0.6,
    pool: "rgba(212, 155, 75, 0.18)",
    contour: "rgba(200, 191, 168, 0.16)",
    contourIndex: "rgba(212, 155, 75, 0.36)",
    excludedHatch: "#a09686",
    sky: "#120f0c",
    horizon: "#1f1913",
    fog: "#17130f",
    rainLine: "rgba(200, 191, 168, 0.45)",
    rainDryPulse: "#d49b4b",
    imagerySaturation: -0.45,
    imageryBrightnessMin: 0.03,
    imageryBrightnessMax: 0.58,
    imageryContrast: 0.32,
    bandLower: "rgba(87, 212, 174, 0.15)",
    bandMiddle: "rgba(212, 155, 75, 0.16)",
    bandUpper: "rgba(200, 191, 168, 0.22)",
    bandLimit: "rgba(242, 236, 225, 0.52)",
    trendUpStrong: "#57d4ae",
    trendUpMod: "#379d7f",
    trendNeutral: "#32302d",
  },
};
