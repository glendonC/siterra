import {
  Brief,
  Evidence,
  ExplanationBranch,
  Hypothesis,
  Intervention,
  OperationalAction,
  Source,
} from "@siterra/contracts";
import { describe, expect, it } from "vitest";
import { computeStatsFromAnnual } from "./climate-series.ts";
import {
  extractVerbatimExcerpt,
  fetchGovernmentPolicyAndOpenAccess,
  stripHtmlAndNormalize,
} from "./government-policy-fetcher.ts";
import {
  DEFAULT_MAX_OUTPUT_TOKENS,
  DEFAULT_META_MODEL,
  LLM_REASONER_JSON_SCHEMA,
  META_API_BASE_URL,
  buildMetaResponsesRequestBody,
  containsProhibitedClaim,
  isVerbatimQuoteInSource,
  reasonOverCaseWithLlm,
  resolveLlmConfig,
  verifyLlmReasonerOutput,
} from "./llm-reasoner.ts";
import { synthesizeLiveCaseSnapshot } from "./snapshot-synthesizer.ts";

const NOW = "2026-10-31T12:00:00.000Z";
const CASE_ID = "case_loc_klamath_basin_a1b2c3";
const GEO_ID = "geo_loc_klamath_basin_a1b2c3";

function buildMockClimate() {
  const years = [];
  for (let yr = 2000; yr <= 2024; yr++) {
    years.push({
      year: yr,
      precipMm: 420 - (yr - 2000) * 2.5,
      et0Mm: null,
    });
  }
  return computeStatsFromAnnual(years);
}

describe("government-policy-fetcher", () => {
  it("strips HTML and extracts verbatim 1-2 sentence excerpts cleanly", () => {
    const raw =
      "<h4>Abstract</h4> <p>Seasonal irrigation diversions in the Upper Klamath Basin shifted wetland hydroperiods between 2001 and 2022.</p> <p>Riparian willow recovery depended on spring groundwater table elevation.</p>";
    const cleaned = stripHtmlAndNormalize(raw);
    expect(cleaned).toBe(
      "Seasonal irrigation diversions in the Upper Klamath Basin shifted wetland hydroperiods between 2001 and 2022. Riparian willow recovery depended on spring groundwater table elevation.",
    );
    const excerpt = extractVerbatimExcerpt(raw, 260);
    expect(excerpt).toBe(cleaned);
  });

  it("queries World Bank, Federal Register, and EuropePMC in parallel and returns schema-valid Sources and Evidence", async () => {
    const requestedUrls: string[] = [];

    const mockFetch: typeof globalThis.fetch = async (input) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      requestedUrls.push(url);

      if (url.includes("search.worldbank.org/api/v2/wds")) {
        return new Response(
          JSON.stringify({
            documents: {
              D1001: {
                id: "D1001",
                display_title: "Integrated Watershed Restoration and Irrigation Modernization Project",
                docdt: "2023-05-14T00:00:00Z",
                url: "https://documents.worldbank.org/en/publication/documents-reports/documentdetail/1001",
                authr: "World Bank Water Practice; Ministry of Water Resources",
                colti: "Watershed Management Series",
                abstracts: {
                  "cdata!":
                    "Check-dam rehabilitation and canal lining across the upper catchment reduced conveyance losses by 18 percent across monitored irrigation perimeters. Community water user associations co-managed seasonal allocation schedules.",
                },
              },
              facets: {},
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }

      if (url.includes("www.federalregister.gov/api/v1/documents.json")) {
        return new Response(
          JSON.stringify({
            results: [
              {
                document_number: "2024-11223",
                title: "Environmental Impact Statement for Klamath Basin Water Operations and Riparian Habitat",
                publication_date: "2024-03-19",
                html_url: "https://www.federalregister.gov/documents/2024/03/19/2024-11223/klamath-basin",
                abstract:
                  "The Bureau of Reclamation and Fish and Wildlife Service establish minimum instream flow tiers and seasonal grazing exclusions along degraded tributary reaches.",
                agencies: [
                  { name: "Department of the Interior" },
                  { name: "Bureau of Reclamation" },
                ],
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }

      if (url.includes("www.ebi.ac.uk/europepmc/webservices/rest/search")) {
        return new Response(
          JSON.stringify({
            resultList: {
              result: [
                {
                  id: "38112233",
                  source: "MED",
                  doi: "10.1016/j.jhydrol.2024.130999",
                  title: "Multi-decadal groundwater-surface water interactions in montane rangeland catchments",
                  authorString: "Martinez L, Chen W, Patel R.",
                  journalTitle: "Journal of Hydrology",
                  pubYear: "2024",
                  abstractText:
                    "Isotopic hydrograph separation across 24 montane sub-basins indicates that snowmelt recharge buffers lower valley meadow greenness during meteorological drought years. Overgrazing on steep upper slopes accelerated late-summer soil moisture depletion.",
                },
              ],
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }

      return new Response("Not Found", { status: 404 });
    };

    const result = await fetchGovernmentPolicyAndOpenAccess({
      caseId: CASE_ID,
      slug: "klamath_basin",
      hash6: "a1b2c3",
      placeName: "Klamath Basin",
      regionName: "Oregon, United States",
      geoId: GEO_ID,
      now: NOW,
      question: "How do irrigation rules and snowmelt affect valley meadow greenness?",
      fetchImpl: mockFetch,
    });

    expect(requestedUrls).toHaveLength(3);
    expect(requestedUrls.some((u) => u.includes("search.worldbank.org"))).toBe(true);
    expect(requestedUrls.some((u) => u.includes("www.federalregister.gov"))).toBe(true);
    expect(requestedUrls.some((u) => u.includes("www.ebi.ac.uk/europepmc"))).toBe(true);

    expect(result.sources).toHaveLength(3);
    expect(result.evidence).toHaveLength(3);

    for (const src of result.sources) {
      const parsed = Source.parse(src);
      expect(parsed.contentHash).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(["institutional", "peer_reviewed"]).toContain(parsed.sourceKind);
    }

    for (const ev of result.evidence) {
      const parsed = Evidence.parse(ev);
      expect(parsed.claimKind).toBe("scientific_context");
      expect(parsed.provenance.verificationStatus).toBe("source_checked");
      const loc = parsed.provenance.sourceLocators[0];
      expect(loc).toBeDefined();
      expect(loc?.excerpt && loc.excerpt.length > 25).toBe(true);

      const matchingSource = result.sources.find((s) => s.id === loc?.sourceId);
      expect(matchingSource).toBeDefined();
      expect(isVerbatimQuoteInSource(loc!.excerpt!, matchingSource!)).toBe(true);
    }
  });

  it("never throws when all external APIs fail or reject", async () => {
    const failingFetch: typeof globalThis.fetch = async () => {
      throw new Error("Network unreachable");
    };

    const result = await fetchGovernmentPolicyAndOpenAccess({
      caseId: CASE_ID,
      slug: "klamath_basin",
      hash6: "a1b2c3",
      placeName: "Klamath Basin",
      regionName: "Oregon",
      geoId: GEO_ID,
      now: NOW,
      fetchImpl: failingFetch,
    });

    expect(result.sources).toEqual([]);
    expect(result.evidence).toEqual([]);
  });
});

describe("llm-reasoner (Meta muse-spark-1.3 & independent quote verification)", () => {
  const sampleSources: Source[] = [
    Source.parse({
      recordType: "Source",
      id: "src_epmc_klamath_a1b2c3_1",
      revision: 1,
      createdAt: NOW,
      updatedAt: NOW,
      caseId: CASE_ID,
      title: "Multi-decadal groundwater-surface water interactions in montane rangeland catchments",
      url: "https://doi.org/10.1016/j.jhydrol.2024.130999",
      publisher: "Journal of Hydrology",
      authors: ["Martinez L", "Chen W"],
      publicationDate: "2024",
      language: "en",
      accessedAt: NOW,
      sourceKind: "peer_reviewed",
      accessStatus: "retrieved",
      license: "CC BY 4.0",
      redistributionStatus: "permitted",
      contentHash: "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      notes: [
        "Isotopic hydrograph separation across 24 montane sub-basins indicates that snowmelt recharge buffers lower valley meadow greenness during meteorological drought years.",
      ],
    }),
    Source.parse({
      recordType: "Source",
      id: "src_fr_klamath_a1b2c3_2",
      revision: 1,
      createdAt: NOW,
      updatedAt: NOW,
      caseId: CASE_ID,
      title: "Environmental Impact Statement for Klamath Basin Water Operations",
      url: "https://www.federalregister.gov/documents/2024/03/19/2024-11223/klamath-basin",
      publisher: "US Federal Register / Bureau of Reclamation",
      authors: ["Bureau of Reclamation"],
      publicationDate: "2024-03-19",
      language: "en",
      accessedAt: NOW,
      sourceKind: "institutional",
      accessStatus: "retrieved",
      license: "US Government Public Domain",
      redistributionStatus: "permitted",
      contentHash: "sha256:fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210",
      notes: [
        "The Bureau of Reclamation and Fish and Wildlife Service establish minimum instream flow tiers and seasonal grazing exclusions along degraded tributary reaches.",
      ],
    }),
  ];

  it("resolves Meta LLM config from environment or Keychain reader", () => {
    const fromEnv = resolveLlmConfig({
      env: { MODEL_API_KEY: "meta-test-key-123" },
      allowKeychain: false,
    });
    expect(fromEnv).toEqual({
      provider: "meta",
      model: DEFAULT_META_MODEL,
      apiKey: "meta-test-key-123",
      baseUrl: META_API_BASE_URL,
    });

    const fromKeychain = resolveLlmConfig({
      env: {},
      readKeychain: (service) =>
        service === "siterra-meta-model-api" ? "keychain-meta-secret" : null,
    });
    expect(fromKeychain).toEqual({
      provider: "meta",
      model: DEFAULT_META_MODEL,
      apiKey: "keychain-meta-secret",
      baseUrl: META_API_BASE_URL,
    });

    const missing = resolveLlmConfig({
      env: {},
      allowKeychain: false,
    });
    expect(missing).toBeNull();
  });

  it("verifies verbatim quotes, rejects hallucinated quotes, and filters prohibited certainty claims", () => {
    expect(containsProhibitedClaim("This proves that grazing is the sole cause.")).toBe(true);
    expect(containsProhibitedClaim("This is guaranteed to restore the meadow.")).toBe(true);
    expect(containsProhibitedClaim("Consistent with seasonal grazing pressure.")).toBe(false);

    const rawModelOutput = {
      hypotheses: [
        {
          key: "rainfall",
          statement:
            "Declining multi-decadal precipitation (-6.0 mm/decade) and drought years (2022–2024) contributed to lower catchment greenness.",
          assessment:
            "Supported by the 25-year ERA5 precipitation trend and soil moisture anomalies.",
          status: "consistent",
        },
        {
          key: "grazing",
          statement: "This proves that overgrazing definitely destroyed the upper meadow.",
          assessment: "Prohibited certainty claim that must be filtered out.",
          status: "consistent",
        },
        {
          key: "land_use",
          statement:
            "Bureau of Reclamation irrigation flow tiers and valley-floor diversions below 1350 m mediated meadow greenness.",
          assessment: "Requires local diversion schedule verification with irrigation districts.",
          status: "inconclusive",
        },
      ],
      interventions: [
        {
          title: "Coordinate tributary grazing exclusions with Bureau of Reclamation flow tiers",
          description:
            "Align seasonal livestock rotation along degraded tributary reaches with minimum instream flow tiers.",
          assumptions: ["Local allotment holders participate in seasonal corridor scheduling."],
          fieldValidationNeeded: ["Allotment stocking dates above 1350 m."],
          livelihoodConsiderations: ["Alternative upland forage and water trough access."],
          targetExplanation: "grazing",
        },
      ],
      causes: [
        {
          explanationId: "rainfall",
          statement: "Multi-decadal precipitation decline across the Klamath Basin.",
          statusReason: "Precipitation and NDVI co-moved across 17 of 25 seasons.",
          prediction: "Wet-season rainfall and valley NDVI move in the same direction.",
          fieldCheck: {
            what: "Snowpillow and valley rain-gauge records",
            method: "Cross-check SNOTEL and irrigation district gauges",
            seasonWindow: "October to June",
          },
        },
        {
          explanationId: "land_use",
          statement: "Irrigation canal diversions and instream flow tier adjustments.",
          statusReason: "Requires local headgate diversion logs below 1350 m.",
          prediction: "Headgate diversion reductions match browner valley-floor cells.",
          fieldCheck: {
            what: "Irrigation district headgate diversion logs below 1350 m",
            method: "Consult Bureau of Reclamation and water user association logs",
            seasonWindow: "April to September",
          },
        },
      ],
      verifiedFindings: [
        {
          // Valid verbatim substring (case/whitespace normalized)
          statement:
            "Martinez et al. (2024) show that snowmelt recharge buffers lower valley meadow greenness during drought years.",
          sourceId: "src_epmc_klamath_a1b2c3_1",
          exactQuote:
            "snowmelt recharge buffers lower valley meadow greenness during meteorological drought years.",
          interpretation: "Demonstrates topographic groundwater buffering in valley meadows.",
        },
        {
          // Hallucinated quote NOT in source -> MUST BE REJECTED
          statement: "Federal Register notice mandates dam removal in 2021.",
          sourceId: "src_fr_klamath_a1b2c3_2",
          exactQuote: "Four hydroelectric dams shall be decommissioned immediately by 2021.",
          interpretation: "Hallucinated quote.",
        },
        {
          // Prohibited certainty word in statement -> MUST BE REJECTED
          statement:
            "This study proves that minimum instream flow tiers definitely restore all fish habitat.",
          sourceId: "src_fr_klamath_a1b2c3_2",
          exactQuote:
            "establish minimum instream flow tiers and seasonal grazing exclusions along degraded tributary reaches.",
          interpretation: "Contains prohibited word proves/definitely.",
        },
      ],
      briefSummary:
        "Across Klamath Basin, ERA5 records show declining precipitation while snowmelt recharge buffers valley meadows [src_epmc_klamath_a1b2c3_1] and Bureau of Reclamation notices establish minimum instream flow tiers [src_fr_klamath_a1b2c3_2].",
    };

    const verified = verifyLlmReasonerOutput(rawModelOutput, sampleSources, {
      model: DEFAULT_META_MODEL,
    });

    expect(verified).not.toBeNull();
    expect(verified!.provider).toBe("meta");
    expect(verified!.model).toBe("muse-spark-1.3");

    // Only the 1 genuinely verbatim, non-prohibited finding survives
    expect(verified!.verifiedFindings).toHaveLength(1);
    expect(verified!.verifiedFindings[0]!.sourceId).toBe("src_epmc_klamath_a1b2c3_1");
    expect(verified!.verifiedFindings[0]!.exactQuote).toBe(
      "snowmelt recharge buffers lower valley meadow greenness during meteorological drought years.",
    );

    // The hypothesis containing "proves" / "definitely" was rejected
    expect(verified!.hypotheses).toHaveLength(2);
    expect(verified!.hypotheses.map((h) => h.key)).toEqual(["rainfall", "land_use"]);

    // Zero prohibited words anywhere in the verified output
    expect(containsProhibitedClaim(JSON.stringify(verified))).toBe(false);
  });

  it("formats Meta /v1/responses call with reasoning.effort='low' and max_output_tokens=2500 and synthesizes schema-valid records", async () => {
    const climate = buildMockClimate();
    let capturedUrl = "";
    let capturedHeaders: Record<string, string> = {};
    let capturedBody: Record<string, unknown> = {};

    const bodyCheck = buildMetaResponsesRequestBody(
      {
        placeName: "Klamath Basin",
        regionName: "Oregon, United States",
        lon: -121.78,
        lat: 42.22,
        minElevationM: 1240,
        maxElevationM: 2180,
        areaKm2: 144,
        climate,
        sources: sampleSources,
        question: "What explains the 25-year meadow trend?",
      },
      DEFAULT_META_MODEL,
    );
    expect(bodyCheck["model"]).toBe("muse-spark-1.3");
    expect(bodyCheck["reasoning"]).toEqual({ effort: "low" });
    expect(bodyCheck["max_output_tokens"]).toBe(DEFAULT_MAX_OUTPUT_TOKENS);
    expect(Number(bodyCheck["max_output_tokens"])).toBeGreaterThanOrEqual(1024);

    const mockMetaFetch: typeof globalThis.fetch = async (input, init) => {
      capturedUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      capturedHeaders = (init?.headers as Record<string, string>) ?? {};
      capturedBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;

      const responseJson = {
        id: "resp_meta_live_001",
        status: "completed",
        output: [
          {
            type: "reasoning",
            summary: [],
          },
          {
            type: "message",
            role: "assistant",
            content: [
              {
                type: "output_text",
                text: JSON.stringify({
                  hypotheses: [
                    {
                      key: "rainfall",
                      statement:
                        "Multi-decadal precipitation decline across the Klamath Basin contributed to the downward NDVI trend.",
                      assessment:
                        "Supported by 25-year ERA5 precipitation and vegetation co-movement.",
                      status: "consistent",
                    },
                    {
                      key: "grazing",
                      statement:
                        "Seasonal livestock grazing along tributary reaches above 1597 m interacted with drought years.",
                      assessment:
                        "Requires field verification of tributary grazing exclusions.",
                      status: "inconclusive",
                    },
                    {
                      key: "land_use",
                      statement:
                        "Valley-floor irrigation operations under Bureau of Reclamation flow tiers shaped lower-band greenness.",
                      assessment:
                        "Requires headgate diversion history below 1597 m.",
                      status: "inconclusive",
                    },
                  ],
                  interventions: [
                    {
                      title: "Align tributary grazing exclusions with Bureau of Reclamation flow tiers",
                      description:
                        "Coordinate seasonal riparian grazing exclusions along tributary reaches with minimum instream flow tiers.",
                      assumptions: ["Tributary allotment schedules can be reviewed with local permittees."],
                      fieldValidationNeeded: ["Tributary grazing exclusion compliance above 1597 m."],
                      livelihoodConsiderations: ["Seasonal forage alternatives for ranching households."],
                      targetExplanation: "grazing",
                    },
                  ],
                  causes: [
                    {
                      explanationId: "rainfall",
                      statement: "25-year precipitation decline across the Klamath Basin.",
                      statusReason: "Rainfall and NDVI co-move across the 25-year ERA5 series.",
                      prediction: "Seasonal rainfall and meadow NDVI move together.",
                      fieldCheck: {
                        what: "Upper basin snowpack and rain gauge series",
                        method: "Compare SNOTEL stations with ERA5 grid cells",
                        seasonWindow: "Wet season (Oct–May)",
                      },
                    },
                    {
                      explanationId: "grazing",
                      statement: "Riparian and upland grazing pressure along tributary reaches.",
                      statusReason: "Requires allotment stocking verification above 1597 m.",
                      prediction: "Ungrazed tributary exclosures retain higher late-summer NDVI.",
                      fieldCheck: {
                        what: "Tributary grazing exclusion and stocking schedules above 1597 m",
                        method: "Transect comparison across fenced vs unfenced riparian reaches",
                        seasonWindow: "July to September",
                      },
                    },
                    {
                      explanationId: "land_use",
                      statement: "Valley-floor irrigation headgate diversions and flow tier rules.",
                      statusReason: "Requires water user association diversion logs below 1597 m.",
                      prediction: "Parcels with senior flow allocations maintain steadier NDVI.",
                      fieldCheck: {
                        what: "Canal headgate diversion histories below 1597 m",
                        method: "Consult Bureau of Reclamation and water user association records",
                        seasonWindow: "Irrigation season (Apr–Sep)",
                      },
                    },
                  ],
                  verifiedFindings: [
                    {
                      statement:
                        "Bureau of Reclamation (2024) establishes minimum instream flow tiers and seasonal grazing exclusions [src_fr_klamath_a1b2c3_2].",
                      sourceId: "src_fr_klamath_a1b2c3_2",
                      exactQuote:
                        "The Bureau of Reclamation and Fish and Wildlife Service establish minimum instream flow tiers and seasonal grazing exclusions along degraded tributary reaches.",
                      interpretation: "Documents federal regulatory flow and grazing framework.",
                    },
                  ],
                  briefSummary:
                    "In the Klamath Basin, 25-year drying interacts with snowmelt groundwater buffering [src_epmc_klamath_a1b2c3_1] and Bureau of Reclamation instream flow and grazing rules [src_fr_klamath_a1b2c3_2].",
                }),
              },
            ],
          },
        ],
      };

      return new Response(JSON.stringify(responseJson), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };

    const llmResult = await reasonOverCaseWithLlm({
      placeName: "Klamath Basin",
      regionName: "Oregon, United States",
      lon: -121.78,
      lat: 42.22,
      minElevationM: 1240,
      maxElevationM: 2180,
      areaKm2: 144,
      climate,
      sources: sampleSources,
      question: "What explains the 25-year meadow trend?",
      config: {
        provider: "meta",
        model: DEFAULT_META_MODEL,
        apiKey: "test-meta-api-key",
        baseUrl: META_API_BASE_URL,
      },
      fetchImpl: mockMetaFetch,
    });

    expect(capturedUrl).toBe("https://api.meta.ai/v1/responses");
    expect(capturedHeaders["Authorization"]).toBe("Bearer test-meta-api-key");
    expect(capturedBody["model"]).toBe("muse-spark-1.3");
    expect(capturedBody["reasoning"]).toEqual({ effort: "low" });
    expect(capturedBody["max_output_tokens"]).toBe(8192);

    expect(llmResult).not.toBeNull();
    expect(llmResult!.verifiedFindings).toHaveLength(1);
    expect(llmResult!.verifiedFindings[0]!.sourceId).toBe("src_fr_klamath_a1b2c3_2");

    // Verify full snapshot synthesis with llmResult
    const baseEv = Evidence.parse({
      recordType: "Evidence",
      id: "ev_climate_klamath_a1b2c3",
      revision: 1,
      createdAt: NOW,
      updatedAt: NOW,
      caseId: CASE_ID,
      statement: "25-year ERA5 climate and vegetation trend across Klamath Basin.",
      claimKind: "observation",
      status: "accepted",
      geoSelectionId: GEO_ID,
      periodIds: ["period_2024-06"],
      measurementIds: ["meas_catchment_trend_klamath_a1b2c3"],
      provenance: {
        sourceLocators: [],
        dataBundleIds: ["bundle_loc_klamath_a1b2c3"],
        methodId: "open_meteo_era5_watershed_series",
        methodVersion: "1.0.0",
        inputVersions: [{ entityId: "bundle_loc_klamath_a1b2c3", revision: 1 }],
        generatedByTaskId: null,
        generatedAt: NOW,
        verificationStatus: "computed_checked",
        limitations: ["ERA5 archive."],
      },
      interpretation: null,
      uncertainty: "95% OLS interval.",
      reviewDecisionIds: [],
    });

    const synth = synthesizeLiveCaseSnapshot({
      caseId: CASE_ID,
      slug: "klamath_basin",
      hash6: "a1b2c3",
      placeName: "Klamath Basin",
      regionName: "Oregon, United States",
      question: "What explains the 25-year meadow trend?",
      now: NOW,
      geoId: GEO_ID,
      bundleId: "bundle_loc_klamath_a1b2c3",
      periodIds: ["period_2024-06"],
      bandLimitM: 1597,
      terrain: { minElevationM: 1240, maxElevationM: 2180 },
      climate,
      sources: sampleSources,
      evidence: [baseEv],
      measurementIds: {
        catchmentTrendId: "meas_catchment_trend_klamath_a1b2c3",
        precipTrendId: "meas_precip_trend_klamath_a1b2c3",
        rainR2Id: "meas_rain_r2_klamath_a1b2c3",
        fdrUpId: "meas_fdr_up_klamath_a1b2c3",
        fdrDownId: "meas_fdr_down_klamath_a1b2c3",
        bandTrendId: "meas_band_low_klamath_a1b2c3",
        bandLimitId: "meas_band_limit_klamath_a1b2c3",
      },
      llmResult,
    });

    expect(synth.hypotheses.every((h) => Hypothesis.safeParse(h).success)).toBe(true);
    expect(synth.explanationBranches.every((b) => ExplanationBranch.safeParse(b).success)).toBe(
      true,
    );
    expect(synth.explanationBranches[0]!.model.model).toBe("muse-spark-1.3");
    expect(synth.interventions.every((i) => Intervention.safeParse(i).success)).toBe(true);
    expect(OperationalAction.safeParse(synth.operationalAction).success).toBe(true);
    expect(Brief.safeParse(synth.brief).success).toBe(true);
    expect(synth.brief.mode).toBe("live");
    expect(synth.brief.known[0]!.text).toContain("Bureau of Reclamation");
  });

  it("ensures LLM_REASONER_JSON_SCHEMA conforms strictly to Meta structured-output rules", () => {
    const checkNode = (node: Record<string, unknown>, path: string, depth: number) => {
      expect(depth).toBeLessThanOrEqual(10);
      if (node["type"] === "object") {
        expect(node["additionalProperties"], `${path} additionalProperties`).toBe(false);
        const props = (node["properties"] ?? {}) as Record<string, Record<string, unknown>>;
        const req = (node["required"] ?? []) as string[];
        for (const key of Object.keys(props)) {
          expect(req, `${path}.${key} required`).toContain(key);
          checkNode(props[key]!, `${path}.${key}`, depth + 1);
        }
      }
      if (node["items"] && typeof node["items"] === "object") {
        checkNode(node["items"] as Record<string, unknown>, `${path}[]`, depth + 1);
      }
    };
    checkNode(LLM_REASONER_JSON_SCHEMA as unknown as Record<string, unknown>, "$", 1);
  });
});
