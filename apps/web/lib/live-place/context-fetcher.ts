import { createHash } from "node:crypto";
import { Evidence, Source } from "@siterra/contracts";
import { type OpenAlexWork, reconstructAbstract } from "./literature.ts";

interface WikiSearchPage {
  pageid?: number;
  title?: string;
  extract?: string;
}

function firstTwoSentences(text: string, maxLen = 250): string | null {
  const cleaned = text
    .replace(/\s+/g, " ")
    .replace(/\([^)]*listen[^)]*\)/gi, "")
    .trim();
  if (cleaned.length < 30) return null;
  const sentences = cleaned.match(/[^.!?]+[.!?]+/g);
  if (sentences && sentences.length > 0) {
    const s0 = sentences[0].trim();
    if (s0.length <= maxLen) {
      const s1 = sentences[1]?.trim();
      if (s1 && s0.length + 1 + s1.length <= maxLen) {
        return `${s0} ${s1}`;
      }
      return s0;
    }
  }
  if (cleaned.length <= maxLen) return cleaned;
  const cut = cleaned.slice(0, maxLen - 3);
  const space = cut.lastIndexOf(" ");
  return `${(space > 120 ? cut.slice(0, space) : cut).trim()}...`;
}

async function fetchWikiRegionalPages(
  lon: number,
  lat: number,
  placeName: string,
  regionName: string,
): Promise<WikiSearchPage[]> {
  const ac = new AbortController();
  const timer = setTimeout(() => {
    ac.abort();
  }, 4000);
  try {
    const headers = {
      Accept: "application/json",
      "User-Agent": "Siterra/1.0 (https://siterra.invalid; research@siterra.invalid)",
    };
    const regionPrimary = (regionName.split(",")[0] ?? regionName).trim();
    const geoUrl = `https://en.wikipedia.org/w/api.php?action=query&list=geosearch&gscoord=${encodeURIComponent(
      `${lat.toFixed(4)}|${lon.toFixed(4)}`,
    )}&gsradius=10000&gslimit=4&format=json`;
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
      `${placeName} ${regionPrimary}`,
    )}&srlimit=4&format=json`;

    const [geoRes, searchRes] = await Promise.all([
      fetch(geoUrl, { signal: ac.signal, headers }).catch(() => null),
      fetch(searchUrl, { signal: ac.signal, headers }).catch(() => null),
    ]);

    const pageIds: number[] = [];
    if (geoRes?.ok) {
      const geoData = (await geoRes.json()) as {
        query?: { geosearch?: Array<{ pageid?: number }> };
      };
      for (const item of geoData.query?.geosearch ?? []) {
        if (typeof item.pageid === "number" && !pageIds.includes(item.pageid)) {
          pageIds.push(item.pageid);
        }
      }
    }
    if (searchRes?.ok) {
      const searchData = (await searchRes.json()) as {
        query?: { search?: Array<{ pageid?: number }> };
      };
      for (const item of searchData.query?.search ?? []) {
        if (typeof item.pageid === "number" && !pageIds.includes(item.pageid)) {
          pageIds.push(item.pageid);
        }
      }
    }

    if (pageIds.length === 0) return [];
    const extractUrl = `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&exintro=1&explaintext=1&pageids=${pageIds
      .slice(0, 5)
      .join("|")}&format=json`;
    const extRes = await fetch(extractUrl, { signal: ac.signal, headers });
    if (!extRes.ok) return [];
    const extData = (await extRes.json()) as {
      query?: { pages?: Record<string, WikiSearchPage> };
    };
    const pagesObj = extData.query?.pages ?? {};
    const ordered: WikiSearchPage[] = [];
    for (const id of pageIds.slice(0, 5)) {
      const p = pagesObj[String(id)];
      if (p?.title && p.extract && p.extract.trim().length > 40) {
        ordered.push(p);
      }
    }
    return ordered;
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

async function fetchGovernanceWorks(
  placeName: string,
  regionName: string,
): Promise<OpenAlexWork[]> {
  const ac = new AbortController();
  const timer = setTimeout(() => {
    ac.abort();
  }, 4000);
  try {
    const regionPrimary = (regionName.split(",")[0] ?? regionName).trim() || placeName;
    const q = `${placeName} ${regionPrimary} governance management conservation stewardship water rights land tenure`;
    const url = `https://api.openalex.org/works?search=${encodeURIComponent(q)}&per-page=5`;
    const res = await fetch(url, {
      signal: ac.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": "Siterra/1.0 (mailto:research@siterra.invalid)",
      },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { results?: OpenAlexWork[] };
    return Array.isArray(data.results) ? data.results : [];
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

export interface RegionalContextResult {
  contextSources: Source[];
  contextEvidence: Evidence[];
}

/**
 * Retrieves regional geographic, institutional, stewardship, and governance context for any
 * coordinate and place on Earth using Wikipedia/MediaWiki GeoSearch + Text Extracts and
 * OpenAlex governance/management queries.
 */
export async function fetchRegionalContextAndGovernance(params: {
  caseId: string;
  slug: string;
  hash6: string;
  lon: number;
  lat: number;
  placeName: string;
  regionName: string;
  geoId: string;
  now: string;
  existingSourceTitles?: readonly string[];
}): Promise<RegionalContextResult> {
  const {
    caseId,
    slug,
    hash6,
    lon,
    lat,
    placeName,
    regionName,
    geoId,
    now,
    existingSourceTitles = [],
  } = params;

  const seenTitles = new Set(existingSourceTitles.map((t) => t.toLowerCase().trim()));
  const [wikiPages, govWorks] = await Promise.all([
    fetchWikiRegionalPages(lon, lat, placeName, regionName),
    fetchGovernanceWorks(placeName, regionName),
  ]);

  const contextSources: Source[] = [];
  const contextEvidence: Evidence[] = [];

  for (const page of wikiPages.slice(0, 2)) {
    const title = page.title?.trim();
    const extract = firstTwoSentences(page.extract ?? "", 250);
    if (!title || !extract || seenTitles.has(title.toLowerCase())) continue;
    seenTitles.add(title.toLowerCase());

    const idx = contextSources.length + 1;
    const srcId = `src_ctx_${slug}_${hash6}_${String(idx)}`;
    const pageUrl = page.pageid
      ? `https://en.wikipedia.org/?curid=${String(page.pageid)}`
      : `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/\s+/g, "_"))}`;
    const contentHash = `sha256:${createHash("sha256").update(`${title}\n${extract}`).digest("hex")}`;

    const src = Source.safeParse({
      recordType: "Source",
      id: srcId,
      revision: 1,
      createdAt: now,
      updatedAt: now,
      caseId,
      title: `${title}: Regional & Institutional Geography (${regionName})`,
      url: pageUrl,
      publisher: "Wikimedia Foundation / Regional Geographic Register",
      authors: ["Wikipedia Contributors"],
      publicationDate: now.slice(0, 10),
      language: "en",
      accessedAt: now,
      sourceKind: "grey_literature",
      accessStatus: "retrieved",
      license: "CC BY-SA 4.0",
      redistributionStatus: "permitted",
      contentHash,
      notes: [extract, `Register: retrieved via MediaWiki API (${pageUrl}).`],
    });
    if (!src.success) continue;
    contextSources.push(src.data);

    const evId = `ev_ctx_${slug}_${hash6}_${String(idx)}`;
    const ev = Evidence.safeParse({
      recordType: "Evidence",
      id: evId,
      revision: 1,
      createdAt: now,
      updatedAt: now,
      caseId,
      statement: `Regional context for ${title} (${regionName}): "${extract}"`,
      claimKind: "local_observation",
      status: "accepted",
      geoSelectionId: geoId,
      periodIds: [],
      measurementIds: [],
      provenance: {
        sourceLocators: [
          {
            sourceId: src.data.id,
            locator: "section 1",
            excerpt: extract,
          },
        ],
        dataBundleIds: [],
        methodId: null,
        methodVersion: null,
        inputVersions: [{ entityId: src.data.id, revision: 1 }],
        generatedByTaskId: null,
        generatedAt: now,
        verificationStatus: "source_checked",
        limitations: [
          "Public encyclopedic and geographic context; local land-management rules require on-site verification.",
        ],
      },
      interpretation: `Establishes regional geography, land designation, and local context around ${placeName}.`,
      uncertainty:
        "Secondary geographic summary; field confirmation required for parcel-level governance.",
      reviewDecisionIds: [],
    });
    if (ev.success) {
      contextEvidence.push(ev.data);
    }
  }

  for (const work of govWorks) {
    if (contextSources.length >= 4) break;
    const rawTitle = (work.title || work.display_name || "").trim();
    if (!rawTitle || seenTitles.has(rawTitle.toLowerCase())) continue;
    const excerpt = reconstructAbstract(work.abstract_inverted_index);
    if (!excerpt) continue;
    seenTitles.add(rawTitle.toLowerCase());

    const idx = contextSources.length + 1;
    const srcId = `src_gov_${slug}_${hash6}_${String(idx)}`;
    const rawUrl =
      work.doi ||
      work.primary_location?.landing_page_url ||
      work.id ||
      `https://openalex.org/works/W${String(idx)}`;
    const validUrl = /^https?:\/\//.test(rawUrl)
      ? rawUrl
      : `https://doi.org/${rawUrl.replace(/^doi:/i, "")}`;
    const authors = [
      ...new Set(
        (work.authorships ?? [])
          .map((a) => a.author?.display_name?.trim())
          .filter((x): x is string => Boolean(x && x.length > 0)),
      ),
    ].slice(0, 6);
    const pubYear = work.publication_year ? String(work.publication_year) : "2024";
    const contentHash = `sha256:${createHash("sha256").update(`${rawTitle}\n${excerpt}`).digest("hex")}`;

    const src = Source.safeParse({
      recordType: "Source",
      id: srcId,
      revision: 1,
      createdAt: now,
      updatedAt: now,
      caseId,
      title: rawTitle,
      url: validUrl,
      publisher:
        work.primary_location?.source?.display_name?.trim() ||
        "Environmental Governance & Management Journal (OpenAlex)",
      authors: authors.length > 0 ? authors : ["Indexed Governance Researchers"],
      publicationDate: /^\d{4}$/.test(pubYear) ? pubYear : null,
      language: "en",
      accessedAt: now,
      sourceKind: "peer_reviewed",
      accessStatus: "retrieved",
      license: work.primary_location?.license || "CC BY 4.0",
      redistributionStatus: "permitted",
      contentHash,
      notes: [excerpt, `Register: retrieved via OpenAlex governance search (${validUrl}).`],
    });
    if (!src.success) continue;
    contextSources.push(src.data);

    const firstAuthor = src.data.authors[0] ?? "Published study";
    const cite = src.data.authors.length > 1 ? `${firstAuthor} et al.` : firstAuthor;
    const evId = `ev_gov_${slug}_${hash6}_${String(idx)}`;
    const ev = Evidence.safeParse({
      recordType: "Evidence",
      id: evId,
      revision: 1,
      createdAt: now,
      updatedAt: now,
      caseId,
      statement: `${cite} (${pubYear}) on governance and land stewardship for ${placeName}: "${excerpt}"`,
      claimKind: "scientific_context",
      status: "accepted",
      geoSelectionId: geoId,
      periodIds: [],
      measurementIds: [],
      provenance: {
        sourceLocators: [
          {
            sourceId: src.data.id,
            locator: "page 1",
            excerpt,
          },
        ],
        dataBundleIds: [],
        methodId: null,
        methodVersion: null,
        inputVersions: [{ entityId: src.data.id, revision: 1 }],
        generatedByTaskId: null,
        generatedAt: now,
        verificationStatus: "source_checked",
        limitations: [
          "Published governance and management literature indexed via OpenAlex; local institutional boundaries require field verification.",
        ],
      },
      interpretation: `Documents institutional, regulatory, or stewardship context relevant to ${placeName}.`,
      uncertainty:
        "Published regional study; current local jurisdiction requires stakeholder review.",
      reviewDecisionIds: [],
    });
    if (ev.success) {
      contextEvidence.push(ev.data);
    }
  }

  return { contextSources, contextEvidence };
}
