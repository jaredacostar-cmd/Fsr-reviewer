'use strict';
// The weekly update held for review (data/refresh.json): said under the banner and beside the data date.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const R = require('../js/refresh-status.js');
const src = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const strip = h => h.replace(/<[^>]+>/g, '');

test('the notice: only while an update is held; the date shown; why; a GitHub link only', () => {
  assert.equal(R.noticeHTML(null), '');
  assert.equal(R.noticeHTML({ status: 'ok', checked: '2026-10-26' }), '');
  const st = { status: 'held', checked: '2026-10-26', shown: '2026-10-19', reasons: ['Brampton permits +69% in a week', '2 site checks changed', 'x'], issue: 'https://github.com/o/r/issues/9' };
  const h = R.noticeHTML(st);
  assert.equal(strip(h), 'This week’s data update (Oct 26, 2026) is waiting for review (Brampton permits +69% in a week; 2 site checks changed; …): the app shows data as of Oct 19, 2026. See why');
  assert.match(h, /<a href="https:\/\/github\.com\/o\/r\/issues\/9" target="_blank" rel="noopener">/);
  assert.match(R.noticeHTML(st, '2026-10-12T10:00:00Z'), /as of Oct 12, 2026/, 'the snapshot the app loaded wins');
  assert.doesNotMatch(R.noticeHTML({ ...st, issue: 'javascript:alert(1)' }), /<a /, 'no other links');
  assert.match(R.noticeHTML({ ...st, reasons: ['<b>x</b>'] }), /&lt;b&gt;/, 'escaped');
  assert.ok(R.held(st) && !R.held({ status: 'ok' }) && !R.held(null));
});

test('wired: under the banner, beside the data date, loaded with the snapshot, offline too', () => {
  const html = src('index.html');
  assert.match(html, /<div class="refresh-held" id="refresh-held" role="status" hidden><\/div>/);
  assert.ok(html.indexOf('js/refresh-status.js') > 0 && html.indexOf('js/refresh-status.js') < html.indexOf('js/app.js?'));
  assert.match(src('sw.js'), /'js\/refresh-status\.js'/);
  const app = src('js/app.js');
  assert.match(app, /if \(window\.PeelRefresh\) PeelRefresh\.load\(\)\.then\(st => \{ state\.refresh = st; PeelRefresh\.render\(st, snap\.generatedAt\);/);
  assert.match(app, /window\.PeelRefresh\.held\(state\.refresh\) \? ' \(update held\)' : ''/);
});
