// Completions calibration, bucket 4 (docs/completions-calibration.md): the Caledon house permits whose
// build time the aerial photos measure, and the seeded sample. node scripts/caledon-aerial/population.js
// writes docs/completions-calibration/caledon-aerial-sample.json; scripts/caledon-aerial/strips.py
// draws each permit's yearly photo strip (it needs utility.arcgis.com).
// Caledon house permits first issued 2019-01..2024-06, Issued or Closed; seeded stratified sample.
const P = require('../../js/phases.js');
const R = require('../../scripts/cmhc-reconcile.js');
const { decodeRecord } = require('../../scripts/build-snapshot.js');
const snap = require('../../data/snapshot.json');
const names = new Map(snap.sources.map(s => [s.id, s.name]));
const pop = [];
for (const o of snap.records) {
  if (o.municipality !== 'Caledon' || o.kind !== 'permit') continue;
  const r = decodeRecord(o, names.get(String(o.sourceId).split('/')[0]));
  const status = String(r.statusRaw || '').trim();
  if (!/^(issued|closed)$/i.test(status) || !(r.units > 0 && r.units < 20) || P.permitRole(r) !== 'units') continue;
  const iss = r.events.filter(e => e.phase === 'permit').map(e => +e.date); if (!iss.length) continue;
  const issued = new Date(Math.min(...iss)); if (issued < new Date('2019-01-01') || issued >= new Date('2024-07-01')) continue;
  if (!(r.lat && r.lng)) continue;
  pop.push({ ref: r.ref, status: /issued/i.test(status) ? 'open' : 'closed', issued: issued.toISOString().slice(0, 10), year: issued.getUTCFullYear(), units: r.units, type: R.dwellingType(r), address: r.address, lat: r.lat, lng: r.lng, desc: String(r.description || '').slice(0, 90) });
}
// seeded shuffle (mulberry32), then proportional allocation by status x issue year
let a = 20261106; const rnd = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const shuffled = pop.map(x => [rnd(), x]).sort((p, q) => p[0] - q[0]).map(p => p[1]);
const sample = [];
for (const st of ['open', 'closed']) {
  const g = shuffled.filter(x => x.status === st), byY = {};
  for (const x of g) (byY[x.year] = byY[x.year] || []).push(x);
  const quota = Object.fromEntries(Object.entries(byY).map(([y, xs]) => [y, Math.round(75 * xs.length / g.length)]));
  for (const [y, xs] of Object.entries(byY)) sample.push(...xs.slice(0, quota[y]));
}
const pilot = [...sample.filter(x => x.status === 'open').slice(0, 5), ...sample.filter(x => x.status === 'closed').slice(0, 5)];
const count = (xs, k) => xs.reduce((o, x) => (o[x[k]] = (o[x[k]] || 0) + 1, o), {});
console.log('population', pop.length, count(pop, 'status'), 'by year', JSON.stringify(count(pop, 'year')), 'types', JSON.stringify(count(pop, 'type')));
console.log('sample', sample.length, count(sample, 'status'), JSON.stringify(count(sample, 'type')));
require('fs').writeFileSync(require('path').join(__dirname, '..', '..', 'docs', 'completions-calibration', 'caledon-aerial-sample.json'), JSON.stringify({ seed: 20261106, population: pop.length, sample, pilot }, null, 1));
for (const x of pilot) console.log(x.status, x.issued, x.ref, x.units, x.type, '|', x.address, '|', x.desc, '|', x.lat, x.lng);
