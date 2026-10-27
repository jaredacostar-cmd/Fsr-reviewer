/* How is this worked out? (PeelHow): every figure in a panel or on a page has a "How?" button that
 * opens what it is made of: the rule, the inputs with their values and where each comes from (the
 * file's record, the design criteria document and section), the data files it reads (each with its
 * receipt: source link, date, citation: js/sources.js) and the scenario's criteria.
 *
 * A figure may carry its own working, `how: { rule, inputs: [{ label, value, src }], files }`; the
 * builders below give it for a development's units, people, jobs and flows. A figure without one
 * still opens its panel's method and sources and the data files its panel reads (FILES), so no
 * figure is without a way to check it. tests/how.test.js holds every panel and page to a FILES entry.
 *
 * src: { doc: 'linear-ww', where: 'Table 2-2' } (a design criteria document, data/peel-reports.json
 * › standards), { rec: record } (a municipal file: its record in its layer), { file: 'housing.json' }
 * (a data file's receipt) or { url, label }.
 *
 * Pure builders (units, people, jobs, water, wastewater, boxHTML, citeText, filesFor) run in Node;
 * the button, the box and the copy run in the browser.
 */
(function (root) {
  'use strict';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const strip = s => String(s == null ? '' : s).replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  const n0 = v => (v == null || !isFinite(v) ? '–' : Math.round(v).toLocaleString('en-CA'));
  const n1 = v => (v == null || !isFinite(v) ? '–' : (Math.round(v * 10) / 10).toLocaleString('en-CA', { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
  const n2 = v => (v == null || !isFinite(v) ? '–' : v.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  const SPD = 86400;

  // ---- The data files each panel and page reads (by panel key prefix or page id) -------------------
  const DEV = ['snapshot.json', 'tree-counts.json', 'unit-lookups.json', 'address-points.json'];
  const SVC = ['servicing.json', 'svc-census.json', 'das.json', 'peel-reports.json', 'plant-flows.json', 'master-plan-water.json', 'master-plan-wastewater.json', 'water-facilities.json', 'ww-facilities.json'];
  const CAP = ['capital.json', 'eas.json', 'dc-infra.json', 'dc-costs.json', 'dc-gate.json', 'servicing-permits.json'];
  const GROWTH = ['snapshot.json', 'tree-counts.json', 'history.json', 'areas.json', 'das.json', 'housing.json', 'peel-housing.json', 'plan-targets.json'];
  const FILES = {
    // Panels (js/panel.js keys: tab:sub-view)
    'overview:': [...DEV, 'servicing.json', 'peel-reports.json', 'dc-infra.json', 'council-decisions.json', 'fsr.json'],
    'overview:result': [...DEV, ...SVC],
    'growth:pipeline': GROWTH,
    'growth:areas': [...GROWTH, 'svc-census.json'],
    'growth:timing': [...GROWTH, 'site-audit.json', 'dc-gate.json', 'servicing.json'],   // (navigation phase 3: By period, the pipeline ledger, too)
    'svc:capacity': [...SVC, 'snapshot.json', 'tree-counts.json'],
    'svc:network': [...SVC, 'sewers.json', 'watermains.json', 'water-supply.json', 'blocks.json', 'idf.json'],
    'dca:timing': [...CAP, ...SVC, 'sewers.json', 'dc-joins.json', 'snapshot.json'],   // (navigation phase 4: DC projects' list too, both verdicts)
    'dca:projects': CAP,
    'dca:eas': ['eas.json', 'capital.json'],   // (navigation phase 4: EA to construction too, its fold)
    'records:files': DEV,
    'records:sources': ['snapshot.json', 'history.json'],
    'records:checks': [...SVC, 'snapshot.json', 'site-audit.json', 'tree-audit.json', 'peel-housing.json', 'housing.json', 'compliance.json', 'ww-events.json', 'dev-outlets.json'],   // (navigation phase 2: the servicing model's checks too)
    // Pages (js/ws-pages.js BUILD ids)
    home: [...GROWTH, ...SVC, ...CAP],
    tight: [...SVC, 'snapshot.json', 'tree-counts.json'],
    site: [...DEV, ...SVC],
    growth: GROWTH,
    outlook: [...GROWTH, ...SVC, 'dc-gate.json'],
    coming: [...GROWTH, ...SVC, 'dc-gate.json'],   // (navigation phase 3: the Forecast page, By period open)
    projects: [...CAP, ...SVC, 'sewers.json', 'dc-joins.json', 'snapshot.json'],   // (its figures are DC timing's: both models)
    eaflow: ['eas.json', 'capital.json'],   // (the EAs page: the EAs, then EA to construction)
    week: ['snapshot.json', 'history.json', 'capital.json', 'eas.json', 'council.json'],
    fsr: ['fsr.json', ...DEV, ...SVC],
    pipes: ['sewers.json', 'servicing.json', 'snapshot.json'],
    outlets: ['dev-outlets.json', 'sewers.json', 'sewers-local.json', 'dc-infra.json', 'dc-joins.json', 'servicing.json', 'snapshot.json'],
    study: [...DEV, ...SVC],
    // (Labs › Sewer designer: the Region's mains, the terrain and the roads, read live)
    sewer: [],
    data: [],
    guides: [], roles: [], approvals: [], glossary: [], logic: [], help: [],
    flows: ['peel-reports.json'], network: ['servicing.json', 'peel-reports.json', 'water-facilities.json', 'ww-facilities.json'],
    capacity: ['peel-reports.json', 'plant-flows.json', 'water-facilities.json', 'ww-facilities.json'],
    fsrguide: ['fsr.json'], capguide: ['capital.json', 'eas.json', 'dc-infra.json'],
    targets: ['housing.json', 'plan-targets.json', 'snapshot.json'], forecast: ['history.json', 'housing.json', 'peel-housing.json', 'snapshot.json'],
  };
  /** The data files a panel key ('svc:capacity', 'overview:') or page id ('tight') reads; null when none is listed. */
  function filesFor(key) {
    if (key == null) return null;
    const k = String(key);
    if (FILES[k]) return [...new Set(FILES[k])];
    const pre = Object.keys(FILES).filter(x => k.startsWith(x)).sort((a, b) => b.length - a.length)[0];
    return pre ? [...new Set(FILES[pre])] : null;
  }

  // ---- A development's figures, worked out ---------------------------------------------------------
  const TYPE = { single: 'Single / semi-detached', town: 'Townhouse', apartment: 'Apartment', unknown: 'Type not stated' };
  const BASIS = {
    master: 'The largest unit count stated on the rezoning / official plan / subdivision files (across resubmissions).',
    siteplan: 'The site plan phases added up: each tower or block has its own site plan.',
    condo: 'The condominium phases added up: each building is registered separately.',
    other: 'The unit counts stated on the planning applications.',
    precon: 'The pre-consultation’s count: no later file states one yet, so it can change.',
  };
  /** Units counted: the rule that picked the count, and each file that states a count (its record). */
  function units(p) {
    const b = p.buildout || {};
    const stated = (p.records || []).filter(r => r.kind === 'application' && r.units > 0).sort((a, c) => c.units - a.units);
    const permits = (p.records || []).filter(r => r.kind === 'permit' && r.units > 0);
    const inputs = stated.slice(0, 8).map(r => ({ label: `${r.ref || 'file'}${r.type ? ` · ${r.type}` : ''}${r.statusRaw ? ` · ${r.statusRaw}` : ''}`, value: `${n0(r.units)} units${r.unitsFromText ? ' (read from the description)' : ''}`, src: { rec: r } }));
    if (stated.length > 8) inputs.push({ label: `${stated.length - 8} more files stating units`, value: '', src: null });
    if (b.permitted > 0) inputs.push({ label: `Building permits adding units (${n0(permits.length)})`, value: `${n0(b.permitted)} units`, src: null });
    if (p.unitsLost) inputs.push({ label: 'Demolished', value: `−${n0(p.unitsLost)} units`, src: null });
    const rule = [b.basis ? BASIS[b.basis] || '' : 'The unit counts stated on the planning applications.',
      b.permitted > b.planned ? 'More units are permitted than the applications state, so the permits are the total.' : '',
      p.unitsLost ? 'Net of the homes demolished on the site.' : '',
      !stated.length && !(b.permitted > 0) ? 'No file on the site states a unit count.' : ''].filter(Boolean).join(' ');
    return { rule, inputs, files: DEV };
  }
  /** People at build-out: units by type × Peel persons per unit (high-density apartments at the lower rate). */
  function people(pe, criteria) {
    const ppu = (criteria && criteria.ppu) || {};
    const inputs = Object.keys(TYPE).filter(k => pe.units && pe.units[k] > 0).map(k => {
      const rate = pe.pop[k] / pe.units[k];
      return { label: TYPE[k], value: `${n0(pe.units[k])} units × ${n2(rate)} = ${n0(pe.pop[k])} people`, src: { doc: 'linear-ww', where: 'Tables 2-1 / 2-2' } };
    });
    const apt = pe.units && pe.units.apartment > 0 && ppu.apartmentHigh != null;
    return { rule: `People = units of each type × Peel’s persons per unit (single / semi ${n2(ppu.single)}, townhouse ${n2(ppu.town)}, apartment ${n2(ppu.apartment)}, type not stated ${n2(ppu.unknown)})${apt ? `; apartments on a site denser than 475 persons/ha use ${n2(ppu.apartmentHigh)}` : ''}. Total ${n0(pe.population)} people.`,
      inputs, files: DEV };
  }
  /** Jobs: the floor area on the applications ÷ floor space per job, by use. */
  // em: js/employment.js { uses: [{ key, label, m2, jobs, fromField, fromPermit }], totalM2, jobs }
  function jobs(em, criteria) {
    const per = (criteria && criteria.m2PerJob) || {};
    const inputs = ((em && em.uses) || []).filter(u => u.m2 > 0).map(u => ({ label: `${u.label}${u.fromPermit ? ' (building permits)' : u.fromField ? ' (floor area on the application)' : ' (read from the description)'}`, value: `${n0(u.m2)} m² ÷ ${n0(per[u.key])} m²/job = ${n0(u.jobs)} jobs`, src: { doc: 'planning', where: 'floor space per job' } }));
    return { rule: 'Jobs = the floor area the applications state for each use ÷ a typical floor space per job for that use (a planning assumption, not a Peel standard).', inputs, files: DEV };
  }
  /** Water, maximum day: (people × L/cap/d ÷ 86,400) × the maximum day factor, plus jobs at the ICI rates. */
  function water(pe, criteria) {
    const w = criteria.water, avg = pe.water.avg, e = pe.employment;
    const inputs = [
      { label: 'Average day, residential', value: `${n0(pe.population)} people × ${n0(w.avg)} L/cap/d ÷ 86,400 = ${n2(avg)} L/s`, src: { doc: 'modelling-table', where: 'water, residential' } },
      { label: 'Maximum day factor', value: `× ${n2(w.maxDay)} = ${n2(avg * w.maxDay)} L/s`, src: { doc: 'modelling-table', where: 'water, residential' } },
    ];
    if (e && e.jobs > 0) inputs.push({ label: 'Employment, maximum day', value: `${n0(e.jobs)} jobs × ${n0(criteria.employment.water)} L/emp/d ÷ 86,400 × ${n2(criteria.employment.maxDay)} = ${n2(e.water.maxDay)} L/s`, src: { doc: 'modelling-table', where: 'water, non-residential' } });
    return { rule: `Maximum day demand = average day × the maximum day factor, residential and employment added: ${n1(pe.combined.water.maxDay)} L/s.`, inputs, files: DEV };
  }
  /** Wastewater, peak wet weather: average dry weather × Harmon peaking (2–4) + I&I on the site area. */
  function wastewater(pe, criteria) {
    const c = criteria.wastewater, ww = pe.wastewater, e = pe.employment;
    const inputs = [
      { label: 'Average dry weather, residential', value: `${n0(pe.population)} people × ${n0(c.avg)} L/cap/d ÷ 86,400 = ${n2(ww.avg)} L/s`, src: { doc: 'linear-ww', where: 's. 2.2' } },
      { label: 'Harmon peaking factor', value: `M = 1 + 14 / (4 + √(${n0(pe.population)} / 1000)), held to 2–4 = ${n2(ww.peakingFactor)}; peak ${n2(ww.peak)} L/s`, src: { doc: 'linear-ww', where: 's. 2.4' } },
      { label: `I&I on ${n2(pe.area.ha)} ha${pe.area.estimatedHa > 0 ? ' (area estimated from the units)' : ' (application boundary)'}`, value: `${n2(pe.area.ha)} ha × ${n2(c.infiltration)} L/s/ha = ${n2(ww.infiltration)} L/s`, src: { doc: 'linear-ww', where: 's. 2.5' } },
    ];
    if (e && e.jobs > 0) inputs.push({ label: 'Employment, peak wet weather', value: `${n0(e.jobs)} jobs × ${n0(criteria.employment.wastewater)} L/emp/d ÷ 86,400 × ${n2(e.wastewater.peakingFactor)} + I&I ${n2(e.wastewater.infiltration)} = ${n2(e.wastewater.wetPeak)} L/s`, src: { doc: 'linear-ww', where: 's. 2.2, 2.4' } });
    return { rule: `Peak wet weather flow = average dry weather × peaking factor + I&I (Linear Wastewater Standards s. 2.6), residential and employment added: ${n1(pe.combined.wastewater.wetPeak)} L/s.`, inputs, files: DEV };
  }

  // ---- Servicing capacity (js/svc-capacity.js rows) --------------------------------------------------
  // row: { name, sub, sys, kind, unit, cap, capWord, basis, existing, built, committed, buildout, pctBo }
  const BASIS_WORD = { metered: '2025 metered flow (annual report), calibrated', design: 'Peel design criteria', mp: '2020 Master Plan' };
  const qty = (v, u) => `${u === 'L/s' ? n0(v) : n1(v)} ${u}`;
  function basisSrc(r) {
    if (r.basis === 'metered') return { file: 'peel-reports.json' };
    if (r.basis === 'mp') return { file: r.sys === 'water' ? 'master-plan-water.json' : 'master-plan-wastewater.json' };
    return { doc: r.sys === 'water' ? 'modelling-table' : 'linear-ww', where: 'design flows' };
  }
  // Where the capacity itself comes from: plants' rated capacity from the annual reports, firm pumping
  // and storage from the facilities (2020 Master Plan tables), full-pipe from the sewer network.
  function capSrc(r) {
    if (r.kind === 'plant' || r.kind === 'wplant') return { file: 'peel-reports.json' };
    if (r.kind === 'pipe') return { file: 'sewers.json' };
    return { file: r.sys === 'water' ? 'water-facilities.json' : 'ww-facilities.json' };
  }
  const rowInput = r => ({ label: `${r.name}${r.sub ? ` · ${r.sub}` : ''}`, value: `${qty(r.buildout, r.unit)} at build-out (${BASIS_WORD[r.basis] || r.basis}) ÷ ${qty(r.cap, r.unit)} ${r.capWord} = ${Math.round(r.pctBo)}%`, src: capSrc(r) });
  /** A count of facilities at build-out: which ones, and each one's load ÷ capacity. */
  function capacityCount(rows, lo, hi) {
    const hit = (rows || []).filter(r => r.pctBo >= lo && (hi == null || r.pctBo < hi)).sort((a, b) => b.pctBo - a.pctBo);
    return { rule: `Facilities whose flow at build-out (existing + built + committed + proposed) is ${hi == null ? `${lo}% or more` : `${lo}% to under ${hi}%`} of their capacity: rated for treatment, firm for pumping, available for storage, full-pipe for sewers. ${hit.length} of ${(rows || []).length}.`,
      inputs: [...hit.slice(0, 10).map(rowInput), ...(hit.length > 10 ? [{ label: `${hit.length - 10} more`, value: 'in the full table', src: null }] : [])],
      files: [...new Set([...SVC, 'snapshot.json', 'tree-counts.json'])] };
  }
  /** One facility's load, part by part, against its capacity. */
  function capacityRow(r) {
    const step = (label, v) => ({ label, value: qty(v, r.unit), src: basisSrc(r) });
    return { rule: `${r.name}: the flow at build-out against its ${r.capWord} capacity, ${Math.round(r.pctBo)}%. Basis: ${BASIS_WORD[r.basis] || r.basis}.`,
      inputs: [step('Existing', r.existing), step('+ built since', r.built - r.existing), step('+ committed (approved)', r.committed - r.built), step('+ proposed (in review)', r.buildout - r.committed),
        { label: `${r.capWord[0].toUpperCase()}${r.capWord.slice(1)} capacity`, value: qty(r.cap, r.unit), src: capSrc(r) }],
      files: [...new Set([...SVC, 'snapshot.json', 'tree-counts.json'])] };
  }

  // ---- The box ---------------------------------------------------------------------------------------
  /**
   * The box under a figure. entry: { fig: { v, u, label, ctx }, how, method, sources, files, key };
   * ctx (resolved by the browser part, plain values in tests): { docs: { id: { title, url } },
   * recUrl(r) → url | null, receipts: [{ file, title, asOf, dateMeaning, links }] | null, criteria }.
   */
  function boxHTML(entry, ctx = {}) {
    const f = entry.fig || {}, h = entry.how || null, docs = ctx.docs || {};
    const srcHTML = s => {
      if (!s) return '';
      if (s.doc) { const d = docs[s.doc]; return d && d.url ? `<a href="${esc(d.url)}" target="_blank" rel="noopener">${esc(d.short || d.title)}${s.where ? `, ${esc(s.where)}` : ''} ↗</a>` : `${esc(s.doc === 'planning' ? 'Planning assumption' : s.doc)}${s.where ? `, ${esc(s.where)}` : ''}`; }
      if (s.rec) { const u = ctx.recUrl ? ctx.recUrl(s.rec) : null; return u ? `<a href="${esc(u)}" target="_blank" rel="noopener">Record ↗</a>` : esc(s.rec.sourceName || ''); }
      if (s.file) { const r = (ctx.receipts || []).find(x => x.file === s.file), l = r && r.links && r.links[0];
        return l ? `<a href="${esc(l.url)}" target="_blank" rel="noopener" title="data/${esc(s.file)}">${esc(l.label)} ↗</a>` : `<code>data/${esc(s.file)}</code>`; }
      if (s.url) return `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.label || 'Source')} ↗</a>`;
      return '';
    };
    const out = [`<p class="how-fig"><strong>${f.v}${f.u ? ` ${esc(f.u)}` : ''}</strong> ${esc(f.label || '')}</p>`];
    if (h && h.rule) out.push(`<p class="how-rule"><span class="how-k">Worked out</span>${h.rule}</p>`);
    if (h && h.inputs && h.inputs.length) out.push(`<table class="how-in" aria-label="Inputs"><tbody>${h.inputs.map(i => `<tr><th scope="row">${esc(i.label)}</th><td>${esc(i.value)}</td><td>${srcHTML(i.src)}</td></tr>`).join('')}</tbody></table>`);
    if (!h && entry.method) out.push(`<p class="how-rule"><span class="how-k">How this panel works it out</span>${entry.method}</p>`);
    if (entry.sources) out.push(`<p class="how-src small muted"><span class="how-k">Sources</span>${entry.sources}</p>`);
    if (ctx.criteria) out.push(`<p class="small muted"><span class="how-k">Criteria</span>${esc(ctx.criteria)}</p>`);
    const files = (h && h.files) || entry.files || [];
    if (files.length) {
      const rs = ctx.receipts;
      out.push(`<div class="how-files"><span class="how-k">Data it reads</span>${rs ? `<ul>${files.map(fl => { const r = rs.find(x => x.file === fl); if (!r) return `<li><code>data/${esc(fl)}</code></li>`; const l = r.links && r.links[0];
        return `<li><strong>${esc(r.title)}</strong> <small><code>data/${esc(fl)}</code>${r.asOf ? ` · ${esc(r.dateMeaning || 'as of')} ${esc(r.asOf)}` : ''}</small>${l ? ` · <a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)} ↗</a>` : r.from && r.from.length ? ` · built from ${r.from.map(x => `<code>${esc(x)}</code>`).join(', ')}` : ''} · <button type="button" class="btn small link" data-src-cite="${esc(fl)}">Copy citation</button></li>`; }).join('')}</ul>` : `<p class="small muted">${files.map(fl => `<code>data/${esc(fl)}</code>`).join(', ')}</p>`}</div>`);
    }
    return out.join('');
  }
  /** The figure, its working and its data as plain text (Copy). */
  function citeText(entry, ctx = {}) {
    const f = entry.fig || {}, h = entry.how || null, docs = ctx.docs || {};
    const src = s => (!s ? '' : s.doc ? `${(docs[s.doc] && (docs[s.doc].title)) || s.doc}${s.where ? `, ${s.where}` : ''}${docs[s.doc] && docs[s.doc].url ? ` (${docs[s.doc].url})` : ''}` : s.rec ? (ctx.recUrl && ctx.recUrl(s.rec)) || s.rec.sourceName || '' : s.file ? `data/${s.file}` : s.url || '');
    const lines = [`${strip(f.v)}${f.u ? ` ${f.u}` : ''} ${strip(f.label)}`.trim()];
    if (h && h.rule) lines.push(`Worked out: ${strip(h.rule)}`);
    for (const i of (h && h.inputs) || []) lines.push(`- ${i.label}: ${i.value}${i.src ? ` [${src(i.src)}]` : ''}`);
    if (!h && entry.method) lines.push(`Method: ${strip(entry.method)}`);
    if (entry.sources) lines.push(`Sources: ${strip(entry.sources)}`);
    if (ctx.criteria) lines.push(`Criteria: ${ctx.criteria}`);
    const files = (h && h.files) || entry.files || [];
    if (files.length) lines.push(`Data: ${files.map(fl => { const r = (ctx.receipts || []).find(x => x.file === fl); return `data/${fl}${r && r.asOf ? ` (${r.asOf})` : ''}`; }).join(', ')}`);
    return lines.join('\n');
  }

  // ---- Browser: the button, the registry, the box, copy ----------------------------------------------
  const REG = new Map();
  /** The "How?" button for a figure, registered under a fixed id (panel key + position) so a re-render is unchanged. */
  function button(f, panel, i) {
    if (!f) return '';
    const key = panel && (panel.key || panel.id) || '';
    const id = `${key}#${i}`;
    REG.set(id, { fig: { v: f.v, u: f.u, label: f.label }, how: f.how || null, method: panel ? panel.method || '' : '', sources: panel ? panel.sources || '' : '', files: f.files || (panel && panel.files) || filesFor(key) || [], key });
    return `<button type="button" class="fig-how" data-how="${esc(id)}" aria-expanded="false" title="How is this worked out?" aria-label="How is ${esc(strip(f.label))} worked out?">?</button>`;
  }
  const App = () => root.PeelApp;
  function ctxNow(receipts) {
    const S = App() && App().state, PV = root.PeelProvenance, U = root.PeelUtil;
    const docs = {};
    for (const s of (S && S.reports && S.reports.standards) || []) docs[s.id] = { title: s.title, short: s.title.replace(/^Region of Peel – /, '').replace(/\s*\(.*\)$/, ''), url: s.url };
    const recUrl = r => {
      if (!PV || !r || !r.sourceId || !S) return null;
      const id = String(r.sourceId).split('/')[0], s = (S.sources || []).find(x => x.id === id || String(x.id).split('/')[0] === id);
      return s ? PV.recordSourceUrl(r, s.url, { format: 'html' }) : null;
    };
    return { docs, recUrl, receipts, criteria: U && U.CRITERIA_STAMP ? strip(U.CRITERIA_STAMP) : '' };
  }
  // The open box's figure: a panel or page that re-renders (Home while its figures load, a filter, the
  // scenario) gets its box back under the same figure.
  let openId = null;
  function open(btn, again = false) {
    const id = btn.dataset.how, e = REG.get(id); if (!e) return;
    const figs = btn.closest('.pnl-figs'); if (!figs) return;
    const next = figs.nextElementSibling, same = next && next.classList.contains('how-box') && next.dataset.how === id;
    figs.querySelectorAll('.fig-how[aria-expanded="true"]').forEach(b => b.setAttribute('aria-expanded', 'false'));
    if (next && next.classList.contains('how-box')) next.remove();
    if (same && !again) { openId = null; return; }
    openId = id;
    btn.setAttribute('aria-expanded', 'true');
    const box = root.document.createElement('section');
    box.className = 'how-box small'; box.dataset.how = id; box.setAttribute('aria-label', 'How this figure is worked out');
    const fill = rs => { box.innerHTML = `${boxHTML(e, ctxNow(rs))}<p class="how-acts"><button type="button" class="btn small" data-how-copy="${esc(id)}">Copy the working</button> <button type="button" class="btn small link" data-how-close>Close</button></p>`; };
    fill(null);
    figs.after(box);
    if (root.PeelSources) root.PeelSources.load().then(d => { if (box.isConnected && d.rows.length) fill(d.rows); });
  }
  if (root.document) {
    // (capture: a figure card is often a button itself; the "?" opens the box, not the card)
    root.document.addEventListener('click', ev => {
      const t = ev.target.closest && ev.target.closest('[data-how],[data-how-copy],[data-how-close]');
      if (!t) return;
      if (t.matches('.how-box')) return;
      ev.stopPropagation(); ev.preventDefault();
      if (t.dataset.howClose != null) { openId = null; const b = t.closest('.how-box'); if (b) { const f = b.previousElementSibling; if (f) f.querySelectorAll('.fig-how[aria-expanded="true"]').forEach(x => x.setAttribute('aria-expanded', 'false')); b.remove(); } return; }
      if (t.dataset.howCopy) {
        const e = REG.get(t.dataset.howCopy); if (!e) return;
        const go = rs => { const text = citeText(e, ctxNow(rs)); const done = () => { t.textContent = 'Copied'; setTimeout(() => { t.textContent = 'Copy the working'; }, 1500); };
          if (root.navigator && root.navigator.clipboard) root.navigator.clipboard.writeText(text).then(done, () => root.prompt('The working', text)); else root.prompt('The working', text); };
        if (root.PeelSources) root.PeelSources.load().then(d => go(d.rows)); else go(null);
        return;
      }
      open(t);
    }, true);
    if (typeof root.MutationObserver === 'function') {
      let queued = false;
      new root.MutationObserver(() => {
        if (!openId || queued) return;
        queued = true;
        root.requestAnimationFrame(() => {
          queued = false; if (!openId) return;
          const b = [...root.document.querySelectorAll('.fig-how')].find(x => x.dataset.how === openId && x.offsetParent);
          const figs = b && b.closest('.pnl-figs'), nx = figs && figs.nextElementSibling;
          if (b && !(nx && nx.classList.contains('how-box') && nx.dataset.how === openId)) open(b, true);
        });
      }).observe(root.document.body || root.document.documentElement, { childList: true, subtree: true });
    }
    root.document.addEventListener('keydown', ev => { if (ev.key === 'Enter' && ev.target.matches && ev.target.matches('.fig-how')) ev.stopPropagation(); }, true);
  }

  const api = { FILES, filesFor, units, people, jobs, water, wastewater, capacityCount, capacityRow, capSrc, boxHTML, citeText, button, REG };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelHow = api;
})(typeof window !== 'undefined' ? window : globalThis);
