import { createHash } from "node:crypto";
import { Evidence, Source } from "@siterra/contracts";
import type { LandCoverGrid } from "./worldcover-classifier.ts";

export interface SatelliteLandCoverResult {
  worldCoverItemId?: string;
  worldCoverYear?: number;
  worldCoverTileUrl?: string;
  sentinel2ItemId?: string;
  sentinel2ItemIds?: string[];
  sentinel2Datetime?: string;
  sentinel2Date?: string;
  sentinel2CloudCover?: number;
  sentinel2SceneCloudCover?: number;
  sentinel2SnowCover?: number;
  sentinel2Platform?: string;
  sentinel2SelectionRule?: "growing_season_snow_free" | "year_clearest_fallback";
  sentinel2Selection?: string;
  sentinel2Attribution?: string;
  elevationSourceId?: "3dep-seamless" | "cop-dem-glo-30";
  elevationSurface?: "bare_earth" | "surface_model";
  elevationNominalResolutionM?: number;
  elevationVerticalDatum?: string;
  elevationItemIds?: string[];
  elevationAttribution?: string;
  metaCanopyQuadKey?: string;
  metaCanopyTileUrl?: string;
  metaCanopyAcqDate?: string;
  metaCanopyModel?: string;
  treeCoverPct?: number;
  croplandPct?: number;
  grasslandPct?: number;
  waterPct?: number;
  barePct?: number;
  landCoverGrid?: LandCoverGrid;
}

export interface SatelliteRecordBuildParams {
  caseId: string;
  slug: string;
  hash6: string;
  placeName: string;
  regionName?: string;
  geoId?: string | null;
  now?: string;
  satellite?: SatelliteLandCoverResult;
  landCover?: SatelliteLandCoverResult;
  result?: SatelliteLandCoverResult;
}

export function buildSatelliteSourcesAndEvidence(
  paramsOrSatellite: SatelliteRecordBuildParams & Partial<SatelliteLandCoverResult>,
  maybeContext?: Omit<SatelliteRecordBuildParams, "satellite" | "landCover" | "result">,
): {
  sources: Source[];
  evidence: Evidence[];
  satelliteSources: Source[];
  satelliteEvidence: Evidence[];
} {
  const ctx = maybeContext ?? paramsOrSatellite;
  const sat: SatelliteLandCoverResult =
    paramsOrSatellite.satellite ??
    paramsOrSatellite.landCover ??
    paramsOrSatellite.result ??
    paramsOrSatellite;

  const caseId = ctx.caseId;
  const slug = ctx.slug;
  const hash6 = ctx.hash6;
  const placeName = ctx.placeName;
  const geoId = ctx.geoId ?? null;
  const now = ctx.now ?? new Date().toISOString();

  const sources: Source[] = [];
  const evidence: Evidence[] = [];

  if (sat.worldCoverItemId) {
    const srcId = `src_sat_wc_${slug}_${hash6}`;
    const yearStr = String(sat.worldCoverYear ?? 2021);
    const tileUrl =
      sat.worldCoverTileUrl ??
      `https://planetarycomputer.microsoft.com/api/stac/v1/collections/esa-worldcover/items/${encodeURIComponent(sat.worldCoverItemId)}`;
    const compositionParts: string[] = [];
    if (typeof sat.treeCoverPct === "number")
      compositionParts.push(`tree cover ${sat.treeCoverPct.toFixed(1)}%`);
    if (typeof sat.grasslandPct === "number")
      compositionParts.push(`grassland/shrubland ${sat.grasslandPct.toFixed(1)}%`);
    if (typeof sat.croplandPct === "number")
      compositionParts.push(`cropland ${sat.croplandPct.toFixed(1)}%`);
    if (typeof sat.barePct === "number")
      compositionParts.push(`bare/sparse ${sat.barePct.toFixed(1)}%`);
    if (typeof sat.waterPct === "number")
      compositionParts.push(`water/wetland ${sat.waterPct.toFixed(1)}%`);
    const compSummary =
      compositionParts.length > 0
        ? `Observed 10 m land-cover composition across ${placeName}: ${compositionParts.join(", ")}.`
        : `ESA WorldCover 10 m product tile ${sat.worldCoverItemId} covering ${placeName}.`;

    const contentHash = `sha256:${createHash("sha256").update(`${sat.worldCoverItemId}\n${compSummary}`).digest("hex")}`;
    const src = Source.safeParse({
      recordType: "Source",
      id: srcId,
      revision: 1,
      createdAt: now,
      updatedAt: now,
      caseId,
      title: `ESA WorldCover 10 m (${yearStr}): STAC Item ${sat.worldCoverItemId}`,
      url: tileUrl,
      publisher: "European Space Agency (ESA) / Microsoft Planetary Computer STAC",
      authors: ["ESA WorldCover Consortium"],
      publicationDate: /^\d{4}$/.test(yearStr) ? yearStr : "2021",
      language: "en",
      accessedAt: now,
      sourceKind: "official_dataset",
      accessStatus: "retrieved",
      license: "CC BY 4.0",
      redistributionStatus: "permitted",
      contentHash,
      notes: [
        compSummary,
        `STAC item ${sat.worldCoverItemId} retrieved via Microsoft Planetary Computer.`,
      ],
    });
    if (src.success) {
      sources.push(src.data);
      const ev = Evidence.safeParse({
        recordType: "Evidence",
        id: `ev_sat_wc_${slug}_${hash6}`,
        revision: 1,
        createdAt: now,
        updatedAt: now,
        caseId,
        statement: `ESA WorldCover 10 m satellite classification (${sat.worldCoverItemId}) for ${placeName}: ${compSummary}`,
        claimKind: "observation",
        status: "accepted",
        geoSelectionId: geoId,
        periodIds: [],
        measurementIds: [],
        provenance: {
          sourceLocators: [
            {
              sourceId: src.data.id,
              locator: `STAC item ${sat.worldCoverItemId}`,
              excerpt: compSummary,
            },
          ],
          dataBundleIds: [],
          methodId: "planetary_computer_worldcover_crop",
          methodVersion: "2.0.0",
          inputVersions: [{ entityId: src.data.id, revision: 1 }],
          generatedByTaskId: null,
          generatedAt: now,
          verificationStatus: "source_checked",
          limitations: [
            "10 m global land-cover classification from Sentinel-1 and Sentinel-2; local mixed pixels require field verification.",
          ],
        },
        interpretation: `Provides satellite-derived baseline distribution of woody cover, cropland, and rangeland across ${placeName}.`,
        uncertainty:
          "Global 10 m classification (~76.7% overall accuracy); local ground validation required.",
        reviewDecisionIds: [],
      });
      if (ev.success) {
        evidence.push(ev.data);
      }
    }
  }

  if (sat.sentinel2ItemId) {
    const srcId = `src_sat_s2_${slug}_${hash6}`;
    const dtIso = sat.sentinel2Datetime ?? now;
    const pubDate = /^\d{4}-\d{2}-\d{2}/.test(dtIso) ? dtIso.slice(0, 10) : now.slice(0, 10);
    const cloudText =
      typeof sat.sentinel2CloudCover === "number"
        ? `${sat.sentinel2CloudCover.toFixed(1)}% cloud cover`
        : "L2A surface reflectance";
    const platformText = sat.sentinel2Platform ?? "Sentinel-2";
    const s2Excerpt = `${platformText} L2A multispectral scene ${sat.sentinel2ItemId} (${pubDate}, ${cloudText}) intersecting ${placeName}.`;
    const s2Url = `https://planetarycomputer.microsoft.com/api/stac/v1/collections/sentinel-2-l2a/items/${encodeURIComponent(sat.sentinel2ItemId)}`;
    const contentHash = `sha256:${createHash("sha256").update(s2Excerpt).digest("hex")}`;

    const src = Source.safeParse({
      recordType: "Source",
      id: srcId,
      revision: 1,
      createdAt: now,
      updatedAt: now,
      caseId,
      title: `Copernicus ${platformText} L2A Scene ${sat.sentinel2ItemId} (${pubDate})`,
      url: s2Url,
      publisher: "Copernicus Sentinel-2 / Microsoft Planetary Computer STAC",
      authors: ["European Space Agency (ESA)"],
      publicationDate: pubDate,
      language: "en",
      accessedAt: now,
      sourceKind: "official_dataset",
      accessStatus: "retrieved",
      license: "Copernicus Sentinel Data Terms (free and open)",
      redistributionStatus: "permitted",
      contentHash,
      notes: [s2Excerpt],
    });
    if (src.success) {
      sources.push(src.data);
      const ev = Evidence.safeParse({
        recordType: "Evidence",
        id: `ev_sat_s2_${slug}_${hash6}`,
        revision: 1,
        createdAt: now,
        updatedAt: now,
        caseId,
        statement: `Recent Copernicus ${platformText} optical pass over ${placeName}: ${s2Excerpt}`,
        claimKind: "observation",
        status: "accepted",
        geoSelectionId: geoId,
        periodIds: [],
        measurementIds: [],
        provenance: {
          sourceLocators: [
            {
              sourceId: src.data.id,
              locator: `STAC item ${sat.sentinel2ItemId}`,
              excerpt: s2Excerpt,
            },
          ],
          dataBundleIds: [],
          methodId: "planetary_computer_stac_search",
          methodVersion: "1.0.0",
          inputVersions: [{ entityId: src.data.id, revision: 1 }],
          generatedByTaskId: null,
          generatedAt: now,
          verificationStatus: "source_checked",
          limitations: [
            "Scene-level STAC metadata and cloud-cover screening; atmospheric effects in steep terrain require topographic correction.",
          ],
        },
        interpretation: `Confirms recent 10 m multispectral Sentinel-2 coverage over ${placeName}.`,
        uncertainty: `Scene cloud cover ${cloudText}; sub-pixel canopy fraction unquantified without field plots.`,
        reviewDecisionIds: [],
      });
      if (ev.success) {
        evidence.push(ev.data);
      }
    }
  }

  if (sat.elevationSourceId && sat.elevationItemIds && sat.elevationItemIds.length > 0) {
    const srcId = `src_dem_${slug}_${hash6}`;
    const is3dep = sat.elevationSourceId === "3dep-seamless";
    const itemLead = sat.elevationItemIds[0] ?? sat.elevationSourceId;
    const demTitle = is3dep
      ? `USGS 3D Elevation Program (3DEP) 1/3 arc-second (~10 m) Bare-Earth DEM: ${itemLead}`
      : `Copernicus DEM GLO-30 (30 m) Surface Model: ${itemLead}`;
    const demUrl = `https://planetarycomputer.microsoft.com/api/stac/v1/collections/${sat.elevationSourceId}/items/${encodeURIComponent(itemLead)}`;
    const demSurfaceLabel =
      sat.elevationSurface === "bare_earth" ? "bare-earth ground model" : "digital surface model";
    const demRes = sat.elevationNominalResolutionM ?? (is3dep ? 10 : 30);
    const demDatum = sat.elevationVerticalDatum ?? (is3dep ? "NAVD88" : "EGM2008");
    const demExcerpt = `${demTitle} (${String(demRes)} m nominal resolution, ${demSurfaceLabel}, vertical datum ${demDatum}) covering ${placeName}.`;
    const contentHash = `sha256:${createHash("sha256").update(demExcerpt).digest("hex")}`;
    const src = Source.safeParse({
      recordType: "Source",
      id: srcId,
      revision: 1,
      createdAt: now,
      updatedAt: now,
      caseId,
      title: demTitle,
      url: demUrl,
      publisher: is3dep
        ? "U.S. Geological Survey (USGS) / Microsoft Planetary Computer STAC"
        : "European Space Agency (ESA) / Airbus / Microsoft Planetary Computer STAC",
      authors: is3dep ? ["U.S. Geological Survey"] : ["European Space Agency", "Airbus"],
      publicationDate: "2023",
      language: "en",
      accessedAt: now,
      sourceKind: "official_dataset",
      accessStatus: "retrieved",
      license: is3dep ? "Public domain (U.S. Government Work)" : "Copernicus DEM Licence",
      redistributionStatus: "permitted",
      contentHash,
      notes: [demExcerpt, ...(sat.elevationAttribution ? [sat.elevationAttribution] : [])],
    });
    if (src.success) {
      sources.push(src.data);
      const ev = Evidence.safeParse({
        recordType: "Evidence",
        id: `ev_dem_${slug}_${hash6}`,
        revision: 1,
        createdAt: now,
        updatedAt: now,
        caseId,
        statement: `Elevation model for ${placeName}: ${demExcerpt}`,
        claimKind: "observation",
        status: "accepted",
        geoSelectionId: geoId,
        periodIds: [],
        measurementIds: [],
        provenance: {
          sourceLocators: [
            {
              sourceId: src.data.id,
              locator: `STAC collection ${sat.elevationSourceId} (${sat.elevationItemIds.join(", ")})`,
              excerpt: demExcerpt,
            },
          ],
          dataBundleIds: [],
          methodId: "stac_dem_30m_10m_v1",
          methodVersion: "1.0.0",
          inputVersions: [{ entityId: src.data.id, revision: 1 }],
          generatedByTaskId: null,
          generatedAt: now,
          verificationStatus: "source_checked",
          limitations: [
            is3dep
              ? "USGS 3DEP 1/3 arc-second (~10 m) bare-earth elevation model resampled onto the 256 by 256 terrain grid."
              : "Copernicus DEM GLO-30 (~30 m) radar surface model; tree canopy and buildings raise surface heights above bare ground.",
          ],
        },
        interpretation: `Provides the elevation grid for ${placeName} (${String(demRes)} m nominal spacing, ${demSurfaceLabel}).`,
        uncertainty: `Vertical datum ${demDatum}; grid resampled to 256 by 256 nodes across the 20 km box.`,
        reviewDecisionIds: [],
      });
      if (ev.success) {
        evidence.push(ev.data);
      }
    }
  }

  return {
    sources,
    evidence,
    satelliteSources: sources,
    satelliteEvidence: evidence,
  };
}
