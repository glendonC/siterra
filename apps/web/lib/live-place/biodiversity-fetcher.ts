import { createHash } from "node:crypto";
import { Evidence, Source } from "@siterra/contracts";

export interface TopSpeciesEntry {
  scientificName: string;
  vernacularName?: string;
  kingdom?: string;
  family?: string;
  count: number;
  iucn?: string;
  year?: number;
  basisOfRecord?: string;
}

export interface BiodiversityContextResult {
  speciesCount: number;
  topSpecies: TopSpeciesEntry[];
  sources: Source[];
  evidence: Evidence[];
  biodiversitySources: Source[];
  biodiversityEvidence: Evidence[];
  occurrencesPayload?: Record<string, unknown>;
}

export interface FetchBiodiversityParams {
  bbox?: [number, number, number, number];
  lon?: number;
  lat?: number;
  caseId?: string;
  slug?: string;
  hash6?: string;
  placeName?: string;
  regionName?: string;
  geoId?: string | null;
  now?: string;
}

interface GbifOccurrenceRecord {
  key?: number;
  gbifID?: number;
  species?: string;
  scientificName?: string;
  vernacularName?: string;
  kingdom?: string;
  class?: string;
  family?: string;
  iucnRedListCategory?: string;
  year?: number;
  eventDate?: string;
  decimalLatitude?: number;
  decimalLongitude?: number;
  coordinateUncertaintyInMeters?: number;
  basisOfRecord?: string;
  datasetKey?: string;
  datasetName?: string;
  publishingCountry?: string;
  license?: string;
}

interface GbifSearchResponse {
  count?: number;
  results?: GbifOccurrenceRecord[];
}

/**
 * Queries the GBIF Occurrence API inside `bbox` (or around `lon, lat`), aggregates unique
 * observed species and IUCN Red List categories, and builds schema-valid `@siterra/contracts`
 * `Source` and `Evidence` records.
 */
export async function fetchBiodiversityContext(
  paramsInput: FetchBiodiversityParams | [number, number, number, number],
): Promise<BiodiversityContextResult> {
  const params: FetchBiodiversityParams = Array.isArray(paramsInput)
    ? { bbox: paramsInput }
    : paramsInput;

  const bbox: [number, number, number, number] = params.bbox ?? [
    Number(((params.lon ?? 0) - 0.1).toFixed(6)),
    Number(((params.lat ?? 0) - 0.1).toFixed(6)),
    Number(((params.lon ?? 0) + 0.1).toFixed(6)),
    Number(((params.lat ?? 0) + 0.1).toFixed(6)),
  ];
  const [minLon, minLat, maxLon, maxLat] = bbox;

  const caseId = params.caseId ?? "case_loc_catchment_000000";
  const slug = params.slug ?? "catchment";
  const hash6 = params.hash6 ?? "000000";
  const placeName = params.placeName ?? "Catchment";
  const regionName = params.regionName ?? "Study Region";
  const geoId = params.geoId ?? null;
  const now = params.now ?? new Date().toISOString();

  const empty: BiodiversityContextResult = {
    speciesCount: 0,
    topSpecies: [],
    sources: [],
    evidence: [],
    biodiversitySources: [],
    biodiversityEvidence: [],
  };

  const url = `https://api.gbif.org/v1/occurrence/search?decimalLatitude=${minLat},${maxLat}&decimalLongitude=${minLon},${maxLon}&hasCoordinate=true&limit=35`;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 4000);

  try {
    const res = await fetch(url, {
      signal: ac.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": "Siterra/1.0",
      },
    });
    if (!res.ok) return empty;

    const data = (await res.json()) as GbifSearchResponse;
    const records = Array.isArray(data.results) ? data.results : [];
    if (records.length === 0) return empty;

    const bySpecies = new Map<string, TopSpeciesEntry>();
    for (const rec of records) {
      const rawName = (rec.species || rec.scientificName || "").trim();
      if (!rawName) continue;
      const key = rawName.toLowerCase();
      const existing = bySpecies.get(key);
      if (existing) {
        existing.count += 1;
        if (!existing.iucn && rec.iucnRedListCategory) {
          existing.iucn = rec.iucnRedListCategory;
        }
        if (!existing.vernacularName && rec.vernacularName) {
          existing.vernacularName = rec.vernacularName;
        }
      } else {
        bySpecies.set(key, {
          scientificName: rawName,
          ...(rec.vernacularName ? { vernacularName: rec.vernacularName } : {}),
          ...(rec.kingdom ? { kingdom: rec.kingdom } : {}),
          ...(rec.family ? { family: rec.family } : {}),
          count: 1,
          ...(rec.iucnRedListCategory ? { iucn: rec.iucnRedListCategory } : {}),
          ...(typeof rec.year === "number" ? { year: rec.year } : {}),
          ...(rec.basisOfRecord ? { basisOfRecord: rec.basisOfRecord } : {}),
        });
      }
    }

    const topSpecies = [...bySpecies.values()]
      .sort((a, b) => b.count - a.count)
      .slice(0, 12);
    const speciesCount = bySpecies.size;
    if (speciesCount === 0) return empty;

    // Build species_occurrences 1.0.0 payload from georeferenced GBIF records for the 3D LifeLayer
    const geoRecords = records.filter(
      (r) =>
        typeof r.decimalLatitude === "number" &&
        Number.isFinite(r.decimalLatitude) &&
        typeof r.decimalLongitude === "number" &&
        Number.isFinite(r.decimalLongitude) &&
        Boolean((r.species || r.scientificName || "").trim()),
    );
    const taxaTable: {
      scientific_name: string;
      species: string | null;
      kingdom: string | null;
      class: string | null;
    }[] = [];
    const taxonIdxByKey = new Map<string, number>();
    const basisTable = ["HUMAN_OBSERVATION", "PRESERVED_SPECIMEN", "MATERIAL_SAMPLE", "OCCURRENCE"];
    const licenseTable = ["CC_BY_4_0", "CC_BY_NC_4_0", "CC0_1_0"];
    const datasetsTable = [
      {
        title: `GBIF Occurrence Download — ${placeName}`,
        publisher: "Global Biodiversity Information Facility (GBIF)",
        doi: null,
      },
    ];
    const colGbifId: number[] = [];
    const colTaxon: number[] = [];
    const colYear: (number | null)[] = [];
    const colEventDate: (string | null)[] = [];
    const colBasis: number[] = [];
    const colLat: number[] = [];
    const colLon: number[] = [];
    const colUncertainty: (number | null)[] = [];
    const colDataset: number[] = [];
    const colLicense: number[] = [];

    geoRecords.forEach((r, idx) => {
      const sci = (r.scientificName || r.species || "").trim();
      const sp = (r.species || sci).trim() || null;
      const k = sci.toLowerCase();
      let tIdx = taxonIdxByKey.get(k);
      if (tIdx === undefined) {
        tIdx = taxaTable.length;
        taxonIdxByKey.set(k, tIdx);
        taxaTable.push({
          scientific_name: sci,
          species: sp,
          kingdom: r.kingdom ?? null,
          class: r.class ?? null,
        });
      }
      const bStr = r.basisOfRecord ?? "HUMAN_OBSERVATION";
      let bIdx = basisTable.indexOf(bStr);
      if (bIdx === -1) {
        bIdx = basisTable.length;
        basisTable.push(bStr);
      }
      colGbifId.push(typeof r.key === "number" ? r.key : typeof r.gbifID === "number" ? r.gbifID : 100000 + idx);
      colTaxon.push(tIdx);
      colYear.push(typeof r.year === "number" ? r.year : null);
      colEventDate.push(typeof r.eventDate === "string" ? r.eventDate.slice(0, 10) : null);
      colBasis.push(bIdx);
      colLat.push(Number((r.decimalLatitude as number).toFixed(5)));
      colLon.push(Number((r.decimalLongitude as number).toFixed(5)));
      colUncertainty.push(
        typeof r.coordinateUncertaintyInMeters === "number"
          ? Math.round(r.coordinateUncertaintyInMeters)
          : null,
      );
      colDataset.push(0);
      colLicense.push(0);
    });

    const occurrencesPayload =
      colLat.length > 0
        ? {
            recipeId: "species_occurrences",
            version: "1.0.0",
            computed: now,
            records: colLat.length,
            tables: {
              taxa: taxaTable,
              datasets: datasetsTable,
              basis_of_record: basisTable,
              license: licenseTable,
            },
            columns: {
              gbif_id: colGbifId,
              taxon: colTaxon,
              year: colYear,
              event_date: colEventDate,
              basis_of_record: colBasis,
              lat: colLat,
              lon: colLon,
              uncertainty_m: colUncertainty,
              dataset: colDataset,
              license: colLicense,
            },
          }
        : undefined;

    const sampleLabels = topSpecies.slice(0, 5).map((s) => {
      const details: string[] = [];
      if (s.kingdom) details.push(s.kingdom);
      if (s.iucn && s.iucn !== "NE") details.push(`IUCN ${s.iucn}`);
      const suffix = details.length > 0 ? ` (${details.join(", ")})` : "";
      return `${s.scientificName}${suffix} [n=${String(s.count)}]`;
    });
    const totalGbifCount = typeof data.count === "number" ? data.count : records.length;
    const excerpt = `GBIF georeferenced occurrence query across ${placeName} (${minLat.toFixed(3)}°..${maxLat.toFixed(3)}°N, ${minLon.toFixed(3)}°..${maxLon.toFixed(3)}°E) returned ${String(totalGbifCount)} total records representing ${String(speciesCount)} distinct taxa in sample, led by ${sampleLabels.join("; ")}.`;

    const srcId = `src_gbif_${slug}_${hash6}`;
    const contentHash = `sha256:${createHash("sha256").update(excerpt).digest("hex")}`;

    const sources: Source[] = [];
    const evidence: Evidence[] = [];

    const src = Source.safeParse({
      recordType: "Source",
      id: srcId,
      revision: 1,
      createdAt: now,
      updatedAt: now,
      caseId,
      title: `GBIF Species Occurrence Records — ${placeName} (${regionName})`,
      url,
      publisher: "Global Biodiversity Information Facility (GBIF)",
      authors: ["GBIF Data Publishers"],
      publicationDate: now.slice(0, 10),
      language: "en",
      accessedAt: now,
      sourceKind: "official_dataset",
      accessStatus: "retrieved",
      license: "CC BY 4.0",
      redistributionStatus: "permitted",
      contentHash,
      notes: [
        excerpt,
        `Retrieved via GBIF Occurrence Search API (${url}).`,
      ],
    });

    if (src.success) {
      sources.push(src.data);
      const ev = Evidence.safeParse({
        recordType: "Evidence",
        id: `ev_gbif_${slug}_${hash6}`,
        revision: 1,
        createdAt: now,
        updatedAt: now,
        caseId,
        statement: `Biodiversity occurrence baseline for ${placeName}: ${excerpt}`,
        claimKind: "observation",
        status: "accepted",
        geoSelectionId: geoId,
        periodIds: [],
        measurementIds: [],
        provenance: {
          sourceLocators: [
            {
              sourceId: src.data.id,
              locator: "GBIF occurrence search sample (limit=35)",
              excerpt,
            },
          ],
          dataBundleIds: [],
          methodId: "gbif_occurrence_bbox_query",
          methodVersion: "1.0.0",
          inputVersions: [{ entityId: src.data.id, revision: 1 }],
          generatedByTaskId: null,
          generatedAt: now,
          verificationStatus: "source_checked",
          limitations: [
            "Opportunistic citizen-science and museum occurrence records exhibit spatial sampling bias toward roads and trails; absence of records does not imply species absence.",
          ],
        },
        interpretation: `Documents observed flora and fauna taxa within the ${placeName} catchment bounding box.`,
        uncertainty:
          "Presence-only occurrence records; systematic transect surveys required for abundance and density estimation.",
        reviewDecisionIds: [],
      });
      if (ev.success) {
        evidence.push(ev.data);
      }
    }

    return {
      speciesCount,
      topSpecies,
      sources,
      evidence,
      biodiversitySources: sources,
      biodiversityEvidence: evidence,
      ...(occurrencesPayload ? { occurrencesPayload } : {}),
    };
  } catch {
    return empty;
  } finally {
    clearTimeout(timer);
  }
}
