"""Least squares fits, t intervals, the AR(1) effective sample size, the Theil-Sen slope, the Mann-Kendall test, the
Pettitt single change-point test and the Benjamini-Hochberg procedure, in plain Python.

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


def t_two_sided_p(t, df):
    return 2.0 * (1.0 - t_cdf(abs(t), df))


def normal_two_sided_p(z):
    return math.erfc(abs(z) / math.sqrt(2.0))


def mann_kendall(y):
    """Mann-Kendall S of y in time order, tie-corrected variance, Z with continuity correction, two-sided normal p."""
    n = len(y)
    s = 0
    for i in range(n - 1):
        for j in range(i + 1, n):
            s += (y[j] > y[i]) - (y[j] < y[i])
    ties = {}
    for v in y:
        ties[v] = ties.get(v, 0) + 1
    var = (n * (n - 1) * (2 * n + 5) - sum(t * (t - 1) * (2 * t + 5) for t in ties.values() if t > 1)) / 18.0
    z = 0.0 if s == 0 or var <= 0 else (s - (1 if s > 0 else -1)) / math.sqrt(var)
    return {"s": s, "var_s": var, "z": z, "p": normal_two_sided_p(z)}


def pettitt_change_point(years, y, min_segment=4):
    """Non-parametric single change-point test (Pettitt 1979, Applied Statistics 28(2):126-135) over ordered (years, y)
    of length T >= 2 * min_segment. Evaluates U_{t,T} = sum_{i=0}^{t-1} sum_{j=t}^{T-1} sgn(y_j - y_i) for candidate split
    indices t in [min_segment, T - min_segment], where y[:t] is before the change and y[t:] is from change_year = years[t]
    onward. Ties in |U_{t,T}| break toward the earliest split."""
    T = len(y)
    if len(years) != T or T < 2 * min_segment:
        raise ValueError(f"years and y must have equal length T >= {2 * min_segment}")
    u = 0
    t_star, u_star, k_star = min_segment, 0, -1
    for t in range(1, T - min_segment + 1):
        yi = y[t - 1]
        u += sum((yj > yi) - (yj < yi) for yj in y)
        if t >= min_segment and abs(u) > k_star:
            t_star, u_star, k_star = t, u, abs(u)
    before_mean = sum(y[:t_star]) / t_star
    after_mean = sum(y[t_star:]) / (T - t_star)
    step = after_mean - before_mean
    dir_str = "upward" if u_star > 0 else ("downward" if u_star < 0 else "none")
    p = min(1.0, 2.0 * math.exp(-6.0 * (k_star * k_star) / (T * T * T + T * T)))
    return {
        "change_year": int(years[t_star]),
        "split_index": int(t_star),
        "before_mean": float(before_mean),
        "after_mean": float(after_mean),
        "step_change": float(step),
        "direction": dir_str,
        "u_stat": int(u_star),
        "k_stat": int(k_star),
        "p": float(p),
    }


def benjamini_hochberg(pvals, q):
    """True for each p that the Benjamini-Hochberg step-up procedure rejects at false discovery rate q."""
    m = len(pvals)
    order = sorted(range(m), key=lambda i: pvals[i])
    k = 0
    for rank, i in enumerate(order, start=1):
        if pvals[i] <= rank * q / m:
            k = rank
    passed = [False] * m
    for i in order[:k]:
        passed[i] = True
    return passed


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
    assert abs(t_two_sided_p(2.0860, 20) - 0.05) < 5e-4
    # S = 10, var = 5 * 4 * 15 / 18, Z = 9 / sqrt(var) = 2.2045, p = 0.0275
    mk = mann_kendall([1, 2, 3, 4, 5])
    assert mk["s"] == 10 and abs(mk["z"] - 2.20454) < 1e-4 and abs(mk["p"] - 0.02749) < 1e-4, mk
    # one tie pair: S = 5, var = 4 * 3 * 13 / 18 - 2 * 1 * 9 / 18 = 7.6667, Z = 4 / sqrt(var) = 1.4446, p = 0.1486
    mk = mann_kendall([1, 1, 2, 3])
    assert mk["s"] == 5 and abs(mk["var_s"] - 23 / 3) < 1e-12 and abs(mk["p"] - 0.1486) < 1e-4, mk
    assert benjamini_hochberg([0.01, 0.04, 0.03, 0.2], 0.05) == [True, False, False, False]
    assert benjamini_hochberg([0.04, 0.01, 0.03, 0.02], 0.05) == [True, True, True, True]
    # Pettitt (1979): 10 seasons 2000..2009 with step upward at 2005 (split t=5: 5 low values < 5 high values -> U = 25)
    yrs_cp = list(range(2000, 2010))
    y_up = [0.20, 0.21, 0.19, 0.22, 0.20, 0.45, 0.47, 0.44, 0.46, 0.48]
    cp_up = pettitt_change_point(yrs_cp, y_up, min_segment=4)
    p_expected = min(1.0, 2.0 * math.exp(-6.0 * (25 ** 2) / (10 ** 3 + 10 ** 2)))
    assert cp_up["change_year"] == 2005 and cp_up["split_index"] == 5, cp_up
    assert cp_up["u_stat"] == 25 and cp_up["k_stat"] == 25 and cp_up["direction"] == "upward", cp_up
    assert abs(cp_up["before_mean"] - 0.204) < 1e-12 and abs(cp_up["after_mean"] - 0.46) < 1e-12, cp_up
    assert abs(cp_up["step_change"] - 0.256) < 1e-12 and abs(cp_up["p"] - p_expected) < 1e-12, cp_up
    # Downward step at 2004 (split t=4: 4 high values > 6 low values -> U = -24)
    y_dn = [0.50, 0.52, 0.49, 0.51, 0.22, 0.20, 0.21, 0.19, 0.23, 0.21]
    cp_dn = pettitt_change_point(yrs_cp, y_dn, min_segment=4)
    assert cp_dn["change_year"] == 2004 and cp_dn["split_index"] == 4, cp_dn
    assert cp_dn["u_stat"] == -24 and cp_dn["k_stat"] == 24 and cp_dn["direction"] == "downward", cp_dn
    print("trend_stats self-check passed")
