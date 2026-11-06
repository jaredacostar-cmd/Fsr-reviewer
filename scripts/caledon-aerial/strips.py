# Completions calibration, bucket 4: draws each sampled Caledon permit's yearly aerial photo strip.
import json, math, os, subprocess, sys, io
from PIL import Image, ImageDraw, ImageFont
# Caledon's yearly orthophotos (js/config.js imagery.Caledon), as tile caches in NAD83 / UTM 17N.
# Writes the strips and caches tiles under OUT (default: a scratch folder), reads the sample from
# docs/completions-calibration/caledon-aerial-sample.json.
import re
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.join(HERE, '..', '..')
S = os.environ.get('OUT', '/tmp/caledon-aerial')
os.makedirs(S, exist_ok=True)
_src = open(os.path.join(ROOT, 'js', 'config.js')).read()
_blk = _src[_src.index("    Caledon: {\n      owner: 'Town of Caledon'"):]
YEARS = {y: u for y, u in re.findall(r"(\d{4}): \{ label: '\d{4}', url: '([^']+)'", _blk[:_blk.index("\n    },\n  },")])}
LEVEL, RES, OX, OY, T = 9, 0.2645838625010584, -5120900.0, 9998100.0, 256
CROP = 260  # px (~69 m)

def utm17(lat, lng):  # WGS84 -> NAD83 / UTM 17N (metre-level is plenty)
    a, f, k0, lon0 = 6378137.0, 1/298.257222101, 0.9996, math.radians(-81)
    e2 = f*(2-f); ep2 = e2/(1-e2); la, lo = math.radians(lat), math.radians(lng)
    N = a/math.sqrt(1-e2*math.sin(la)**2); Tt = math.tan(la)**2; C = ep2*math.cos(la)**2; A = math.cos(la)*(lo-lon0)
    M = a*((1-e2/4-3*e2**2/64-5*e2**3/256)*la-(3*e2/8+3*e2**2/32+45*e2**3/1024)*math.sin(2*la)+(15*e2**2/256+45*e2**3/1024)*math.sin(4*la)-(35*e2**3/3072)*math.sin(6*la))
    x = k0*N*(A+(1-Tt+C)*A**3/6+(5-18*Tt+Tt**2+72*C-58*ep2)*A**5/120)+500000
    y = k0*(M+N*math.tan(la)*(A**2/2+(5-Tt+9*C+4*C**2)*A**4/24+(61-58*Tt+Tt**2+600*C-330*ep2)*A**6/720))
    return x, y

cache = {}
def tile(year, row, col):
    k = (year, row, col)
    if k in cache: return cache[k]
    p = f"{S}/tiles/{year}_{row}_{col}.img"
    if not os.path.exists(p):
        os.makedirs(S + '/tiles', exist_ok=True)
        subprocess.run(['curl', '-sS', '-m', '40', '-o', p, f"{YEARS[year]}/tile/{LEVEL}/{row}/{col}"], check=False)
    try: im = Image.open(p).convert('RGB')
    except Exception: im = Image.new('RGB', (T, T), (40, 40, 40))
    cache[k] = im; return im

def chip(year, x, y):
    px, py = (x-OX)/RES, (OY-y)/RES  # pixel coords in the level grid
    x0, y0 = int(px - CROP/2), int(py - CROP/2)
    out = Image.new('RGB', (CROP, CROP))
    for row in range(y0//T, (y0+CROP)//T + 1):
        for col in range(x0//T, (x0+CROP)//T + 1):
            out.paste(tile(year, row, col), (col*T - x0, row*T - y0))
    d = ImageDraw.Draw(out); c = CROP//2
    d.ellipse([c-9, c-9, c+9, c+9], outline=(255, 0, 0), width=2)
    return out

def strip(p, label):
    x, y = utm17(p['lat'], p['lng'])
    ys = [str(v) for v in range(max(2014, p['year']-1), 2026)]
    W = CROP*len(ys); img = Image.new('RGB', (W, CROP+44), (255, 255, 255)); d = ImageDraw.Draw(img)
    for i, yr in enumerate(ys):
        img.paste(chip(yr, x, y), (i*CROP, 44)); d.text((i*CROP+6, 26), yr, fill=(0, 0, 0))
    d.text((6, 4), label, fill=(0, 0, 0))
    return img

if __name__ == '__main__':
    data = json.load(open(os.path.join(ROOT, 'docs', 'completions-calibration', 'caledon-aerial-sample.json')))
    which = sys.argv[1] if len(sys.argv) > 1 else 'pilot'
    items = data['pilot'] if which == 'pilot' else data['sample']
    os.makedirs(S + '/strips', exist_ok=True)
    for i, p in enumerate(items):
        lab = f"#{i+1} {p['ref']} {p['status']} issued {p['issued']} {p['type']} {p['units']}u | {p['address']}"
        strip(p, lab).save(f"{S}/strips/{which}_{i+1:03d}.jpg", quality=80)
        print('ok', i+1, p['ref'])
