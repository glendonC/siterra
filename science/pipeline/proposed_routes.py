"""Pure functions of the proposed_routes recipe: Tobler's hiking function, the 8-neighbour move set, Dijkstra over a height grid and the
optimality check. numpy and the standard library only; run this file to run its tests."""
import heapq
import math

import numpy as np

# offsets (drow, dcol): 4 axis moves and 4 diagonals, in a fixed order (ties in the search depend on it). Knight moves are left out: a
# knight move steps over a one cell wide wall or gully whose cells it never tests.
MOVES = [(0, 1), (1, 0), (0, -1), (-1, 0), (1, 1), (1, -1), (-1, 1), (-1, -1)]


def tobler_kmh(s, a=6.0, b=3.5, offset=0.05, factor=1.0):
    """Walking speed in km/h for slope s = dh/dx (Tobler 1993), times `factor` (0.6 off path)."""
    return factor * a * np.exp(-b * np.abs(np.asarray(s, dtype=np.float64) + offset))


def move_hours(length_m, s, **kw):
    return (np.asarray(length_m, dtype=np.float64) / 1000.0) / tobler_kmh(s, **kw)


def search(z, allowed, origin, cell_m, a, b, offset, factor, cap):
    """Dijkstra over the grid z (row 0 north, metres) from node `origin` (row, col). Cells outside `allowed` are never entered.
    Returns (cost, pred): cost in hours (inf where unreached) and the predecessor flat index (-1 at the origin and where unreached).
    Edges are costed from the stored heights; the heap is ordered by (cost, flat index) so ties are fixed."""
    h, w = z.shape
    pad = np.zeros((h + 4, w + 4), bool)
    pad[2:-2, 2:-2] = allowed
    zp = np.zeros((h + 4, w + 4))
    zp[2:-2, 2:-2] = np.where(allowed, z, 0.0)
    W = w + 4
    ok = pad.ravel().tolist()
    zl = zp.ravel().tolist()
    offs = [(dr * W + dc, cell_m * math.hypot(dr, dc)) for dr, dc in MOVES]
    n = (h + 4) * W
    cost = [math.inf] * n
    pred = [-1] * n
    o = (origin[0] + 2) * W + origin[1] + 2
    cost[o] = 0.0
    heap = [(0.0, o)]
    af = a * factor
    exp, abs_ = math.exp, abs
    while heap:
        c, i = heapq.heappop(heap)
        if c > cost[i]:
            continue
        zi = zl[i]
        for off, length in offs:
            j = i + off
            if not ok[j]:
                continue
            s = (zl[j] - zi) / length
            if s > cap or s < -cap:
                continue
            nc = c + (length / 1000.0) / (af * exp(-b * abs_(s + offset)))
            if nc < cost[j]:
                cost[j] = nc
                pred[j] = i
                heapq.heappush(heap, (nc, j))
    cost_a = np.array(cost).reshape(h + 4, W)[2:-2, 2:-2]
    pred_a = np.array(pred, dtype=np.int64).reshape(h + 4, W)
    rr, cc = np.divmod(pred_a, W)
    pred_flat = np.where(pred_a >= 0, (rr - 2) * w + (cc - 2), -1)[2:-2, 2:-2]
    return cost_a, pred_flat


def path_to(pred, w, target):
    """Node list [(row, col)] from the origin to target by following predecessors (target = (row, col))."""
    out, i = [], target[0] * w + target[1]
    pr = pred.ravel()
    while i >= 0:
        out.append(divmod(int(i), w))
        i = int(pr[i])
    return out[::-1]


def bellman_violations(cost, z, allowed, cell_m, a, b, offset, factor, cap, tol=1e-9):
    """Number of allowed moves (from a reached node) that would give a node a lower cost than it has: 0 means no shorter route exists."""
    h, w = z.shape
    bad = 0
    for dr, dc in MOVES:
        length = cell_m * math.hypot(dr, dc)
        r0, r1 = max(0, -dr), min(h, h - dr)
        c0, c1 = max(0, -dc), min(w, w - dc)
        src = (slice(r0, r1), slice(c0, c1))
        dst = (slice(r0 + dr, r1 + dr), slice(c0 + dc, c1 + dc))
        s = (z[dst] - z[src]) / length
        use = allowed[src] & allowed[dst] & np.isfinite(cost[src]) & (np.abs(s) <= cap)
        step = (length / 1000.0) / tobler_kmh(s, a, b, offset, factor)
        bad += int((use & (cost[dst] > cost[src] + step + tol)).sum())
    return bad


if __name__ == "__main__":
    import itertools
    import unittest

    P = dict(a=6.0, b=3.5, offset=0.05, factor=0.6, cap=0.7)

    class ToblerTests(unittest.TestCase):
        def test_flat_ground_is_five_km_per_hour_and_downhill_peaks_at_six(self):
            self.assertAlmostEqual(float(tobler_kmh(0.0)), 6 * math.exp(-3.5 * 0.05))
            self.assertAlmostEqual(float(tobler_kmh(-0.05)), 6.0)
            self.assertAlmostEqual(float(tobler_kmh(0.0, factor=0.6)), 0.6 * float(tobler_kmh(0.0)))

        def test_steep_slopes_either_way_are_slower_than_flat(self):
            flat = float(tobler_kmh(0.0))
            self.assertLess(float(tobler_kmh(0.5)), flat)
            self.assertLess(float(tobler_kmh(-0.5)), flat)

        def test_move_time_is_length_over_speed(self):
            self.assertAlmostEqual(float(move_hours(1000.0, -0.05)), 1 / 6)

    class SearchTests(unittest.TestCase):
        def test_flat_grid_gives_the_straight_line_time_for_an_axis_move(self):
            z = np.zeros((5, 5))
            cost, pred = search(z, np.ones((5, 5), bool), (2, 0), cell_m=30.0, a=6.0, b=3.5, offset=0.05, factor=0.6, cap=0.7)
            self.assertAlmostEqual(cost[2, 4], 4 * 0.03 / (0.6 * 6 * math.exp(-3.5 * 0.05)))
            self.assertEqual(path_to(pred, 5, (2, 4)), [(2, 0), (2, 1), (2, 2), (2, 3), (2, 4)])

        def test_a_wall_above_the_cap_is_walked_around_and_blocked_cells_are_never_entered(self):
            z = np.zeros((5, 5))
            z[:4, 2] = 100.0  # a wall with a gap in the last row
            allowed = np.ones((5, 5), bool)
            cost, pred = search(z, allowed, (0, 0), cell_m=30.0, a=6.0, b=3.5, offset=0.05, factor=0.6, cap=0.7)
            path = path_to(pred, 5, (0, 4))
            self.assertIn((4, 2), path)
            allowed[4, 2] = False
            cost2, _ = search(z, allowed, (0, 0), cell_m=30.0, a=6.0, b=3.5, offset=0.05, factor=0.6, cap=0.7)
            self.assertTrue(np.isinf(cost2[0, 4]))

        def test_the_search_agrees_with_brute_force_on_a_small_random_grid(self):
            rng = np.random.default_rng(3)
            z = np.cumsum(rng.normal(0, 8, (6, 6)), axis=0)
            allowed = np.ones((6, 6), bool)
            kw = dict(cell_m=30.0, a=6.0, b=3.5, offset=0.05, factor=0.6, cap=0.7)
            cost, _ = search(z, allowed, (0, 0), **kw)
            d = np.full((6, 6), np.inf)
            d[0, 0] = 0.0
            for _ in range(40):  # Bellman-Ford sweeps
                for r, c in itertools.product(range(6), range(6)):
                    for dr, dc in MOVES:
                        rr, cc = r + dr, c + dc
                        if 0 <= rr < 6 and 0 <= cc < 6 and np.isfinite(d[r, c]):
                            length = 30.0 * math.hypot(dr, dc)
                            s = (z[rr, cc] - z[r, c]) / length
                            if abs(s) <= 0.7:
                                d[rr, cc] = min(d[rr, cc], d[r, c] + float(move_hours(length, s, factor=0.6)))
            np.testing.assert_allclose(cost, d, rtol=1e-12, atol=1e-12)
            self.assertEqual(bellman_violations(cost, z, allowed, 30.0, 6.0, 3.5, 0.05, 0.6, 0.7), 0)

        def test_the_optimality_check_catches_a_wrong_cost_field(self):
            z = np.zeros((4, 4))
            allowed = np.ones((4, 4), bool)
            cost, _ = search(z, allowed, (0, 0), cell_m=30.0, a=6.0, b=3.5, offset=0.05, factor=0.6, cap=0.7)
            cost[3, 3] += 1.0
            self.assertGreater(bellman_violations(cost, z, allowed, 30.0, 6.0, 3.5, 0.05, 0.6, 0.7), 0)

    unittest.main(verbosity=2)
