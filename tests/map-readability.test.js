'use strict';
// Design bundle 3 — map readability: red / amber / green for capacity only; the stages one hue darkening
// by stage; selection cyan over a halo; neutral plan outlines; Peel and its municipalities as the frame;
// capacity rings on facilities; fewer, clearer labels; the legend as its own card; the small page maps
// turned like the live map (the road grid by default).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const C = require('../scripts/colorblind-check.js');
const BM = require('../scripts/build-munis.js');

const ROOT = path.join(__dirname, '..');
const src = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const CSS = src('css/app.css');
const tokens = C.parseTokens(CSS);
const hsl = hex => {
  const [r, g, b] = C.hexToRgb(hex).map(v => v / 255), mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  if (!d) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = (mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60;
  return { h: (h + 360) % 360, s, l };
};

test('stages: one hue darkening by stage, permit and construction one colour, grey once built or withdrawn', () => {
  for (const th of ['dark', 'light']) {
    const t = tokens[th], ramp = ['inception', 'review', 'approved', 'permit'].map(k => hsl(t[`--ph-${k}`]));
    for (const c of ramp) assert.ok(c.h >= 245 && c.h <= 270, `violet [${th}]: ${c.h.toFixed(0)}°`);
    for (let i = 1; i < ramp.length; i++) assert.ok(ramp[i].l < ramp[i - 1].l, `darker at each stage [${th}]`);
    assert.equal(t['--ph-permit'], t['--ph-construction'], `permit = construction [${th}]`);
    for (const k of ['completed', 'cancelled']) assert.ok(hsl(t[`--ph-${k}`]).s < 0.15, `--ph-${k} grey [${th}]`);
  }
  // The colour-blind pair check skips only the pair the map shows as one.
  assert.deepEqual(C.MERGED, [['permit', 'construction']]);
  assert.deepEqual(C.checkPhasePairs(tokens).failures, []);
  // The legend and the sidebar say it once: "Permit issued / under construction".
  assert.match(src('js/map-analysis.js'), /'Permit issued \/ under construction'/);
  // What used the old stage hues and is not a stage (water, design phases) keeps them as --hue-*.
  assert.match(CSS, /\.svc-sys-water \{ --sys: var\(--hue-blue\); \}/);
  assert.doesNotMatch(CSS, /\.wf-ic[^{]*\{[^}]*--ph-/);
});

test('red / amber / green for capacity only: timing and data quality have their own one-hue steps', () => {
  const mm = src('js/map-markers.js');
  const timing = mm.match(/const TIMING = \{[^\n]+\};/)[0], quality = mm.match(/const QUALITY = \{[\s\S]*?\n {2}\};/)[0];
  assert.doesNotMatch(timing, /--cap-/);
  assert.doesNotMatch(quality, /--cap-/);
  assert.match(timing, /none: \['var\(--nodata\)', 'On the existing network'\]/, 'grey on the existing network');
  assert.match(timing, /y27: \['var\(--time-1\)'[\s\S]*y30: \['var\(--time-2\)'[\s\S]*y35: \['var\(--time-3\)'[\s\S]*y36: \['var\(--time-4\)'/);
  for (const th of ['dark', 'light']) {
    const t = [1, 2, 3, 4].map(i => hsl(tokens[th][`--time-${i}`]));
    for (let i = 1; i < 4; i++) assert.ok(t[i].l < t[i - 1].l, `timing darker by year [${th}]`);
    for (const c of t) assert.ok(c.h >= 150 && c.h <= 175, `one teal [${th}]: ${c.h.toFixed(0)}°`);
  }
  // DC works: no green; facilities drawn as symbols, not letters.
  for (const th of ['dark', 'light']) assert.ok(hsl(tokens[th]['--dc-ww-local']).h > 300, '--dc-ww-local is pink, not green');
  const di = src('js/dc-infra.js');
  assert.doesNotMatch(di, /plant: 'P', pumping_station: 'S'/);
  assert.match(di, /html: `<span>\$\{facIcon\(fc\.kind\)\}<\/span>`/);
  assert.match(CSS, /\.dc-fac\.dc-wastewater span \{ background: var\(--dc-ww-main\); \}/);
  // Water facilities: neutral symbols (the old green wells are gone).
  assert.doesNotMatch(CSS, /\.wf-ic\.wf-well[^{]*\{[^}]*--cap-room/);
});

test('selection: cyan over a halo; plan areas neutral dashed lines; blocks slate', () => {
  for (const th of ['dark', 'light']) {
    const t = tokens[th];
    const s = hsl(t['--select']);
    assert.ok(s.h >= 180 && s.h <= 200, `--select cyan [${th}]: ${s.h.toFixed(0)}°`);
    assert.ok(/^#[0-9a-f]{6}$/.test(t['--halo']), `--halo [${th}]`);
    for (const k of ['--area-sp', '--area-pr']) assert.ok(hsl(t[k]).s < 0.12, `${k} neutral [${th}]`);
    assert.ok(hsl(t['--block']).s < 0.3 && hsl(t['--block']).h > 200 && hsl(t['--block']).h < 220, `--block slate [${th}]`);
  }
  const mm = src('js/map-markers.js');
  assert.match(mm, /if \(strong\) poly\._halo = L\.polygon\(toLatLngs\(a\.poly\), \{ renderer: focusCanvas, color: haloColor\(\), weight: 7/);
  assert.match(mm, /const subColor = \(\) => token\('--select'\);/);
  assert.match(src('js/plan-areas.js'), /dashArray: kind === 'mtsa' \? '3 3' : kind === 'pr' \? '2 4' : '7 5'/);
});

test('the frame: Peel and its municipalities from the 2021 census areas, names while zoomed out', () => {
  const d = JSON.parse(src('data/munis.json'));
  assert.deepEqual(d.munis.map(m => m.name), ['Brampton', 'Caledon', 'Mississauga']);
  const inRing = (x, y, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
  for (const m of d.munis) {
    assert.ok(m.rings.length >= 1 && m.label, m.name);
    assert.ok(inRing(m.label[0], m.label[1], m.rings[0]), `${m.name}'s name sits inside it`);
    assert.ok(inRing(m.label[0], m.label[1], d.peel.rings[0]), `and inside Peel`);
  }
  // Brampton's centre is in Brampton, not Mississauga.
  assert.ok(inRing(-79.76, 43.69, d.munis[0].rings[0]) && !inRing(-79.76, 43.69, d.munis[2].rings[0]));
  // The method on two touching squares: two outlines, one Peel outline round both.
  const sq = (x0, y0) => [[[x0, y0], [x0 + 0.1, y0], [x0 + 0.1, y0 + 0.1], [x0, y0 + 0.1], [x0, y0]]];
  const out = BM.outlines([{ name: 'A', rings: sq(-79.8, 43.6) }, { name: 'B', rings: sq(-79.7, 43.6) }]);
  assert.equal(out.munis.length, 2);
  assert.equal(out.peel.rings.length, 1);
  const area = r => Math.abs(BM.ringArea(r));
  assert.ok(Math.abs(area(out.peel.rings[0]) - 0.02) < 0.002, `Peel ≈ both squares (${area(out.peel.rings[0]).toFixed(4)})`);
  // The live map: the dashed bounding box is gone; the outlines and names draw instead, and Peel fits
  // the frame (turned) when no link set the view.
  const mc = src('js/map-core.js');
  assert.doesNotMatch(mc, /bboxOutline|L\.rectangle/);
  assert.match(mc, /fetch\('data\/munis\.json'/);
  assert.match(mc, /const untouched = \(\) => \{ const c = map\.getCenter\(\); return !\/\[#&\]m=\/\.test\(location\.hash\) && c\.lat === startCentre\.lat && c\.lng === startCentre\.lng; \};/);
  assert.match(mc, /if \(map\.getSize\(\)\.x < 200\) \{ map\.once\('resize', tryFit\); return; \} fitPeel\(\);/, 'opened on Home: fits when the map is first shown');
  assert.match(mc, /const MUNI_LABEL_MAX_ZOOM = 12;/);
});

test('background: grey map with the aerial from street zoom, matching the theme; old saved views open as it', () => {
  const D = require('../js/design.js');
  for (const v of ['planning', 'water', 'wastewater', 'dc']) assert.equal(D.basemapForView(v), 'auto');
  const mc = src('js/map-core.js');
  assert.match(mc, /const LEGACY_BASEMAP = \{ 'canvas-dark': 'auto' \};/);
  assert.match(mc, /const AUTO_AERIAL_ZOOM = 14;/);
  assert.match(mc, /map\.getZoom\(\) >= AUTO_AERIAL_ZOOM \? 'aerial-labels' : 'streets'/);
  assert.match(mc, /noteBackground\(/, 'a note when the background switches');
  assert.match(src('js/map-analysis.js'), /if \(MC\(\)\.basemapKey\(s\.basemap\)\) \{ MC\(\)\.setBasemap\(s\.basemap\);/);
  // The Base map row names the background, never "None on".
  const LG = require('../js/layer-groups.js');
  const base = LG.GROUPS.find(g => g.key === 'base');
  assert.equal(LG.summaryText(base, new Set(), 'Grey map'), 'Grey map');
  assert.equal(LG.headerText(base, new Set(['hill']), null, 'Aerial + roads'), 'Aerial + roads + 1 on');
});

test('developments: sized by planned homes in Planning, clusters say what they count, stage number kept', () => {
  const ma = src('js/map-analysis.js'), mm = src('js/map-markers.js');
  assert.match(ma, /planning: \{ basemap: PD\.basemapForView\('planning'\), labelMode: 'address-units', [^}]*mstyle: \{ color: 'phase', size: 'units'/);
  const unitsPx = new Function(`${mm.match(/const unitsPx = u => [^\n]+/)[0]}; return unitsPx;`)();
  assert.ok(unitsPx(8) < unitsPx(100) && unitsPx(100) < unitsPx(1000) && unitsPx(1000) < unitsPx(5146), 'an 8-unit infill and a 5,146-unit subdivision differ');
  assert.equal(unitsPx(0), 10);
  assert.match(mm, /const unitWord = noUnits \? 'sites' : byUnits \? 'homes' : sized \? \(size >= 48 \? 'ppl\+jobs' : ''\) : 'sites';/);
  assert.match(mm, /const glyph = mstyle\.color === 'phase' && d >= 14 && !near \? P\.PHASE_BY_KEY\[p\.phase\]\.short : '';/);
  // With capacity colours on, the developments step back.
  assert.match(ma, /map\.getContainer\(\)\.classList\.toggle\('devs-quiet', MM\(\)\.mstyle\.cap !== 'off'\);/);
  assert.match(CSS, /\.devs-quiet \.pc \{ transform: scale\(\.78\); opacity: \.6; \}/);
});

test('labels: address + units, clear of the controls, hidden under their own hover card; block numbers from zoom 12', () => {
  const ml = src('js/map-labels.js');
  assert.match(ml, /'address-units': 'Address \+ units'/);
  assert.match(ml, /case 'address-units': return `<b>\$\{esc\(p\.title\)\}<\/b>\$\{p\.units \? `<small>/);
  assert.match(ml, /if \(store\.get\('labelMode', null\) === 'address-phase'\) store\.set\('labelMode', 'address-units'\)/, 'the old default moves once');
  assert.match(ml, /querySelectorAll\('\.leaflet-control, \.bg-note:not\(\[hidden\]\)'\)/);
  assert.match(ml, /m\.on\('tooltipopen', \(\) => \{ const l = labelOf\.get\(m\), e = l && l\.getElement\(\); if \(e\) e\.classList\.add\('hov'\); \}\)/);
  assert.match(CSS, /\.plabel\.hov \{ visibility: hidden; \}/);
  assert.match(CSS, /\.z-lt12 \.blk-lbl \{ display: none; \}/);
  assert.match(CSS, /\.z-lt12 \.blk-lbl\.hov \{ display: block; \}/);
  assert.match(src('js/sewer-trace.js'), /pl\.on\('mouseover', \(\) => \{ const e = lbl\.getElement\(\); if \(e\) e\.classList\.add\('hov'\); \}\)/);
});

test('facilities carry capacity rings above the developments (the Servicing › Capacity rule)', () => {
  const ma = src('js/map-analysis.js');
  assert.match(ma, /const ringTone = pct => \(pct == null \|\| !isFinite\(pct\) \? '' : pct >= 100 \? 'over' : pct >= 90 \? 'tight' : 'room'\);/);
  assert.match(ma, /L\.circleMarker\(ll\(d\.outletAt\), \{ pane: 'facPane', radius: 8, weight: 4, color: bucket\(ps\.pct, CAP_PS\)/);
  assert.match(ma, /fp\.style\.zIndex = 620;/);
  const wt = src('js/water-trace.js');
  assert.match(wt, /if \(!r && kinds\.some\(k => \['reservoir', 'elevated_tank', 'standpipe'\]\.includes\(k\)\)\) r = rows\.find\(x => x\.kind === 'storage' && base\(x\.name\) === f\.name\);/, 'Silverthorn and West Brampton (pumping + reservoir) ring by their storage');
  assert.match(wt, /const tone = r => \(r\.pctBo >= 100 \? 'over' : r\.pctBo >= 90 \? 'tight' : 'room'\);/);
  assert.match(wt, /zIndexOffset: 1000/);
  for (const t of ['over', 'tight', 'room']) assert.match(CSS, new RegExp(`\\.wf-ic\\.ring-${t}, \\.plant-mk\\.ring-${t} span \\{ box-shadow: 0 0 0 3px var\\(--cap-${t}\\)`));
});

test('legend card, base map named, north control in words', () => {
  assert.match(src('js/map-analysis.js'), /new LegendCard\(\)\.addTo\(map\);/);
  const as = src('js/area-select.js');
  assert.match(as, /cap\.textContent = grid \? 'Grid' : 'North';/);
});

test('small page maps turn like the live map (road grid by default), with outlines, labels and a key', () => {
  const ws = src('js/ws-pages.js');
  const body = ws.slice(ws.indexOf('  const bearing = () =>'), ws.indexOf('  // Labels on the top few items of a small map'));
  const make = orient => new Function('App', 'root', 'esc', `${body}; return frame;`)(
    () => ({ state: { servicing: { drainage: [{ rings: [[[-79.8, 43.6], [-79.7, 43.6], [-79.7, 43.7], [-79.8, 43.7], [-79.8, 43.6]]] }] } } }),
    { PeelMapCore: { getOrientation: () => orient, canRotate: true, GRID_BEARING: 44, getMunis: () => null } }, s => String(s));
  const north = (f => { const a = f.pt(-79.75, 43.65), b = f.pt(-79.75, 43.66); return Math.atan2(b[0] - a[0], a[1] - b[1]) * 180 / Math.PI; });
  assert.ok(Math.abs(north(make('grid')()) - 44) < 0.5, 'north points 44° right of up on the road grid');
  assert.ok(Math.abs(north(make('north')())) < 0.5, 'and straight up when north up');
  assert.match(make('grid')().svg('', 'x'), /class="hm-north"/);
  assert.doesNotMatch(make('north')().svg('', 'x'), /class="hm-north"/);
  assert.match(ws, /bearing: bearing\(\) \}\)/, 'the site sketch turns too');
  assert.match(src('js/reports.js'), /function sketchSVG\(\{ center, halfM = 1200, points = \[\], rings = \[\], site = null, W = 330, H = 250, bearing = 0 \}\)/, 'printed reports stay north up');
  // A key line under every map, the same symbols everywhere; highlights are not the selection colour.
  for (const k of ['hm-key-hl', 'hm-key-dev', 'hm-key-site', 'hm-key-pipe']) assert.ok(ws.includes(k), k);
  assert.match(CSS, /\.home-map-svg \.hm-hl \{ fill: var\(--text-primary\);/);
  assert.match(ws, /function mapLabels\(f, items\)/);
});
