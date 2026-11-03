// The pixel anatomy's fixture from the S3 bundle (bundle_pixel_anatomy_ait_bouguemez) and the season trend tables
// (the elevation band's March to June record). Pure, with type imports only, so the lane's copy script and the
// fixture test run the same code. Two parts are derived here, each by a stated rule: the Theil-Sen line's intercept
// (median of the residuals) and the proposed field transect (a deterministic proposal, never a measurement).
// The model's NDVI is not stored: the page computes it live from the class medians and shares.

/** The composition bar's class order: tree cover, cropland, grassland, bare or sparse vegetation. */
export const CLASS_ORDER = [10, 40, 30, 60] as const;
/** Grassland and bare or sparse vegetation: where the proposed transect may run. */
const OPEN = new Set([30, 60]);
const TRANSECT = { cells: 10, cell_m: 10 };
/** The model's example shift, as the bundle states it: tree cover +20 points, taken from grassland. */
const SHIFT = { from: 30, to: 10, points: 20 };

type Season = { year: number; ndvi: number };

interface Cells {
  grid: {
    rows: number;
    cols: number;
    origin_x: number;
    origin_y: number;
    inside: number[][];
    worldcover: number[][];
    ndvi_median: (number | null)[][];
    truecolour_rgb: [number, number, number][][];
    crs?: string;
  };
  ndvi_month: string;
}

interface Sources {
  [path: string]: unknown;
}

/** A source by its file name, wherever the place's bundle lies (every place's bundle holds the same files). */
function fileNamed(src: Sources, sources: readonly { path: string }[], name: string): unknown {
  const path = sources.find((s) => s.path.endsWith(`/${name}`))?.path;
  if (path === undefined || !(path in src)) throw new Error(`The pixel anatomy has no ${name}`);
  return src[path];
}

const median = (v: readonly number[]) => {
  const r = [...v].sort((a, b) => a - b);
  const m = Math.floor(r.length / 2);
  return r.length % 2 ? (r[m] ?? 0) : ((r[m - 1] ?? 0) + (r[m] ?? 0)) / 2;
};

/** The Theil-Sen line's intercept for a slope per year, as scipy's theilslopes gives it: median(y) - slope x median(x). */
export function theilSenIntercept(seasons: readonly Season[], slopePerYear: number): number {
  return median(seasons.map((s) => s.ndvi)) - slopePerYear * median(seasons.map((s) => s.year));
}

/**
 * The proposed transect: the row nearest the middle of the rows where grassland or bare cells are at least half the
 * row's cells inside the footprint; ten cells centred on that row's longest run of grassland or bare cells; one 1 m
 * quadrat at the centre of each 10 m cell. Its ends are the run's outer cell edges on the row's centre line.
 */
export function proposeTransect(cells: Cells) {
  const g = cells.grid;
  const rows: number[] = [];
  for (let r = 0; r < g.rows; r++) {
    let inside = 0;
    let open = 0;
    for (let c = 0; c < g.cols; c++) {
      if (!g.inside[r]?.[c]) continue;
      inside++;
      if (OPEN.has(g.worldcover[r]?.[c] ?? -1)) open++;
    }
    if (inside > 0 && open * 2 >= inside) rows.push(r);
  }
  const first = rows[0] ?? 0;
  const mid = (first + (rows.at(-1) ?? first)) / 2;
  const row = rows.reduce(
    (best, r) => (Math.abs(r - mid) < Math.abs(best - mid) ? r : best),
    first,
  );
  let runStart = 0;
  let runLen = 0;
  for (let c = 0; c < g.cols;) {
    const ok = (k: number) => Boolean(g.inside[row]?.[k]) && OPEN.has(g.worldcover[row]?.[k] ?? -1);
    if (!ok(c)) {
      c++;
      continue;
    }
    let e = c;
    while (e < g.cols && ok(e)) e++;
    if (e - c > runLen) {
      runStart = c;
      runLen = e - c;
    }
    c = e;
  }
  const col = Math.min(
    g.cols - TRANSECT.cells,
    Math.max(0, runStart + Math.floor((runLen - TRANSECT.cells) / 2)),
  );
  const x0 = g.origin_x + col * TRANSECT.cell_m;
  const y = g.origin_y - (row + 0.5) * TRANSECT.cell_m;
  const length_m = TRANSECT.cells * TRANSECT.cell_m;
  return {
    length_m,
    quadrats: TRANSECT.cells,
    spacing_m: TRANSECT.cell_m,
    start_utm29n: [x0, y] as [number, number],
    end_utm29n: [x0 + length_m, y] as [number, number],
  };
}

/** The page's data file, from the bundle files and the season tables keyed by their repository paths. */
export function pixelFixture(src: Sources, sources: { path: string; sha256: string }[]) {
  // the bundle's 1.0.0 and 1.1.0 names: 1.1.0 states the footprint's CRS beside its corners and names the
  // month's NDVI by its month; 1.0.0 named both after the first place (utm29n, june)
  const anatomy = fileNamed(src, sources, "pixel-anatomy.json") as {
    pixel: {
      modis_tile: string;
      tile_row: number;
      tile_col: number;
      footprint_cells: number;
      footprint_corners?: [number, number][];
      footprint_corners_crs?: string;
      footprint_corners_utm29n?: [number, number][];
    };
    trend: { slope_per_decade: number };
    composition: { code: number; cells: number }[];
    month_ndvi?: { count_min: number; count_max: number };
    june_ndvi?: { count_min: number; count_max: number };
    selection: { note: string; chosen_by: string };
  };
  const cells = fileNamed(src, sources, "pixel-cells.json") as Cells;
  const footprint = anatomy.pixel.footprint_corners ?? anatomy.pixel.footprint_corners_utm29n;
  if (!footprint) throw new Error("The pixel anatomy states no footprint corners");
  const fpCrs = anatomy.pixel.footprint_corners_crs;
  if (fpCrs !== undefined && cells.grid.crs !== undefined && fpCrs !== cells.grid.crs)
    throw new Error(`The footprint's CRS ${fpCrs} is not the cells' grid CRS ${cells.grid.crs}`);
  const monthNdvi = anatomy.month_ndvi ?? anatomy.june_ndvi;
  if (!monthNdvi) throw new Error("The pixel anatomy states no month NDVI counts");
  const spectra = fileNamed(src, sources, "pixel-spectra.json") as {
    datetime: string;
    cells_inside_kept: number;
    bands: string[];
    wavelengths: Record<string, { center_wavelength_um: number; full_width_half_max_um: number }>;
    classes: {
      code: number;
      cells_kept: number;
      median: Record<string, number>;
      ndvi_of_median_red_nir: number;
    }[];
    pixel_measured: { mean_reflectance: Record<string, number>; ndvi_of_mean_red_nir: number };
  };
  const series = fileNamed(src, sources, "pixel-series.json") as {
    /** The season the series is over ("mar_jun", "feb_may"); absent, the first place's. */
    window?: string;
    seasons: Season[];
    theil_sen: { slope_per_decade: number; lower_per_decade: number; upper_per_decade: number };
  };
  const tables = fileNamed(src, sources, "season-trend-long-record-tables.json") as {
    seasons: {
      stratum: string;
      growing_window: string;
      reliability: string;
      year: number;
      ndvi: number;
    }[];
  };
  const total = anatomy.pixel.footprint_cells;
  const share = (code: number) =>
    (anatomy.composition.find((k) => k.code === code)?.cells ?? 0) / total;
  const pixelSeasons = series.seasons.map((s) => ({ year: s.year, ndvi: s.ndvi }));
  const g = cells.grid;
  return {
    sources,
    selection: { note: anatomy.selection.note, chosenBy: anatomy.selection.chosen_by },
    pixel: {
      modis_tile: anatomy.pixel.modis_tile,
      tile_row: anatomy.pixel.tile_row,
      tile_col: anatomy.pixel.tile_col,
      analysis_cells: total,
      footprint_utm29n: footprint,
      trend_mar_jun: { slope_per_decade: anatomy.trend.slope_per_decade },
    },
    grid: {
      rows: g.rows,
      cols: g.cols,
      origin_x: g.origin_x,
      origin_y: g.origin_y,
      truecolour_rgb: g.truecolour_rgb,
      ndvi_median: g.ndvi_median,
      worldcover: g.worldcover,
    },
    ndvi_month: cells.ndvi_month,
    ndvi_inside: { count_min: monthNdvi.count_min, count_max: monthNdvi.count_max },
    classes: CLASS_ORDER.map((code) => {
      const k = spectra.classes.find((c) => c.code === code);
      return {
        code,
        cells: anatomy.composition.find((c) => c.code === code)?.cells ?? 0,
        cells_kept: k?.cells_kept ?? 0,
        share: share(code),
        median: k?.median ?? {},
        ndvi_of_median: k?.ndvi_of_median_red_nir ?? 0,
      };
    }),
    measured_shares: Object.fromEntries(CLASS_ORDER.map((code) => [String(code), share(code)])),
    spectra: {
      datetime: spectra.datetime,
      cells_kept: spectra.cells_inside_kept,
      measured_ndvi: spectra.pixel_measured.ndvi_of_mean_red_nir,
      pixel_mean: spectra.pixel_measured.mean_reflectance,
      bands: spectra.bands,
      wavelengths: spectra.wavelengths,
    },
    model: { shift: SHIFT },
    series: {
      pixel: pixelSeasons,
      band: tables.seasons
        .filter(
          (s) =>
            s.stratum === "elevation_low" &&
            s.growing_window === (series.window ?? "mar_jun") &&
            s.reliability === "reliability_0_1",
        )
        .map((s) => ({ year: s.year, ndvi: s.ndvi })),
      pixel_theil_sen: series.theil_sen,
      pixel_line_intercept: theilSenIntercept(pixelSeasons, series.theil_sen.slope_per_decade / 10),
    },
    transect: proposeTransect(cells),
  };
}
