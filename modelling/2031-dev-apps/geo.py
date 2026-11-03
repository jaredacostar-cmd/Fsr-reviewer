"""Small geodesy helpers: geographic (NAD83) to UTM, and 2-D affine fitting."""
import math

A = 6378137.0
F = 1 / 298.257222101           # GRS 1980
K0 = 0.9996


def to_utm(lon, lat, zone=17):
    """NAD83 lon/lat (degrees) to UTM easting/northing (metres), northern hemisphere."""
    e2 = F * (2 - F)
    ep2 = e2 / (1 - e2)
    lon0 = math.radians(-183 + 6 * zone)
    phi, lam = math.radians(lat), math.radians(lon)
    n = A / math.sqrt(1 - e2 * math.sin(phi) ** 2)
    t = math.tan(phi) ** 2
    c = ep2 * math.cos(phi) ** 2
    a = math.cos(phi) * (lam - lon0)
    m = A * ((1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256) * phi
             - (3 * e2 / 8 + 3 * e2 ** 2 / 32 + 45 * e2 ** 3 / 1024) * math.sin(2 * phi)
             + (15 * e2 ** 2 / 256 + 45 * e2 ** 3 / 1024) * math.sin(4 * phi)
             - (35 * e2 ** 3 / 3072) * math.sin(6 * phi))
    x = K0 * n * (a + (1 - t + c) * a ** 3 / 6 + (5 - 18 * t + t ** 2 + 72 * c - 58 * ep2) * a ** 5 / 120) + 500000
    y = K0 * (m + n * math.tan(phi) * (a ** 2 / 2 + (5 - t + 9 * c + 4 * c ** 2) * a ** 4 / 24
                                       + (61 - 58 * t + t ** 2 + 600 * c - 330 * ep2) * a ** 6 / 720))
    return x, y


def fit_affine(src, dst):
    """Least-squares affine dst = M @ [x, y, 1]. Returns (a, b, c, d, e, f): X = a x + b y + c, Y = d x + e y + f."""
    def solve(col):
        # normal equations for [x y 1]
        s = [[0.0] * 3 for _ in range(3)]
        v = [0.0] * 3
        for (x, y), t in zip(src, col):
            r = (x, y, 1.0)
            for i in range(3):
                v[i] += r[i] * t
                for j in range(3):
                    s[i][j] += r[i] * r[j]
        return _solve3(s, v)
    a, b, c = solve([p[0] for p in dst])
    d, e, f = solve([p[1] for p in dst])
    return a, b, c, d, e, f


def apply(t, p):
    a, b, c, d, e, f = t
    return a * p[0] + b * p[1] + c, d * p[0] + e * p[1] + f


def _solve3(m, v):
    m = [row[:] + [v[i]] for i, row in enumerate(m)]
    for i in range(3):
        piv = max(range(i, 3), key=lambda r: abs(m[r][i]))
        m[i], m[piv] = m[piv], m[i]
        for r in range(3):
            if r != i:
                k = m[r][i] / m[i][i]
                for cidx in range(i, 4):
                    m[r][cidx] -= k * m[i][cidx]
    return [m[i][3] / m[i][i] for i in range(3)]
