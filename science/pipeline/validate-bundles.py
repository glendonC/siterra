"""Validate a static bundle catalog: STAC 1.1.0 core, every extension in stac_extensions, the Siterra extension, and
every file:checksum along catalog -> collection -> items -> assets and lockfile links.

Usage: python -I validate-bundles.py <bundles_dir> <siterra-extension.schema.json> <schema_cache_dir>
Remote schemas are fetched once over HTTPS and cached; the Siterra extension URLs (1.0.0 and 1.1.0) map to the local
schema file, which must be version 1.1.0 or later to validate a 1.1.0 document.
Exit status 1 if anything fails.
"""
import hashlib
import json
import os
import sys
import urllib.request

import jsonschema
from referencing import Registry, Resource

BDIR, SITERRA, CACHE = sys.argv[1:4]
EXT_URLS = {"https://siterra.invalid/schemas/stac/siterra/1.0.0/schema.json", "https://siterra.invalid/schemas/stac/siterra/1.1.0/schema.json"}
CORE = {"Collection": "https://schemas.stacspec.org/v1.1.0/collection-spec/json-schema/collection.json",
        "Feature": "https://schemas.stacspec.org/v1.1.0/item-spec/json-schema/item.json",
        "Catalog": "https://schemas.stacspec.org/v1.1.0/catalog-spec/json-schema/catalog.json"}
os.makedirs(CACHE, exist_ok=True)


def fetch(uri):
    if uri.rstrip("#") in EXT_URLS:
        return json.load(open(SITERRA))
    path = os.path.join(CACHE, hashlib.sha256(uri.encode()).hexdigest() + ".json")
    if not os.path.exists(path):
        req = urllib.request.Request(uri, headers={"User-Agent": "siterra-science-validator/0.1"})
        with urllib.request.urlopen(req, timeout=60) as r:
            data = r.read()
        with open(path, "wb") as f:
            f.write(data)
    return json.load(open(path))


registry = Registry(retrieve=lambda uri: Resource.from_contents(fetch(uri)))
errors = []


def validate(doc, where):
    for uri in [CORE[doc["type"]]] + doc.get("stac_extensions", []):
        schema = fetch(uri)
        cls = jsonschema.validators.validator_for(schema)
        v = cls(schema, registry=registry, format_checker=cls.FORMAT_CHECKER)
        for e in v.iter_errors(doc):
            errors.append(f"{where}: {uri.rsplit('/', 3)[-3]}: {'/'.join(map(str, e.absolute_path))}: {e.message[:200]}")


def check(path, mh, where):
    got = "1220" + hashlib.sha256(open(path, "rb").read()).hexdigest()
    if got != mh:
        errors.append(f"{where}: checksum mismatch for {path}")


n_items = n_assets = 0
cat_path = os.path.join(BDIR, "catalog.json")
cat = json.load(open(cat_path))
validate(cat, "catalog.json")
for link in cat["links"]:
    if link["rel"] != "child":
        continue
    cpath = os.path.normpath(os.path.join(BDIR, link["href"]))
    check(cpath, link["file:checksum"], "catalog child")
    col = json.load(open(cpath))
    cdir = os.path.dirname(cpath)
    validate(col, col["id"])
    for k, a in col["assets"].items():
        check(os.path.join(cdir, a["href"]), a["file:checksum"], f"{col['id']} asset {k}")
        n_assets += 1
    for l in col["links"]:
        if l["rel"] in ("item", "processing-software"):
            p = os.path.normpath(os.path.join(cdir, l["href"]))
            check(p, l["file:checksum"], f"{col['id']} {l['rel']}")
        if l["rel"] == "item":
            item = json.load(open(p))
            idir = os.path.dirname(p)
            validate(item, f"{col['id']}/{item['id']}")
            n_items += 1
            for k, a in item["assets"].items():
                check(os.path.join(idir, a["href"]), a["file:checksum"], f"{item['id']} asset {k}")
                n_assets += 1
print(f"validated catalog, {n_items} items, {n_assets} assets; errors: {len(errors)}")
for e in errors[:40]:
    print("  " + e)
sys.exit(1 if errors else 0)
