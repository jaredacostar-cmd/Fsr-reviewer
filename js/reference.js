/* How it works (PeelReference): the reference guides, pages in Home's layout (js/ws-pages.js) opened
 * from Home's sidebar (Reference › How it works), the Help page and the panels they explain. Each guide
 * answers one question about how servicing for growth works in Peel, and how the app reads it:
 * who decides what, how approvals work (js/approvals-guide.js), homes to flows (a worked example),
 * how sewage and water travel, how capacity is checked, what an FSR should cover, how a capital
 * project gets built, and the growth targets and forecasts.
 *
 * Pure: the builders take their data as arguments (the app's report figures, housing targets,
 * capacity rows, a development's estimate), so they run in Node (tests/reference.test.js); page(id)
 * reads the loaded app state in the browser. Screening only: nothing here is a Region decision.
 */
(function (root) {
  'use strict';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = v => (v == null || !isFinite(v) ? '–' : Math.round(v).toLocaleString('en-CA'));
  const one = v => (v == null || !isFinite(v) ? '–' : (Math.round(v * 10) / 10).toLocaleString('en-CA', { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
  const two = v => (v == null || !isFinite(v) ? '–' : v.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  const pct = (a, b) => (b > 0 ? Math.round(a / b * 100) : null);
  const kRound = v => (v >= 10000 ? Math.round(v / 1000) * 1000 : v >= 1000 ? Math.round(v / 100) * 100 : Math.round(v));

  // The guides, in reading order: [id, label (the sidebar and the index), the question (the page's
  // title), one line]. How approvals work is built by js/approvals-guide.js.
  const GUIDES = [
    ['roles', 'Who decides what', 'Who decides what?', 'The Province, the Tribunal, the Region, the cities and the conservation authorities'],
    ['approvals', 'How approvals work', 'How does a development get approved?', 'Ontario’s steps against the app’s stages'],
    ['flows', 'From homes to flows', 'How do homes become water and sewage flows?', 'A worked example: 0 Heritage Rd, Brampton'],
    ['network', 'How sewage and water travel', 'How do sewage and water travel?', 'Plants, trunk sewers, pressure zones and wells'],
    ['capacity', 'How capacity is checked', 'How does the app check capacity?', 'What is compared at each facility, and its limit'],
    ['fsrguide', 'What an FSR should cover', 'What should a functional servicing report cover?', 'The Region’s requirements, and what the app can check'],
    ['capital', 'How a capital project gets built', 'How does a capital project get built?', 'Master Plan, DC study, Class EA, design, tender, construction'],
    ['targets', 'Growth targets and forecasts', 'How much growth is planned, and by when?', 'Housing targets, the 2051 forecast and the pipeline'],
    ['forecast', 'How the forecast is timed', 'When will the pipeline be built?', 'Time in stage, the population pace and the completions record'],
  ];
  const IDS = GUIDES.map(g => g[0]);
  const G = id => GUIDES.find(g => g[0] === id);
  const INDEX = { id: 'guides', label: 'How it works', what: 'Nine guides: approvals, flows, capacity, capital, the forecast…' };
  const NOTE_TAIL = 'A general guide for screening: confirm the current rules and figures with the Region of Peel.';

  // ---- Shared pieces ------------------------------------------------------------------------------
  const eyebrowOf = id => `Reference · <button type="button" class="btn small link" data-ws-page="guides">How it works</button> · ${IDS.indexOf(id) + 1} of ${IDS.length}`;
  /** Previous / All guides / Next, under each guide. */
  function navHTML(id) {
    const i = IDS.indexOf(id), prev = GUIDES[i - 1], next = GUIDES[i + 1];
    const b = (g, dir) => (g ? `<button type="button" class="rf-nav-b rf-${dir}" data-ws-page="${g[0]}"><small>${dir === 'prev' ? '← Previous' : 'Next →'}</small><strong>${esc(g[1])}</strong></button>` : '<span></span>');
    return `<nav class="rf-nav" aria-label="Guides" data-psec="guides">${b(prev, 'prev')}<button type="button" class="btn small link" data-ws-page="guides">All guides</button>${b(next, 'next')}</nav>`;
  }
  /** A guide's page model: the eyebrow, the question as its title, the guide nav after the body. */
  function wrap(id, m) {
    const g = G(id);
    return { ...m, id, eyebrow: eyebrowOf(id), name: m.name || g[2], mid: `${m.mid || ''}${navHTML(id)}`,
      actions: [...(m.actions || []), { label: 'All guides', attrs: { 'data-ws-page': 'guides' } }] };
  }
  // A flow of steps: boxes with arrows between them (a list on a phone).
  const flowHTML = (steps, label) => `<ol class="rf-flow" aria-label="${esc(label)}">${steps.map(([t, s, tone]) => `<li class="rf-box${tone ? ` rf-${tone}` : ''}"><strong>${esc(t)}</strong>${s ? `<small>${s}</small>` : ''}</li>`).join('')}</ol>`;
  const tableHTML = (cols, rows, label) => `<div class="rf-tw"><table class="rf-tab" aria-label="${esc(label)}"><thead><tr>${cols.map(c => `<th scope="col">${esc(c)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map((c, i) => (i ? `<td>${c}</td>` : `<th scope="row">${c}</th>`)).join('')}</tr>`).join('')}</tbody></table></div>`;
  const sec = (key, title, body) => `<section class="rf" data-psec="${key}">${title ? `<h3 class="ws-h">${esc(title)}</h3>` : ''}${body}</section>`;
  const go = (id, label) => `<button type="button" class="btn small link" data-ws-page="${id}">${esc(label)} →</button>`;

  // ---- The index: How it works ---------------------------------------------------------------------
  function indexPage() {
    const cards = GUIDES.map(([id, label, q, line], i) => `<li><button type="button" class="rf-card" data-ws-page="${id}"><span class="rf-n">${i + 1}</span><strong>${esc(label)}</strong><span>${esc(q)}</span><small>${esc(line)}</small></button></li>`).join('');
    return { id: 'guides', eyebrow: 'Reference', name: 'How does servicing for growth work in Peel?',
      answer: 'Eight short guides: who decides, how a development is approved, how its homes become water and sewage flows, where those flows go, how capacity is checked, what a <strong>functional servicing report</strong> covers, how the Region builds the works, and how much growth is planned. Each one says how the app reads it, and where it simplifies.',
      mid: sec('guides', '', `<ol class="rf-index">${cards}</ol>`) + sec('more', 'More reference', `<p>${go('glossary', 'Glossary: the terms in plain words')} ${go('help', 'Help: how to use the app')}</p>`),
      actions: [{ label: `Start: ${GUIDES[0][1]}`, attrs: { 'data-ws-page': GUIDES[0][0] }, primary: true }, { label: 'Full map', attrs: { 'data-ws-full': '' } }] };
  }

  // ---- 1 · Who decides what ------------------------------------------------------------------------
  // [who, what they decide, where it shows in the app]
  const ROLES = [
    ['Province of Ontario', 'Sets the planning rules (the Planning Act and the Provincial Planning Statement, 2024) and each city’s housing target to 2031 (Municipal Affairs and Housing). Approves sewage and water works and sets how their capacity is checked (Environment, Conservation and Parks: Environmental Compliance Approvals, Procedure D-5-1, the Class EA). Publishes population projections (Finance).', 'The committed rule (D-5-1), the housing targets and the Ministry of Finance projection on Growth targets and forecasts.'],
    ['Ontario Land Tribunal', 'Hears appeals of official plans, zoning by-laws, plans of subdivision and other planning decisions; its decision stands in for council’s.', 'An appeal shows as a flag on the site.'],
    ['Region of Peel', 'Plans, builds and runs the water and wastewater systems; allocates servicing capacity; reviews functional servicing reports; sets and collects regional development charges; runs the Master Plan and the Class EAs for its works. Since July 1, 2024 it makes no planning approvals.', 'What this app screens, for the Region’s W&WW Infrastructure Planning team to validate.'],
    ['Brampton, Mississauga and Caledon', 'Official plans, zoning, plans of subdivision and condominium, site plans, the Committee of Adjustment and building permits.', 'Their open records are the developments and stages in the app.'],
    ['Conservation authorities', 'Credit Valley (CVC), Toronto and Region (TRCA) and Nottawasaga Valley (NVCA) regulate building near rivers, valleys, wetlands and floodplains (permits under the Conservation Authorities Act) and comment on natural hazards.', 'The constraints layers (regulated areas, floodplains).'],
    ['The applicant', 'The owner or developer files the applications and their consultants prepare the studies, including the functional servicing report; the owner pays the development charges.', 'Review an FSR compares a report’s figures with the app’s.'],
    ['Neighbours on the system', 'York Region and the City of Toronto send sewage into Peel’s system; some of Malton drains to Toronto’s; Peel’s lake plants also supply water to York Region and Halton.', 'The external inflows in the plant figures.'],
  ];
  function roles() {
    return wrap('roles', {
      answer: 'The <strong>local municipalities</strong> approve developments. The <strong>Region of Peel</strong> services them: it plans and builds water and wastewater, allocates capacity and reviews the servicing reports, but since <strong>July 1, 2024</strong> makes no planning approvals. The <strong>Province</strong> sets the rules and approves the works; the <strong>Ontario Land Tribunal</strong> hears appeals.',
      mid: sec('roles', 'Who decides what', tableHTML(['Who', 'What they decide', 'In the app'], ROLES.map(([w, d, a]) => [esc(w), esc(d), `<span class="muted">${esc(a)}</span>`]), 'Who decides what'))
        + sec('chain', 'A development, from the Region’s side', flowHTML([
          ['Pre-consultation', 'the municipality, with Region comments'],
          ['Application filed', 'with a functional servicing report'],
          ['Region review', 'servicing comments and conditions'],
          ['Approval', 'by the municipality (or the Tribunal on appeal)'],
          ['Allocation and DCs', 'the Region’s servicing capacity; charges at permit'],
          ['Connection', 'built to the Region’s standards'],
        ], 'A development, from the Region’s side')),
      method: `How the roles are read here: the Planning Act and Bill 185 (the Region of Peel has had no planning approvals since July 1, 2024), MECP Procedure D-5-1 and the Municipal Class EA. ${NOTE_TAIL}`,
      sources: 'Planning Act; Provincial Planning Statement, 2024; Conservation Authorities Act (Ontario Regulation 41/24); MECP Procedure D-5-1; Region of Peel, 2025 wastewater collection system report (external flows).',
      actions: [{ label: 'Next: How approvals work', attrs: { 'data-ws-page': 'approvals' }, primary: true }],
    });
  }

  // ---- 2 · How approvals work (js/approvals-guide.js) ----------------------------------------------
  function approvals() {
    const AG = root.PeelApprovalsGuide, m = AG && AG.page ? AG.page() : { answer: 'Loading…' };
    return wrap('approvals', m);
  }

  // ---- 3 · From homes to flows: a worked example ---------------------------------------------------
  // The example's fallback when the development is not loaded: 0 Heritage Rd, Brampton (OPA, zoning and
  // subdivision; 5,146 apartments planned on an 8.14 ha application site).
  const EXAMPLE = { title: '0 HERITAGE RD', muni: 'Brampton', units: { single: 0, town: 0, apartment: 5146, unknown: 0 }, ha: 8.142, plant: 'Lakeview' };
  /** The steps, from an estimate (js/demand.js estimate([p], crit)) of one development.
   *  x: { title, muni, e, crit, ha, plant: { name, rated } | null, zone: name | null, apt: 'high' | 'large' }. */
  function flowSteps(x) {
    const { e, crit } = x, ppu = crit.ppu, w = crit.water, ww = crit.wastewater;
    const T = [['single', 'singles and semis'], ['town', 'townhouses'], ['apartment', 'apartments'], ['unknown', 'homes of no stated type']];
    const lines = T.filter(([k]) => e.units[k] > 0).map(([k, t]) => {
      const rate = e.units[k] > 0 ? e.pop[k] / e.units[k] : 0;
      return `${num(e.units[k])} ${t} × ${two(rate)} people = <b>${num(e.pop[k])}</b>`;
    });
    const steps = [];
    steps.push(['Homes', `${num(e.totalUnits)} homes planned${lines.length > 1 ? ', by type' : ''}`, lines.join('<br>') || '–', 'The units on the development’s files, counted once (Records › Files).']);
    // The apartments' rate: the large-apartment rate, or the high-density rate on a dense site.
    let aptNote = '';
    if (e.units.apartment > 0) {
      const dens = x.ha > 0 ? e.units.apartment * ppu.apartment / x.ha : null, high = Math.abs(e.pop.apartment / e.units.apartment - ppu.apartmentHigh) < 0.01;
      aptNote = high ? (dens != null ? `At ${two(ppu.apartment)} people per apartment the site would hold ${num(dens)} people per hectare, above ${num(475)}: Peel’s standard then uses ${two(ppu.apartmentHigh)}.` : `The site area is not known: the high-density rate (${two(ppu.apartmentHigh)}) is used.`) : `Apartments at the large-apartment rate (${two(ppu.apartment)}); above 475 people per hectare Peel uses ${two(ppu.apartmentHigh)}.`;
    }
    steps.push(['People', 'homes × persons per unit', `<b>${num(e.population)}</b> people`, `Persons per unit from Peel’s Linear Wastewater Standards: ${two(ppu.single)} single or semi, ${two(ppu.town)} townhouse, ${two(ppu.apartment)} apartment. ${aptNote}`]);
    steps.push(['Water: average day', `${num(e.population)} × ${num(w.avg)} L per person per day ÷ 86,400 s`, `<b>${one(e.water.avg)}</b> L/s`, 'Peel’s Modelling Demand Table.']);
    steps.push(['Water: maximum day and peak hour', `average × ${one(w.maxDay)} and × ${one(w.peakHour)}`, `<b>${one(e.water.maxDay)}</b> and <b>${one(e.water.peakHour)}</b> L/s`, 'Treatment and storage are sized for the maximum day; local watermains for the peak hour (or the maximum day plus fire flow).']);
    steps.push(['Sewage: average dry weather', `${num(e.population)} × ${num(ww.avg)} L per person per day ÷ 86,400 s`, `<b>${one(e.wastewater.avg)}</b> L/s`, 'Peel’s Linear Wastewater Standards. A plant is compared on its annual average flow.']);
    steps.push(['Sewage: peak dry weather', `average × Harmon peaking factor: 1 + 14 ÷ (4 + √(${num(e.population)} ÷ 1,000)) = ${two(e.wastewater.peakingFactor)}`, `<b>${one(e.wastewater.peak)}</b> L/s`, `The factor falls as the population grows: many homes do not peak together. Peel limits it to ${one(ww.peakMin)}–${one(ww.peakMax)}.`]);
    steps.push(['Sewage: peak wet weather', `peak dry + I&amp;I: ${two(ww.infiltration)} L/s per hectare × ${two(x.ha)} ha = ${one(e.wastewater.infiltration)} L/s`, `<b>${one(e.wastewater.wetPeak)}</b> L/s`, 'Rain and groundwater that get into the sewers. Sewers and pumping stations are sized for this flow.']);
    const mld = e.wastewater.avg * 0.0864;
    if (x.plant && x.plant.rated > 0) steps.push(['Its share of the plant', `${one(e.wastewater.avg)} L/s × 0.0864 = ${two(mld)} ML/d, against ${esc(x.plant.name)}’s rated ${num(x.plant.rated)} ML/d`, `<b>${two(mld / x.plant.rated * 100)}%</b> of rated`, `The plant check adds this to everything else on the plant (Servicing capacity).${x.zone ? ` Water: ${esc(x.zone)}.` : ''}`]);
    return steps;
  }
  function flowsHTML(x) {
    const steps = flowSteps(x);
    return `<ol class="rf-calc" aria-label="From homes to flows, step by step">${steps.map(([t, how, res, note], i) => `<li><span class="rf-n">${i + 1}</span><div><strong>${esc(t)}</strong><span class="rf-how">${how}</span>${note ? `<small>${note}</small>` : ''}</div><div class="rf-res">${res}</div></li>`).join('')}</ol>`;
  }
  function flows(x) {
    if (!x || !x.e) return wrap('flows', { answer: 'Loading the example…' });
    const e = x.e;
    return wrap('flows', {
      answer: `Homes become people at Peel’s persons per unit; people become flows at Peel’s daily rates per person, then peaked. For <strong>${esc(x.title)}</strong>, ${esc(x.muni)}: <strong>${num(e.totalUnits)}</strong> homes → <strong>${num(e.population)}</strong> people → <strong>${one(e.water.maxDay)} L/s</strong> of water on the maximum day and <strong>${one(e.wastewater.wetPeak)} L/s</strong> of sewage at peak wet weather.`,
      figures: [
        { v: num(e.population), u: 'people', label: 'at Peel persons per unit', ctx: `${num(e.totalUnits)} homes` },
        { v: one(e.water.maxDay), u: 'L/s', label: 'water, maximum day', ctx: `average ${one(e.water.avg)} L/s` },
        { v: one(e.wastewater.peak), u: 'L/s', label: 'sewage, peak dry weather', ctx: `average ${one(e.wastewater.avg)} L/s × ${two(e.wastewater.peakingFactor)}` },
        { v: one(e.wastewater.wetPeak), u: 'L/s', label: 'sewage, peak wet weather', ctx: `with I&amp;I on ${two(x.ha)} ha` },
      ],
      mid: sec('calc', `${x.title}, step by step`, flowsHTML(x))
        + sec('more', 'What else goes in', `<ul class="rf-ul">
          <li><strong>Jobs.</strong> Floor area for work becomes jobs (about 25 m² per office job, 45 retail, 110 industrial); each job adds ${num(x.crit.employment.water)} L of water and ${num(x.crit.employment.wastewater)} L of sewage a day, peaked on its own and added.</li>
          <li><strong>Many developments together.</strong> Area and plant figures peak the combined population, which is lower than adding each site’s peak.</li>
          <li><strong>The capacity check.</strong> The plant comparison is scaled to each plant’s measured 2025 flow (the calibration factor); a development’s own flows stay at design criteria.</li>
          <li><strong>Fire flow</strong> (Fire Underwriters Survey) and <strong>pressures</strong> are not worked out here: the Region’s model and the consultant’s report cover them.</li>
        </ul>`),
      method: `The app’s development estimate (Servicing at a site, and Review an FSR), at the Scenario’s criteria (Peel’s by default): Linear Wastewater Standards (R1.0, March 2023) for persons per unit, sewage rates, Harmon peaking and I&amp;I; the Modelling Demand Table (v2.0, August 2024) for water rates and factors. ${x.live ? 'Worked live from the development’s current record.' : 'From the example’s figures (the development is not loaded).'} ${NOTE_TAIL}`,
      sources: 'Region of Peel, Linear Wastewater Standards (2022, R1.0 March 2023), Tables 2-1 and 2-2, s. 2.2–2.6; Region of Peel, Water and Wastewater Modelling Demand Table, Site Plan applications (v2.0, August 2024).',
      actions: [x.key ? { label: `Check ${x.title}`, attrs: { 'data-ws-pick': x.key, 'data-ws-as': 'site' }, primary: true } : { label: 'Check a site', attrs: { 'data-ws-page': 'site' }, primary: true }],
    });
  }

  // ---- 4 · How sewage and water travel -------------------------------------------------------------
  /** The network's figures from the app's report data (data/peel-reports.json). */
  function networkFacts(R) {
    const P = (R && R.wastewater && R.wastewater.plants) || {}, w = (R && R.water) || {};
    const plant = k => (P[k] ? { name: P[k].name, rated: P[k].ratedMLd, avg: P[k].avgMLd, pct: P[k].pctOfCapacity } : null);
    const inflow = id => ((R && R.wastewater && R.wastewater.inflows) || []).find(x => x.id === id) || null;
    return { booth: plant('Lakeview'), clarkson: plant('Clarkson'), inglewood: plant('Inglewood'), york: inflow('york'), toronto: inflow('toronto'), diversion: R && R.wastewater ? R.wastewater.diversion || null : null,
      wtp: ((w.southPeel && w.southPeel.plants) || []).map(p => ({ name: p.name, rated: p.ratedMLd, avg: p.avgMLd, maxDay: p.maxDayMLd })), served: w.southPeel ? w.southPeel.populationServed : null,
      wells: (w.caledon || []).map(c => ({ name: c.name, communities: c.communities, people: c.population })) };
  }
  function network(R) {
    const f = networkFacts(R), b = f.booth, c = f.clarkson;
    const pl = (p, extra) => (p ? `Rated ${num(p.rated)} ML/d; 2025 average ${one(p.avg)} ML/d (${p.pct}%)${extra || ''}` : 'figures loading');
    const ww = flowHTML([
      ['Home or building', 'a service connection'],
      ['Local sewer', 'under the street'],
      ['Trunk sewer', 'carries a wastewater block downhill'],
      ['Pumping station', 'where gravity cannot reach (a forcemain lifts it)'],
      ['Treatment plant', 'G.E. Booth or Clarkson'],
      ['Lake Ontario', 'treated effluent'],
    ], 'Sewage, from a home to the lake');
    const wa = flowHTML([
      ['Lake Ontario', 'intakes off Mississauga'],
      ['Water treatment plant', 'A.P. Kennedy or Lorne Park'],
      ['Transmission main', 'large pipes north'],
      ['Pumping station', 'lifts the water a zone higher'],
      ['Reservoir or tank', 'storage for the zone'],
      ['Local watermain', 'to the home, at pressure'],
    ], 'Water, from the lake to a home');
    const wwRows = [
      [b ? esc(b.name) : 'G.E. Booth WRRF (Lakeview)', `The east trunk system: east Mississauga and east Brampton, and parts of Caledon including Bolton. ${pl(b)}. Also takes York Region’s flow${f.york ? ` (${one(f.york.mld)} ML/d)` : ''}.`],
      [c ? esc(c.name) : 'Clarkson WRRF', `The west trunk system: west Mississauga and west Brampton, and south Caledon. ${pl(c)}.`],
      [f.inglewood ? esc(f.inglewood.name) : 'Inglewood WWTP', `A small plant for the village of Inglewood (Caledon). ${f.inglewood ? `Rated ${two(f.inglewood.rated)} ML/d.` : ''}`],
      ['City of Toronto system', `Part of Malton drains to Toronto; Toronto also sends flow into Peel’s system${f.toronto ? ` (${one(f.toronto.mld)} ML/d)` : ''}.`],
    ];
    const waRows = [
      ...f.wtp.map(p => [esc(p.name), `South Peel’s lake-based system: rated ${num(p.rated)} ML/d; 2025 average ${num(p.avg)} ML/d, highest day ${num(p.maxDay)} ML/d.`]),
      ['Pressure zones', 'The lake-based system climbs north in pressure zones, numbered upward from the lake; each zone is fed by pumping stations from the zone below and held at pressure by its reservoirs and elevated tanks.'],
      ...f.wells.map(w => [esc(w.name), `Groundwater wells in Caledon: ${esc(w.communities)} (about ${num(w.people)} people).`]),
    ];
    return wrap('network', {
      answer: `Sewage flows <strong>downhill to the lake</strong>: local sewers join trunk sewers that take each <strong>wastewater block</strong> to <strong>G.E. Booth</strong> or <strong>Clarkson</strong>, with pumping stations where gravity cannot reach. Water travels <strong>uphill from the lake</strong>: <strong>A.P. Kennedy</strong> and <strong>Lorne Park</strong> treat it and pumping stations lift it north, zone by zone. Caledon’s villages are on wells.`,
      figures: [
        b ? { v: `${b.pct}%`, u: '', label: 'G.E. Booth, 2025 average', ctx: `${one(b.avg)} of ${num(b.rated)} ML/d rated` } : null,
        c ? { v: `${c.pct}%`, u: '', label: 'Clarkson, 2025 average', ctx: `${one(c.avg)} of ${num(c.rated)} ML/d rated` } : null,
        f.diversion ? { v: num(f.diversion.mld), u: 'ML/d', label: 'to move from G.E. Booth to Clarkson', ctx: `an east-to-west diversion, ${esc(f.diversion.when)}` } : null,
        f.served ? { v: num(kRound(f.served)), u: 'people', label: 'served with water', ctx: 'Peel-wide, 2025' } : null,
      ],
      mid: sec('ww', 'Sewage: from a home to the lake', ww + tableHTML(['Where it is treated', 'What drains there'], wwRows, 'Where sewage is treated'))
        + sec('water', 'Water: from the lake to a home', wa + tableHTML(['Where it comes from', 'What it serves'], waRows, 'Where water comes from'))
        + sec('app', 'How the app follows a site', `<ul class="rf-ul"><li><strong>Sewage:</strong> the site’s wastewater block is traced downstream, block to block, through its pumping stations to the plant (Servicing at a site, the path).</li><li><strong>Water:</strong> the site’s pressure zone, from the mapped zones, else the nearest zone or a planned main.</li><li><strong>Not traced:</strong> the local sewer and watermain pipe by pipe: left to the Region’s model.</li></ul>`),
      method: `Plant figures: the Region’s 2025 annual reports (rated capacity is the annual average daily flow). Service areas: the 2025 wastewater collection system report. ${NOTE_TAIL}`,
      sources: 'Region of Peel: G.E. Booth, Clarkson and Inglewood 2025 annual reports; 2025 wastewater collection system report; 2025 South Peel drinking water system report and Caledon water system summaries; 2020 Water and Wastewater Master Plan.',
      actions: [{ label: 'Servicing capacity', attrs: { 'data-ws-page': 'tight' }, primary: true }],
    });
  }

  // ---- 5 · How capacity is checked -----------------------------------------------------------------
  // [facility, the flow compared, against, its limit]
  const TESTS = [
    ['Wastewater treatment plant', 'Annual average flow', 'Rated capacity', 'The 90% expansion trigger (2020 Master Plan, Vol. 4, s. 2.3.1)'],
    ['Sewage pumping station', 'Peak wet-weather flow', 'Firm capacity (largest pump on standby)', '100% of firm (Vol. 4, s. 2.3.2)'],
    ['Water treatment', 'Maximum day', 'Rated capacity', '100% of rated'],
    ['Water storage', 'Storage required (fire, equalization, emergency)', 'Storage available in the zone', '100% (Vol. 3, Table 12)'],
    ['Pumping into a pressure zone', 'Maximum day', 'Firm pumping', '100% of firm'],
    ['Sewers and watermains', 'Peak flows, pipe by pipe', 'Pipe capacity', 'Not in the app: the Region’s model'],
  ];
  const LAYERS = [
    ['existing', 'On the system', 'what the 2021 census counted, scaled to the measured flow'],
    ['built', 'Built since 2021', 'occupancy since the census'],
    ['committed', 'Approved, not yet built', 'committed under D-5-1: draft-approved or registered subdivisions, site plan approvals, permits'],
    ['proposed', 'In review', 'and, when the Scenario includes it, Pre-application'],
  ];
  function capacityHTML(row) {
    const LB = root.PeelLayerBar;
    const bar = row && LB && LB.capacityBarHTML ? `<div class="rf-ex"><p class="small"><strong>${esc(row.name)}</strong>, ${esc(row.compared || '')}:</p>${LB.capacityBarHTML(row)}${LB.capLegendHTML ? LB.capLegendHTML() : ''}</div>` : '';
    const stack = `<ol class="rf-stack" aria-label="What is added up">${LAYERS.map(([k, t, s], i) => `<li><i class="rf-sw ly-${k}"></i><strong>${i ? '+ ' : ''}${esc(t)}</strong><small>${esc(s)}</small></li>`).join('')}<li class="rf-eq"><strong>= Build-out</strong><small>compared with the facility’s capacity: <span class="t-room">Room</span> under 90% · <span class="t-tight">Tight</span> 90–100% · <span class="t-over">Over</span> 100% or more</small></li></ol>`;
    return sec('stack', 'What is added up', `${stack}${bar}<p class="small muted">The first three together are <strong>committed</strong>: what the facility must already carry. The <strong>uncommitted reserve</strong> (D-5-1) is capacity less committed: what is still free for new approvals.</p>`)
      + sec('tests', 'What is compared, at each facility', tableHTML(['Facility', 'Flow compared', 'Against', 'Its limit'], TESTS.map(r => r.map(esc)), 'What is compared, at each facility'))
      + sec('modes', 'Two ways to count today’s flow', `<ul class="rf-ul"><li><strong>Capacity check (2025 flows).</strong> The default for plants: the model’s flow today is scaled to match each plant’s measured 2025 flow (the calibration factor), so jobs, rain and other flows the model does not hold are counted.</li><li><strong>Design flows.</strong> Everything at Peel’s design criteria, as a servicing report would. Set in the Scenario control.</li></ul>`)
      + sec('limit', 'The limit year', '<p>Each facility’s <strong>limit year</strong> is when its flow, growing with the developments’ expected timing, reaches its limit. A capital project that adds capacity after that year screens as <strong>late</strong> (DC projects).</p>');
  }
  function capacity(row) {
    return wrap('capacity', {
      answer: 'At each plant, pumping station and storage facility, the app adds up what is <strong>on the system</strong>, what has been <strong>built since 2021</strong>, what is <strong>approved but not built</strong> (committed) and what is <strong>in review</strong>, then compares the total with the facility’s <strong>capacity</strong>, the way the 2020 Master Plan tests it.',
      mid: capacityHTML(row),
      method: `Committed follows MECP Procedure D-5-1. The tests are the 2020 Water and Wastewater Master Plan’s (Vol. 3 and 4). Sewer pipes are not compared here: pipe-by-pipe results are left to the Region’s model. ${NOTE_TAIL}`,
      sources: 'MECP Procedure D-5-1; Region of Peel, 2020 Water and Wastewater Master Plan for the Lake-Based Systems, Vol. 3 (water) and Vol. 4 (wastewater); Region of Peel 2025 plant annual reports.',
      actions: [{ label: 'Servicing capacity', attrs: { 'data-ws-page': 'tight' }, primary: true }, { label: 'DC projects', attrs: { 'data-ws-page': 'projects' } }],
    });
  }

  // ---- 6 · What an FSR should cover ----------------------------------------------------------------
  // [section, what the report gives, what to look for]
  const FSR_PARTS = [
    ['The site and proposal', 'Location, area, the plan and its phases; the land use and unit count by type; floor area for jobs.', 'The units match the application, and the phases match the draft plan.'],
    ['Population and jobs', 'People at Peel persons per unit; jobs from the floor area.', 'Peel’s rates (4.2 / 3.4 / 3.1, or 2.7 above 475 people per hectare), not another municipality’s.'],
    ['Water demand', 'Average day, maximum day and peak hour; fire flow (Fire Underwriters Survey); the pressure zone and connection points; a hydrant flow test.', '270 L per person per day, × 1.8 and × 3.0; the zone is the one the site’s elevation needs.'],
    ['Water servicing', 'The proposed watermains, looping and pressures at maximum day plus fire flow and at peak hour.', 'Pressures within the Region’s range; two feeds for a large site.'],
    ['Sanitary flows', 'Average dry weather, the peaking factor, I&amp;I and the design (peak wet) flow.', '290 L per person per day; Harmon, limited to 2.0–4.0; 0.26 L/s per hectare of gross area.'],
    ['Sanitary servicing', 'The outlet, the sewers proposed and the downstream sewers, pumping stations and plant.', 'The outlet is in the right wastewater block; downstream capacity is shown, not assumed.'],
    ['Phasing and works needed', 'What each phase needs; any Region capital works it depends on, and their timing.', 'Works in the DC program, and whether they arrive in time.'],
  ];
  function fsrguide(coverage) {
    const WD = { app: ['room', 'Compared here'], part: ['tight', 'Facilities only'], eye: ['over', 'By an engineer'] };
    const cov = (coverage || []).map(([t, k, d]) => [esc(t), `<span class="t-${WD[k][0]}">${WD[k][1]}</span>`, `<span class="muted">${esc(d)}</span>`]);
    return wrap('fsrguide', {
      answer: 'A <strong>functional servicing report</strong> shows how a development will get water and send its sewage, and that the systems it connects to can take it. The Region reviews it with the application. The app can check the <strong>demands and flows</strong> and the <strong>facilities</strong> downstream; the local pipes, fire flow and pressures need an engineer’s review.',
      mid: sec('parts', 'What the report covers', tableHTML(['Section', 'What it gives', 'What to look for'], FSR_PARTS.map(([a, b, c]) => [esc(a), b, `<span class="muted">${c}</span>`]), 'What a functional servicing report covers'))
        + (cov.length ? sec('check', 'What the app can check', tableHTML(['Item', 'Here', 'How'], cov, 'What the app can check')) : '')
        + sec('errs', 'Common differences with the app’s figures', `<ul class="rf-ul"><li><strong>Persons per unit</strong> from another standard, or apartments at the high-density rate on a site that is not that dense (or the reverse).</li><li><strong>Peaking</strong> applied to the average including I&amp;I, or the factor not limited to 2.0–4.0.</li><li><strong>I&amp;I</strong> on the net instead of the gross site area, or left out.</li><li><strong>Jobs</strong> left out of a mixed-use site.</li><li><strong>Downstream capacity</strong> taken from an older study, before nearby approvals.</li></ul>`),
      method: `What the FSR should cover: Region of Peel, Functional Servicing Report Requirements (November 2009), with today’s design criteria (Linear Wastewater Standards R1.0, 2023; Modelling Demand Table v2.0, 2024; Watermain Design Criteria, 2010). Confirm the current requirements with the Region. ${NOTE_TAIL}`,
      sources: 'Region of Peel: Functional Servicing Report Requirements (2009); Linear Wastewater Standards (2023); Water and Wastewater Modelling Demand Table (2024); Public Works Watermain Design Criteria (2010).',
      actions: [{ label: 'Review an FSR', attrs: { 'data-ws-page': 'fsr' }, primary: true }],
    });
  }

  // ---- 7 · How a capital project gets built --------------------------------------------------------
  // [step, what happens, the app's status words]
  const CAP_STEPS = [
    ['Master Plan', 'The Region’s water and wastewater Master Plan (2020, updated about every five years) finds the works growth needs and when.', 'Relief: in the plant and station checks'],
    ['DC Background Study', 'The growth-related works, their costs and timing, funded by development charges under the DC by-law.', 'DC projects: each project’s in-service year'],
    ['Class EA', 'The Municipal Class Environmental Assessment: the problem, the options, consultation and the preferred design.', 'EA: commenced · consultation · complete'],
    ['Design and approvals', 'Detailed design; MECP approval of the works; permits from the cities and conservation authorities; land.', 'Capital: planned'],
    ['Tender and award', 'The contract is tendered and awarded.', 'Capital: tendered · awarded'],
    ['Construction', 'Built in contracts, often in phases.', 'Capital: under construction'],
    ['In service', 'Substantially complete, then complete: the capacity is available.', 'Capital: substantially complete · complete'],
  ];
  // The Class EA schedules (the Municipal Engineers Association’s Municipal Class EA).
  const SCHEDULES = [
    ['A / A+', 'Pre-approved: small or routine works (A+ with public notice before it starts).'],
    ['B', 'Screening: phases 1–2 (problem, options), with notice and a 30-day review.'],
    ['C', 'Full: phases 1–4 (problem, options, design concepts, an Environmental Study Report), with a 30-day review.'],
    ['Master plan', 'Covers several projects at once; each project then follows its own schedule.'],
  ];
  const tally = (list, f) => { const m = {}; for (const x of list || []) { const k = f(x); if (k) m[k] = (m[k] || 0) + 1; } return m; };
  function capital(eas, cap) {
    const sch = tally(eas, e => e.schedule && e.schedule !== 'unknown' ? e.schedule : null), st = tally(eas, e => e.status && e.status !== 'unknown' ? e.status : null);
    const cs = tally(cap, r => r.status && r.status !== 'unknown' ? r.status : null);
    const n = k => num(cs[k] || 0);
    const steps = flowHTML(CAP_STEPS.map(([t, s]) => [t, esc(s)]), 'How a capital project gets built');
    const map = tableHTML(['Step', 'In the app'], CAP_STEPS.map(([t, , a]) => [esc(t), `<span class="muted">${esc(a)}</span>`]), 'The steps and the app’s status words');
    const schRows = SCHEDULES.map(([k, d]) => [esc(k), esc(d), (k === 'A / A+' ? (sch.A || 0) + (sch['A+'] || 0) : sch[k === 'Master plan' ? 'master plan' : k] || 0) ? num(k === 'A / A+' ? (sch.A || 0) + (sch['A+'] || 0) : sch[k === 'Master plan' ? 'master plan' : k]) : '–']);
    return wrap('capital', {
      answer: 'A project starts in the <strong>Master Plan</strong>, is costed and timed in the <strong>DC Background Study</strong>, goes through a <strong>Class Environmental Assessment</strong>, then <strong>design</strong>, <strong>tender</strong> and <strong>construction</strong> until it is <strong>in service</strong>. The app shows each step’s status from the Region’s project and EA listings, and screens whether the capacity arrives before it is needed.',
      figures: eas && eas.length ? [
        { v: num((st.commenced || 0) + (st.consultation || 0)), u: 'EAs', label: 'under way', ctx: 'commenced or in consultation' },
        { v: num(st.complete || 0), u: 'EAs', label: 'complete', ctx: '' },
        cap && cap.length ? { v: n('under construction'), u: 'works', label: 'under construction', ctx: `${n('planned')} planned · ${n('tendered')} tendered (Region capital listing)` } : null,
      ] : [],
      mid: sec('steps', 'From the plan to in service', steps) + sec('app', 'The steps in the app', map)
        + sec('ea', 'The Class EA schedules', tableHTML(['Schedule', 'What it needs', 'EAs here'], schRows, 'The Class EA schedules'))
        + sec('late', 'Late, close, in time', '<p>The <strong>DC projects</strong> page compares each project’s in-service year with the year the capacity it relieves runs out: <span class="t-over">late</span> when it comes after, <span class="t-tight">close</span> within two years, otherwise in time. A screen, not the Region’s schedule.</p>'),
      method: `The steps: Region of Peel 2020 Water and Wastewater Master Plan, the 2020 DC Background Study and by-law, and the Municipal Class EA (Municipal Engineers Association). The counts: the app’s EA and capital project listings (EAs of unknown schedule or status are not counted). ${NOTE_TAIL}`,
      sources: 'Region of Peel: capital projects and construction listings; environmental assessments listing; 2020 Water and Wastewater Master Plan; 2020 Development Charges Background Study. Municipal Engineers Association, Municipal Class Environmental Assessment.',
      actions: [{ label: 'DC projects', attrs: { 'data-ws-page': 'projects' }, primary: true }],
    });
  }

  // ---- 8 · Growth targets and forecasts ------------------------------------------------------------
  const MUNIS = ['Brampton', 'Mississauga', 'Caledon'];
  /** The rows: per municipality, the 2031 housing target and progress, the Region's 2051 allocation and
   *  the app's pipeline (homes planned, not yet built). */
  function targetRows(H, F, pipe) {
    const T = H && H.targets && H.targets.muni || {}, M = F && F.municipalities || {};
    return MUNIS.map(m => {
      const t = T[m] || {}, ys = Object.keys(t.years || {}).sort(), last = ys.length ? t.years[ys[ys.length - 1]] : null, f = M[m] || {};
      return { muni: m, target: t.target || null, since: last ? last.sinceStart : null, sinceYear: ys[ys.length - 1] || null, pct: t.target && last ? last.sinceStart / t.target * 100 : null,
        need2051: f.units2051 && f.units2021 ? f.units2051 - f.units2021 : null, units2051: f.units2051 || null, pop2021: f.pop2021 || null, pop2051: f.pop2051 || null, pipe: pipe ? pipe[m] || 0 : null };
    });
  }
  function barRow(label, v, max, sub, cls) {
    const w = max > 0 ? Math.min(100, v / max * 100) : 0;
    return `<div class="rf-bar" role="row"><span role="cell">${esc(label)}</span><span class="rf-track" role="cell"><i class="${cls || ''}" style="width:${w.toFixed(1)}%"></i></span><b role="cell">${sub}</b></div>`;
  }
  function targets(H, F, pipe) {
    const rows = targetRows(H, F, pipe), mof = H && H.mof && H.mof.peel, mof51 = mof ? mof[2051] : null;
    const reg51 = rows.reduce((t, r) => t + (r.pop2051 || 0), 0), reg21 = rows.reduce((t, r) => t + (r.pop2021 || 0), 0);
    const tgt = rows.filter(r => r.target), year = (rows.find(r => r.sinceYear) || {}).sinceYear;
    const maxT = Math.max(1, ...tgt.map(r => r.target));
    const bars = tgt.length ? `<div class="rf-bars" role="table" aria-label="Homes started since 2022 against the 2031 housing target">${tgt.map(r => barRow(r.muni, r.since || 0, maxT, `${num(r.since)} of ${num(r.target)} <small class="muted">(${Math.round(r.pct)}%)</small>`, 'rf-done') + barRow('', r.target, maxT, '', 'rf-goal')).join('')}</div><p class="small muted">Filled: homes counted toward the target (housing starts plus additional units and beds), 2022 to ${esc(year)}; outlined: the 2031 target.</p>` : '';
    const maxP = Math.max(1, ...rows.map(r => Math.max(r.need2051 || 0, r.pipe || 0)));
    const pipeBars = rows.some(r => r.need2051) ? `<div class="rf-bars" role="table" aria-label="The pipeline against the homes needed to 2051">${rows.map(r => barRow(r.muni, r.pipe || 0, maxP, `${num(r.pipe)} in the pipeline`, 'rf-done') + barRow('', r.need2051 || 0, maxP, `${num(r.need2051)} needed to 2051`, 'rf-goal')).join('')}</div><p class="small muted">Filled: the pipeline, the homes planned on the developments in the app and not yet built, every stage from Pre-application to under construction. Outlined: the homes needed to 2051, the Region’s allocation (2051 less 2021).</p>` : '';
    const outlook = mof51 && reg51 ? `<p>The Region plans for <strong>${num(kRound(reg51))}</strong> people by 2051 (the Growth Plan forecast, from ${num(kRound(reg21))} in 2021). The Ministry of Finance’s 2026 projection has <strong>${num(kRound(mof51))}</strong>, ${Math.round((reg51 - mof51) / reg51 * 100)}% fewer. The forecast is the planning basis for the Master Plan and the DC study; the projection is a check on its timing, not a target.</p>` : '';
    return wrap('targets', {
      answer: `Three numbers plan Peel’s growth: each city’s <strong>housing target to 2031</strong> (the Province), the Region’s <strong>2051 forecast</strong>, allocated by municipality (the planning basis for servicing), and the Ministry of Finance’s <strong>population projection</strong>. The app adds a fourth: the <strong>pipeline</strong>, the homes already on file.`,
      figures: [
        ...tgt.map(r => ({ v: `${Math.round(r.pct)}%`, u: '', label: `${r.muni}: of its 2031 target`, ctx: `${num(r.since)} of ${num(r.target)} homes, 2022–${esc(r.sinceYear)}` })),
        mof51 && reg51 ? { v: num(kRound(reg51)), u: 'people', label: 'Region forecast, 2051', ctx: `Ministry of Finance: ${num(kRound(mof51))}` } : null,
      ],
      mid: sec('targets', 'Housing targets to 2031', bars) + sec('pipe', 'The pipeline against 2051', pipeBars) + sec('outlook', 'Population outlook', outlook)
        + sec('read', 'How to read them', '<ul class="rf-ul"><li>A <strong>target</strong> counts homes started (and some beds); a <strong>forecast</strong> is where the Region plans the people to live; the <strong>pipeline</strong> is applications, many of which take years or change.</li><li>Servicing is planned to the <strong>forecast</strong>; DC projects are timed to it. Growth slower than forecast delays the need, not the works already committed.</li></ul>'),
      method: `Targets and progress: Ontario’s housing supply progress (as of ${esc(H && H.targets ? H.targets.asOf : '–')}). The 2051 allocation: the Region’s Land Needs Assessment update (draft, August 2024). The projection: Ministry of Finance, summer 2026 (reference scenario). The pipeline: the app’s developments, homes planned and not built. ${NOTE_TAIL}`,
      sources: 'Ontario Data Catalogue, Ontario’s housing supply progress; Region of Peel, Land Needs Assessment Report Update, appendices (August 2024, draft); Ontario Ministry of Finance population projections 2025–2051.',
      actions: [{ label: 'Growth in an area', attrs: { 'data-ws-page': 'growth' }, primary: true }],
    });
  }

  // ---- 9 · How the forecast is timed ----------------------------------------------------------------
  // x: { homes (PeelTiming.homesNeeded), F (the 2051 allocation), activity (the Region's completions
  // by municipality and year), times ([{ stage, size, n, median, left5 }] from the time-in-stage
  // curves), fc ({ by2031, by2041, low2031, high2031, after, endYear, perYear: [[year, likely]] }, Peel),
  // oldThisYear (the old method's homes in the first year) }. Every part is optional (Node, loading).
  const STAGE_WORD = { inception: 'Pre-application', review: 'In review', approved: 'Approved, no permit yet', permit: 'Permit issued', construction: 'Under construction' };
  const SIZE_WORD = { S: 'Under 10 units', M: '10–99 units', L: '100+ units' };
  function completionsRecord(activity, from = 2016, to = 2025) {
    const A = activity || {}, rows = [];
    for (let y = from; y <= to; y++) {
      const v = m => { const r = A[m] && A[m][y]; return r && r.completions && (!r.quarters || r.quarters === 4) ? r.completions.all : null; };
      const ms = MUNIS.map(v);
      if (ms.every(x => x == null)) continue;
      rows.push({ year: y, munis: ms, peel: ms.reduce((t, x) => t + (x || 0), 0) });
    }
    const avg = rows.length ? rows.reduce((t, r) => t + r.peel, 0) / rows.length : null;
    const best = rows.reduce((b, r) => (!b || r.peel > b.peel ? r : b), null);
    return { rows, avg, best };
  }
  function forecast(x = {}) {
    const homes = x.homes || null, F = x.F || null, fc = x.fc || null;
    const rec = completionsRecord(x.activity);
    const ap = F ? Object.values(F).reduce((t, v) => t + Math.max(0, (v.units2051 || 0) - (v.units2021 || 0)), 0) / 30 : null;
    const steps = flowHTML([
      ['1 · Time in stage', 'How long the site has already waited, against similar sites that waited as long'],
      ['2 · Beyond the history', 'Sites that have waited longer than similar sites ever have: paced by the homes the projected population needs'],
      ['3 · Building out', 'Under construction always finishes; a site of 100+ units finishes about 250 units a year'],
    ], 'The three steps of the forecast');
    const why = `<p>The forecast used to add the <strong>average time</strong> each remaining stage takes to the date the site entered its stage. For most of the pipeline that finish date was already in the past, so it was moved to this year${x.oldThisYear ? `: about <strong>${num(kRound(x.oldThisYear))}</strong> homes in ${esc(fc && fc.perYear && fc.perYear[0] ? fc.perYear[0][0] : 'the first year')}` : ''}, against ${rec.avg ? `about <strong>${num(kRound(rec.avg))}</strong>` : 'a few thousand'} completed in a typical year. The averages were also too short: they come mostly from houses, which finish quickly, and they only count the sites that finished, so the slow ones were missing.</p>`;
    const timesRows = (x.times || []).filter(r => r.n > 0).map(r => [STAGE_WORD[r.stage] || r.stage, SIZE_WORD[r.size] || r.size, num(r.n), r.median == null ? 'more than half not finished yet' : `${num(r.median)} months`, r.left5 == null ? '–' : `${Math.round(r.left5 * 100)}%`]);
    const stage = `<p>Every unbuilt site is compared with the sites of the same <strong>stage</strong> and <strong>size</strong> (under 10, 10–99, 100+ units) that entered that stage since 2016. For a site that has already waited, say, three years in review, only the sites that were <em>still</em> in review after three years count, and the question is how much longer they took. This is a survival table (Kaplan–Meier): sites still waiting today count too, as "not finished yet", so the slow ones are not lost.</p>
      <ul class="rf-ul"><li><strong>Likely</strong>: the time by which half of those similar sites had finished.</li><li><strong>High</strong> (fast): a quarter had finished. <strong>Low</strong> (slow): three quarters.</li><li>The share of sites approved and the share of permits completed (2016–2019 files) still scale each site's units, as before.</li><li>Review uses the pre-application table and construction the permit table where a stage has too few dated entries (fewer than 30).</li></ul>
      ${timesRows.length ? tableHTML(['Stage', 'Size', 'Sites', 'Half finished after', 'Still unfinished after 5 years'], timesRows, 'From entering a stage to the first completion') : ''}`;
    const hy = homes ? [2026, 2027, 2028, 2029, 2031, 2036, 2041, 2051].filter(y => y <= (homes.lastYear || 2051)) : [];
    const homesTable = homes ? tableHTML(['Year', 'Peel', ...MUNIS], hy.map(y => [String(y), num(homes(null, y)), ...MUNIS.map(m => num(homes(m, y)))]), 'Homes the projected population growth needs, by year') : '';
    const beyond = `<p>Some sites have waited longer than most similar sites ever have, so the history cannot say when they will finish. They are timed by <strong>demand</strong> instead: each year they fill up to the homes the Ministry of Finance population projection needs.</p>
      <ul class="rf-ul"><li><strong>Homes needed</strong> = the year's population growth ÷ ${homes ? `<strong>${two(homes.ppu)}</strong>` : 'the'} people per new home in the Region's 2051 allocation. A year in which the population falls needs none.</li>
      <li>Each municipality gets its share of the allocation's new homes${homes && homes.share ? ` (${MUNIS.map(m => `${esc(m)} ${Math.round((homes.share[m] || 0) * 100)}%`).join(', ')})` : ''}.</li>
      <li><strong>Furthest along first</strong>, then the one waiting longest: under construction, permit, approved, review, pre-application.</li>
      <li>Every site in a municipality queues for the same homes whatever the map shows, so a filtered view shows its own sites' part of that one schedule.</li>
      <li>What is still waiting at the end of the forecast is reported, not dropped${fc && fc.after >= 0.5 ? `: about <strong>${num(kRound(fc.after))}</strong> units in Peel after ${esc(fc.endYear)}` : ''}.</li></ul>
      ${homesTable}
      <p class="small muted">The projection has Peel's population falling from 2025 to 2028, so those years need no new homes and sites still in review wait until growth returns. Population and completions do not move together year to year (people share homes when supply is short), which is why the history, not the population, times every site it can.</p>`;
    const build = `<ul class="rf-ul"><li><strong>Under construction always finishes.</strong> A site under construction that has waited longer than the history can time finishes from next year, whatever the population does.</li>
      <li><strong>Large sites in phases.</strong> A site of 100+ units finishes about <strong>250 units a year</strong> from its first completion: a 2,000-unit site takes about eight years.</li>
      <li>Each year's homes are spread a little around the expected year (a year before to two after), so one date does not carry a whole site.</li></ul>`;
    const chart = `<ul class="rf-ul"><li><strong>The line</strong>: homes expected to be built from this year, adding up (likely); <strong>the band</strong>: the low–high range.</li>
      <li><strong>The dashed level line</strong>: the unbuilt pipeline, for comparison. Not all of it is expected: some applications are refused or withdrawn.</li>
      <li><strong>The dotted line</strong>: the homes the projected population needs, adding up.</li>
      <li><strong>The dash-dot line</strong>: the Region's 2051 forecast pace${ap ? ` (about ${num(kRound(ap))} homes a year for Peel)` : ''}. The two reference lines show only for all of Peel or a whole municipality, not for a plan or MTSA.</li></ul>`;
    const recTable = rec.rows.length ? tableHTML(['Year', ...MUNIS, 'Peel'], rec.rows.map(r => [String(r.year), ...r.munis.map(num), num(r.peel)]), 'Homes completed by year (CMHC, as the Region publishes it)') : '';
    const pace = fc && fc.perYear && fc.perYear.length ? fc.perYear.filter(([y]) => y > fc.perYear[0][0] && y <= fc.perYear[0][0] + 10) : [];
    const lo = pace.length ? Math.min(...pace.map(p => p[1])) : null, hi = pace.length ? Math.max(...pace.map(p => p[1])) : null;
    const history = `<p>The completions record is the check: ${rec.avg ? `from ${esc(rec.rows[0].year)} to ${esc(rec.rows[rec.rows.length - 1].year)} Peel completed about <strong>${num(kRound(rec.avg))}</strong> homes a year (the most, ${num(rec.best.peel)}, in ${esc(rec.best.year)})` : 'the homes completed each year'}${lo != null ? `; the forecast's next ten years run at <strong>${num(kRound(lo))}–${num(kRound(hi))}</strong> a year` : ''}.</p>${recTable}`;
    const cmhc = `<p>Two tables count completions, and they once disagreed: the Region's housing activity table (CMHC's survey as Peel publishes it) and CMHC's own portal. The portal's <strong>completions</strong> and <strong>under-construction</strong> tables had been saved under each other's names, so the stored "completions" were the homes under construction (Mississauga 2022: 11,743 instead of 1,161). Read by their own titles, the two now agree in every year but <strong>2018</strong>, where CMHC's zone table is higher (Brampton 3,622 against 2,390); the app uses the Region's table there.</p>`;
    const limits = `<ul class="rf-ul"><li>It times the pipeline as a whole; it is <strong>not a prediction for any one site</strong>.</li>
      <li>"Finished" is a site's <strong>first</strong> completed permit; dated completions are sparse outside Mississauga, so many finishes are read from a permit's status instead.</li>
      <li>Sites not yet applied for are not in it, and the Region's 2051 forecast is a plan, not a measure.</li>
      <li>Plant and pumping trigger years still phase each facility's approved and proposed flow over the calibrated lags (Growth › Forecast says so).</li></ul>`;
    return wrap('forecast', {
      answer: `The forecast times the unbuilt pipeline in three steps: how long each site has <strong>already waited in its stage</strong>, against similar sites that waited as long; for sites that have waited longer than the history can tell, the <strong>homes the projected population needs</strong>; and large sites finishing about <strong>250 units a year</strong>. ${fc ? `For every development in Peel's pipeline that is about <strong>${num(kRound(fc.by2031))}</strong> homes built by 2031 and <strong>${num(kRound(fc.by2041))}</strong> by 2041 (Growth › Forecast shows the developments on the map, so its figures follow the filters).` : ''} A screening estimate of the whole pipeline, not a prediction for any one site.`,
      figures: [
        fc ? { v: num(kRound(fc.by2031)), u: 'homes', label: 'built by 2031, all of Peel’s pipeline (likely)', ctx: `range ${num(kRound(fc.low2031))}–${num(kRound(fc.high2031))}` } : null,
        fc ? { v: num(kRound(fc.by2041)), u: 'homes', label: 'built by 2041, all of Peel’s pipeline (likely)', ctx: fc.after >= 0.5 ? `≈${num(kRound(fc.after))} more after ${esc(fc.endYear)}` : '' } : null,
        rec.avg ? { v: num(kRound(rec.avg)), u: 'a year', label: `completed, ${esc(rec.rows[0].year)}–${esc(rec.rows[rec.rows.length - 1].year)}`, ctx: 'CMHC, as the Region publishes it' } : null,
        homes ? { v: two(homes.ppu), u: 'people', label: 'per new home', ctx: 'the Region’s 2051 allocation' } : null,
      ],
      mid: sec('steps', 'The three steps', steps) + sec('why', 'Why not the average time per stage', why) + sec('stage', 'Step 1 · Time already in the stage', stage)
        + sec('beyond', 'Step 2 · When the history runs out', beyond) + sec('build', 'Step 3 · Building out', build) + sec('chart', 'Reading the forecast chart', chart)
        + sec('record', 'Checked against what was built', history) + sec('cmhc', 'Which completions count', cmhc) + sec('limits', 'What it does not know', limits),
      method: `Time in stage: Kaplan–Meier tables by stage and size from the dated application and permit events since 2016 (to a site's first completion); approval and completion rates from the 2016–2019 files. Beyond the history: the Ministry of Finance projection for Peel (July 1 population) over the people per new home in the Region's 2051 allocation, split by its new homes. Decided with the app's owner on 2026-10-17. ${NOTE_TAIL}`,
      sources: 'The application and permit records on the map (Mississauga, Brampton, Caledon); Ontario Ministry of Finance population projections 2025–2051; Region of Peel, Land Needs Assessment Report Update, appendices (August 2024, draft); Region of Peel housing construction activity (CMHC Starts and Completions Survey); CMHC Housing Market Information Portal.',
      actions: [{ label: 'Growth in an area', attrs: { 'data-ws-page': 'growth' }, primary: true }, { label: 'Growth targets and forecasts', attrs: { 'data-ws-page': 'targets' } }],
    });
  }
  // The guide's figures from the loaded app: the forecast model (js/timing.js) and the record.
  function forecastInputs(s) {
    const T = root.PeelTiming, M = T && T.forecastModel ? T.forecastModel() : null;
    const x = { F: s.reports && s.reports.forecast2051 && s.reports.forecast2051.municipalities, activity: s.housing && s.housing.peel && s.housing.peel.activity && s.housing.peel.activity.muni };
    if (!M) return x;
    x.homes = M.homes;
    x.times = [];
    for (const st of ['inception', 'approved', 'permit']) for (const z of ['S', 'M', 'L']) {
      const c = M.curves[`${st}|${z}`]; if (!c || c.n < T.MIN_CURVE_N) continue;
      x.times.push({ stage: st, size: z, n: c.n, median: T.remainingMonths(c, 0, 0.5), left5: T.survivalAt(c, 60) });
    }
    const all = T.pipelineItems(s.projects || []), fc = T.bandsFromSchedules(all, M.ss);
    const to = (y, b) => fc.years.filter(r => r.year <= y).reduce((t, r) => t + r[b], 0);
    x.fc = { by2031: to(2031, 'likely'), by2041: to(2041, 'likely'), low2031: to(2031, 'low'), high2031: to(2031, 'high'), after: fc.after.likely, endYear: M.ss.endYear, perYear: fc.years.map(r => [r.year, r.likely]) };
    try { x.oldThisYear = T.forecastBands(all, M.cal, {}).years[0].likely; } catch (e) { x.oldThisYear = null; }
    return x;
  }

  // ---- Browser: each page from the loaded state ----------------------------------------------------
  const App = () => root.PeelApp;
  function flowsExample() {
    const D = root.PeelDemand, A = App(); if (!D) return null;
    const crit = (A && A.state.criteria) || D.DEFAULT_CRITERIA;
    const p = A && (A.state.projects || []).find(q => /^0 HERITAGE R/i.test(q.title || '') && /Brampton/i.test(q.municipality || ''));
    const R = A && A.state.reports, P = R && R.wastewater && R.wastewater.plants;
    let e, ha, title = EXAMPLE.title, muni = EXAMPLE.muni, plantK = EXAMPLE.plant, zone = null;
    if (p) {
      e = D.estimate([p], crit); ha = e.area.ha; title = p.title; muni = p.municipality;
      const MM = root.PeelMapMarkers, SD = root.PeelSvcData;
      try { plantK = MM && MM.plantOfDev ? MM.plantOfDev(p) : plantK; } catch (er) { /* the default plant */ }
      try { const z = SD && SD.zoneOf ? SD.zoneOf(p) : null; zone = z && z.z ? z.z.name || null : null; } catch (er) { /* no zone */ }
    } else {
      // (the example's figures, through the same estimate)
      e = D.estimate([{ key: 'example', units: 5146, phase: 'review', types: ['apartment'], description: '', siteAreaHa: EXAMPLE.ha, buildout: null }], crit); ha = EXAMPLE.ha;
    }
    const pl = P && P[plantK] ? { name: (root.PeelSvcData && root.PeelSvcData.PLANT_SHORT[plantK]) || P[plantK].name, rated: P[plantK].ratedMLd } : null;
    return { title, muni, e, crit, ha, plant: pl, zone, live: !!p, key: p ? p.key : null };
  }
  function capRow() {
    const C = root.PeelSvcCapacity; let rows = null;
    try { rows = C && C.collect ? C.collect() : null; } catch (e) { rows = null; }
    return rows ? rows.find(r => r.id === 'plant:Lakeview') || null : null;
  }
  function pipeline() {
    const A = App(), D = root.PeelDemand; if (!A || !D || !(A.state.projects || []).length) return null;
    const out = {};
    for (const p of A.state.projects) { if (p.phase === 'cancelled' || p.phase === 'completed') continue; out[p.municipality] = (out[p.municipality] || 0) + D.unitsFor(p, 'unbuilt'); }
    return out;
  }
  function page(id) {
    const A = App(), s = A ? A.state : {};
    if (id === 'guides') return indexPage();
    if (id === 'roles') return roles();
    if (id === 'approvals') return approvals();
    if (id === 'flows') return flows(flowsExample());
    if (id === 'network') return network(s.reports);
    if (id === 'capacity') return capacity(capRow());
    if (id === 'fsrguide') return fsrguide(root.PeelWsPages ? root.PeelWsPages.COVERAGE : null);
    if (id === 'capital') return capital(s.eas && s.eas.eas, s.capital && s.capital.records);
    if (id === 'targets') return targets(s.housing, s.reports && s.reports.forecast2051, pipeline());
    if (id === 'forecast') return forecast(forecastInputs(s));
    return indexPage();
  }

  const api = { GUIDES, IDS, INDEX, ROLES, TESTS, LAYERS, FSR_PARTS, CAP_STEPS, SCHEDULES, EXAMPLE, navHTML, wrap, indexPage, roles, approvals, flowSteps, flowsHTML, flows, networkFacts, network, capacity, capacityHTML, fsrguide, capital, targetRows, targets, completionsRecord, forecast, page };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelReference = api;
})(typeof window !== 'undefined' ? window : globalThis);
