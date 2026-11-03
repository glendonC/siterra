import { decodePngRgba, encodeRgbaPng } from "./png-codec.ts";
import {
  type SatelliteLandCoverResult,
  type SatelliteRecordBuildParams,
  buildSatelliteSourcesAndEvidence,
} from "./satellite-records.ts";
import {
  type LandCoverGrid,
  classifyWorldCoverPng,
  classifyWorldCoverRgb,
  latLonToMetaCanopyQuadKey,
} from "./worldcover-classifier.ts";

export {
  type LandCoverGrid,
  type SatelliteLandCoverResult,
  type SatelliteRecordBuildParams,
  buildSatelliteSourcesAndEvidence,
  classifyWorldCoverRgb,
  decodePngRgba,
  encodeRgbaPng,
  latLonToMetaCanopyQuadKey,
};

interface StacAsset {
  href?: string;
  title?: string;
  type?: string;
}

interface StacFeature {
  id?: string;
  collection?: string;
  properties?: {
    datetime?: string | null;
    start_datetime?: string | null;
    end_datetime?: string | null;
    "eo:cloud_cover"?: number;
    platform?: string;
    "esa_worldcover:product_version"?: string;
    "esa_worldcover:product_tile"?: string;
  };
  assets?: Record<string, StacAsset>;
}

interface StacSearchResponse {
  features?: StacFeature[];
}

async function searchStacFeatures(
  bbox: [number, number, number, number],
  signal: AbortSignal,
): Promise<StacFeature[]> {
  const url = "https://planetarycomputer.microsoft.com/api/stac/v1/search";
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json",
    "User-Agent": "Siterra/1.0",
  };
  const search = async (body: object): Promise<StacFeature[]> => {
    try {
      const res = await fetch(url, { method: "POST", headers, signal, body: JSON.stringify(body) });
      if (!res.ok) return [];
      const data = (await res.json().catch(() => ({}))) as StacSearchResponse;
      return Array.isArray(data.features) ? data.features : [];
    } catch {
      return [];
    }
  };

  // Planetary Computer serves esa-worldcover and sentinel-2-l2a from separate backends: ask each on its own, so a
  // box spanning several WorldCover tiles gets every one (two years of up to four tiles), then the combined search
  const [wc, s2] = await Promise.all([
    search({ collections: ["esa-worldcover"], bbox, limit: 8 }),
    search({ collections: ["sentinel-2-l2a"], bbox, limit: 4 }),
  ]);
  const found =
    wc.length + s2.length > 0
      ? [...wc, ...s2]
      : await search({ collections: ["esa-worldcover", "sentinel-2-l2a"], bbox, limit: 6 });
  const seen = new Set<string>();
  return found.filter((f) => {
    const id = typeof f.id === "string" ? f.id : "";
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

/** WorldCover crop size (px a side): about 78 m pixels over a 20 km box, the terrain grid's own spacing. */
export const WORLDCOVER_GRID = 256;

/** The year a WorldCover item maps, from its dates or its id. */
function worldCoverYearOf(f: StacFeature): number | undefined {
  const dateStr =
    f.properties?.end_datetime ?? f.properties?.start_datetime ?? f.properties?.datetime ?? f.id;
  const m = typeof dateStr === "string" ? /\b(20\d{2})\b/.exec(dateStr) : null;
  return m?.[1] ? Number.parseInt(m[1], 10) : undefined;
}

/**
 * Queries Microsoft Planetary Computer STAC API for `esa-worldcover` and `sentinel-2-l2a`
 * items intersecting `bbox`, crops every WorldCover item of the newest year over it (WORLDCOVER_GRID px a
 * side), merges them (the first crop with a reading at a pixel wins) and decodes the classes, and
 * resolves the Meta AI DINOv2 + WRI 1-meter Global Canopy Height Map quadkey tile.
 */
export async function fetchSatelliteLandCover(
  bbox: [number, number, number, number],
): Promise<SatelliteLandCoverResult> {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  const centerLon = (minLon + maxLon) / 2;
  const centerLat = (minLat + maxLat) / 2;
  const quadKey = latLonToMetaCanopyQuadKey(centerLat, centerLon, 9);
  const metaChmUrl = `https://dataforgood-fb-data.s3.amazonaws.com/forests/v1/alsgedi_global_v6_float/chm/${quadKey}.tif`;

  const ac = new AbortController();
  const timer = setTimeout(() => {
    ac.abort();
  }, 4500);
  let wcItems: StacFeature[];

  const result: SatelliteLandCoverResult = {
    metaCanopyQuadKey: quadKey,
    metaCanopyTileUrl: metaChmUrl,
    metaCanopyModel: "Meta AI DINOv2 ViT + WRI 1m Global Canopy Height (alsgedi_global_v6_float)",
  };
  try {
    const features = await searchStacFeatures(bbox, ac.signal);
    const wcFeatures = features.filter(
      (f) =>
        f.collection === "esa-worldcover" ||
        (typeof f.id === "string" && f.id.startsWith("ESA_WorldCover")),
    );
    const newestYear = Math.max(...wcFeatures.map((f) => worldCoverYearOf(f) ?? 0));
    wcItems = wcFeatures.filter((f) => (worldCoverYearOf(f) ?? 0) === newestYear);
    const wcFeature = wcItems[0];

    const s2Features = features.filter(
      (f) =>
        f.collection === "sentinel-2-l2a" ||
        (typeof f.id === "string" && /^S2[A-C]_MSIL2A/i.test(f.id)),
    );
    const s2Feature =
      s2Features.sort(
        (a, b) =>
          (a.properties?.["eo:cloud_cover"] ?? 100) - (b.properties?.["eo:cloud_cover"] ?? 100),
      )[0] ?? s2Features[0];

    if (wcFeature?.id) {
      result.worldCoverItemId = wcFeature.id;
      const year = worldCoverYearOf(wcFeature);
      if (year !== undefined) result.worldCoverYear = year;
      const tileHref =
        wcFeature.assets?.["tilejson"]?.href ??
        wcFeature.assets?.["rendered_preview"]?.href ??
        wcFeature.assets?.["map"]?.href;
      if (tileHref) {
        result.worldCoverTileUrl = tileHref;
      }
    }

    if (s2Feature?.id) {
      result.sentinel2ItemId = s2Feature.id;
      if (typeof s2Feature.properties?.datetime === "string") {
        result.sentinel2Datetime = s2Feature.properties.datetime;
      }
      if (typeof s2Feature.properties?.["eo:cloud_cover"] === "number") {
        result.sentinel2CloudCover = Number(s2Feature.properties["eo:cloud_cover"].toFixed(2));
      }
      if (typeof s2Feature.properties?.platform === "string") {
        result.sentinel2Platform = s2Feature.properties.platform;
      }
    }
  } catch {
    clearTimeout(timer);
    return result;
  } finally {
    clearTimeout(timer);
  }

  if (!result.worldCoverItemId) {
    return result;
  }

  const cropAc = new AbortController();
  const cropTimer = setTimeout(() => {
    cropAc.abort();
  }, 8000);
  try {
    const bboxStr = `${String(minLon)},${String(minLat)},${String(maxLon)},${String(maxLat)}`;
    const size = String(WORLDCOVER_GRID);
    const cropOf = async (itemId: string) => {
      const itemEnc = encodeURIComponent(itemId);
      const primaryCropUrl = `https://planetarycomputer.microsoft.com/api/data/v1/item/crop/esa-worldcover/${itemEnc}.png?assets=map&bbox=${bboxStr}&width=${size}&height=${size}&colormap_name=esa-worldcover`;
      const titilerCropUrl = `https://planetarycomputer.microsoft.com/api/data/v1/item/crop/${bboxStr}/${size}x${size}.png?collection=esa-worldcover&item=${itemEnc}&assets=map&colormap_name=esa-worldcover`;
      for (const url of [titilerCropUrl, primaryCropUrl]) {
        try {
          const res = await fetch(url, { signal: cropAc.signal });
          if (res.ok) return decodePngRgba(new Uint8Array(await res.arrayBuffer()));
        } catch {
          if (cropAc.signal.aborted) return null;
        }
      }
      return null;
    };
    const ids = wcItems.map((f) => f.id).filter((id): id is string => typeof id === "string");
    const crops = (await Promise.all(ids.slice(0, 4).map(cropOf))).filter(
      (d): d is NonNullable<typeof d> => d !== null && d.width > 0 && d.height > 0,
    );
    const first = crops[0];
    if (first) {
      // where the box spans several WorldCover tiles each crop reads only its own: the first with a reading wins
      const merged = new Uint8Array(first.data);
      const hasReading = (d: Uint8Array, p: number) =>
        (d[p + 3] ?? 255) >= 16 && ((d[p] ?? 0) > 0 || (d[p + 1] ?? 0) > 0 || (d[p + 2] ?? 0) > 0);
      for (const other of crops.slice(1)) {
        if (other.width !== first.width || other.height !== first.height) continue;
        for (let p = 0; p < merged.length; p += 4) {
          if (!hasReading(merged, p) && hasReading(other.data, p)) {
            merged.set(other.data.subarray(p, p + 4), p);
          }
        }
      }
      const classified = classifyWorldCoverPng({
        width: first.width,
        height: first.height,
        data: merged,
      });
      result.landCoverGrid = classified.grid;
      result.treeCoverPct = classified.treeCoverPct;
      result.croplandPct = classified.croplandPct;
      result.grasslandPct = classified.grasslandPct;
      result.waterPct = classified.waterPct;
      result.barePct = classified.barePct;
    }
  } catch {
    // Gracefully return STAC metadata if crop endpoint times out or fails
  } finally {
    clearTimeout(cropTimer);
  }

  return result;
}
