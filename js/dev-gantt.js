/* A development's files and events as a Gantt chart (PeelDevGantt), the heart of its "Files, events
 * and proposal" section (js/devtab.js storyHTML): one row per planning file in the file tree's order
 * (indented under the file whose land holds it), coloured by the stage each dated event put it in, a
 * tick per event, the council and committee items on their own row and the development's stage on
 * top. Building permits get a row each when there are few; past PERMIT_ROWS a group shares one row.
 * Each row opens to what's behind it (the file's events and source record, the council items, the
 * permits), supplied by the caller.
 *
 * Pure: model() and html() take the project (and its council items), so they run in Node
 * (tests/dev-gantt.test.js).
 */
(function (root) {
  'use strict';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = v => Math.round(v || 0).toLocaleString('en-CA');
  const P = () => root.PeelPhases;
  const day = d => new Date(+d).toISOString().slice(0, 10);
  const DAY = 864e5;
  // Rows in the order of History's By file view (js/devtab.js REC_GROUPS).
  const GROUPS = [
    ['master', 'Official plan / zoning / subdivision'], ['siteplan', 'Site plan'], ['condo', 'Condominium'],
    ['precon', 'Pre-consultation'], ['other', 'Other applications'], ['permit-new', 'Building permits – new units'], ['permit', 'Building permits – other'],
  ];
  const PERMIT_ROWS = 8, FILE_ROWS = 40;
  const groupOf = r => {
    const DT = root.DevTab;
    if (DT && DT.recGroup) return DT.recGroup(r);
    if (r.kind === 'permit') return r.units > 0 ? 'permit-new' : 'permit';
    return r.stage || 'other';
  };
  const label = k => ((P() && P().PHASE_BY_KEY[k]) || {}).label || k;
  const live = k => k !== 'completed' && k !== 'cancelled';

  const rank = k => ((P() && P().PHASE_BY_KEY[k]) || { rank: -1 }).rank;
  // Bars from dated events: each event starts a segment in its stage, running to the next event; a
  // file still open runs on to today (open: true, drawn faded). Most files publish only the date
  // received: when the status has since moved the file on (approved, say), that stretch takes the
  // status's stage (undated: true), since the date of the change isn't published.
  function segments(events, phase, now) {
    const ev = events.filter(e => e.date && isFinite(+e.date)).slice().sort((a, b) => a.date - b.date);
    const segs = [];
    ev.forEach((e, i) => {
      const last = i + 1 === ev.length, end = !last ? +ev[i + 1].date : (live(phase) ? now : +e.date);
      if (end <= +e.date) return;
      const undated = last && rank(phase) > rank(e.phase);
      segs.push({ from: +e.date, to: end, phase: undated ? phase : e.phase, open: last, undated });
    });
    return { ev, segs };
  }

  const fileRow = (r, now, extra = {}) => ({ kind: 'file', group: groupOf(r), rec: r, ref: r.ref || '', uid: r.uid, label: r.ref || (r.kind === 'permit' ? 'Permit' : 'File'),
    sub: r.type || '', phase: r.phase, status: r.statusRaw || '', depth: 0, ...segments(r.events || [], r.phase, now), ...extra });

  /** The chart's rows and span: { rows, from, to, now, more }. With opts.tree (PeelFileTree.flat) and
   *  opts.recOf(node) → record, the planning files follow the tree: each under the file whose land
   *  holds it (depth), the homes counted once (counted), a link to check (check), the earlier files
   *  on the same land after a head of their own. Files the tree doesn't hold, and the permits,
   *  follow by type. */
  function model(p, opts = {}) {
    const now = +(opts.now || Date.now()), council = opts.council || [];
    const rows = [], used = new Set();
    // The development's stage over time, from the date it reached each stage.
    const ms = Object.entries(p.milestones || {}).filter(([k, d]) => d && k !== 'cancelled').map(([k, d]) => ({ date: new Date(+new Date(d)), phase: k, label: `${label(k)} reached` }));
    if (ms.length) { const s = segments(ms, p.phase, now); rows.push({ kind: 'stage', label: 'Development stage', sub: label(p.phase), phase: p.phase, ...s }); }
    let more = 0;
    // The planning files as the tree has them.
    const tree = opts.tree && opts.tree.length > 1 && opts.recOf ? opts.tree : null;
    if (tree) {
      let sameHead = false;
      rows.push({ kind: 'head', label: 'Planning files', n: tree.filter(n => !n.same).length, ev: [], segs: [] });
      for (const n of tree) {
        if (n.same && !sameHead) { sameHead = true; rows.push({ kind: 'head', label: 'Earlier files on the same land', note: "the site's history, not counted", n: tree.filter(x => x.same).length, ev: [], segs: [] }); }
        const r = opts.recOf(n);
        if (r && used.has(r)) continue;
        if (r) used.add(r);
        const tag = { node: n, depth: n.depth, why: n.why, check: n.check, counted: n.counted, latest: opts.latest && opts.latest === n.ref };
        rows.push(r ? fileRow(r, now, { ...tag, label: n.ref }) : { kind: 'file', ref: n.ref, label: n.ref, sub: n.type, phase: null, status: '', ev: [], segs: [], ...tag });
      }
    }
    for (const [key, name] of GROUPS) {
      const list = (p.records || []).filter(r => !used.has(r) && groupOf(r) === key && (r.events || []).length);
      if (!list.length) continue;
      const first = r => Math.min(...r.events.map(e => +e.date));
      list.sort((a, b) => first(a) - first(b));
      const permits = key.startsWith('permit');
      if (permits && list.length > PERMIT_ROWS) {
        // One row for the group: the span of its permits, a tick per permit event; it opens to the permits.
        const ev = list.flatMap(r => r.events.map(e => ({ ...e, ref: r.ref }))).sort((a, b) => a.date - b.date);
        const open = list.some(r => live(r.phase));
        rows.push({ kind: 'group', group: key, label: name, sub: `${num(list.length)} permits`, recs: list, ev,
          segs: [{ from: +ev[0].date, to: open ? now : +ev[ev.length - 1].date, phase: 'permit', open }] });
        continue;
      }
      rows.push({ kind: 'head', label: tree && !permits ? `Other ${name.toLowerCase()} files` : name, n: list.length, ev: [], segs: [] });
      const cap = permits ? list.length : FILE_ROWS;
      for (const r of list.slice(0, cap)) rows.push(fileRow(r, now, { latest: opts.latest && opts.latest === r.ref }));
      more += Math.max(0, list.length - cap);
    }
    // Council and committee items naming the files.
    const cev = council.filter(c => c && c.m && c.m.date).map(c => ({ date: new Date(`${c.m.date}T12:00:00`), phase: 'council', label: `${c.m.name}${c.it && c.it.n ? ` · item ${c.it.n}` : ''}${c.s && c.s.verdict ? ` · ${c.s.verdict}` : ''}`, title: c.it && c.it.title }));
    if (cev.length) rows.splice(ms.length ? 1 : 0, 0, { kind: 'council', label: 'Council and committee', sub: `${num(cev.length)} item${cev.length === 1 ? '' : 's'}`, ev: cev.sort((a, b) => a.date - b.date), segs: [] });
    const all = rows.flatMap(r => [...(r.ev || []).map(e => +e.date), ...r.segs.map(s => s.to)]).filter(isFinite);
    if (!all.length) return { rows: rows.filter(r => r.kind === 'file' || r.kind === 'head'), from: now, to: now, now, more, undated: true };
    // Whole years, so the axis reads in years; at least two.
    const y0 = new Date(Math.min(...all)).getUTCFullYear(), y1 = Math.max(new Date(Math.max(...all, now)).getUTCFullYear() + 1, y0 + 2);
    return { rows, from: Date.UTC(y0, 0, 1), to: Date.UTC(y1, 0, 1), now, more };
  }

  /** The chart as HTML. opts.body(row) → what the row opens to (its record, the council items…; a
   *  row with none doesn't open); opts.dot(stage) → the stage dot. */
  function html(p, opts = {}) {
    const m = model(p, opts);
    if (!m.rows.length) return '<p class="small muted">No files or dated events in the source data.</p>';
    const span = Math.max(1, m.to - m.from), x = t => `${(Math.max(0, Math.min(1, (t - m.from) / span)) * 100).toFixed(2)}%`;
    const w = (a, b) => `${(Math.max(0.4, (b - a) / span * 100)).toFixed(2)}%`;
    const y0 = new Date(m.from).getUTCFullYear(), y1 = new Date(m.to).getUTCFullYear(), n = y1 - y0;
    // At most six year labels: the panel is narrow.
    const step = [1, 2, 5, 10, 20].find(k => n / k <= 6) || 50;
    const years = []; if (!m.undated) for (let y = y0; y < y1; y += step) years.push(y);
    const axis = years.map(y => `<span class="gt-yr" style="left:${x(Date.UTC(y, 0, 1))}">${y}</span>`).join('');
    const grid = years.map(y => `<i class="gt-grid" style="left:${x(Date.UTC(y, 0, 1))}"></i>`).join('');
    const today = !m.undated && m.now >= m.from && m.now <= m.to ? `<i class="gt-now" style="left:${x(m.now)}" title="Today"></i>` : '';
    const dot = opts.dot || (k => `<i class="gt-sw" style="--c:var(--ph-${esc(k)})"></i>`);
    const tick = (e, ref) => {
      const t = `${day(e.date)} · ${e.phase === 'council' ? e.label : `${ref || e.ref ? `${ref || e.ref}: ` : ''}${P() && P().humanizeField ? P().humanizeField(e.label || '') : e.label || ''}`}${e.title ? ` — ${e.title}` : ''}`;
      return e.phase === 'council'
        ? `<i class="gt-cm" style="left:${x(+e.date)}" title="${esc(t)}"></i>`
        : `<i class="gt-tk" style="left:${x(+e.date)}" title="${esc(t)}"></i>`;
    };
    const bar = s => `<i class="gt-bar${s.open ? ' open' : ''}" style="left:${x(s.from)};width:${w(s.from, s.to)};--c:var(--ph-${esc(s.phase)})" title="${esc(`${label(s.phase)}: ${s.undated ? `status now (the date it changed isn't published); received ${day(s.from)}` : `${day(s.from)} – ${s.open ? 'today' : day(s.to)}`}`)}"></i>`;
    const track = r => `<div class="gt-t">${grid}${r.segs.map(bar).join('')}${r.ev.map(e => tick(e, r.ref)).join('')}${today}</div>`;
    const row = r => {
      if (r.kind === 'head') return `<div class="gt-row gt-head"><div class="gt-l">${esc(r.label)} <span class="muted">${num(r.n)}${r.note ? ` · ${esc(r.note)}` : ''}</span></div><div class="gt-t"></div></div>`;
      const chips = [r.latest ? '<span class="tr-new">latest</span>' : '', r.check ? '<span class="tr-check" title="Linked by overlap only (low confidence): check its record">check</span>' : ''].join('');
      // (the homes, on the file that counts them, lead its second line)
      const homes = r.counted ? `<b class="gt-homes" title="The homes are counted once, on this file${r.counted.kind !== 'stated' ? ' (an estimate: not stated on the file)' : ''}">${num(r.counted.units)}${r.counted.kind !== 'stated' ? '≈' : ''} homes</b>` : '';
      const line2 = [homes, ...[r.sub, r.why, r.status && `status: ${r.status}`].filter(Boolean).map(esc)].filter(Boolean).join(' · ');
      const name = r.kind === 'file' ? `${r.phase ? dot(r.phase) : ''}<span class="gt-ref">${esc(r.label)}</span>` : `<strong>${esc(r.label)}</strong>`;
      const lab = `<div class="gt-l" style="--d:${r.depth || 0}" title="${esc([r.label, r.counted && `${num(r.counted.units)} homes counted here`, r.sub, r.why, r.status && `status: ${r.status}`].filter(Boolean).join(' · '))}"><span class="gt-l1">${name}${chips}${r.kind !== 'file' && r.sub ? ` <small class="muted">${esc(r.sub)}</small>` : ''}</span>${r.kind === 'file' && line2 ? `<small class="gt-l2">${line2}</small>` : ''}</div>`;
      const body = opts.body ? opts.body(r) : '';
      const ids = r.rec ? ` data-rec-uid="${esc(r.rec.uid)}" data-rec-ref="${esc(r.ref)}"` : '';
      return body
        ? `<details class="gt-d gt-${r.kind}${r.depth ? ' gt-kid' : ''}"${ids}${r.kind === 'council' ? ' data-gt-council' : ''}><summary class="gt-row">${lab}${track(r)}</summary><div class="gt-body" style="--d:${r.depth || 0}">${body}</div></details>`
        : `<div class="gt-row gt-${r.kind}${r.depth ? ' gt-kid' : ''}"${ids}>${lab}${track(r)}</div>`;
    };
    const used = [...new Set(m.rows.flatMap(r => r.segs.map(s => s.phase)))];
    const order = P() ? P().ALL_PHASES.map(q => q.key) : used;
    const legend = order.filter(k => used.includes(k)).map(k => `<span><i class="gt-sw" style="--c:var(--ph-${esc(k)})"></i>${esc(label(k))}</span>`).join('')
      + `${m.rows.some(r => r.kind === 'council') ? '<span><i class="gt-sw gt-sw-cm"></i>Council item</span>' : ''}<span><i class="gt-sw gt-sw-tk"></i>Dated event</span><span><i class="gt-sw gt-sw-now"></i>Today</span>`;
    return `<div class="gantt" data-info="dev-gantt" role="figure" aria-label="Files and events over time${m.undated ? '' : `, ${y0} to ${y1 - 1}`}">
      ${m.undated ? '' : `<div class="gt-row gt-axis"><div class="gt-l"></div><div class="gt-t">${axis}</div></div>`}
      ${m.rows.map(row).join('')}
    </div>
    <p class="gt-legend small">${legend}</p>
    <p class="small muted">Indented: on its land. Each bar runs from one dated event to the next, in the stage that event set; a file still open runs on to today (faded), in the stage of its current status when the date it changed isn't published. Press a row for its events and source record${m.more ? ` · ${num(m.more)} more files in the events list` : ''}.</p>`;
  }

  const api = { GROUPS, PERMIT_ROWS, segments, model, html };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelDevGantt = api;
})(typeof window !== 'undefined' ? window : globalThis);
