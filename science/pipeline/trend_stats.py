"""Least squares fits, t intervals, the AR(1) effective sample size and the Theil-Sen slope, in plain Python.

No SciPy in the pinned environment: the Student t distribution is computed from the regularized incomplete beta
function (continued fraction, Numerical Recipes 6.4) and its quantile by bisection. Run this file to check the t
quantiles against standard table values and the fits against a hand-worked example.
"""
import math

Z975 = 1.959963984540054


def _betacf(a, b, x):
    tiny, eps = 1e-300, 3e-16
    qab, qap, qam = a + b, a + 1.0, a - 1.0
    c, d = 1.0, 1.0 - qab * x / qap
    d = 1.0 / (d if abs(d) > tiny else tiny)
    h = d
    for m in range(1, 1000):
        m2 = 2 * m
        aa = m * (b - m) * x / ((qam + m2) * (a + m2))
        d = 1.0 + aa * d
        d = 1.0 / (d if abs(d) > tiny else tiny)
        c = 1.0 + aa / c
        c = c if abs(c) > tiny else tiny
        h *= d * c
        aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2))
        d = 1.0 + aa * d
        d = 1.0 / (d if abs(d) > tiny else tiny)
        c = 1.0 + aa / c
        c = c if abs(c) > tiny else tiny
        de = d * c
        h *= de
        if abs(de - 1.0) < eps:
            return h
    raise ArithmeticError("incomplete beta continued fraction did not converge")


def betainc(a, b, x):
    """Regularized incomplete beta I_x(a, b)."""
    if x <= 0.0:
        return 0.0
    if x >= 1.0:
        return 1.0
    lbt = math.lgamma(a + b) - math.lgamma(a) - math.lgamma(b) + a * math.log(x) + b * math.log(1.0 - x)
    if x < (a + 1.0) / (a + b + 2.0):
        return math.exp(lbt) * _betacf(a, b, x) / a
    return 1.0 - math.exp(lbt) * _betacf(b, a, 1.0 - x) / b


def t_cdf(t, df):
    x = df / (df + t * t)
    tail = 0.5 * betainc(df / 2.0, 0.5, x)
    return 1.0 - tail if t >= 0 else tail


def t_quantile(p, df):
    """Quantile of the Student t distribution with real df > 0, by bisection to 1e-12."""
    if not 0.0 < p < 1.0 or df <= 0:
        raise ValueError("p must be in (0, 1) and df > 0")
    if p < 0.5:
        return -t_quantile(1.0 - p, df)
    lo, hi = 0.0, 1.0
    while t_cdf(hi, df) < p:
        hi *= 2.0
    for _ in range(200):
        mid = 0.5 * (lo + hi)
        if t_cdf(mid, df) < p:
            lo = mid
        else:
            hi = mid
        if hi - lo < 1e-12:
            break
    return 0.5 * (lo + hi)


def ols(x, y, level=0.95):
    """y = a + b x by least squares: a, b, the t interval of b (n - 2 df), R squared, residuals."""
    n = len(x)
    mx, my = sum(x) / n, sum(y) / n
    sxx = sum((xi - mx) ** 2 for xi in x)
    sxy = sum((xi - mx) * (yi - my) for xi, yi in zip(x, y))
    syy = sum((yi - my) ** 2 for yi in y)
    b = sxy / sxx
    a = my - b * mx
    res = [yi - (a + b * xi) for xi, yi in zip(x, y)]
    sse = sum(r * r for r in res)
    se = math.sqrt(sse / (n - 2) / sxx)
    tq = t_quantile(0.5 + level / 2.0, n - 2)
    return {"a": a, "b": b, "se": se, "lower": b - tq * se, "upper": b + tq * se, "df": n - 2, "t_quantile": tq,
            "r_squared": (sxy * sxy) / (sxx * syy) if syy > 0 else None, "residuals": res}


def lag1_autocorrelation(years, res):
    """Lag-1 autocorrelation of residuals ordered by year, over pairs of adjacent years that are both present."""
    m = sum(res) / len(res)
    den = sum((r - m) ** 2 for r in res)
    by = dict(zip(years, res))
    num = sum((by[y] - m) * (by[y + 1] - m) for y in years if y + 1 in by)
    pairs = sum(1 for y in years if y + 1 in by)
    return (num / den if den > 0 else 0.0), pairs


def ar1_adjusted(fit, years, level=0.95):
    """Santer et al. (2000): n_eff = n (1 - r1) / (1 + r1), n_eff = n when r1 <= 0; withheld when n_eff < 3."""
    n = len(years)
    r1, pairs = lag1_autocorrelation(years, fit["residuals"])
    n_eff = n if r1 <= 0 else n * (1 - r1) / (1 + r1)
    out = {"r1": r1, "adjacent_pairs": pairs, "n_eff": n_eff}
    if n_eff < 3:
        out.update(lower=None, upper=None, status="withheld_n_eff_below_3")
        return out
    se = fit["se"] * math.sqrt((n - 2) / (n_eff - 2))
    tq = t_quantile(0.5 + level / 2.0, n_eff - 2)
    out.update(se=se, df=n_eff - 2, lower=fit["b"] - tq * se, upper=fit["b"] + tq * se, status="computed")
    return out


def theil_sen(x, y):
    """Median of pairwise slopes with Sen's 95% interval; ranks (N - C) / 2 and (N + C) / 2 + 1 rounded to integers,
    C = 1.96 sqrt(n (n - 1) (2n + 5) / 18), no tie correction (the indexing of scipy.stats.theilslopes)."""
    n = len(x)
    s = sorted((y[j] - y[i]) / (x[j] - x[i]) for i in range(n) for j in range(i + 1, n) if x[j] != x[i])
    N = len(s)
    med = s[N // 2] if N % 2 else 0.5 * (s[N // 2 - 1] + s[N // 2])
    C = Z975 * math.sqrt(n * (n - 1) * (2 * n + 5) / 18.0)
    lo = max(int(round((N - C) / 2.0)) - 1, 0)
    hi = min(int(round((N + C) / 2.0)), N - 1)
    return {"slope": med, "lower": s[lo], "upper": s[hi], "pairs": N}


def direction(lower, upper):
    if lower is None or upper is None:
        return None
    if lower > 0:
        return "upward"
    if upper < 0:
        return "downward"
    return "includes_zero"


if __name__ == "__main__":
    table = {1: 12.7062, 2: 4.3027, 5: 2.5706, 10: 2.2281, 20: 2.0860, 24: 2.0639, 30: 2.0423, 120: 1.9799}
    for df, v in table.items():
        q = t_quantile(0.975, df)
        assert abs(q - v) < 5e-4, (df, q, v)
    assert abs(t_quantile(0.95, 10) - 1.8125) < 5e-4
    assert abs(t_cdf(0.0, 7) - 0.5) < 1e-12
    # y = 1 + 2x + e with e = (0.1, -0.1, 0.1, -0.1, 0.0): b = 2 - 0.02 exactly by hand
    x = [1, 2, 3, 4, 5]
    y = [3.1, 4.9, 7.1, 8.9, 11.0]
    f = ols(x, y)
    assert abs(f["b"] - 1.98) < 1e-12 and abs(f["a"] - 1.06) < 1e-12, f
    ts = theil_sen(x, y)
    # pairwise slopes sorted: 1.8, 1.8, 1.9333, 1.95, 1.975, 2.0, 2.0, 2.0333, 2.1, 2.2; median (1.975 + 2.0) / 2
    assert abs(ts["slope"] - 1.9875) < 1e-12 and ts["pairs"] == 10, ts
    print("trend_stats self-check passed")
