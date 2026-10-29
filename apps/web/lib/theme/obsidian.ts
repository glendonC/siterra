// Direction 1, SHD Obsidian: the theme of the instrument views, with the values of the approved specimens (five
// layers, cutaway, pixel anatomy). This file and app/obsidian.css are the only places where the instruments'
// colour values are written (VC-01). The one warm amber marks only the selected or proposed thing.

/** A colour as 0 to 1 channels, for shader uniforms that the specimens wrote as numbers. */
export type Channels = readonly [number, number, number];

/** Ground, ink and the accent. */
export const obsidian = {
  canvas: "#0b1012",
  accent: "#e07a3a",
  /** Leaders of the sheets that are not selected: ink at 62%. */
  leaderQuiet: "rgb(235 240 241 / 0.62)",
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
