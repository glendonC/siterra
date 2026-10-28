"""Fetch the case corpus listed in data/case/corpus-manifest.json and store each file with its provenance. Stdlib only,
plus poppler's pdftotext and pdfinfo for PDF text.

Usage: python -I corpus-fetch.py <corpus-manifest.json> <repo_root> [--only=SCI-07,SCI-09] [--check-closed] [--write=<manifest_out.json>]
Needs poppler's pdftotext and pdfinfo on PATH (the corpus text was extracted with poppler 26.09.0).
For every source whose `access` is "open", each entry of `fetch` is either downloaded from its `url` into
data/raw/corpus/<SCI-ID>/<name> (skipped if that file already exists) or, when it names a `stored_path`, an existing
file is checked against its `sha256`. Beside each downloaded file goes <name>.provenance.json (URL, final URL, HTTP
status, ETag, Last-Modified, content type, size, sha256, retrieval time). Text goes to data/interim/corpus/<SCI-ID>/
<name>.text.json: for a PDF one entry per page (pdftotext, UTF-8); for HTML the visible text, decoded with the charset the server
sent, with each heading's character offset (section locators); for JSON (an abstract record) the fields named in
`json_fields`, markup removed, each a section; for plain text the file as decoded. Raw files and text stay out of Git
(data/raw/ and data/interim/ are ignored); only the manifest with URLs, sizes and checksums is public.
With --write, the manifest is written again with `files` filled for every source read in this run and `accessStatus`
"retrieved" where at least one file is stored. A failed download is reported and leaves the source as it was.
Sources whose `access` is "bibliography_only" are never fetched; with --check-closed, their `access_check_url` is
requested once (nothing stored) and the result kept as `accessCheck`. On --write every entry also gets the Source
fields of schemas/case.schema.json the loader needs: `accessedAt` (the latest retrieval of a stored file, else the
access check), `contentHash` ("sha256:" and the first stored file's SHA-256, or null) and `notes` (the access note
and the excerpt policy). `language` (a BCP 47 tag) is set per source in the manifest and copied to each file from its
fetch entry, with `languageNote` where a file mixes languages.
"""
import datetime
import hashlib
import html.parser
import json
import os
import re
import shutil
import subprocess
import sys
import urllib.error
import urllib.request

UA = "siterra-science-pipeline/0.1 (research corpus fetch)"
MAX_BYTES = 60 * 1024 * 1024
PDFTOTEXT, PDFINFO = shutil.which("pdftotext"), shutil.which("pdfinfo")
SKIP_TAGS = {"script", "style", "noscript", "svg", "template"}
HEADINGS = {"h1", "h2", "h3", "h4", "h5", "h6"}
BLOCKS = HEADINGS | {"p", "div", "li", "tr", "br", "section", "article", "table", "pre", "dt", "dd", "blockquote"}


def sha(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""):
            h.update(b)
    return h.hexdigest()


def now():
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def download(url, dest):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*"})
    with urllib.request.urlopen(req, timeout=90) as r:
        body = r.read(MAX_BYTES + 1)
        if len(body) > MAX_BYTES:
            raise ValueError(f"larger than {MAX_BYTES} bytes")
        meta = {"url": url, "final_url": r.geturl(), "http_status": r.status, "etag": r.headers.get("ETag"),
                "last_modified": r.headers.get("Last-Modified"), "content_type": r.headers.get("Content-Type"),
                "retrieved": now()}
    with open(dest + ".tmp", "wb") as f:
        f.write(body)
    os.replace(dest + ".tmp", dest)
    return meta


class Visible(html.parser.HTMLParser):
    """Visible text of an HTML page with block breaks, and the character offset of each heading."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts, self.skip, self.head, self.sections = [], 0, None, []

    def _len(self):
        return sum(len(p) for p in self.parts)

    def handle_starttag(self, tag, attrs):
        if tag in SKIP_TAGS:
            self.skip += 1
        elif tag in BLOCKS:
            self.parts.append("\n")
        if tag in HEADINGS and not self.skip:
            self.head = {"tag": tag, "offset": self._len(), "text": ""}

    def handle_endtag(self, tag):
        if tag in SKIP_TAGS and self.skip:
            self.skip -= 1
        elif tag in HEADINGS and self.head:
            self.head["text"] = " ".join(self.head["text"].split())
            if self.head["text"]:
                self.sections.append(self.head)
            self.head = None
        if tag in BLOCKS:
            self.parts.append("\n")

    def handle_data(self, data):
        if self.skip:
            return
        if self.head is not None:
            self.head["text"] += data
        self.parts.append(data)


def charset(content_type):
    for part in (content_type or "").split(";"):
        k, _, v = part.strip().partition("=")
        if k.lower() == "charset" and v:
            return v.strip().strip('"')
    return "utf-8"


def html_text(path, enc):
    text = open(path, "rb").read().decode(enc, errors="replace")
    p = Visible()
    p.feed(text)
    full = "".join(p.parts)
    # one line per block with whitespace collapsed; heading offsets are found in that text, in document order
    norm = "\n".join(s for s in (" ".join(line.split()) for line in full.split("\n")) if s)
    sections, start = [], 0
    for s in p.sections:
        i = norm.find(s["text"], start)
        if i >= 0:
            start = i + len(s["text"])
        sections.append({"heading": s["text"], "level": int(s["tag"][1]), "offset": i})
    return {"text": norm, "text_sha256": hashlib.sha256(norm.encode("utf-8")).hexdigest(), "sections": sections}


def pdf_pages(path):
    if not (PDFTOTEXT and PDFINFO):
        sys.exit("pdftotext and pdfinfo (poppler) must be on PATH to extract PDF text")
    info = subprocess.run([PDFINFO, path], capture_output=True, text=True, check=True).stdout
    n = int(next(l.split()[-1] for l in info.splitlines() if l.startswith("Pages:")))
    pages = []
    for i in range(1, n + 1):
        t = subprocess.run([PDFTOTEXT, "-f", str(i), "-l", str(i), "-enc", "UTF-8", path, "-"],
                           capture_output=True, check=True).stdout.decode("utf-8", errors="replace")
        pages.append({"page": i, "text": t})
    return pages


def json_values(obj, dotted):
    """Values at a path of keys separated by "/"; a key ending in [*] walks every element of a list."""
    cur = [obj]
    for key in dotted.split("/"):
        nxt = []
        for c in cur:
            if key.endswith("[*]"):
                nxt += c.get(key[:-3], []) if isinstance(c, dict) else []
            elif isinstance(c, dict) and key in c:
                nxt.append(c[key])
        cur = nxt
    return [v for v in cur if isinstance(v, str)]


def json_text(path, fields):
    """The named string fields of a JSON record, markup removed, each as a section with its character offset."""
    d = json.load(open(path, encoding="utf-8"))
    parts, sections, pos = [], [], 0
    for f in fields:
        for v in json_values(d, f):
            v = " ".join(re.sub(r"<[^>]+>", " ", v).split())
            sections.append({"heading": f, "level": 1, "offset": pos})
            parts.append(v)
            pos += len(v) + 1
    text = "\n".join(parts)
    return {"text": text, "text_sha256": hashlib.sha256(text.encode("utf-8")).hexdigest(), "sections": sections}


def extract(sid, entry, path, out_dir, enc="utf-8"):
    kind = entry["kind"]
    doc = {"source_id": sid, "file": entry["name"], "file_sha256": sha(path), "kind": kind, "extracted": now()}
    if kind == "pdf":
        v = subprocess.run([PDFTOTEXT, "-v"], capture_output=True, text=True)
        ver = (v.stdout + v.stderr).splitlines()[0]
        doc.update({"extractor": ver, "pages": pdf_pages(path)})
    elif kind == "html":
        doc.update({"extractor": f"python html.parser ({enc}), visible text, headings as section locators", **html_text(path, enc)})
    elif kind == "json":
        doc.update({"extractor": "JSON fields " + ", ".join(entry["json_fields"]) + ", markup removed", **json_text(path, entry["json_fields"])})
    else:
        doc.update({"extractor": "UTF-8 decode", "text": open(path, "rb").read().decode("utf-8", errors="replace")})
    os.makedirs(out_dir, exist_ok=True)
    tp = os.path.join(out_dir, entry["name"] + ".text.json")
    json.dump(doc, open(tp, "w"), ensure_ascii=False, indent=1)
    return tp, doc


def lang(e):
    """The file's language fields from its fetch entry: a BCP 47 tag checked from the stored text, and a note where
    the file mixes languages."""
    return {k: e[k] for k in ("language", "languageNote") if e.get(k)}


def check(url):
    """Request a closed source once to record whether it is reachable; nothing is stored."""
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*"})
    rec = {"url": url, "checked": now()}
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            r.read(65536)
            rec.update({"final_url": r.geturl(), "http_status": r.status, "content_type": r.headers.get("Content-Type")})
    except urllib.error.HTTPError as x:
        rec.update({"final_url": x.geturl(), "http_status": x.code})
    except (urllib.error.URLError, OSError) as x:
        rec["error"] = f"{type(x).__name__}: {x}"
    return rec


def source_fields(src):
    """accessedAt, contentHash and notes for the Source record."""
    files = src.get("files") or []
    times = [f["retrieved"] for f in files if f.get("retrieved")]
    src["accessedAt"] = max(times) if times else (src.get("accessCheck") or {}).get("checked")
    src["contentHash"] = ("sha256:" + files[0]["sha256"]) if files else None
    src["notes"] = [src["accessNote"], f"Excerpt policy {src['excerptPolicy']}: {src['excerptPolicyReason']}"]


def main():
    man_path, root = sys.argv[1:3]
    only = next((a.split("=", 1)[1].split(",") for a in sys.argv if a.startswith("--only=")), None)
    out = next((a.split("=", 1)[1] for a in sys.argv if a.startswith("--write=")), None)
    man = json.load(open(man_path))
    rel = lambda p: os.path.relpath(p, root)
    report = []
    for src in man["sources"]:
        sid = src["id"]
        if only and sid not in only:
            continue
        if src["access"] != "open":
            if "--check-closed" in sys.argv and src.get("access_check_url"):
                src["accessCheck"] = check(src["access_check_url"])
                report.append((sid, "access check", str(src["accessCheck"].get("http_status") or src["accessCheck"].get("error"))))
            continue
        files = []
        for e in src["fetch"]:
            try:
                if e.get("stored_path"):
                    path = os.path.join(root, e["stored_path"])
                    got = sha(path)
                    if got != e["sha256"]:
                        raise ValueError(f"stored file sha256 {got} differs from the manifest")
                    meta = {"url": e["url"], "stored_path": e["stored_path"], "provenance": e.get("provenance")}
                    tp = os.path.join(root, e["text_path"])
                    files.append({"name": e["name"], "role": e["role"], "kind": e["kind"], **lang(e), **meta, "retrieved": e.get("retrieved"), "size": os.path.getsize(path),
                                  "sha256": got, "text_path": e["text_path"], "text_sha256": sha(tp)})
                    report.append((sid, e["name"], "stored file checked"))
                    continue
                d = os.path.join(root, "data", "raw", "corpus", sid)
                os.makedirs(d, exist_ok=True)
                path = os.path.join(d, e["name"])
                pv = path + ".provenance.json"
                if not os.path.exists(path):
                    meta = download(e["url"], path)
                    meta.update({"size": os.path.getsize(path), "sha256": sha(path)})
                    json.dump({"source_id": sid, "name": e["name"], **meta}, open(pv, "w"), indent=1)
                meta = json.load(open(pv))
                if e.get("expected_sha256") and meta["sha256"] != e["expected_sha256"]:
                    report.append((sid, e["name"], f"NOTE: sha256 {meta['sha256']} differs from the register's {e['expected_sha256']}"))
                tp, doc = extract(sid, e, path, os.path.join(root, "data", "interim", "corpus", sid), charset(meta["content_type"]))
                count = {"pages": len(doc["pages"])} if "pages" in doc else ({"sections": len(doc["sections"])} if "sections" in doc else {})
                files.append({"name": e["name"], "role": e["role"], "kind": e["kind"], **lang(e), "url": meta["url"], "final_url": meta["final_url"],
                              "http_status": meta["http_status"], "etag": meta["etag"], "last_modified": meta["last_modified"],
                              "content_type": meta["content_type"], "retrieved": meta["retrieved"], "size": meta["size"],
                              "sha256": meta["sha256"], "stored_path": rel(path), "provenance": rel(pv),
                              "text_path": rel(tp), "text_sha256": sha(tp), **count})
                report.append((sid, e["name"], f"stored, {meta['size']} bytes"))
            except (urllib.error.URLError, urllib.error.HTTPError, ValueError, OSError, subprocess.CalledProcessError) as x:
                report.append((sid, e["name"], f"FAILED: {type(x).__name__}: {x}"))
        if files:
            src["files"] = files
            src["accessStatus"] = "retrieved"
    for s in man["sources"]:
        source_fields(s)
    for r in report:
        print(*r, sep="  ")
    if out:
        json.dump(man, open(out, "w"), ensure_ascii=False, indent=1)
        open(out, "a").write("\n")
        print("manifest written", out)


if __name__ == "__main__":
    main()
