import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { corpusPaths, corpusWarning, loadCorpus, sectionPassages } from "./corpus.ts";
import { snapshotStore } from "./snapshot-store.ts";

// A synthetic corpus in a temporary folder: the manifest and text shapes follow data/case and
// data/interim as stored on 2026-10-27; the texts are invented.

async function corpusRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "siterra-corpus-"));
  await mkdir(join(root, "text"), { recursive: true });
  await writeFile(
    join(root, "manifest.json"),
    JSON.stringify({
      sources: [
        {
          sourceRecordId: "src_test_pdf",
          title: "PDF",
          accessStatus: "retrieved",
          redistributionStatus: "permitted",
          files: [{ name: "a.pdf", kind: "pdf", text_path: "text/a.json" }],
        },
        {
          sourceRecordId: "src_test_list",
          title: "Page list",
          accessStatus: "retrieved",
          redistributionStatus: "permitted",
          language: "en",
          files: [{ name: "b.pdf", kind: "pdf", text_path: "text/b.json" }],
        },
        {
          sourceRecordId: "src_test_html",
          title: "HTML",
          accessStatus: "retrieved",
          redistributionStatus: "permitted",
          files: [{ name: "c.html", kind: "html", text_path: "text/c.json" }],
        },
        {
          sourceRecordId: "src_test_missing",
          title: "Missing text",
          accessStatus: "retrieved",
          redistributionStatus: "unknown",
          files: [{ name: "d.pdf", kind: "pdf", text_path: "text/none.json" }],
        },
        {
          sourceRecordId: "src_test_closed",
          title: "Closed",
          accessStatus: "discovered",
          redistributionStatus: "unknown",
          files: [],
        },
        {
          sourceRecordId: "src_test_other_case",
          title: "Not in case",
          accessStatus: "retrieved",
          redistributionStatus: "unknown",
          files: [],
        },
      ],
    }),
  );
  await writeFile(
    join(root, "text/a.json"),
    JSON.stringify({
      kind: "pdf",
      pages: [
        { page: 1, text: "One." },
        { page: 2, text: "Two." },
      ],
    }),
  );
  await writeFile(join(root, "text/b.json"), JSON.stringify([{ page: "1", text: "Listed one." }]));
  await writeFile(
    join(root, "text/c.json"),
    JSON.stringify({
      text: "Title\u{1F600} Intro text. Methods text.",
      sections: [
        { heading: "Title", offset: -1 },
        { heading: "Intro", offset: 7 },
        { heading: "Methods", offset: 19 },
      ],
    }),
  );
  return root;
}

const revisions = new Map([
  ["src_test_pdf", 1],
  ["src_test_list", 2],
  ["src_test_html", 1],
  ["src_test_missing", 1],
  ["src_test_closed", 1],
]);

describe("corpus reader", () => {
  it("reads PDF pages in both stored shapes, sections by code point and the whole file", async () => {
    const corpus = await loadCorpus(
      await corpusRoot(),
      "manifest.json",
      (id) => revisions.get(id) ?? null,
    );
    expect(corpus.sources.map((s) => s.id)).toEqual([
      "src_test_pdf",
      "src_test_list",
      "src_test_html",
      "src_test_missing",
      "src_test_closed",
    ]);
    const at = (id: string) =>
      corpus.passages.filter((p) => p.sourceId === id).map((p) => [p.locator, p.text]);
    expect(at("src_test_pdf")).toEqual([
      [{ document: "a.pdf", page: 1 }, "One."],
      [{ document: "a.pdf", page: 2 }, "Two."],
    ]);
    expect(at("src_test_list")).toEqual([[{ document: "b.pdf", page: 1 }, "Listed one."]]);
    expect(at("src_test_html")).toEqual([
      [{ document: "c.html", fullText: true }, "Title\u{1F600} Intro text. Methods text."],
      [{ document: "c.html", section: "Intro" }, "Intro text. "],
      [{ document: "c.html", section: "Methods" }, "Methods text."],
    ]);
    expect(corpus.sources.find((s) => s.id === "src_test_html")?.documents[0]?.sections).toEqual([
      "Intro",
      "Methods",
    ]);
    expect(corpus.sources.find((s) => s.id === "src_test_list")).toMatchObject({
      revision: 2,
      language: "en",
    });
    expect(corpus.sources.find((s) => s.id === "src_test_pdf")?.language).toBeNull();
    expect(corpus.missing).toEqual([{ sourceId: "src_test_missing", file: "d.pdf" }]);
    expect(at("src_test_closed")).toEqual([]);
  });

  it("names the files whose stored text could not be read, and is silent when all could", async () => {
    const root = await corpusRoot();
    const corpus = await loadCorpus(root, "manifest.json", (id) => revisions.get(id) ?? null);
    expect(corpusWarning(corpus, root)).toBe(
      `worker: stored corpus text not readable under ${root} for 1 file: src_test_missing d.pdf`,
    );
    expect(corpusWarning({ ...corpus, missing: [] }, root)).toBeNull();
  });

  it("takes the corpus text root from SITERRA_CORPUS_TEXT_ROOT, else the repository root", () => {
    expect(corpusPaths({}, "/work")).toEqual({
      repoRoot: "/work",
      manifest: "data/case/corpus-manifest.json",
      textRoot: "/work",
    });
    expect(
      corpusPaths(
        {
          SITERRA_REPO_ROOT: "/repo",
          SITERRA_CORPUS_MANIFEST: "m.json",
          SITERRA_CORPUS_TEXT_ROOT: "/main-checkout",
        },
        "/work",
      ),
    ).toEqual({ repoRoot: "/repo", manifest: "m.json", textRoot: "/main-checkout" });
  });

  it("reads the stored text from its own root while the manifest stays in the repository", async () => {
    const textRoot = await corpusRoot();
    const repoRoot = await mkdtemp(join(tmpdir(), "siterra-repo-"));
    await writeFile(
      join(repoRoot, "manifest.json"),
      await readFile(join(textRoot, "manifest.json"), "utf8"),
    );
    const corpus = await loadCorpus(
      repoRoot,
      "manifest.json",
      (id) => revisions.get(id) ?? null,
      textRoot,
    );
    expect(corpus.passages.filter((p) => p.sourceId === "src_test_pdf")).toHaveLength(2);
    expect(corpus.missing).toEqual([{ sourceId: "src_test_missing", file: "d.pdf" }]);
  });

  it("drops private-use glyphs from headings, so a locator can be copied exactly (live run of 28 Oct 2026)", () => {
    expect(
      sectionPassages({
        text: "Climate text. Other text.",
        sections: [
          { heading: "Correcting for the effects of climate\uf0c1", offset: 0 },
          { heading: "\uf0c1", offset: 14 },
        ],
      }),
    ).toEqual([
      { heading: "Correcting for the effects of climate", text: "Climate text. Other text." },
    ]);
  });

  it("skips repeated and unlocated headings", () => {
    expect(
      sectionPassages({
        text: "abcdef",
        sections: [
          { heading: "A", offset: 0 },
          { heading: "A", offset: 3 },
          { heading: "X", offset: -1 },
        ],
      }),
    ).toEqual([{ heading: "A", text: "abc" }]);
  });

  it("the case record's Source.language wins over the corpus manifest", async () => {
    const corpus = await loadCorpus(
      await corpusRoot(),
      "manifest.json",
      (id) => revisions.get(id) ?? null,
    );
    const store = snapshotStore(
      {
        case: {
          id: "case_test",
          revision: 4,
          title: "T",
          objective: "O",
          mode: "replay",
          activeGeoSelectionId: null,
          unresolvedQuestions: [],
        },
        records: {
          dataBundleRecords: [],
          measurementRecords: [],
          temporalObservationRecords: [],
          sourceRecords: [
            { id: "src_test_pdf", revision: 1, language: "es" },
            { id: "src_test_list", revision: 2 },
          ],
        },
      },
      corpus,
    );
    expect((await store.readSource("case_test", "src_test_pdf"))?.language).toBe("es");
    expect((await store.readSource("case_test", "src_test_list"))?.language).toBe("en");
  });

  it("a snapshot store reads one consistent view and only the case's sources", async () => {
    const corpus = await loadCorpus(
      await corpusRoot(),
      "manifest.json",
      (id) => revisions.get(id) ?? null,
    );
    const store = snapshotStore(
      {
        case: {
          id: "case_test",
          revision: 4,
          title: "T",
          objective: "O",
          mode: "replay",
          activeGeoSelectionId: null,
          unresolvedQuestions: [],
        },
        records: {
          dataBundleRecords: [],
          measurementRecords: [],
          temporalObservationRecords: [],
          sourceRecords: [{ id: "src_test_pdf", revision: 1 }],
        },
      },
      corpus,
    );
    expect((await store.listSources("case_test")).map((s) => s.id)).toEqual(["src_test_pdf"]);
    expect((await store.readSource("case_test", "src_test_pdf"))?.language).toBeNull();
    expect(
      await store.passageAt("case_test", "src_test_pdf", { document: "a.pdf", page: 2 }),
    ).toMatchObject({ text: "Two." });
    expect(
      await store.passageAt("case_test", "src_test_html", { document: "c.html", fullText: true }),
    ).toBeNull();
  });
});
