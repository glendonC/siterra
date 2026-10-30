"""Read a place configuration (science/places/<place>.json) and the analysis grid, strata and elevation it defines.

The long-record scripts take every place-specific value from here: the frozen geometry and its checksum, the metric
analysis CRS and grid, the strata layers, the DEM, the rainfall window and the recipe windows. Paths in the file are
relative to the repository root.
"""
import hashlib
import json
import os

import numpy as np
import rasterio
import rasterio.features
from affine import Affine
from pyproj import Transformer
from rasterio.warp import Resampling, reproject
from shapely.geometry import mapping, shape
from shapely.ops import transform as shp_transform


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def load(path, repo_root):
    cfg = json.load(open(path))
    cfg["_path"] = os.path.abspath(path)
    cfg["_sha256"] = sha256(path)
    cfg["_repo"] = os.path.abspath(repo_root)
    geo = os.path.join(cfg["_repo"], cfg["geometry"]["path"])
    got = sha256(geo)
    if got != cfg["geometry"]["sha256"]:
        raise SystemExit(f"geometry checksum {got} does not match the place configuration")
    if "strata" in cfg and cfg["strata"].get("sha256"):  # a configuration that does not pin the strata yet is the one that builds them
        sp = strata_path(cfg)
        got = sha256(sp)
        if got != cfg["strata"]["sha256"]:
            raise SystemExit(f"strata checksum {got} does not match the place configuration")
    return cfg


def geometry_path(cfg):
    return os.path.join(cfg["_repo"], cfg["geometry"]["path"])


def strata_path(cfg):
    return os.path.join(cfg["_repo"], "data/bundles", cfg["strata"]["bundle"], cfg["strata"]["asset"])


def geometry(cfg):
    return shape(json.load(open(geometry_path(cfg)))["features"][0]["geometry"])


def geometry_projected(cfg):
    to = Transformer.from_crs("EPSG:4326", cfg["analysisCrs"], always_xy=True).transform
    return shp_transform(to, geometry(cfg))


def analysis_grid(cfg):
    """Grid aligned to twice the cell size around the projected geometry; mask = cell centres inside the geometry."""
    g = cfg["analysisGridM"]
    gu = geometry_projected(cfg)
    x0, y0, x1, y1 = gu.bounds
    x0, y0 = np.floor(x0 / (2 * g)) * 2 * g, np.floor(y0 / (2 * g)) * 2 * g
    x1, y1 = np.ceil(x1 / (2 * g)) * 2 * g, np.ceil(y1 / (2 * g)) * 2 * g
    tr = Affine(g, 0, x0, 0, -g, y1)
    shp = (int(round((y1 - y0) / g)), int(round((x1 - x0) / g)))
    mask = rasterio.features.rasterize([(mapping(gu), 1)], out_shape=shp, transform=tr, fill=0, dtype="uint8").astype(bool)
    return tr, shp, mask


def strata(cfg):
    """Strata layers on the analysis grid: {layer name: uint8 array}, the excluded flag, and the bundle's parameters."""
    tr, shp, mask = analysis_grid(cfg)
    with rasterio.open(strata_path(cfg)) as s:
        if (s.height, s.width) != shp or not s.transform.almost_equals(tr) or s.crs.to_string() != cfg["analysisCrs"]:
            raise SystemExit("the strata layer is not on the analysis grid of this place configuration")
        layers = {lay["name"]: s.read(lay["band"]) for lay in cfg["strata"]["layers"]}
        excluded = s.read(cfg["strata"]["excludedBand"]) if cfg["strata"].get("excludedBand") else None
    col = json.load(open(os.path.join(cfg["_repo"], "data/bundles", cfg["strata"]["bundle"], "collection.json")))
    return layers, excluded, col["siterra:method"]["parameters"], col


def stratum_masks(cfg, names):
    """Boolean masks on the analysis grid for 'catchment' and every class of the named strata layers, in config order."""
    tr, shp, mask = analysis_grid(cfg)
    out = {}
    if "catchment" in names:
        out["catchment"] = mask
    need = [n for n in names if n != "catchment"]
    if need:
        layers, _, params, _ = strata(cfg)
        for lay in cfg["strata"]["layers"]:
            if lay["name"] not in need:
                continue
            arr = layers[lay["name"]]
            for k, sid in lay["classes"].items():
                out[sid] = mask & (arr == int(k))
    return out


def stratum_labels(cfg):
    """Human labels for the stratum IDs; elevation labels come from the strata bundle's boundaries."""
    labels = {"catchment": cfg["title"]}
    if "strata" not in cfg:
        return labels
    _, _, params, _ = strata(cfg)
    for lay in cfg["strata"]["layers"]:
        if "labels" in lay:
            for k, sid in lay["classes"].items():
                labels[sid] = lay["labels"][k]
        elif lay.get("labelsFromBundleParameter"):
            b = params[lay["labelsFromBundleParameter"]]
            ks = sorted(lay["classes"], key=int)
            for i, k in enumerate(ks):
                sid = lay["classes"][k]
                if i == 0:
                    labels[sid] = f"below {b[0]:.0f} m"
                elif i == len(ks) - 1:
                    labels[sid] = f"{b[-1]:.0f} m and above"
                else:
                    labels[sid] = f"{b[i - 1]:.0f} to {b[i]:.0f} m"
    return labels


def elevation(cfg, dem_path):
    """DEM resampled once to the configured DEM grid in the analysis CRS (bilinear), repeated onto the analysis grid.

    Same operations as dem-strata.py: the coarse grid shares the analysis grid's origin."""
    if sha256(dem_path) != cfg["elevation"]["sha256"]:
        raise SystemExit("DEM checksum does not match the place configuration")
    tr, shp, mask = analysis_grid(cfg)
    k = int(round(cfg["elevation"]["gridM"] / cfg["analysisGridM"]))
    G = cfg["elevation"]["gridM"]
    Hc, Wc = -(-shp[0] // k), -(-shp[1] // k)
    zc = np.full((Hc + 2, Wc + 2), np.nan, np.float32)
    trc = Affine(G, 0, tr.c - G, 0, -G, tr.f + G)
    with rasterio.open(dem_path) as src:
        reproject(rasterio.band(src, 1), zc, src_transform=src.transform, src_crs=src.crs, dst_transform=trc,
                  dst_crs=cfg["analysisCrs"], resampling=Resampling[cfg["elevation"]["resampling"]], dst_nodata=np.nan)
    z = zc[1:-1, 1:-1]
    Z = np.repeat(np.repeat(z, k, axis=0), k, axis=1)[: shp[0], : shp[1]]
    return np.where(mask, Z, np.nan).astype(np.float32)


def check_dem(cfg, dem_path):
    """Stop unless the DEM file is the one the place configuration pins by checksum."""
    if sha256(dem_path) != cfg["elevation"]["sha256"]:
        raise SystemExit("DEM checksum does not match the place configuration")


def elevation_grid(cfg, dem_path, pad_cells=0):
    """The configured DEM grid in the analysis CRS with pad_cells extra cells on every side and no catchment mask:
    (z, x0, y0, res), z float32 with row 0 north and cell centres half a cell inside the corner (x0, y0).

    The grid and resampling of elevation(), which repeats this grid onto the analysis grid; the caller checks the DEM
    checksum with check_dem()."""
    tr, shp, mask = analysis_grid(cfg)
    k = int(round(cfg["elevation"]["gridM"] / cfg["analysisGridM"]))
    G = cfg["elevation"]["gridM"]
    Hc, Wc = -(-shp[0] // k), -(-shp[1] // k)
    z = np.full((Hc + 2 * pad_cells, Wc + 2 * pad_cells), np.nan, np.float32)
    x0, y0 = tr.c - pad_cells * G, tr.f + pad_cells * G
    with rasterio.open(dem_path) as src:
        reproject(rasterio.band(src, 1), z, src_transform=src.transform, src_crs=src.crs,
                  dst_transform=Affine(G, 0, x0, 0, -G, y0), dst_crs=cfg["analysisCrs"],
                  resampling=Resampling[cfg["elevation"]["resampling"]], dst_nodata=np.nan)
    return z, x0, y0, G


def elevation_band_masks(cfg, elev, band_sets):
    """{set id: [(band id, label, mask)]} from fixed edges (edgesM) or from a strata layer (fromStrataLayer)."""
    tr, shp, mask = analysis_grid(cfg)
    out = {}
    for bs in band_sets:
        bands = []
        if "edgesM" in bs:
            bounds = [None] + bs["edgesM"] + [None]
            for lo, hi in zip(bounds[:-1], bounds[1:]):
                m = mask & ~np.isnan(elev)
                if lo is not None:
                    m &= elev >= lo
                if hi is not None:
                    m &= elev < hi
                bid = f"elev_{'below' if lo is None else int(lo)}_{'up' if hi is None else int(hi)}"
                label = f"below {hi} m" if lo is None else (f"{lo} m and above" if hi is None else f"{lo} to {hi} m")
                bands.append((bid, label, m))
        else:
            labels = stratum_labels(cfg)
            layer = next(l for l in cfg["strata"]["layers"] if l["name"] == bs["fromStrataLayer"])
            masks = stratum_masks(cfg, [layer["name"]])
            for k in sorted(layer["classes"], key=int):
                sid = layer["classes"][k]
                bands.append((sid, labels[sid], masks[sid]))
        out[bs["id"]] = bands
    return out


def band_set(cfg, ref):
    """The elevation band set named by {"recipe": ..., "id": ...} in the place configuration."""
    return next(b for b in cfg["recipes"][ref["recipe"]]["elevationBandSets"] if b["id"] == ref["id"])


def land_cover(cfg):
    """The land cover layer on the analysis grid (uint8 class codes), checked against the configured checksum."""
    lc = cfg["landCover"]
    path = os.path.join(cfg["_repo"], lc["path"])
    if sha256(path) != lc["sha256"]:
        raise SystemExit("land cover checksum does not match the place configuration")
    tr, shp, mask = analysis_grid(cfg)
    with rasterio.open(path) as s:
        if (s.height, s.width) != shp or not s.transform.almost_equals(tr) or s.crs.to_string() != cfg["analysisCrs"]:
            raise SystemExit("the land cover layer is not on the analysis grid of this place configuration")
        return s.read(1)


def land_cover_masks(cfg):
    """{group id: (label, mask)} for the land cover groups of the configuration, inside the geometry."""
    _, _, mask = analysis_grid(cfg)
    lc = land_cover(cfg)
    return {g["id"]: (g["label"], mask & np.isin(lc, g["classes"])) for g in cfg["landCover"]["groups"]}


def cell_pixel_index(cfg, dst_crs, dst_transform, dst_shape):
    """Rows, columns and centre coordinates (analysis CRS) of every analysis cell inside the geometry, and the flat index
    of the destination grid cell that holds each centre."""
    tr, shp, base = analysis_grid(cfg)
    rows, cols = np.nonzero(base)
    xs = tr.c + (cols + 0.5) * tr.a
    ys = tr.f + (rows + 0.5) * tr.e
    to = Transformer.from_crs(cfg["analysisCrs"], dst_crs, always_xy=True).transform
    X, Y = to(xs, ys)
    inv = ~dst_transform
    c, r = inv * (np.asarray(X), np.asarray(Y))
    r = np.floor(r).astype(np.int64)
    c = np.floor(c).astype(np.int64)
    ok = (r >= 0) & (r < dst_shape[0]) & (c >= 0) & (c < dst_shape[1])
    if not ok.all():
        raise SystemExit("the destination window does not cover the analysis geometry")
    return rows, cols, xs, ys, r * dst_shape[1] + c


def pixel_weights(cfg, masks, dst_crs, dst_transform, dst_shape):
    """For each mask, the count of analysis cells whose centre falls in each cell of a destination grid.

    Returns {mask id: float64 array of dst_shape}. Counts are area weights: every analysis cell has the same area."""
    rows, cols, _, _, flat = cell_pixel_index(cfg, dst_crs, dst_transform, dst_shape)
    out = {}
    for sid, m in masks.items():
        sel = m[rows, cols]
        out[sid] = np.bincount(flat[sel], minlength=dst_shape[0] * dst_shape[1]).reshape(dst_shape).astype(np.float64)
    return out


def localize(cfg, reg):
    """The registry entry with the place's own wording: {analysisCrs} in the formula, the limitations and the parameters is the place's CRS, a
    `formulaText` map in the recipe's block (list index to text) replaces those formula lines, and a `limitations` list in the block
    replaces the registry's. A place states its own where the registry's would name another place."""
    rc = cfg["recipes"].get(reg["recipeId"], {})
    sub = lambda t: t.replace("{analysisCrs}", cfg["analysisCrs"])
    out = dict(reg)
    out["formula"] = [sub(rc.get("formulaText", {}).get(str(i), t)) for i, t in enumerate(reg["formula"])]
    out["standardLimitations"] = [sub(t) for t in rc.get("limitations", reg["standardLimitations"])]
    out["parameters"] = [{**p, "default": sub(p["default"]) if isinstance(p["default"], str) else p["default"],
                          "allowed": [sub(v) if isinstance(v, str) else v for v in p["allowed"]]} for p in reg["parameters"]]
    return out


if __name__ == "__main__":
    import unittest

    class PlaceConfigTests(unittest.TestCase):
        @classmethod
        def setUpClass(cls):
            repo = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
            place = os.path.join(repo, "science", "places", "ait-bouguemez.json")
            cls.cfg = load(place, repo)
            cls.tr, cls.shp, cls.mask = analysis_grid(cls.cfg)

        def test_cell_pixel_index_identity_grid(self):
            rows, cols, xs, ys, flat = cell_pixel_index(self.cfg, self.cfg["analysisCrs"], self.tr, self.shp)
            exp_r, exp_c = np.nonzero(self.mask)
            np.testing.assert_array_equal(rows, exp_r)
            np.testing.assert_array_equal(cols, exp_c)
            np.testing.assert_array_equal(flat, exp_r * self.shp[1] + exp_c)
            np.testing.assert_allclose(xs, self.tr.c + (exp_c + 0.5) * self.tr.a)
            np.testing.assert_allclose(ys, self.tr.f + (exp_r + 0.5) * self.tr.e)
            w = pixel_weights(self.cfg, {"catchment": self.mask}, self.cfg["analysisCrs"], self.tr, self.shp)
            np.testing.assert_array_equal(w["catchment"], self.mask.astype(np.float64))

        def test_cell_pixel_index_coarse_30m_and_strata_conservation(self):
            k = 3
            hc, wc = -(-self.shp[0] // k), -(-self.shp[1] // k)
            tr30 = Affine(self.tr.a * k, 0, self.tr.c, 0, self.tr.e * k, self.tr.f)
            rows, cols, _, _, flat = cell_pixel_index(self.cfg, self.cfg["analysisCrs"], tr30, (hc, wc))
            np.testing.assert_array_equal(flat, (rows // k) * wc + (cols // k))
            masks = stratum_masks(self.cfg, ["catchment", "elevation_band", "aspect_class"])
            w = pixel_weights(self.cfg, masks, self.cfg["analysisCrs"], tr30, (hc, wc))
            self.assertEqual(int(w["catchment"].sum()), int(self.mask.sum()))
            np.testing.assert_array_equal(
                w["elevation_low"] + w["elevation_mid"] + w["elevation_high"],
                w["catchment"],
            )
            np.testing.assert_array_equal(
                w["aspect_north"] + w["aspect_east"] + w["aspect_south"] + w["aspect_west"] + w["aspect_level"],
                w["catchment"],
            )

        def test_cell_pixel_index_geographic_bounds_and_out_of_bounds_rejection(self):
            g = geometry(self.cfg)
            lon0, lat0, lon1, lat1 = g.bounds
            cell_deg = 0.05
            w0 = np.floor(lon0 / cell_deg) * cell_deg
            n0 = np.ceil(lat1 / cell_deg) * cell_deg
            cols_deg = int(np.ceil((lon1 - w0) / cell_deg)) + 1
            rows_deg = int(np.ceil((n0 - lat0) / cell_deg)) + 1
            tr_deg = Affine(cell_deg, 0, w0, 0, -cell_deg, n0)
            _, _, _, _, flat = cell_pixel_index(self.cfg, "EPSG:4326", tr_deg, (rows_deg, cols_deg))
            self.assertTrue(((flat >= 0) & (flat < rows_deg * cols_deg)).all())
            with self.assertRaises(SystemExit):
                cell_pixel_index(self.cfg, "EPSG:4326", tr_deg, (1, 1))
            shifted = Affine(cell_deg, 0, w0 + 10.0, 0, -cell_deg, n0)
            with self.assertRaises(SystemExit):
                cell_pixel_index(self.cfg, "EPSG:4326", shifted, (rows_deg, cols_deg))

    class ElevationGridTests(unittest.TestCase):
        @classmethod
        def setUpClass(cls):
            repo = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
            cls.cfg = load(os.path.join(repo, "science", "places", "ait-bouguemez.json"), repo)

        def test_grid_follows_the_surface_of_a_synthetic_tile(self):
            import tempfile
            from rasterio.transform import from_origin
            lon0, lat1, w, h = -6.60, 31.80, 1800, 1260  # a tile of 1/3600 degree cells over the catchment and its margin
            lon = lon0 + (np.arange(w) + 0.5) / 3600
            lat = lat1 - (np.arange(h) + 0.5) / 3600
            plane = lambda x, y: 2000 + 4000 * (x + 6.3) + 3000 * (y - 31.6)
            tile = plane(lon[None, :], lat[:, None]).astype(np.float32)
            with tempfile.TemporaryDirectory() as d:
                path = os.path.join(d, "tile.tif")
                with rasterio.open(path, "w", driver="GTiff", width=w, height=h, count=1, dtype="float32",
                                   crs="EPSG:4326", transform=from_origin(lon0, lat1, 1 / 3600, 1 / 3600)) as dst:
                    dst.write(tile, 1)
                z, x0, y0, res = elevation_grid(self.cfg, path, pad_cells=2)
            self.assertEqual(res, self.cfg["elevation"]["gridM"])
            tr, shp, _ = analysis_grid(self.cfg)
            k = int(round(res / self.cfg["analysisGridM"]))
            self.assertEqual(z.shape, (-(-shp[0] // k) + 4, -(-shp[1] // k) + 4))
            self.assertFalse(np.isnan(z).any())
            rows, cols = np.meshgrid(np.arange(0, z.shape[0], 40), np.arange(0, z.shape[1], 40), indexing="ij")
            to_ll = Transformer.from_crs(self.cfg["analysisCrs"], "EPSG:4326", always_xy=True)
            x, y = to_ll.transform(x0 + (cols + 0.5) * res, y0 - (rows + 0.5) * res)
            # GDAL's warp places output cells with an approximate transformer (up to 0.125 output cell), which on this
            # plane (about 0.03 to 0.04 m of height per metre) is worth up to 0.15 m
            np.testing.assert_allclose(z[rows, cols], plane(np.asarray(x), np.asarray(y)), atol=0.2)

        @unittest.skipUnless(os.environ.get("SITERRA_DEM"), "set SITERRA_DEM to the pinned Copernicus DEM tile")
        def test_one_cell_of_padding_is_the_grid_elevation_repeats_and_more_padding_moves_values_by_decimetres(self):
            dem = os.environ["SITERRA_DEM"]
            check_dem(self.cfg, dem)
            z1 = elevation_grid(self.cfg, dem, 1)[0]
            tr, shp, mask = analysis_grid(self.cfg)
            k = int(round(self.cfg["elevation"]["gridM"] / self.cfg["analysisGridM"]))
            Z = np.repeat(np.repeat(z1[1:-1, 1:-1], k, axis=0), k, axis=1)[: shp[0], : shp[1]]
            np.testing.assert_array_equal(np.where(mask, Z, np.nan).astype(np.float32), elevation(self.cfg, dem))
            z2 = elevation_grid(self.cfg, dem, 2)[0]
            self.assertLess(float(np.abs(z2[2:-2, 2:-2] - z1[1:-1, 1:-1]).max()), 0.2)

    suite = unittest.TestSuite([unittest.defaultTestLoader.loadTestsFromTestCase(PlaceConfigTests),
                                unittest.defaultTestLoader.loadTestsFromTestCase(ElevationGridTests)])
    res = unittest.TextTestRunner(verbosity=2).run(suite)
    if not res.wasSuccessful():
        raise SystemExit(1)
    print("place_config self-check passed")
