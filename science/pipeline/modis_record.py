"""Read the records that modis-fetch.py and modis-archive-gaps.py leave in a MODIS raw directory."""
import json
import os


def search_record(raw):
    """(file name, record) of the newest search record."""
    name = sorted(f for f in os.listdir(raw) if f.startswith("search-"))[-1]
    with open(os.path.join(raw, name)) as f:
        return name, json.load(f)


def archive_gaps(raw, rec_name, rec):
    """The archive-gaps record written for this search record, or None when the gaps were not checked against CMR."""
    path = os.path.join(raw, f"archive-gaps-{rec['first']}-{rec['last']}.json")
    if not os.path.exists(path):
        return None
    with open(path) as f:
        gaps = json.load(f)
    return gaps if gaps["search_record"] == rec_name else None


def gap_sentence(absent, gaps, unit):
    """One sentence on acquisition dates (AYYYYDDD) absent from Planetary Computer and what NASA CMR lists for them."""
    if not absent:
        return f"No {unit} is absent from Planetary Computer in the registered period."
    head = f"{len(absent)} {unit}s absent from Planetary Computer ({', '.join(absent) if len(absent) <= 12 else 'listed in the tables'})"
    if gaps is None:
        return head + "; not checked against NASA CMR."
    listed = {g.split(".")[0] for g in gaps["listed_in_cmr"]}
    n_listed = sum(1 for a in absent if a in listed)
    tail = f"; {len(absent) - n_listed} are missing there too." if n_listed < len(absent) else "."
    return (head + f"; on {gaps['checked_at'][:10]} NASA CMR listed {n_listed} of them (held by the NASA archive, which needs an "
            f"Earthdata login, not used)" + tail)


def merged_search_record(raw):
    """(names, record) over every search record in the folder: the kept items, dropped duplicates and dates of all runs.

    Used for a sample of separate periods, each fetched by its own modis-fetch.py run into one folder."""
    names = sorted(f for f in os.listdir(raw) if f.startswith("search-"))
    recs = []
    for n in names:
        with open(os.path.join(raw, n)) as f:
            recs.append(json.load(f))
    out = dict(recs[0])
    out["kept"] = sorted({i for r in recs for i in r["kept"]})
    out["dropped_duplicates"] = sorted({i for r in recs for i in r["dropped_duplicates"]})
    out["first"], out["last"] = min(r["first"] for r in recs), max(r["last"] for r in recs)
    out["searched_at"] = max(r["searched_at"] for r in recs)
    out["searched"] = sum(r["searched"] for r in recs)
    return ", ".join(names), out
