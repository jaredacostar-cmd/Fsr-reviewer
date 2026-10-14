'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const RI = require('../js/report-issue.js');

const fullRec = () => ({
  uid: 'bra-opa-zba-sub:12345',
  sourceId: 'bra-opa-zba-sub',
  sourceName: 'Brampton – official plan / zoning amendments & subdivisions',
  municipality: 'Brampton',
  kind: 'application',
  ref: 'OZS-2024-0001',
  address: '123 Main St S',
});
const fullMeta = () => ({
  sourceUrl: 'https://services3.arcgis.com/rl7ACuZkiFsmDA2g/arcgis/rest/services/Planning_Land_Use_Development/FeatureServer/9/12345?f=pjson',
  portal: 'City of Brampton Open Data',
  pulledOn: '2026-10-12',
  appVersion: 'a1b2c3d',
  snapshotDate: '2026-10-11',
});
const parsed = url => {
  const u = new URL(url);
  return { u, title: u.searchParams.get('title'), body: u.searchParams.get('body') };
};

test('issueUrl: starts from the single REPO_URL constant', () => {
  assert.equal(RI.REPO_URL, 'https://github.com/jaredacostar-cmd/Fsr-reviewer');
  assert.ok(RI.issueUrl(fullRec(), fullMeta()).startsWith(`${RI.REPO_URL}/issues/new?`));
});

test('issueUrl: body carries every required field', () => {
  const { title, body } = parsed(RI.issueUrl(fullRec(), fullMeta()));
  assert.ok(title.includes('OZS-2024-0001'), 'title names the file');
  assert.ok(body.includes('bra-opa-zba-sub:12345'), 'body has the record id');
  assert.ok(body.includes('OZS-2024-0001'), 'body has the file number');
  assert.ok(body.includes('Brampton'), 'body has the municipality');
  assert.ok(body.includes('123 Main St S'), 'body has the address');
  assert.ok(body.includes('City of Brampton Open Data'), 'body has the portal');
  assert.ok(body.includes('FeatureServer/9/12345?f=pjson'), 'body has the source link');
  assert.ok(body.includes('2026-10-12'), 'body has the pulled-on date');
  assert.ok(body.includes('a1b2c3d'), 'body has the app version');
  assert.ok(body.includes('2026-10-11'), 'body has the snapshot date');
  assert.ok(body.includes('What is wrong?'), 'body prompts for the problem');
  assert.ok(/attach a screenshot/i.test(body), 'body asks for a screenshot');
});

test('issueUrl: special characters round-trip exactly', () => {
  const rec = { uid: 'mis-devapps/6:1', municipality: 'Mississauga', kind: 'permit', ref: 'BP 24-1234 & "phase 2" — café', address: '12 O’Brien St? #4 <unit>' };
  const meta = { portal: 'City of Mississauga Open Data (50% & <all>)', sourceUrl: 'https://x.example/FeatureServer/query?objectIds=1&f=pjson#frag' };
  const { title, body } = parsed(RI.issueUrl(rec, meta));
  assert.equal(title, 'Data issue: Permit BP 24-1234 & "phase 2" — café (Mississauga)');
  for (const s of ['BP 24-1234 & "phase 2" — café', '12 O’Brien St? #4 <unit>', 'City of Mississauga Open Data (50% & <all>)', 'query?objectIds=1&f=pjson#frag']) {
    assert.ok(body.includes(s), `body keeps ${JSON.stringify(s)}`);
  }
});

test('issueUrl: long titles are truncated', () => {
  const rec = { ref: 'A'.repeat(300), municipality: 'B'.repeat(300), kind: 'application' };
  const { title } = parsed(RI.issueUrl(rec, {}));
  assert.ok(title.length <= RI.TITLE_MAX, `title is ${title.length} chars`);
  assert.ok(title.endsWith('…'));
});

test('issueUrl: missing fields never throw and still produce a usable URL', () => {
  for (const r of [{}, { uid: 'x:1' }, null, undefined]) {
    const url = RI.issueUrl(r, {});
    const { title, body } = parsed(url);
    assert.ok(title.length > 0, 'title falls back');
    assert.ok(/attach a screenshot/i.test(body), 'screenshot request survives');
    assert.ok(body.includes('**Record ID:**'), 'identifier rows survive');
  }
  const { body } = parsed(RI.issueUrl({ ref: 'R-1' }, undefined));
  assert.ok(body.includes('R-1'));
  assert.ok(body.includes('unknown'), 'unknown meta falls back to "unknown"');
});

test('reportLinkHTML: anchor opens the issue in a new tab, escaped, with help key', () => {
  const rec = { ...fullRec(), ref: '"><script>alert(1)</script>' };
  const html = RI.reportLinkHTML(rec, fullMeta());
  assert.ok(html.startsWith('<a href="'), 'is an anchor');
  assert.ok(html.includes('target="_blank"'), 'opens in a new tab');
  assert.ok(html.includes('rel="noopener"'), 'no window.opener');
  assert.ok(html.includes('data-info="report-issue"'), 'wired to the help card');
  assert.ok(html.includes('Report data issue'), 'labelled');
  assert.ok(!html.includes('<script>alert'), 'ref is HTML-escaped');
  const href = html.match(/href="([^"]*)"/)[1].replace(/&amp;/g, '&');
  const expected = RI.issueUrl(rec, { sourceUrl: fullMeta().sourceUrl, portal: fullMeta().portal, pulledOn: fullMeta().pulledOn, appVersion: 'dev', snapshotDate: 'unknown' });
  assert.equal(href, expected, 'href is the pre-built issue URL (appMeta defaults under Node)');
});

test('appMeta: Node (no DOM, no PeelApp) returns safe defaults', () => {
  assert.deepEqual(RI.appMeta(), { appVersion: 'dev', snapshotDate: 'unknown' });
});

test('reportLinkHTML: minimal info still renders', () => {
  const html = RI.reportLinkHTML({ uid: 'x:1' }, null);
  assert.ok(html.includes('Report data issue ↗'));
  const href = html.match(/href="([^"]*)"/)[1].replace(/&amp;/g, '&');
  assert.ok(href.startsWith(`${RI.REPO_URL}/issues/new?`));
});
