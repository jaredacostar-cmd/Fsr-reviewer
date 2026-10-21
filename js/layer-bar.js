(function (root) {
'use strict';
  // The shared stacked bar (SPEC §2): every capacity bar, the Growth pipeline strip, By plan rows,
  // the timeline, Pace and Capital draw their layers with it, in the --ly-* tokens (css/app.css).
  //
  //   barHTML({ segments: [{ layer, value, est?, title? }], max?, rated?, trigger?, unit?, fmt?,
  //             label?, small? })
  //     segments stack left to right in the order given (Existing → Built → Committed → Proposed →
  //     Anticipated → To 2051); `est` of a segment's value is hatched (estimated, not stated).
  //     rated: 100% mark (grey tick) and the start of the red hatch beyond it; trigger: the 90%
  //     expansion trigger (white tick). max: the bar's full width (default: the larger of the stack,
  //     rated × 1.2). Values in any unit; fmt formats them for the tooltips.
  //   legendHTML(items)  the same swatches: [{ layer, value?, text? }] or 'trigger' | 'rated' |
  //                      'over' | 'est'
  //   badgeHTML(phaseText, L)  "<phase> → counts as <Layer>" (the site badge)
  //   nameHTML(layer)    the layer's name with its swatch (list rows, "Developments loading it")
  // Pure strings.
  // Plain names (the technical term in brackets where engineers use it: committed is MECP D-5-1's).
  const LABEL = { existing: 'On the system (2021 census)', built: 'Built since 2021', committed: 'Approved, not yet built (committed)', proposed: 'In review', anticipated: 'Pre-application', to2051: 'To 2051' };
  // Short names for table headings and tight rows.
  const SHORT = { existing: 'On the system', built: 'Built since 2021', committed: 'Approved, not yet built', proposed: 'In review', anticipated: 'Pre-application', to2051: 'To 2051' };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = v => Math.round(v).toLocaleString('en-CA');
  const pc = v => `${Math.max(0, Math.min(100, v)).toFixed(2)}%`;

  function barHTML(o) {
    const segs = (o.segments || []).filter(s => s && LABEL[s.layer] && s.value > 0);
    const total = segs.reduce((t, s) => t + s.value, 0);
    const max = o.max > 0 ? o.max : Math.max(total, o.rated > 0 ? o.rated * 1.2 : 0) || 1;
    const fmt = o.fmt || num, unit = o.unit ? ` ${o.unit}` : '';
    const at = v => v / max * 100;
    let x = 0; const out = [];
    for (const s of segs) {
      const w = at(s.value);
      const t = s.title || `${LABEL[s.layer]}: ${fmt(s.value)}${unit}${s.est > 0 ? ` (${fmt(s.est)} estimated)` : ''}`;
      out.push(`<span class="ly-seg ly-${s.layer}" style="left:${pc(x)};width:${pc(w)}" title="${esc(t)}"></span>`);
      if (s.est > 0) { const e = at(Math.min(s.est, s.value)); out.push(`<span class="ly-est" style="left:${pc(x + w - e)};width:${pc(e)}"></span>`); }
      x += w;
    }
    if (o.rated > 0) {
      const r = at(o.rated);
      if (total > o.rated) out.push(`<span class="ly-over" style="left:${pc(r)};width:${pc(at(total) - r)}" title="Beyond rated: ${esc(fmt(total - o.rated))}${esc(unit)}"></span>`);
      if (o.trigger > 0) out.push(`<span class="ly-tick ly-trig" style="left:${pc(at(o.trigger))}" title="${esc(o.triggerLabel || '90% expansion trigger')}"></span>`);
      out.push(`<span class="ly-tick ly-rated" style="left:${pc(r)}" title="${esc(o.ratedLabel || '100% rated')}"></span>`);
    }
    const aria = o.label || segs.map(s => `${LABEL[s.layer]} ${fmt(s.value)}${unit}`).join(', ');
    return `<div class="lybar${o.small ? ' sm' : ''}" role="img" aria-label="${esc(aria)}">${out.join('')}</div>`;
  }

  // (one word for the 100% mark whatever the basis: the chart's title names it, firm or rated)
  const MARK = { trigger: ['ly-tick-sw', '90% trigger'], rated: ['ly-rated-sw', '100% capacity'], over: ['ly-over-sw', 'past capacity'], est: ['ly-est-sw', 'estimated'] };
  function legendHTML(items, o = {}) {
    const fmt = o.fmt || num;
    return `<div class="ly-legend${o.cls ? ` ${o.cls}` : ''}">${items.map(it => {
      if (typeof it === 'string') { const m = MARK[it]; return m ? `<span><span class="ly-sw ${m[0]}"></span>${m[1]}</span>` : ''; }
      if (!LABEL[it.layer]) return '';
      return `<span><span class="ly-sw ly-${it.layer}"></span>${esc(it.text || LABEL[it.layer])}${it.value != null ? ` <b>${esc(fmt(it.value))}</b>` : ''}</span>`;
    }).join('')}</div>`;
  }

  const PILL = { existing: 'var(--ly-existing)', built: 'var(--ly-built)', committed: 'var(--ly-committed)', proposed: 'var(--ly-proposed)', anticipated: 'var(--ly-anticipated)', to2051: 'var(--ly-to2051)' };
  /** Phase and layer together: "3 · zoning approved → counts as In review" (SPEC §2.7; the short name). */
  function badgeHTML(phaseText, L, o = {}) {
    if (!L || !L.layer) return `<span class="ly-badge"><span class="ly-pill" style="background:var(--surface-2);color:var(--text-secondary)">${esc(phaseText)}</span></span>`;
    const ink = L.layer === 'existing' || L.layer === 'built' ? 'var(--map-label)' : 'var(--ly-ink)';
    // What an approved development has left to permit (the board's "Approved · 343 left").
    const left = L.layer === 'committed' && L.toPermit > 0 && L.toPermit < L.units ? ` · ${num(L.toPermit)} left` : '';
    return `<span class="ly-badge"><span class="ly-pill" style="background:var(--surface-2);color:var(--text-primary)">${esc(phaseText)}</span><span class="ly-arrow">→</span><span class="ly-pill" style="background:${PILL[L.layer]};color:${ink}" title="${esc(o.title || '')}">counts as ${SHORT[L.layer]}${left}</span></span>`;
  }
  // A development's stage in words (js/phases.js labels, the one set the app uses). Its counting
  // category follows the stage, so it is not repeated ("In review → counts as In review"); only Built
  // says which side of census day it is on.
  function stageText(p, L) {
    const P = root.PeelPhases || (typeof require === 'function' ? require('./phases.js') : null);
    const ph = P && P.PHASE_BY_KEY[p.phase];
    if (p.phase === 'completed') return L && L.layer === 'existing' ? 'Built before the 2021 census' : 'Built since 2021';
    return ph ? ph.label : p.phase;
  }
  /** The site badge for a development: "2 · In review · zoning approved", in its stage's colour; an
   *  approved one says what it has left to permit ("5 · Under construction · 343 left to permit"). */
  function siteBadgeHTML(p, o = {}) {
    const P = root.PeelPhases || (typeof require === 'function' ? require('./phases.js') : null);
    const Ly = root.PeelLayers || (typeof require === 'function' ? require('./layers.js') : null);
    const ph = P && P.PHASE_BY_KEY[p.phase];
    const zoning = p.zoningApproved && ph && ph.rank < P.PHASE_BY_KEY.approved.rank;
    const L = Ly ? Ly.ofDev(p, o) : null;
    const text = `${ph ? `${ph.short} · ` : ''}${stageText(p, L)}${zoning ? ' · zoning approved' : ''}`;
    if (!L || !L.layer) return badgeHTML(text, L);
    const ink = L.layer === 'existing' || L.layer === 'built' ? 'var(--map-label)' : 'var(--ly-ink)';
    const left = L.layer === 'committed' && L.toPermit > 0 && L.toPermit < L.units ? ` · ${num(L.toPermit)} left to permit` : '';
    return `<span class="ly-badge"><span class="ly-pill" style="background:${PILL[L.layer]};color:${ink}" title="${esc(`Counts as ${LABEL[L.layer]}: ${Ly.NOTE[L.layer]}`)}">${esc(text)}${left}</span></span>`;
  }
  const nameHTML = (layer, short) => (LABEL[layer] ? `<span class="ly-name" style="--ly-c:${PILL[layer]}"${short ? ` title="${LABEL[layer]}"` : ''}>${short ? SHORT[layer] : LABEL[layer]}</span>` : '<span class="muted">none</span>');

  /** A capacity result (js/capacity.js compute / of) as the layered bar: Existing, Built, Committed,
   *  Proposed against rated (or firm), the trigger tick and the red hatch beyond. */
  function capacityBarHTML(k, o = {}) {
    if (!k || !(k.cap > 0)) return '';
    const f = o.fmt || (v => (Math.abs(v) >= 100 ? Math.round(v).toLocaleString('en-CA') : (Math.round(v * 10) / 10).toLocaleString('en-CA')));
    const pct = v => `${Math.round(v / k.cap * 100)}%`;
    const seg = (layer, v) => ({ layer, value: v, title: `${LABEL[layer]}: ${f(v)} ${k.unit || ''} (${pct(v)} of ${k.firm != null ? 'firm' : 'rated'})` });
    const segs = [seg('existing', k.existing), seg('built', k.built), seg('committed', Math.max(0, k.committed - k.existing - k.built)), seg('proposed', Math.max(0, k.buildout - k.committed))];
    const max = Math.max(k.cap * 1.3, k.buildout), at = v => `${(Math.min(v, max) / max * 100).toFixed(2)}%`;
    const bar = barHTML({ segments: segs, rated: k.cap, trigger: k.trigger < 1 ? k.trigger * k.cap : null, max, unit: k.unit, fmt: f, small: o.small,
      ratedLabel: `100% ${k.firm != null ? 'firm' : 'rated'}: ${f(k.cap)} ${k.unit || ''}`, triggerLabel: `${Math.round(k.trigger * 100)}% expansion trigger`,
      label: o.label || `Existing + built + committed ${pct(k.committed)} of ${k.firm != null ? 'firm' : 'rated'} capacity, ${pct(k.buildout)} at build-out` });
    // Bundle 5: the % on the bar (with approved, build-out; one label when they sit close) and the
    // 90% and 100% marks labelled under it.
    const near = Math.abs(k.buildout - k.committed) / max < 0.16;
    const vals = near ? `<span class="cb-v" style="left:${at(k.buildout)}">${pct(k.committed)} → ${pct(k.buildout)}</span>`
      : `<span class="cb-v" style="left:${at(k.committed)}">${pct(k.committed)}</span><span class="cb-v cb-bo" style="left:${at(k.buildout)}">${pct(k.buildout)}</span>`;
    const trig = k.trigger < 1 && k.trigger > 0 ? `<span class="cb-t" style="left:${at(k.trigger * k.cap)}">${Math.round(k.trigger * 100)}%</span>` : '';
    return `<div class="capbar${o.small ? ' sm' : ''}"><div class="cb-vals" aria-hidden="true">${vals}</div>${bar}<div class="cb-scale" aria-hidden="true">${trig}<span class="cb-t cb-100" style="left:${at(k.cap)}">100%</span></div></div>`;
  }
  // The capacity bars' legend on one line: short names (each segment's full name is on hover); the
  // 90% and 100% marks are labelled on the bar itself.
  function capLegendHTML() {
    return legendHTML([{ layer: 'existing', text: 'On the system' }, { layer: 'built', text: 'Built' }, { layer: 'committed', text: 'Committed' }, { layer: 'proposed', text: 'In review' }, 'over'], { cls: 'one-line' });
  }

  // ---- Scenario chip (SPEC §2): the basis is a set of layers ----------------------------------
  // Existing + Built always count; Committed alone = the D-5-1 capacity check; + Proposed = build-out;
  // + Anticipated = the stress test. Mapped onto the counting basis: committed | buildout | all
  // ('remaining', units not yet completed: Growth's left to build, is picked in the Scenario panel).
  const BASIS_LAYERS = { committed: ['committed'], buildout: ['committed', 'proposed'], all: ['committed', 'proposed', 'anticipated'], remaining: ['committed', 'proposed', 'anticipated'] };
  const ROLE = { committed: 'D-5-1 check', proposed: 'build-out', anticipated: 'stress test' };
  const layersOf = basis => ['existing', 'built', ...(BASIS_LAYERS[basis] || BASIS_LAYERS.all)];
  /** The basis after ticking / unticking a layer in the chip (Committed is always on). */
  function nextBasis(basis, layer) {
    const on = new Set(BASIS_LAYERS[basis] || BASIS_LAYERS.all);
    if (layer === 'proposed') return on.has('proposed') ? 'committed' : 'buildout';
    if (layer === 'anticipated') return on.has('anticipated') ? (basis === 'remaining' ? 'remaining' : 'buildout') : 'all';
    if (layer === 'committed') return 'committed';
    return basis;
  }
  // The count setting (Stage 1 #6), one label everywhere: the Scenario control's switch and the chip.
  const COUNT_OPTS = [['committed', 'approved only'], ['buildout', '+ in review'], ['all', '+ pre-application']];
  const countLabel = basis => (basis === 'remaining' ? '+ pre-application, left to build' : (COUNT_OPTS.find(([v]) => v === basis) || COUNT_OPTS[2])[1]);
  // Bundle 5: the scenario as a list of its settings, each with its default, so the chip can say
  // "Default" or "2 changes" and the Scenario control can list them in full.
  // o: { basis, flows ('2025 metered' | 'design'), md ('design' | 'observed'), div ('off' | 'on' | null
  // when there is no diversion), outside ('nearest' | 'left out'), year (null = build-out), criteria
  // (n edited), count ('tree count' | 'previous count'), expansions ('on' | 'off' | null), yearDefault,
  // loads (the stages the map's loads count, from the Stage filter: 'every stage' or a list) }.
  function scenarioSettings(o) {
    const b = o.basis || 'all', cur = b === 'remaining' ? 'all' : b;
    const crit = typeof o.criteria === 'number' ? o.criteria : /^\d+/.test(String(o.criteria || '')) ? parseInt(o.criteria, 10) : 0;
    const row = (key, label, value, dflt) => ({ key, label, value, dflt, def: value === dflt });
    return [
      row('count', 'Count', countLabel(cur), countLabel('all')),
      row('units', 'Units', b === 'remaining' ? 'left to build' : 'all', 'all'),
      // (the map's results year starts at this year: yearDefault)
      row('year', 'Map results for', o.year == null ? 'build-out' : String(o.year), o.yearDefault == null ? 'build-out' : String(o.yearDefault)),
      row('flows', 'Wastewater flows', o.flows || '2025 metered', '2025 metered'),
      row('md', 'Water maximum day', o.md === 'observed' ? '2025 observed factor' : 'design factor', 'design factor'),
      o.div == null ? null : row('div', 'Diversion', o.div === 'on' ? 'on' : 'off', 'off'),
      row('outside', 'Outside mapped areas', o.outside || 'nearest', 'nearest'),
      row('criteria', 'Design criteria', crit ? `${crit} edited` : 'Peel v2.0', 'Peel v2.0'),
      row('countMode', 'Units per development', o.count === 'previous count' ? 'previous count' : 'tree count', 'tree count'),
      o.expansions == null ? null : row('exp', 'Plant expansions', o.expansions, 'on'),
      // Bundle 6: the map's sewer and station loads follow the Stage filter; said here, never silently.
      o.loads == null ? null : row('loads', 'Map loads from', o.loads, 'every stage'),
    ].filter(Boolean);
  }
  const scenarioChanges = rows => rows.filter(r => !r.def).length;
  // The chip's word: "Default" or "n change(s)".
  const scenarioChipText = rows => { const n = scenarioChanges(rows); return n ? `${n} change${n === 1 ? '' : 's'}` : 'Default'; };
  const scenarioLine = rows => rows.map(r => `${r.label}: ${r.value}`).join(' · ');
  // The Scenario control's list: every setting, its value, and the default beside a changed one.
  const scenarioListHTML = rows => `<ul class="scen-list" aria-label="This scenario">${rows.map(r => `<li${r.def ? '' : ' class="chg"'}><span class="muted">${esc(r.label)}</span> <b>${esc(r.value)}</b>${r.def ? ' <span class="muted small">default</span>' : ` <span class="small scen-chg">changed · default ${esc(r.dflt)}</span>`}</li>`).join('')}</ul>`;
  /** o: as scenarioSettings → the chip: read-only, "Scenario Default ▾" or "Scenario 2 changes ▾";
   *  the full settings on hover and in the Scenario control. */
  function scenarioChipHTML(o) {
    const on = new Set(layersOf(o.basis));
    const what = on.has('anticipated') ? 'stress test' : on.has('proposed') ? 'build-out' : 'D-5-1 check';
    const rows = scenarioSettings(o);
    return `<button type="button" class="sc-more" data-scen-open="1" aria-haspopup="dialog" title="Scenario (${esc(what)}): ${esc(scenarioLine(rows))} — open the Scenario control to see or change it"><span class="sc-what">Scenario</span> <span class="tb-scen-t">${esc(scenarioChipText(rows))}</span> ▾</button>`;
  }

  const api = { COUNT_OPTS, countLabel, LABEL, SHORT, barHTML, capacityBarHTML, capLegendHTML, legendHTML, badgeHTML, siteBadgeHTML, stageText, nameHTML, BASIS_LAYERS, layersOf, nextBasis, scenarioSettings, scenarioChanges, scenarioChipText, scenarioLine, scenarioListHTML, scenarioChipHTML };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelLayerBar = api;
})(typeof window !== 'undefined' ? window : globalThis);
