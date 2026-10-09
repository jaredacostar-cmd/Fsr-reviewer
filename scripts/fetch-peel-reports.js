#!/usr/bin/env node
/**
 * Download the Region of Peel wastewater annual reports and drinking water quality reports
 * (every document linked from the two index pages, plus documents on sub-pages under the same
 * section) into --out, with an index.json of what was found. Used by the probe workflow
 * (mode=peel-reports) because the sandbox cannot reach peelregion.ca.
 */
const fs = require('fs');
const path = require('path');

const PAGES = [
  'https://peelregion.ca/water/wastewater/wastewater-annual-reports',
  'https://peelregion.ca/water/drinking-water/water-quality/water-quality-reports',
];
const DOC = /\.(pdf|xlsx?|csv|docx?)(\?|#|$)/i;
const UA = { 'user-agent': 'Mozilla/5.0 (peel-dev-tracker report fetch)' };

const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const out = path.resolve(arg('--out') || 'peel-reports');
fs.mkdirSync(out, { recursive: true });

async function get(url) {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url, { headers: UA, redirect: 'follow' });
      if (r.ok) return r;
      console.log(`  ${r.status} ${url}`);
      if (r.status === 404) return null;
    } catch (e) { console.log(`  ${e.message} ${url}`); }
    await new Promise(res => setTimeout(res, 1500 * (i + 1)));
  }
  return null;
}
const strip = s => s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
function links(html, base) {
  const res = [];
  const re = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html))) {
    try { res.push({ url: new URL(m[1].replace(/&amp;/g, '&'), base).href, text: strip(m[2]) }); } catch (e) { /* skip */ }
  }
  return res;
}
const slug = s => s.replace(/^https?:\/\/[^/]+\//, '').replace(/[?#].*$/, '').replace(/[^A-Za-z0-9._-]+/g, '_').slice(-150);

(async () => {
  const index = { fetchedAt: new Date().toISOString(), pages: [], documents: [] };
  const seenDocs = new Map(), seenPages = new Set();
  const queue = PAGES.map(u => ({ url: u, depth: 0, root: u }));
  while (queue.length) {
    const { url, depth, root } = queue.shift();
    if (seenPages.has(url)) continue;
    seenPages.add(url);
    const r = await get(url);
    if (!r) { index.pages.push({ url, error: true }); continue; }
    const html = await r.text();
    const file = `page_${slug(url)}.html`;
    fs.writeFileSync(path.join(out, file), html);
    const title = (html.match(/<title>([\s\S]*?)<\/title>/i) || [])[1];
    const ls = links(html, url);
    index.pages.push({ url, file, title: title && strip(title), depth, links: ls.length });
    console.log(`page ${url} (${ls.length} links)`);
    const rootPath = new URL(root).pathname.replace(/\/[^/]*$/, '/');
    for (const l of ls) {
      const u = new URL(l.url);
      if (DOC.test(u.pathname)) {
        if (!seenDocs.has(l.url)) seenDocs.set(l.url, { url: l.url, text: l.text, page: url });
      } else if (depth < 2 && /peelregion\.ca$/.test(u.hostname) && (u.pathname.startsWith(new URL(root).pathname) || (depth === 0 && u.pathname.startsWith(rootPath)))) {
        queue.push({ url: u.href.replace(/#.*$/, ''), depth: depth + 1, root });
      }
    }
  }
  console.log(`${seenDocs.size} documents`);
  for (const d of seenDocs.values()) {
    const r = await get(d.url);
    if (!r) { index.documents.push({ ...d, error: true }); continue; }
    const buf = Buffer.from(await r.arrayBuffer());
    const file = slug(d.url);
    if (buf.length > 45e6) { index.documents.push({ ...d, bytes: buf.length, skipped: 'too large' }); continue; }
    fs.writeFileSync(path.join(out, file), buf);
    index.documents.push({ ...d, file, bytes: buf.length, type: r.headers.get('content-type') });
    console.log(`  ${(buf.length / 1e6).toFixed(1)} MB ${file}`);
  }
  fs.writeFileSync(path.join(out, 'index.json'), JSON.stringify(index, null, 1));
})().catch(e => { console.error(e); process.exit(1); });
