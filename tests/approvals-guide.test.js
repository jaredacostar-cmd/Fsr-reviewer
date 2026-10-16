'use strict';
// How approvals work (js/approvals-guide.js): the Ontario steps as a tree against the app's five
// stages, in the app (a Reference page in Home's layout) and matching the rules the app applies.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const src = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const G = require('../js/approvals-guide.js');
const Ph = require('../js/phases.js');

test('the five stages as the app names them, each step in one of them', () => {
  const labels = G.STAGES.map(s => s[0]);
  assert.deepEqual(labels, ['inception', 'review', 'approved', 'permit', 'completed']);
  for (const [k] of G.STAGES) assert.ok(Ph.PHASE_BY_KEY[k], k);
  for (const [, name, , , steps] of G.ROWS) for (const [col, span, mark] of steps) {
    assert.ok(col >= 1 && col + span - 1 <= 5, `${name}: inside the five columns`);
    assert.ok(G.MARK[mark], `${name}: a known mark`);
  }
  const h = G.html();
  for (const [, t] of G.STAGES) assert.ok(h.includes(t), t);
  assert.match(h, /role="table" aria-label="An Ontario development as a tree, against the app's stages"/);
});

test('it says what the app does: draft approval commits (MECP D-5-1), zoning alone does not, H not read', () => {
  const draft = G.ROWS.find(r => r[1] === 'Draft plan of subdivision')[4];
  assert.ok(draft.some(([col, , mark, title]) => col === 3 && mark === 'ok' && /Draft approved → committed/.test(title)), 'draft approval in Approved, read as Ontario does it');
  const zoning = G.ROWS.find(r => r[1] === 'Official plan + zoning amendment')[4];
  assert.ok(zoning.some(([col, , , title, note]) => col === 2 && /By-law passed/.test(title) && /does not commit/.test(note)));
  assert.ok(zoning.some(([, , mark, title]) => mark === 'no' && /Holding \(H\)/.test(title)));
  assert.match(G.html(), /What counts as committed\.<\/strong> A draft-approved or registered plan of subdivision, or a site plan approval, through permit and construction \(MECP Procedure D-5-1\)/);
  // The app's own rule (js/demand.js) is the one described.
  assert.match(src('js/demand.js'), /Committed follows MECP Procedure D-5-1 \(confirmed\): registered or draft-approved plans of\n {2}\/\/ subdivision, plus site plan approval/);
  // The site's "How the stage was set" says the same (it said draft approvals kept the site in review).
  for (const f of ['js/devtab.js', 'js/fsr.js']) {
    assert.doesNotMatch(src(f), /draft subdivision and condominium approvals keep the site under review/, f);
    assert.match(src(f), /or a <strong>draft plan of subdivision<\/strong> is approved, or the plan registered \(MECP D-5-1: these commit the land\)/, f);
  }
});

test('easy to reach: Home sidebar (Reference), the Stage block, a site’s stage section, Records › Files; a share link', () => {
  const w = src('js/workspaces.js');
  assert.match(w, /const REF = \{ approvals: \{ label: 'How approvals work'/);
  assert.match(w, /<h2 class="home-g">Reference<\/h2><ul>\$\{Object\.keys\(REF\)\.map\(id => item\(id, REF\[id\]\.what\)\)\.join\(''\)\}<\/ul>/);
  assert.match(w, /if \(id !== 'home' && !BY_ID\[id\] && !REF\[id\]\) id = 'home';/);
  assert.match(w, /\/\^p:\/\.test\(w\) && \(BY_ID\[w\.slice\(2\)\] \|\| REF\[w\.slice\(2\)\]\)/, 'a link to the page opens it');
  assert.match(src('index.html'), /<p class="small stage-how"><button type="button" class="btn small link" data-ws-page="approvals">How approvals map to these stages →<\/button><\/p>/);
  assert.match(src('js/devtab.js'), /data-ws-page="approvals">How approvals work →<\/button>/);
  assert.match(src('js/records-tab.js'), /secondary: \[\{ label: 'How approvals work', attrs: \{ 'data-ws-page': 'approvals' \}/);
  assert.match(src('js/ws-pages.js'), /const BUILD = \{ [^}]*approvals \};/);
  assert.match(src('index.html'), /<script src="js\/approvals-guide\.js\?v=__BUILD__"><\/script>\n {2}<script src="js\/ws-pages\.js/);
  assert.match(src('sw.js'), /'js\/approvals-guide\.js',/);
  // The page: Home's layout (question, answer, the diagram), nothing calculated.
  const p = G.page();
  assert.equal(p.id, 'approvals');
  assert.equal(p.name, 'How does a development get approved?');
  assert.match(p.mid, /data-psec="approvals"/);
});
