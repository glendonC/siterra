# Bibliography

Bibliographic records for the source registers, in CSL-JSON ([ADR-0030](../../docs/decisions/0030-keep-the-bibliography-in-csl-json.md)). The Markdown registers hold the inspection notes: what each source supports, its limits and its reuse terms. These JSON files hold the bibliographic fields of the same sources, keyed by the same identifiers, so a citation and its inspection note are joined by one ID.

| File | Identifiers | Register |
|---|---|---|
| [science.json](science.json) | SCI-01 to SCI-154 | [science/source-register.md](../science/source-register.md) |
| [competitive.json](competitive.json) | MKT-01 to MKT-20, STD-01, STD-02, LANG-01 to LANG-03 | [competitive/source-register.md](../competitive/source-register.md) |
| [technology.json](technology.json) | TECH-01 to TECH-54 | [technology/source-register.md](../technology/source-register.md) |
| [design.json](design.json) | VIS-01 to VIS-34 | [design/source-register.md](../design/source-register.md) |

Note-local source IDs (GW, MM, MS and WRT) are listed in their research notes and have no CSL file yet; a note that becomes a register gets one.

## Format

Each file is one JSON array of CSL-JSON items as defined by `csl-data.json` in the [CSL schema](https://github.com/citation-style-language/schema) release v1.0.2 (`$id` `https://resource.citationstyles.org/schema/v1.0/input/json/csl-data.json`, JSON Schema draft-07). An array has no place for `$schema`, so the schema is named here and in CI.

- `id` is the register identifier, one item per register entry, in register order. It is also the citation key: `[@SCI-02]` in pandoc.
- `type` is the CSL item type: `article-journal`, `book`, `chapter`, `report`, `dataset`, `webpage`, `software` and `standard`, and where a source is clearly of that kind `paper-conference`, `thesis`, `article` (preprint), `article-newspaper`, `post` or `legislation`.
- Names are `{"family", "given"}` as written in the register; organizations are `{"literal"}`. Editors are in `editor`.
- Dates use `date-parts`. `issued` is the publication date the register states; `accessed` is the inspection date and is present on every item with a `URL`.
- Other fields used: `title`, `container-title`, `volume`, `issue`, `page`, `number`, `genre`, `publisher`, `publisher-place`, `version`, `edition`, `ISBN`, `DOI` (bare, without `https://doi.org/`) and `URL` (the primary link of the entry).

## Rules

- Every value comes from the register entry with the same ID. Metadata the register does not state is omitted, not looked up, inferred from a URL or filled from memory.
- An entry that cites a related work (for example a method paper behind a dataset) keeps that work's DOI out of the item; the item describes the inspected source.
- A visual reference without a formal title uses the reference name from the register's index table as `title`.
- Inspection notes, reuse terms and limits stay in the Markdown register; `note` and `abstract` are not used.
- To add a source, add the register entry first, then the item with the same ID.

## Validation

1. Each file validates against `csl-data.json` v1.0.2 (items are closed: unknown fields fail).
2. Each register identifier has exactly one item, in register order, and no item lacks a register entry.
3. Each value occurs in the register text of its entry (provenance check).
