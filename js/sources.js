/* Every data file's receipt (PeelSources): where each file in data/ comes from, when it was pulled
 * or published, and its fingerprint, so any figure can be checked against its source.
 *
 * data/sources.json is the registry (one entry per data file, written by hand; tests/sources.test.js
 * fails the build when a data file has none). data/sources-index.json is built at deploy
 * (scripts/build-sources-index.js): each file's date, read from the file itself, its size and its
 * SHA-256, and the snapshot's layers. Without the index (opened from disk) the table still lists
 * every source and its links; the dates say "in the file".
 *
 * Pure builders (rows, tableHTML, citation, dateOf) run in Node; load() fetches in the browser.
 */
(function (root) {
  'use strict';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const KIND = { 'open-data': 'Open data', document: 'Published report', derived: 'Built from', decision: 'Reviewed correction', app: 'App record' };

  /** A file's date from its dateField: a dotted path ('source.latestLastUpdate'); an ISO time keeps its day. */
  function dateOf(json, field) {
    if (!json || !field) return null;
    let v = json;
    for (const k of String(field).split('.')) { if (v == null || typeof v !== 'object') return null; v = v[k]; }
    if (v == null || v === '') return null;
    const s = String(v), m = /^(\d{4}-\d{2}-\d{2})/.exec(s);
    return m ? m[1] : /^\d{4}(-\d{2})?$/.test(s) ? s : null;
  }

  /** The registry and the index as one row per data file, in the registry's order. */
  function rows(registry, index) {
    const ix = (index && index.files) || {};
    return Object.entries((registry && registry.files) || {}).map(([file, e]) => {
      const x = ix[file] || {};
      const links = [...(e.links || []), ...(x.links || [])].filter(l => l && l.url);
      return { file, title: e.title, kind: e.kind, publisher: e.publisher || '', links, from: e.from || [], itemLinks: e.itemLinks || '',
        method: e.method || '', check: e.check || '', script: e.script || '', refresh: e.refresh || '',
        asOf: x.asOf || e.published || null, dateMeaning: e.dateMeaning || (e.published && !x.asOf ? 'published' : 'pulled'), dateNote: e.dateNote || '',
        sha256: x.sha256 || null, bytes: x.bytes != null ? x.bytes : null };
    });
  }

  /** One plain-text citation for a data file: who published it, where, when, and the copy the app holds. */
  function citation(r) {
    const when = r.asOf ? `${r.dateMeaning === 'published' ? 'published' : r.dateMeaning === 'pulled' ? 'pulled' : r.dateMeaning} ${r.asOf}` : r.dateNote || '';
    const where = r.links.length ? r.links.map(l => `${l.label}: ${l.url}`).join('; ') : r.from.length ? `built from ${r.from.map(f => `data/${f}`).join(', ')}` : '';
    return [`${r.publisher ? `${r.publisher}, ` : ''}${r.title}`, where, when, `Peel Growth Pipeline data/${r.file}${r.sha256 ? ` (SHA-256 ${r.sha256})` : ''}`].filter(Boolean).join('. ') + '.';
  }

  const day = s => (s ? esc(s) : '–');
  function rowHTML(r) {
    const links = r.links.map(l => `<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)} ↗</a>`);
    const from = r.from.length ? `${KIND.derived}: ${r.from.map(f => `<code>${esc(f)}</code>`).join(', ')}` : '';
    const where = [...links, from].filter(Boolean).join('<br>');
    const notes = [r.itemLinks, r.method, r.check ? `<strong>Check:</strong> ${esc(r.check)}` : ''].filter(Boolean).map(n => (n.startsWith('<strong>') ? n : esc(n))).join(' ');
    const date = r.asOf ? `${day(r.asOf)}<small>${esc(r.dateMeaning)}</small>` : `<small>${esc(r.dateNote || 'in the file')}</small>`;
    const fp = r.sha256 ? `<code title="SHA-256 of data/${esc(r.file)}">${esc(r.sha256.slice(0, 12))}</code>` : '';
    return `<tr data-src-file="${esc(r.file)}"><td><strong>${esc(r.title)}</strong><small><code>data/${esc(r.file)}</code> · ${esc(KIND[r.kind] || r.kind)}${r.publisher ? ` · ${esc(r.publisher)}` : ''}</small>${notes ? `<small>${notes}</small>` : ''}</td>`
      + `<td>${where || '–'}</td><td>${date}</td><td>${fp}${r.script ? `<small><code>${esc(r.script)}</code></small>` : ''}</td>`
      + `<td><button type="button" class="btn small link" data-src-cite="${esc(r.file)}">Copy citation</button></td></tr>`;
  }
  /** The receipts table: every data file, its source links, its date and its fingerprint. */
  function tableHTML(rs, index) {
    const built = index && index.generatedAt ? ` Dates and fingerprints read from the files at deploy (${esc(String(index.generatedAt).slice(0, 10))}).` : ' Dates and fingerprints are added when the site is deployed.';
    return `<p class="small muted">Every file the app reads, where it comes from and when. A figure in the app is checked by opening its source link, or its record (Record ↗ on each file); the SHA-256 identifies the exact copy the app holds.${built}</p>`
      + `<div class="rf-tw"><table class="rf-tab src-table" aria-label="Data files and their sources"><thead><tr><th scope="col">Data</th><th scope="col">Source</th><th scope="col">As of</th><th scope="col">Fingerprint · built by</th><th scope="col"></th></tr></thead><tbody>${rs.map(rowHTML).join('')}</tbody></table></div>`;
  }

  // ---- Browser: load once, render into a slot, copy a citation -----------------------------------
  let loaded = null;
  function load() {
    if (loaded) return loaded;
    const get = u => root.fetch(u).then(r => (r.ok ? r.json() : null)).catch(() => null);
    loaded = Promise.all([get('data/sources.json'), get('data/sources-index.json')]).then(([registry, index]) => ({ registry, index, rows: registry ? rows(registry, index) : [] }));
    return loaded;
  }
  /** HTML for a slot that fills itself once the registry is in (Settings › Sources, Reference › Data sources). */
  function slotHTML() {
    if (root.document) {
      load().then(d => {
        for (const el of root.document.querySelectorAll('[data-src-slot]')) el.innerHTML = d.rows.length ? tableHTML(d.rows, d.index) : '<p class="small muted">The source list did not load.</p>';
      });
    }
    return '<div data-src-slot><p class="small muted">Loading every data file’s source…</p></div>';
  }
  if (root.document) {
    root.document.addEventListener('click', e => {
      const b = e.target.closest && e.target.closest('[data-src-cite]');
      if (!b) return;
      load().then(d => {
        const r = d.rows.find(x => x.file === b.dataset.srcCite); if (!r) return;
        const text = citation(r), done = () => { b.textContent = 'Copied'; setTimeout(() => { b.textContent = 'Copy citation'; }, 1500); };
        if (root.navigator && root.navigator.clipboard) root.navigator.clipboard.writeText(text).then(done, () => root.prompt('Citation', text));
        else root.prompt('Citation', text);
      });
    });
  }

  const api = { KIND, dateOf, rows, citation, tableHTML, load, slotHTML };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelSources = api;
})(typeof window !== 'undefined' ? window : globalThis);
