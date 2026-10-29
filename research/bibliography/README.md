# Bibliography

Bibliographic records for the source registers in CSL-JSON format. The Markdown registers hold the inspection notes, scope limits, and reuse terms; these JSON files hold the bibliographic metadata keyed by the same identifiers.

| File | Identifiers | Register |
|---|---|---|
| [science.json](science.json) | SCI-01 onward | [science/source-register.md](../science/source-register.md) |
| [technology.json](technology.json) | TECH-01 to TECH-54 | [technology/source-register.md](../technology/source-register.md) |
| [design.json](design.json) | VIS-01 to VIS-34 | [design/source-register.md](../design/source-register.md) |

## Format

Each file is a JSON array of CSL-JSON items as defined by `csl-data.json` in the [CSL schema](https://github.com/citation-style-language/schema) release v1.0.2 (`https://resource.citationstyles.org/schema/v1.0/input/json/csl-data.json`).

- `id` is the register identifier, one item per register entry.
- `type` is the CSL item type (`article-journal`, `book`, `chapter`, `report`, `dataset`, `webpage`, `software`, `standard`, `paper-conference`, `thesis`, `article`, `article-newspaper`, `post`, `legislation`).
- Dates use `date-parts`. `issued` is the publication date stated in the register; `accessed` is the inspection date.
- Every value comes from the corresponding register entry; unverified metadata is omitted rather than inferred.
