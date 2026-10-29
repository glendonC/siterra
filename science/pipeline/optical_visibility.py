"""Pure functions of the optical_visibility_by_band recipe: clear shares per band and the winter summary. numpy only; run this file to run its tests."""
import numpy as np


def clear_shares(median, count, band, bands, min_dates):
    """{band: (valid cells, band cells)}: a cell is valid where the median is a number and count is at least min_dates."""
    valid = np.isfinite(median) & (count >= min_dates)
    return {b: (int(valid[band == b].sum()), int((band == b).sum())) for b in bands}


def winter_summary(rows, high, half, decimals=4):
    """rows: list of (month 'YYYY-MM', share). Lowest, median, highest, months at or above `high` and `half`, in input order."""
    x = np.array([s for _, s in rows], dtype=np.float64)
    return {
        "months": len(rows), "lowest": round(float(x.min()), decimals), "median": round(float(np.median(x)), decimals), "highest": round(float(x.max()), decimals),
        "at_or_above_high": int((x >= high).sum()), "at_or_above_half": int((x >= half).sum()),
        "months_at_or_above_high": [m for m, s in rows if s >= high],
    }


def is_winter(month, winter_months):
    return int(month[5:7]) in winter_months


if __name__ == "__main__":
    import unittest

    class Tests(unittest.TestCase):
        def test_valid_needs_a_median_and_enough_dates(self):
            med = np.array([[1.0, np.nan, 1.0, 1.0]])
            cnt = np.array([[1, 5, 2, 3]], np.uint8)
            band = np.array([[1, 1, 2, 2]], np.uint8)
            self.assertEqual(clear_shares(med, cnt, band, (1, 2), 1), {1: (1, 2), 2: (2, 2)})
            self.assertEqual(clear_shares(med, cnt, band, (1, 2), 3), {1: (0, 2), 2: (1, 2)})

        def test_cells_outside_every_band_are_not_counted(self):
            med = np.array([[1.0, 1.0]])
            cnt = np.array([[1, 1]], np.uint8)
            band = np.array([[0, 3]], np.uint8)
            self.assertEqual(clear_shares(med, cnt, band, (3,), 1), {3: (1, 1)})

        def test_winter_summary_counts_thresholds_inclusively(self):
            s = winter_summary([("2020-01", 0.9), ("2020-02", 0.5), ("2020-03", 0.1)], 0.9, 0.5)
            self.assertEqual((s["lowest"], s["median"], s["highest"]), (0.1, 0.5, 0.9))
            self.assertEqual((s["at_or_above_high"], s["at_or_above_half"], s["months_at_or_above_high"]), (1, 2, ["2020-01"]))

        def test_winter_months_are_december_to_march(self):
            self.assertEqual([m for m in ("2019-11", "2019-12", "2020-01", "2020-03", "2020-04") if is_winter(m, [12, 1, 2, 3])], ["2019-12", "2020-01", "2020-03"])

    unittest.main(verbosity=2)
