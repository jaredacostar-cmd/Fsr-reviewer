#!/usr/bin/env node
/**
 * Download reference documents (URL list in scripts/ref-docs.txt: "id url" per line) into --out,
 * with index.json. Used by the probe workflow (mode=refs-council) since the sandbox cannot reach
 * peelregion.ca / ontario.ca.
 */
const fs = require('fs');
const path = require('path');
const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const out = path.resolve(arg('--out') || 'ref-docs');
fs.mkdirSync(out, { recursive: true });
const list = fs.readFileSync(path.join(__dirname, 'ref-docs.txt'), 'utf8').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#')).map(l => l.split(/\s+/));
(async () => {
  const index = [];
  for (const [id, url] of list) {
    try {
      const r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (peel-dev-tracker reference fetch)' }, redirect: 'follow' });
      const buf = Buffer.from(await r.arrayBuffer());
      const ext = /pdf/i.test(r.headers.get('content-type') || '') ? 'pdf' : 'html';
      const file = `${id}.${ext}`;
      if (r.ok && buf.length < 45e6) fs.writeFileSync(path.join(out, file), buf);
      index.push({ id, url, status: r.status, type: r.headers.get('content-type'), bytes: buf.length, file: r.ok ? file : null, finalUrl: r.url });
      console.log(`${r.status} ${(buf.length / 1e6).toFixed(2)} MB ${id} ${url}`);
    } catch (e) { index.push({ id, url, error: e.message }); console.log(`ERR ${id} ${e.message}`); }
  }
  fs.writeFileSync(path.join(out, 'index.json'), JSON.stringify(index, null, 1));
})();
