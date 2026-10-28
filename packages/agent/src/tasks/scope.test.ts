import { describe, expect, it } from "vitest";

import { OUT_OF_SCOPE_MESSAGE, outOfScope, scopeIssues } from "./scope.ts";

// The host-side scope check (SA-10, proposed). A phrase list catches wording, not meaning: these
// tables show what it catches and what stays in scope, not that every out-of-scope question is caught.

describe("scope check", () => {
  it("refuses a question that treats people as the explanation because of who they are", () => {
    for (const text of [
      "Are the migrants who moved into the valley causing the pasture degradation?",
      "Is the vegetation loss because of the Arabs who settled near Tabant?",
      "Do Berber herders explain the decline in greenness?",
      "Have refugees overgrazed the high pastures?",
      "Les migrants sont-ils responsables de la dégradation des pâturages ?",
      "Compare NDVI change by the ethnicity of the landholders.",
      "Which religion do the households that graze the agdal follow?",
      "Break down pasture use by nationality and migration status.",
    ]) {
      expect(outOfScope(text), text).toBe("identity");
    }
  });

  it("refuses a question about a named or pointed-out private individual", () => {
    for (const text of [
      "Is Mr Ouhmad overgrazing the agdal above Tabant?",
      "Check whether the herder named Ahmed keeps too many goats.",
      "Is my neighbour letting his sheep into the closed pasture?",
      "Did the Ouhmad family cut the juniper on the slope?",
      "Est-ce que M. Ouhmad fait paître ses chèvres dans l'agdal ?",
      "Est-ce que mon voisin coupe le genévrier ?",
    ]) {
      expect(outOfScope(text), text).toBe("private_person");
    }
  });

  it("keeps land-use practices, roles, customary institutions and the words sources use in scope", () => {
    for (const text of [
      "What about the households that rely on these pastures?",
      "Is grazing pressure behind the vegetation decline in the catchment?",
      "Did herders move their flocks earlier in the dry spring of 2022?",
      "How do herding households share the high pastures during the agdal closure?",
      "Do tribal agdal rules govern when herders may graze the high pastures?",
      "What do customary institutions in Ait Bouguemez say about closing pastures?",
      "What do Amazigh customary rules say about the agdal?",
      "How do Amazigh customary rules respond to pasture decline and grazing pressure?",
      "Do Berber agdal institutions restrict access when vegetation loss is observed?",
      "Is illegal grazing in the forest reserve behind the decline?",
      "Did transhumant herders from outside the valley use the pastures in 2022?",
      "Which grasses of the Poaceae family declined after the drought?",
      "Who sets pasture rules?",
      "Les éleveurs ont-ils avancé la transhumance en 2022 ?",
    ]) {
      expect(outOfScope(text), text).toBeNull();
    }
  });

  it("names the rule at each path without repeating the words that matched", () => {
    const issues = scopeIssues([
      ["$.interpretation", "The command asks whether pasture rules changed."],
      ["$.tasks[0].question", "Is Mr Ouhmad overgrazing the agdal?"],
      ["$.tasks[1].question", "Do migrants explain the decline?"],
    ]);
    expect(issues.map((i) => `${i.code} ${i.path}`)).toEqual([
      "prohibited_claim $.tasks[0].question",
      "prohibited_claim $.tasks[1].question",
    ]);
    for (const i of issues) {
      expect(i.message).not.toMatch(/Ouhmad|migrants/);
    }
  });

  it("the refusal message is host-written and says what Siterra can look at instead", () => {
    expect(OUT_OF_SCOPE_MESSAGE).toMatch(/land, water and vegetation/);
    expect(OUT_OF_SCOPE_MESSAGE).toMatch(/grazing, herding/);
    expect(OUT_OF_SCOPE_MESSAGE).not.toMatch(/\u2014/);
    expect(OUT_OF_SCOPE_MESSAGE).not.toMatch(/\b(?:I|we|our|us|you|your)\b/i);
    expect(OUT_OF_SCOPE_MESSAGE).not.toMatch(/\b(?:attribution|telemetry|autonomous|validated)\b/i);
  });
});
