#!/usr/bin/env node
/*
 * Build data/fsr-outlets.json: where each Functional Servicing Report (FSR) says the development's
 * sanitary flows go, for QA/QC › Review outlets (js/dev-outlets.js).
 *
 *  1. Fetch (--fetch): each FSR linked in data/fsr.json (scripts/build-fsr.js) is downloaded and
 *     turned into text with pdftotext (poppler-utils), the first MAX_PAGES pages, one file per FSR
 *     in --raw with index.json. The sandbox can't reach the municipal sites: this runs in the probe
 *     workflow (mode=fsr-outlets), which also pushes the texts to the fsr-raw branch for review.
 *  2. Read: in each text, the sentences about the sanitary outlet are scored (sanitary + a word of
 *     connecting or discharging + a pipe size + a street, less for storm / water / internal pipes);
 *     the best one is read for the pipe's size, street, status (existing / proposed / future), a
 *     manhole and a Region project number. Each FSR keeps its best few sentences with their page,
 *     so a reviewer reads the report's own words.
 *
 *   node scripts/build-fsr-outlets.js --fetch --raw /tmp/fsr-raw --out data
 *   node scripts/build-fsr-outlets.js --raw <dir with the texts> --out data
 * Nothing is written when no text was read (the old file stays).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const MAX_PAGES = 120, MAX_MB = 250;

// ---- Reading a report --------------------------------------------------------------------------
const SUFFIX = 'Road|Rd|Street|St|Avenue|Ave|Drive|Dr|Boulevard|Blvd|Way|Crescent|Cres|Lane|Ln|Line|Sideroad|Side Road|Parkway|Pkwy|Court|Ct|Trail|Gate|Circle|Place|Pl|Terrace|Highway|Hwy';
const STREET = new RegExp(`\\b(?:Regional Road|Highway|Hwy)\\s*\\d+\\b|\\b(?:[A-Z][A-Za-z'.-]+|\\d+(?:st|nd|rd|th)|[A-Z]{2,})(?:\\s+(?:[A-Z][A-Za-z'.-]+|of|the))*\\s+(?:${SUFFIX})\\b(?:\\s+(?:East|West|North|South|E|W|N|S)\\b)?`, 'g');
const MM = /(?:Ø\s*)?(\d{3,4})\s*(?:mm|millimet(?:re|er)s?)\s*(?:Ø|ø|dia(?:meter|\.)?)?/gi;
const OUTLET_VERB = /\b(connect\w*|discharg\w*|outlet\w*|convey\w*|tie[sd]?[- ]in|tied|drain\w*|direct\w*|servic(?:ed|ing)\s+(?:by|from|via)|flow\w*\s+(?:to|into)|receiv\w*)\b/i;
const OFF = /\b(storm(?:water)?|watermain|water\s*main|domestic water|fire\s*(?:line|service)|swm|culvert|catch\s*basin)\b/i;
const INTERNAL = /\b(internal|on-?site|private|within the (?:site|subject|development)|proposed internal)\b/i;
const sentences = page => page.replace(/-\n(?=[a-z])/g, '').replace(/\s*\n\s*/g, ' ').split(/(?<=[.;:])\s+(?=[A-Z(])/).map(s => s.trim()).filter(s => s.length > 25 && s.length < 700);
// No municipal sewer: a septic system or other private sewage system.
const SEPTIC = /\bseptic\b|private (?:sewage|wastewater)|subsurface (?:disposal|sewage)|no municipal sanitary|tertiary treatment|on-?site sewage/i;
function score(s) {
  if (!/\bsanitary\b/i.test(s) && !SEPTIC.test(s)) return 0;
  let v = 2;
  // (a drawing legend, a statistics block or a flow table read as one long run of text)
  if (/\bDENOTES\b|\bSTATISTICS\b|FLOW CALCULATIONS|References\/Notes/.test(s) || (s.match(/\b[A-Z]{3,}\b/g) || []).length > 12) v -= 4;
  if (s.length > 450) v -= 1;
  if (OUTLET_VERB.test(s)) v += 3;
  if (/\bsewers?\b/i.test(s)) v += 1;
  if (/\d{3,4}\s*(?:mm|millimet)/i.test(s)) v += 2;
  if (new RegExp(STREET.source).test(s)) v += 2;
  if (/\b(existing|proposed|future|planned|regional|trunk)\b/i.test(s)) v += 1;
  if (/\bmanhole\b|\bMH\s*-?\s*\d/i.test(s)) v += 1;
  if (OFF.test(s) && !/\bsanitary\b[^.]{0,40}\b(sewer|outlet|connection)/i.test(s)) v -= 3;
  if (INTERNAL.test(s)) v -= 2;
  if (/\bL\/s\b|\bpeak\b|\bpopulation\b|\bper capita\b|\bdesign flow/i.test(s)) v -= 1;
  return v;
}
// The outlet a sentence names: { mm, street, status, mh, project } (status 'septic': no municipal sewer).
// The size: of the sewer flows go TO (after "connect to", "discharge to", "existing …"), before the
// words sanitary / sewer / trunk; not a site's lateral or service connection, a watermain or a storm pipe.
// The street: the one the sewer is on / along / within, after that size first.
const WORDS = 'Stormwater|Management|Report|Servicing|Functional|Preliminary|Final|Planning|Received|Sanitary|Storm|Sewer|Sewers|Trunk|Existing|Proposed|Future|Municipal|Local|The|An?|To|And|Of|Town|City|Region|Drawing|Appendix|Table|Section|Figure|Plan|Site';
const LEAD = new RegExp(`^(?:(?:${WORDS}|Regional(?!\\s+Road\\s*\\d)|[A-Z]{2,}(?=\\s+[A-Z][a-z]))\\s+)+`);
function readOutlet(s) {
  const sizes = [...s.matchAll(MM)].map(m => ({ mm: +m[1], i: m.index, end: m.index + m[0].length })).filter(m => m.mm >= 100 && m.mm <= 3600).map(m => {
    const before = s.slice(Math.max(0, m.i - 60), m.i), after = s.slice(m.end, m.end + 45);
    let v = 0;
    if (/^\s*(?:\w+\s+){0,3}?(sanitary|san\b|sewer|trunk)/i.test(after)) v += 2;
    if (/(connect\w*|discharg\w*|outlet\w*|convey\w*|tie[sd]?[- ]in|drain\w*|carried by|serviced by|available from|discharging to|connection to)\s+(?:\w+\s+){0,4}$/i.test(before)) v += 3;
    if (/\b(existing|future|ultimate)\s+(?:\w+\s+){0,2}$/i.test(before)) v += 2;
    if (/^\s*(?:\w+\s+){0,3}?(service\s+(?:connection|lateral)|(?:sewer\s+)?connection\b|lateral|watermain|water\s*main|storm|forcemain|force\s*main|culvert|CSP|catch)/i.test(after)) v -= 4;
    if (/\b(internal|local|on-?site|private|new)\s+(?:\w+\s+){0,1}$/i.test(before)) v -= 2;
    // (further down the chain: "…, which drains to a 375 mm sewer", "ultimately to the 1200 mm trunk")
    if (/\b(which|that)\s+(drains?|flows?|discharges?|conveys?|connects?)\b|\bdownstream\b|\bultimate(?:ly)?\b|\bvia twin\b/i.test(before)) v -= 3;
    return { ...m, v };
  });
  const best = sizes.sort((a, b) => b.v - a.v || a.i - b.i)[0] || null, mm = best && best.v > -2 ? best.mm : null;
  const clean = x => x.replace(LEAD, '').trim();
  const streets = [...s.matchAll(STREET)].map(m => ({ name: clean(m[0]), i: m.index, prep: /\b(on|along|within|in|at|of|fronting|beneath|under|across)\s+(?:the\s+)?(?:existing\s+|future\s+)?$/i.test(s.slice(Math.max(0, m.index - 22), m.index)) }))
    .filter(x => x.name && !/^(?:Functional|Servicing|Sanitary|Storm|Region|Town|City|Report|Management)\b/i.test(x.name) && /\s/.test(x.name));
  const from = best ? best.i : 0;
  const street = (streets.find(x => x.prep && x.i >= from) || streets.find(x => x.prep) || streets.find(x => x.i >= from) || streets[0] || {}).name || null;
  // (the status written next to the sewer: "existing 250 mm sanitary sewer", "the future trunk")
  const near = w => new RegExp(`\\b${w}\\s+(?:\\S+\\s+){0,6}?(sanitary|san\\b|sewer|trunk)`, 'i').test(s);
  const septic = SEPTIC.test(s) && (!/\bsanitary sewer\b/i.test(s) || /\bno (?:municipal )?sanitary\b/i.test(s));
  if (septic) return { mm: null, street: null, status: 'septic', mh: null, project: null };
  const status = septic ? 'septic' : near('(?:future|planned|ultimate)') ? 'future' : near('existing') ? 'existing' : near('proposed') ? 'proposed' : null;
  const mh = (/\b(?:MH|SMH|manhole)\s*(?:no\.?|#)?\s*-?\s*([A-Z]?\d+[A-Z]?)\b/i.exec(s) || [])[1] || null;
  const project = (/\b(\d{2}-\d{4})\b/.exec(s) || [])[1] || null;
  return { mm, street, status, mh, project };
}
// A report's text (pages split by form feeds) → { outlet, quotes: [{ page, text, score }], confidence } | null.
function findOutlet(text, keep = 3) {
  const found = [];
  String(text || '').split('\f').forEach((pg, i) => { for (const s of sentences(pg)) { const v = score(s); if (v >= 5) found.push({ page: i + 1, text: s, score: v }); } });
  if (!found.length) return null;
  // (the same sentence repeated (an executive summary and its section): once, at its first page)
  const seen = new Set(), quotes = found.sort((a, b) => b.score - a.score || a.page - b.page).filter(q => { const k = q.text.toLowerCase().replace(/\W+/g, ' ').slice(0, 120); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, keep);
  const outlet = readOutlet(quotes[0].text);
  const confidence = outlet.status === 'septic' ? (quotes[0].score >= 5 ? 'medium' : 'low') : quotes[0].score >= 10 && outlet.mm && outlet.street ? 'high' : quotes[0].score >= 8 && (outlet.mm || outlet.street) ? 'medium' : 'low';
  return { outlet, quotes, confidence };
}

// ---- Fetch ---------------------------------------------------------------------------------------
const slug = s => String(s).toLowerCase().replace(/^https?:\/\//, '').replace(/[^a-z0-9]+/g, '-').slice(-120);
async function fetchAll(items, raw) {
  fs.mkdirSync(raw, { recursive: true });
  const index = [];
  for (const it of items) {
    const url = it.fsr.url, id = slug(url), pdf = path.join('/tmp', `${id}.pdf`), row = { id, url, muni: it.muni, keys: it.keys, page: it.page, date: it.fsr.date || null };
    try {
      const r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (peel-dev-tracker FSR outlet read)' }, redirect: 'follow' });
      const buf = Buffer.from(await r.arrayBuffer());
      Object.assign(row, { status: r.status, mb: +(buf.length / 1e6).toFixed(2), type: r.headers.get('content-type') });
      if (!r.ok || buf.length > MAX_MB * 1e6 || buf.slice(0, 4).toString() !== '%PDF') { row.skipped = !r.ok ? 'http' : buf.length > MAX_MB * 1e6 ? 'too large' : 'not a PDF'; index.push(row); console.log(`skip ${row.skipped} ${url}`); continue; }
      fs.writeFileSync(pdf, buf);
      const txt = execFileSync('pdftotext', ['-l', String(MAX_PAGES), '-enc', 'UTF-8', pdf, '-'], { maxBuffer: 128e6, timeout: 120000 }).toString();
      fs.writeFileSync(path.join(raw, `${id}.txt`), txt); fs.unlinkSync(pdf);
      Object.assign(row, { file: `${id}.txt`, pages: txt.split('\f').length - 1, chars: txt.length });
      console.log(`${row.mb} MB, ${row.pages} pages, ${(txt.length / 1e3).toFixed(0)}k chars  ${url}`);
    } catch (e) { row.error = String(e.message || e).slice(0, 200); console.log(`ERR ${url} ${row.error}`); }
    index.push(row);
  }
  fs.writeFileSync(path.join(raw, 'index.json'), JSON.stringify(index, null, 1));
  return index;
}

// ---- Build ---------------------------------------------------------------------------------------
function build(index, raw) {
  const out = [];
  for (const row of index) {
    if (!row.file || !fs.existsSync(path.join(raw, row.file))) continue;
    const text = fs.readFileSync(path.join(raw, row.file), 'utf8');
    // (a scanned report has no text layer: said so, nothing read)
    if (text.replace(/\s/g, '').length < 500) { out.push({ muni: row.muni, keys: row.keys, url: row.url, date: row.date, scanned: true }); continue; }
    const f = findOutlet(text);
    out.push({ muni: row.muni, keys: row.keys, url: row.url, date: row.date, ...(f ? { outlet: f.outlet, confidence: f.confidence, quotes: f.quotes } : { none: true }) });
  }
  return out;
}

async function main() {
  const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
  const raw = path.resolve(arg('--raw') || '/tmp/fsr-raw'), outDir = path.resolve(arg('--out') || 'data');
  let index;
  if (process.argv.includes('--fetch')) {
    const fsr = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'fsr.json'), 'utf8'));
    index = await fetchAll(fsr.items.filter(i => i.fsr && i.fsr.url), raw);
  } else index = JSON.parse(fs.readFileSync(path.join(raw, 'index.json'), 'utf8'));
  const items = build(index, raw);
  if (!items.length) { console.log('no report text read: data/fsr-outlets.json left as it was'); process.exitCode = 1; return; }
  const n = c => items.filter(x => x.confidence === c).length;
  fs.writeFileSync(path.join(outDir, 'fsr-outlets.json'), JSON.stringify({ version: 1, generatedAt: new Date().toISOString().slice(0, 10),
    note: 'Where each FSR says the sanitary flows go (scripts/build-fsr-outlets.js): outlet read from the best sentence (mm, street, status, manhole, Region project), with the report\'s own words and page. Read by machine: a reviewer confirms it (QA/QC › Review outlets).',
    items }));
  console.log(`FSRs read: ${items.length} (high ${n('high')}, medium ${n('medium')}, low ${n('low')}, no outlet sentence ${items.filter(x => x.none).length}, scanned ${items.filter(x => x.scanned).length})`);
  for (const x of items.filter(i => i.quotes).slice(0, 80)) console.log(`  [${x.confidence}] ${x.outlet.mm || '?'} mm · ${x.outlet.street || '?'} · ${x.outlet.status || '?'}  p.${x.quotes[0].page}: ${x.quotes[0].text.slice(0, 200)}`);
}
if (require.main === module) main();
else module.exports = { findOutlet, readOutlet, score, sentences };
