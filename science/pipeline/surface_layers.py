"""Pure functions of the terrain_relief and land_cover_classes recipes: which 30 m cells a relief layer keeps, and the class table of a
land cover layer. numpy only; run this file to run its tests."""
import numpy as np


def parent_cells(mask10, k, pad_cells):
    """Boolean grid of the coarse cells (k x k fine cells each, plus pad_cells of margin on every side) that hold at least one True fine cell."""
    h, w = mask10.shape
    hc, wc = -(-h // k), -(-w // k)
    full = np.zeros((hc * k, wc * k), bool)
    full[:h, :w] = mask10
    inside = full.reshape(hc, k, wc, k).any(axis=(1, 3))
    out = np.zeros((hc + 2 * pad_cells, wc + 2 * pad_cells), bool)
    out[pad_cells:pad_cells + hc, pad_cells:pad_cells + wc] = inside
    return out


def dilate(mask, cells=1):
    """The mask grown by `cells` cells in every direction, diagonals included."""
    out = mask.copy()
    for _ in range(cells):
        g = np.pad(out, 1)
        grown = np.zeros_like(out)
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                grown |= g[1 + dy:1 + dy + out.shape[0], 1 + dx:1 + dx + out.shape[1]]
        out = grown
    return out


def class_table(lc, mask, names, cell_m2):
    """Rows (code, name, cells, area_km2, share) of the classes inside the mask, in code order, and the counts of codes without a name.

    Shares are of the cells inside the mask, to 4 decimals; areas are cells times cell_m2."""
    inside = lc[mask]
    codes, counts = np.unique(inside, return_counts=True)
    total = int(mask.sum())
    rows, unknown = [], {}
    for c, n in zip(codes.tolist(), counts.tolist()):
        if str(c) not in names:
            unknown[c] = n
            continue
        rows.append({"code": c, "name": names[str(c)], "cells": n, "area_km2": round(n * cell_m2 / 1e6, 3), "share": round(n / total, 4)})
    return rows, unknown


if __name__ == "__main__":
    import unittest

    class ReliefTests(unittest.TestCase):
        def test_parent_cells_hold_any_fine_cell_and_carry_the_margin(self):
            m = np.zeros((7, 7), bool)
            m[3, 3] = True  # the middle fine cell lies in coarse cell (1, 1) of a 3 x 3 coarse grid
            p = parent_cells(m, 3, 1)
            self.assertEqual(p.shape, (5, 5))
            self.assertEqual(np.argwhere(p).tolist(), [[2, 2]])

        def test_dilate_grows_one_cell_in_every_direction_and_stays_in_the_grid(self):
            m = np.zeros((5, 5), bool)
            m[0, 0] = True
            d = dilate(m)
            self.assertEqual(np.argwhere(d).tolist(), [[0, 0], [0, 1], [1, 0], [1, 1]])
            m = np.zeros((5, 5), bool)
            m[2, 2] = True
            self.assertEqual(int(dilate(m).sum()), 9)

    class ClassTableTests(unittest.TestCase):
        def test_counts_shares_and_areas_cover_the_inside_cells_only(self):
            lc = np.array([[10, 10, 40, 0], [10, 30, 30, 0]], np.uint8)
            mask = np.array([[1, 1, 1, 0], [1, 1, 1, 0]], bool)
            rows, unknown = class_table(lc, mask, {"10": "tree cover", "30": "grassland", "40": "cropland"}, 100.0)
            self.assertEqual([r["code"] for r in rows], [10, 30, 40])
            self.assertEqual([r["cells"] for r in rows], [3, 2, 1])
            self.assertEqual(rows[0]["share"], 0.5)
            self.assertEqual(rows[2]["area_km2"], 0.0)
            self.assertEqual(unknown, {})

        def test_a_code_without_a_name_is_reported_not_dropped_silently(self):
            lc = np.array([[10, 70]], np.uint8)
            rows, unknown = class_table(lc, np.ones((1, 2), bool), {"10": "tree cover"}, 100.0)
            self.assertEqual(len(rows), 1)
            self.assertEqual(unknown, {70: 1})

    unittest.main(verbosity=2)
