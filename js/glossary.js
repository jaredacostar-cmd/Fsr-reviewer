/* The glossary (PeelGlossary): the engineering and planning terms the panels use, each with a plain
 * definition. mark(html) underlines the first use of each term in a panel's answer and figures (and a
 * page's answer); a hover, focus or tap shows the definition, and "All terms" opens the Glossary page
 * (Home › Reference). Bundle 5 (plain language).
 *
 * Pure: TERMS, mark() and page() run in Node (tests/plain-language.test.js); the pop-up is browser only.
 */
(function (root) {
  'use strict';

  // [key, the term as the glossary names it, the patterns that use it, the definition, group]
  const TERMS = [
    ['firm', 'Firm capacity', /\bfirm(?: capacity)?\b/i, 'What a pumping station can pump with its largest pump out of service (on standby). Pumping stations are compared on firm capacity.', 'Capacity'],
    ['rated', 'Rated capacity', /\brated capacity\b|\b100% rated\b/i, 'The flow a treatment plant is approved and built to treat. Plants are compared on rated capacity.', 'Capacity'],
    ['trigger', '90% trigger', /\b90% (?:expansion )?trigger\b/i, 'The 2020 Master Plan starts a plant’s next expansion when its flow reaches 90% of rated capacity.', 'Capacity'],
    ['reserve', 'Uncommitted reserve', /\b(?:uncommitted )?reserve\b/i, 'Capacity left once existing, built and committed flows are counted (MECP Procedure D-5-1): what is still free for new approvals.', 'Capacity'],
    ['buildout', 'Build-out', /\bbuild-out\b/i, 'When every development counted here is built.', 'Capacity'],
    ['peakwet', 'Peak wet-weather flow', /\bpeak wet(?:[- ]weather)?(?: flow)?\b/i, 'The highest sewage flow expected during a storm: peak sewage plus the rain and groundwater that get into the sewers. Pipes and pumping stations are sized for it.', 'Flows'],
    ['adwf', 'Average dry-weather flow', /\bADWF\b|\baverage dry(?:[- ]weather)?(?: flow)?\b/i, 'Sewage flow on an average day without rain (Peel design criteria).', 'Flows'],
    ['annual', 'Annual average flow', /\bannual average flow\b/i, 'A plant’s average daily flow over a year, rain included. Plants are compared on it.', 'Flows'],
    ['maxday', 'Maximum day', /\bmax(?:imum)? day\b/i, 'Water use on the year’s highest day. Water treatment and supply are sized for it.', 'Flows'],
    ['ii', 'I&I (inflow and infiltration)', /\bI&amp;I\b|\binflow and infiltration\b/, 'Rain and groundwater that get into sanitary sewers. Peel’s design standard adds a fixed rate per hectare of site.', 'Flows'],
    ['calib', 'Calibration factor', /\bcalibrat(?:ed|ion)\b/i, 'Each plant’s measured 2025 flow divided by the model’s flow for today. Scaling by it covers what the model does not hold: existing jobs, rain and other flows.', 'Flows'],
    ['wrrf', 'WRRF / WWTP', /\bWRRF\b|\bWWTP\b/, 'Water resource recovery facility or wastewater treatment plant: where sewage is treated.', 'System'],
    ['zone', 'Pressure zone', /\bpressure zones?\b/i, 'An area of the water system held in one pressure range, fed by its own reservoirs and pumping stations.', 'System'],
    ['block', 'Wastewater block', /\bwastewater blocks?\b/i, 'An area that drains to one trunk sewer; the blocks are traced downstream to a plant.', 'System'],
    ['run', 'Sewer run', /\bsewer runs?\b/i, 'One sewer main between two junctions; a run can be several pipe segments.', 'System'],
    ['committed', 'Committed', /\bcommitted\b/i, 'Approved development that holds capacity: draft-approved or registered plans of subdivision and site plan approvals, through permit and construction (MECP Procedure D-5-1).', 'Planning'],
    ['d51', 'MECP Procedure D-5-1', /\b(?:MECP )?(?:Procedure )?D-5-1\b/, 'Ontario’s guide for checking that sewage and water capacity exists for development. It counts registered and draft-approved subdivisions and site plan approvals as committed.', 'Planning'],
    ['opa', 'OPA', /\bOPA\b|\bofficial plan amendment\b/i, 'Official plan amendment: changes the municipality’s land-use plan for the site.', 'Planning'],
    ['zba', 'ZBA', /\bZBA\b|\bzoning by-law amendment\b/i, 'Zoning by-law amendment: changes what the zoning allows on the site.', 'Planning'],
    ['dc', 'DC (development charges)', /\bDC\b/, 'Fees on new development that pay for growth-related works. A DC project is on the Region’s DC capital program.', 'Capital'],
    ['ea', 'EA (environmental assessment)', /\bEAs?\b/, 'The study a major work goes through, with public comment, before it is designed and built.', 'Capital'],
    ['mtsa', 'MTSA', /\bMTSAs?\b/, 'Major transit station area: land around a transit station planned for more homes and jobs.', 'Planning'],
    ['screen', 'Screening estimate', /\bscreening estimate\b/i, 'A first check from public data, not a hydraulic model or a Region decision. Peel’s W&WW Infrastructure Planning team confirms every result.', 'Planning'],
  ];
  const BY_KEY = Object.fromEntries(TERMS.map(t => [t[0], t]));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // Inside these the text is left alone (a control's label, a link, an existing term).
  const MAX = 3;
  const SKIP = /^(a|button|select|option|textarea|summary|svg|script|style|code|kbd)$/i;

  /** Underlines the first use of each term in html (text only, never inside a tag, link or button).
   *  seen (a Set) carries across calls, so a term is marked once per panel. */
  function mark(html, seen) {
    const done = seen || new Set();
    let skip = 0;
    return String(html == null ? '' : html).split(/(<[^>]*>)/).map(part => {
      if (part.startsWith('<')) {
        const m = /^<\s*(\/)?\s*([a-z0-9]+)/i.exec(part); if (!m) return part;
        const isGl = /class="[^"]*\bgl\b/.test(part);
        if (SKIP.test(m[2]) || (m[2].toLowerCase() === 'span' && isGl)) { if (m[1]) skip = Math.max(0, skip - 1); else if (!/\/>$/.test(part)) skip++; }
        return part;
      }
      if (skip || !part.trim()) return part;
      let out = part;
      for (const [key, , re] of TERMS) {
        // (three underlined terms at most per panel: more reads as noise)
        if (done.has(key) || done.size >= MAX) continue;
        // Only in the text between the marks already made.
        const bits = out.split(/(<span class="gl"[^>]*>[^<]*<\/span>)/);
        let hit = false;
        for (let i = 0; i < bits.length && !hit; i += 2) {
          const mm = re.exec(bits[i]); if (!mm) continue;
          bits[i] = `${bits[i].slice(0, mm.index)}<span class="gl" data-gl="${key}" tabindex="0">${mm[0]}</span>${bits[i].slice(mm.index + mm[0].length)}`;
          hit = true;
        }
        if (hit) { done.add(key); out = bits.join(''); }
      }
      return out;
    }).join('');
  }

  // The Glossary page (js/ws-pages.js pageHTML), in Home's layout.
  function page() {
    const groups = [...new Set(TERMS.map(t => t[4]))];
    const mid = `<section class="gl-page" data-psec="glossary">${groups.map(g => `<h3 class="ws-h">${esc(g)}</h3><dl class="gl-list">${TERMS.filter(t => t[4] === g).map(([k, name, , def]) => `<div id="gl-${k}"><dt>${esc(name)}</dt><dd>${esc(def)}</dd></div>`).join('')}</dl>`).join('')}</section>`;
    return {
      id: 'glossary', eyebrow: 'Reference', name: 'What do the terms mean?',
      answer: 'The words the panels use for capacity, flows, the system and planning, in plain language. In a panel, a <span class="gl-eg">dotted underline</span> marks a term: point at it or tap it for its meaning.',
      mid, actions: [{ label: 'Full map', attrs: { 'data-ws-full': '' }, primary: true }],
    };
  }

  // ---- Browser: the pop-up ---------------------------------------------------------------------
  if (typeof document !== 'undefined' && document.addEventListener) {
    let pop = null, at = null;
    const hide = () => { if (pop) pop.hidden = true; at = null; };
    const show = el => {
      const t = BY_KEY[el.dataset.gl]; if (!t) return;
      if (!pop) { pop = document.createElement('div'); pop.className = 'gl-pop'; pop.setAttribute('role', 'tooltip'); pop.id = 'gl-pop'; document.body.appendChild(pop); }
      pop.innerHTML = `<b>${esc(t[1])}</b> ${esc(t[3])} <button type="button" class="btn small link" data-ws-page="glossary">All terms →</button>`;
      pop.hidden = false; at = el; el.setAttribute('aria-describedby', 'gl-pop');
      const r = el.getBoundingClientRect(), w = Math.min(300, innerWidth - 24);
      pop.style.width = `${w}px`;
      pop.style.left = `${Math.max(12, Math.min(innerWidth - w - 12, r.left))}px`;
      const below = r.bottom + 6, h = pop.offsetHeight;
      pop.style.top = `${below + h > innerHeight - 8 ? Math.max(8, r.top - h - 6) : below}px`;
    };
    document.addEventListener('mouseover', e => { const g = e.target.closest && e.target.closest('.gl'); if (g && g !== at) show(g); else if (!g && at && !(pop && pop.contains(e.target))) hide(); });
    document.addEventListener('focusin', e => { const g = e.target.closest && e.target.closest('.gl'); if (g) show(g); });
    document.addEventListener('click', e => { const g = e.target.closest && e.target.closest('.gl'); if (g) { e.stopPropagation(); if (g === at) hide(); else show(g); return; } if (pop && !pop.contains(e.target)) hide(); if (e.target.closest && e.target.closest('#gl-pop [data-ws-page]')) hide(); }, true);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') { if (at) e.preventDefault(); hide(); } });
    addEventListener('scroll', hide, true);
  }

  const api = { TERMS, BY_KEY, MAX, mark, page };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelGlossary = api;
})(typeof window !== 'undefined' ? window : globalThis);
