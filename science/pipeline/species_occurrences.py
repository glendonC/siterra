"""Shared pieces of the species_occurrences recipe: the query polygon, licence names, groups and the stored record fields."""
import json
import os

import place_config
from shapely.geometry import Point
from shapely.geometry.polygon import orient

API = "https://api.gbif.org/v1"
LICENCES = {"CC0_1_0": ("CC0-1.0", "https://creativecommons.org/publicdomain/zero/1.0/"),
            "CC_BY_4_0": ("CC-BY-4.0", "https://creativecommons.org/licenses/by/4.0/")}
STORED = ["gbif_id", "scientific_name", "species", "kingdom", "class", "order", "family", "year", "event_date", "basis_of_record",
          "lat", "lon", "uncertainty_m", "dataset_key", "dataset_title", "publisher", "license"]


def query_polygon(cfg):
    """(shapely polygon, WKT) of the outward-fitted query polygon of the place configuration; stops unless it contains the frozen polygon."""
    q = cfg["recipes"]["species_occurrences"]["queryPolygon"]
    g = place_config.geometry(cfg)
    p = orient(g.buffer(q["bufferDeg"], join_style=2).simplify(q["simplifyDeg"], preserve_topology=True), 1.0)
    if p.geom_type != "Polygon":
        raise SystemExit("the query polygon is not one polygon")
    d = q["decimals"]
    ring = [(round(x, d), round(y, d)) for x, y in p.exterior.coords]
    wkt = "POLYGON((" + ",".join(f"{x:.{d}f} {y:.{d}f}" for x, y in ring) + "))"
    from shapely import wkt as shp_wkt
    pr = shp_wkt.loads(wkt)
    if not pr.contains(g):
        raise SystemExit("the query polygon does not contain the frozen polygon")
    if len(wkt) > q["maxChars"]:
        raise SystemExit(f"the query polygon text has {len(wkt)} characters, above the configured {q['maxChars']}")
    return pr, wkt


def licence_name(url):
    """Short name of a GBIF licence URL; the GBIF enum value is mapped for the two kept licences, anything else keeps its path."""
    u = (url or "").lower().rstrip("/")
    if u.endswith("/legalcode"):
        u = u[: -len("/legalcode")]
    if "publicdomain/zero/1.0" in u:
        return "CC0-1.0"
    if "licenses/by/4.0" in u:
        return "CC-BY-4.0"
    if "licenses/by-nc/4.0" in u:
        return "CC-BY-NC-4.0"
    return u.split("creativecommons.org/")[-1] if u else "unspecified"


def group_of(kingdom):
    return {"Animalia": "animals", "Plantae": "plants", "Fungi": "fungi"}.get(kingdom, "other")


def inside(poly, lon, lat):
    return bool(poly.covers(Point(lon, lat)))
