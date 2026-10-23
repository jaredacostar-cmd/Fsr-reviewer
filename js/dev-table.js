/* The developments table and treemap (PeelDevTable): Growth in an area's developments, one table.
 *
 * The table replaces the area's lists of plans, site servicing permits and developments: one row per
 * development (its share in the area), grouped by the next level down (a municipality, a plan, a
 * precinct), by stage, by site servicing permit, or not at all. A group's heading carries its totals
 * and a bar of its homes left to build by stage, and opens its level; a row opens the site.
 *
 * The treemap sits under the page's map: a box per area of the next level down, sized by homes left
 * to build, split into a tile per development coloured by stage. A tile opens the site; hovering a
 * tile (or a row) rings the development on the map, hovering a box rings its developments and its
 * outline (data-hx / data-hy: the point in the map's SVG).
 *
 *   squarify(items, x, y, w, h)   items [{ v }] laid out in the rectangle (squarified), largest first
 *   sortRows(rows, sort)          rows by { k: 't' | 'u' | 'l' | 'last', dir: 1 | -1 }
 *   tableHTML(o)                  the table section (o: title, groups, by, byOpts, sort, tools, where)
 *   treemapHTML(boxes, o)         the treemap (boxes: [{ key, name, drill, area, tiles }])
 */
(function (root) {
  'use strict';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = v => Math.round(v).toLocaleString('en-CA');
  // The stage colours of the pipeline chart (js/ws-pages.js stageChartHTML): the commitment ladder's rungs.
  const STAGE_CLS = { early: 'ly-anticipated', review: 'ly-proposed', zoning: 'stg-zoning', plan: 'stg-approved', servicing: 'stg-servicing', building: 'stg-permitted', construction: 'stg-construction', built: 'stg-built' };
  const ROWS = 10;
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = t => { if (!t) return '–'; const d = new Date(t); return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
  const attrs = a => Object.entries(a || {}).map(([k, v]) => (v == null || v === false ? '' : ` ${k}="${esc(v)}"`)).join('');

  function squarify(items, x, y, w, h) {
    const out = [], total = items.reduce((t, i) => t + i.v, 0);
    if (!(total > 0) || !(w > 0) || !(h > 0)) return out;
    let rest = items.filter(i => i.v > 0).map(i => ({ i, a: i.v * w * h / total }));
    while (rest.length) {
      const side = Math.min(w, h);
      const worst = r => { const s = r.reduce((t, e) => t + e.a, 0), mx = Math.max(...r.map(e => e.a)), mn = Math.min(...r.map(e => e.a)); return Math.max(side * side * mx / (s * s), s * s / (side * side * mn)); };
      const row = [rest[0]]; let k = 1;
      while (k < rest.length && worst([...row, rest[k]]) <= worst(row)) { row.push(rest[k]); k++; }
      const s = row.reduce((t, e) => t + e.a, 0);
      if (w >= h) { const cw = s / h; let cy = y; for (const e of row) { const ch = e.a / cw; out.push({ ...e.i, x, y: cy, w: cw, h: ch }); cy += ch; } x += cw; w -= cw; }
      else { const rh = s / w; let cx = x; for (const e of row) { const ew = e.a / rh; out.push({ ...e.i, x: cx, y, w: ew, h: rh }); cx += ew; } y += rh; h -= rh; }
      rest = rest.slice(k);
    }
    return out;
  }

  const CMP = { t: (a, b) => a.title.localeCompare(b.title), u: (a, b) => a.units - b.units, l: (a, b) => a.left - b.left, last: (a, b) => (a.last || 0) - (b.last || 0) };
  function sortRows(rows, sort) {
    const c = CMP[sort && sort.k] || CMP.l, d = sort && sort.dir ? sort.dir : -1;
    return [...rows].sort((a, b) => c(a, b) * d || b.left - a.left || a.title.localeCompare(b.title));
  }

  // A group's homes left to build by stage, as a bar (its width: the group's share of the largest group).
  const barHTML = (rows, max, stages) => `<span class="gt-bar" aria-hidden="true">${stages.map(([k]) => [k, rows.filter(r => r.st === k).reduce((t, r) => t + r.left, 0)]).filter(([, v]) => v >= 0.5).map(([k, v]) => `<i class="${STAGE_CLS[k]}" style="width:${(v / max * 100).toFixed(1)}%"></i>`).join('')}</span>`;

  // A development's name without its municipality and postal code (the full name on hover).
  const short = t => String(t || '').replace(/,?\s+(MISSISSAUGA|BRAMPTON|CALEDON)\b.*$/i, '').trim() || t;
  // A row: the name, and under it the stage, the area (when the groups are not areas), the site
  // servicing permit and its share here; the units, left to build and last activity in columns.
  function rowHTML(r, o) {
    const line = [`<span class="gt-stage"><i class="gt-dot ${STAGE_CLS[r.st] || ''}" aria-hidden="true"></i>${esc(o.stageLabel(r.st))}</span>`,
      o.where && r.where ? esc(r.where) : '', r.ss ? `<span class="gt-ss t-${esc(r.ss)}">${esc(o.ssLabel(r.ss))}</span>` : '', r.share < 0.99 ? `${Math.round(r.share * 100)}% here` : ''].filter(Boolean).join(' · ');
    return `<tr class="gt-r" data-ws-pick="${esc(r.key)}" data-ws-as="site"${r.hx != null ? ` data-hx="${r.hx}" data-hy="${r.hy}"` : ''}>`
      + `<td><button type="button" class="gt-name" data-ws-pick="${esc(r.key)}" data-ws-as="site" title="Check ${esc(r.title)}">${esc(short(r.title))}</button><small class="gt-line">${line}</small></td>`
      + `<td class="num">${fmt(r.units)}</td><td class="num"><b>${fmt(r.left)}</b></td>`
      + `<td class="num${r.quiet ? ' gt-quiet' : ''}"${r.quiet ? ' title="No activity since 2020"' : ''}>${month(r.last)}</td></tr>`;
  }

  // o: { title, groups: [{ key, name, sub, rows, open, all, drill, mapAttrs }], by, byOpts: [[key, label]],
  //      sort, tools (the stage buttons), where (the rows name their area: the groups are not areas),
  //      stages, stageLabel, ssLabel }
  function tableHTML(o) {
    const groups = o.groups.filter(g => g.rows.length);
    const max = Math.max(1, ...groups.map(g => g.rows.reduce((t, r) => t + r.left, 0)));
    const arrow = k => (o.sort && o.sort.k === k ? (o.sort.dir < 0 ? ' ↓' : ' ↑') : '');
    const sortTh = (k, label, num) => `<th scope="col"${num ? ' class="num"' : ''}${o.sort && o.sort.k === k ? ` aria-sort="${o.sort.dir < 0 ? 'descending' : 'ascending'}"` : ''}><button type="button" class="gt-sort" data-gt-sort="${k}">${esc(label)}${arrow(k)}</button></th>`;
    const by = `<div class="seg" role="group" aria-label="Group by"><span class="gt-by-l small muted">Group by</span>${o.byOpts.map(([k, l]) => `<button type="button" class="btn small${o.by === k ? ' on' : ''}" data-gt-by="${k}" aria-pressed="${o.by === k}">${esc(l)}</button>`).join('')}</div>`;
    const body = groups.map(g => {
      const rows = sortRows(g.rows, o.sort), shown = g.all ? rows : rows.slice(0, ROWS);
      const units = rows.reduce((t, r) => t + r.units, 0), left = rows.reduce((t, r) => t + r.left, 0);
      const head = o.by === 'none' ? '' : `<tr class="gt-gh"><th colspan="4" scope="rowgroup"><div class="gt-gh-in">`
        + `<button type="button" class="gt-tog" data-gt-tog="${esc(g.key)}" aria-expanded="${!!g.open}"><span class="gt-car" aria-hidden="true">${g.open ? '▾' : '▸'}</span><span class="gt-gn"><b>${esc(g.name)}</b><small class="muted">${g.sub ? `${esc(g.sub)} · ` : ''}${fmt(rows.length)} development${rows.length === 1 ? '' : 's'} · ${fmt(units)} units</small></span></button>`
        + `${barHTML(rows, max, o.stages)}<span class="gt-gl"><b>${fmt(left)}</b> <small class="muted">left</small></span>`
        + `${g.drill ? `<button type="button" class="btn small link" data-ws-drill="${esc(g.drill)}" title="Open ${esc(g.name)}">Open →</button>` : ''}`
        + `${g.mapAttrs ? `<button type="button" class="btn small link"${attrs(g.mapAttrs)}>On the map →</button>` : ''}</div></th></tr>`;
      const open = o.by === 'none' || g.open;
      const more = open && rows.length > ROWS ? `<tr class="gt-more"><td colspan="4"><button type="button" class="btn small link" data-gt-more="${esc(g.key)}">${g.all ? 'Show fewer' : `Show all ${fmt(rows.length)}`}</button></td></tr>` : '';
      return `<tbody class="gt-g">${head}${open ? shown.map(r => rowHTML(r, o)).join('') : ''}${more}</tbody>`;
    }).join('');
    const empty = groups.length ? '' : `<tbody><tr><td colspan="4" class="muted">${esc(o.empty || 'No developments.')}</td></tr></tbody>`;
    return `<section class="pnl-list page-list gt-wrap" data-psec="list"><div class="pnl-list-h"><h3>${esc(o.title)}</h3></div><div class="gt-tools">${by}${o.tools || ''}</div>`
      + `<div class="gt-scroll"><table class="gt"><thead><tr>${sortTh('t', 'Development')}${sortTh('u', 'Units', true)}${sortTh('l', 'Left to build', true)}${sortTh('last', 'Last activity', true)}</tr></thead>${body}${empty}</table></div></section>`;
  }

  // boxes: [{ key, name, drill, area, tiles: [{ key, title, v, st, hx, hy }] }]; o: { cap, stageLabel, height }
  function treemapHTML(boxes, o = {}) {
    const cap = o.cap || 30;
    const items = boxes.map(b => ({ ...b, v: b.tiles.reduce((t, x) => t + x.v, 0) })).filter(b => b.v >= 0.5).sort((a, b) => b.v - a.v);
    if (!items.length) return '';
    const pct = (x, y, w, h) => `left:${x.toFixed(3)}%;top:${y.toFixed(3)}%;width:${w.toFixed(3)}%;height:${h.toFixed(3)}%`;
    const html = squarify(items, 0, 0, 100, 100).map(b => {
      const ts = [...b.tiles].filter(t => t.v >= 0.5).sort((a, c) => c.v - a.v), top = ts.slice(0, cap), rest = ts.slice(cap);
      const tiles = rest.length ? [...top, { more: rest.length, v: rest.reduce((t, x) => t + x.v, 0) }] : top;
      const label = b.w > 14 && b.h > 9;
      const inner = squarify(tiles, 0, 0, 100, 100).map(t => {
        const big = t.w * b.w / 100 > 18 && t.h * b.h / 100 > 11;
        if (t.more) return `<span class="gtm-t gtm-more" style="${pct(t.x, t.y, t.w, t.h)}" title="${fmt(t.more)} smaller developments · ${fmt(t.v)} left">${big ? `<small>+${fmt(t.more)} more</small>` : ''}</span>`;
        const tip = `${t.title} · ${fmt(t.v)} left · ${o.stageLabel ? o.stageLabel(t.st) : t.st}`;
        return `<button type="button" class="gtm-t ${STAGE_CLS[t.st] || ''}" style="${pct(t.x, t.y, t.w, t.h)}" data-ws-pick="${esc(t.key)}" data-ws-as="site"${t.hx != null ? ` data-hx="${t.hx}" data-hy="${t.hy}"` : ''} title="${esc(tip)}" aria-label="${esc(tip)}">${big ? `<b>${esc(short(t.title))}</b><small>${fmt(t.v)}</small>` : ''}</button>`;
      }).join('');
      return `<div class="gtm-box" style="${pct(b.x, b.y, b.w, b.h)}" data-tm-box="${esc(b.key)}"${b.area ? ` data-tm-area="${esc(b.area)}"` : ''}>`
        + `${label ? (b.drill ? `<button type="button" class="gtm-h" data-ws-drill="${esc(b.drill)}" title="Open ${esc(b.name)}">${esc(b.name)} · ${fmt(b.v)}</button>` : `<span class="gtm-h">${esc(b.name)} · ${fmt(b.v)}</span>`) : ''}<div class="gtm-in">${inner}</div></div>`;
    }).join('');
    // The colour key: the stages the tiles show, in the order a file moves (and the lumped smaller ones).
    const shown = new Set(items.flatMap(b => b.tiles.filter(t => t.v >= 0.5).map(t => t.st)));
    const lumped = items.some(b => b.tiles.filter(t => t.v >= 0.5).length > cap);
    const key = Object.keys(STAGE_CLS).filter(k => shown.has(k)).map(k => `<span class="gtm-k"><i class="gtm-sw ${STAGE_CLS[k]}" aria-hidden="true"></i>${esc(o.stageLabel ? o.stageLabel(k) : k)}</span>`)
      .concat(lumped ? ['<span class="gtm-k"><i class="gtm-sw gtm-more" aria-hidden="true"></i>smaller developments, together</span>'] : []).join('');
    return `<div class="gtm" data-psec="treemap"><p class="small muted gtm-cap">${esc(o.caption || 'Homes left to build: a box per area, a tile per development (colour: stage). Hover to find it on the map.')}</p><div class="gtm-area">${html}</div><div class="gtm-key small" aria-label="Tile colours: the stage">${key}</div></div>`;
  }

  const api = { squarify, sortRows, short, tableHTML, treemapHTML, STAGE_CLS, ROWS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelDevTable = api;
})(typeof window !== 'undefined' ? window : globalThis);
