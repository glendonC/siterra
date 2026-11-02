import { Source } from "@siterra/contracts";
import { describe, expect, it } from "vitest";
import { computeStatsFromAnnual } from "./climate-series.ts";
import {
  DEFAULT_BAND_LIMIT_M,
  DEFAULT_MAX_OUTPUT_TOKENS,
  DEFAULT_META_MODEL,
  LLM_REASONER_JSON_SCHEMA,
  META_API_BASE_URL,
  buildMetaResponsesRequestBody,
  choreographyForExplanation,
  containsProhibitedClaim,
  isVerbatimQuoteInSource,
  reasonOverCaseWithLlm,
  resolveLlmConfig,
  verifyLlmReasonerOutput,
} from "./llm-reasoner.ts";

const NOW = "2026-10-31T12:00:00.000Z";
const CASE_ID = "case_oued_ahansal_001";

function buildMockClimate() {
  const years = [];
  for (let yr = 2000; yr <= 2024; yr++) {
    years.push({
      year: yr,
      precipMm: 460 - (yr - 2000) * 2.2,
      et0Mm: null,
    });
  }
  return computeStatsFromAnnual(years);
}

const sampleSources: Source[] = [
  Source.parse({
    recordType: "Source",
    id: "src_ahansal_agdal_1",
    revision: 1,
    createdAt: NOW,
    updatedAt: NOW,
    caseId: CASE_ID,
    title: "Seasonal agdal grazing governance and high-elevation pasture resilience in Oued Ahansal",
    url: "https://doi.org/10.1016/j.jaridenv.2023.105001",
    publisher: "Journal of Arid Environments",
    authors: ["Auclair L", "Alifriqui M"],
    publicationDate: "2023",
    language: "en",
    accessedAt: NOW,
    sourceKind: "peer_reviewed",
    accessStatus: "retrieved",
    license: "CC BY 4.0",
    redistributionStatus: "permitted",
    contentHash: "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    notes: [
      "Customary agdal opening dates regulate transhumance livestock grazing pressure above 2317 m across upper Oued Ahansal pastures.",
    ],
  }),
  Source.parse({
    recordType: "Source",
    id: "src_ahansal_band_2",
    revision: 1,
    createdAt: NOW,
    updatedAt: NOW,
    caseId: CASE_ID,
    title: "Irrigated walnut terraces and seguia canal diversions in the Central High Atlas",
    url: "https://doi.org/10.1016/j.agwat.2024.108111",
    publisher: "Agricultural Water Management",
    authors: ["Boudhar A", "Chehbouni A"],
    publicationDate: "2024",
    language: "en",
    accessedAt: NOW,
    sourceKind: "peer_reviewed",
    accessStatus: "retrieved",
    license: "CC BY 4.0",
    redistributionStatus: "permitted",
    contentHash: "sha256:fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210",
    notes: [
      "Valley-floor irrigation canal diversions and check-dam rehabilitation below 2317 m stabilized terrace soil moisture during dry years.",
    ],
  }),
];

describe("choreographyForExplanation", () => {
  it("maps each competing explanation and stage alias to deterministic 3D camera, elevation band, and layer choreography", () => {
    const landUse = choreographyForExplanation("land_use");
    expect(landUse).toEqual({
      explanationId: "land_use",
      stageId: "band",
      camera: { zoom: 1.22, turn: -18 },
      elevationBandM: [1800, 2317],
      layer: "cover",
      sourceId: null,
      exactQuote: null,
    });

    const grazing = choreographyForExplanation("grazing", DEFAULT_BAND_LIMIT_M, {
      sourceId: "src_ahansal_agdal_1",
      exactQuote:
        "Customary agdal opening dates regulate transhumance livestock grazing pressure above 2317 m across upper Oued Ahansal pastures.",
    });
    expect(grazing).toEqual({
      explanationId: "grazing",
      stageId: "agdal",
      camera: { zoom: 1.18, turn: -28 },
      elevationBandM: [2317, 3200],
      layer: "routes",
      sourceId: "src_ahansal_agdal_1",
      exactQuote:
        "Customary agdal opening dates regulate transhumance livestock grazing pressure above 2317 m across upper Oued Ahansal pastures.",
    });

    const rainfall = choreographyForExplanation("rainfall");
    expect(rainfall).toEqual({
      explanationId: "rainfall",
      stageId: "rain",
      camera: { zoom: 1.08, turn: 14 },
      elevationBandM: null,
      layer: "rain",
      sourceId: null,
      exactQuote: null,
    });

    const snowTerrain = choreographyForExplanation("snow_terrain");
    expect(snowTerrain).toEqual({
      explanationId: "snow_terrain",
      stageId: "time",
      camera: { zoom: 1.14, turn: 8 },
      elevationBandM: [2317, 3200],
      layer: "ndvi",
      sourceId: null,
      exactQuote: null,
    });

    const dataArtefact = choreographyForExplanation("data_artefact");
    expect(dataArtefact).toEqual({
      explanationId: "data_artefact",
      stageId: "pixel",
      camera: { zoom: 1.35, turn: 22 },
      elevationBandM: null,
      layer: "ndvi",
      sourceId: null,
      exactQuote: null,
    });

    expect(choreographyForExplanation("fdr").stageId).toBe("fdr");
    expect(choreographyForExplanation("routes").stageId).toBe("routes");
    expect(choreographyForExplanation("band", 2150).elevationBandM).toEqual([1800, 2150]);
  });
});

describe("verifyLlmReasonerOutput & reasonOverCaseWithLlm", () => {
  it("resolves Meta LLM config from environment or Keychain", () => {
    const fromEnv = resolveLlmConfig({
      env: { MODEL_API_KEY: "meta-test-key-abc" },
      allowKeychain: false,
    });
    expect(fromEnv).toEqual({
      provider: "meta",
      model: DEFAULT_META_MODEL,
      apiKey: "meta-test-key-abc",
      baseUrl: META_API_BASE_URL,
    });
  });

  it("verifies verbatim quotes, rejects prohibited claims, and populates deterministic visualChoreography and cause visualFocus", () => {
    expect(containsProhibitedClaim("This proves grazing caused the decline.")).toBe(true);
    expect(isVerbatimQuoteInSource(sampleSources[0]!.notes[0]!, sampleSources[0]!)).toBe(true);

    const rawOutput = {
      hypotheses: [
        {
          key: "grazing",
          statement: "Seasonal pastoral grazing pressure above 2317 m co-varied with upper-band browning.",
          assessment: "Consistent with customary agdal schedule shifts.",
          status: "consistent",
        },
        {
          key: "land_use",
          statement: "Valley-floor irrigation canal diversions below 2317 m buffered walnut terraces.",
          assessment: "Requires local seguia maintenance verification.",
          status: "inconclusive",
        },
        {
          key: "rainfall",
          statement: "This definitely proves rainfall is the only factor.",
          assessment: "Must be rejected due to prohibited certainty words.",
          status: "consistent",
        },
      ],
      interventions: [
        {
          title: "Coordinate agdal opening dates with seguia rehabilitation",
          description: "Support community-led seasonal pasture rest above 2317 m alongside valley canal repair.",
          assumptions: ["Local Jmaa and agdal council participation."],
          fieldValidationNeeded: ["Pastoral corridor transect counts above 2317 m."],
          livelihoodConsiderations: ["Dry-season fodder access for transhumant herds."],
          targetExplanation: "grazing",
        },
      ],
      causes: [
        {
          explanationId: "rainfall",
          statement: "25-year ERA5 precipitation decline across Oued Ahansal.",
          statusReason: "Rainfall explains R² = 0.28 of catchment-wide NDVI variance.",
          prediction: "Wet and dry years shift catchment greenness uniformly across elevation bands.",
          fieldCheck: {
            what: "Basin meteorological station gauges",
            method: "Cross-check ABH Oum Er-Rbia rain gauges with ERA5",
            seasonWindow: "November to April",
          },
        },
        {
          explanationId: "grazing",
          statement: "Transhumant stocking pressure across upper pastures above 2317 m.",
          statusReason: "Concentrated along pastoral corridors during early spring openings.",
          prediction: "Protected agdal exclosures retain higher summer NDVI than open corridors.",
          fieldCheck: {
            what: "Agdal opening dates and corridor stocking density",
            method: "Paired transect checks across agdal boundary stones",
            seasonWindow: "May to August",
          },
        },
        {
          explanationId: "land_use",
          statement: "Irrigated terrace and seguia diversion changes below 2317 m.",
          statusReason: "Lower-band trend diverges from upper pasture slopes.",
          prediction: "Rehabilitated seguia perimeters maintain steadier growing-season NDVI.",
          fieldCheck: {
            what: "Seguia intake and check-dam condition below 2317 m",
            method: "Participatory canal walk with water user associations",
            seasonWindow: "April to September",
          },
        },
        {
          explanationId: "snow_terrain",
          statement: "High-elevation snowpack duration and north/south aspect moisture retention.",
          statusReason: "Upper slopes above 2317 m depend on spring snowmelt timing.",
          prediction: "North-facing hollows retain moisture longer than south-facing scree.",
          fieldCheck: {
            what: "Spring snowline retreat across north vs south aspects",
            method: "Sentinel-2 NDSI and aspect-stratified plot checks",
            seasonWindow: "March to June",
          },
        },
        {
          explanationId: "data_artefact",
          statement: "MODIS/Landsat cross-sensor calibration and Benjamini-Hochberg FDR filtering.",
          statusReason: "Pixel-level slopes survive q = 0.05 FDR control.",
          prediction: "Trend persists after sensor harmonization and cloud-mask screening.",
          fieldCheck: {
            what: "Harmonized surface reflectance QA flags",
            method: "Compare independent Landsat and MODIS pixel series",
            seasonWindow: "June to August",
          },
        },
      ],
      verifiedFindings: [
        {
          statement:
            "Auclair & Alifriqui (2023) document that customary agdal opening dates regulate transhumance livestock grazing pressure above 2317 m.",
          sourceId: "src_ahansal_agdal_1",
          exactQuote:
            "Customary agdal opening dates regulate transhumance livestock grazing pressure above 2317 m across upper Oued Ahansal pastures.",
          interpretation: "Links upper-band vegetation dynamics to agdal pastoral calendar governance.",
        },
        {
          statement:
            "Boudhar & Chehbouni (2024) report that valley-floor irrigation canal diversions below 2317 m stabilized terrace soil moisture.",
          sourceId: "src_ahansal_band_2",
          exactQuote:
            "Valley-floor irrigation canal diversions and check-dam rehabilitation below 2317 m stabilized terrace soil moisture during dry years.",
          interpretation: "Explains lower-band resilience below the 2317 m elevation split.",
        },
      ],
      briefSummary:
        "Across Oued Ahansal, 25-year drying interacts with customary agdal grazing above 2317 m [src_ahansal_agdal_1] and valley-floor seguia irrigation below 2317 m [src_ahansal_band_2].",
    };

    const verified = verifyLlmReasonerOutput(rawOutput, sampleSources, {
      model: DEFAULT_META_MODEL,
      bandLimitM: 2317,
    });

    expect(verified).not.toBeNull();
    expect(verified!.hypotheses).toHaveLength(2);
    expect(verified!.causes).toHaveLength(5);
    expect(verified!.verifiedFindings).toHaveLength(2);
    expect(verified!.visualChoreography).toBeDefined();
    expect(verified!.visualChoreography).toHaveLength(5);

    const byExp = new Map(
      verified!.visualChoreography!.map((vc) => [vc.explanationId, vc] as const),
    );

    expect(byExp.get("rainfall")).toMatchObject({
      explanationId: "rainfall",
      stageId: "rain",
      camera: { zoom: 1.08, turn: 14 },
      elevationBandM: null,
      layer: "rain",
    });

    expect(byExp.get("grazing")).toEqual({
      explanationId: "grazing",
      stageId: "agdal",
      camera: { zoom: 1.18, turn: -28 },
      elevationBandM: [2317, 3200],
      layer: "routes",
      sourceId: "src_ahansal_agdal_1",
      exactQuote:
        "Customary agdal opening dates regulate transhumance livestock grazing pressure above 2317 m across upper Oued Ahansal pastures.",
    });

    expect(byExp.get("land_use")).toEqual({
      explanationId: "land_use",
      stageId: "band",
      camera: { zoom: 1.22, turn: -18 },
      elevationBandM: [1800, 2317],
      layer: "cover",
      sourceId: "src_ahansal_band_2",
      exactQuote:
        "Valley-floor irrigation canal diversions and check-dam rehabilitation below 2317 m stabilized terrace soil moisture during dry years.",
    });

    expect(byExp.get("snow_terrain")).toMatchObject({
      explanationId: "snow_terrain",
      stageId: "time",
      camera: { zoom: 1.14, turn: 8 },
      elevationBandM: [2317, 3200],
      layer: "ndvi",
    });

    expect(byExp.get("data_artefact")).toMatchObject({
      explanationId: "data_artefact",
      stageId: "pixel",
      camera: { zoom: 1.35, turn: 22 },
      elevationBandM: null,
      layer: "ndvi",
    });

    for (const cause of verified!.causes) {
      expect(cause.visualFocus).toBeDefined();
      expect(cause.visualFocus!.explanationId).toBe(cause.explanationId);
    }

    expect(containsProhibitedClaim(JSON.stringify(verified))).toBe(false);
  });

  it("executes reasonOverCaseWithLlm and returns verified findings with visualChoreography", async () => {
    const climate = buildMockClimate();
    const body = buildMetaResponsesRequestBody(
      {
        placeName: "Oued Ahansal",
        regionName: "Azilal, Morocco",
        lon: -6.42,
        lat: 31.66,
        minElevationM: 1800,
        maxElevationM: 3200,
        bandLimitM: 2317,
        climate,
        sources: sampleSources,
      },
      DEFAULT_META_MODEL,
    );
    expect(body["max_output_tokens"]).toBe(DEFAULT_MAX_OUTPUT_TOKENS);
    expect(LLM_REASONER_JSON_SCHEMA.additionalProperties).toBe(false);

    const mockFetch: typeof globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          output_text: JSON.stringify({
            hypotheses: [
              {
                key: "land_use",
                statement: "Valley-floor irrigation diversions buffered lower-band terraces.",
                assessment: "Consistent with lower-band NDVI stability.",
                status: "consistent",
              },
            ],
            interventions: [],
            causes: [
              {
                explanationId: "land_use",
                statement: "Valley-floor seguia diversions below 2317 m.",
                statusReason: "Diverges from upper slope browning.",
                prediction: "Irrigated terraces retain higher summer NDVI.",
                fieldCheck: {
                  what: "Seguia canal intakes below 2317 m",
                  method: "Field walk with water user association",
                  seasonWindow: "May to September",
                },
              },
            ],
            verifiedFindings: [
              {
                statement: "Valley-floor irrigation canal diversions stabilized soil moisture.",
                sourceId: "src_ahansal_band_2",
                exactQuote:
                  "Valley-floor irrigation canal diversions and check-dam rehabilitation below 2317 m stabilized terrace soil moisture during dry years.",
                interpretation: "Explains lower-band resilience.",
              },
            ],
            briefSummary: "Seguia diversions buffered lower-band terraces [src_ahansal_band_2].",
          }),
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );

    const res = await reasonOverCaseWithLlm({
      placeName: "Oued Ahansal",
      regionName: "Azilal, Morocco",
      lon: -6.42,
      lat: 31.66,
      minElevationM: 1800,
      maxElevationM: 3200,
      bandLimitM: 2317,
      climate,
      sources: sampleSources,
      config: {
        provider: "meta",
        model: DEFAULT_META_MODEL,
        apiKey: "test-key",
        baseUrl: META_API_BASE_URL,
      },
      fetchImpl: mockFetch,
    });

    expect(res).not.toBeNull();
    expect(res!.visualChoreography).toHaveLength(5);
    expect(res!.causes[0]!.visualFocus?.stageId).toBe("band");
    expect(res!.causes[0]!.visualFocus?.elevationBandM).toEqual([1800, 2317]);
    expect(res!.causes[0]!.visualFocus?.sourceId).toBe("src_ahansal_band_2");
  });

  it("gives the model the rainfall series with its source and names vegetation as not measured", () => {
    const body = buildMetaResponsesRequestBody(
      {
        placeName: "Oued Ahansal",
        regionName: "Azilal, Morocco",
        lon: -6.42,
        lat: 31.66,
        minElevationM: 1800,
        maxElevationM: 3200,
        climate: buildMockClimate(),
        sources: sampleSources,
      },
      DEFAULT_META_MODEL,
    );
    const prompt = JSON.stringify(body["input"]);
    expect(prompt).toContain("Open-Meteo Historical Weather API");
    expect(prompt).toContain("Not measured");
    expect(prompt).not.toMatch(/[-+]?\d+\.\d+ NDVI/);
    expect(prompt).not.toMatch(/Temperature trend: [-+]?\d/);
    expect(prompt).not.toMatch(/R² \(/);
  });
});
