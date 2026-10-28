import { issue } from "./validation.ts";
import type { ValidationIssue } from "./validation.ts";

// Siterra's scope (SA-10, proposed): it investigates changes in land, water and vegetation and the
// land-use practices that could explain them. It does not take questions that treat people as the
// explanation because of who they are, and it does not investigate named private individuals.
// Herders, herding households, grazing practices, customary institutions and the words sources use
// ("tribe" included) stay in scope.
//
// These are phrase lists: they catch wording, not meaning. The planner prompt carries the same rule
// so that the model refuses what the lists miss; neither layer alone is enough.

/** The failure code of a plan or hypothesis task refused as out of scope. */
export const OUT_OF_SCOPE = "out_of_scope";

/** Host-written, never model-written; it repeats nothing from the command. */
export const OUT_OF_SCOPE_MESSAGE =
  "Out of scope: Siterra investigates changes in land, water and vegetation and the land-use practices that could explain them. It does not take questions that treat people as the explanation because of who they are, or investigate named private individuals. It can look at what the vegetation, rainfall and water records show for the selected area, and at grazing, herding, cropping and water-use practices and the institutions that govern them.";

export type ScopeRule = "identity" | "private_person";

const RULE_MESSAGES: Readonly<Record<ScopeRule, string>> = {
  identity:
    "Treats people as the explanation because of who they are (ethnicity, race, religion, nationality or migration status); Siterra looks at land-use practices and roles instead.",
  private_person:
    "Names or points to a private individual; Siterra does not investigate private individuals.",
};

/** Identity as an axis of analysis: refused wherever it appears. */
const IDENTITY_CATEGORY =
  /\b(?:ethnicit(?:y|ies)|ethnic|ethnies?|ethniques?|origine ethnique|races?|racial(?:ly)?|religions?|religious (?:affiliation|identity|groups?|background|minorit(?:y|ies))|nationalit(?:y|ies)|nationalites?|citizenship|(?:migration|immigration|asylum|residency) status|statut (?:migratoire|de sejour)|castes?)\b/;

/**
 * People named by who they are. Refused only with explanation or land-change wording in the same
 * text, so "What do Amazigh customary rules say about the agdal?" stays in scope. Adjectives that
 * also describe land ("North African rangelands") are left out on purpose.
 */
const IDENTITY_GROUP =
  /\b(?:(?:im|e)?migrants?|immigres?|emigres?|refugees?|refugies?|asylum seekers?|demandeurs d'asile|foreigners?|etrangers?|sans-papiers|undocumented|illegals|illegal aliens?|berbers?|berberes?|amazighs?|imazighen|arabs?|arabes?|sahrawis?|sahraouis?|jews|jewish|juifs?|juives?|muslims|musulmans?|musulmanes|christians|chretiens?|chretiennes|roma|gypsy|gypsies|gitans?|tsiganes?|black people|white people)\b/;

const EXPLANATION =
  /\b(?:caus\w*|because|due to|blam\w*|fault\w*|faute|responsib\w*|explain\w*|expliqu\w*|behind|driv(?:e|es|en|er|ers|ing)|destr\w*|detrui\w*|ruin\w*|degrad\w*|declin\w*|damag\w*|over-?graz\w*|surpatur\w*|eroded|erosion|desertif\w*|loss|lost|pertes?|pressure|pression|problem\w*|probleme\w*)\b/;

/** Honorifics before a capitalised name (case-sensitive). Sidi and Lalla start place names, so they are left out. */
const HONORIFIC =
  /\b(?:Mr|Mrs|Ms|Mx|Mme|Mlle|Monsieur|Madame|Mademoiselle|Haj|Hajj|Hadj)\.?\s+[A-Z][a-z]|\bM\.\s+[A-Z][a-z]/;

/** A person noun followed by "named" or "called" and a word; the word must be capitalised. */
const CALLED =
  /\b(?:man|woman|person|guy|neighbou?r|herder|shepherd|farmer|owner|landowner|resident|family|household|homme|femme|personne|voisine?|berger|eleveur|agriculteur|proprietaire|famille)s?\s+(?:named|called|nommee?s?|appelee?s?|du nom de)\s+(\S)/gi;

/** The asker's own neighbours: a specific private person even unnamed. */
const NEIGHBOUR = /\b(?:my|our)\s+neighbou?rs?\b|\b(?:mon|ma|mes|notre|nos)\s+voisin(?:e|es|s)?\b/i;

/** "the Ouhmad family"; botanical and zoological family names are not people. */
const FAMILY =
  /\b[Tt]he\s+([A-Z][a-z]+)\s+(?:family|household|clan)\b|\b(?:la|chez la)\s+famille\s+[A-Z]/g;
const TAXON = /(?:aceae|idae|inae)$/;

function plain(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").replaceAll("\u2019", "'");
}

function namesPrivatePerson(text: string): boolean {
  if (HONORIFIC.test(text) || NEIGHBOUR.test(text)) return true;
  for (const m of text.matchAll(CALLED)) {
    const first = m[1] ?? "";
    if (first !== first.toLowerCase()) return true;
  }
  for (const m of text.matchAll(FAMILY)) {
    if (!TAXON.test(m[1] ?? "")) return true;
  }
  return false;
}

/** The scope rule a text breaks, or null. */
export function outOfScope(text: string): ScopeRule | null {
  const cased = plain(text);
  if (namesPrivatePerson(cased)) return "private_person";
  const lower = cased.toLowerCase();
  if (IDENTITY_CATEGORY.test(lower)) return "identity";
  if (IDENTITY_GROUP.test(lower) && EXPLANATION.test(lower)) return "identity";
  return null;
}

/** One issue per out-of-scope field; the message names the rule, never the words that matched. */
export function scopeIssues(fields: readonly (readonly [string, string])[]): ValidationIssue[] {
  return fields.flatMap(([path, text]) => {
    const rule = outOfScope(text);
    return rule ? [issue("prohibited_claim", path, RULE_MESSAGES[rule])] : [];
  });
}
