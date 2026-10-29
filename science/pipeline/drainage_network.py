"""Drainage network geometry from a D8 flow direction grid: topology, upstream area, Strahler order, segments, lines.

The functions of recipe drainage_network 1.0.0 (science/recipes/registry.json). They hold no place-specific value and
import only numpy and pyproj; the conditioning that produces the flow direction grid (pysheds, GPL-3.0-or-later) is a
separate private step and is not part of this package. Run `python -I drainage_network.py` to run the tests.
"""
import math

import numpy as np
from pyproj import Geod

# Direction code -> (row step, column step); north is up, so row numbers grow southwards.
D8 = {64: (-1, 0), 128: (-1, 1), 1: (0, 1), 2: (1, 1), 4: (1, 0), 8: (1, -1), 16: (0, -1), 32: (-1, -1)}


def downstream_index(fdir):
    """Flat index of the cell each cell drains to; -1 where the cell has no direction or its neighbour is off the grid."""
    f = np.asarray(fdir)
    h, w = f.shape
    down = np.full(f.size, -1, np.int64)
    rows, cols = np.indices(f.shape)
    for code, (dr, dc) in D8.items():
        sel = f == code
        r2, c2 = rows[sel] + dr, cols[sel] + dc
        ok = (r2 >= 0) & (r2 < h) & (c2 >= 0) & (c2 < w)
        down[(rows[sel] * w + cols[sel])[ok]] = r2[ok] * w + c2[ok]
    return down


def terminals(down):
    """The cell each cell finally drains to (itself where it has no downstream cell), by pointer doubling, and a mask of
    the cells that lie on a loop or drain into one."""
    n = len(down)
    nxt = np.where(down >= 0, down, np.arange(n))
    for _ in range(max(2, int(math.ceil(math.log2(max(n, 2)))) + 1)):
        nn = nxt[nxt]
        if np.array_equal(nn, nxt):
            break
        nxt = nn
    return nxt, down[nxt] >= 0


def accumulate(down, weights):
    """Sum of the weights of every cell whose D8 path passes through the cell, the cell itself included. Cells that lie on
    a loop never complete; check terminals() first."""
    n = len(down)
    acc = np.asarray(weights, dtype=np.float64).copy()
    indeg = np.bincount(down[down >= 0], minlength=n).astype(np.int64)
    frontier = np.flatnonzero(indeg == 0)
    while frontier.size:
        tgt = down[frontier]
        keep = tgt >= 0
        src, dst = frontier[keep], tgt[keep]
        np.add.at(acc, dst, acc[src])
        np.subtract.at(indeg, dst, 1)
        frontier = np.unique(dst[indeg[dst] == 0])
    return acc


def stream_upstream(down, stream):
    ups = {}
    for k in np.flatnonzero(stream).tolist():
        d = int(down[k])
        if d >= 0 and stream[d]:
            ups.setdefault(d, []).append(k)
    return ups


def strahler(down, stream, acc):
    """Strahler order of every stream cell, as {cell index: order}. Upstream cells are visited first because the weighted
    accumulation grows strictly downstream."""
    ups = stream_upstream(down, stream)
    order = {}
    for k in sorted(np.flatnonzero(stream).tolist(), key=lambda c: (float(acc[c]), c)):
        u = ups.get(k)
        if not u:
            order[k] = 1
        else:
            o = [order[x] for x in u]
            m = max(o)
            order[k] = m + 1 if o.count(m) >= 2 else m
    return order


def segments(down, stream):
    """Segments as lists of cell indices. Each runs down the D8 path from a head (no stream cell upstream) or a confluence
    (two or more stream cells draining into it) to the next confluence, included, or to the outlet, so a segment ends on
    the cell where its downstream segment begins."""
    ups = stream_upstream(down, stream)
    cells = np.flatnonzero(stream).tolist()
    starts = [k for k in cells if k not in ups] + [k for k in cells if len(ups.get(k, ())) >= 2]
    out = []
    for s in starts:
        path = [s]
        k = s
        while down[k] >= 0 and stream[down[k]]:
            k = int(down[k])
            path.append(k)
            if len(ups.get(k, ())) >= 2:
                break
        if len(path) > 1:
            out.append(path)
    return out


def segment_rank(keys):
    """Indices of (upstream area, first cell index) keys in numbering order: decreasing area, ties by first cell."""
    return sorted(range(len(keys)), key=lambda i: (-keys[i][0], keys[i][1]))


def chaikin(pts):
    """One corner-cutting pass; the end points stay."""
    pts = np.asarray(pts, dtype=np.float64)
    if len(pts) < 3:
        return pts
    out = [pts[0]]
    for a, b in zip(pts[:-1], pts[1:]):
        out.append(0.75 * a + 0.25 * b)
        out.append(0.25 * a + 0.75 * b)
    out.append(pts[-1])
    return np.array(out)


def simplify(pts, tol):
    """Douglas-Peucker; a point is dropped when it lies within tol of the line between the points kept around it."""
    pts = np.asarray(pts, dtype=np.float64)
    if len(pts) < 3:
        return pts
    keep = np.zeros(len(pts), bool)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop()
        if b <= a + 1:
            continue
        p, q = pts[a], pts[b]
        d = q - p
        length = math.hypot(*d) or 1e-9
        rel = pts[a + 1:b] - p
        dist = np.abs(rel[:, 0] * d[1] - rel[:, 1] * d[0]) / length
        i = int(np.argmax(dist))
        if dist[i] > tol:
            m = a + 1 + i
            keep[m] = True
            stack.append((a, m))
            stack.append((m, b))
    return pts[keep]


def densify(pts, step):
    """Divide every straight piece into equal parts of at most step."""
    pts = np.asarray(pts, dtype=np.float64)
    out = [pts[0]]
    for a, b in zip(pts[:-1], pts[1:]):
        n = max(1, int(math.ceil(math.hypot(*(b - a)) / step)))
        for i in range(1, n + 1):
            out.append(a + (b - a) * (i / n))
    return np.array(out)


def bilinear(z, x0, y0, res, x, y):
    """Bilinear value of grid z (row 0 north, cell centres half a cell inside the top-left corner x0, y0) at x, y; the
    value of the nearest edge cell outside the grid."""
    h, w = z.shape
    fx = np.clip((np.asarray(x, dtype=np.float64) - x0) / res - 0.5, 0, w - 1)
    fy = np.clip((y0 - np.asarray(y, dtype=np.float64)) / res - 0.5, 0, h - 1)
    i = np.minimum(np.floor(fx).astype(np.int64), w - 2)
    j = np.minimum(np.floor(fy).astype(np.int64), h - 2)
    tx, ty = fx - i, fy - j
    top = z[j, i] * (1 - tx) + z[j, i + 1] * tx
    bot = z[j + 1, i] * (1 - tx) + z[j + 1, i + 1] * tx
    return top * (1 - ty) + bot * ty


def rise_statistics(zd):
    """(net drop, largest rise) of heights in integer units along a line that runs downstream: the first height minus the
    last, and the largest height of any vertex above the lowest vertex upstream of it."""
    zd = np.asarray(zd, dtype=np.int64)
    return int(zd[0] - zd[-1]), int((zd - np.minimum.accumulate(zd)).max())


def cell_areas_by_row(lat_top, dlat, dlon, n_rows):
    """WGS84 geodesic area (m2) of one dlon by dlat cell in each of n_rows rows, row 0 starting at lat_top."""
    geod = Geod(ellps="WGS84")
    out = np.zeros(n_rows)
    for r in range(n_rows):
        top = lat_top + r * dlat
        bot = top + dlat
        out[r] = abs(geod.polygon_area_perimeter([0, abs(dlon), abs(dlon), 0], [bot, bot, top, top])[0])
    return out

if __name__ == "__main__":
    import unittest

    def grid_fixture():
        """4 x 5 grid: every column drains south to row 3, row 3 drains west to the outlet at (3, 0)."""
        f = np.full((4, 5), 4, np.uint8)
        f[3, :] = 16
        f[3, 0] = 0
        return f

    class TopologyTests(unittest.TestCase):
        def test_downstream_index_follows_the_direction_codes(self):
            f = np.zeros((3, 3), np.uint8)
            f[1, 1] = 128  # north-east
            f[0, 0] = 2  # south-east
            f[2, 2] = 4  # south, off the grid
            down = downstream_index(f)
            self.assertEqual(down[1 * 3 + 1], 0 * 3 + 2)
            self.assertEqual(down[0], 1 * 3 + 1)
            self.assertEqual(down[2 * 3 + 2], -1)
            self.assertEqual(down[5], -1)  # no direction

        def test_terminals_reach_the_outlet_and_a_loop_is_found(self):
            down = downstream_index(grid_fixture())
            term, loop = terminals(down)
            self.assertTrue((term == 3 * 5 + 0).all())
            self.assertFalse(loop.any())
            looped = np.array([1, 0, -1, 2], np.int64)  # cells 0 and 1 drain to each other
            term, loop = terminals(looped)
            self.assertEqual(list(loop), [True, True, False, False])

        def test_accumulation_counts_the_cells_that_drain_through(self):
            down = downstream_index(grid_fixture())
            acc = accumulate(down, np.ones(20))
            grid = acc.reshape(4, 5)
            self.assertEqual(list(grid[3]), [20, 16, 12, 8, 4])
            self.assertEqual(list(grid[:, 2]), [1, 2, 3, 12])

        def test_accumulation_adds_weights_not_counts(self):
            down = downstream_index(grid_fixture())
            w = np.arange(1, 21, dtype=np.float64)
            acc = accumulate(down, w)
            self.assertAlmostEqual(acc[3 * 5 + 0], w.sum())
            self.assertAlmostEqual(acc[0 * 5 + 4], 5.0)  # cell (0, 4) alone, nothing drains into it

    def heap_tree(depth):
        """Perfect binary tree as a downstream array: node i drains to (i - 1) // 2, the root (0) is the outlet."""
        n = 2 ** (depth + 1) - 1
        return np.array([-1] + [(i - 1) // 2 for i in range(1, n)], np.int64)

    class StrahlerTests(unittest.TestCase):
        def test_two_equal_orders_make_the_next_order(self):
            down = heap_tree(3)
            stream = np.ones(len(down), bool)
            order = strahler(down, stream, accumulate(down, np.ones(len(down))))
            self.assertEqual([order[i] for i in range(7, 15)], [1] * 8)
            self.assertEqual([order[i] for i in range(3, 7)], [2] * 4)
            self.assertEqual([order[1], order[2]], [3, 3])
            self.assertEqual(order[0], 4)

        def test_a_smaller_tributary_does_not_raise_the_order(self):
            # a chain 0 <- 1 <- 2 <- 3 (3 is the head) with a head 4 joining cell 1
            down = np.array([-1, 0, 1, 2, 1], np.int64)
            stream = np.ones(5, bool)
            order = strahler(down, stream, accumulate(down, np.ones(5)))
            self.assertEqual(order[3], 1)
            self.assertEqual(order[2], 1)
            self.assertEqual(order[4], 1)
            self.assertEqual(order[1], 2)  # two order-1 streams meet
            self.assertEqual(order[0], 2)  # one order-2 stream, nothing equal to it joins

        def test_cells_outside_the_stream_have_no_order(self):
            down = heap_tree(1)
            stream = np.array([True, True, False])
            order = strahler(down, stream, accumulate(down, np.ones(3)))
            self.assertNotIn(2, order)
            self.assertEqual(order[1], 1)
            self.assertEqual(order[0], 1)

    class SegmentTests(unittest.TestCase):
        def test_segments_run_from_head_or_confluence_to_the_next_confluence(self):
            down = heap_tree(2)
            stream = np.ones(len(down), bool)
            segs = segments(down, stream)
            starts = sorted(s[0] for s in segs)
            # every node except the root starts one segment, and each ends on its parent
            self.assertEqual(starts, list(range(1, 7)))
            for path in segs:
                self.assertEqual(path, [path[0], int(down[path[0]])])

        def test_a_stream_cell_between_confluences_stays_in_one_segment(self):
            # 4 -> 3 -> 2 -> 1 -> 0 with a second head 5 joining cell 2: 2 is a confluence
            down = np.array([-1, 0, 1, 2, 3, 2], np.int64)
            stream = np.ones(6, bool)
            segs = sorted(segments(down, stream))
            self.assertEqual(segs, [[2, 1, 0], [4, 3, 2], [5, 2]])

        def test_grid_segments_share_end_cells_and_cover_every_stream_cell(self):
            down = downstream_index(grid_fixture())
            acc = accumulate(down, np.ones(20))
            stream = acc >= 3
            segs = segments(down, stream)
            seen = set()
            for p in segs:
                seen.update(p)
            self.assertEqual(seen, set(np.flatnonzero(stream).tolist()))
            ends = [p[-1] for p in segs]
            starts = [p[0] for p in segs]
            for e in ends:
                self.assertTrue(e in starts or e == 3 * 5 + 0)

    class LineTests(unittest.TestCase):
        def test_chaikin_keeps_the_end_points_and_cuts_corners(self):
            pts = np.array([[0.0, 0.0], [10.0, 0.0], [10.0, 10.0]])
            out = chaikin(pts)
            np.testing.assert_allclose(out, [[0, 0], [2.5, 0], [7.5, 0], [10, 2.5], [10, 7.5], [10, 10]])
            two = np.array([[0.0, 0.0], [5.0, 5.0]])
            np.testing.assert_allclose(chaikin(two), two)

        def test_simplify_drops_points_within_the_tolerance_only(self):
            pts = np.array([[0.0, 0.0], [10.0, 3.0], [20.0, 0.0], [30.0, 12.0], [40.0, 0.0]])
            out = simplify(pts, 8.0)
            np.testing.assert_allclose(out, [[0, 0], [30, 12], [40, 0]])
            np.testing.assert_allclose(simplify(pts, 100.0), [[0, 0], [40, 0]])

        def test_densify_splits_into_equal_parts_of_at_most_the_step(self):
            pts = np.array([[0.0, 0.0], [100.0, 0.0], [100.0, 20.0]])
            out = densify(pts, 15.0)
            gaps = np.hypot(*np.diff(out, axis=0).T)
            self.assertLessEqual(gaps.max(), 15.0 + 1e-9)
            np.testing.assert_allclose(out[0], pts[0])
            np.testing.assert_allclose(out[-1], pts[-1])
            self.assertTrue(any(np.allclose(p, [100, 0]) for p in out))
            self.assertEqual(len(out), 8 + 2)  # 7 pieces then 2 pieces

    class SurfaceTests(unittest.TestCase):
        def setUp(self):
            self.z = np.arange(9, dtype=np.float64).reshape(3, 3)  # rows north to south, centres at 15, 45, 75 m
            self.origin = (0.0, 90.0, 30.0)  # x0, y0 (top edge), cell size

        def test_bilinear_returns_cell_values_at_centres_and_means_between(self):
            x0, y0, res = self.origin
            v = bilinear(self.z, x0, y0, res, np.array([15.0, 45.0, 75.0]), np.array([75.0, 45.0, 15.0]))
            np.testing.assert_allclose(v, [0.0, 4.0, 8.0])
            mid = bilinear(self.z, x0, y0, res, np.array([30.0]), np.array([75.0]))
            np.testing.assert_allclose(mid, [0.5])
            quad = bilinear(self.z, x0, y0, res, np.array([30.0]), np.array([60.0]))
            np.testing.assert_allclose(quad, [(0 + 1 + 3 + 4) / 4])

        def test_bilinear_holds_the_edge_value_outside_the_grid(self):
            x0, y0, res = self.origin
            v = bilinear(self.z, x0, y0, res, np.array([-100.0, 500.0]), np.array([500.0, -500.0]))
            np.testing.assert_allclose(v, [0.0, 8.0])

        def test_rise_statistics_in_decimetres(self):
            net, rise = rise_statistics(np.array([100, 120, 90, 150, 80]))
            self.assertEqual((net, rise), (20, 60))  # 150 against the lowest vertex upstream of it, 90
            net, rise = rise_statistics(np.array([100, 90, 80]))
            self.assertEqual((net, rise), (20, 0))
            net, rise = rise_statistics(np.array([100, 110]))
            self.assertEqual((net, rise), (-10, 10))

        def test_row_areas_are_geodesic_and_shrink_towards_the_pole(self):
            a = cell_areas_by_row(31.75, -1 / 3600, 1 / 3600, 3)
            self.assertEqual(len(a), 3)
            self.assertTrue(a[0] < a[2])  # the first row is the northernmost
            self.assertTrue(abs(a[1] - 30.9 * 26.4) < 60)  # about 30.9 m by 26.4 m at 31.7 N (m2)

    class OrderingTests(unittest.TestCase):
        def test_segment_numbers_follow_decreasing_upstream_area_then_first_cell(self):
            keys = [(5.0, 7), (9.0, 3), (5.0, 2), (1.0, 1)]  # (upstream area, first cell index)
            order = segment_rank(keys)
            self.assertEqual([keys[i] for i in order], [(9.0, 3), (5.0, 2), (5.0, 7), (1.0, 1)])

    unittest.main(verbosity=2)
