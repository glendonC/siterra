// Reads the case seed in data/case/ (case.json, the frozen geometry and the corpus manifest) and
// the bundle catalog it pins, and builds the records loadSeedCase writes. Every pinned file is
// checked against its SHA-256 first; nothing is filled in that the seed does not state.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CaseSnapshot,
  ContextFeature,
  EnvironmentalCase,
  GeoSelection,
  Source,
  caseSchemaVersion,
} from "@siterra/contracts";
import { z } from "zod";
import { type ImportIssue, importCatalog } from "./bundle-import.ts";
import { permittedMode } from "./live-mode.ts";
import type { CaseSeedRecords } from "./seed.ts";
import { collectionOf, emptyCollections } from "./snapshot.ts";

/** The case's own words, from the "case" object of case.json (approved copy only). */
export const CaseCopy = z.object({
  title: z.string().min(1),
  objective: z.string().min(1),
  description: z.string().min(1),
  unresolvedQuestions: z.array(z.string().min(1)),
});
export type CaseCopy = z.infer<typeof CaseCopy>;

const pinned = z.object({ sha256: z.string().regex(/^[0-9a-f]{64}$/) });

const CaseSeedFile = z.object({
  seedVersion: z.literal(1),
  caseId: z.string(),
  geoSelection: z.object({
    id: z.string(),
    revision: z.int().min(1),
    label: z.string(),
    geometryStatus: GeoSelection.shape.geometryStatus,
    boundaryRole: GeoSelection.shape.boundaryRole,
    crs: GeoSelection.shape.crs,
    geometry: pinned.extend({ path: z.string() }),
    areaM2: z.number().gt(0),
    areaMethod: z.string(),
    selectionMethod: z.string(),
    limitations: z.array(z.string()),
  }),
  bundles: z.object({ catalog: z.string(), catalogSha256: pinned.shape.sha256 }),
  corpus: z.object({ manifest: z.string(), manifestSha256: pinned.shape.sha256 }),
  case: CaseCopy.optional(),
});

const ManifestSource = z.object({
  sourceRecordId: z.string(),
  title: z.string(),
  url: z.string(),
  publisher: z.string().nullable(),
  authors: z.array(z.string()),
  publicationDate: z.string().nullable(),
  accessedAt: z.string(),
  sourceKind: z.string(),
  accessStatus: z.string(),
  license: z.string().nullable(),
  redistributionStatus: z.string(),
  contentHash: z.string().nullable(),
  notes: z.array(z.string()),
  language: z.string().optional(),
});
const CorpusManifest = z.object({ caseId: z.string(), sources: z.array(ManifestSource) });

/** data/case/context-features.json: the located features the case views name on the land. */
const ContextFeaturesFile = z.object({
  contextFeaturesVersion: z.literal(1),
  caseId: z.string(),
  description: z.string(),
  features: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      role: z.string(),
      lonLat: z.tuple([z.number(), z.number()]),
      method: z.string(),
      datasetId: z.string().nullable(),
      sourceIds: z.array(z.string()),
      attribution: z.string().nullable(),
      license: z.string().nullable(),
      limitations: z.array(z.string()),
    }),
  ),
});

const contextFeaturesPath = "data/case/context-features.json";

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

/**
 * seed is null only when a pinned file does not match; otherwise it holds every record that passed,
 * and issues name each refused source or bundle, so the caller decides whether a partial seed loads.
 */
export type CaseSeedResult = { seed: CaseSeedRecords | null; issues: ImportIssue[] };

/** Builds the seed records from the repository at repoDir. */
export function readCaseSeed(args: {
  repoDir: string;
  /** Overrides the copy in case.json; tests only. */
  copy?: CaseCopy;
  /** Defaults to concept; live is refused until GATE-01 is recorded (live-mode.ts). */
  mode?: EnvironmentalCase["mode"];
  /** The environment the live approval is read from; process.env unless a test passes one. */
  env?: Record<string, string | undefined>;
  ownerScopeId: string;
  assetBaseUri: string;
  importedAt: string;
}): CaseSeedResult {
  const mode = args.mode ?? "concept";
  if (permittedMode(mode, args.env) !== mode) {
    throw new Error("A case is seeded live only after GATE-01 is recorded as passed; use concept");
  }
  const issues: ImportIssue[] = [];
  const issue = (path: string, message: string) =>
    issues.push({ bundleId: "case seed", path, message });
  const file = CaseSeedFile.parse(
    JSON.parse(readFileSync(join(args.repoDir, "data/case/case.json"), "utf8")),
  );
  const copy = args.copy ?? file.case;
  if (copy === undefined) {
    throw new Error(
      "data/case/case.json has no case object with the case title, objective and description",
    );
  }
  const g = file.geoSelection;
  const geometryPath = join(args.repoDir, g.geometry.path);
  const catalogPath = join(args.repoDir, file.bundles.catalog);
  const manifestPath = join(args.repoDir, file.corpus.manifest);
  for (const [path, expected, label] of [
    [geometryPath, g.geometry.sha256, g.geometry.path],
    [catalogPath, file.bundles.catalogSha256, file.bundles.catalog],
    [manifestPath, file.corpus.manifestSha256, file.corpus.manifest],
  ] as const) {
    if (sha256File(path) !== expected) {
      issue(label, "SHA-256 does not match case.json");
    }
  }
  if (issues.length > 0) {
    return { seed: null, issues };
  }

  const at = args.importedAt;
  const geometryFile = JSON.parse(readFileSync(geometryPath, "utf8")) as {
    type?: string;
    features?: { geometry?: unknown }[];
  };
  const polygon =
    geometryFile.type === "FeatureCollection" ? geometryFile.features?.[0]?.geometry : geometryFile;
  const geoSelection = GeoSelection.parse({
    recordType: "GeoSelection",
    id: g.id,
    revision: g.revision,
    createdAt: at,
    updatedAt: at,
    caseId: file.caseId,
    label: g.label,
    geometryStatus: g.geometryStatus,
    geometry: polygon,
    crs: g.crs,
    boundaryRole: g.boundaryRole,
    boundarySourceIds: [],
    selectionMethod: g.selectionMethod,
    areaM2: g.areaM2,
    areaMethod: g.areaMethod,
    limitations: g.limitations,
  });

  const manifest = CorpusManifest.parse(JSON.parse(readFileSync(manifestPath, "utf8")));
  if (manifest.caseId !== file.caseId) {
    issue(file.corpus.manifest, `Manifest is for ${manifest.caseId}, not ${file.caseId}`);
  }
  const sources: Source[] = [];
  for (const entry of manifest.sources) {
    const parsed = Source.safeParse({
      recordType: "Source",
      id: entry.sourceRecordId,
      revision: 1,
      createdAt: at,
      updatedAt: at,
      caseId: file.caseId,
      title: entry.title,
      url: entry.url,
      publisher: entry.publisher,
      authors: entry.authors,
      publicationDate: entry.publicationDate,
      accessedAt: entry.accessedAt,
      sourceKind: entry.sourceKind,
      accessStatus: entry.accessStatus,
      license: entry.license,
      redistributionStatus: entry.redistributionStatus,
      contentHash: entry.contentHash,
      notes: entry.notes,
      ...(entry.language === undefined ? {} : { language: entry.language }),
    });
    if (parsed.success) {
      sources.push(parsed.data);
    } else {
      for (const e of parsed.error.issues) {
        issue(`${file.corpus.manifest}/${entry.sourceRecordId}/${e.path.join("/")}`, e.message);
      }
    }
  }

  const imported = importCatalog({
    catalogDir: join(args.repoDir, file.bundles.catalog, ".."),
    caseId: file.caseId,
    geoSelections: [geoSelection],
    sources,
    assetBaseUri: args.assetBaseUri,
    importedAt: at,
  });
  issues.push(...imported.issues);

  const contextFile = ContextFeaturesFile.parse(
    JSON.parse(readFileSync(join(args.repoDir, contextFeaturesPath), "utf8")),
  );
  if (contextFile.caseId !== file.caseId) {
    issue(
      contextFeaturesPath,
      `Context features are for ${contextFile.caseId}, not ${file.caseId}`,
    );
  }
  const sourceIds = new Set(sources.map((s) => s.id));
  const contextFeatures: ContextFeature[] = [];
  for (const feature of contextFile.features) {
    const missing = feature.sourceIds.filter((id) => !sourceIds.has(id));
    if (missing.length > 0) {
      issue(
        `${contextFeaturesPath}/${feature.id}`,
        `Cites sources not in the seed: ${missing.join(", ")}`,
      );
      continue;
    }
    const parsed = ContextFeature.safeParse({
      recordType: "ContextFeature",
      id: feature.id,
      revision: 1,
      createdAt: at,
      updatedAt: at,
      caseId: file.caseId,
      name: feature.name,
      role: feature.role,
      geometry: { type: "Point", coordinates: feature.lonLat },
      crs: "EPSG:4326",
      method: feature.method,
      datasetId: feature.datasetId,
      sourceIds: feature.sourceIds,
      attribution: feature.attribution,
      license: feature.license,
      limitations: feature.limitations,
    });
    if (parsed.success) {
      contextFeatures.push(parsed.data);
    } else {
      for (const e of parsed.error.issues) {
        issue(`${contextFeaturesPath}/${feature.id}/${e.path.join("/")}`, e.message);
      }
    }
  }

  const caseRecord = EnvironmentalCase.parse({
    recordType: "EnvironmentalCase",
    id: file.caseId,
    revision: 1,
    createdAt: at,
    updatedAt: at,
    title: copy.title,
    objective: copy.objective,
    status: "draft",
    mode,
    ownerScopeId: args.ownerScopeId,
    activeGeoSelectionId: geoSelection.id,
    currentBriefId: null,
    unresolvedQuestions: copy.unresolvedQuestions,
    permissionProfile: "research_and_preparation_only",
    description: copy.description,
  });
  return {
    seed: {
      caseRecord,
      geoSelections: [geoSelection],
      sources,
      bundles: imported.bundles,
      contextFeatures,
    },
    issues,
  };
}

/**
 * The snapshot GET /api/cases/:id returns right after loadSeedCase: the case, the latest record of
 * each entity sorted by ID, and the one case.committed event as lastSequence. Built without a
 * database for UI fixtures; a test pins it to the database snapshot.
 */
export function seedSnapshot(seed: CaseSeedRecords): CaseSnapshot {
  const records = emptyCollections();
  const all = [
    ...seed.geoSelections,
    ...seed.sources,
    ...seed.bundles.flatMap((b) => [b.dataBundle, ...b.temporalObservations, ...b.measurements]),
    ...seed.contextFeatures,
  ];
  for (const record of all) {
    (records[collectionOf[record.recordType]] as unknown[]).push(record);
  }
  for (const list of Object.values(records) as { id: string }[][]) {
    list.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }
  return CaseSnapshot.parse({
    recordType: "CaseSnapshot",
    schemaVersion: caseSchemaVersion,
    case: { ...seed.caseRecord, revision: 1 },
    records,
    lastSequence: 1,
  });
}
