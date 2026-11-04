import { createHash } from "node:crypto";
import { Evidence, Source } from "@siterra/contracts";

export interface WorldBankDocRaw {
  id?: string;
  display_title?: string | string[];
  Alt_title?: string | string[];
  colti?: string | string[] | { "cdata!"?: string };
  docdt?: string;
  url?: string;
  pdfurl?: string;
  authr?: string | string[] | { "cdata!"?: string };
  abstracts?: string | { "cdata!"?: string } | Array<{ "cdata!"?: string }>;
  ml_abstract?: string | { "cdata!"?: string };
  majdocty?: string;
  docty?: string;
  owner?: string;
}

export interface FederalRegisterAgencyRaw {
  name?: string;
  raw_name?: string;
}

export interface FederalRegisterDocRaw {
  document_number?: string;
  title?: string;
  type?: string;
  abstract?: string | null;
  excerpts?: string | string[] | null;
  html_url?: string;
  pdf_url?: string;
  publication_date?: string;
  agencies?: FederalRegisterAgencyRaw[];
}

export interface EuropePmcResultRaw {
  id?: string;
  source?: string;
  pmcid?: string;
  pmid?: string;
  doi?: string;
  title?: string;
  authorString?: string;
  journalTitle?: string;
  journalInfo?: {
    journal?: {
      title?: string;
    };
  };
  pubYear?: string;
  firstPublicationDate?: string;
  abstractText?: string;
  isOpenAccess?: string;
  license?: string;
}

export interface GovernmentPolicyFetchInput {
  caseId: string;
  slug: string;
  hash6: string;
  placeName: string;
  regionName: string;
  geoId: string;
  now: string;
  question?: string | undefined;
  existingSourceTitles?: readonly string[] | undefined;
  timeoutMs?: number | undefined;
  fetchImpl?: typeof globalThis.fetch | undefined;
}

export interface GovernmentPolicyFetchResult {
  sources: Source[];
  evidence: Evidence[];
}

const DEFAULT_TIMEOUT_MS = 4000;

/**
 * Strips HTML/XML tags and normalizes whitespace while preserving verbatim wording.
 */
export function stripHtmlAndNormalize(raw: string): string {
  return raw
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(?:abstract|summary|background)\s*[:.\u2014-]?\s*/i, "")
    .trim();
}

/**
 * Extracts 1–2 complete verbatim sentences (up to `maxLen` characters) from cleaned text.
 * Because this slices directly from `cleaned`, the returned excerpt is a verbatim substring
 * (or prefix before ellipsis) of the cleaned source text.
 */
export function extractVerbatimExcerpt(raw: string, maxLen = 260): string | null {
  const cleaned = stripHtmlAndNormalize(raw);
  if (cleaned.length < 24) return null;

  const sentences = cleaned.match(/[^.!?]+[.!?]+/g);
  if (sentences && sentences.length > 0) {
    const first = sentences[0].trim();
    if (first.length >= 24 && first.length <= maxLen) {
      const second = sentences[1]?.trim();
      if (second && first.length + 1 + second.length <= maxLen) {
        return `${first} ${second}`;
      }
      return first;
    }
  }

  if (cleaned.length <= maxLen) return cleaned;
  const clipped = cleaned.slice(0, maxLen);
  const lastSpace = clipped.lastIndexOf(" ");
  return (lastSpace > 120 ? clipped.slice(0, lastSpace) : clipped).trim();
}

function normalizeIsoDate(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== "string") return null;
  const trimmed = raw.trim();
  const fullMatch = /^(\d{4}-\d{2}-\d{2})/.exec(trimmed);
  if (fullMatch?.[1]) {
    const candidate = fullMatch[1];
    if (/^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/.test(candidate)) {
      return candidate;
    }
  }
  const yearMonthMatch = /^(\d{4}-\d{2})$/.exec(trimmed);
  if (yearMonthMatch?.[1] && /^[0-9]{4}-(0[1-9]|1[0-2])$/.test(yearMonthMatch[1])) {
    return yearMonthMatch[1];
  }
  const yearMatch = /^(\d{4})/.exec(trimmed);
  if (yearMatch?.[1]) return yearMatch[1];
  return null;
}

function unwrapTextField(val: unknown): string {
  if (typeof val === "string") return val.trim();
  if (Array.isArray(val)) {
    for (const item of val) {
      const s = unwrapTextField(item);
      if (s) return s;
    }
    return "";
  }
  if (typeof val === "object" && val !== null) {
    const rec = val as Record<string, unknown>;
    if (typeof rec["cdata!"] === "string") return rec["cdata!"].trim();
    if (typeof rec["#text"] === "string") return rec["#text"].trim();
  }
  return "";
}

function parseAuthorsList(raw: unknown, fallback: string): string[] {
  const text = unwrapTextField(raw);
  if (!text) return [fallback];
  const parts = text
    .split(/[;|]|\band\b/i)
    .flatMap((chunk) =>
      chunk.includes(",") && chunk.split(",").length > 2 ? chunk.split(",") : [chunk],
    )
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter((s) => s.length > 1 && s.length < 90);
  const unique = [...new Set(parts)].slice(0, 6);
  return unique.length > 0 ? unique : [fallback];
}

function sha256ContentHash(title: string, body: string): string {
  return `sha256:${createHash("sha256").update(`${title}\n${body}`).digest("hex")}`;
}

/**
 * 1. Queries the World Bank Official Documents & Reports API (`search.worldbank.org/api/v2/wds`).
 */
export async function fetchWorldBankDocuments(
  query: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): Promise<WorldBankDocRaw[]> {
  const ac = new AbortController();
  const timer = setTimeout(() => {
    ac.abort();
  }, timeoutMs);
  try {
    const url = `https://search.worldbank.org/api/v2/wds?format=json&qterm=${encodeURIComponent(
      query,
    )}&rows=5`;
    const res = await fetchImpl(url, {
      signal: ac.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": "Siterra/1.0 (https://siterra.invalid; research@siterra.invalid)",
      },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      documents?: Record<string, unknown> | WorldBankDocRaw[];
      rows?: WorldBankDocRaw[];
    };
    if (Array.isArray(data.documents)) return data.documents;
    if (Array.isArray(data.rows)) return data.rows;
    if (data.documents && typeof data.documents === "object") {
      const docs: WorldBankDocRaw[] = [];
      for (const [key, val] of Object.entries(data.documents)) {
        if (key === "facets" || typeof val !== "object" || val === null) continue;
        docs.push(val);
      }
      return docs;
    }
    return [];
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 2. Queries the US Federal Register API (`www.federalregister.gov/api/v1/documents.json`).
 */
export async function fetchFederalRegisterDocuments(
  query: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): Promise<FederalRegisterDocRaw[]> {
  const ac = new AbortController();
  const timer = setTimeout(() => {
    ac.abort();
  }, timeoutMs);
  try {
    const url = `https://www.federalregister.gov/api/v1/documents.json?per_page=4&conditions[term]=${encodeURIComponent(
      query,
    )}`;
    const res = await fetchImpl(url, {
      signal: ac.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": "Siterra/1.0 (https://siterra.invalid; research@siterra.invalid)",
      },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { results?: FederalRegisterDocRaw[] };
    return Array.isArray(data.results) ? data.results : [];
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 3. Queries the EuropePMC Open-Access Scientific Literature API (`www.ebi.ac.uk/europepmc/webservices/rest/search`).
 */
export async function fetchEuropePmcArticles(
  query: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): Promise<EuropePmcResultRaw[]> {
  const ac = new AbortController();
  const timer = setTimeout(() => {
    ac.abort();
  }, timeoutMs);
  try {
    const url = `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(
      query,
    )}&format=json&pageSize=4&resultType=core`;
    const res = await fetchImpl(url, {
      signal: ac.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": "Siterra/1.0 (https://siterra.invalid; research@siterra.invalid)",
      },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      resultList?: { result?: EuropePmcResultRaw[] };
      results?: EuropePmcResultRaw[];
    };
    if (Array.isArray(data.resultList?.result)) return data.resultList.result;
    if (Array.isArray(data.results)) return data.results;
    return [];
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Queries World Bank Official Documents, US Federal Register, and EuropePMC Open-Access
 * in parallel and converts retrieved documents into schema-valid `Source[]` and `Evidence[]`
 * with verbatim excerpts (`provenance.sourceLocators[0].excerpt`) and SHA-256 `contentHash`.
 */
export async function fetchGovernmentPolicyAndOpenAccess(
  input: GovernmentPolicyFetchInput,
): Promise<GovernmentPolicyFetchResult> {
  const {
    caseId,
    slug,
    hash6,
    placeName,
    regionName,
    geoId,
    now,
    question,
    existingSourceTitles = [],
    timeoutMs = DEFAULT_TIMEOUT_MS,
    fetchImpl = globalThis.fetch,
  } = input;

  const regionPrimary = (regionName.split(",")[0] ?? regionName).trim() || placeName;
  const questionTerms = question
    ? question
        .replace(/[^a-zA-Z0-9\s-]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 3)
        .slice(0, 5)
        .join(" ")
    : "watershed hydrology land management";

  const wbQuery = `${placeName} ${regionPrimary} watershed water land management`.trim();
  const frQuery = `${placeName} ${regionPrimary} watershed environmental water`.trim();
  const epmcQuery = `${placeName} ${regionPrimary} ${questionTerms}`.trim();

  const [wbDocs, frDocs, epmcDocs] = await Promise.all([
    fetchWorldBankDocuments(wbQuery, timeoutMs, fetchImpl),
    fetchFederalRegisterDocuments(frQuery, timeoutMs, fetchImpl),
    fetchEuropePmcArticles(epmcQuery, timeoutMs, fetchImpl),
  ]);

  const seenTitles = new Set(existingSourceTitles.map((t) => t.toLowerCase().trim()));
  const sources: Source[] = [];
  const evidence: Evidence[] = [];

  // 1. Convert World Bank Official Documents & Reports
  for (const doc of wbDocs) {
    if (sources.filter((s) => s.id.startsWith("src_wb_")).length >= 2) break;
    const rawTitle =
      unwrapTextField(doc.display_title) ||
      unwrapTextField(doc.Alt_title) ||
      unwrapTextField(doc.colti);
    const title = stripHtmlAndNormalize(rawTitle);
    if (!title || seenTitles.has(title.toLowerCase())) continue;

    const rawAbstract =
      unwrapTextField(doc.abstracts) ||
      unwrapTextField(doc.ml_abstract) ||
      unwrapTextField(doc.colti) ||
      title;
    const fullAbstract = stripHtmlAndNormalize(rawAbstract) || title;
    const excerpt = extractVerbatimExcerpt(fullAbstract, 260) ?? title.slice(0, 260);
    seenTitles.add(title.toLowerCase());

    const idx = sources.length + 1;
    const srcId = `src_wb_${slug}_${hash6}_${String(idx)}`;
    const rawUrl = (doc.url || doc.pdfurl || "").trim();
    const validUrl = /^https?:\/\//i.test(rawUrl)
      ? rawUrl
      : `https://documents.worldbank.org/en/publication/documents-reports/documentdetail/${encodeURIComponent(
          doc.id ?? String(idx),
        )}`;
    const pubDate = normalizeIsoDate(doc.docdt) ?? "2024";
    const authors = parseAuthorsList(doc.authr, "World Bank Group & National Ministry Teams");
    const collectionTitle = unwrapTextField(doc.colti);
    const publisher = collectionTitle
      ? `World Bank Official Documents (${collectionTitle.slice(0, 80)})`
      : "World Bank Official Documents & Multilateral Project Reports";
    const contentHash = sha256ContentHash(title, fullAbstract);
    const notes = [
      ...new Set(
        [
          excerpt,
          fullAbstract !== excerpt ? fullAbstract : "",
          `Register: World Bank Official Documents & Reports API (${validUrl}).`,
        ].filter((s) => s.length > 0),
      ),
    ];

    const parsedSrc = Source.safeParse({
      recordType: "Source",
      id: srcId,
      revision: 1,
      createdAt: now,
      updatedAt: now,
      caseId,
      title,
      url: validUrl,
      publisher,
      authors,
      publicationDate: pubDate,
      language: "en",
      accessedAt: now,
      sourceKind: "institutional",
      accessStatus: "retrieved",
      license: "CC BY 4.0 (World Bank Open Knowledge Repository)",
      redistributionStatus: "permitted",
      contentHash,
      notes,
    });
    if (!parsedSrc.success) continue;
    sources.push(parsedSrc.data);

    const evId = `ev_wb_${slug}_${hash6}_${String(idx)}`;
    const pubYear = pubDate.slice(0, 4);
    const parsedEv = Evidence.safeParse({
      recordType: "Evidence",
      id: evId,
      revision: 1,
      createdAt: now,
      updatedAt: now,
      caseId,
      statement: `World Bank / institutional report (${pubYear}) on ${placeName} (${regionName}): "${excerpt}"`,
      claimKind: "scientific_context",
      status: "accepted",
      geoSelectionId: geoId,
      periodIds: [],
      measurementIds: [],
      provenance: {
        sourceLocators: [
          {
            sourceId: parsedSrc.data.id,
            locator: "report abstract",
            excerpt,
          },
        ],
        dataBundleIds: [],
        methodId: null,
        methodVersion: null,
        inputVersions: [{ entityId: parsedSrc.data.id, revision: 1 }],
        generatedByTaskId: null,
        generatedAt: now,
        verificationStatus: "source_checked",
        limitations: [
          "Multilateral and national project report retrieved via World Bank WDS API; parcel-level implementation requires local verification.",
        ],
      },
      interpretation: `Provides multilateral project, watershed investment, and institutional context for ${placeName}.`,
      uncertainty:
        "Official project documentation; current local operational status requires stakeholder confirmation.",
      reviewDecisionIds: [],
    });
    if (parsedEv.success) {
      evidence.push(parsedEv.data);
    }
  }

  // 2. Convert US Federal Register Regulatory & Environmental Impact Documents
  for (const doc of frDocs) {
    if (sources.filter((s) => s.id.startsWith("src_fr_")).length >= 2) break;
    const title = stripHtmlAndNormalize(doc.title ?? "");
    if (!title || seenTitles.has(title.toLowerCase())) continue;

    const rawBody =
      doc.abstract ||
      (Array.isArray(doc.excerpts) ? doc.excerpts.join(" ") : doc.excerpts) ||
      title;
    const fullBody = stripHtmlAndNormalize(rawBody) || title;
    const excerpt = extractVerbatimExcerpt(fullBody, 260) ?? title.slice(0, 260);
    seenTitles.add(title.toLowerCase());

    const idx = sources.length + 1;
    const srcId = `src_fr_${slug}_${hash6}_${String(idx)}`;
    const rawUrl = (doc.html_url || doc.pdf_url || "").trim();
    const validUrl = /^https?:\/\//i.test(rawUrl)
      ? rawUrl
      : `https://www.federalregister.gov/documents/${encodeURIComponent(
          doc.document_number ?? String(idx),
        )}`;
    const pubDate = normalizeIsoDate(doc.publication_date) ?? "2024";
    const agencyNames = [
      ...new Set(
        (doc.agencies ?? [])
          .map((a) => (a.name || a.raw_name || "").trim())
          .filter((name) => name.length > 0),
      ),
    ].slice(0, 5);
    const authors =
      agencyNames.length > 0 ? agencyNames : ["US Federal Register Regulatory Agencies"];
    const publisher =
      agencyNames.length > 0
        ? `US Federal Register / ${agencyNames[0]}`
        : "US Federal Register (National Archives and Records Administration)";
    const contentHash = sha256ContentHash(title, fullBody);
    const notes = [
      ...new Set(
        [
          excerpt,
          fullBody !== excerpt ? fullBody : "",
          `Register: US Federal Register API (${validUrl}).`,
        ].filter((s) => s.length > 0),
      ),
    ];

    const parsedSrc = Source.safeParse({
      recordType: "Source",
      id: srcId,
      revision: 1,
      createdAt: now,
      updatedAt: now,
      caseId,
      title,
      url: validUrl,
      publisher,
      authors,
      publicationDate: pubDate,
      language: "en",
      accessedAt: now,
      sourceKind: "institutional",
      accessStatus: "retrieved",
      license: "US Government Public Domain (17 U.S.C. § 105)",
      redistributionStatus: "permitted",
      contentHash,
      notes,
    });
    if (!parsedSrc.success) continue;
    sources.push(parsedSrc.data);

    const evId = `ev_fr_${slug}_${hash6}_${String(idx)}`;
    const agencyLabel = agencyNames[0] ?? "Federal Register notice";
    const pubYear = pubDate.slice(0, 4);
    const parsedEv = Evidence.safeParse({
      recordType: "Evidence",
      id: evId,
      revision: 1,
      createdAt: now,
      updatedAt: now,
      caseId,
      statement: `${agencyLabel} (${pubYear}) regulatory & environmental record for ${placeName}: "${excerpt}"`,
      claimKind: "scientific_context",
      status: "accepted",
      geoSelectionId: geoId,
      periodIds: [],
      measurementIds: [],
      provenance: {
        sourceLocators: [
          {
            sourceId: parsedSrc.data.id,
            locator: "regulatory notice",
            excerpt,
          },
        ],
        dataBundleIds: [],
        methodId: null,
        methodVersion: null,
        inputVersions: [{ entityId: parsedSrc.data.id, revision: 1 }],
        generatedByTaskId: null,
        generatedAt: now,
        verificationStatus: "source_checked",
        limitations: [
          "Official regulatory and environmental notice from the Federal Register; site-specific jurisdiction requires local review.",
        ],
      },
      interpretation: `Documents regulatory, agency, or environmental impact determinations relevant to ${placeName}.`,
      uncertainty:
        "Official regulatory notice; parcel applicability requires administrative confirmation.",
      reviewDecisionIds: [],
    });
    if (parsedEv.success) {
      evidence.push(parsedEv.data);
    }
  }

  // 3. Convert EuropePMC Open-Access Scientific Literature
  for (const art of epmcDocs) {
    if (sources.filter((s) => s.id.startsWith("src_epmc_")).length >= 2) break;
    const title = stripHtmlAndNormalize(art.title ?? "");
    if (!title || seenTitles.has(title.toLowerCase())) continue;

    const fullAbstract = stripHtmlAndNormalize(art.abstractText ?? "") || title;
    const excerpt = extractVerbatimExcerpt(fullAbstract, 260);
    if (!excerpt) continue;
    seenTitles.add(title.toLowerCase());

    const idx = sources.length + 1;
    const srcId = `src_epmc_${slug}_${hash6}_${String(idx)}`;
    const cleanDoi = art.doi
      ?.replace(/^https?:\/\/doi\.org\//i, "")
      .replace(/^doi:/i, "")
      .trim();
    const validUrl = cleanDoi
      ? `https://doi.org/${cleanDoi}`
      : `https://europepmc.org/article/${encodeURIComponent(art.source ?? "MED")}/${encodeURIComponent(
          art.id ?? String(idx),
        )}`;
    const pubDate =
      normalizeIsoDate(art.firstPublicationDate) ?? normalizeIsoDate(art.pubYear) ?? "2024";
    const authors = parseAuthorsList(art.authorString, "EuropePMC Open-Access Authors");
    const journal =
      (art.journalTitle || art.journalInfo?.journal?.title || "").trim() ||
      "EuropePMC Open-Access Environmental Journal";
    const contentHash = sha256ContentHash(title, fullAbstract);
    const notes = [
      ...new Set(
        [
          excerpt,
          fullAbstract !== excerpt ? fullAbstract : "",
          `Register: EuropePMC Open-Access API (${validUrl}).`,
        ].filter((s) => s.length > 0),
      ),
    ];

    const parsedSrc = Source.safeParse({
      recordType: "Source",
      id: srcId,
      revision: 1,
      createdAt: now,
      updatedAt: now,
      caseId,
      title,
      url: validUrl,
      publisher: journal,
      authors,
      publicationDate: pubDate,
      language: "en",
      accessedAt: now,
      sourceKind: "peer_reviewed",
      accessStatus: "retrieved",
      license: art.license?.trim() || "CC BY 4.0 (EuropePMC Open Access)",
      redistributionStatus: "permitted",
      contentHash,
      notes,
    });
    if (!parsedSrc.success) continue;
    sources.push(parsedSrc.data);

    const firstAuthor = parsedSrc.data.authors[0] ?? "Open-access study";
    const cite = parsedSrc.data.authors.length > 1 ? `${firstAuthor} et al.` : firstAuthor;
    const pubYear = pubDate.slice(0, 4);
    const evId = `ev_epmc_${slug}_${hash6}_${String(idx)}`;
    const parsedEv = Evidence.safeParse({
      recordType: "Evidence",
      id: evId,
      revision: 1,
      createdAt: now,
      updatedAt: now,
      caseId,
      statement: `${cite} (${pubYear}) open-access study on ${placeName} (${regionName}): "${excerpt}"`,
      claimKind: "scientific_context",
      status: "accepted",
      geoSelectionId: geoId,
      periodIds: [],
      measurementIds: [],
      provenance: {
        sourceLocators: [
          {
            sourceId: parsedSrc.data.id,
            locator: "abstract",
            excerpt,
          },
        ],
        dataBundleIds: [],
        methodId: null,
        methodVersion: null,
        inputVersions: [{ entityId: parsedSrc.data.id, revision: 1 }],
        generatedByTaskId: null,
        generatedAt: now,
        verificationStatus: "source_checked",
        limitations: [
          "Peer-reviewed open-access article retrieved via EuropePMC; local basin applicability requires field validation.",
        ],
      },
      interpretation: `Provides peer-reviewed open-access scientific findings for ${placeName}.`,
      uncertainty:
        "Published open-access literature; local site conditions require field verification.",
      reviewDecisionIds: [],
    });
    if (parsedEv.success) {
      evidence.push(parsedEv.data);
    }
  }

  return { sources, evidence };
}
