export interface LandCoverGrid {
  width: number;
  height: number;
  tree: number[];
  crop: number[];
  grass?: number[];
  water?: number[];
  bare?: number[];
}

/**
 * Computes the Web Mercator Bing/Slippy quadkey (default zoom 9) used by Meta AI & WRI's
 * 1-meter Global Canopy Height Map (`s3://dataforgood-fb-data/forests/v1/alsgedi_global_v6_float/`).
 */
export function latLonToMetaCanopyQuadKey(lat: number, lon: number, zoom = 9): string {
  const clampedLat = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const clampedLon = Math.max(-180, Math.min(179.999999, lon));
  const sinLat = Math.sin((clampedLat * Math.PI) / 180);
  const n = 2 ** zoom;
  const x = Math.max(0, Math.min(n - 1, Math.floor(((clampedLon + 180) / 360) * n)));
  const y = Math.max(
    0,
    Math.min(n - 1, Math.floor((0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * n)),
  );
  let quadKey = "";
  for (let i = zoom; i > 0; i--) {
    let digit = 0;
    const mask = 1 << (i - 1);
    if ((x & mask) !== 0) digit += 1;
    if ((y & mask) !== 0) digit += 2;
    quadKey += String(digit);
  }
  return quadKey;
}

type WorldCoverBucket = "tree" | "crop" | "grass" | "water" | "bare";

const WORLDCOVER_PALETTE: ReadonlyArray<{
  bucket: WorldCoverBucket;
  r: number;
  g: number;
  b: number;
  treeVal: number;
  cropVal: number;
  grassVal: number;
  waterVal: number;
  bareVal: number;
}> = [
  // 10: Tree cover [0, 100, 0]
  {
    bucket: "tree",
    r: 0,
    g: 100,
    b: 0,
    treeVal: 255,
    cropVal: 0,
    grassVal: 0,
    waterVal: 0,
    bareVal: 0,
  },
  // 95: Mangroves [0, 207, 117]
  {
    bucket: "tree",
    r: 0,
    g: 207,
    b: 117,
    treeVal: 240,
    cropVal: 0,
    grassVal: 0,
    waterVal: 60,
    bareVal: 0,
  },
  // 20: Shrubland [255, 187, 34] -> woody shrub / dryland rangeland
  {
    bucket: "grass",
    r: 255,
    g: 187,
    b: 34,
    treeVal: 85,
    cropVal: 0,
    grassVal: 210,
    waterVal: 0,
    bareVal: 0,
  },
  // 30: Grassland [255, 255, 76]
  {
    bucket: "grass",
    r: 255,
    g: 255,
    b: 76,
    treeVal: 0,
    cropVal: 0,
    grassVal: 255,
    waterVal: 0,
    bareVal: 0,
  },
  // 100: Moss and lichen [250, 230, 160]
  {
    bucket: "grass",
    r: 250,
    g: 230,
    b: 160,
    treeVal: 0,
    cropVal: 0,
    grassVal: 195,
    waterVal: 0,
    bareVal: 60,
  },
  // 40: Cropland [240, 150, 255]
  {
    bucket: "crop",
    r: 240,
    g: 150,
    b: 255,
    treeVal: 0,
    cropVal: 255,
    grassVal: 0,
    waterVal: 0,
    bareVal: 0,
  },
  // 50: Built-up [250, 0, 0]
  {
    bucket: "bare",
    r: 250,
    g: 0,
    b: 0,
    treeVal: 0,
    cropVal: 0,
    grassVal: 0,
    waterVal: 0,
    bareVal: 220,
  },
  // 60: Bare / sparse vegetation [180, 180, 180]
  {
    bucket: "bare",
    r: 180,
    g: 180,
    b: 180,
    treeVal: 0,
    cropVal: 0,
    grassVal: 0,
    waterVal: 0,
    bareVal: 255,
  },
  // 70: Snow and ice [240, 240, 240]
  {
    bucket: "bare",
    r: 240,
    g: 240,
    b: 240,
    treeVal: 0,
    cropVal: 0,
    grassVal: 0,
    waterVal: 0,
    bareVal: 255,
  },
  // 80: Permanent water bodies [0, 100, 200]
  {
    bucket: "water",
    r: 0,
    g: 100,
    b: 200,
    treeVal: 0,
    cropVal: 0,
    grassVal: 0,
    waterVal: 255,
    bareVal: 0,
  },
  // 90: Herbaceous wetland [0, 150, 160]
  {
    bucket: "water",
    r: 0,
    g: 150,
    b: 160,
    treeVal: 0,
    cropVal: 50,
    grassVal: 120,
    waterVal: 230,
    bareVal: 0,
  },
];

export function classifyWorldCoverRgb(r: number, g: number, b: number) {
  const [first, ...rest] = WORLDCOVER_PALETTE;
  if (!first) throw new Error("WorldCover palette is empty");
  let best = first;
  let bestDist = Infinity;
  for (const entry of [first, ...rest]) {
    const dr = r - entry.r;
    const dg = g - entry.g;
    const db = b - entry.b;
    const dist = dr * dr + dg * dg + db * db;
    if (dist < bestDist) {
      bestDist = dist;
      best = entry;
    }
  }
  return best;
}

export function classifyWorldCoverPng(decoded: {
  width: number;
  height: number;
  data: Uint8Array;
}): {
  grid: LandCoverGrid;
  treeCoverPct: number;
  croplandPct: number;
  grasslandPct: number;
  waterPct: number;
  barePct: number;
} {
  const { width, height, data } = decoded;
  const n = width * height;
  const tree = new Array<number>(n);
  const crop = new Array<number>(n);
  const grass = new Array<number>(n);
  const water = new Array<number>(n);
  const bare = new Array<number>(n);

  let treeCount = 0;
  let cropCount = 0;
  let grassCount = 0;
  let waterCount = 0;
  let bareCount = 0;
  let validCount = 0;

  for (let i = 0; i < n; i++) {
    const r = data[i * 4] ?? 0;
    const g = data[i * 4 + 1] ?? 0;
    const b = data[i * 4 + 2] ?? 0;
    const a = data[i * 4 + 3] ?? 255;

    if (a < 16 || (r === 0 && g === 0 && b === 0)) {
      tree[i] = 0;
      crop[i] = 0;
      grass[i] = 0;
      water[i] = 0;
      bare[i] = 0;
      continue;
    }

    const match = classifyWorldCoverRgb(r, g, b);
    tree[i] = match.treeVal;
    crop[i] = match.cropVal;
    grass[i] = match.grassVal;
    water[i] = match.waterVal;
    bare[i] = match.bareVal;
    validCount++;

    if (match.bucket === "tree") treeCount++;
    else if (match.bucket === "crop") cropCount++;
    else if (match.bucket === "grass") grassCount++;
    else if (match.bucket === "water") waterCount++;
    else bareCount++;
  }

  const denom = Math.max(1, validCount);
  return {
    grid: { width, height, tree, crop, grass, water, bare },
    treeCoverPct: Number(((treeCount / denom) * 100).toFixed(1)),
    croplandPct: Number(((cropCount / denom) * 100).toFixed(1)),
    grasslandPct: Number(((grassCount / denom) * 100).toFixed(1)),
    waterPct: Number(((waterCount / denom) * 100).toFixed(1)),
    barePct: Number(((bareCount / denom) * 100).toFixed(1)),
  };
}
