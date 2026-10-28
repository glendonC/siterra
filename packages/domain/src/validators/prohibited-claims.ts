// Phrase scan for the claims prohibited in docs/explanation/scientific-basis.md#claims-prohibited-in-the-demo
// and the forecasting policy in docs/reference/analysis-recipes.md#forecasting-policy. A phrase scan
// catches wording, not meaning; review remains the authority. Held here until packages/domain takes it.

export const PROHIBITED_SCAN_VERSION = "prohibited-claims@1";

export interface ProhibitedRule {
  id: string;
  pattern: RegExp;
  reason: string;
}

export const PROHIBITED_RULES: readonly ProhibitedRule[] = [
  {
    id: "diagnosis",
    pattern:
      /\bovergraz(?:ing|ed)\b[^.]{0,40}\b(?:detected|confirmed|identified|proven|shown)\b|\bdegraded by (?:livestock|grazing|herds?)\b/i,
    reason: "diagnoses overgrazing or degradation",
  },
  {
    id: "causal",
    pattern:
      /\b(?:caused by|because of|due to|driven by|attributable to|as a result of|led to|leads to|results? from)\b/i,
    reason: "attributes a cause",
  },
  {
    id: "biomass",
    pattern: /\b(?:biomass|carrying capacity|animal units?|stocking rates?|biodiversity)\b/i,
    reason: "states biomass, carrying capacity or biodiversity",
  },
  {
    id: "significance",
    pattern:
      /\b(?:statistically significant|significant(?:ly)? (?:trend|decline|declined|increase|increased|change|changed|difference))\b/i,
    reason: "claims statistical significance",
  },
  {
    id: "forecast",
    pattern:
      /\b(?:forecast(?:s|ed|ing)?|projected|projections?|outlook)\b|\bwill (?:decline|increase|recover|degrade|improve|drop|rise|fall)\b/i,
    reason: "forecasts or projects",
  },
  {
    id: "consent",
    pattern: /\b(?:consent(?:ed)?|community approv(?:al|ed)|approved closure|verified rights?)\b/i,
    reason: "claims consent, approval or rights",
  },
  {
    id: "outcome",
    pattern:
      /\b(?:restoration (?:success|succeeded|worked)|measured (?:community )?benefits?|proven benefits?)\b/i,
    reason: "claims an outcome",
  },
];

export interface ProhibitedHit {
  ruleId: string;
  phrase: string;
  reason: string;
}

export function prohibitedHits(text: string): ProhibitedHit[] {
  const hits: ProhibitedHit[] = [];
  for (const rule of PROHIBITED_RULES) {
    const m = rule.pattern.exec(text);
    if (m) hits.push({ ruleId: rule.id, phrase: m[0], reason: rule.reason });
  }
  return hits;
}
