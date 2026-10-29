"""Small helpers the bundle builders share: checksums, JSON writing and asset objects."""
import datetime
import json
import os

import place_config


def sha(path):
    return place_config.sha256(path)


def dump(obj, path, compact=False):
    with open(path, "w") as f:
        if compact:
            json.dump(obj, f, separators=(",", ":"), ensure_ascii=False)
        else:
            json.dump(obj, f, indent=1, ensure_ascii=False)
        f.write("\n")


def plain_asset(bdir, name, mime, title, roles, **extra):
    """A Collection asset for the file `name` in the bundle folder, with its multihash checksum and size."""
    p = os.path.join(bdir, name)
    return {"href": f"./{name}", "type": mime, "title": title, "roles": roles, **extra,
            "file:checksum": "1220" + sha(p), "file:size": os.path.getsize(p)}


def now_utc():
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
