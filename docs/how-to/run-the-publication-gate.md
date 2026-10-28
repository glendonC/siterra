# Run the publication gate

Review what is about to enter version control before the first commit and before any push. The gate protects private details, credentials, third-party rights and scientific honesty; placement rules are in [CONTRIBUTING.md](../../CONTRIBUTING.md#public-and-private-placement). Passing the gate does not approve publication: the maintainer approves any publication or change of repository visibility.

The commands are aids to the review, not a replacement for reading. Run them from the repository root after staging the files you intend to commit (`git add <path>`); never force-add an ignored path.

## 1. Review staged paths and contents

Review staged paths and contents, including images, SVG metadata, PNG text chunks and examples.

List what is staged and confirm every path belongs in a public location:

```sh
git status --short
git diff --cached --stat
```

Confirm that no ignored path was force-added. This command must print nothing:

```sh
git ls-files --cached --ignored --exclude-standard
```

Read the staged text with `git diff --cached`. For images, list PNG text chunks (`tEXt`, `iTXt`, `zTXt`) and EXIF blocks, which can carry author names, paths or tool metadata:

```sh
git diff --cached --name-only -- '*.png' | python3 -c '
import struct, sys
for name in sys.stdin.read().split():
    data = open(name, "rb").read()
    pos, found = 8, []
    while pos + 8 <= len(data):
        length, kind = struct.unpack(">I4s", data[pos:pos + 8])
        if kind in (b"tEXt", b"iTXt", b"zTXt", b"eXIf"):
            body = data[pos + 8:pos + 8 + length]
            found.append(kind.decode() + " " + body.split(b"\0")[0].decode("latin-1"))
        pos += 12 + length
    print(name + ": " + ("; ".join(found) or "no text chunks"))
'
```

Open every staged SVG as text and check its `<metadata>`, comments, embedded `data:` images and external references. Check that schema examples use fictional `example` IDs and labeled synthetic values only.

## 2. Confirm no private details or credentials

Confirm no founder trip or contact details, account identifiers, credentials, unredacted traces or private tactics.

Search the staged content for credential patterns and e-mail addresses, then review every hit (words such as "token" also occur legitimately, for example in design tokens):

```sh
git grep --cached -n -I -i -E 'api[_-]?key|secret|password|bearer|private key'
git grep --cached -n -I -E '[[:alnum:]._%+-]+@[[:alnum:].-]+\.[[:alpha:]]{2,}'
```

Confirm that no `.env` file other than `.env.example` is staged:

```sh
git diff --cached --name-only | grep -E '(^|/)\.env'
```

Material listed as private in [CONTRIBUTING.md](../../CONTRIBUTING.md#placement-rules-for-new-material) (pitch and judging tactics, the original directive, trip locations, contact identities, account status and costs) must not appear in staged files, quoted or paraphrased.

## 3. Check scientific statements against their cited scope

Check every scientific statement against its cited scope; keep blocked and missing states.

Read each changed statement against the register entry it cites ([science source register](../../research/science/source-register.md) for SCI IDs). Search for wording from the [prohibited claims](../explanation/scientific-basis.md#claims-prohibited-in-the-demo) and review each hit; it must be a stated limit, a prohibition or a quoted example, never a claim:

```sh
git grep --cached -n -I -i -E 'overgrazing detected|degraded|carrying capacity|biomass|significant trend|forecast|projection|outlook'
```

Do not remove "cannot be assessed with current data", missing-data states, [U] labels or other limits to make a document read better.

## 4. Confirm redistribution rights and attribution

Confirm redistribution rights and attribution for every included asset (fonts, tiles, imagery, data). Links do not grant copy rights.

List staged media, fonts and geodata:

```sh
git diff --cached --name-only | grep -E '\.(png|jpe?g|webp|gif|svg|pdf|mp4|woff2?|ttf|otf|tiff?|pmtiles|geojson)$'
```

For each file, establish who made it, under which license and with which attribution:

- Third-party screenshots, video frames and captures belong in the ignored `design/private/` folder only.
- Derived data and geometry carry their source attribution, for example the catchment geometry in `data/case/geometry/ait-bouguemez-catchment.geojson`, whose `source` names the Copernicus DEM tile it was derived from. Required strings are in [data sources and reproducible methods](../reference/data-sources-and-methods.md#attribution-strings).
- Fonts and adapted components keep their license notices (IBM Plex is OFL-1.1; adapted MIT components keep the MIT notice).
- Once licensing is declared with REUSE ([ADR-0032](../decisions/0032-declare-licensing-with-reuse-and-spdx.md)), every third-party file has an annotation in `REUSE.toml`, and `reuse lint` passes.

## 5. Confirm labels and the license decision

Confirm status labels, illustrative-value tags and the project license decision. No deployment, customer, partnership or outcome claims without evidence.

- Every conceptual view tags its illustrative values; simulated runs, replays and demo reviews are labeled as such.
- Claims carry their [evidence labels](../README.md#evidence-labels) where the distinction matters.
- The project license is the maintainer's decision (GATE-05 in the [delivery plan](../project/delivery-plan.md#gates)). Until it is made, no file asserts a project license, and the README says so.
- Read the README and the explanation documents for any statement of deployment, customers, partnerships, user demand or outcomes; each needs cited evidence or must go.

## 6. Inspect history

Inspect history as well as files once the repository has commits. A secret scan supplements this review; it does not replace it.

```sh
git log --all --stat
git grep -n -I -i -E 'api[_-]?key|secret|password|bearer|private key' $(git rev-list --all)
```

`git log --all -p -S '<text>'` shows the commits that added or removed a given string. If a credential or private detail is found in history, do not push: rotate the credential and remove the content from history before anything is published.

## If a check fails

Unstage the file with `git restore --staged <path>`, fix or relocate it according to [CONTRIBUTING.md](../../CONTRIBUTING.md#public-and-private-placement), and run the gate again from step 1.
