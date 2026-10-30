import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import type { DataBundle, Measurement } from "@siterra/contracts";
import { afterAll, describe, expect, it } from "vitest";

import { loadExtractionGold, loadNumericGold } from "./gold.ts";
import type { ExtractionItem, NumericItem } from "./gold.ts";
import { bars, markdown } from "./report.ts";
import type { EvalHeader } from "./report.ts";
import { extractionSuite, numericSuite, provenanceSuite } from "./suites.ts";

const sha = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const repoDir = fileURLToPath(new URL("../../../", import.meta.url));

const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

const PAGE = "The valley\nlies between  1800 and 2200 m. Villages stretch along it.";
function corpus(): string {
  const dir = mkdtempSync(join(tmpdir(), "siterra-eval-"));
  dirs.push(dir);
  mkdirSync(join(dir, "SCI-99"));
  writeFileSync(
    join(dir, "SCI-99", "paper.pdf.text.json"),
    JSON.stringify({
      kind: "pdf",
      pages: [
        { page: 1, text: "Other page." },
        { page: 2, text: PAGE },
      ],
    }),
  );
  const whole = "Intro. Hidden sentence here. End.";
  writeFileSync(
    join(dir, "SCI-99", "page.html.text.json"),
    JSON.stringify({ kind: "html", text: whole }),
  );
  return dir;
}

function item(overrides: Partial<ExtractionItem>): ExtractionItem {
  const excerpt = "lies between 1800 and 2200 m";
  return {
    id: "gx-SCI-99-001",
    source_id: "SCI-99",
    page: 2,
    snapshot_sha256: null,
    text_sha256: sha(PAGE),
    char_offset: null,
    char_length: null,
    excerpt,
    excerpt_sha256: sha(excerpt),
    claim_kind: "scientific_context",
    file: "paper.pdf",
    signed_by: null,
    ...overrides,
  };
}

describe("extraction fidelity suite", () => {
  it("finds a published excerpt on its cited page after the shared normalisation, and checks the page text", () => {
    const r = extractionSuite([item({})], corpus());
    expect(r).toMatchObject({
      items: 1,
      located: 1,
      excerptHashOk: 1,
      textChanged: 0,
      unsigned: 1,
    });
  });

  it("reports changed page text, an excerpt on another page, and one not found anywhere", () => {
    const dir = corpus();
    const changed = extractionSuite([item({ text_sha256: sha("something else") })], dir);
    expect(changed.textChanged).toBe(1);
    const other = extractionSuite([item({ page: 1, text_sha256: sha("Other page.") })], dir);
    expect(other.locatedOnOtherPage).toBe(1);
    const gone = item({ excerpt: "never said", excerpt_sha256: sha("never said") });
    expect(extractionSuite([gone], dir).notLocated).toBe(1);
  });

  it("checks a withheld excerpt by its offsets and hash, and reports a wrong hash", () => {
    const whole = "Intro. Hidden sentence here. End.";
    const hidden = "Hidden sentence here.";
    const base = item({
      file: "page.html",
      page: null,
      text_sha256: null,
      snapshot_sha256: sha(whole),
      excerpt: null,
      char_offset: 7,
      char_length: hidden.length,
      excerpt_sha256: sha(hidden),
    });
    expect(extractionSuite([base], corpus())).toMatchObject({
      located: 1,
      excerptHashOk: 1,
      withheld: 1,
    });
    const wrong = extractionSuite([{ ...base, excerpt_sha256: sha("different") }], corpus());
    expect(wrong).toMatchObject({ excerptHashMismatch: 1, notLocated: 1 });
  });

  it("counts a source with no stored text as unavailable, never as located", () => {
    const r = extractionSuite([item({ source_id: "SCI-98" })], corpus());
    expect(r).toMatchObject({
      textUnavailable: 1,
      located: 0,
      notCheckable: 1,
      sourcesWithoutText: ["SCI-98"],
    });
    const noDir = extractionSuite([item({})], null);
    expect(noDir).toMatchObject({ textUnavailable: 1, located: 0 });
  });

  it("flags a published excerpt whose recorded hash does not match", () => {
    const r = extractionSuite([item({ excerpt_sha256: sha("other") })], corpus());
    expect(r.excerptHashMismatch).toBe(1);
  });
});

const numeric = (overrides: Partial<NumericItem> = {}): NumericItem => ({
  id: "gn-1",
  bundle_id: "bundle_example_rain",
  collection_sha256: "ab".repeat(32),
  period_id: "period_2019-01",
  metric: "rain",
  value: 27.54,
  unit: "mm",
  period_status: "available",
  ...overrides,
});
const measurement = (overrides: Partial<Measurement> = {}) =>
  ({
    dataBundleId: "bundle_example_rain",
    periodId: "period_2019-01",
    metric: "rain",
    value: 27.54,
    unit: "mm",
    status: "available",
    ...overrides,
  }) as Measurement;
const bundle = { id: "bundle_example_rain", contentHash: `1220${"ab".repeat(32)}` } as DataBundle;

describe("numeric gold suite", () => {
  it("matches a value, unit, status and collection hash", () => {
    expect(numericSuite([numeric()], [measurement()], [bundle])).toMatchObject({
      items: 1,
      matched: 1,
    });
  });

  it("names each kind of difference by item", () => {
    const r = numericSuite(
      [
        numeric({ id: "v", value: 27.55 }),
        numeric({ id: "u", unit: "cm" }),
        numeric({ id: "s", period_status: "missing" }),
        numeric({ id: "h", collection_sha256: "00".repeat(32) }),
        numeric({ id: "m", metric: "other" }),
      ],
      [measurement(), measurement({ metric: "other" })],
      [bundle],
    );
    expect(r).toMatchObject({
      matched: 1,
      valueMismatch: ["v"],
      unitMismatch: ["u"],
      statusMismatch: ["s"],
      collectionHashMismatch: ["h"],
    });
    expect(r.missing).toEqual([]);
    expect(numericSuite([numeric({ id: "x", metric: "none" })], [], [bundle]).missing).toEqual([
      "x",
    ]);
  });
});

describe("numeric provenance validator suite", () => {
  it("accepts each true value and refuses the value with its last digit moved on, 9 included", () => {
    const items = [27.54, 0.0132, 369, 0.9, 1].map((value, i) =>
      numeric({ id: `n${String(i)}`, value }),
    );
    expect(provenanceSuite(items)).toMatchObject({
      values: 5,
      trueValueAccepted: 5,
      changedValueRefused: 5,
    });
  });

  it("leaves out an unavailable value and counts it as skipped", () => {
    expect(provenanceSuite([numeric({ period_status: "missing" })])).toMatchObject({
      values: 0,
      skipped: 1,
    });
  });
});

describe("report", () => {
  const header: EvalHeader = {
    model: null,
    promptVersion: null,
    route: "offline",
    corpusManifestSha256: "a".repeat(64),
    goldCorpusManifestSha256: "a".repeat(64),
    numericGoldCatalogSha256: "b".repeat(64),
    catalogSha256: "c".repeat(64),
    corpusTextDir: null,
    date: "2026-10-29T20:00:00.000Z",
  };
  it("says what held, what did not and why, and calls no model", () => {
    const e = extractionSuite([item({})], corpus());
    const n = numericSuite([numeric()], [measurement()], [bundle]);
    const p = provenanceSuite([numeric()]);
    const b = bars(header, e, n, p);
    expect(b.map((x) => x.held)).toEqual([true, true, true, true, false]);
    const text = markdown({ header, extraction: e, numeric: n, provenance: p, bars: b });
    expect(text).toContain("no model called");
    expect(text).toContain(
      "NOT held: Gold sets were written against the corpus and catalog in use",
    );
    expect(text).toContain("unsigned model drafts");
  });
});

describe("the location bar", () => {
  const header: EvalHeader = {
    model: null,
    promptVersion: null,
    route: "offline",
    corpusManifestSha256: "a".repeat(64),
    goldCorpusManifestSha256: "a".repeat(64),
    numericGoldCatalogSha256: "c".repeat(64),
    catalogSha256: "c".repeat(64),
    corpusTextDir: null,
    date: "2026-10-29T20:00:00.000Z",
  };
  const n = numericSuite([numeric()], [measurement()], [bundle]);
  const p = provenanceSuite([numeric()]);
  const location = (items: ExtractionItem[], dir: string | null) =>
    bars(header, extractionSuite(items, dir), n, p).find((b) => b.name.includes("found at"));

  it("holds when every checkable excerpt is found on its cited page", () => {
    expect(location([item({})], corpus())?.held).toBe(true);
  });

  it("does not hold when the cited page text was replaced, though every hash still reads ok", () => {
    const dir = corpus();
    writeFileSync(
      join(dir, "SCI-99", "paper.pdf.text.json"),
      JSON.stringify({ kind: "pdf", pages: [{ page: 2, text: "Replaced text." }] }),
    );
    const r = extractionSuite([item({})], dir);
    expect(r.excerptHashOk).toBe(1);
    expect(r).toMatchObject({ notLocated: 1, textChanged: 1 });
    expect(location([item({})], dir)?.held).toBe(false);
  });

  it("does not hold when the excerpt is only on another page", () => {
    expect(location([item({ page: 1, text_sha256: sha("Other page.") })], corpus())?.held).toBe(
      false,
    );
  });

  it("does not hold, and says how many were not checkable, when no source text is stored", () => {
    const bar = location([item({})], null);
    expect(bar?.held).toBe(false);
    expect(bar?.detail).toContain("1 of 1 not checkable");
  });

  it("counts an item with no recorded text hash as not compared, not as unchanged", () => {
    const r = extractionSuite([item({ text_sha256: null })], corpus());
    expect(r).toMatchObject({ textWithoutRecordedHash: 1, located: 1, textChanged: 0 });
  });

  it("tells the hash bar how many items were compared with stored text", () => {
    const hash = bars(
      header,
      extractionSuite([item({}), item({ source_id: "SCI-98" })], corpus()),
      n,
      p,
    ).find((b) => b.name.includes("hashes as recorded"));
    expect(hash?.detail).toContain(
      "1 of 2 items were also compared with stored source text, 1 were not",
    );
  });
});

describe("the case's own gold sets", () => {
  const extraction = loadExtractionGold(join(repoDir, "data/case/gold/extraction.jsonl"));
  const numericGold = loadNumericGold(join(repoDir, "data/case/gold/numeric.jsonl"));

  it("load with every item the header counts", () => {
    expect(extraction.items).toHaveLength(32);
    expect(numericGold.items).toHaveLength(350);
  });

  it("have every excerpt hashing as recorded, whatever source text is stored here", () => {
    const r = extractionSuite(extraction.items, null);
    expect(r.excerptHashMismatch).toBe(0);
    expect(r.signed).toBe(0);
  });

  it("have the validator accept every true value and refuse every changed one", () => {
    expect(provenanceSuite(numericGold.items)).toMatchObject({
      values: 350,
      trueValueAccepted: 350,
      changedValueRefused: 350,
    });
  });
});
