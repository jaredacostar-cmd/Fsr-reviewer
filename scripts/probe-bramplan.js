#!/usr/bin/env node
/*
 * BramPlanOnline (Brampton's planning portal, Accela Citizen Access; public, no sign-in): what a
 * search by file number returns, what a file's page looks like and where its documents are. Saves
 * every page it reaches to --out with index.json, and prints the form fields, the record links and
 * the document links found, so a reader for Brampton's servicing reports can be written against
 * the real pages. Run in Actions (Probe data sources, mode=bramplan): the sandbox can't reach it.
 *
 *   node scripts/probe-bramplan.js --out bramplan-raw [--refs OZS-2026-0034,SPA-2026-0104]
 */
'use strict';
const fs = require('fs');
const path = require('path');

const BASE = 'https://planning.brampton.ca/CitizenAccess/';
const HOME = `${BASE}Cap/CapHome.aspx?module=Planning&TabName=Planning`;
// One of each kind: rezoning / subdivision, site plan, condominium, pre-consultation, a legacy number.
const REFS = ['OZS-2026-0034', 'SPA-2026-0104', 'DPC-2021-0004', 'PRE-2023-0083', 'T06W15.005'];
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36 (peel-dev-tracker probe)';

const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const out = path.resolve(arg('--out') || 'bramplan-raw');
const refs = arg('--refs') ? arg('--refs').split(',').filter(Boolean) : REFS;
fs.mkdirSync(out, { recursive: true });

// ---- A browser-like fetch: cookies kept, redirects followed by hand ----------------------------
const jar = new Map();
function keep(res) {
  const set = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
  for (const c of set) { const [kv] = c.split(';'); const i = kv.indexOf('='); if (i > 0) jar.set(kv.slice(0, i).trim(), kv.slice(i + 1).trim()); }
}
const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
async function req(url, { method = 'GET', form = null, referer = null } = {}, hops = 0) {
  const headers = { 'user-agent': UA, accept: 'text/html,application/xhtml+xml', cookie: cookie() };
  if (referer) headers.referer = referer;
  let body;
  if (form) { body = new URLSearchParams(form).toString(); headers['content-type'] = 'application/x-www-form-urlencoded'; }
  let res;
  try { res = await fetch(url, { method, headers, body, redirect: 'manual' }); } catch (e) { return { url, status: 0, error: e.message, html: '' }; }
  keep(res);
  if (res.status >= 300 && res.status < 400 && res.headers.get('location') && hops < 8) {
    return req(new URL(res.headers.get('location'), url).href, { referer: url }, hops + 1);
  }
  return { url, status: res.status, type: res.headers.get('content-type') || '', html: await res.text() };
}

// ---- Reading the pages -------------------------------------------------------------------------
const dec = s => String(s).replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const strip = s => dec(String(s).replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ')).replace(/\s+/g, ' ').trim();
const attr = (tag, name) => { const m = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i').exec(tag); return m ? dec(m[2] != null ? m[2] : m[3]) : null; };
/** The form's fields, as a browser would post them (inputs, selects with their selected option, textareas). */
function formFields(html) {
  const f = {};
  for (const m of html.matchAll(/<input\b[^>]*>/gi)) {
    const n = attr(m[0], 'name'); if (!n) continue;
    const t = (attr(m[0], 'type') || 'text').toLowerCase();
    if (['submit', 'button', 'image', 'file', 'reset'].includes(t)) continue;
    if ((t === 'checkbox' || t === 'radio') && !/\bchecked\b/i.test(m[0])) continue;
    f[n] = attr(m[0], 'value') || '';
  }
  for (const m of html.matchAll(/<select\b[^>]*>([\s\S]*?)<\/select>/gi)) {
    const n = attr(m[0], 'name'); if (!n) continue;
    const sel = /<option\b[^>]*\bselected\b[^>]*>/i.exec(m[1]) || /<option\b[^>]*>/i.exec(m[1]);
    f[n] = sel ? attr(sel[0], 'value') || '' : '';
  }
  for (const m of html.matchAll(/<textarea\b[^>]*>([\s\S]*?)<\/textarea>/gi)) { const n = attr(m[0], 'name'); if (n) f[n] = dec(m[1]); }
  return f;
}
const links = (html, base) => [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)].map(m => {
  const href = attr(m[1], 'href'); let url = null;
  try { url = href && !/^javascript:/i.test(href) ? new URL(href, base).href : null; } catch (e) { /* skip */ }
  return { href, url, text: strip(m[2]).slice(0, 120) };
});
const iframes = (html, base) => [...html.matchAll(/<iframe\b[^>]*>/gi)].map(m => { const s = attr(m[0], 'src'); try { return s ? new URL(s, base).href : null; } catch (e) { return null; } }).filter(Boolean);
const postbacks = html => [...new Set([...html.matchAll(/__doPostBack\(\s*(?:&#39;|')([^'&]+)(?:&#39;|')/g)].map(m => m[1]))];

let n = 0;
const index = { fetchedAt: new Date().toISOString(), home: HOME, refs: {}, pages: [] };
function save(label, r) {
  const file = `${String(++n).padStart(2, '0')}-${label.replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 60)}.html`;
  fs.writeFileSync(path.join(out, file), r.html || '');
  const title = strip((/<title>([\s\S]*?)<\/title>/i.exec(r.html || '') || [])[1] || '');
  index.pages.push({ file, label, url: r.url, status: r.status, bytes: (r.html || '').length, title });
  console.log(`  ${r.status} ${file} ${title ? `“${title}” ` : ''}${(r.html || '').length} bytes  ${r.url}`);
  return file;
}
const isDetail = r => /CapDetail\.aspx/i.test(r.url) || /capID1=/i.test(r.url);
const docLinks = (html, base) => links(html, base).filter(l => /attach|document|download|\.pdf/i.test(`${l.href} ${l.text}`));

async function detail(ref, r, info) {
  info.detailUrl = r.url;
  const fr = iframes(r.html, r.url);
  info.iframes = fr;
  info.docLinks = docLinks(r.html, r.url).slice(0, 40);
  info.tabs = postbacks(r.html).filter(p => /attach|document|tab|record/i.test(p)).slice(0, 40);
  for (const u of fr.slice(0, 6)) {
    const x = await req(u, { referer: r.url });
    const f = save(`${ref}-iframe`, x);
    info.iframePages = [...(info.iframePages || []), { url: u, file: f, docLinks: docLinks(x.html, x.url).slice(0, 40) }];
  }
}

(async () => {
  console.log(`BramPlanOnline probe: ${HOME}`);
  const home = await req(HOME);
  save('home', home);
  if (!home.html) { console.log(`::error::the search page did not load (${home.status} ${home.error || ''})`); fs.writeFileSync(path.join(out, 'index.json'), JSON.stringify(index, null, 1)); process.exit(1); }
  const fields = formFields(home.html);
  index.fields = Object.keys(fields);
  index.postbacks = postbacks(home.html);
  console.log(`  ${index.fields.length} form fields; record-number-like: ${index.fields.filter(k => /permit|record|number|cap/i.test(k)).join(', ') || 'none'}`);
  console.log(`  postback targets: ${index.postbacks.filter(p => /search/i.test(p)).join(', ') || index.postbacks.slice(0, 10).join(', ')}`);
  const numField = index.fields.find(k => /txtGSPermitNumber$/i.test(k)) || index.fields.find(k => /PermitNumber|RecordNumber/i.test(k));
  const searchBtn = index.postbacks.find(p => /btnNewSearch$/i.test(p)) || index.postbacks.find(p => /search/i.test(p));
  index.numField = numField || null; index.searchBtn = searchBtn || null;

  for (const ref of refs) {
    console.log(`\n${ref}`);
    const info = index.refs[ref] = {};
    // 1. The search form, posted the way the page does it (ASP.NET postback).
    if (numField && searchBtn) {
      const h = await req(HOME);
      const f = { ...formFields(h.html), [numField]: ref, __EVENTTARGET: searchBtn, __EVENTARGUMENT: '' };
      const r = await req(HOME, { method: 'POST', form: f, referer: HOME });
      info.search = save(`${ref}-search`, r);
      info.searchUrl = r.url;
      info.found = /CapDetail|capID1/i.test(r.html) || isDetail(r);
      info.noResults = /no records? (were )?found|returned no results/i.test(strip(r.html));
      info.resultLinks = links(r.html, r.url).filter(l => /CapDetail|capID1/i.test(l.href || '')).slice(0, 10);
      console.log(`  search: ${isDetail(r) ? 'opened the file directly' : `${info.resultLinks.length} record link(s)`}${info.noResults ? ' (no results)' : ''}`);
      if (isDetail(r)) await detail(ref, r, info);
      else if (info.resultLinks[0] && info.resultLinks[0].url) {
        const d = await req(info.resultLinks[0].url, { referer: r.url });
        info.detail = save(`${ref}-detail`, d);
        await detail(ref, d, info);
      }
    } else {
      console.log('  ::warning::no record-number field or search button found on the form');
    }
    // 2. The portal's global search by URL (a link the app could use for one file, if it works).
    const g = await req(`${BASE}Cap/GlobalSearchResults.aspx?QueryText=${encodeURIComponent(ref)}`);
    info.global = save(`${ref}-global`, g);
    info.globalLinks = links(g.html, g.url).filter(l => /CapDetail|capID1/i.test(l.href || '')).slice(0, 10);
    info.globalOpened = isDetail(g);
    console.log(`  global search: ${g.status}, ${info.globalOpened ? 'opened the file' : `${info.globalLinks.length} record link(s)`}`);
    if (info.detailUrl) console.log(`  file page: ${info.detailUrl}`);
    for (const l of (info.docLinks || []).slice(0, 8)) console.log(`  doc link: ${l.text} -> ${l.href}`);
    for (const p of info.iframePages || []) for (const l of p.docLinks.slice(0, 8)) console.log(`  doc link (iframe): ${l.text} -> ${l.href}`);
  }
  fs.writeFileSync(path.join(out, 'index.json'), JSON.stringify(index, null, 1));
  console.log(`\n${index.pages.length} pages saved to ${out}`);
})().catch(e => { console.error(e); process.exit(1); });
