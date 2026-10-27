"""Build the extraction gold set (data/case/gold/extraction.jsonl) from a private draft, in the format of
docs/reference/evaluation.md (section "Extraction gold set"), checking every excerpt by code.

Usage: python -I gold-extraction.py <corpus-manifest.json> <repo_root> <draft.json> <rubric.md> <labeler> <out.jsonl>
The draft (kept outside Git because it holds excerpt text of every source) lists items: source_id, file (a file name
from the manifest entry), page (PDF only), excerpt, statement, claim_kind, scope (the place and period the excerpt
states, in words), translation, and optionally id, attribution (required by the source's terms) and note. IDs are
never reused: an item an ID was given to and later dropped is listed in the draft's retired_ids. Each excerpt must be found in the stored text of that page or
file after normalization (Unicode NFC, each run of White_Space characters collapsed to one space, ends trimmed) and be
at most 300 code points; otherwise the build stops. Item fields:
  page, text_sha256       a PDF: 1-based page and the SHA-256 of that page's stored text (UTF-8)
  section, snapshot_sha256 not a PDF: the heading in force and the SHA-256 of the stored text (the snapshot)
  char_offset, char_length code points into the stored text before normalization: the snapshot, or the PDF page when
                           the excerpt is withheld; null for a PDF whose excerpt is published
  excerpt                  the normalized excerpt where the manifest's excerptPolicy is "text", else null
  excerpt_sha256           SHA-256 of the normalized excerpt
  signed_by, signed        null until a person signs the item
The header carries the corpus manifest's SHA-256 and the PDF text extractor.
"""
import datetime
import hashlib
import json
import os
import sys
import unicodedata

CLAIM_KINDS = {"observation", "scientific_context", "hypothesis", "model_estimate", "scenario", "field_requirement", "verified_outcome"}
WHITE_SPACE = set("\u0009\u000a\u000b\u000c\u000d \u0085      　") | {chr(c) for c in range(0x2000, 0x200B)}


def collapse(s):
    """Normalized text of s (NFC, White_Space runs collapsed, ends trimmed) and, for each of its code points, the
    span [start, end) of code points of s it came from. NFC is applied per base character with its combining marks,
    so offsets map back to the text as stored."""
    units, i = [], 0
    while i < len(s):
        j = i + 1
        while j < len(s) and unicodedata.combining(s[j]):
            j += 1
        units.append((i, j, unicodedata.normalize("NFC", s[i:j])))
        i = j
    out, span, space = [], [], None
    for a, b, u in units:
        if all(ch in WHITE_SPACE for ch in u):
            if out and space is None:
                space = (a, b)
            continue
        if space is not None:
            out.append(" ")
            span.append(space)
            space = None
        for ch in u:
            out.append(ch)
            span.append((a, b))
    return "".join(out), span


def norm(s):
    return collapse(unicodedata.normalize("NFC", s))[0]


def sha_text(s):
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


def sha_file(p):
    return hashlib.sha256(open(p, "rb").read()).hexdigest()


man_path, root, draft_path, rubric_path, labeler, out = sys.argv[1:7]
man = json.load(open(man_path, encoding="utf-8"))
draft = json.load(open(draft_path, encoding="utf-8"))
rubric_version = draft["rubric_version"]
assert f"Rubric version {rubric_version}" in open(rubric_path, encoding="utf-8").read(), "rubric version not found in the rubric"
src = {s["id"]: s for s in man["sources"]}
created = datetime.datetime.now().astimezone().isoformat(timespec="seconds")
items, counts, extractors, seen = [], {}, set(), set()
for n, d in enumerate(draft["items"], 1):
    s = src[d["source_id"]]
    assert s["access"] == "open" and s.get("files"), (d["source_id"], "no stored file")
    f = next(x for x in s["files"] if x["name"] == d["file"])
    doc = json.load(open(os.path.join(root, f["text_path"]), encoding="utf-8"))
    pages = doc if isinstance(doc, list) else doc.get("pages")
    is_pdf = pages is not None
    if is_pdf:
        assert d.get("page"), (n, "a PDF item needs a page")
        stored = next(p["text"] for p in pages if int(p["page"]) == d["page"])
        extractors.add(doc.get("extractor", "pdftotext (poppler), extractor not recorded in the text file") if isinstance(doc, dict) else None)
    else:
        assert not d.get("page"), (n, "only a PDF item has a page")
        stored = doc["text"]
    ex = norm(d["excerpt"])
    assert 0 < len(ex) <= 300, (n, "excerpt length", len(ex))
    flat, idx = collapse(stored)
    k = flat.find(ex)
    assert k >= 0, (n, d["source_id"], "excerpt not found", ex[:80])
    start, end = idx[k][0], idx[k + len(ex) - 1][1]
    assert norm(stored[start:end]) == ex, (n, "offset mapping failed")
    published = s.get("excerptPolicy") == "text"
    section = None
    if not is_pdf:
        for sec in doc.get("sections", []):
            if 0 <= sec["offset"] <= start:
                section = sec["heading"]
    assert d["claim_kind"] in CLAIM_KINDS, (n, d["claim_kind"])
    counts[d["source_id"]] = counts.get(d["source_id"], 0) + 1
    rid = d.get("id") or f"gx-{d['source_id']}-{counts[d['source_id']]:03d}"
    assert rid not in seen and rid not in draft.get("retired_ids", {}), (n, rid, "ID reused")
    seen.add(rid)
    rec = {"record": "item", "id": rid, "source_id": d["source_id"],
           "page": d["page"] if is_pdf else None,
           "section": section if not is_pdf else None, "snapshot_sha256": sha_text(stored) if not is_pdf else None,
           "text_sha256": sha_text(stored) if is_pdf else None,
           "char_offset": None if (is_pdf and published) else start, "char_length": None if (is_pdf and published) else end - start,
           "excerpt": ex if published else None, "excerpt_sha256": sha_text(ex),
           "statement": d["statement"], "claim_kind": d["claim_kind"], "scope": d["scope"],
           "labeler": labeler, "rubric_version": rubric_version, "created": created, "signed_by": None, "signed": None,
           "file": f["name"], "translation": bool(d.get("translation"))}
    if d.get("attribution"):
        rec["attribution"] = d["attribution"]
    if d.get("note"):
        rec["note"] = d["note"]
    items.append(rec)

extractors.discard(None)
assert len(extractors) == 1, extractors
header = {"record": "header", "corpus_manifest_sha256": sha_file(man_path), "text_extractor": extractors.pop() + " (poppler)",
          "created": created, "rubric_version": rubric_version, "rubric_sha256": sha_file(rubric_path), "items": len(items),
          "retired_ids": draft.get("retired_ids", {})}
with open(out, "w", encoding="utf-8") as o:
    for rec in [header] + items:
        o.write(json.dumps(rec, ensure_ascii=False) + "\n")
print(len(items), "items;", counts, "| extractor:", header["text_extractor"])
