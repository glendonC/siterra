"""Profiles along lines: the lines, the samples, bands, crossings, land cover runs and the valley floor segment.

The functions of recipe terrain_transects 1.0.0 (science/recipes/registry.json). They hold no place-specific value and
import only numpy, pyproj and shapely. Run `python -I terrain_transects.py` to run the tests.
"""
import math

import numpy as np
from pyproj import Geod
from shapely.geometry import LineString, Point

GEOD = Geod(ellps="WGS84")


def meridian_ends(polygon, lon, point):
    """(north latitude, south latitude) of the part of the meridian `lon` inside `polygon` that contains `point` (lon, lat)."""
    s, n = polygon.bounds[1] - 1.0, polygon.bounds[3] + 1.0
    cut = polygon.intersection(LineString([(lon, s), (lon, n)]))
    pieces = list(cut.geoms) if hasattr(cut, "geoms") else [cut]
    near = [p for p in pieces if p.distance(Point(*point)) < 1e-9]
    if len(near) != 1:
        raise SystemExit(f"{len(near)} parts of the meridian contain the point")
    lats = [c[1] for c in near[0].coords]
    return max(lats), min(lats)


def sample_distances(length, step):
    """0, step, 2 step ... below `length`, then `length` itself."""
    d = np.arange(0.0, length, step)
    d = d[d < length - 1e-9]
    return np.append(d, length)


def meridian_samples(lon, lat_north, lat_south, step):
    """(distance, lon, lat) of samples along a meridian, geodesic distances from the north end."""
    length = GEOD.inv(lon, lat_north, lon, lat_south)[2]
    d = sample_distances(length, step)
    lat = np.array([GEOD.fwd(lon, lat_north, 180.0, float(x))[1] for x in d])
    lat[-1] = lat_south
    return d, np.full(len(d), lon), lat


def polyline_samples(lons, lats, step):
    """(distance, lon, lat, piece index) of samples along a polyline, geodesic distances from its first vertex, each
    sample on the straight piece between two vertices (linear in longitude and latitude)."""
    lons, lats = np.asarray(lons, dtype=np.float64), np.asarray(lats, dtype=np.float64)
    piece = GEOD.inv(lons[:-1], lats[:-1], lons[1:], lats[1:])[2]
    cum = np.concatenate([[0.0], np.cumsum(piece)])
    d = sample_distances(float(cum[-1]), step)
    k = np.clip(np.searchsorted(cum, d, side="right") - 1, 0, len(piece) - 1)
    t = (d - cum[k]) / piece[k]
    lon = lons[k] + (lons[k + 1] - lons[k]) * t
    lat = lats[k] + (lats[k + 1] - lats[k]) * t
    lon[-1], lat[-1] = lons[-1], lats[-1]
    return d, lon, lat, k


def band_of(z, bounds):
    """1 below the first boundary, 2 from it to below the second, 3 from the second up."""
    return 1 + (np.asarray(z) >= bounds[0]).astype(int) + (np.asarray(z) >= bounds[1]).astype(int)


def crossings(d, z, bounds):
    """Where the profile, straight between samples, crosses a boundary: [(boundary, distance, 'rising' or 'falling', i)],
    i the sample before the crossing, in the order along the line."""
    d, z = np.asarray(d, dtype=np.float64), np.asarray(z, dtype=np.float64)
    out = []
    for b in bounds:
        for i in range(len(z) - 1):
            rising = z[i] < b <= z[i + 1]
            falling = z[i] >= b > z[i + 1]
            if rising or falling:
                out.append((b, float(d[i] + (b - z[i]) / (z[i + 1] - z[i]) * (d[i + 1] - d[i])), "rising" if rising else "falling", i))
    return sorted(out, key=lambda c: c[1])


def band_lengths(d, z, bounds):
    """Length of the piecewise linear profile in each band, [band 1, band 2, band 3], same unit as d."""
    d, z = np.asarray(d, dtype=np.float64), np.asarray(z, dtype=np.float64)
    out = np.zeros(len(bounds) + 1)
    cuts = crossings(d, z, bounds)
    for i in range(len(z) - 1):
        stops = [d[i]] + [c[1] for c in cuts if c[3] == i] + [d[i + 1]]
        for a, b in zip(stops[:-1], stops[1:]):
            mid = np.interp((a + b) / 2, d[i:i + 2], z[i:i + 2])
            out[int(band_of(mid, bounds)) - 1] += b - a
    return out


def runs(d, classes):
    """Runs of equal class as [(class, from, to)]; a run starts and ends halfway to its neighbouring samples, and at the
    first and last sample's distance at the ends of the line."""
    d = np.asarray(d, dtype=np.float64)
    out = []
    start = 0
    for i in range(1, len(classes) + 1):
        if i == len(classes) or classes[i] != classes[start]:
            lo = d[0] if start == 0 else (d[start - 1] + d[start]) / 2
            hi = d[-1] if i == len(classes) else (d[i - 1] + d[i]) / 2
            out.append((int(classes[start]), float(lo), float(hi)))
            start = i
    return out


def floor_segment(d, z, max_elevation):
    """The contiguous samples around the lowest sample with elevation at most max_elevation: (first index, last index,
    from, to) with the ends halfway to the neighbouring samples or at the line's ends; None when the lowest sample is higher."""
    d, z = np.asarray(d, dtype=np.float64), np.asarray(z, dtype=np.float64)
    k = int(np.argmin(z))
    if z[k] > max_elevation:
        return None
    a = b = k
    while a > 0 and z[a - 1] <= max_elevation:
        a -= 1
    while b < len(z) - 1 and z[b + 1] <= max_elevation:
        b += 1
    lo = d[0] if a == 0 else (d[a - 1] + d[a]) / 2
    hi = d[-1] if b == len(z) - 1 else (d[b] + d[b + 1]) / 2
    return a, b, float(lo), float(hi)


def longest_path(upstream, length, area):
    """Segment ids from the outlet segment up to a head along the longest path: at each confluence the upstream segment
    whose longest upstream path (its own length included) is longer, ties by the larger area and then the lower id.
    `upstream` maps id -> upstream ids, `length` and `area` map id -> value; the outlet is the id nobody lists as upstream."""
    listed = {u for us in upstream.values() for u in us}
    outlets = [s for s in upstream if s not in listed]
    if len(outlets) != 1:
        raise SystemExit(f"{len(outlets)} outlet segments")
    memo = {}

    def far(s):
        if s not in memo:
            memo[s] = length[s] + max((far(u) for u in upstream[s]), default=0.0)
        return memo[s]

    path = [outlets[0]]
    while upstream[path[-1]]:
        path.append(min(upstream[path[-1]], key=lambda u: (-far(u), -area[u], u)))
    return path


def join_upstream(coords_by_id, path):
    """Vertices of the path from the outlet upwards: every segment's stored vertices run downstream, so each is reversed,
    and the vertex a segment shares with the previous one is kept once. Returns (vertices, id of the piece after each
    vertex's start, vertex index where each segment begins)."""
    verts, begins = [], []
    for sid in path:
        c = [tuple(v) for v in coords_by_id[sid]][::-1]
        if verts:
            if verts[-1][:2] != c[0][:2]:
                raise SystemExit(f"{sid} does not start where the previous segment ends")
            c = c[1:]
        begins.append(max(len(verts) - 1, 0))
        verts.extend(c)
    return verts, begins


if __name__ == "__main__":
    import unittest
    from shapely.geometry import Polygon

    class LineTests(unittest.TestCase):
        def test_meridian_ends_take_the_part_that_holds_the_point(self):
            notch = Polygon([(-2, -2), (2, -2), (2, 2), (0.5, 2), (0.5, 0.2), (-0.5, 0.2), (-0.5, 2), (-2, 2)])
            self.assertEqual(meridian_ends(notch, 1.0, (1.0, 0.0)), (2.0, -2.0))
            self.assertEqual(meridian_ends(notch, 0.0, (0.0, -1.0)), (0.2, -2.0))
            with self.assertRaises(SystemExit):
                meridian_ends(notch, 0.0, (0.0, 1.0))  # the point lies outside the polygon

        def test_sample_distances_end_on_the_last_point(self):
            np.testing.assert_allclose(sample_distances(100.0, 30.0), [0, 30, 60, 90, 100])
            np.testing.assert_allclose(sample_distances(90.0, 30.0), [0, 30, 60, 90])

        def test_meridian_samples_keep_the_longitude_and_step_geodesically(self):
            d, lon, lat = meridian_samples(-6.4, 31.7, 31.6, 30.0)
            self.assertTrue((lon == -6.4).all())
            self.assertEqual(lat[0], 31.7)
            self.assertEqual(lat[-1], 31.6)
            self.assertAlmostEqual(d[-1], GEOD.inv(-6.4, 31.7, -6.4, 31.6)[2], places=6)
            seg = GEOD.inv(lon[:-1], lat[:-1], lon[1:], lat[1:])[2]
            np.testing.assert_allclose(seg[:-1], 30.0, atol=1e-6)
            self.assertLessEqual(seg[-1], 30.0 + 1e-6)

        def test_polyline_samples_lie_on_the_pieces_and_end_on_the_last_vertex(self):
            lons, lats = [0.0, 0.001, 0.001], [0.0, 0.0, 0.001]
            d, lon, lat, k = polyline_samples(lons, lats, 30.0)
            total = GEOD.line_length(lons, lats)
            self.assertAlmostEqual(d[-1], total, places=6)
            self.assertEqual((lon[-1], lat[-1]), (0.001, 0.001))
            first = k == 0
            self.assertTrue((lat[first] == 0.0).all())
            self.assertTrue((lon[~first] == 0.001).all())
            self.assertEqual(int(k[-1]), 1)

    class ProfileTests(unittest.TestCase):
        bounds = (2316.8, 2815.2)
        d = np.array([0.0, 30.0, 60.0, 90.0])
        z = np.array([2000.0, 2300.0, 2400.0, 2300.0])

        def test_band_follows_the_boundaries_and_a_value_on_one_is_in_the_higher_band(self):
            np.testing.assert_array_equal(band_of([2316.7, 2316.8, 2815.1, 2815.2], self.bounds), [1, 2, 2, 3])

        def test_crossings_are_interpolated_between_samples(self):
            c = crossings(self.d, self.z, self.bounds)
            self.assertEqual([x[2] for x in c], ["rising", "falling"])
            self.assertAlmostEqual(c[0][1], 30 + 16.8 / 100 * 30)
            self.assertAlmostEqual(c[1][1], 60 + 83.2 / 100 * 30)
            self.assertEqual(crossings([0, 30], [2316.8, 2316.8], self.bounds), [])  # on the boundary both times: no crossing

        def test_a_sample_on_a_boundary_belongs_to_the_higher_band_and_counts_once(self):
            self.assertEqual(crossings([0, 30, 60], [2000.0, 2316.8, 2400.0], self.bounds), [(2316.8, 30.0, "rising", 0)])
            self.assertEqual(crossings([0, 30, 60], [2400.0, 2316.8, 2000.0], self.bounds), [(2316.8, 30.0, "falling", 1)])

        def test_band_lengths_add_up_to_the_line(self):
            km = band_lengths(self.d, self.z, self.bounds)
            self.assertAlmostEqual(km.sum(), 90.0)
            self.assertAlmostEqual(km[0], 35.04 + 5.04)
            self.assertAlmostEqual(km[1], 49.92)
            self.assertAlmostEqual(km[2], 0.0)

        def test_runs_start_and_end_halfway_between_samples(self):
            r = runs([0, 30, 60, 90, 120], [10, 10, 40, 40, 10])
            self.assertEqual(r, [(10, 0.0, 45.0), (40, 45.0, 105.0), (10, 105.0, 120.0)])

        def test_floor_segment_is_the_contiguous_stretch_around_the_lowest_sample(self):
            d = np.arange(0.0, 180.0, 30.0)
            z = np.array([2500.0, 2100.0, 1900.0, 1950.0, 2300.0, 2100.0])
            a, b, lo, hi = floor_segment(d, z, 2200.0)
            self.assertEqual((a, b, lo, hi), (1, 3, 15.0, 105.0))
            a, b, lo, hi = floor_segment(d, np.array([1900.0, 1950, 2100, 2150, 2190, 2199]), 2200.0)
            self.assertEqual((a, b, lo, hi), (0, 5, 0.0, 150.0))
            self.assertIsNone(floor_segment(d, z + 1000, 2200.0))

        def test_a_sample_exactly_at_the_limit_belongs_to_the_floor(self):
            d = np.array([0.0, 30.0, 60.0])
            self.assertEqual(floor_segment(d, np.array([2200.0, 1900.0, 2200.0]), 2200.0), (0, 2, 0.0, 60.0))

    class PathTests(unittest.TestCase):
        upstream = {"s1": ["s2", "s3"], "s2": ["s4"], "s3": [], "s4": []}
        length = {"s1": 10.0, "s2": 100.0, "s3": 120.0, "s4": 50.0}
        area = {"s1": 9.0, "s2": 4.0, "s3": 5.0, "s4": 2.0}

        def test_the_path_takes_the_branch_with_the_longer_way_up(self):
            self.assertEqual(longest_path(self.upstream, self.length, self.area), ["s1", "s2", "s4"])

        def test_ties_go_to_the_larger_area_then_the_lower_id(self):
            length = dict(self.length, s3=150.0)  # now equal to s2 + s4
            self.assertEqual(longest_path(self.upstream, length, self.area), ["s1", "s3"])
            area = dict(self.area, s3=4.0)
            self.assertEqual(longest_path(self.upstream, length, area), ["s1", "s2", "s4"])

        def test_vertices_are_joined_from_the_outlet_upwards(self):
            coords = {"s1": [(2, 0, 5.0), (3, 0, 4.0)], "s2": [(0, 0, 9.0), (1, 0, 7.0), (2, 0, 5.0)]}
            verts, begins = join_upstream(coords, ["s1", "s2"])
            self.assertEqual([v[0] for v in verts], [3, 2, 1, 0])
            self.assertEqual(begins, [0, 1])
            with self.assertRaises(SystemExit):
                join_upstream({"s1": [(2, 0, 5.0), (3, 0, 4.0)], "s2": [(0, 0, 9.0), (1, 5, 7.0)]}, ["s1", "s2"])

    unittest.main(verbosity=2)
