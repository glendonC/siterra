// Direction 1, SHD Obsidian: the theme of the instrument views, with the values of the approved specimens (five
// layers, cutaway, pixel anatomy). This file and app/obsidian.css are the only places where the instruments'
// colour values are written (VC-01). The one warm amber marks only the selected or proposed thing.

/** A colour as 0 to 1 channels, for shader uniforms that the specimens wrote as numbers. */
export type Channels = readonly [number, number, number];

/** A colour computed from these tokens (0 to 1 channels, as the ramps give them) written as CSS. */
export const cssColour = (c: readonly number[]) =>
  `rgb(${c.map((k) => Math.round(k * 255)).join(" ")})`;

/** Ground, ink and the accent. */
export const obsidian = {
  canvas: "#0b1012",
  accent: "#e07a3a",
  /** Leaders of the sheets that are not selected: ink at 62%. */
  leaderQuiet: "rgb(235 240 241 / 0.62)",
  /** A leader's end on the model: ink at 90%. */
  leaderDot: "rgb(235 240 241 / 0.9)",
  /** A leader drawn across the lit section face: the on-wall ink at 70%. */
  leaderOnWall: "rgb(19 26 29 / 0.7)",
} as const;

/** The land as a model on a table: relief and section walls under one warm low light. */
export const modelColours = {
  keyLight: "#ffe2bf",
  ambient: "#55636b",
  reliefAlbedo: "#a3a9aa",
  reliefShadow: "#0f1416",
  contour: "#e9eef0",
  coverTree: "#5c8f63",
  coverCrop: "#c9b77a",
  bandLimit: [0.97, 0.98, 0.99] as Channels,
  wallAlbedo: "#59636a",
  wallContour: "#c9d2d5",
  wallBandTint: "#c3d3db",
  wallLimit: [0.96, 0.97, 0.98] as Channels,
  /** The cutaway: a warmer key light facing the section, and the section face lighter than the catchment wall. */
  sectionKeyLight: "#ffd9ae",
  sectionAlbedo: "#8e9396",
  sectionBandTint: "#bcd0da",
  /** The table shadow under the model: black, its strength set where it is drawn. */
  tableShadow: "#000000",
  catchmentLine: "#dfe7ea",
  /** Drainage by Strahler order, darker for the small streams. */
  drainage: ["#5f8ea9", "#6c9bb6", "#7eaecb", "#8fbcd8", "#9ccbe6"],
} as const;

/** The sheets above the model: plate, rim, outline, and each layer's data colours. */
export const sheetColours = {
  plate: "#ffffff",
  plateRim: "#edf3f5",
  outline: "#eef4f6",
  trendBelow: ["#6b5a3c", "#b27d3b", "#f2a85f"],
  trendAbove: ["#2f6f5c", "#379d7f", "#57d4ae"],
  trendNeutral: [0.62, 0.66, 0.67] as Channels,
  /** The middle of the trend key: the neutral band as the key draws it. */
  trendKeyNeutral: "#3a3f40",
  rain: ["#2d4a63", "#3f6f9c", "#5e95d0", "#9cc5fb"],
  rainEdge: "#a9cdf3",
  snow: ["#24394a", "#4f7ea3", "#9cc9ea", "#e6f5ff"],
  bandTint: "#b9cbd4",
  coverTree: "#5f9a68",
  coverCrop: "#d8c27c",
  swatchTrend: "#57d4ae",
  swatchRain: "#5e95d0",
  swatchSnow: "#9cc9ea",
} as const;

/** The pixel anatomy (approved specimen C): WorldCover classes, the June NDVI ramp, the locator and the charts. */
export const pixelColours = {
  /** WorldCover classes by code: tree cover, cropland, grassland, bare or sparse vegetation. */
  classes: { 10: "#3b7a2c", 40: "#956ed2", 30: "#a4932e", 60: "#3b5d96" } as Record<number, string>,
  /** A class the key does not list. */
  otherClass: "#5a5f61",
  /** NDVI of the June median by step, below the first break to above the last. */
  ndviSteps: ["#3e3504", "#584d09", "#676c0f", "#619116", "#5fb25e", "#86ca99", "#bedec3"],
  /** A cell without an NDVI value. */
  noValue: "#2d3132",
  /** The locator's March to June slope key: browning arm, the neutral middle, greening arm. */
  slopeBelow: ["#745426", "#b27d3b", "#f2a85f"],
  slopeNeutral: "#2d3132",
  slopeAbove: ["#266854", "#379d7f", "#57d4ae"],
  locatorGround: "#141c20",
  locatorOutline: "rgb(183 196 200 / 0.55)",
  /** Lines between the 10 m cells, and the veil over cells outside the pixel. */
  cellLine: "rgb(11 16 18 / 0.55)",
  veil: "rgb(11 16 18 / 0.74)",
  gridLine: "rgb(183 196 200 / 0.16)",
  /** The NDVI bands' shading on the spectra chart. */
  bandShade: "rgb(235 240 241 / 0.07)",
  axis: "#8c9a9f",
  ink2: "#b7c4c8",
  ink: "#ebf0f1",
  /** The pixel's own season record. */
  series: "#5fb25e",
  connector: "rgb(183 196 200 / 0.38)",
  connectorWarm: "rgb(224 122 58 / 0.7)",
} as const;

/**
 * The overview (approved specimen D4): the land lit and draped as in specimen B with a cool rim and fog, the arc's
 * two tints, the drainage and outline on the land, and the mask stops of its depth of field.
 */
export const overviewColours = {
  keyLight: "#ffd9ae",
  ambient: "#55636b",
  sky: "#8fb3c4",
  reliefAlbedo: "#a6a8a3",
  contour: "#e9eef0",
  coverTree: "#5c8f63",
  coverCrop: "#93b872",
  bandLimit: [0.93, 0.96, 0.97] as Channels,
  fog: "#10181b",
  rim: "#a9c9d4",
  wallAlbedo: "#2c3336",
  catchmentLine: "#e3eaec",
  /** The arc's tint: the darker toward the lower right, the lighter toward the upper left (the key light's side). */
  arcDim: [0.498, 0.573, 0.596] as Channels,
  arcLit: [0.769, 0.839, 0.859] as Channels,
  /** The opened pixel's footprint on the land. */
  footprint: "#f4f7f8",
  /** The proposed walking routes: the one warm amber, for a proposed thing. */
  route: obsidian.accent,
  drainage: modelColours.drainage,
} as const;

/** A CSS mask stop: black at an alpha (0 to 1); a mask reads only the alpha. */
export const maskAt = (alpha: number) => `rgb(0 0 0 / ${alpha.toFixed(3)})`;
