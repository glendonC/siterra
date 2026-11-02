import { readFile } from "node:fs/promises";
import { analysisCaseIdOf } from "@siterra/db";
import {
  type TerrainFile,
  bboxAround,
  readOrBuildTerrain,
  terrainCachePath,
} from "../../../../lib/live-place/ingest.ts";
import {
  ElevationUnavailableError,
  TERRAIN_FILE_VERSION,
} from "../../../../lib/live-place/terrain-builder.ts";
import { database } from "../../database.ts";
import { json, problem } from "../../problem.ts";

export const dynamic = "force-dynamic";

function extractBboxFromGeometry(geometry: unknown): [number, number, number, number] | null {
  if (typeof geometry !== "object" || geometry === null) return null;
  const g = geometry as { type?: string; coordinates?: unknown };
  const points: [number, number][] = [];

  const collect = (coords: unknown): void => {
    if (!Array.isArray(coords)) return;
    if (
      coords.length >= 2 &&
      typeof coords[0] === "number" &&
      typeof coords[1] === "number" &&
      Number.isFinite(coords[0]) &&
      Number.isFinite(coords[1])
    ) {
      points.push([coords[0], coords[1]]);
      return;
    }
    for (const child of coords) {
      collect(child);
    }
  };

  collect(g.coordinates);
  if (points.length === 0) return null;

  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;
  for (const [lon, lat] of points) {
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  if (!Number.isFinite(minLon) || !Number.isFinite(minLat)) return null;
  if (maxLon - minLon < 0.16 || maxLat - minLat < 0.14) {
    return bboxAround((minLon + maxLon) / 2, (minLat + maxLat) / 2);
  }
  return [
    Number(minLon.toFixed(5)),
    Number(minLat.toFixed(5)),
    Number(maxLon.toFixed(5)),
    Number(maxLat.toFixed(5)),
  ];
}

/**
 * A cached terrain file: served when it is the current version; an older version is not served but its box is
 * returned, so the rebuild covers the same ground (and keeps that box's land cover if a fetch fails).
 */
async function readCachedTerrain(
  id: string,
): Promise<{ current: TerrainFile | null; staleBbox: [number, number, number, number] | null }> {
  try {
    const raw = await readFile(terrainCachePath(id), "utf8");
    const parsed = JSON.parse(raw) as Omit<TerrainFile, "version"> & { version?: unknown };
    const w = parsed.width || parsed.gridSize || 64;
    const h = parsed.height || parsed.gridSize || 64;
    const usable =
      w >= 16 &&
      h >= 16 &&
      Array.isArray(parsed.elevations) &&
      parsed.elevations.length === w * h &&
      Array.isArray(parsed.bbox) &&
      (parsed.bbox as unknown[]).length === 4;
    if (!usable) return { current: null, staleBbox: null };
    if (parsed.version === TERRAIN_FILE_VERSION) {
      return {
        current: { ...(parsed as TerrainFile), gridSize: w, width: w, height: h },
        staleBbox: null,
      };
    }
    return { current: null, staleBbox: parsed.bbox };
  } catch {
    // Cache miss
  }
  return { current: null, staleBbox: null };
}

/**
 * GET /api/terrain/:caseId: returns the 3D terrain grid (TerrainFile version 2), its outline ring and streamPaths
 * for any case (including demo session copies via origin_case_id or on-demand generation from
 * the case's GeoSelection).
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ caseId: string }> },
): Promise<Response> {
  const { caseId } = await context.params;
  const db = database();

  const originCaseId = await analysisCaseIdOf(db, caseId).catch(() => caseId);

  const cachedOrigin = await readCachedTerrain(originCaseId);
  if (cachedOrigin.current) {
    return json(cachedOrigin.current);
  }
  if (caseId !== originCaseId) {
    const cachedDirect = await readCachedTerrain(caseId);
    if (cachedDirect.current) {
      return json(cachedDirect.current);
    }
  }

  let bbox: [number, number, number, number] | null = cachedOrigin.staleBbox;
  if (!bbox) {
    try {
      const { rows } = await db.query<{ record: { geometry?: unknown } }>(
        `SELECT record FROM records
         WHERE case_id IN ($1, $2) AND record_type = 'GeoSelection'
         ORDER BY CASE WHEN case_id = $1 THEN 0 ELSE 1 END, revision DESC
         LIMIT 1`,
        [originCaseId, caseId],
      );
      const geom = rows[0]?.record.geometry;
      bbox = extractBboxFromGeometry(geom);
    } catch {
      bbox = null;
    }
  }

  if (!bbox) {
    try {
      const { rows } = await db.query<{ record: { geometry?: unknown } }>(
        `SELECT record FROM records
         WHERE case_id IN ($1, $2) AND record_type = 'ContextFeature'
         ORDER BY CASE WHEN record->>'role' = 'outlet' THEN 0 ELSE 1 END, revision DESC
         LIMIT 1`,
        [originCaseId, caseId],
      );
      bbox = extractBboxFromGeometry(rows[0]?.record.geometry);
    } catch {
      bbox = null;
    }
  }

  if (!bbox) {
    return problem(404, "not_found", `No terrain or GeoSelection found for case ${caseId}`);
  }

  try {
    const terrain = await readOrBuildTerrain(originCaseId, bbox);
    return json(terrain);
  } catch (err) {
    if (err instanceof ElevationUnavailableError) {
      return problem(503, "internal_error", err.message);
    }
    const detail = err instanceof Error ? err.message : "Failed to build terrain";
    return problem(500, "internal_error", detail);
  }
}
