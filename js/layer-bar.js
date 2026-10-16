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

  const MARK = { trigger: ['ly-tick-sw', '90% trigger'], rated: ['ly-rated-sw', '100% rated'], over: ['ly-over-sw', 'beyond rated'], est: ['ly-est-sw', 'estimated'] };
  function legendHTML(items, o = {}) {
    const fmt = o.fmt || num;
    return `<div class="ly-legend">${items.map(it => {
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
    return barHTML({ segments: segs, rated: k.cap, trigger: k.trigger < 1 ? k.trigger * k.cap : null, max: Math.max(k.cap * 1.3, k.buildout), unit: k.unit, fmt: f, small: o.small,
      ratedLabel: `100% ${k.firm != null ? 'firm' : 'rated'}: ${f(k.cap)} ${k.unit || ''}`, triggerLabel: `${Math.round(k.trigger * 100)}% expansion trigger`,
      label: o.label || `Existing + built + committed ${pct(k.committed)} of ${k.firm != null ? 'firm' : 'rated'} capacity, ${pct(k.buildout)} at build-out` });
  }

  // ---- Scenario chip (SPEC §2): the basis is a set of layers ----------------------------------
  // Existing + Built always count; Committed alone = the D-5-1 capacity check; + Proposed = build-out;
  // + Anticipated = the stress test. Mapped onto the counting basis: committed | buildout | all
  // ('remaining', units left to permit, is picked in the Scenario panel).
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
  /** o: { basis, flows, criteria, count, expansions, outside } → the chip: read-only text, the count
   *  setting first; the Committed / Proposed / Anticipated switch lives in the Scenario control. */
  function scenarioChipHTML(o) {
    const on = new Set(layersOf(o.basis));
    const what = on.has('anticipated') ? 'stress test' : on.has('proposed') ? 'build-out' : 'D-5-1 check';
    const set = [`Count: ${countLabel(o.basis)}`, `Flows: ${o.flows}`, `Criteria: ${o.criteria}`, `Unit counting: ${o.count}`, o.expansions ? `Expansions: ${o.expansions}` : null, `Outside zones: ${o.outside}`].filter(Boolean).join(' · ');
    return `<button type="button" class="sc-more" data-scen-open="1" aria-haspopup="dialog" title="Scenario (${esc(what)}): ${esc(set)} — open the Scenario control to change it"><span class="sc-what">Scenario</span> <span class="tb-scen-t">${esc(set)}</span> ▾</button>`;
  }

  const api = { COUNT_OPTS, countLabel, LABEL, SHORT, barHTML, capacityBarHTML, legendHTML, badgeHTML, siteBadgeHTML, stageText, nameHTML, BASIS_LAYERS, layersOf, nextBasis, scenarioChipHTML };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelLayerBar = api;
})(typeof window !== 'undefined' ? window : globalThis);
