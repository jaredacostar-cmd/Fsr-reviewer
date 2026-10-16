/* How approvals work (PeelApprovalsGuide): an Ontario development as a tree, laid against the app's
 * five stages — what each step is, which stage it puts the site in, and where the app simplifies.
 * A page in Home's layout (js/ws-pages.js 'approvals'), opened from Home's sidebar (Reference), the
 * sidebar's Stage block, a site's "How the stage was set" and Records › Files.
 *
 * Pure: html() builds the page's middle section from the stage tokens (theme-aware); the rules it
 * describes are the ones js/phases.js and js/demand.js apply (tests/approvals-guide.test.js).
 */
(function (root) {
  'use strict';

  // The stages, as the sidebar and the map name them (js/phases.js labels).
  const STAGES = [
    ['inception', '1 · Pre-application'],
    ['review', '2 · In review'],
    ['approved', '3 · Approved, no permit yet'],
    ['permit', '4 · Permit / under construction'],
    ['completed', '5 · Built'],
  ];
  // ok: the app reads it as Ontario does; part: simplified (a rule to settle); no: not in the app.
  const MARK = { ok: 'read as Ontario does it', part: 'simplified', no: 'not in the app' };
  // The tree, root first: [level, name, code, where it sits, steps], a step = [stage column 1–5,
  // span, mark, title, note].
  const ROWS = [
    [0, 'Pre-consultation', 'PRE-2023-0167', 'under the formal file it overlaps', [
      [1, 1, 'ok', 'Meeting', 'comments released'],
      [2, 4, 'part', 'Optional since 2024 (Bill 185)', 'many files skip it, so Pre-application undercounts what is coming'],
    ]],
    [0, 'Official plan + zoning amendment', 'OZS-2026-0007 · OPA / ZBA', 'the root: the homes are counted here, once; an appeal to the Ontario Land Tribunal shows as a flag', [
      [2, 1, 'ok', 'Filed → under review', 'public meeting, report'],
      [2, 1, 'ok', 'By-law passed', '“In review · zoning approved”: zoning alone does not commit the land'],
      [3, 3, 'no', 'Holding (H) symbol', 'lifted when servicing is available, often after allocation: not read yet'],
    ]],
    [1, 'Draft plan of subdivision', '21T- / OZS · lots and blocks', 'on the zoning’s land', [
      [2, 1, 'ok', 'Filed', ''],
      [3, 1, 'ok', 'Draft approved → committed', 'MECP D-5-1; a later zoning amendment on its land keeps it committed, a newer draft plan replaces it'],
      [3, 1, 'ok', 'Registered', 'conditions met'],
    ]],
    [2, 'Site plan (a block)', 'SPA-2026-0003', 'on a block of the draft plan', [
      [2, 1, 'ok', 'Filed → review', ''],
      [3, 1, 'ok', 'Approved → committed', 'staff-delegated since 2022 (Bill 109)'],
      [4, 2, 'part', '≤ 10 units: no site plan needed', 'since 2022 (Bill 23) zoning goes straight to a permit; the app can leave these at “zoning approved”'],
    ]],
    [2, 'Plan of condominium', 'CDM / 21CDM', 'on the site plan’s building', [
      [2, 1, 'part', 'Draft approved', 'does not move the stage: the building’s approval is its site plan'],
      [3, 2, 'part', 'Registered', 'often after the building is up'],
    ]],
    [2, 'Consent · minor variance · part-lot control', 'Committee of Adjustment (B / A files), part-lot control by-law', 'severances, setbacks, townhouse lots', [
      [2, 4, 'no', 'Not in the tree', 'the open data the app reads does not carry them consistently'],
    ]],
    [3, 'Building permits', '24-408123-P01-00 · Building Code Act', 'in the smallest file boundary holding it', [
      [4, 1, 'ok', 'Issued', ''],
      [4, 1, 'ok', 'Under construction', ''],
      [5, 1, 'ok', 'Occupancy → Built', 'since the 2021 census, or before it'],
    ]],
  ];
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function stepHTML([col, span, mark, title, note]) {
    // (the stage named on the step too: a phone shows the steps as a list under each file)
    const [k, t] = STAGES[col - 1];
    return `<div class="ag-step ag-${mark}" style="grid-column:${col} / span ${span};order:${col}" title="${esc(MARK[mark])}"><i class="ag-st" style="--ph:var(--ph-${k})">${esc(t)}</i><b>${esc(title)}</b>${note ? `<small>${esc(note)}</small>` : ''}</div>`;
  }
  function html() {
    const head = `<div class="ag-hd ag-hd-l">The tree: each file under the file whose land holds it</div>${STAGES.map(([k, t]) => `<div class="ag-hd" style="--ph:var(--ph-${k})">${esc(t)}</div>`).join('')}`;
    const rows = ROWS.map(([lvl, name, code, where, steps]) => {
      // One grid row per step line: the steps in the same row share it when their columns differ.
      const lines = [];
      for (const s of steps) { let L = lines.find(l => !l.some(o => o[0] < s[0] + s[1] && s[0] < o[0] + o[1])); if (!L) lines.push(L = []); L.push(s); }
      return `<div class="ag-row" role="row"><div class="ag-lab ag-l${lvl}" role="rowheader"><span class="ag-nm">${esc(name)}</span><span class="ag-code">${esc(code)}</span><span class="ag-why">${esc(where)}</span></div><div class="ag-steps">${lines.map(l => `<div class="ag-line">${l.map(stepHTML).join('')}</div>`).join('')}</div></div>`;
    }).join('');
    return `<section class="ag" data-psec="approvals">
      <div class="ag-scroll"><div class="ag-grid" role="table" aria-label="An Ontario development as a tree, against the app's stages">${head}${rows}</div></div>
      <p class="ag-key small"><span class="ag-step ag-ok">${MARK.ok}</span><span class="ag-step ag-part">${MARK.part}: a rule to settle</span><span class="ag-step ag-no">${MARK.no}</span></p>
      <div class="ag-notes">
        <div><strong>How the tree is made.</strong> Municipalities rarely publish which file belongs to which, so the app links files by overlapping land and file type, with a confidence on each link. Old files on the same land (a 1980s site plan) are the site’s history: kept apart, not counted. A development’s tree: Records › Files › Open full table.</div>
        <div><strong>What counts as committed.</strong> A draft-approved or registered plan of subdivision, or a site plan approval, through permit and construction (MECP Procedure D-5-1). Zoning or an official plan amendment alone is not committed; it stays In review with “zoning approved”.</div>
        <div><strong>Who approves.</strong> Brampton, Mississauga and Caledon. The Region of Peel has had no planning approvals since July 1, 2024: its part is servicing (allocation, the functional servicing report review, development charges), which is what this app screens.</div>
      </div>
    </section>`;
  }
  // The page (js/ws-pages.js pageHTML): the question, the answer, the diagram.
  function page() {
    return {
      id: 'approvals', eyebrow: 'Reference', name: 'How does a development get approved?',
      answer: 'A proposal starts as a <strong>pre-consultation</strong>, is filed as an <strong>official plan and zoning amendment</strong> (often with a draft plan of subdivision), then gets <strong>draft plan</strong> or <strong>site plan</strong> approval, <strong>building permits</strong> and <strong>occupancy</strong>. Each file sits on the land of the one before it; the app reads them as one tree and gives the site the furthest stage its live files have reached.',
      mid: html(),
      actions: [{ label: 'Open the full map', attrs: { 'data-ws-full': '' }, primary: true }],
    };
  }

  const api = { STAGES, ROWS, MARK, html, page };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelApprovalsGuide = api;
})(typeof window !== 'undefined' ? window : globalThis);
