import type * as NodeFs from "node:fs";
import type { CaseSnapshot } from "@siterra/contracts";
import type * as SiterraDb from "@siterra/db";
import { CommitProposal, uncoveredBriefCitations, uncoveredInstrumentCitations } from "@siterra/db";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildLiveCase } from "./ingest.ts";
import { reasonOverCaseWithLlm } from "./llm-reasoner.ts";
import { planReingestCommit, questionToKeep, staleReasons } from "./run-reingest.ts";

// The re-ingest of live cases written before vegetation was recorded as not measured: which cases it
// lists, which question it keeps, the commit it appends, and that it never reaches the model.
vi.mock("@siterra/db", async (importOriginal) => ({
  ...(await importOriginal<typeof SiterraDb>()),
  loadSeedCase: vi.fn(),
}));
vi.mock("node:fs", async (importOriginal) => ({
  ...(await importOriginal<typeof NodeFs>()),
  existsSync: () => false,
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
}));
vi.mock("../../app/api/geocode/route.ts", () => ({
  reverseGeocode: vi.fn(),
  formatCoordRegion: vi.fn(),
}));
vi.mock("./terrain-builder.ts", () => ({
  bboxAround: (lon: number, lat: number) => [lon - 0.12, lat - 0.09, lon + 0.12, lat + 0.09],
  polygonAreaM2: () => 1.5e8,
  terrainCachePath: () => "/dev/null",
  readOrBuildTerrain: vi.fn(() => Promise.resolve({ version: 1 })),
  buildTerrainForBbox: vi.fn((bbox: number[]) =>
    Promise.resolve({
      version: 1,
      gridSize: 2,
      width: 2,
      height: 2,
      bbox,
      minElevationM: 0,
      maxElevationM: 120,
      elevations: [0, 40, 80, 120],
      catchmentRing: [
        [bbox[0], bbox[1]],
        [bbox[2], bbox[1]],
        [bbox[2], bbox[3]],
        [bbox[0], bbox[1]],
      ],
      streamPaths: [],
    }),
  ),
}));
vi.mock("./context-fetcher.ts", () => ({
  fetchRegionalContextAndGovernance: vi.fn(() =>
    Promise.resolve({ contextSources: [], contextEvidence: [] }),
  ),
}));
vi.mock("./government-policy-fetcher.ts", () => ({
  fetchGovernmentPolicyAndOpenAccess: vi.fn(() => Promise.resolve({ sources: [], evidence: [] })),
}));
vi.mock("./biodiversity-fetcher.ts", () => ({
  fetchBiodiversityContext: vi.fn(() =>
    Promise.resolve({
      speciesCount: 0,
      topSpecies: [],
      sources: [],
      evidence: [],
      biodiversitySources: [],
      biodiversityEvidence: [],
    }),
  ),
}));
vi.mock("./llm-reasoner.ts", () => ({
  reasonOverCaseWithLlm: vi.fn(() => Promise.reject(new Error("the model was called"))),
}));

function dailyArchive() {
  const time: string[] = [];
  const precipitation_sum: number[] = [];
  const et0_fao_evapotranspiration: number[] = [];
  for (let d = Date.UTC(2000, 0, 1); d <= Date.UTC(2024, 11, 31); d += 86_400_000) {
    const date = new Date(d).toISOString().slice(0, 10);
    time.push(date);
    precipitation_sum.push(3 + (Number(date.slice(0, 4)) % 3) * 0.2);
    et0_fao_evapotranspiration.push(2);
  }
  return { time, precipitation_sum, et0_fao_evapotranspiration };
}

beforeEach(() => {
  vi.mocked(reasonOverCaseWithLlm).mockClear();
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string | URL) =>
      Promise.resolve(
        String(url).startsWith("https://archive-api.open-meteo.com/")
          ? new Response(JSON.stringify({ daily: dailyArchive() }), { status: 200 })
          : new Response("unavailable", { status: 503 }),
      ),
    ),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
});

function rebuildNewYork(question?: string) {
  return buildLiveCase({
    lon: -74.00602,
    lat: 40.71273,
    placeName: "New York",
    regionName: "United States",
    question,
    ownerScopeId: "seed",
    allowModel: false,
  });
}

/** A stored case as the current pipeline would have written it, at the given case revision. */
async function storedSnapshot(revision = 1): Promise<CaseSnapshot> {
  const built = await rebuildNewYork("Is vegetation cover changing across New York?");
  const { seed, synth } = built;
  return {
    recordType: "CaseSnapshot",
    schemaVersion: "1.22.0",
    case: { ...seed.caseRecord, revision },
    records: {
      sourceRecords: seed.sources,
      geoSelectionRecords: seed.geoSelections,
      dataBundleRecords: seed.bundles.map((b) => b.dataBundle),
      temporalObservationRecords: seed.bundles.flatMap((b) => b.temporalObservations),
      measurementRecords: seed.bundles.flatMap((b) => b.measurements),
      contextFeatureRecords: seed.contextFeatures,
      evidenceRecords: [...seed.evidence, ...synth.fieldRequirementEvidence],
      instrumentSpecRecords: seed.instruments,
      taskRecords: [synth.task],
      hypothesisRecords: synth.hypotheses,
      explanationBranchRecords: synth.explanationBranches,
      branchMergeRecords: [synth.branchMerge],
      interventionRecords: synth.interventions,
      resourceRequirementRecords: synth.resourceRequirements,
      reviewDecisionRecords: synth.reviewDecisions,
      operationalActionRecords: [synth.operationalAction],
      briefRecords: [synth.brief],
    },
    lastSequence: 0,
  } as unknown as CaseSnapshot;
}

describe("re-ingest of earlier live cases", () => {
  it("never reaches the model", async () => {
    const built = await rebuildNewYork();
    expect(vi.mocked(reasonOverCaseWithLlm)).not.toHaveBeenCalled();
    expect(built.synth.brief.mode).toBe("replay");
  });

  it("lists a case whose record states vegetation values, and leaves a current one alone", async () => {
    const current = await storedSnapshot();
    expect(staleReasons(current)).toEqual([]);
    const earlier = structuredClone(current);
    for (const m of earlier.records.measurementRecords)
      if (m.metric === "ndvi_growing_season_mean") {
        m.status = "available";
        m.value = 0.47;
        m.missingReason = null;
      }
    const rain = earlier.records.explanationBranchRecords?.[0];
    if (rain) rain.status = "consistent";
    for (const b of earlier.records.dataBundleRecords) b.methodVersion = "1.0.0";
    expect(staleReasons(earlier)).toEqual([
      "25 vegetation values recorded as measured",
      "1 explanations judged against them",
      "built by the version 1 live pipeline",
    ]);
  });

  it("rebuilds earlier default questions and keeps the visitor's own", () => {
    expect(
      questionToKeep(
        "Is shifting rainfall or valley-floor land use driving the 25-year vegetation greening across Queenstown?",
      ),
    ).toBeUndefined();
    expect(
      questionToKeep(
        "How do seasonal rainfall and elevation bands sustain the baseline stability of Arkhust?",
      ),
    ).toBeUndefined();
    const own = "Is vegetation cover changing across New York, and how much does rainfall explain?";
    expect(questionToKeep(own)).toBe(own);
  });

  it("appends changed records as next revisions, cites the new revisions, and passes the commit guards", async () => {
    const stored = await storedSnapshot(3);
    // the stored rainfall line differs: it and every record citing it get a new revision
    const ev = stored.records.evidenceRecords.find((e) => e.id.startsWith("ev_climate_"));
    if (!ev) throw new Error("no climate evidence");
    ev.statement = "Across 2000 to 2024, vegetation shows a greening trend of +0.0117 NDVI/decade.";
    ev.revision = 2;
    const built = await rebuildNewYork();
    const proposal = CommitProposal.parse(
      planReingestCommit(stored, built, "2026-11-02T16:00:00.000Z"),
    );

    expect(proposal.expectedCaseRevision).toBe(3);
    expect(proposal.newCaseRevision).toBe(4);
    const written = new Map(proposal.upserts.map((r) => [r.id, r]));
    expect(written.get(ev.id)?.revision).toBe(3);
    const brief = written.get(built.synth.brief.id);
    expect(brief?.revision).toBe(2);
    if (brief?.recordType !== "Brief") throw new Error("the brief was not revised");
    expect(brief.provenance.inputVersions.find((v) => v.entityId === ev.id)?.revision).toBe(3);
    // review decisions are only ever written by the review endpoint
    expect([...written.values()].some((r) => r.recordType === "ReviewDecision")).toBe(false);
    for (const r of proposal.upserts) {
      expect([r.id, uncoveredBriefCitations(r)]).toEqual([r.id, []]);
      expect([r.id, uncoveredInstrumentCitations(r)]).toEqual([r.id, []]);
    }
    expect(proposal.caseAfter.objective).toBe(built.seed.caseRecord.objective);
  });

  it("writes nothing for a case whose rebuild matches what is stored", async () => {
    const stored = await storedSnapshot(2);
    const built = await rebuildNewYork("Is vegetation cover changing across New York?");
    const proposal = planReingestCommit(stored, built, "2026-11-02T16:00:00.000Z");
    expect(proposal.upserts.map((r) => r.id)).toEqual([]);
  });
});
