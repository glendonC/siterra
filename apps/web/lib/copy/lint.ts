// The copy lint from the voice and tone guide (docs/reference/voice-and-tone.md, "Lint rules"). The rule
// table and patterns are copied from the guide; the guide is the source, so a change starts there.
// VT-09, VT-44 to VT-49 carry the precise standard of the proposed ADR-0043 amendment.
// Design language rule DL-09 is added below the guide's rules until the guide carries it.

/** "heading" is a header, tab, badge, status word or stage name: Title Case, 1 to 3 words a segment. */
export type Scope = "ui" | "label" | "heading" | "button" | "link" | "model" | "docs";
export type Severity = "error" | "warn";

export interface Rule {
  id: string;
  sev: Severity;
  scope: readonly Scope[];
  /** Scopes the rule skips even when it would apply through "ui". */
  except?: readonly Scope[];
  modelSev?: Severity;
  uiSev?: Severity;
  re: RegExp;
  fix: string;
}

export interface Finding {
  id: string;
  sev: Severity;
  hits: string[];
}

export const RULES: readonly Rule[] = [
  // A. Typography
  {
    id: "VT-01",
    sev: "error",
    scope: ["ui", "model", "docs"],
    re: /\u2014/g,
    fix: "No em dash. Split the sentence, or use a colon, comma or parentheses.",
  },
  {
    id: "VT-02",
    sev: "error",
    scope: ["ui", "model"],
    re: /[\u2012\u2013\u2015]/g,
    fix: "No en dash. Use 'to' for ranges, a hyphen for compound words.",
  },
  {
    id: "VT-03",
    sev: "warn",
    scope: ["ui", "model"],
    re: /\b(?:19|20)\d{2}\s?-\s?(?:19|20)\d{2}\b|\b\d+(?:\.\d+)?\s?-\s?\d+(?:\.\d+)?\s?(?:%|km²|km|mm|m|months?|years?)(?=\W|$)/g,
    fix: "Write ranges with 'to': '2019 to 2025', '0 to 3 months'.",
  },
  {
    id: "VT-04",
    sev: "warn",
    scope: ["ui"],
    except: ["heading"],
    re: /\s\u00B7\s/g,
    fix: "No middle-dot separators. Use labeled fields or separate elements.",
  },
  {
    id: "VT-05",
    sev: "warn",
    scope: ["ui", "model"],
    re: /\u2026|\.{3}/g,
    fix: "No ellipsis in status text. Truncation is done by CSS.",
  },
  { id: "VT-06", sev: "error", scope: ["ui", "model"], re: /!/g, fix: "No exclamation marks." },
  {
    id: "VT-07",
    sev: "error",
    scope: ["ui", "model"],
    re: /(?![\u00A9\u00AE\u2122])\p{Extended_Pictographic}/gu,
    fix: "No emoji or pictographs. Use the icon set with a text label.",
  },
  {
    id: "VT-08",
    sev: "warn",
    scope: ["ui"],
    re: /\b(?!(?:NDVI|CHIRPS|DEM|GLO|ESA|OSM|HCP|SCI|GPS|UCSB|URL|API|PDF|CSV|JSON|SSE|UTC|ISO|WCAG|GIS|CRS|COG|STAC|USGS|EROS|NOAA|NASA|SRTM|GMTED|ETOPO|IRCAM)\b)[A-Z]{3,}\b/g,
    fix: "No all caps. Use sentence case: 'Live', not 'LIVE'.",
  },
  {
    id: "VT-09",
    sev: "error",
    scope: ["heading", "button", "link"],
    re: /(?<![\p{L}\p{N}{'\u2019-])(?!(?:a|an|and|as|at|by|for|from|in|into|of|on|or|per|the|to|vs|with)(?![\p{L}\p{N}]))\p{Ll}[\p{L}\p{N}'\u2019-]*/gu,
    fix: "Title Case for controls, headers and badges: 'Run Assessment', 'Field Unverified'.",
  },

  // B. Words and phrases
  {
    id: "VT-10",
    sev: "error",
    scope: ["ui"],
    modelSev: "warn",
    re: /\b(?:delv(?:e|es|ed|ing)|tapestr(?:y|ies)|testaments?|underscor(?:e|es|ed|ing)|showcas(?:e|es|ed|ing)|pivotal|intricac(?:y|ies)|intricate(?:ly)?|meticulous(?:ly)?|commendabl[ey]|noteworthy|invaluable|groundbreaking|realms?|boast(?:s|ed|ing)?|garner(?:s|ed|ing)?|vibrant|camaraderie|palpable|amidst|nestled|renowned|insights?)\b/gi,
    fix: "Word overused in LLM text. Use the plain word from the replacement table.",
  },
  {
    id: "VT-11",
    sev: "error",
    scope: ["ui"],
    modelSev: "warn",
    re: /\b(?:leverag(?:e|es|ed|ing)|utili[sz](?:e|es|ed|ing|ation)|robust(?:ly|ness)?|seamless(?:ly)?|empower(?:s|ed|ing|ment)?|unlock(?:s|ed|ing)?|harness(?:es|ed|ing)?|holistic(?:ally)?|synerg(?:y|ies|istic)|cutting[- ]edge|state[- ]of[- ]the[- ]art|next[- ]gen(?:eration)?|game[- ]?chang(?:er|ers|ing)|revolutioni[sz](?:e|es|ed|ing)|revolutionary|transformative|streamlin(?:e|es|ed|ing)|facilitat(?:e|es|ed|ing)|supercharg(?:e|es|ed|ing)|world[- ]class|best[- ]in[- ]class|AI[- ]powered|powered by AI)\b/gi,
    fix: "Corporate or marketing word. Say what Siterra does: 'use', 'checked', 'lets you'.",
  },
  {
    id: "VT-12",
    sev: "error",
    scope: ["ui", "model"],
    re: /\b(?:it(?:['\u2019]s| is) (?:important|worth|crucial|essential) to (?:note|remember|highlight|mention)|it(?:['\u2019]s| is) worth noting|in today['\u2019]s (?:fast[- ]paced|ever[- ]changing|digital|modern) (?:world|age|landscape)|navigat(?:e|es|ed|ing) the (?:complexit(?:y|ies)|landscape|intricacies|challenges)|(?:a|the) testament to|plays? an? (?:crucial|vital|pivotal|key|significant|important|central) role|in the heart of|setting the stage for|indelible mark|deeply rooted|(?:let['\u2019]s|let us) (?:dive|delve)|deep[- ]dive|dive (?:in|into)|I hope this helps|great question|as an AI|in conclusion|at the end of the day|rich (?:tapestry|heritage))\b/gi,
    fix: "Stock phrase. Delete it and state the fact.",
  },
  {
    id: "VT-13",
    sev: "warn",
    scope: ["ui", "model"],
    re: /\bnot (?:only|just|merely)\b[^.?!]{0,80}?\bbut\b|\b(?:it|this)(?:['\u2019]s| is) not\b[^.?!]{0,60}?[,;:]\s*(?:it|this)(?:['\u2019]s| is)\b/gi,
    fix: "Negative parallelism ('not only X but Y', 'it is not X, it is Y'). State the point directly.",
  },
  {
    id: "VT-14",
    sev: "error",
    scope: ["ui", "model"],
    re: /\b(?:[Ww]e(?:['\u2019](?:re|ve|ll|d))?|[Oo]urs?|us)\b|\b(?:[Oo]ur|[Tt]he) (?:team|analysts?|experts?|scientists?|consultants?|staff)\b|\b(?:[Aa]nalysts?|[Cc]onsultants?|[Ee]xperts?) (?:found|reviewed|checked|recommend(?:s|ed)?|believe)\b/g,
    fix: "The actor is Siterra. No 'we', 'our team' or staff.",
  },
  {
    id: "VT-15",
    sev: "warn",
    scope: ["ui", "model"],
    re: /\b(?:Siterra|the AI|the model|the system|the agent)\s+(?:thinks|believes|feels|knows|understands|wants|hopes|is (?:thinking|confident|sure|certain|excited|happy|sorry|worried|reasoning))\b|^(?:Thinking|Reasoning|Pondering)\b/gim,
    fix: "Describe actions, not mental states: 'Siterra compared', 'Siterra could not assess'.",
  },
  {
    id: "VT-16",
    sev: "warn",
    scope: ["ui", "model"],
    re: /\b(?:simply|easily|obviously|clearly|basically|essentially|actually|really|very|quite|somewhat|arguably|relatively|to some extent|it (?:seems|appears)(?: that)?|may potentially|could possibly|might possibly)\b|\bjust\b(?! now)/gi,
    fix: "Filler or stacked hedge. Delete it, or name the actual limit.",
  },
  {
    id: "VT-17",
    sev: "warn",
    scope: ["ui"],
    re: /\b(?:oops|uh[- ]oh|whoops|sorry|please|something went wrong|(?:an )?(?:unknown|unexpected) error|error (?:has )?occurred|invalid)\b/gi,
    fix: "Vague or apologetic error. Say what happened, what is kept, and what to do.",
  },
  {
    id: "VT-18",
    sev: "warn",
    scope: ["ui", "model"],
    re: /(?:^|[\s(])(?:e\.g\.|i\.e\.|etc\.)|\bvia\b|\bvs\.?(?=\s)/gi,
    fix: "Use 'for example', 'that is', 'through', 'compared with'.",
  },
  {
    id: "VT-19",
    sev: "warn",
    scope: ["ui", "model"],
    re: /\bsurfac(?:es|ed|ing)\b|\breal[- ]time\b/gi,
    fix: "Use 'lists' or 'shows' (not 'surfaces'); observations are precomputed, not real time.",
  },
  {
    id: "VT-49",
    sev: "warn",
    scope: ["ui", "model"],
    except: ["heading", "button", "link"],
    re: /\s&\s/g,
    fix: "Use 'and' in sentences. '&' is for Title Case names only: 'Scope & Baseline'.",
  },

  // C. Honesty
  {
    id: "VT-20",
    sev: "error",
    scope: ["ui", "model"],
    re: /\b(?:overgraz(?:ed|ing)|degrad(?:ed|ation|ing)|damag(?:e|ed|ing)|crisis|carrying capacity|animal units?|biomass|restor(?:ed|ation) (?:success|achieved|works)|(?:communit(?:y|ies)|households?|herders?) (?:agreed|approved|consented|support(?:s|ed)?)|consent (?:obtained|given|granted|secured)|approved by (?:the )?(?:community|communities|authorit(?:y|ies))|prov(?:es|ed|en)|confirm(?:s|ed)? (?:that )?(?:grazing|overgrazing|drought|degradation)|caused by|due to (?:grazing|overgrazing|livestock|herding|drought))\b/gi,
    fix: "Prohibited claim. Allowed only in the 'not claimed' panel strings (allowlist by string ID).",
  },
  {
    id: "VT-21",
    sev: "error",
    scope: ["model"],
    uiSev: "warn",
    re: /\b(?:likely|unlikely|likelihood|probabl(?:e|y)|probability|almost certain(?:ly)?|virtually certain|(?:high|low|medium|moderate)(?:ly)? confiden(?:t|ce)|confidence (?:level|score|interval)|\d{1,3}\s?% (?:chance|likely|probability|confidence|confident|certain(?:ty)?)|scor(?:e|es|ed|ing)|rank(?:s|ed|ing)?|best option|top option|winner)\b/gi,
    fix: "No probabilities, confidence or ranking. Use a status word plus what supports, contradicts and is missing.",
  },
  {
    id: "VT-22",
    sev: "error",
    scope: ["ui", "model"],
    re: /\b(?:vegetation|pasture|rangeland|land|ecosystem) health\b/gi,
    fix: "NDVI is not health. Say 'vegetation index (NDVI)'.",
  },
  {
    id: "VT-23",
    sev: "warn",
    scope: ["model"],
    re: /\brecommend(?:s|ed|ation|ations)?\b|\bthe best (?:option|response|choice)\b|\bshould adopt\b/gi,
    fix: "Siterra does not recommend responses in P0. Say 'candidate response'.",
  },
  {
    id: "VT-24",
    sev: "warn",
    scope: ["model"],
    re: /\bdrought\b|\breveal(?:s|ed|ing)?\b|\bdemonstrat(?:es|ed|ing) that\b|\bsignifican(?:t|tly|ce)\b|\btrends?\b|\b(?:verified|confirmed)\b/gi,
    fix: "Check the claim: 'below-average rainfall' unless a drought index was computed; no 'significant' without a named test; no 'trend' without a trend analysis; 'verified' only for verified outcomes.",
  },
  {
    id: "VT-25",
    sev: "warn",
    scope: ["model"],
    re: /\*\*[^*\n]+\*\*|__[^_\n]+__|^#{1,6}\s/gm,
    fix: "No markdown in model text. The renderer formats records.",
  },

  // D. Numbers, units, dates
  {
    id: "VT-30",
    sev: "warn",
    scope: ["ui", "model"],
    re: /\b\d+(?:[.,]\d+)?(?:km²|km2|km|mm|m|ha|min)\b/g,
    fix: "Space between number and unit: '5 km', '3,690 m'.",
  },
  {
    id: "VT-31",
    sev: "warn",
    scope: ["ui", "model"],
    re: /\d\s+%|\b\d+\s?per ?cent\b/gi,
    fix: "Percent: '82%', no space, symbol not word.",
  },
  {
    id: "VT-32",
    sev: "error",
    scope: ["ui", "model"],
    re: /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g,
    fix: "No numeric dates. Write '26 Oct 2026' or 'Apr 2022'.",
  },
  {
    id: "VT-33",
    sev: "warn",
    scope: ["ui", "model"],
    re: /\b\d{1,2}(?:st|nd|rd|th)\b/gi,
    fix: "No ordinal days: '2 June', not '2nd June'.",
  },
  {
    id: "VT-34",
    sev: "warn",
    scope: ["ui", "model"],
    re: /\b(?:two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(?:sources?|months?|years?|tasks?|explanations?|hypothes[ie]s|cells?|items?|unknowns?|villages?|municipalities|strata|options?|responses?|records?|revisions?|reviews?|roles?)\b/gi,
    fix: "Use numerals for counts: '3 municipalities'.",
  },
  {
    id: "VT-35",
    sev: "error",
    scope: ["ui", "model"],
    re: /[-+\u2212]?\d+(?:\.\d+)?\s?%\s*(?:of )?NDVI\b|\bNDVI\s+(?:fell|dropped|rose|increased|decreased|declined|changed|was)\s+(?:by\s+)?[-+\u2212]?\d+(?:\.\d+)?\s?%/gi,
    fix: "No percent on NDVI. Give the index difference: 'NDVI 0.03 below the same-month median'.",
  },
  {
    id: "VT-36",
    sev: "warn",
    scope: ["ui"],
    re: /(?:^|[\s(])-(?=\d)/g,
    fix: "Use the minus sign (U+2212) for negative values in display text.",
  },
  {
    id: "VT-37",
    sev: "warn",
    scope: ["ui", "model"],
    re: /\b(?:millimetres?|centimetres?|metres?|kilometres?|labell(?:ed|ing)|behaviour|colour(?:s|ed)?|organis(?:e|ed|ation)|analys(?:e|ed|ing)|modell(?:ed|ing)|cancell(?:ed|ing)|programme|centre)\b/gi,
    fix: "US English: millimeters, labeled, canceled, program, center.",
  },

  {
    id: "VT-38",
    sev: "warn",
    scope: ["model"],
    re: /(?:^|[.?!]\s+)\d/gm,
    fix: "Do not start a sentence with a numeral. Start with the verb or a short phrase: 'In 23 of 84 months, ...'.",
  },

  // E. Actions and links
  {
    id: "VT-40",
    sev: "error",
    scope: ["button"],
    re: /^(?:OK|Okay|Yes|No|Submit|Approve(?: AI)?|Accept|Confirm|Proceed|Go|Defer|Run AI|Generate|Click here|Learn more|Let['\u2019]s go)$/i,
    fix: "Name the effect: verb plus object ('Defer decision', 'Record scientific review (demo)').",
  },
  {
    id: "VT-41",
    sev: "error",
    scope: ["button"],
    re: /^(?:Record scientific review|Mark program review complete|Record (?:community|program) review)(?!.*\(demo\))/i,
    fix: "In demo mode, review buttons end with '(demo)'.",
  },
  {
    id: "VT-42",
    sev: "warn",
    scope: ["link"],
    re: /^(?:click here|here|learn more|read more|more|link|this)$/i,
    fix: "Link text names the destination: 'Open source: Romagny et al. 2008'.",
  },
  {
    id: "VT-43",
    sev: "warn",
    scope: ["ui", "model"],
    re: /\b(?:can|don|won|isn|doesn|aren|wasn|weren|haven|hasn|hadn|didn|shouldn|wouldn|couldn|mustn)['\u2019]t\b/gi,
    fix: "No negative contractions: 'cannot', 'does not'.",
  },

  // G. The precise standard (ADR-0043 amendment, proposed)
  {
    id: "VT-44",
    sev: "error",
    scope: ["heading", "button", "link"],
    re: /[.;?!](?=\s|$)/g,
    fix: "A control, header or badge is a name, not a sentence: no full stop, semicolon or question mark.",
  },
  {
    id: "VT-45",
    sev: "error",
    scope: ["ui"],
    modelSev: "warn",
    re: /\b(?:[Yy]ou(?:r|rs|rself|['\u2019](?:re|ve|ll|d))?|I|[Mm]e|[Mm]y)\b/g,
    fix: "No 'you' and no first person. Name the thing: 'Question kept', not 'Your question is kept'.",
  },
  {
    id: "VT-46",
    sev: "error",
    scope: ["ui"],
    modelSev: "warn",
    re: /\b(?:telemetry|attribution|autonomous(?:ly)?|validated|verified(?! outcomes?\b))\b/gi,
    fix: "No sensors, so no 'telemetry'; no 'attribution' (ADR-0023); the engine analyzes and never acts autonomously; 'validated' and 'verified' only for what is (the 'Verified outcome' kind).",
  },
  {
    id: "VT-47",
    sev: "error",
    scope: ["ui"],
    re: /\b(?:appears? here|(?:shown|listed) here|as it happens|(?:will|would) (?:show|appear|list|display)|this (?:panel|section|page|card|view|list) (?:shows|lists|displays|contains))\b/gi,
    fix: "No meta-commentary about what a panel will show. Show it, or state the empty state as a fact.",
  },
];

/**
 * Design language 1.3 rule 9: Siterra's own text says "a dry year" or "below-average rainfall", never
 * "drought", because no drought index is computed. The viewer's own question is user text and is not linted.
 */
export const DESIGN_RULES: readonly Rule[] = [
  {
    id: "DL-09",
    sev: "error",
    scope: ["ui"],
    re: /\bdroughts?\b/gi,
    fix: "Say 'a dry year' or 'below-average rainfall'; no drought index is computed.",
  },
];

const ALL_RULES: readonly Rule[] = [...RULES, ...DESIGN_RULES];

// F. Structure checks (functions, not single regexes)
export function longSentences(text: string, max = 25): string[] {
  return text.split(/(?<=[.?!])\s+/).filter((s) => (s.match(/\S+/g) || []).length > max);
}

const CONTROL: readonly Scope[] = ["heading", "button", "link"];

/** Segments of a control, header or badge with more than `max` words; " · " separates segments. */
export function longControls(text: string, max = 3): string[] {
  return text
    .split(/\s\u00B7\s/)
    .filter((seg) => seg.split(/\s+/).filter((w) => /[\p{L}\p{N}{]/u.test(w)).length > max);
}

export function lint(text: string, kind: Scope): Finding[] {
  const out: Finding[] = [];
  for (const r of ALL_RULES) {
    if (r.except?.includes(kind)) continue;
    if (!r.scope.includes(kind)) {
      // a "ui" rule also applies to labels, headings, buttons and links
      if (!(["label", ...CONTROL].includes(kind) && r.scope.includes("ui"))) continue;
    }
    r.re.lastIndex = 0;
    const m = text.match(r.re);
    if (m)
      out.push({
        id: r.id,
        sev:
          kind === "model" && r.modelSev
            ? r.modelSev
            : kind !== "model" && r.uiSev
              ? r.uiSev
              : r.sev,
        hits: [...new Set(m.map((s) => s.trim()))],
      });
  }
  if (CONTROL.includes(kind)) {
    const wordy = longControls(text);
    if (wordy.length) out.push({ id: "VT-48", sev: "error", hits: wordy });
  } else if (kind !== "label") {
    const long = longSentences(text);
    if (long.length)
      out.push({
        id: "VT-50",
        sev: "warn",
        hits: long.map(
          (s) => `${s.slice(0, 40)} (${String((s.match(/\S+/g) ?? []).length)} words)`,
        ),
      });
  }
  return out;
}
