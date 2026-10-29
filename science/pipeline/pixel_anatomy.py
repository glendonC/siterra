"""One MODIS pixel opened into its 10 m cells: pixel ids, the footprint on the analysis grid, scene choice, class spectra,
the mix model and the candidate rule.

The functions of recipe pixel_anatomy 1.0.0 (science/recipes/registry.json). They hold no place-specific value and import
only numpy and pyproj. Run `python -I pixel_anatomy.py` to run the tests.
"""
import re

import numpy as np
from pyproj import Transformer

# MODIS land tile grid (sinusoidal): the tile size in metres, the upper left corner of tile h00v00 and the pixels of a
# 250 m tile edge (NASA LP DAAC, MODIS Sinusoidal Tile Grid)
MODIS_TILE_M = 1111950.5196666666
MODIS_X0, MODIS_Y0 = -20015109.354, 10007554.677
MODIS_TILE_PX = 4800
PX_M = MODIS_TILE_M / MODIS_TILE_PX
BANDS = ["B02", "B03", "B04", "B05", "B06", "B07", "B08", "B8A", "B11", "B12"]
TEN_M = ("B02", "B03", "B04", "B08")
ID_PATTERN = re.compile(r"^h(\d{2})v(\d{2})r(\d{1,4})c(\d{1,4})$")


def pixel_id(h, v, row, col):
    return f"h{h:02d}v{v:02d}r{row}c{col}"


def parse_pixel_id(s):
    m = ID_PATTERN.match(s)
    if not m:
        raise SystemExit(f"{s!r} is not a pixel id like h17v05r4005c2178")
    return tuple(int(g) for g in m.groups())


def tile_centre(h, v, row, col):
    """Sinusoidal coordinates of a tile pixel's centre."""
    return (MODIS_X0 + h * MODIS_TILE_M + (col + 0.5) * PX_M, MODIS_Y0 - v * MODIS_TILE_M - (row + 0.5) * PX_M)


def tile_of(x, y):
    """(h, v, row, col) of the tile pixel that holds the sinusoidal point."""
    h = int(np.floor((x - MODIS_X0) / MODIS_TILE_M))
    v = int(np.floor((MODIS_Y0 - y) / MODIS_TILE_M))
    col = int(np.floor((x - (MODIS_X0 + h * MODIS_TILE_M)) / PX_M))
    row = int(np.floor(((MODIS_Y0 - v * MODIS_TILE_M) - y) / PX_M))
    return h, v, row, col


def lattice_offset(mtr):
    """How far a grid's origin lies from the tile lattice, in pixels (0, 0 when it sits on it)."""
    return ((mtr.c - MODIS_X0) / PX_M) % 1.0, ((MODIS_Y0 - mtr.f) / PX_M) % 1.0


def bundle_index(mtr, h, v, row, col):
    """(row, column) in a grid with transform mtr (on the lattice) of the tile pixel."""
    x, y = tile_centre(h, v, row, col)
    c, r = ~mtr * (x, y)
    return int(np.floor(r)), int(np.floor(c))


def footprint_corners(mtr, brow, bcol):
    return [mtr * (bcol + dx, brow + dy) for dx, dy in ((0, 0), (1, 0), (1, 1), (0, 1))]


def cells_in_footprint(atr, ashape, mtr, mcrs, acrs, brow, bcol, margin_cells=60):
    """Rows and columns of the analysis cells whose centres lie in the footprint of bundle pixel (brow, bcol), searched in the
    part of the analysis grid within margin_cells of the pixel's corners: (rows, cols)."""
    to_a = Transformer.from_crs(mcrs, acrs, always_xy=True)
    xs, ys = zip(*[to_a.transform(x, y) for x, y in footprint_corners(mtr, brow, bcol)])
    c0 = max(int(np.floor((min(xs) - atr.c) / atr.a)) - margin_cells, 0)
    c1 = min(int(np.ceil((max(xs) - atr.c) / atr.a)) + margin_cells, ashape[1])
    r0 = max(int(np.floor((atr.f - max(ys)) / -atr.e)) - margin_cells, 0)
    r1 = min(int(np.ceil((atr.f - min(ys)) / -atr.e)) + margin_cells, ashape[0])
    rr, cc = np.mgrid[r0:r1, c0:c1]
    x = atr.c + (cc + 0.5) * atr.a
    y = atr.f + (rr + 0.5) * atr.e
    X, Y = Transformer.from_crs(acrs, mcrs, always_xy=True).transform(x.ravel(), y.ravel())
    mc, mr = ~mtr * (np.asarray(X), np.asarray(Y))
    sel = (np.floor(mr).astype(int) == brow) & (np.floor(mc).astype(int) == bcol)
    return rr.ravel()[sel], cc.ravel()[sel]


def footprint_counts(atr, ashape, mtr, mcrs, acrs, mshape, chunk_rows=250):
    """For every pixel of the grid (flat index), the number of analysis cells, inside the catchment or not, whose centres lie
    in it; cells beyond the grid are not counted."""
    tf = Transformer.from_crs(acrs, mcrs, always_xy=True)
    inv = ~mtr
    out = np.zeros(mshape[0] * mshape[1], np.int64)
    for r0 in range(0, ashape[0], chunk_rows):
        rr, cc = np.mgrid[r0:min(r0 + chunk_rows, ashape[0]), 0:ashape[1]]
        X, Y = tf.transform((atr.c + (cc + 0.5) * atr.a).ravel(), (atr.f + (rr + 0.5) * atr.e).ravel())
        mc, mr = inv * (np.asarray(X), np.asarray(Y))
        mr, mc = np.floor(mr).astype(np.int64), np.floor(mc).astype(np.int64)
        ok = (mr >= 0) & (mr < mshape[0]) & (mc >= 0) & (mc < mshape[1])
        out += np.bincount(mr[ok] * mshape[1] + mc[ok], minlength=out.size)
    return out


def display_window(rows, cols, margin):
    """(r0, r1, c0, c1): the bounding box of the cells plus `margin` cells, widened so that its edges lie on even rows and
    columns (20 m edges on a 10 m grid)."""
    r0, r1 = int(rows.min()) - margin, int(rows.max()) + 1 + margin
    c0, c1 = int(cols.min()) - margin, int(cols.max()) + 1 + margin
    r0 -= r0 % 2
    c0 -= c0 % 2
    r1 += (r1 - r0) % 2
    c1 += (c1 - c0) % 2
    return r0, r1, c0, c1


def choose_scene(candidates, orbit):
    """The scene on `orbit` with data over every footprint cell and the largest share of footprint cells with SCL 4 or 5,
    ties by the latest date. candidates: dicts with id, date, orbit, cells_with_data, cells, clear_share."""
    ok = [c for c in candidates if c["orbit"] == orbit and c["cells_with_data"] == c["cells"]]
    if not ok:
        raise SystemExit(f"no scene on orbit {orbit} has data over every footprint cell")
    best = max(c["clear_share"] for c in ok)
    return max((c for c in ok if c["clear_share"] == best), key=lambda c: (c["date"], c["id"]))


def kept_mask(dn, scl, kept=(4, 5)):
    """Cells whose SCL is in `kept` and whose DN is above zero in every band."""
    return np.all([d > 0 for d in dn.values()], axis=0) & np.isin(scl, kept)


def ndvi(nir, red):
    return (nir - red) / (nir + red)


def class_stats(refl, sel, bands=BANDS):
    """Median and quartiles of the reflectance of the selected cells in each band, and their number."""
    out = {"cells_kept": int(sel.sum()), "median": {}, "q25": {}, "q75": {}}
    for b in bands:
        v = refl[b][sel]
        out["median"][b] = float(np.median(v))
        out["q25"][b] = float(np.percentile(v, 25))
        out["q75"][b] = float(np.percentile(v, 75))
    return out


def mix(shares, medians):
    """Mixed reflectance per band, sum over classes of share times class median, and its NDVI; shares and medians are
    dicts by class code."""
    bands = next(iter(medians.values())).keys()
    r = {b: float(sum(shares[k] * medians[k][b] for k in shares)) for b in bands}
    return r, float(ndvi(r["B08"], r["B04"]))


def shifted_shares(shares, frm, to, points):
    """Move `points` percentage points of the footprint from class frm to class to (at most what frm holds)."""
    moved = min(points / 100.0, shares[frm])
    out = dict(shares)
    out[frm] = shares[frm] - moved
    out[to] = shares.get(to, 0.0) + moved
    return out


def is_candidate(t, rule):
    """Whether a pixel table row meets the candidate rule of the place configuration."""
    s = t["wc_shares"]
    return bool(t["direction"] == rule["direction"] and t["lower_per_decade"] > 0 and (t["fully_inside"] or not rule["fullyInsideCatchment"])
                and rule["treeCoverPlusCropland"][0] <= s["10"] + s["40"] <= rule["treeCoverPlusCropland"][1]
                and s["20"] + s["30"] + s["60"] >= rule["grasslandShrublandBareOrSparseMin"]
                and s["50"] <= rule["builtUpMax"] and t["sloping_share"] >= rule["slopingCellsMin"])


def rank_candidates(table, rule):
    """Candidate rows ranked by the lower bound of the Sen interval, highest first (ties by row and column)."""
    return sorted((t for t in table if is_candidate(t, rule)), key=lambda t: (-t["lower_per_decade"], t["row"], t["col"]))


if __name__ == "__main__":
    import json
    import os
    import unittest

    class IdTests(unittest.TestCase):
        def test_ids_round_trip_and_bad_ids_stop(self):
            self.assertEqual(parse_pixel_id("h17v05r4005c2178"), (17, 5, 4005, 2178))
            self.assertEqual(pixel_id(17, 5, 4005, 2178), "h17v05r4005c2178")
            with self.assertRaises(SystemExit):
                parse_pixel_id("17,5,4005,2178")

        def test_a_tile_pixel_centre_maps_back_to_its_own_pixel(self):
            for args in ((17, 5, 4005, 2178), (0, 0, 0, 0), (35, 17, 4799, 4799), (18, 4, 1, 4798)):
                x, y = tile_centre(*args)
                self.assertEqual(tile_of(x, y), args)

        def test_the_pixel_trend_grid_sits_on_the_lattice_and_names_the_specimen_pixel(self):
            import rasterio
            repo = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
            with rasterio.open(os.path.join(repo, "data/bundles/bundle_pixel_trend_long_record_ait_bouguemez/pixel-trend-mar_jun.tif")) as t:
                mtr = t.transform
            ox, oy = lattice_offset(mtr)
            self.assertLess(min(ox, 1 - ox), 1e-3)
            self.assertLess(min(oy, 1 - oy), 1e-3)
            self.assertEqual(bundle_index(mtr, 17, 5, 4005, 2178), (51, 58))
            x, y = mtr * (58.5, 51.5)
            self.assertEqual(tile_of(x, y), (17, 5, 4005, 2178))

    class WindowTests(unittest.TestCase):
        def test_the_display_window_has_the_margin_and_even_edges(self):
            rows, cols = np.array([11, 14, 20]), np.array([7, 9, 15])
            r0, r1, c0, c1 = display_window(rows, cols, 1)
            self.assertEqual((r0 % 2, c0 % 2, (r1 - r0) % 2, (c1 - c0) % 2), (0, 0, 0, 0))
            self.assertLessEqual(r0, 10)
            self.assertGreaterEqual(r1, 22)
            self.assertLessEqual(c0, 6)
            self.assertGreaterEqual(c1, 17)

        def test_the_specimen_pixel_holds_537_cells_in_a_28_by_28_display_window(self):
            import rasterio
            repo = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
            b = os.path.join(repo, "data/bundles")
            with rasterio.open(os.path.join(b, "bundle_pixel_trend_long_record_ait_bouguemez/pixel-trend-mar_jun.tif")) as t:
                mtr, mcrs = t.transform, t.crs
            with rasterio.open(os.path.join(b, "bundle_terrain_strata_ait_bouguemez/strata.tif")) as s:
                atr, ashape, acrs = s.transform, (s.height, s.width), s.crs
            rows, cols = cells_in_footprint(atr, ashape, mtr, mcrs, acrs, 51, 58)
            self.assertEqual(len(rows), 537)
            r0, r1, c0, c1 = display_window(rows, cols, 1)
            self.assertEqual((r1 - r0, c1 - c0), (28, 28))
            self.assertEqual((atr.c + c0 * atr.a, atr.f + r0 * atr.e), (744880.0, 3505260.0))

    class CountTests(unittest.TestCase):
        def test_every_coarse_pixel_holds_the_fine_cells_that_fall_in_it(self):
            from affine import Affine
            atr, mtr = Affine(10, 0, 0, 0, -10, 80), Affine(20, 0, 0, 0, -20, 80)
            c = footprint_counts(atr, (8, 8), mtr, "EPSG:32629", "EPSG:32629", (4, 4), chunk_rows=3)
            np.testing.assert_array_equal(c, np.full(16, 4))
            c = footprint_counts(atr, (8, 8), mtr, "EPSG:32629", "EPSG:32629", (2, 3))
            np.testing.assert_array_equal(c, [4, 4, 4, 4, 4, 4])  # cells beyond the 2 x 3 grid are not counted

    class SceneTests(unittest.TestCase):
        c = [{"id": "b", "date": "2025-06-01", "orbit": "R094", "cells": 537, "cells_with_data": 537, "clear_share": 1.0},
             {"id": "a", "date": "2025-06-11", "orbit": "R094", "cells": 537, "cells_with_data": 537, "clear_share": 1.0},
             {"id": "c", "date": "2025-06-24", "orbit": "R137", "cells": 537, "cells_with_data": 537, "clear_share": 1.0},
             {"id": "d", "date": "2025-06-18", "orbit": "R094", "cells": 537, "cells_with_data": 537, "clear_share": 0.924},
             {"id": "e", "date": "2025-06-26", "orbit": "R094", "cells": 537, "cells_with_data": 0, "clear_share": 0.0}]

        def test_the_latest_of_the_fully_clear_scenes_on_the_orbit_is_chosen(self):
            self.assertEqual(choose_scene(self.c, "R094")["id"], "a")  # 06-11, although "b" sorts later by id

        def test_a_scene_without_data_over_every_cell_is_not_a_candidate(self):
            c = [dict(x) for x in self.c]
            c.append({"id": "p", "date": "2025-06-30", "orbit": "R094", "cells": 537, "cells_with_data": 400, "clear_share": 1.0})
            self.assertEqual(choose_scene(c, "R094")["id"], "a")

        def test_a_larger_share_beats_a_later_date(self):
            c = [dict(x) for x in self.c]
            c[0]["clear_share"], c[1]["clear_share"], c[3]["clear_share"] = 0.99, 1.0, 0.99
            self.assertEqual(choose_scene(c, "R094")["id"], "a")  # only "a" (06-11) is fully clear, though "d" is later
            c[1]["clear_share"] = 0.99
            self.assertEqual(choose_scene(c, "R094")["id"], "d")  # all three at 0.99: the latest date

        def test_no_scene_with_data_stops(self):
            with self.assertRaises(SystemExit):
                choose_scene(self.c, "R999")

    class SpectraTests(unittest.TestCase):
        def test_kept_cells_need_scl_4_or_5_and_data_in_every_band(self):
            dn = {"B04": np.array([[100, 0, 100, 100]]), "B08": np.array([[200, 200, 200, 200]])}
            scl = np.array([[4, 4, 5, 9]])
            np.testing.assert_array_equal(kept_mask(dn, scl), [[True, False, True, False]])

        def test_class_statistics_are_median_and_quartiles_of_the_selected_cells(self):
            refl = {b: np.array([0.1, 0.2, 0.3, 0.4, 0.9]) for b in BANDS}
            s = class_stats(refl, np.array([True, True, True, True, False]))
            self.assertEqual(s["cells_kept"], 4)
            self.assertAlmostEqual(s["median"]["B04"], 0.25)
            self.assertAlmostEqual(s["q25"]["B04"], 0.175)
            self.assertAlmostEqual(s["q75"]["B04"], 0.325)

        def test_the_mix_is_the_share_weighted_sum_and_ndvi_follows(self):
            med = {10: {"B04": 0.04, "B08": 0.36}, 30: {"B04": 0.20, "B08": 0.28}}
            r, n = mix({10: 0.25, 30: 0.75}, med)
            self.assertAlmostEqual(r["B04"], 0.25 * 0.04 + 0.75 * 0.20)
            self.assertAlmostEqual(r["B08"], 0.25 * 0.36 + 0.75 * 0.28)
            self.assertAlmostEqual(n, (r["B08"] - r["B04"]) / (r["B08"] + r["B04"]))

        def test_a_shift_moves_points_between_classes_and_never_below_zero(self):
            s = shifted_shares({10: 0.4, 30: 0.15, 40: 0.45}, 30, 10, 20)
            self.assertAlmostEqual(sum(s.values()), 1.0)
            self.assertAlmostEqual(s[30], 0.0)
            self.assertAlmostEqual(s[10], 0.55)
            s = shifted_shares({10: 0.4, 30: 0.6}, 30, 10, 20)
            self.assertAlmostEqual(s[30], 0.4)
            self.assertAlmostEqual(s[10], 0.6)

    class CandidateTests(unittest.TestCase):
        rule = {"direction": "upward", "fullyInsideCatchment": True, "treeCoverPlusCropland": [0.25, 0.60],
                "grasslandShrublandBareOrSparseMin": 0.35, "builtUpMax": 0.05, "slopingCellsMin": 0.50}

        def row(self, **kw):
            t = {"row": 1, "col": 1, "direction": "upward", "lower_per_decade": 0.01, "fully_inside": True, "sloping_share": 0.8,
                 "wc_shares": {"10": 0.3, "20": 0.0, "30": 0.5, "40": 0.1, "50": 0.0, "60": 0.1, "80": 0.0}}
            t.update(kw)
            return t

        def test_a_row_meeting_every_condition_is_a_candidate(self):
            self.assertTrue(is_candidate(self.row(), self.rule))

        def test_each_condition_can_exclude_a_row(self):
            for kw in ({"direction": "includes zero"}, {"lower_per_decade": 0.0}, {"fully_inside": False}, {"sloping_share": 0.49},
                       {"wc_shares": {"10": 0.1, "20": 0.0, "30": 0.8, "40": 0.1, "50": 0.0, "60": 0.0, "80": 0.0}},
                       {"wc_shares": {"10": 0.5, "20": 0.0, "30": 0.2, "40": 0.2, "50": 0.0, "60": 0.1, "80": 0.0}},
                       {"wc_shares": {"10": 0.3, "20": 0.0, "30": 0.5, "40": 0.1, "50": 0.06, "60": 0.04, "80": 0.0}}):
                self.assertFalse(is_candidate(self.row(**kw), self.rule), kw)

        def test_values_exactly_on_a_limit_are_inside_it(self):
            rule = dict(self.rule, treeCoverPlusCropland=[0.25, 0.5], grasslandShrublandBareOrSparseMin=0.4375, builtUpMax=0.0625, slopingCellsMin=0.5)
            for tree_crop in (0.25, 0.5):
                wc = {"10": tree_crop, "20": 0.0, "30": 1 - tree_crop - 0.0625, "40": 0.0, "50": 0.0625, "60": 0.0, "80": 0.0}
                self.assertTrue(is_candidate(self.row(wc_shares=wc, sloping_share=0.5), rule), tree_crop)
            wc = {"10": 0.375, "20": 0.0, "30": 0.5, "40": 0.0, "50": 0.125, "60": 0.0, "80": 0.0}
            self.assertFalse(is_candidate(self.row(wc_shares=wc), rule))

        def test_ranking_is_by_lower_bound_then_row_and_column(self):
            rows = [self.row(row=3, col=1, lower_per_decade=0.02), self.row(row=2, col=5, lower_per_decade=0.03),
                    self.row(row=2, col=4, lower_per_decade=0.03), self.row(row=1, col=1, lower_per_decade=0.0)]
            ranked = rank_candidates(rows, self.rule)
            self.assertEqual([(t["row"], t["col"]) for t in ranked], [(2, 4), (2, 5), (3, 1)])

    unittest.main(verbosity=2)
