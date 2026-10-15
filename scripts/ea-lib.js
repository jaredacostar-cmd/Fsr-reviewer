/*
 * Pure helpers for the Region of Peel environmental assessments (EAs) list and project pages.
 * No network access: scripts/build-eas.js fetches; this module parses, classifies, places and
 * links, so every rule is unit-tested.
 *
 * Privacy: contact blocks (names, phone numbers, e-mail addresses) are never extracted; any text
 * segment that looks like contact information is dropped before a purpose or next step is drafted.
 */
'use strict';
const crypto = require('crypto');
const C = require('./capital-lib.js');

const SYSTEMS = ['water', 'wastewater', 'roads', 'storm', 'multi'];
const SCHEDULES = ['A+', 'B', 'C', 'master plan', 'IEA', 'unknown'];
const STATUSES = ['commenced', 'consultation', 'report review', 'complete', 'addendum', 'unknown'];
const GEOM_TYPES = ['facility', 'linear', 'road', 'area', 'approx'];
const MUNIS = ['Brampton', 'Caledon', 'Mississauga'];

// ---- HTML ------------------------------------------------------------------------------------
const ENT = { amp: '&', nbsp: ' ', '#160': ' ', ndash: '–', mdash: '—', '#8211': '–', '#8212': '—', rsquo: '\'', lsquo: '\'', '#8217': '\'', ldquo: '"', rdquo: '"', quot: '"', apos: '\'', '#39': '\'', lt: '<', gt: '>', eacute: 'é' };
const decode = s => String(s).replace(/&([a-z0-9#]+);/gi, (m, k) => ENT[k.toLowerCase()] ?? (k[0] === '#' ? String.fromCharCode(k[1] === 'x' ? parseInt(k.slice(2), 16) : +k.slice(1)) : m));
const text = h => decode(String(h).replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
// Block-level text: one line per block element, so lists and paragraphs stay separate.
function lines(h) {
  return decode(String(h).replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<\/?(p|li|h[1-6]|div|tr|td|th|br|dt|dd|section|article|ul|ol|table|summary|details|button)\b[^>]*>/gi, '\n').replace(/<[^>]+>/g, ' '))
    .split('\n').map(s => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
}
// Main content of a Drupal / peelregion.ca page (falls back to the body).
function mainHtml(html) {
  const h = String(html || '');
  for (const re of [/<main\b[\s\S]*?<\/main>/i, /<div[^>]+id="main-content"[\s\S]*?<footer/i, /<div[^>]+class="[^"]*(?:region-content|field--name-body|page-content)[^"]*"[\s\S]*?<footer/i, /<body\b[\s\S]*<\/body>/i]) {
    const m = re.exec(h); if (m) return m[0].replace(/<(nav|header|footer|aside)\b[\s\S]*?<\/\1>/gi, ' ');
  }
  return h;
}
function links(html, base) {
  const out = [];
  for (const m of String(html).matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    let u; try { u = new URL(decode(m[1]), base).href; } catch { continue; }
    if (/^(mailto|tel|javascript):/i.test(u)) continue;
    out.push({ url: u.replace(/#.*$/, ''), label: text(m[2]) });
  }
  return out;
}

// ---- names -----------------------------------------------------------------------------------
const normName = s => String(s || '').toLowerCase().replace(/[‐-―–—]/g, '-').replace(/&/g, ' and ').replace(/\b(rd)\b/g, 'road').replace(/\b(st)\b/g, 'street').replace(/\b(ave)\b/g, 'avenue')
  .replace(/\b(dr)\b/g, 'drive').replace(/\b(blvd)\b/g, 'boulevard').replace(/[^a-z0-9]+/g, ' ').trim();
const slug = s => normName(s).replace(/\s+/g, '-').slice(0, 80);
const STOP = new Set(['the', 'and', 'of', 'for', 'to', 'in', 'a', 'at', 'on', 'from', 'class', 'municipal', 'environmental', 'assessment', 'assessments', 'ea', 'study', 'studies', 'schedule', 'project', 'region', 'peel', 'improvements', 'improvement', 'b', 'c']);
const tokens = s => normName(s).split(' ').filter(t => t && !STOP.has(t));

const LIST_SKIP = /^(home|menu|search|skip to|back to|contact|share|print|subscribe|related|was this page|feedback|accessibility|privacy|terms|copyright|follow us|sign in|log in|list of environment(al)? assessments|environmental assessments?|current|completed|on this page|last updated|translate)\b/i;
/**
 * EA names from the list page, with the heading (municipality) they sit under and any link.
 * Names repeated under two municipalities collapse into one EA listing both.
 */
function parseList(html, base) {
  const h = mainHtml(html);
  const out = [];
  let muni = null;
  const re = /<(h[1-6]|li|p|a|strong|summary|button)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  for (const m of h.matchAll(re)) {
    const tag = m[1].toLowerCase(), inner = m[2], t = text(inner);
    if (!t) continue;
    const isHead = /^h[1-6]$|summary|button/.test(tag) || (tag === 'strong' && t.length < 40);
    const mu = MUNIS.find(x => new RegExp(`^(city of |town of )?${x}\\b`, 'i').test(t) && t.length < 40);
    if (isHead) { if (mu) muni = mu; else if (/regional|region.?wide|peel.?wide|multiple|all municipalities/i.test(t) && t.length < 40) muni = 'Region-wide'; continue; }
    if (!/^(li|p|a)$/.test(tag) || t.length < 6 || t.length > 220 || LIST_SKIP.test(t)) continue;
    if (tag === 'li' && /<(ul|ol)\b/i.test(inner)) continue; // nested list wrapper
    if (/\b(phone|email|tel\.?|ext\.)\b|@/i.test(t)) continue;
    if (tag === 'p' && t.split(' ').length > 25) continue;   // prose paragraph, not a name
    const a = links(inner, base)[0];
    out.push({ name: t.replace(/\s*\((pdf|opens? in new window)[^)]*\)\s*/gi, ' ').trim(), municipality: muni, href: a ? a.url : null });
  }
  return dedupe(out);
}
function dedupe(items) {
  const by = new Map();
  for (const it of items) {
    const k = normName(it.name);
    if (!k) continue;
    const cur = by.get(k);
    if (!cur) { by.set(k, { name: it.name, municipalities: it.municipality ? [it.municipality] : [], href: it.href || null }); continue; }
    if (it.municipality && !cur.municipalities.includes(it.municipality)) cur.municipalities.push(it.municipality);
    if (!cur.href && it.href) cur.href = it.href;
  }
  return [...by.values()];
}

// Words too common across EA names to identify one on their own.
const GENERIC_WORDS = new Set(['water', 'wastewater', 'sanitary', 'sewer', 'sewers', 'trunk', 'road', 'street', 'drive', 'avenue', 'boulevard', 'line', 'elevated', 'tank', 'reservoir', 'pumping', 'station', 'servicing', 'watermain', 'main', 'mains', 'expansion', 'new', 'facility', 'treatment', 'plant', 'storage', 'system', 'upgrades', 'upgrade', 'widening', 'east', 'west', 'north', 'south', 'phase', 'resource', 'recovery', 'transmission', 'feedermain', 'twinning', 'diversion']);
/**
 * Best candidate page for an EA name: share of the name's distinctive words (not GENERIC_WORDS)
 * found in the page's link label / title / address; ≥ 0.5, ties broken by all shared words.
 */
function findPage(name, candidates) {
  const all = tokens(name);
  const a = new Set(all.filter(t => !GENERIC_WORDS.has(t)));
  const base = a.size ? a : new Set(all);
  if (!base.size) return null;
  let best = null;
  for (const c of candidates) {
    const b = new Set(tokens(`${c.label || ''} ${c.title || ''} ${decodeURIComponent(String(c.url).split('/').filter(Boolean).pop() || '').replace(/\.aspx?$|[-_.]/g, ' ')}`));
    let hit = 0, any = 0;
    for (const t of base) if (b.has(t)) hit++;
    for (const t of all) if (b.has(t)) any++;
    const score = hit / base.size;
    if (score >= 0.5 && (!best || score > best.score || (score === best.score && any > best.any))) best = { url: c.url, score: Math.round(score * 100) / 100, any };
  }
  return best && { url: best.url, score: best.score };
}

// ---- classification -------------------------------------------------------------------------
function systemOf(name, body = '') {
  const s = `${name}`.toLowerCase();
  const hit = {
    water: /water ?main|feedermain|transmission main|reservoir|elevated tank|\bwells?\b|\bintake\b|\bwater\b/.test(s.replace(/water resource recovery/g, '')),
    wastewater: /sanitary|wastewater|sewage|\bsewer\b|trunk sewer|resource recovery|wrrf|forcemain|force main|biosolids|pollution control|outfall/.test(s) && !/storm ?sewer/.test(s),
    storm: /storm|flood|drainage|erosion/.test(s),
    roads: /\broad\b|\brd\b|street|avenue|drive|boulevard|\bline\b|sideroad|intersection|widening|corridor|highway|bridge|transportation|\bconnection\b/.test(s),
  };
  const svc = ['water', 'wastewater', 'storm'].filter(k => hit[k]);
  if (svc.length > 1) return 'multi';
  if (svc.length === 1) return svc[0];
  if (hit.roads) return 'roads';
  const b = String(body).toLowerCase();
  const bodyHit = ['water', 'wastewater', 'storm'].filter(k => (k === 'water' ? /\bwater ?main|watermain|water servicing|water supply/ : k === 'wastewater' ? /sanitary|wastewater/ : /stormwater/).test(b));
  if (bodyHit.length === 1) return bodyHit[0];
  if (bodyHit.length > 1) return 'multi';
  return 'multi';
}

function scheduleOf(t) {
  const s = String(t || '');
  if (/individual environmental assessment|individual EA\b|\bIEA\b/i.test(s)) return 'IEA';
  if (/schedule\s*['"‘’“”]?\s*A\s*\+/i.test(s)) return 'A+';
  if (/schedule\s*['"‘’“”]?\s*C\b/i.test(s)) return 'C';
  if (/schedule\s*['"‘’“”]?\s*B\b/i.test(s)) return 'B';
  if (/master\s*plan/i.test(s)) return 'master plan';
  return 'unknown';
}

// ---- dates -----------------------------------------------------------------------------------
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const MON = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?';
const pad = n => String(n).padStart(2, '0');
/** Dates in a string, in order: "March 4, 2025", "4 March 2025", "March 2025", "2025-03-04". */
function datesIn(s) {
  const out = [];
  const str = String(s || '');
  const re = new RegExp(`\\b${MON}\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(20\\d\\d)\\b|\\b(\\d{1,2})\\s+${MON}\\s+(20\\d\\d)\\b|\\b${MON}\\s+(20\\d\\d)\\b|\\b(20\\d\\d)-(\\d{2})-(\\d{2})\\b`, 'gi');
  for (const m of str.matchAll(re)) {
    let d;
    if (m[1]) d = `${m[3]}-${pad(MONTHS[m[1].toLowerCase().slice(0, 3)])}-${pad(m[2])}`;
    else if (m[5]) d = `${m[6]}-${pad(MONTHS[m[5].toLowerCase().slice(0, 3)])}-${pad(m[4])}`;
    else if (m[7]) d = `${m[8]}-${pad(MONTHS[m[7].toLowerCase().slice(0, 3)])}`;
    else d = `${m[9]}-${m[10]}-${m[11]}`;
    out.push({ date: d, index: m.index });
  }
  return out;
}

const MILESTONE_RE = [
  ['commencement', /notice of (study )?commencement|study commence|commenced in|initiated in|study began/i],
  ['pic', /public information cent(re|er)|\bPICs?\b|public open house|community (information )?meeting|virtual (public )?meeting|public consultation (centre|event|session)/i],
  ['addendum', /addendum/i],
  ['completion', /notice of (study )?completion|notice of filing|study completion|ESR (was )?(finali[sz]ed|completed)|project file (report )?(was )?(finali[sz]ed|completed)/i],
  ['reviewEnd', /review period|comments? (are|must be) (received|submitted) by|available for (public )?review (until|from)|30-day (public )?review|review (ends|closes)|comment period/i],
  ['report', /environmental study report|\bESR\b|project file report/i],
];
const CONTACT = /\b(contact|project manager|consultant|phone|telephone|tel\.?|email|e-mail|ext\.?|fax|mailing list|P\.\s?Eng|M\.\s?Sc|Ph\.?D)\b|@|\(\d{3}\)|\d{3}[-.\s]\d{3}[-.\s]\d{4}/i;

/** Milestones [{type, date}] from page lines; a line can carry several milestone types. */
function milestonesOf(ls) {
  const out = [];
  const seen = new Set();
  for (const l of ls) {
    if (CONTACT.test(l)) continue;
    const ds = datesIn(l);
    if (!ds.length) continue;
    for (const [type, re] of MILESTONE_RE) {
      const m = re.exec(l);
      if (!m) continue;
      // the date nearest after the keyword, else the nearest before it
      const after = ds.filter(d => d.index >= m.index), d = (after.length ? after[0] : ds[ds.length - 1]).date;
      if (type === 'report' && out.some(x => x.date === d)) continue;
      if (type === 'reviewEnd') {
        const range = ds.filter(x => x.index >= m.index - 60);
        const end = range.length > 1 ? range[range.length - 1].date : d;
        const k = `${type}|${end}`; if (!seen.has(k)) { seen.add(k); out.push({ type, date: end }); }
        continue;
      }
      const k = `${type}|${d}`; if (!seen.has(k)) { seen.add(k); out.push({ type, date: d }); }
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Status:
 *   addendum       an addendum notice / milestone
 *   report review  notice of completion issued and its review period still open (end ≥ today)
 *   complete       notice of completion issued (review period over or not stated)
 *   consultation   a public information centre / consultation held or scheduled
 *   commenced      notice of commencement only
 *   unknown        no page or nothing recognisable
 */
function statusOf(ms, { hasCompletionNotice = false, hasAddendum = false, today }) {
  const has = t => ms.some(m => m.type === t);
  const now = today || new Date().toISOString().slice(0, 10);
  if (hasAddendum || has('addendum')) return 'addendum';
  if (has('completion') || hasCompletionNotice) {
    const rev = ms.filter(m => m.type === 'reviewEnd').map(m => m.date).sort().pop();
    return rev && rev >= now.slice(0, rev.length) ? 'report review' : 'complete';
  }
  if (has('pic')) return 'consultation';
  if (has('commencement')) return 'commenced';
  return 'unknown';
}

/** Next step: the review period end if still open, else the next dated milestone ahead. */
function nextStepOf(ms, ls, today) {
  const now = today || new Date().toISOString().slice(0, 10);
  const ahead = ms.filter(m => m.date >= now.slice(0, m.date.length));
  const rev = ahead.find(m => m.type === 'reviewEnd');
  if (rev) return { text: 'Review period ends', date: rev.date };
  const LABEL = { pic: 'Public information centre', completion: 'Notice of completion', commencement: 'Notice of commencement', report: 'Report released', addendum: 'Addendum' };
  if (ahead.length) return { text: LABEL[ahead[0].type] || ahead[0].type, date: ahead[0].date };
  for (const l of ls) {
    if (CONTACT.test(l)) continue;
    const m = /\bnext steps?\b[:\s-]*(.{10,160})/i.exec(l);
    if (m) return { text: m[1].replace(/\s+/g, ' ').trim().slice(0, 140), date: null };
  }
  return null;
}

/** One-line purpose draft from the page (first sentence that says what the study does). */
function purposeDraft(ls) {
  for (const l of ls) {
    if (l.length < 40 || CONTACT.test(l)) continue;
    const s = l.split(/(?<=[.!?])\s+/).find(x => /\b(study|EA|assessment)\b.*\b(will|to|is)\b|\bpurpose\b|\bto (identify|address|assess|evaluate|determine|accommodate|provide|improve|service)\b/i.test(x) && x.length >= 40);
    if (s) return s.replace(/\s+/g, ' ').trim().slice(0, 220);
  }
  return null;
}

/** Report, appendix and notice links on a project page (documents only, de-duplicated). */
function docLinks(html, base) {
  const out = { report: null, appendices: [], notices: [] };
  const seen = new Set();
  for (const l of links(mainHtml(html), base)) {
    const label = `${l.label} ${decodeURIComponent(l.url.split('/').pop() || '')}`;
    if (!/\.pdf(\?|$)|\/sites\/default\/files\/|\/media\/|\/document/i.test(l.url) || seen.has(l.url)) continue;
    seen.add(l.url);
    const item = { label: l.label.slice(0, 140) || 'Document', url: l.url };
    if (/notice/i.test(label)) out.notices.push(item);
    else if (/append|appx|\bapp\.?\s?[a-z0-9]\b/i.test(label)) out.appendices.push(item);
    else if (!out.report && /report|\bESR\b|project file|final|master plan|study/i.test(label)) out.report = item;
  }
  return out;
}

/** Everything read from one project page. */
function parsePage(html, url, { today } = {}) {
  const h = mainHtml(html);
  const ls = lines(h);
  const body = ls.join('\n');
  const docs = docLinks(html, url);
  const ms = milestonesOf(ls);
  const noticeText = docs.notices.map(n => n.label).join(' | ');
  const status = statusOf(ms, { hasCompletionNotice: /notice of (study )?completion/i.test(noticeText), hasAddendum: /addendum/i.test(noticeText), today });
  const completion = ms.filter(m => m.type === 'completion').map(m => m.date).sort().pop();
  return {
    title: (/<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(html) || [])[1] ? text(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(html)[1]) : null,
    schedule: scheduleOf(body),
    milestones: ms,
    status,
    nextStep: status === 'complete' ? null : nextStepOf(ms, ls, today),
    completedYear: status === 'complete' || status === 'addendum' ? (completion ? +completion.slice(0, 4) : null) : null,
    purpose: purposeDraft(ls),
    links: { page: url, report: docs.report, appendices: docs.appendices, notices: docs.notices },
    pageHash: pageHash(body),
    bodyText: body,
  };
}

/** Hash of the page's main text (whitespace-normalised); dates "last updated" excluded. */
function pageHash(body) {
  const norm = String(body).replace(/(last (updated|modified|reviewed)|page updated)[^\n]*/gi, '').replace(/\s+/g, ' ').trim();
  return crypto.createHash('sha256').update(norm).digest('hex').slice(0, 16);
}

// ---- geometry --------------------------------------------------------------------------------
/** "Mayfield Road – Hurontario Street to Chinguacousy Road" → { road, from, to }. */
function parseRoad(name) {
  const s = String(name || '').replace(/\s+/g, ' ').trim();
  let m = /^(.+?)\s*(?:[–—-]|,|:|\()\s*(?:from\s+)?(.+?)\s+to\s+(.+?)\)?(?:\s+(?:class |municipal )?(?:environmental assessment|ea|study|improvements?|widening).*)?$/i.exec(s)
    || /^(.+?)\s+(?:from|between)\s+(.+?)\s+(?:to|and)\s+(.+?)(?:\s+(?:class |municipal )?(?:environmental assessment|ea|study|improvements?|widening).*)?$/i.exec(s);
  if (!m) return null;
  const clean = x => x.replace(/\b(class environmental assessment|environmental assessment|class ea|municipal class|study|improvements?|widening|reconstruction|\bea\b)\b/gi, '').replace(/[()]/g, '').replace(/\s+/g, ' ').trim();
  const road = clean(m[1]), from = clean(m[2]), to = clean(m[3]);
  if (!road || !from || !to || C.streetTokens(road).length === 0) return null;
  return { road, from, to };
}

const projector = lat0 => { const kx = 111320 * Math.cos(lat0 * Math.PI / 180), ky = 110574; return { f: ([x, y]) => [x * kx, y * ky], inv: ([x, y]) => [x / kx, y / ky] }; };
function nearestOnPaths(pt, paths, P) {
  const p = P.f(pt);
  let best = { d: Infinity };
  paths.forEach((path, pi) => {
    let acc = 0;
    for (let i = 1; i < path.length; i++) {
      const a = P.f(path[i - 1]), b = P.f(path[i]), dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy, L = Math.sqrt(L2);
      let t = L2 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2 : 0; t = Math.max(0, Math.min(1, t));
      const q = [a[0] + t * dx, a[1] + t * dy], d = Math.hypot(p[0] - q[0], p[1] - q[1]);
      if (d < best.d) best = { d, path: pi, at: acc + t * L, q: P.inv(q) };
      acc += L;
    }
  });
  return best;
}
// Chain ways that share endpoints into longer paths.
function chain(ways) {
  const paths = ways.map(w => w.slice());
  const key = p => `${p[0].toFixed(6)},${p[1].toFixed(6)}`;
  let merged = true;
  while (merged) {
    merged = false;
    outer: for (let i = 0; i < paths.length; i++) for (let j = 0; j < paths.length; j++) {
      if (i === j) continue;
      const a = paths[i], b = paths[j];
      let joined = null;
      if (key(a[a.length - 1]) === key(b[0])) joined = a.concat(b.slice(1));
      else if (key(a[a.length - 1]) === key(b[b.length - 1])) joined = a.concat(b.slice().reverse().slice(1));
      else if (key(a[0]) === key(b[b.length - 1])) joined = b.concat(a.slice(1));
      else if (key(a[0]) === key(b[0])) joined = b.slice().reverse().concat(a.slice(1));
      if (joined) { paths[i] = joined; paths.splice(j, 1); merged = true; break outer; }
    }
  }
  return paths;
}
// Where two sets of lines cross / come closest (within tol m): a point on the first set.
function crossing(roadPaths, crossPaths, tol = 40) {
  if (!roadPaths.length || !crossPaths.length) return null;
  const P = projector(roadPaths[0][0][1]);
  let best = null;
  for (const cp of crossPaths) for (const v of densify(cp, 10)) {
    const n = nearestOnPaths(v, roadPaths, P);
    if (n.d <= tol && (!best || n.d < best.d)) best = n;
  }
  return best;
}
function densify(path, step) {
  const out = [path[0]];
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i], L = C.haversine(a, b), n = Math.floor(L / step);
    for (let k = 1; k <= n; k++) out.push([a[0] + (b[0] - a[0]) * k / (n + 1), a[1] + (b[1] - a[1]) * k / (n + 1)]);
    out.push(b);
  }
  return out;
}
function slicePath(path, a, b) {
  const [s, e] = a <= b ? [a, b] : [b, a];
  const out = [];
  let acc = 0;
  const P = projector(path[0][1]);
  for (let i = 1; i < path.length; i++) {
    const p0 = P.f(path[i - 1]), p1 = P.f(path[i]), L = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
    const lerp = d => P.inv([p0[0] + (p1[0] - p0[0]) * (d - acc) / L, p0[1] + (p1[1] - p0[1]) * (d - acc) / L]);
    if (acc + L >= s && acc <= e) {
      if (!out.length) out.push(acc >= s ? path[i - 1] : lerp(s));
      out.push(acc + L <= e ? path[i] : lerp(e));
    }
    acc += L;
  }
  return out.map(([x, y]) => [Math.round(x * 1e6) / 1e6, Math.round(y * 1e6) / 1e6]);
}
/**
 * Road centreline between two cross streets. ways: { road: [[lng,lat]...][], from: [...], to: [...] }.
 * Returns a LineString with confidence high (both ends on one chained centreline) or medium (ends
 * on different pieces: the pieces between them are kept as a MultiLineString), else null.
 */
function roadBetween(ways) {
  const roads = chain(ways.road || []);
  const a = crossing(roads, ways.from || []), b = crossing(roads, ways.to || []);
  if (!a || !b) return null;
  if (a.path === b.path) {
    const line = slicePath(roads[a.path], a.at, b.at);
    return line.length >= 2 && C.lengthM(line) > 20 ? { geometry: { type: 'LineString', coordinates: line }, confidence: 'high' } : null;
  }
  const lo = [Math.min(a.q[0], b.q[0]), Math.min(a.q[1], b.q[1])], hi = [Math.max(a.q[0], b.q[0]), Math.max(a.q[1], b.q[1])], pad = 0.002;
  const parts = roads.map(p => p.filter(([x, y]) => x >= lo[0] - pad && x <= hi[0] + pad && y >= lo[1] - pad && y <= hi[1] + pad)).filter(p => p.length >= 2);
  return parts.length ? { geometry: { type: 'MultiLineString', coordinates: parts }, confidence: 'medium' } : null;
}

function pointInRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
/** Point / line / polygon geometry → sample points (for proximity and containment). */
function pointsOf(g) {
  if (!g) return [];
  if (g.type === 'Point') return [g.coordinates];
  if (g.type === 'MultiPoint' || g.type === 'LineString') return g.coordinates;
  if (g.type === 'MultiLineString' || g.type === 'Polygon') return g.coordinates.flat();
  if (g.type === 'MultiPolygon') return g.coordinates.flat(2);
  return [];
}
function distToGeom(pt, g) {
  if (!g) return Infinity;
  if (g.type === 'Polygon' && pointInRing(pt[0], pt[1], g.coordinates[0])) return 0;
  if (g.type === 'MultiPolygon' && g.coordinates.some(p => pointInRing(pt[0], pt[1], p[0]))) return 0;
  if (/LineString|Polygon/.test(g.type)) {
    const paths = g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : g.type === 'Polygon' ? g.coordinates : g.coordinates.flat();
    const P = projector(pt[1]);
    return nearestOnPaths(pt, paths, P).d;
  }
  return Math.min(...pointsOf(g).map(p => C.haversine(pt, p)));
}

/**
 * Geometry by type, in order:
 *   1. facility named in the EA → facility point (facility, high)
 *   2. road "X – A to B" → road centreline between the cross streets (road; ctx.roadWays(name))
 *   3. sewer / watermain → DC mains or capital records on the named street (linear, medium)
 *   4. area study → settlement / community / secondary plan boundary (area, medium)
 *   5. approximate point: place named in the EA (ctx.place) else municipality centre (approx, low)
 * ctx: { facilities [{name, lnglat, aliases}], dcLines [{name, paths}], capital [{street, system, geometry}],
 *        areas [{name, municipality, rings}], roadWays: name → {road, from, to} | null, place: name → [lng,lat] | null }
 */
function resolveGeometry(ea, ctx) {
  const name = ea.name;
  const nt = new Set(tokens(name));
  // 1. facility
  const facHit = (ctx.facilities || []).map(f => ({ f, names: [f.name, ...(f.aliases || [])] }))
    .find(({ names }) => names.some(n => { const ft = tokens(n).filter(t => !/^(water|wastewater|treatment|plant|pumping|station|reservoir|tank|elevated|facility|wrrf|resource|recovery|wtp|ps)$/.test(t)); return ft.length && ft.every(t => nt.has(t)); }));
  if (facHit && /plant|station|reservoir|tank|facility|wrrf|resource recovery|treatment|well|intake|outfall|expansion|upgrade|biosolids/i.test(name)) {
    return { geometry: { type: 'Point', coordinates: facHit.f.lnglat }, geomType: 'facility', geomMethod: `facility point: ${facHit.f.name}`, geomConfidence: 'high' };
  }
  // 2. road between cross streets
  const rd = parseRoad(name);
  if (rd && ctx.roadWays) {
    const ways = ctx.roadWays(rd);
    const r = ways && roadBetween(ways);
    if (r) return { geometry: r.geometry, geomType: 'road', geomMethod: `road centreline (OpenStreetMap) ${rd.road}: ${rd.from} to ${rd.to}`, geomConfidence: r.confidence };
  }
  // 3. sewer / watermain on a named street
  if (/sewer|sanitary|water ?main|feedermain|trunk|forcemain|transmission main|servicing/i.test(name)) {
    const dc = (ctx.dcLines || []).filter(l => l.name && overlapTokens(name, l.name) >= 2);
    if (dc.length) return { geometry: multi(dc.flatMap(l => l.paths)), geomType: 'linear', geomMethod: 'DC capital map mains named like the EA', geomConfidence: 'medium' };
    const cap = (ctx.capital || []).filter(r => r.geometry && r.street && (r.system === 'water' || r.system === 'wastewater') && C.sameStreet(r.street, name));
    if (cap.length) return { geometry: multi(cap.flatMap(r => r.geometry.type === 'LineString' ? [r.geometry.coordinates] : r.geometry.coordinates)), geomType: 'linear', geomMethod: 'capital project lines on the named street', geomConfidence: 'medium' };
  }
  // 4. area study
  const area = (ctx.areas || []).find(a => { const at = tokens(a.name.replace(/^\d+[a-z]?\s*:\s*/i, '')); return at.length && at.every(t => nt.has(t)); });
  if (area) return { geometry: area.rings.length === 1 ? { type: 'Polygon', coordinates: area.rings } : { type: 'MultiPolygon', coordinates: area.rings.map(r => [r]) }, geomType: 'area', geomMethod: `boundary: ${area.name}`, geomConfidence: 'medium' };
  // road without a parsable segment: whole named road is not drawn; fall through to a point
  // 5. approximate point
  const pl = ctx.place && ctx.place(ea);
  if (pl) return { geometry: { type: 'Point', coordinates: pl.lnglat }, geomType: 'approx', geomMethod: `approximate point: ${pl.label}`, geomConfidence: 'low' };
  const MC = { Brampton: [-79.7624, 43.7315], Caledon: [-79.8711, 43.8668], Mississauga: [-79.6441, 43.589], 'Region-wide': [-79.7, 43.73] };
  const mu = (ea.municipalities || [])[0];
  if (mu && MC[mu]) return { geometry: { type: 'Point', coordinates: MC[mu] }, geomType: 'approx', geomMethod: `municipality centre: ${mu}`, geomConfidence: 'low' };
  return { geometry: null, geomType: 'approx', geomMethod: 'none', geomConfidence: 'low' };
}
const multi = paths => (paths.length === 1 ? { type: 'LineString', coordinates: paths[0] } : { type: 'MultiLineString', coordinates: paths });
function overlapTokens(a, b) {
  const A = new Set(tokens(a).filter(t => !/^(sanitary|sewer|water|main|watermain|trunk|mm|\d+)$/.test(t)));
  let n = 0; for (const t of new Set(tokens(b))) if (A.has(t)) n++;
  return n;
}

// ---- links -----------------------------------------------------------------------------------
/**
 * DC projects with an EA phase (scripts/dc-facilities.json items): by facility name in the EA
 * name, or the facility within 300 m of the EA geometry. Returns [{proj, what, facility, method}].
 */
function linkDc(ea, dcFacilities, facPoints) {
  const out = [];
  const nt = new Set(tokens(ea.name));
  for (const sys of ['water', 'wastewater']) for (const fc of (dcFacilities?.[sys] || [])) for (const it of fc.items || []) {
    if (!(it.phases || []).some(p => p[0] === 'EA')) continue;
    const ft = tokens(fc.name).filter(t => !/^(water|wastewater|treatment|plant|resource|recovery|facility)$/.test(t));
    let method = null;
    if (ft.length && ft.every(t => nt.has(t))) method = 'name';
    const pt = fc.g || (facPoints || {})[fc.name];
    if (!method && pt && ea.geometry && distToGeom(pt, ea.geometry) <= 300) method = 'location';
    if (method) out.push({ proj: it.proj, what: it.what, facility: fc.name, system: sys, method });
  }
  return out;
}
/**
 * Capital records: via the DC match (capital links of the linked DC projects), a ProjectWebsite
 * pointing at the EA page, or street named in the EA + line within the study area (≥ 50 % within
 * 30 m of a line EA, or inside an area EA). Returns [{id, projectNumber, method}].
 */
function linkCapital(ea, capital, dcLinked) {
  const out = [], seen = new Set();
  const add = (r, method) => { if (!seen.has(r.id)) { seen.add(r.id); out.push({ id: r.id, projectNumber: r.projectNumber, method }); } };
  const recs = capital?.records || [];
  const byId = new Map(recs.map(r => [r.id, r]));
  const dcProj = new Set((dcLinked || []).map(d => C.normProj(d.proj)));
  for (const l of capital?.links || []) {
    const proj = C.normProj(l.dc.split(':')[3] || '');
    if (proj && dcProj.has(proj) && byId.get(l.capital)) add(byId.get(l.capital), 'dc match');
  }
  const page = ea.links?.page && normUrl(ea.links.page);
  for (const r of recs) {
    if (page && r.website && normUrl(r.website) === page) { add(r, 'project website'); continue; }
    if (!ea.geometry || !r.geometry || !r.street || !C.sameStreet(r.street, ea.name)) continue;
    const g = ea.geometry;
    if (/Polygon/.test(g.type)) { const pts = pointsOf(r.geometry); if (pts.filter(p => distToGeom(p, g) === 0).length >= pts.length / 2) add(r, 'street + study area'); }
    else if (/LineString/.test(g.type) && C.overlapShare(r.geometry, g.type === 'LineString' ? [g.coordinates] : g.coordinates) >= 0.5) add(r, 'street + study area');
  }
  return out;
}
const normUrl = u => String(u).toLowerCase().replace(/^https?:\/\/(www\.)?/, '').replace(/[?#].*$/, '').replace(/\/+$/, '');

// ---- overrides / change list / review --------------------------------------------------------
const OVERRIDABLE = ['name', 'system', 'municipality', 'schedule', 'status', 'purpose', 'decision', 'nextStep', 'milestones', 'completedYear', 'geometry', 'geomType', 'geomMethod', 'geomConfidence', 'links', 'related'];
/**
 * eas-overrides.json: { eas: { <id>: { field: value, ... } }, add: [ea], remove: [id] }. A traced
 * geometry with no geomMethod is recorded as "traced from the project page image" (medium).
 */
function applyOverrides(eas, ov) {
  let out = eas.filter(e => !((ov && ov.remove) || []).includes(e.id));
  for (const a of (ov && ov.add) || []) if (a && a.id && !out.some(e => e.id === a.id)) out.push({ ...a, manual: true });
  for (const e of out) {
    const o = ov && ov.eas && ov.eas[e.id];
    if (!o) continue;
    for (const k of OVERRIDABLE) if (o[k] !== undefined) e[k] = o[k];
    if (o.geometry && o.geomMethod === undefined) { e.geomMethod = 'traced from the project page image'; e.geomConfidence = o.geomConfidence || 'medium'; e.geomType = o.geomType || (/Polygon/.test(o.geometry.type) ? 'area' : e.geomType); }
    e.overridden = Object.keys(o).filter(k => OVERRIDABLE.includes(k));
  }
  return out;
}

/** Pages whose hash changed since the previous build, with any new notices. */
function changesSince(prev, eas, date) {
  const before = new Map(((prev && prev.eas) || []).map(e => [e.id, e]));
  const out = [];
  for (const e of eas) {
    const p = before.get(e.id);
    if (!p) { if (prev && prev.eas) out.push({ id: e.id, name: e.name, change: 'new EA on the list', date }); continue; }
    if (!e.pageHash || !p.pageHash || p.pageHash === e.pageHash) continue;
    const old = new Set(((p.links && p.links.notices) || []).map(n => n.url));
    const notices = ((e.links && e.links.notices) || []).filter(n => !old.has(n.url)).map(n => n.label);
    const report = e.links?.report && e.links.report.url !== p.links?.report?.url;
    out.push({ id: e.id, name: e.name, change: notices.length ? `new notice: ${notices.join('; ')}` : report ? 'report released' : p.status !== e.status ? `status ${p.status} → ${e.status}` : 'page changed', date });
  }
  return out;
}

const csvCell = v => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
function reviewCsv(eas) {
  const head = ['id', 'name', 'municipality', 'system', 'schedule', 'status', 'commencement', 'pic', 'completion', 'review_end', 'next_step', 'next_step_date', 'purpose_draft', 'decision', 'page', 'report', 'geom_type', 'geom_method', 'geom_confidence', 'dc_matches', 'capital_matches', 'facility_matches', 'flags'];
  const rows = eas.map(e => {
    const m = t => (e.milestones || []).filter(x => x.type === t).map(x => x.date).join(' ');
    return [e.id, e.name, e.municipality, e.system, e.schedule, e.status, m('commencement'), m('pic'), m('completion'), m('reviewEnd'), e.nextStep?.text, e.nextStep?.date, e.purpose, e.decision, e.links?.page, e.links?.report?.url,
      e.geomType, e.geomMethod, e.geomConfidence, (e.related?.dcProjects || []).map(d => `${d.proj} ${d.what}`).join('; '), (e.related?.capitalProjects || []).map(c => c.projectNumber || c.id).join('; '), (e.related?.facilities || []).join('; '), (e.flags || []).join('; ')];
  });
  return [head, ...rows].map(r => r.map(csvCell).join(',')).join('\n') + '\n';
}

module.exports = {
  SYSTEMS, SCHEDULES, STATUSES, GEOM_TYPES, CONTACT,
  text, lines, mainHtml, links, normName, slug, tokens, parseList, dedupe, findPage,
  systemOf, scheduleOf, datesIn, milestonesOf, statusOf, nextStepOf, purposeDraft, docLinks, parsePage, pageHash,
  parseRoad, chain, roadBetween, pointInRing, distToGeom, resolveGeometry, linkDc, linkCapital,
  applyOverrides, changesSince, reviewCsv,
};
